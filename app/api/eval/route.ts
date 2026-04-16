import { NextResponse } from "next/server";
import { getDefaultBenchmarkQueries } from "@/lib/application/eval/defaultBenchmark";
import { runEvalSuite } from "@/lib/application/eval/runEvalSuite";
import { getContainer } from "@/lib/composition/container";
import { storeEvalResult } from "@/lib/infrastructure/eval/sqliteEvalStore";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      cases?: Array<{
        query: string;
        expectedContains: string[];
      }>;
    };
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const container = getContainer();
    const cases = body.cases && body.cases.length > 0 ? body.cases : getDefaultBenchmarkQueries();
    const result = await runEvalSuite({
      projectId,
      cases,
      chatStore: container.chatRepo,
      chunkStore: container.chunkRepo,
      embeddingClient: container.embeddingClient,
      llmClient: container.llmClient,
      lexicalIndex: container.lexicalIndex,
      vectorIndex: container.vectorIndex,
    });

    storeEvalResult(projectId, result);
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
