import crypto from "node:crypto";
import {
  DocumentStore,
  UpsertDocumentInput,
  UpsertDocumentResult,
} from "@/lib/application/ports/DocumentStore";
import { getDb } from "@/lib/infrastructure/db/sqliteClient";

type DocumentRow = {
  id: string;
  hash: string;
};

function randomId() {
  return crypto.randomUUID();
}

export class SqliteDocumentRepository implements DocumentStore {
  upsertDocument(params: UpsertDocumentInput): UpsertDocumentResult {
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
}
