import { VectorHit, VectorIndex } from "@/lib/application/ports/VectorIndex";
import { getRetrievalBoost } from "@/lib/domain/retrieval/scoringPolicy";

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) {
    return 0;
  }

  let dot = 0;
  let magA = 0;
  let magB = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }

  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) {
    return 0;
  }
  return dot / denom;
}

function getChunkFilePath(metadata: Record<string, unknown>): string {
  const value = metadata.filePath;
  return typeof value === "string" ? value : "";
}

export class InMemoryVectorIndex implements VectorIndex {
  search(params: {
    queryEmbedding: number[];
    chunks: Array<{
      id: string;
      metadata: Record<string, unknown>;
      embedding: number[];
    }>;
    topK: number;
    mode: "balanced" | "notes_first" | "evidence_first";
  }): VectorHit[] {
    return params.chunks
      .map((chunk) => ({
        id: chunk.id,
        score:
          cosineSimilarity(params.queryEmbedding, chunk.embedding) +
          getRetrievalBoost(getChunkFilePath(chunk.metadata), params.mode),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, params.topK));
  }
}
