import { ChatMessage, ChatSession } from "@/lib/types";

export interface ChatStore {
  addMessage(params: {
    projectId: string;
    sessionId?: string;
    role: "user" | "assistant";
    content: string;
    sources?: string[];
  }): void;
  getMessages(projectId: string, sessionId?: string): ChatMessage[];
  createSession(projectId: string, title?: string): ChatSession;
}
