import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import Database from "better-sqlite3";
import { ChatMessage, ChatSession, Project } from "@/lib/types";

export type StoredChunk = {
  id: string;
  documentId: string;
  content: string;
  embedding: number[];
  metadata: Record<string, unknown>;
};

type DocumentRow = {
  id: string;
  hash: string;
};

type ChunkRow = {
  id: string;
  document_id: string;
  content: string;
  embedding: string;
  metadata: string;
};

type ChatMessageRow = {
  id: string;
  project_id: string;
  session_id: string | null;
  role: "user" | "assistant";
  content: string;
  sources: string;
  created_at: string;
};

type ChatSessionRow = {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  updated_at: string;
};

let dbInstance: Database.Database | null = null;

function dbPath() {
  return path.join(process.cwd(), "data", "data.db");
}

function ensureDbDirectory() {
  const dir = path.dirname(dbPath());
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function initSchema(db: Database.Database) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder_path TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      path TEXT NOT NULL,
      content TEXT NOT NULL,
      hash TEXT NOT NULL,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding TEXT NOT NULL,
      metadata TEXT NOT NULL,
      FOREIGN KEY (document_id) REFERENCES documents(id)
    );

    CREATE UNIQUE INDEX IF NOT EXISTS idx_documents_project_path
      ON documents(project_id, path);

    CREATE TABLE IF NOT EXISTS chat_messages (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('user', 'assistant')),
      content TEXT NOT NULL,
      sources TEXT NOT NULL DEFAULT '[]',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_messages_project_created
      ON chat_messages(project_id, created_at ASC);

    CREATE TABLE IF NOT EXISTS chat_sessions (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (project_id) REFERENCES projects(id)
    );

    CREATE INDEX IF NOT EXISTS idx_chat_sessions_project_updated
      ON chat_sessions(project_id, updated_at DESC);
  `);

  const chatMessagesColumns = db
    .prepare(`PRAGMA table_info(chat_messages)`)
    .all() as Array<{ name: string }>;
  if (!chatMessagesColumns.some((column) => column.name === "session_id")) {
    db.exec(`
      ALTER TABLE chat_messages ADD COLUMN session_id TEXT;
      CREATE INDEX IF NOT EXISTS idx_chat_messages_session_created
        ON chat_messages(session_id, created_at ASC);
    `);
  }
}

function randomId() {
  return crypto.randomUUID();
}

export function getDb() {
  if (!dbInstance) {
    ensureDbDirectory();
    dbInstance = new Database(dbPath());
    initSchema(dbInstance);
  }
  return dbInstance;
}

export function listProjects(): Project[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT id, name, folder_path, created_at
      FROM projects
      ORDER BY created_at DESC
      `,
    )
    .all() as Array<{
    id: string;
    name: string;
    folder_path: string;
    created_at: string;
  }>;

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    folderPath: row.folder_path,
    createdAt: row.created_at,
  }));
}

export function createProject(name: string, folderPath: string): Project {
  const db = getDb();
  const id = randomId();

  db.prepare(
    `
    INSERT INTO projects (id, name, folder_path)
    VALUES (?, ?, ?)
    `,
  ).run(id, name, folderPath);

  const project = db
    .prepare(
      `
      SELECT id, name, folder_path, created_at
      FROM projects
      WHERE id = ?
      `,
    )
    .get(id) as { id: string; name: string; folder_path: string; created_at: string };

  return {
    id: project.id,
    name: project.name,
    folderPath: project.folder_path,
    createdAt: project.created_at,
  };
}

export function getProject(projectId: string): Project | null {
  const db = getDb();
  const row = db
    .prepare(
      `
      SELECT id, name, folder_path, created_at
      FROM projects
      WHERE id = ?
      `,
    )
    .get(projectId) as { id: string; name: string; folder_path: string; created_at: string } | undefined;

  if (!row) {
    return null;
  }

  return {
    id: row.id,
    name: row.name,
    folderPath: row.folder_path,
    createdAt: row.created_at,
  };
}

export function upsertDocument(params: {
  projectId: string;
  path: string;
  content: string;
  hash: string;
}): { documentId: string; changed: boolean } {
  const db = getDb();

  const existing = db
    .prepare(
      `
      SELECT id, hash
      FROM documents
      WHERE project_id = ? AND path = ?
      `,
    )
    .get(params.projectId, params.path) as DocumentRow | undefined;

  if (!existing) {
    const documentId = randomId();
    db.prepare(
      `
      INSERT INTO documents (id, project_id, path, content, hash, updated_at)
      VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `,
    ).run(documentId, params.projectId, params.path, params.content, params.hash);

    return { documentId, changed: true };
  }

  if (existing.hash === params.hash) {
    return { documentId: existing.id, changed: false };
  }

  db.prepare(
    `
    UPDATE documents
    SET content = ?, hash = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ?
    `,
  ).run(params.content, params.hash, existing.id);

  return { documentId: existing.id, changed: true };
}

export function replaceDocumentChunks(
  documentId: string,
  chunks: Array<{ content: string; embedding: number[]; metadata: Record<string, unknown> }>,
) {
  const db = getDb();

  const deleteStmt = db.prepare("DELETE FROM chunks WHERE document_id = ?");
  const insertStmt = db.prepare(`
    INSERT INTO chunks (id, document_id, content, embedding, metadata)
    VALUES (?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    deleteStmt.run(documentId);
    for (const chunk of chunks) {
      insertStmt.run(
        randomId(),
        documentId,
        chunk.content,
        JSON.stringify(chunk.embedding),
        JSON.stringify(chunk.metadata),
      );
    }
  });

  tx();
}

export function getProjectChunks(projectId: string): StoredChunk[] {
  const db = getDb();

  const rows = db
    .prepare(
      `
      SELECT c.id, c.document_id, c.content, c.embedding, c.metadata
      FROM chunks c
      INNER JOIN documents d ON c.document_id = d.id
      WHERE d.project_id = ?
      `,
    )
    .all(projectId) as ChunkRow[];

  return rows.map((row) => ({
    id: row.id,
    documentId: row.document_id,
    content: row.content,
    embedding: JSON.parse(row.embedding) as number[],
    metadata: JSON.parse(row.metadata) as Record<string, unknown>,
  }));
}

export function addChatMessage(params: {
  projectId: string;
  sessionId?: string;
  role: "user" | "assistant";
  content: string;
  sources?: string[];
}) {
  const db = getDb();
  db.prepare(
    `
    INSERT INTO chat_messages (id, project_id, session_id, role, content, sources)
    VALUES (?, ?, ?, ?, ?, ?)
    `,
  ).run(
    randomId(),
    params.projectId,
    params.sessionId ?? null,
    params.role,
    params.content,
    JSON.stringify(params.sources ?? []),
  );

  if (params.sessionId) {
    db.prepare(
      `
      UPDATE chat_sessions
      SET updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
      `,
    ).run(params.sessionId);
  }
}

export function getChatMessages(projectId: string, sessionId?: string): ChatMessage[] {
  const db = getDb();
  const rows = (sessionId
    ? db
        .prepare(
          `
          SELECT id, project_id, session_id, role, content, sources, created_at
          FROM chat_messages
          WHERE project_id = ? AND session_id = ?
          ORDER BY created_at ASC
          `,
        )
        .all(projectId, sessionId)
    : db
        .prepare(
          `
          SELECT id, project_id, session_id, role, content, sources, created_at
          FROM chat_messages
          WHERE project_id = ? AND session_id IS NULL
          ORDER BY created_at ASC
          `,
        )
        .all(projectId)) as ChatMessageRow[];

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    role: row.role,
    content: row.content,
    sources: JSON.parse(row.sources) as string[],
    createdAt: row.created_at,
  }));
}

export function createChatSession(projectId: string, title?: string): ChatSession {
  const db = getDb();
  const id = randomId();
  db.prepare(
    `
    INSERT INTO chat_sessions (id, project_id, title)
    VALUES (?, ?, ?)
    `,
  ).run(id, projectId, title?.trim() || "New chat");

  const row = db
    .prepare(
      `
      SELECT id, project_id, title, created_at, updated_at
      FROM chat_sessions
      WHERE id = ?
      `,
    )
    .get(id) as ChatSessionRow;

  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export function listChatSessions(projectId: string): ChatSession[] {
  const db = getDb();
  const rows = db
    .prepare(
      `
      SELECT id, project_id, title, created_at, updated_at
      FROM chat_sessions
      WHERE project_id = ?
      ORDER BY updated_at DESC
      `,
    )
    .all(projectId) as ChatSessionRow[];

  return rows.map((row) => ({
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }));
}
