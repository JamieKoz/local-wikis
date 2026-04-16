import crypto from "node:crypto";
import { ChunkStore, ChunkWriteInput } from "@/lib/application/ports/ChunkStore";
import { ChunkCandidate } from "@/lib/domain/retrieval/queryTypes";
import { getDb } from "@/lib/infrastructure/db/sqliteClient";

type ChunkRow = {
  id: string;
  document_id: string;
  content: string;
  embedding: string;
  metadata: string;
};

function randomId() {
  return crypto.randomUUID();
}

export class SqliteChunkRepository implements ChunkStore {
  getProjectChunks(projectId: string): ChunkCandidate[] {
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

  replaceDocumentChunks(documentId: string, chunks: ChunkWriteInput[]) {
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
}
