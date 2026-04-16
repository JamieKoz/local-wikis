import { indexDocumentUseCase } from "@/lib/application/indexing/indexDocument";
import { getContainer } from "@/lib/composition/container";

type IndexDocumentProgress = {
  chunkIndex: number;
  totalChunks: number;
};

type IndexDocumentOptions = {
  onChunkProgress?: (progress: IndexDocumentProgress) => void;
};

export async function indexDocument(params: {
  projectId: string;
  filePath: string;
  content: string;
}, options: IndexDocumentOptions = {}) {
  const container = getContainer();
  return indexDocumentUseCase(
    params,
    {
      hasher: container.hasher,
      documentStore: container.documentRepo,
      chunkStore: container.chunkRepo,
      embeddingClient: container.embeddingClient,
    },
    options,
  );
}
