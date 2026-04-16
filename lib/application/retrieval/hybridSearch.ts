import { LexicalIndex } from "@/lib/application/ports/LexicalIndex";
import { VectorIndex } from "@/lib/application/ports/VectorIndex";
import {
  ChunkCandidate,
  RetrievalConfig,
  ScoredChunkCandidate,
} from "@/lib/domain/retrieval/queryTypes";

export function hybridSearch(params: {
  projectId: string;
  query: string;
  queryEmbedding: number[];
  chunks: ChunkCandidate[];
  vectorIndex: VectorIndex;
  lexicalIndex: LexicalIndex;
  config: RetrievalConfig;
}): ScoredChunkCandidate[] {
  function tokenize(text: string): string[] {
    return text
      .toLowerCase()
      .replace(/[^a-z0-9_\-./\s]/g, " ")
      .split(/\s+/)
      .filter((token) => token.length > 1);
  }

  function getPathScore(query: string, metadata: Record<string, unknown>): number {
    const filePath = typeof metadata.filePath === "string" ? metadata.filePath.toLowerCase() : "";
    if (!filePath) {
      return 0;
    }
    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return 0;
    }
    let matches = 0;
    for (const token of queryTokens) {
      if (filePath.includes(token)) {
        matches += 1;
      }
    }
    return matches / queryTokens.length;
  }

  const idToChunk = new Map(params.chunks.map((chunk) => [chunk.id, chunk]));
  const vectorHits = params.vectorIndex.search({
    queryEmbedding: params.queryEmbedding,
    chunks: params.chunks,
    topK: Math.max(params.config.topK * 6, params.config.topK),
    mode: params.config.mode,
  });
  const lexicalHits = params.lexicalIndex.search(
    params.projectId,
    params.query,
    Math.max(params.config.topK * 6, params.config.topK),
  );

  const merged = new Map<string, ScoredChunkCandidate>();
  for (const hit of vectorHits) {
    const chunk = idToChunk.get(hit.id);
    if (!chunk) {
      continue;
    }
    const pathScore = getPathScore(params.query, chunk.metadata);
    merged.set(hit.id, {
      ...chunk,
      vectorScore: hit.score,
      lexicalScore: 0,
      score: hit.score * params.config.vectorWeight + pathScore * params.config.pathWeight,
    });
  }

  for (const hit of lexicalHits) {
    const chunk = idToChunk.get(hit.id);
    if (!chunk) {
      continue;
    }
    const existing = merged.get(hit.id);
    if (existing) {
      existing.lexicalScore = hit.score;
      existing.score += hit.score * params.config.lexicalWeight;
      continue;
    }
    const pathScore = getPathScore(params.query, chunk.metadata);
    merged.set(hit.id, {
      ...chunk,
      vectorScore: 0,
      lexicalScore: hit.score,
      score: hit.score * params.config.lexicalWeight + pathScore * params.config.pathWeight,
    });
  }

  const pathCandidates = params.chunks
    .map((chunk) => ({
      chunk,
      pathScore: getPathScore(params.query, chunk.metadata),
    }))
    .filter((item) => item.pathScore > 0)
    .sort((a, b) => b.pathScore - a.pathScore)
    .slice(0, Math.max(params.config.topK * 4, params.config.topK));

  for (const item of pathCandidates) {
    const existing = merged.get(item.chunk.id);
    if (existing) {
      existing.score += item.pathScore * params.config.pathWeight;
      continue;
    }
    merged.set(item.chunk.id, {
      ...item.chunk,
      vectorScore: 0,
      lexicalScore: 0,
      score: item.pathScore * params.config.pathWeight,
    });
  }

  return Array.from(merged.values()).sort((a, b) => b.score - a.score);
}
