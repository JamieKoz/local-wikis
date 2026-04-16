import path from "node:path";
import { FileScanner } from "@/lib/application/ports/FileScanner";
import { ProjectStore } from "@/lib/application/ports/ProjectStore";
import { indexDocumentUseCase } from "@/lib/application/indexing/indexDocument";
import { ChunkStore } from "@/lib/application/ports/ChunkStore";
import { DocumentStore } from "@/lib/application/ports/DocumentStore";
import { EmbeddingClient } from "@/lib/application/ports/EmbeddingClient";
import { Hasher } from "@/lib/application/ports/Hasher";

export type IndexJobStatus = "queued" | "running" | "completed" | "failed";

export type IndexJob = {
  id: string;
  projectId: string;
  folderPath: string;
  status: IndexJobStatus;
  stage: string;
  scannedFiles: number;
  processedFiles: number;
  changedFiles: number;
  skippedFiles: number;
  failedFiles: number;
  indexedChunks: number;
  currentFile: string;
  currentFileChunkIndex: number;
  currentFileChunkTotal: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
  warning?: string;
};

const jobs = new Map<string, IndexJob>();

function updateJob(jobId: string, updates: Partial<IndexJob>) {
  const job = jobs.get(jobId);
  if (!job) {
    return;
  }
  jobs.set(jobId, { ...job, ...updates });
}

export function getIndexJob(jobId: string): IndexJob | null {
  return jobs.get(jobId) || null;
}

export function createIndexJob(
  params: {
    projectId: string;
    inputFolderPath?: string;
    randomId: () => string;
  },
  deps: {
    projectStore: ProjectStore;
    fileScanner: FileScanner;
    hasher: Hasher;
    documentStore: DocumentStore;
    chunkStore: ChunkStore;
    embeddingClient: EmbeddingClient;
  },
): IndexJob {
  const project = deps.projectStore.getProject(params.projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const folderPaths = params.inputFolderPath?.trim()
    ? [path.resolve(params.inputFolderPath)]
    : project.folderPaths.length > 0
      ? project.folderPaths.map((folderPath) => path.resolve(folderPath))
      : [project.folderPath];

  const jobId = params.randomId();
  const job: IndexJob = {
    id: jobId,
    projectId: params.projectId,
    folderPath: folderPaths[0],
    status: "queued",
    stage: "Queued",
    scannedFiles: 0,
    processedFiles: 0,
    changedFiles: 0,
    skippedFiles: 0,
    failedFiles: 0,
    indexedChunks: 0,
    currentFile: "",
    currentFileChunkIndex: 0,
    currentFileChunkTotal: 0,
    startedAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);
  void runIndexJob(jobId, folderPaths, deps);
  return job;
}

async function runIndexJob(
  jobId: string,
  folderPaths: string[],
  deps: {
    fileScanner: FileScanner;
    hasher: Hasher;
    documentStore: DocumentStore;
    chunkStore: ChunkStore;
    embeddingClient: EmbeddingClient;
  },
) {
  const current = jobs.get(jobId);
  if (!current) {
    return;
  }

  try {
    updateJob(jobId, { status: "running", stage: "Scanning files..." });
    const allScans = await Promise.all(folderPaths.map((folderPath) => deps.fileScanner.scanFolder(folderPath)));
    const files = allScans.flatMap((scan) => scan.files);
    const scannedFiles = allScans.reduce((sum, scan) => sum + scan.matchedFiles, 0);
    const failedScans = allScans.flatMap((scan) => scan.failedFiles);
    const warning =
      failedScans.length > 0
        ? `Failed to read ${failedScans.length} file(s). Example: ${failedScans[0].path} — ${failedScans[0].reason}`
        : undefined;

    updateJob(jobId, {
      scannedFiles,
      failedFiles: failedScans.length,
      warning,
      stage: "Indexing files...",
    });

    let changedFiles = 0;
    let skippedFiles = 0;
    let indexedChunks = 0;
    let processedFiles = 0;
    const multipleRoots = folderPaths.length > 1;

    for (const file of files) {
      const matchedRoot =
        folderPaths.find((rootPath) => file.path.startsWith(path.resolve(rootPath))) || current.folderPath;
      const relativePath = path.relative(matchedRoot, file.path) || file.path;
      const displayPath = multipleRoots ? `${path.basename(matchedRoot)}/${relativePath}` : relativePath;

      updateJob(jobId, {
        currentFile: displayPath,
        currentFileChunkIndex: 0,
        currentFileChunkTotal: 0,
        stage: `Processing ${displayPath}`,
      });

      const result = await indexDocumentUseCase(
        {
          projectId: current.projectId,
          filePath: file.path,
          content: file.content,
        },
        {
          hasher: deps.hasher,
          documentStore: deps.documentStore,
          chunkStore: deps.chunkStore,
          embeddingClient: deps.embeddingClient,
        },
        {
          onChunkProgress: ({ chunkIndex, totalChunks }) => {
            updateJob(jobId, {
              stage: `Embedding ${displayPath} (${chunkIndex}/${totalChunks})`,
              currentFile: displayPath,
              currentFileChunkIndex: chunkIndex,
              currentFileChunkTotal: totalChunks,
            });
          },
        },
      );

      processedFiles += 1;
      if (result.changed) {
        changedFiles += 1;
        indexedChunks += result.chunks;
      } else {
        skippedFiles += 1;
      }

      updateJob(jobId, {
        stage: "Indexing files...",
        processedFiles,
        changedFiles,
        skippedFiles,
        indexedChunks,
        currentFile: displayPath,
        currentFileChunkIndex: result.changed ? result.chunks : 0,
        currentFileChunkTotal: result.changed ? result.chunks : 0,
      });
    }

    updateJob(jobId, {
      status: "completed",
      stage:
        scannedFiles === 0
          ? "Completed (no supported files found)"
          : failedScans.length > 0
            ? "Completed (with read failures)"
            : "Completed",
      processedFiles,
      changedFiles,
      skippedFiles,
      failedFiles: failedScans.length,
      indexedChunks,
      currentFile: "",
      currentFileChunkIndex: 0,
      currentFileChunkTotal: 0,
      completedAt: new Date().toISOString(),
    });
  } catch (error) {
    updateJob(jobId, {
      status: "failed",
      stage: "Failed",
      error: error instanceof Error ? error.message : "Unknown error",
      completedAt: new Date().toISOString(),
    });
  }
}
