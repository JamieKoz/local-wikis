import { chunkText } from "@/lib/chunk";
import { replaceDocumentChunks, upsertDocument } from "@/lib/db";
import { embedText } from "@/lib/embedding";
import { hashContent } from "@/lib/hash";

export async function indexDocument(params: {
  projectId: string;
  filePath: string;
  content: string;
}) {
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

  for (const chunk of rawChunks) {
    const embedding = await embedText(chunk.content);
    chunksWithEmbeddings.push({
      content: chunk.content,
      embedding,
      metadata: chunk.metadata,
    });
  }

  replaceDocumentChunks(document.documentId, chunksWithEmbeddings);
  return { changed: true, chunks: chunksWithEmbeddings.length };
}
