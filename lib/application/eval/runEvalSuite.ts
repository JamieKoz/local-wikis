import { EvalCaseResult, summarizeEval } from "@/lib/application/eval/metrics";
import { runRagTurn } from "@/lib/application/chat/runRagTurn";
import { ChatStore } from "@/lib/application/ports/ChatStore";
import { ChunkStore } from "@/lib/application/ports/ChunkStore";
import { EmbeddingClient } from "@/lib/application/ports/EmbeddingClient";
import { LexicalIndex } from "@/lib/application/ports/LexicalIndex";
import { LlmClient } from "@/lib/application/ports/LlmClient";
import { VectorIndex } from "@/lib/application/ports/VectorIndex";

export type EvalCase = {
  query: string;
  expectedContains: string[];
};

export async function runEvalSuite(params: {
  projectId: string;
  cases: EvalCase[];
  chatStore: ChatStore;
  chunkStore: ChunkStore;
  embeddingClient: EmbeddingClient;
  llmClient: LlmClient;
  lexicalIndex: LexicalIndex;
  vectorIndex: VectorIndex;
}) {
  const results: EvalCaseResult[] = [];

  for (const item of params.cases) {
    const started = Date.now();
    const turn = await runRagTurn({
      input: {
        projectId: params.projectId,
        message: item.query,
      },
      chatStore: params.chatStore,
      chunkStore: params.chunkStore,
      embeddingClient: params.embeddingClient,
      llmClient: params.llmClient,
      lexicalIndex: params.lexicalIndex,
      vectorIndex: params.vectorIndex,
      rerankerEnabled: true,
    });
    const answer = turn.answer.toLowerCase();
    const passed = item.expectedContains.every((snippet) => answer.includes(snippet.toLowerCase()));
    results.push({
      query: item.query,
      expectedContains: item.expectedContains,
      answer: turn.answer,
      passed,
      latencyMs: Date.now() - started,
    });
  }

  return {
    summary: summarizeEval(results),
    results,
  };
}
