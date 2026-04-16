import { LlmProvider } from "@/lib/types";

export type LlmGenerateInput = {
  question: string;
  contextChunks: string[];
  provider?: LlmProvider;
  model?: string;
  recentConversation?: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
};

export interface LlmClient {
  generateAnswer(input: LlmGenerateInput): Promise<string>;
}
