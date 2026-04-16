export type LexicalHit = {
  id: string;
  score: number;
};

export interface LexicalIndex {
  search(projectId: string, query: string, limit: number): LexicalHit[];
}
