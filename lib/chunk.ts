export type ChunkMetadata = {
  filePath: string;
  startLine: number;
  endLine: number;
};

export type ChunkResult = {
  content: string;
  metadata: ChunkMetadata;
};

const DEFAULT_CHUNK_SIZE_CHARS = 3200; // ~800 tokens
const DEFAULT_OVERLAP_CHARS = 400; // ~100 tokens

function lineNumberAt(text: string, offset: number): number {
  let lines = 1;
  for (let i = 0; i < Math.min(offset, text.length); i += 1) {
    if (text[i] === "\n") {
      lines += 1;
    }
  }
  return lines;
}

export function chunkText(
  content: string,
  filePath: string,
  chunkSizeChars = DEFAULT_CHUNK_SIZE_CHARS,
  overlapChars = DEFAULT_OVERLAP_CHARS,
): ChunkResult[] {
  const trimmed = content.trim();
  if (!trimmed) {
    return [];
  }

  const chunks: ChunkResult[] = [];
  let start = 0;

  while (start < content.length) {
    const end = Math.min(start + chunkSizeChars, content.length);
    const chunkContent = content.slice(start, end).trim();

    if (chunkContent) {
      chunks.push({
        content: chunkContent,
        metadata: {
          filePath,
          startLine: lineNumberAt(content, start),
          endLine: lineNumberAt(content, end),
        },
      });
    }

    if (end >= content.length) {
      break;
    }

    start = Math.max(end - overlapChars, start + 1);
  }

  return chunks;
}
