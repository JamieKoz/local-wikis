import { RetrievalMode } from "@/lib/domain/retrieval/retrievalMode";

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

export function getRetrievalBoost(filePath: string, mode: RetrievalMode): number {
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
