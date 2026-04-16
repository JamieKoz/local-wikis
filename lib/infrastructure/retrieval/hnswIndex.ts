import { VectorHit, VectorIndex } from "@/lib/application/ports/VectorIndex";
import { InMemoryVectorIndex } from "@/lib/infrastructure/retrieval/inMemoryVectorIndex";

const DEFAULT_THRESHOLD = 2500;

// Local-first ANN adapter placeholder.
// Uses a coarse candidate pre-filter for large corpora, then exact scoring.
export class HnswVectorIndex implements VectorIndex {
  private fallback = new InMemoryVectorIndex();

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
    const threshold = Number(process.env.ANN_SWITCH_THRESHOLD || DEFAULT_THRESHOLD);
    if (params.chunks.length < threshold) {
      return this.fallback.search(params);
    }

    const sampleRate = Math.min(1, Math.max(0.15, threshold / params.chunks.length));
    const sampled = params.chunks.filter((_, index) => {
      if (index % Math.ceil(1 / sampleRate) === 0) {
        return true;
      }
      return Math.random() < sampleRate * 0.1;
    });

    return this.fallback.search({
      ...params,
      chunks: sampled.length > params.topK ? sampled : params.chunks,
      topK: Math.max(params.topK * 3, params.topK),
    }).slice(0, params.topK);
  }
}
