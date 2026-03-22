import { LlmProvider } from "@/lib/types";

type ChatCompletionResponse = {
  choices?: Array<{
    message?: {
      content?: string;
    };
  }>;
};

type GeminiResponse = {
  candidates?: Array<{
    content?: {
      parts?: Array<{ text?: string }>;
    };
  }>;
};

const DEFAULT_MODELS: Record<LlmProvider, string> = {
  openai: "gpt-5.4-mini",
  gemini: "gemini-1.5-flash",
  perplexity: "sonar",
};

type GenerateAnswerOptions = {
  provider?: LlmProvider;
  model?: string;
};

function buildPrompt(question: string, contextChunks: string[]): string {
  return [
    "You are answering based only on the provided context.",
    'If the answer is not in the context, say "I don\'t know".',
    "",
    "Context:",
    contextChunks.join("\n\n---\n\n"),
    "",
    "Question:",
    question,
  ].join("\n");
}

async function generateWithOpenAI(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI chat request failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  return payload.choices?.[0]?.message?.content?.trim() || "I don't know";
}

async function generateWithPerplexity(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.PERPLEXITY_API_KEY;
  if (!apiKey) {
    throw new Error("PERPLEXITY_API_KEY is not set");
  }

  const response = await fetch("https://api.perplexity.ai/chat/completions", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    throw new Error(`Perplexity chat request failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as ChatCompletionResponse;
  return payload.choices?.[0]?.message?.content?.trim() || "I don't know";
}

async function generateWithGemini(prompt: string, model: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
      }),
    },
  );

  if (!response.ok) {
    throw new Error(`Gemini chat request failed: ${await response.text()}`);
  }

  const payload = (await response.json()) as GeminiResponse;
  const text = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text || "")
    .join("")
    .trim();
  return text || "I don't know";
}

export async function generateAnswer(
  question: string,
  contextChunks: string[],
  options: GenerateAnswerOptions = {},
): Promise<string> {
  const provider = options.provider || "openai";
  const model = options.model?.trim() || DEFAULT_MODELS[provider];
  const prompt = buildPrompt(question, contextChunks);

  if (provider === "gemini") {
    return generateWithGemini(prompt, model);
  }
  if (provider === "perplexity") {
    return generateWithPerplexity(prompt, model);
  }
  return generateWithOpenAI(prompt, model);
}
