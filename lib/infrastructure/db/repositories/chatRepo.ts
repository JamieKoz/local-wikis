import crypto from "node:crypto";
import { ChatStore } from "@/lib/application/ports/ChatStore";
import { getDb } from "@/lib/infrastructure/db/sqliteClient";
import { ChatMessage, ChatSession } from "@/lib/types";

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

function randomId() {
  return crypto.randomUUID();
}

export class SqliteChatRepository implements ChatStore {
  addMessage(params: {
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

  getMessages(projectId: string, sessionId?: string): ChatMessage[] {
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
      sessionId: row.session_id || undefined,
      role: row.role,
      content: row.content,
      sources: JSON.parse(row.sources) as string[],
      createdAt: row.created_at,
    }));
  }

  createSession(projectId: string, title?: string): ChatSession {
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

  listSessions(projectId: string): ChatSession[] {
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

  deleteSession(projectId: string, sessionId: string): boolean {
    const db = getDb();
    const existing = db
      .prepare(
        `
        SELECT id
        FROM chat_sessions
        WHERE id = ? AND project_id = ?
        `,
      )
      .get(sessionId, projectId) as { id: string } | undefined;

    if (!existing) {
      return false;
    }

    const tx = db.transaction(() => {
      db.prepare("DELETE FROM chat_messages WHERE session_id = ?").run(sessionId);
      db.prepare("DELETE FROM chat_sessions WHERE id = ?").run(sessionId);
    });
    tx();
    return true;
  }
}
