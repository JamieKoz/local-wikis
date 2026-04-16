import { ChunkStore } from "@/lib/application/ports/ChunkStore";
import { EmbeddingClient } from "@/lib/application/ports/EmbeddingClient";
import { LexicalIndex } from "@/lib/application/ports/LexicalIndex";
import { VectorIndex } from "@/lib/application/ports/VectorIndex";
import { retrieveCandidates } from "@/lib/application/retrieval/retrieveCandidates";
import { RetrievalMode } from "@/lib/domain/retrieval/retrievalMode";
import { ScoredChunkCandidate } from "@/lib/domain/retrieval/queryTypes";

type CoverageState = {
  costs: boolean;
  financing: boolean;
  revenue: boolean;
  risk: boolean;
  timeline: boolean;
};

export type AssumptionResolution = {
  assumption: string;
  status: "confirmed" | "not_found";
  evidenceSnippet?: string;
};

function emptyCoverage(): CoverageState {
  return {
    costs: false,
    financing: false,
    revenue: false,
    risk: false,
    timeline: false,
  };
}

function isMatch(text: string, terms: string[]) {
  return terms.some((term) => text.includes(term));
}

function assessCoverage(chunks: Array<{ content: string }>): CoverageState {
  const coverage = emptyCoverage();
  for (const chunk of chunks) {
    const text = chunk.content.toLowerCase();
    if (!coverage.costs && isMatch(text, ["price", "cost", "estimate", "allowance", "budget", "$"])) {
      coverage.costs = true;
    }
    if (
      !coverage.financing &&
      isMatch(text, ["loan", "finance", "mortgage", "bank", "interest", "lvr", "repayment"])
    ) {
      coverage.financing = true;
    }
    if (
      !coverage.revenue &&
      isMatch(text, ["resale", "sale", "rent", "income", "value", "capital growth", "yield"])
    ) {
      coverage.revenue = true;
    }
    if (!coverage.risk && isMatch(text, ["risk", "delay", "variation", "contingency", "uncertain"])) {
      coverage.risk = true;
    }
    if (
      !coverage.timeline &&
      isMatch(text, ["timeline", "program", "weeks", "months", "completion", "handover"])
    ) {
      coverage.timeline = true;
    }
  }
  return coverage;
}

function missingAspects(coverage: CoverageState): string[] {
  const missing: string[] = [];
  if (!coverage.costs) missing.push("cost breakdown and pricing assumptions");
  if (!coverage.financing) missing.push("financing and loan constraints");
  if (!coverage.revenue) missing.push("expected value, rent, resale or gain outcomes");
  if (!coverage.risk) missing.push("risk and downside scenarios");
  if (!coverage.timeline) missing.push("delivery timeline and schedule risks");
  return missing;
}

function decomposeDecisionQueries(question: string): string[] {
  const base = question.trim();
  return [
    base,
    `Find all financial values related to this question: ${base}`,
    `Find costs, estimates, allowances, and tender prices related to: ${base}`,
    `Find financing, loan, cashflow, and bank constraints related to: ${base}`,
    `Find risk, sensitivity, and downside factors related to: ${base}`,
    `Find timeline and delivery assumptions related to: ${base}`,
  ];
}

export function isDecisionAnalysisQuestion(question: string): boolean {
  const q = question.toLowerCase();
  return [
    "good idea",
    "worth it",
    "long term",
    "money",
    "financial",
    "profit",
    "gain",
    "viable",
    "feasible",
    "should we",
    "should i",
    "recommend",
  ].some((signal) => q.includes(signal));
}

export async function buildMultiHopDecisionContext(params: {
  projectId: string;
  question: string;
  retrievalMode: RetrievalMode;
  embeddingClient: EmbeddingClient;
  chunkStore: ChunkStore;
  lexicalIndex: LexicalIndex;
  vectorIndex: VectorIndex;
  rerankerEnabled: boolean;
}) {
  const allChunks = params.chunkStore.getProjectChunks(params.projectId);
  if (allChunks.length === 0) {
    return {
      topChunks: [] as ScoredChunkCandidate[],
      reason: "no_indexed_chunks" as const,
      hopsUsed: 0,
      coverage: emptyCoverage(),
    };
  }

  const queue = decomposeDecisionQueries(params.question);
  const asked = new Set<string>();
  const selected = new Map<string, ScoredChunkCandidate>();
  const maxHops = 5;
  let hopsUsed = 0;

  while (queue.length > 0 && hopsUsed < maxHops) {
    const query = queue.shift() || "";
    const normalized = query.trim().toLowerCase();
    if (!normalized || asked.has(normalized)) {
      continue;
    }
    asked.add(normalized);
    hopsUsed += 1;

    const queryEmbedding = await params.embeddingClient.embedText(query);
    const hits = retrieveCandidates({
      projectId: params.projectId,
      query,
      queryEmbedding,
      chunks: allChunks,
      lexicalIndex: params.lexicalIndex,
      vectorIndex: params.vectorIndex,
      rerankerEnabled: params.rerankerEnabled,
      config: {
        mode: params.retrievalMode,
        topK: 10,
        rerankTopN: 30,
      },
    });

    for (const hit of hits) {
      const existing = selected.get(hit.id);
      if (!existing || hit.score > existing.score) {
        selected.set(hit.id, hit);
      }
    }

    const coverage = assessCoverage(Array.from(selected.values()));
    const missing = missingAspects(coverage);
    if (missing.length === 0) {
      break;
    }

    if (hopsUsed < maxHops) {
      for (const gap of missing.slice(0, 2)) {
        const followUp = `For "${params.question}", retrieve evidence about ${gap}.`;
        if (!asked.has(followUp.toLowerCase())) {
          queue.push(followUp);
        }
      }
    }
  }

  const topChunks = Array.from(selected.values()).sort((a, b) => b.score - a.score).slice(0, 18);
  const coverage = assessCoverage(topChunks);

  return {
    topChunks,
    reason: topChunks.length === 0 ? ("no_retrieved_chunks" as const) : ("ok" as const),
    hopsUsed,
    coverage,
  };
}

function normalizeForSearch(text: string): string {
  return text
    .replace(/^[-*]\s*/, "")
    .replace(/^if\s+/i, "")
    .replace(/^provided that\s+/i, "")
    .replace(/^assuming\s+/i, "")
    .trim();
}

export function extractDecisionAssumptions(answer: string): string[] {
  const fragments = answer
    .split(/\n+/)
    .flatMap((line) => line.split(/[.!?]/))
    .map((line) => line.trim())
    .filter(Boolean);

  const candidates = fragments.filter((fragment) =>
    /\b(if|provided that|assuming|subject to)\b/i.test(fragment),
  );

  const deduped = Array.from(new Set(candidates.map((fragment) => normalizeForSearch(fragment))));
  return deduped.filter((fragment) => fragment.length >= 18).slice(0, 4);
}

function termOverlapRatio(assumption: string, content: string): number {
  const terms = assumption
    .toLowerCase()
    .replace(/[^a-z0-9_\-./\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 2)
    .filter((token) => !new Set(["the", "and", "with", "that", "this", "from"]).has(token));

  if (terms.length === 0) {
    return 0;
  }
  const haystack = content.toLowerCase();
  let matches = 0;
  for (const term of terms) {
    if (haystack.includes(term)) {
      matches += 1;
    }
  }
  return matches / terms.length;
}

export async function resolveDecisionAssumptions(params: {
  projectId: string;
  assumptions: string[];
  retrievalMode: RetrievalMode;
  embeddingClient: EmbeddingClient;
  chunkStore: ChunkStore;
  lexicalIndex: LexicalIndex;
  vectorIndex: VectorIndex;
  rerankerEnabled: boolean;
  baseChunks: ScoredChunkCandidate[];
}) {
  if (params.assumptions.length === 0) {
    return {
      assumptionResolutions: [] as AssumptionResolution[],
      mergedTopChunks: params.baseChunks,
      extraHops: 0,
    };
  }

  const allChunks = params.chunkStore.getProjectChunks(params.projectId);
  const merged = new Map(params.baseChunks.map((chunk) => [chunk.id, chunk]));
  const resolutions: AssumptionResolution[] = [];
  let extraHops = 0;

  for (const assumption of params.assumptions) {
    const query = `Find explicit evidence for this project assumption: ${assumption}`;
    const queryEmbedding = await params.embeddingClient.embedText(query);
    const hits = retrieveCandidates({
      projectId: params.projectId,
      query,
      queryEmbedding,
      chunks: allChunks,
      lexicalIndex: params.lexicalIndex,
      vectorIndex: params.vectorIndex,
      rerankerEnabled: params.rerankerEnabled,
      config: {
        mode: params.retrievalMode,
        topK: 8,
        rerankTopN: 24,
      },
    });
    extraHops += 1;

    for (const hit of hits.slice(0, 6)) {
      const existing = merged.get(hit.id);
      if (!existing || hit.score > existing.score) {
        merged.set(hit.id, hit);
      }
    }

    const topEvidence = hits[0];
    const overlap = topEvidence ? termOverlapRatio(assumption, topEvidence.content) : 0;
    if (!topEvidence || overlap < 0.35) {
      resolutions.push({
        assumption,
        status: "not_found",
      });
      continue;
    }

    const snippetStart = Math.max(
      0,
      topEvidence.content.toLowerCase().indexOf(assumption.split(" ").slice(0, 3).join(" ").toLowerCase()),
    );
    const snippet = topEvidence.content
      .slice(snippetStart, Math.min(topEvidence.content.length, snippetStart + 220))
      .replace(/\s+/g, " ")
      .trim();

    resolutions.push({
      assumption,
      status: "confirmed",
      evidenceSnippet: snippet || topEvidence.content.slice(0, 220).replace(/\s+/g, " ").trim(),
    });
  }

  const mergedTopChunks = Array.from(merged.values()).sort((a, b) => b.score - a.score).slice(0, 22);
  return {
    assumptionResolutions: resolutions,
    mergedTopChunks,
    extraHops,
  };
}

export function buildDecisionSynthesisQuestion(input: {
  originalQuestion: string;
  hopsUsed: number;
  coverage: CoverageState;
}) {
  const covered = Object.entries(input.coverage)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(", ");
  const uncovered = Object.entries(input.coverage)
    .filter(([, value]) => !value)
    .map(([key]) => key)
    .join(", ");

  return [
    "You are performing decision analysis over project evidence.",
    "Answer in concise markdown with these sections:",
    "1) Recommendation",
    "2) Financial view (numbers and assumptions)",
    "3) Risks and downside",
    "4) Missing data and how it changes confidence",
    "5) Next actions",
    "",
    `Original question: ${input.originalQuestion}`,
    `Multi-hop retrieval hops used: ${input.hopsUsed}`,
    `Evidence coverage found: ${covered || "none"}`,
    `Coverage still missing: ${uncovered || "none"}`,
    "",
    "Important: if key numbers are missing, do not say a hard yes/no; provide a conditional recommendation.",
  ].join("\n");
}

export function buildDecisionVerificationQuestion(input: {
  originalQuestion: string;
  initialAnswer: string;
  hopsUsed: number;
  coverage: CoverageState;
  assumptions: AssumptionResolution[];
}) {
  const covered = Object.entries(input.coverage)
    .filter(([, value]) => value)
    .map(([key]) => key)
    .join(", ");
  const uncovered = Object.entries(input.coverage)
    .filter(([, value]) => !value)
    .map(([key]) => key)
    .join(", ");
  const assumptionLines =
    input.assumptions.length === 0
      ? "- none"
      : input.assumptions
          .map(
            (item) =>
              `- ${item.assumption} => ${item.status}${item.evidenceSnippet ? ` | evidence: ${item.evidenceSnippet}` : ""}`,
          )
          .join("\n");

  return [
    "You are revising a decision analysis answer after targeted assumption-resolution retrieval.",
    "Produce the final answer in concise markdown with sections:",
    "1) Recommendation",
    "2) Financial view (key numbers and assumptions)",
    "3) Risks and downside",
    "4) Assumption checks (Confirmed / Not found)",
    "5) Missing data and next actions",
    "",
    `Original question: ${input.originalQuestion}`,
    `Initial draft answer: ${input.initialAnswer}`,
    `Total hops used including assumption resolution: ${input.hopsUsed}`,
    `Coverage found: ${covered || "none"}`,
    `Coverage missing: ${uncovered || "none"}`,
    "Assumption resolution results:",
    assumptionLines,
    "",
    "Important: avoid conditional 'if' language when an assumption is confirmed by evidence.",
  ].join("\n");
}
