import { NextResponse } from "next/server";
import { getContainer } from "@/lib/composition/container";
import { runChatTurn } from "@/lib/composition/ragPipeline";
import { LlmProvider, RetrievalMode } from "@/lib/types";

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

    const messages = getContainer().chatRepo.getMessages(projectId, sessionId);
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
    const sessionId = body.sessionId?.trim();
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

    const result = await runChatTurn({
      projectId,
      sessionId,
      message,
      provider,
      model,
      retrievalMode,
    });

    return NextResponse.json({
      answer: result.answer,
      sources: result.sources,
      chunksUsed: result.chunksUsed,
      provider: result.provider,
      model: result.model,
      sessionId: result.sessionId,
      retrievalMode: result.retrievalMode,
      reason: result.reason,
      grounding: result.grounding,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
