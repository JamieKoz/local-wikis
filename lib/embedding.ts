const EMBEDDING_MODEL = "text-embedding-3-small";

type EmbeddingResponse = {
  data: Array<{ embedding: number[] }>;
};

export async function embedText(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }

  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: EMBEDDING_MODEL,
      input: text,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Embedding request failed: ${errorText}`);
  }

  const payload = (await response.json()) as EmbeddingResponse;
  if (!payload.data?.[0]?.embedding) {
    throw new Error("Embedding response missing vector");
  }

  return payload.data[0].embedding;
}
