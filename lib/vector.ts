import { RetrievalMode } from "@/lib/types";

export type RankedChunk = {
  id: string;
  documentId: string;
  content: string;
  metadata: Record<string, unknown>;
  embedding: number[];
  score: number;
};

export type ChunkWithEmbedding = Omit<RankedChunk, "score">;

const NOTE_FILE_HINTS = new Set([
  "jacana-project-scope.md",
  "evidence-ledger.md",
  "evidence-ledger-rolling-balance.md",
  "communications-index.md",
  "emails-index.md",
  "pdf-content-index.md",
  "image-content-index.md",
  "whatsapp-index.md",
]);

function getFilePath(chunk: ChunkWithEmbedding): string {
  const raw = chunk.metadata.filePath;
  return typeof raw === "string" ? raw : "";
}

function getRetrievalBoost(filePath: string, mode: RetrievalMode): number {
  if (!filePath) {
    return 0;
  }

  const normalizedPath = filePath.replace(/\\/g, "/").toLowerCase();
  const fileName = normalizedPath.split("/").pop() || "";
  const extension = fileName.includes(".")
    ? `.${fileName.split(".").pop() || ""}`.toLowerCase()
    : "";

  const isMarkdown = extension === ".md" || extension === ".markdown" || extension === ".mdx";
  const isNotesFile =
    normalizedPath.includes("/notes/") ||
    NOTE_FILE_HINTS.has(fileName) ||
    fileName.includes("-index.md") ||
    fileName.includes("ledger");
  const isEvidenceLike = new Set([".pdf", ".xlsx", ".csv", ".txt", ".json"]).has(extension);

  if (mode === "notes_first") {
    if (isNotesFile) return 0.11;
    if (isMarkdown) return 0.07;
    if (isEvidenceLike) return -0.01;
    return 0;
  }

  if (mode === "evidence_first") {
    if (isEvidenceLike) return 0.08;
    if (isNotesFile) return -0.02;
    if (isMarkdown) return -0.01;
    return 0;
  }

  if (isNotesFile) return 0.035;
  if (isMarkdown) return 0.02;
  return 0;
}

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
  mode: RetrievalMode = "balanced",
): RankedChunk[] {
  return chunks
    .map((chunk) => ({
      ...chunk,
      score:
        cosineSimilarity(queryEmbedding, chunk.embedding) +
        getRetrievalBoost(getFilePath(chunk), mode),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}
