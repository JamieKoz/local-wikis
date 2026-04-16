import { GroundingCheckResult } from "@/lib/domain/citations/groundingTypes";

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-./\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2);
}

export function checkGrounding(answer: string, contexts: Array<{ id: string; content: string }>): GroundingCheckResult {
  const answerTerms = new Set(tokenize(answer));
  if (answerTerms.size === 0 || contexts.length === 0) {
    return {
      grounded: false,
      confidence: 0,
      supportingChunkIds: [],
      uncoveredClaims: [],
    };
  }

  const coveredTerms = new Set<string>();
  const supportingChunkIds: string[] = [];

  for (const context of contexts) {
    const text = context.content.toLowerCase();
    let supports = false;
    for (const term of answerTerms) {
      if (text.includes(term)) {
        coveredTerms.add(term);
        supports = true;
      }
    }
    if (supports) {
      supportingChunkIds.push(context.id);
    }
  }

  const uncoveredClaims = Array.from(answerTerms).filter((term) => !coveredTerms.has(term));
  const confidence = coveredTerms.size / Math.max(1, answerTerms.size);
  return {
    grounded: confidence >= 0.45,
    confidence,
    supportingChunkIds,
    uncoveredClaims,
  };
}
