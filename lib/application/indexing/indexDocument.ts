import { ChunkStore } from "@/lib/application/ports/ChunkStore";
import { DocumentStore } from "@/lib/application/ports/DocumentStore";
import { EmbeddingClient } from "@/lib/application/ports/EmbeddingClient";
import { Hasher } from "@/lib/application/ports/Hasher";
import { chunkByCharacterWindow } from "@/lib/domain/chunking/chunkPolicy";

type IndexDocumentProgress = {
  chunkIndex: number;
  totalChunks: number;
};

type IndexDocumentOptions = {
  onChunkProgress?: (progress: IndexDocumentProgress) => void;
};

export async function indexDocumentUseCase(
  params: {
    projectId: string;
    filePath: string;
    content: string;
  },
  deps: {
    hasher: Hasher;
    documentStore: DocumentStore;
    chunkStore: ChunkStore;
    embeddingClient: EmbeddingClient;
  },
  options: IndexDocumentOptions = {},
) {
  const fileHash = deps.hasher.hashContent(params.content);
  const document = deps.documentStore.upsertDocument({
    projectId: params.projectId,
    path: params.filePath,
    content: params.content,
    hash: fileHash,
  });

  if (!document.changed) {
    return { changed: false, chunks: 0 };
  }

  const rawChunks = chunkByCharacterWindow(params.content, params.filePath);
  const chunksWithEmbeddings = [];
  const totalChunks = rawChunks.length;

  for (let i = 0; i < rawChunks.length; i += 1) {
    const chunk = rawChunks[i];
    const embedding = await deps.embeddingClient.embedText(chunk.content);
    chunksWithEmbeddings.push({
      content: chunk.content,
      embedding,
      metadata: chunk.metadata,
    });
    options.onChunkProgress?.({
      chunkIndex: i + 1,
      totalChunks,
    });
  }

  deps.chunkStore.replaceDocumentChunks(document.documentId, chunksWithEmbeddings);
  return { changed: true, chunks: chunksWithEmbeddings.length };
}
