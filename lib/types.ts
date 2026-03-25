export type Project = {
  id: string;
  name: string;
  folderPath: string;
  folderPaths: string[];
  createdAt: string;
};

export type LlmProvider = "openai" | "gemini" | "perplexity";
export type RetrievalMode = "balanced" | "notes_first" | "evidence_first";

export type ChatSession = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type ChatMessage = {
  id: string;
  projectId: string;
  sessionId?: string;
  role: "user" | "assistant";
  content: string;
  sources: string[];
  createdAt: string;
};

export type ProjectFile = {
  path: string;
  relativePath: string;
  extension: string;
  editable: boolean;
};
