import { ScoredChunkCandidate } from "@/lib/domain/retrieval/queryTypes";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-./\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

function overlapScore(query: string, chunk: string): number {
  const queryTerms = new Set(tokenize(query));
  if (queryTerms.size === 0) {
    return 0;
  }
  const chunkTerms = tokenize(chunk);
  if (chunkTerms.length === 0) {
    return 0;
  }
  let hits = 0;
  for (const term of chunkTerms) {
    if (queryTerms.has(term)) {
      hits += 1;
    }
  }
  return hits / Math.max(1, queryTerms.size);
}

export function rerankCandidates(
  query: string,
  candidates: ScoredChunkCandidate[],
  finalTopK: number,
): ScoredChunkCandidate[] {
  return candidates
    .map((candidate) => {
      const rerankScore = overlapScore(query, candidate.content);
      return {
        ...candidate,
        rerankScore,
        score: candidate.score * 0.85 + rerankScore * 0.15,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, Math.max(1, finalTopK));
}
