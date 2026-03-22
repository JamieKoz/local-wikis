import { chunkText } from "@/lib/chunk";
import { replaceDocumentChunks, upsertDocument } from "@/lib/db";
import { embedText } from "@/lib/embedding";
import { hashContent } from "@/lib/hash";

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
  const fileHash = hashContent(params.content);
  const document = upsertDocument({
    projectId: params.projectId,
    path: params.filePath,
    content: params.content,
    hash: fileHash,
  });

  if (!document.changed) {
    return { changed: false, chunks: 0 };
  }

  const rawChunks = chunkText(params.content, params.filePath);
  const chunksWithEmbeddings = [];
  const totalChunks = rawChunks.length;

  for (let i = 0; i < rawChunks.length; i += 1) {
    const chunk = rawChunks[i];
    const embedding = await embedText(chunk.content);
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

  replaceDocumentChunks(document.documentId, chunksWithEmbeddings);
  return { changed: true, chunks: chunksWithEmbeddings.length };
}
