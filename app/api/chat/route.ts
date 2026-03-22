import { NextResponse } from "next/server";
import { addChatMessage, createChatSession, getChatMessages, getProjectChunks } from "@/lib/db";
import { embedText } from "@/lib/embedding";
import { generateAnswer } from "@/lib/llm";
import { LlmProvider } from "@/lib/types";
import { rankChunks } from "@/lib/vector";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId")?.trim();
    const sessionId = searchParams.get("sessionId")?.trim() || undefined;

    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const messages = getChatMessages(projectId, sessionId);
    return NextResponse.json({ messages });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      sessionId?: string;
      message?: string;
      provider?: LlmProvider;
      model?: string;
    };
    const projectId = body.projectId?.trim();
    let sessionId = body.sessionId?.trim();
    const message = body.message?.trim();
    const provider = body.provider || "openai";
    const model = body.model?.trim();

    if (!projectId || !message) {
      return NextResponse.json(
        { error: "projectId and message are required" },
        { status: 400 },
      );
    }

    if (!sessionId) {
      const newSession = createChatSession(projectId, message.slice(0, 80));
      sessionId = newSession.id;
    }

    addChatMessage({
      projectId,
      sessionId,
      role: "user",
      content: message,
    });

    const queryEmbedding = await embedText(message);
    const projectChunks = getProjectChunks(projectId);

    if (projectChunks.length === 0) {
      const answer = "I don't know";
      addChatMessage({
        projectId,
        sessionId,
        role: "assistant",
        content: answer,
      });
      return NextResponse.json({
        answer: "I don't know",
        sources: [],
        chunksUsed: 0,
      });
    }

    const topChunks = rankChunks(queryEmbedding, projectChunks, 5);
    const answer = await generateAnswer(
      message,
      topChunks.map((chunk) => chunk.content),
      { provider, model },
    );

    const sourcePaths = Array.from(
      new Set(
        topChunks
          .map((chunk) => chunk.metadata.filePath)
          .filter((value): value is string => typeof value === "string"),
      ),
    );

    addChatMessage({
      projectId,
      sessionId,
      role: "assistant",
      content: answer,
      sources: sourcePaths,
    });

    return NextResponse.json({
      answer,
      sources: sourcePaths,
      chunksUsed: topChunks.length,
      provider,
      model,
      sessionId,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
