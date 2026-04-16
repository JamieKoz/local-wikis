import { ChatStore } from "@/lib/application/ports/ChatStore";
import { ChunkStore } from "@/lib/application/ports/ChunkStore";
import { EmbeddingClient } from "@/lib/application/ports/EmbeddingClient";
import { LlmClient } from "@/lib/application/ports/LlmClient";
import { LexicalIndex } from "@/lib/application/ports/LexicalIndex";
import { VectorIndex } from "@/lib/application/ports/VectorIndex";
import { buildRecentConversation } from "@/lib/application/chat/chatMemoryPolicy";
import { buildRagContext } from "@/lib/application/chat/buildRagContext";
import {
  buildDecisionSynthesisQuestion,
  buildDecisionVerificationQuestion,
  buildMultiHopDecisionContext,
  extractDecisionAssumptions,
  isDecisionAnalysisQuestion,
  resolveDecisionAssumptions,
} from "@/lib/application/chat/multiHopDecision";
import { checkGrounding } from "@/lib/application/citations/checkGrounding";
import { LlmProvider } from "@/lib/types";

export type RunRagTurnInput = {
  projectId: string;
  sessionId?: string;
  message: string;
  provider?: LlmProvider;
  model?: string;
  retrievalMode?: "balanced" | "notes_first" | "evidence_first";
};

export async function runRagTurn(params: {
  input: RunRagTurnInput;
  chatStore: ChatStore;
  chunkStore: ChunkStore;
  embeddingClient: EmbeddingClient;
  llmClient: LlmClient;
  lexicalIndex: LexicalIndex;
  vectorIndex: VectorIndex;
  rerankerEnabled?: boolean;
}) {
  const provider = params.input.provider || "openai";
  const retrievalMode = params.input.retrievalMode || "balanced";
  let sessionId = params.input.sessionId?.trim();
  const message = params.input.message.trim();

  if (!sessionId) {
    const newSession = params.chatStore.createSession(params.input.projectId, message.slice(0, 80));
    sessionId = newSession.id;
  }

  const recentConversation = buildRecentConversation(
    params.chatStore.getMessages(params.input.projectId, sessionId),
  );

  params.chatStore.addMessage({
    projectId: params.input.projectId,
    sessionId,
    role: "user",
    content: message,
  });

  const useDecisionPipeline =
    process.env.RAG_ENABLE_MULTI_HOP_DECISION !== "false" && isDecisionAnalysisQuestion(message);

  const retrieval = useDecisionPipeline
    ? await buildMultiHopDecisionContext({
        projectId: params.input.projectId,
        question: message,
        retrievalMode,
        embeddingClient: params.embeddingClient,
        chunkStore: params.chunkStore,
        lexicalIndex: params.lexicalIndex,
        vectorIndex: params.vectorIndex,
        rerankerEnabled: Boolean(params.rerankerEnabled),
      })
    : await buildRagContext({
        projectId: params.input.projectId,
        question: message,
        retrievalMode,
        embeddingClient: params.embeddingClient,
        chunkStore: params.chunkStore,
        lexicalIndex: params.lexicalIndex,
        vectorIndex: params.vectorIndex,
        rerankerEnabled: Boolean(params.rerankerEnabled),
      });

  if (retrieval.reason === "no_indexed_chunks") {
    const answer = "I don't know";
    params.chatStore.addMessage({
      projectId: params.input.projectId,
      sessionId,
      role: "assistant",
      content: answer,
    });
    return {
      answer,
      sources: [],
      chunksUsed: 0,
      provider,
      model: params.input.model,
      sessionId,
      retrievalMode,
      reason: "no_indexed_chunks" as const,
      grounding: {
        grounded: false,
        confidence: 0,
        supportingChunkIds: [],
        uncoveredClaims: [],
      },
    };
  }

  const llmQuestion =
    useDecisionPipeline && "coverage" in retrieval
      ? buildDecisionSynthesisQuestion({
          originalQuestion: message,
          hopsUsed: retrieval.hopsUsed,
          coverage: retrieval.coverage,
        })
      : message;

  let answer = await params.llmClient.generateAnswer({
    question: llmQuestion,
    contextChunks: retrieval.topChunks.map((chunk) => chunk.content),
    provider,
    model: params.input.model,
    recentConversation,
  });

  let chunksForGrounding = retrieval.topChunks;
  if (useDecisionPipeline && "coverage" in retrieval) {
    const assumptions = extractDecisionAssumptions(answer);
    if (assumptions.length > 0) {
      const resolved = await resolveDecisionAssumptions({
        projectId: params.input.projectId,
        assumptions,
        retrievalMode,
        embeddingClient: params.embeddingClient,
        chunkStore: params.chunkStore,
        lexicalIndex: params.lexicalIndex,
        vectorIndex: params.vectorIndex,
        rerankerEnabled: Boolean(params.rerankerEnabled),
        baseChunks: retrieval.topChunks,
      });

      const verificationQuestion = buildDecisionVerificationQuestion({
        originalQuestion: message,
        initialAnswer: answer,
        hopsUsed: retrieval.hopsUsed + resolved.extraHops,
        coverage: retrieval.coverage,
        assumptions: resolved.assumptionResolutions,
      });

      answer = await params.llmClient.generateAnswer({
        question: verificationQuestion,
        contextChunks: resolved.mergedTopChunks.map((chunk) => chunk.content),
        provider,
        model: params.input.model,
        recentConversation,
      });
      chunksForGrounding = resolved.mergedTopChunks;
    }
  }

  const sourcePaths = Array.from(
    new Set(
      chunksForGrounding
        .map((chunk) => chunk.metadata.filePath)
        .filter((value): value is string => typeof value === "string"),
    ),
  );

  params.chatStore.addMessage({
    projectId: params.input.projectId,
    sessionId,
    role: "assistant",
    content: answer,
    sources: sourcePaths,
  });

  const grounding = checkGrounding(
    answer,
    chunksForGrounding.map((chunk) => ({ id: chunk.id, content: chunk.content })),
  );

  return {
    answer,
    sources: sourcePaths,
    chunksUsed: chunksForGrounding.length,
    provider,
    model: params.input.model,
    sessionId,
    retrievalMode,
    reason: retrieval.reason,
    grounding,
  };
}
