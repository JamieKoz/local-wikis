import { ChunkStore } from "@/lib/application/ports/ChunkStore";
import { EmbeddingClient } from "@/lib/application/ports/EmbeddingClient";
import { LexicalIndex } from "@/lib/application/ports/LexicalIndex";
import { VectorIndex } from "@/lib/application/ports/VectorIndex";
import { retrieveCandidates } from "@/lib/application/retrieval/retrieveCandidates";
import { RetrievalMode } from "@/lib/domain/retrieval/retrievalMode";

export async function buildRagContext(params: {
  projectId: string;
  question: string;
  retrievalMode: RetrievalMode;
  embeddingClient: EmbeddingClient;
  chunkStore: ChunkStore;
  lexicalIndex: LexicalIndex;
  vectorIndex: VectorIndex;
  rerankerEnabled: boolean;
}) {
  const queryEmbedding = await params.embeddingClient.embedText(params.question);
  const chunks = params.chunkStore.getProjectChunks(params.projectId);
  if (chunks.length === 0) {
    return { topChunks: [], reason: "no_indexed_chunks" as const };
  }

  const topChunks = retrieveCandidates({
    projectId: params.projectId,
    query: params.question,
    queryEmbedding,
    chunks,
    vectorIndex: params.vectorIndex,
    lexicalIndex: params.lexicalIndex,
    rerankerEnabled: params.rerankerEnabled,
    config: {
      mode: params.retrievalMode,
      topK: 8,
    },
  });

  return {
    topChunks,
    reason: topChunks.length === 0 ? ("no_retrieved_chunks" as const) : ("ok" as const),
  };
}
