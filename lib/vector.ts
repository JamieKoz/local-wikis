export type RankedChunk = {
  id: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  score: number;
};

export type ChunkWithEmbedding = Omit<RankedChunk, "score">;

export function cosineSimilarity(a: number[], b: number[]): number {
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

export function rankChunks(
  queryEmbedding: number[],
  chunks: ChunkWithEmbedding[],
  topK = 5,
): RankedChunk[] {
  return chunks
    .map((chunk) => ({
      ...chunk,
      score: cosineSimilarity(queryEmbedding, chunk.embedding),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
