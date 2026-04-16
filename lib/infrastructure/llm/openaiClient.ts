import { LlmClient, LlmGenerateInput } from "@/lib/application/ports/LlmClient";
import { generateAnswer } from "@/lib/llm";

export class OpenAiRagLlmClient implements LlmClient {
  async generateAnswer(input: LlmGenerateInput): Promise<string> {
    return generateAnswer(input.question, input.contextChunks, {
      provider: input.provider,
      model: input.model,
      recentConversation: input.recentConversation,
    });
  }
}
