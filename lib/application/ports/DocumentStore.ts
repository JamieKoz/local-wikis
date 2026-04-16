export type UpsertDocumentInput = {
  projectId: string;
  path: string;
  content: string;
  hash: string;
};

export type UpsertDocumentResult = {
  documentId: string;
  changed: boolean;
};

export interface DocumentStore {
  upsertDocument(input: UpsertDocumentInput): UpsertDocumentResult;
}
