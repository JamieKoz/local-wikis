import { SqliteChatRepository } from "@/lib/infrastructure/db/repositories/chatRepo";
import { SqliteChunkRepository } from "@/lib/infrastructure/db/repositories/chunkRepo";
import { SqliteDocumentRepository } from "@/lib/infrastructure/db/repositories/documentRepo";
import { SqliteProjectRepository } from "@/lib/infrastructure/db/repositories/projectRepo";
import { OpenAiEmbeddingClient } from "@/lib/infrastructure/embeddings/openaiEmbeddingClient";
import { DiskFileScanner } from "@/lib/infrastructure/indexing/fileScanner";
import { Sha1Hasher } from "@/lib/infrastructure/indexing/hash";
import { OpenAiRagLlmClient } from "@/lib/infrastructure/llm/openaiClient";
import { HnswVectorIndex } from "@/lib/infrastructure/retrieval/hnswIndex";
import { InMemoryVectorIndex } from "@/lib/infrastructure/retrieval/inMemoryVectorIndex";
import { SqliteFtsLexicalIndex } from "@/lib/infrastructure/retrieval/sqliteFtsLexicalIndex";

const projectRepo = new SqliteProjectRepository();
const chatRepo = new SqliteChatRepository();
const chunkRepo = new SqliteChunkRepository();
const documentRepo = new SqliteDocumentRepository();
const embeddingClient = new OpenAiEmbeddingClient();
const llmClient = new OpenAiRagLlmClient();
const lexicalIndex = new SqliteFtsLexicalIndex();
const scanner = new DiskFileScanner();
const hasher = new Sha1Hasher();

function chooseVectorIndex() {
  if (process.env.RAG_VECTOR_INDEX === "hnsw") {
    return new HnswVectorIndex();
  }
  return new InMemoryVectorIndex();
}

export function getContainer() {
  return {
    projectRepo,
    chatRepo,
    chunkRepo,
    documentRepo,
    embeddingClient,
    llmClient,
    lexicalIndex,
    vectorIndex: chooseVectorIndex(),
    scanner,
    hasher,
  };
}
