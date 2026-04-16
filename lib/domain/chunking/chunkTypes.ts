export type ChunkMetadata = {
  filePath: string;
  startLine: number;
  endLine: number;
};

export type ChunkResult = {
  content: string;
  metadata: ChunkMetadata;
};
