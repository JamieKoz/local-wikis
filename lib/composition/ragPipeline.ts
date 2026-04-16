import crypto from "node:crypto";
import { runRagTurn, RunRagTurnInput } from "@/lib/application/chat/runRagTurn";
import { indexDocumentUseCase } from "@/lib/application/indexing/indexDocument";
import { createIndexJob, getIndexJob } from "@/lib/application/indexing/runIndexJob";
import { getContainer } from "@/lib/composition/container";

export async function runChatTurn(input: RunRagTurnInput) {
  const container = getContainer();
  return runRagTurn({
    input,
    chatStore: container.chatRepo,
    chunkStore: container.chunkRepo,
    embeddingClient: container.embeddingClient,
    llmClient: container.llmClient,
    lexicalIndex: container.lexicalIndex,
    vectorIndex: container.vectorIndex,
    rerankerEnabled: process.env.RAG_ENABLE_RERANKER !== "false",
  });
}

export async function indexSingleDocument(input: {
  projectId: string;
  filePath: string;
  content: string;
}) {
  const container = getContainer();
  return indexDocumentUseCase(
    input,
    {
      hasher: container.hasher,
      documentStore: container.documentRepo,
      chunkStore: container.chunkRepo,
      embeddingClient: container.embeddingClient,
    },
    {},
  );
}

export function createProjectIndexJob(projectId: string, inputFolderPath?: string) {
  const container = getContainer();
  return createIndexJob(
    {
      projectId,
      inputFolderPath,
      randomId: () => crypto.randomUUID(),
    },
    {
      projectStore: container.projectRepo,
      fileScanner: container.scanner,
      hasher: container.hasher,
      documentStore: container.documentRepo,
      chunkStore: container.chunkRepo,
      embeddingClient: container.embeddingClient,
    },
  );
}

export { getIndexJob };
