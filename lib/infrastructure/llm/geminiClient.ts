import { LlmClient, LlmGenerateInput } from "@/lib/application/ports/LlmClient";
import { generateAnswer } from "@/lib/llm";

export class GeminiRagLlmClient implements LlmClient {
  async generateAnswer(input: LlmGenerateInput): Promise<string> {
    return generateAnswer(input.question, input.contextChunks, {
      provider: input.provider || "gemini",
      model: input.model,
      recentConversation: input.recentConversation,
    });
  }
}
