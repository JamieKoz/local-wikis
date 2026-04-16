import { LexicalIndex } from "@/lib/application/ports/LexicalIndex";
import { VectorIndex } from "@/lib/application/ports/VectorIndex";
import { hybridSearch } from "@/lib/application/retrieval/hybridSearch";
import { rerankCandidates } from "@/lib/application/retrieval/rerankCandidates";
import { RetrievalConfig, ScoredChunkCandidate } from "@/lib/domain/retrieval/queryTypes";

export const DEFAULT_RETRIEVAL_CONFIG: RetrievalConfig = {
  topK: 8,
  vectorWeight: 0.8,
  lexicalWeight: 0.2,
  pathWeight: 0.25,
  rerankTopN: 24,
  mode: "balanced",
};

export function retrieveCandidates(params: {
  projectId: string;
  query: string;
  queryEmbedding: number[];
  chunks: Array<{
    id: string;
    documentId: string;
    content: string;
    metadata: Record<string, unknown>;
    embedding: number[];
  }>;
  vectorIndex: VectorIndex;
  lexicalIndex: LexicalIndex;
  config?: Partial<RetrievalConfig>;
  rerankerEnabled?: boolean;
}): ScoredChunkCandidate[] {
  const config: RetrievalConfig = {
    ...DEFAULT_RETRIEVAL_CONFIG,
    ...params.config,
  };

  const merged = hybridSearch({
    projectId: params.projectId,
    query: params.query,
    queryEmbedding: params.queryEmbedding,
    chunks: params.chunks,
    vectorIndex: params.vectorIndex,
    lexicalIndex: params.lexicalIndex,
    config,
  }).slice(0, Math.max(config.rerankTopN, config.topK));

  if (!params.rerankerEnabled) {
    return merged.slice(0, config.topK);
  }
  return rerankCandidates(params.query, merged, config.topK);
}
