export type RetrievalMode = "balanced" | "notes_first" | "evidence_first";

export function normalizeRetrievalMode(mode?: string): RetrievalMode {
  if (mode === "notes_first" || mode === "evidence_first" || mode === "balanced") {
    return mode;
  }
  return "balanced";
}
