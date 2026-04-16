import { EmbeddingClient } from "@/lib/application/ports/EmbeddingClient";
import { embedText } from "@/lib/embedding";

export class OpenAiEmbeddingClient implements EmbeddingClient {
  async embedText(text: string): Promise<number[]> {
    return embedText(text);
  }
}
