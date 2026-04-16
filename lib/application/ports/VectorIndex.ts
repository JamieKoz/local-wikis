import { ChunkCandidate } from "@/lib/domain/retrieval/queryTypes";
import { RetrievalMode } from "@/lib/domain/retrieval/retrievalMode";

export type VectorHit = {
  id: string;
  score: number;
};

export interface VectorIndex {
  search(params: {
    queryEmbedding: number[];
    chunks: ChunkCandidate[];
    topK: number;
    mode: RetrievalMode;
  }): VectorHit[];
}
