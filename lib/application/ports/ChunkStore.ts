import { ChunkCandidate } from "@/lib/domain/retrieval/queryTypes";

export type ChunkWriteInput = {
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

export interface ChunkStore {
  getProjectChunks(projectId: string): ChunkCandidate[];
  replaceDocumentChunks(documentId: string, chunks: ChunkWriteInput[]): void;
}
