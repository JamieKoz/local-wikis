import { LexicalHit, LexicalIndex } from "@/lib/application/ports/LexicalIndex";
import { getDb } from "@/lib/infrastructure/db/sqliteClient";

type LexicalRow = {
  id: string;
  content: string;
};

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9_\-./\s]/g, " ")
    .split(/\s+/)
    .filter((token) => token.length > 1);
}

export class SqliteFtsLexicalIndex implements LexicalIndex {
  search(projectId: string, query: string, limit: number): LexicalHit[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT c.id, c.content
        FROM chunks c
        INNER JOIN documents d ON c.document_id = d.id
        WHERE d.project_id = ?
        `,
      )
      .all(projectId) as LexicalRow[];

    const queryTokens = tokenize(query);
    if (queryTokens.length === 0) {
      return [];
    }

    return rows
      .map((row) => {
        const content = row.content.toLowerCase();
        let hits = 0;
        for (const token of queryTokens) {
          const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const count = content.match(new RegExp(`\\b${escaped}\\b`, "g"))?.length || 0;
          hits += count;
        }
        return { id: row.id, score: hits / queryTokens.length };
      })
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, Math.max(1, limit));
  }
}
