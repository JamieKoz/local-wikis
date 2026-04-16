export interface EmbeddingClient {
  embedText(text: string): Promise<number[]>;
}
