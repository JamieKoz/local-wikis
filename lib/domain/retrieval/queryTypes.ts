import { RetrievalMode } from "@/lib/domain/retrieval/retrievalMode";

export type ChunkCandidate = {
  id: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
};

export type ScoredChunkCandidate = ChunkCandidate & {
  vectorScore?: number;
  lexicalScore?: number;
  rerankScore?: number;
  score: number;
};

export type RetrievalConfig = {
  topK: number;
  vectorWeight: number;
  lexicalWeight: number;
  pathWeight: number;
  rerankTopN: number;
  mode: RetrievalMode;
};
