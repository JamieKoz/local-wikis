import { getDb } from "@/lib/infrastructure/db/sqliteClient";
import { SqliteChatRepository } from "@/lib/infrastructure/db/repositories/chatRepo";
import { SqliteChunkRepository } from "@/lib/infrastructure/db/repositories/chunkRepo";
import { SqliteDocumentRepository } from "@/lib/infrastructure/db/repositories/documentRepo";
import { SqliteProjectRepository } from "@/lib/infrastructure/db/repositories/projectRepo";
import { ChatMessage, ChatSession, Project } from "@/lib/types";

const projectRepo = new SqliteProjectRepository();
const documentRepo = new SqliteDocumentRepository();
const chunkRepo = new SqliteChunkRepository();
const chatRepo = new SqliteChatRepository();

export type StoredChunk = {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

export { getDb };

export function listProjects(): Project[] {
  return projectRepo.listProjects();
}

export function deleteProject(projectId: string): boolean {
  return projectRepo.deleteProject(projectId);
}

export function createProject(name: string, folderPaths: string[]): Project {
  return projectRepo.createProject(name, folderPaths);
}

export function getProject(projectId: string): Project | null {
  return projectRepo.getProject(projectId);
}

export function listProjectFolderPaths(projectId: string): string[] {
  return projectRepo.listProjectFolderPaths(projectId);
}

export function addProjectFolder(projectId: string, folderPath: string): boolean {
  return projectRepo.addProjectFolder(projectId, folderPath);
}

export function removeProjectFolder(projectId: string, folderPath: string): boolean {
  return projectRepo.removeProjectFolder(projectId, folderPath);
}

export function upsertDocument(params: {
  projectId: string;
  path: string;
  content: string;
  hash: string;
}): { documentId: string; changed: boolean } {
  return documentRepo.upsertDocument(params);
}

export function replaceDocumentChunks(
  documentId: string,
  chunks: Array<{ content: string; embedding: number[]; metadata: Record<string, unknown> }>,
) {
  return chunkRepo.replaceDocumentChunks(documentId, chunks);
}

export function getProjectChunks(projectId: string): StoredChunk[] {
  return chunkRepo.getProjectChunks(projectId);
}

export function addChatMessage(params: {
  projectId: string;
  sessionId?: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}) {
  chatRepo.addMessage(params);
}

export function getChatMessages(projectId: string, sessionId?: string): ChatMessage[] {
  return chatRepo.getMessages(projectId, sessionId);
}

export function createChatSession(projectId: string, title?: string): ChatSession {
  return chatRepo.createSession(projectId, title);
}

export function listChatSessions(projectId: string): ChatSession[] {
  return chatRepo.listSessions(projectId);
}

export function deleteChatSession(projectId: string, sessionId: string): boolean {
  return chatRepo.deleteSession(projectId, sessionId);
}
