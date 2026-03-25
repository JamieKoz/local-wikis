import { NextResponse } from "next/server";
import { addChatMessage, createChatSession, getChatMessages, getProjectChunks } from "@/lib/db";
import { embedText } from "@/lib/embedding";
import { generateAnswer } from "@/lib/llm";
import { LlmProvider, RetrievalMode } from "@/lib/types";
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
      retrievalMode?: RetrievalMode;
    };
    const projectId = body.projectId?.trim();
    let sessionId = body.sessionId?.trim();
    const message = body.message?.trim();
    const provider = body.provider || "openai";
    const model = body.model?.trim();
    const retrievalMode = body.retrievalMode || "balanced";

    if (!projectId || !message) {
      return NextResponse.json(
        { error: "projectId and message are required" },
        { status: 400 },
      );
    }

    const hasProviderKey =
      provider === "openai"
        ? Boolean(process.env.OPENAI_API_KEY)
        : provider === "gemini"
          ? Boolean(process.env.GEMINI_API_KEY)
          : Boolean(process.env.PERPLEXITY_API_KEY);
    if (!hasProviderKey) {
      const keyName =
        provider === "openai"
          ? "OPENAI_API_KEY"
          : provider === "gemini"
            ? "GEMINI_API_KEY"
            : "PERPLEXITY_API_KEY";
      return NextResponse.json(
        { error: `Missing ${keyName} for provider ${provider}` },
        { status: 400 },
      );
    }
    if (!process.env.OPENAI_API_KEY) {
      return NextResponse.json(
        { error: "Missing OPENAI_API_KEY for embeddings (required for retrieval)." },
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
        reason: "no_indexed_chunks",
      });
    }

    const topChunks = rankChunks(queryEmbedding, projectChunks, 5, retrievalMode);
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
      retrievalMode,
      reason: topChunks.length === 0 ? "no_retrieved_chunks" : "ok",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
