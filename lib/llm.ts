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
  openai: "gpt-5.4-nano",
  gemini: "gemini-1.5-flash",
  perplexity: "sonar",
};

type GenerateAnswerOptions = {
  provider?: LlmProvider;
  model?: string;
};

function isIDontKnow(text: string): boolean {
  const normalized = text.trim().toLowerCase().replace(/[.!?]+$/g, "");
  return normalized === "i don't know" || normalized === "i dont know";
}

function buildPrompt(question: string, contextChunks: string[]): string {
  return [
    "You are answering based only on the provided context.",
    "If relevant facts exist in the context, provide the best direct answer from those facts.",
    'Only say "I don\'t know" when the context truly has no relevant information.',
    "Prefer concise markdown.",
    "You may use light emojis when helpful for readability.",
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
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (content) {
    if (!isIDontKnow(content)) {
      return content;
    }

    // Smaller models can be overly conservative and default to "I don't know".
    // Re-prompt once with explicit extraction guidance when context exists.
    if (prompt.includes("Context:") && prompt.includes("---")) {
      const retryPrompt = [
        "Answer using the context below.",
        "Extract any relevant facts first, then answer directly.",
        'Only if there are zero relevant facts, reply exactly: "I don\'t know".',
        "Use concise markdown and optional light emojis.",
        "",
        prompt,
      ].join("\n");

      const conservativeRetry = await fetch("https://api.openai.com/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: retryPrompt }],
          temperature: 0.1,
        }),
      });

      if (conservativeRetry.ok) {
        const retryPayload = (await conservativeRetry.json()) as ChatCompletionResponse;
        const retryContent = retryPayload.choices?.[0]?.message?.content?.trim();
        if (retryContent && !isIDontKnow(retryContent)) {
          return retryContent;
        }
      }
    }

    return content;
  }

  // Some model/provider combinations can return empty content in this endpoint shape.
  // Retry once on a known-stable OpenAI model before failing loudly.
  if (model !== "gpt-5.4-mini") {
    const retryResponse = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "gpt-5.4-mini",
        messages: [{ role: "user", content: prompt }],
        temperature: 0.1,
      }),
    });

    if (retryResponse.ok) {
      const retryPayload = (await retryResponse.json()) as ChatCompletionResponse;
      const retryContent = retryPayload.choices?.[0]?.message?.content?.trim();
      if (retryContent) {
        return retryContent;
      }
    }
  }

  throw new Error(
    `OpenAI returned an empty response for model "${model}". Try switching model.`,
  );
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
  const content = payload.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new Error(`Perplexity returned an empty response for model "${model}".`);
  }
  return content;
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
  if (!text) {
    throw new Error(`Gemini returned an empty response for model "${model}".`);
  }
  return text;
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
