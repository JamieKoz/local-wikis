import crypto from "node:crypto";
import path from "node:path";
import { getProject } from "@/lib/db";
import { scanFolder } from "@/lib/fileScanner";
import { indexDocument } from "@/lib/indexing";

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
  indexedChunks: number;
  currentFile: string;
  currentFileChunkIndex: number;
  currentFileChunkTotal: number;
  startedAt: string;
  completedAt?: string;
  error?: string;
};

const jobs = new Map<string, IndexJob>();

function randomId() {
  return crypto.randomUUID();
}

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

export function createIndexJob(projectId: string, inputFolderPath?: string): IndexJob {
  const project = getProject(projectId);
  if (!project) {
    throw new Error("Project not found");
  }

  const folderPaths = inputFolderPath?.trim()
    ? [path.resolve(inputFolderPath)]
    : project.folderPaths.length > 0
      ? project.folderPaths.map((folderPath) => path.resolve(folderPath))
      : [project.folderPath];
  const folderPath = folderPaths[0];
  const id = randomId();

  const job: IndexJob = {
    id,
    projectId,
    folderPath,
    status: "queued",
    stage: "Queued",
    scannedFiles: 0,
    processedFiles: 0,
    changedFiles: 0,
    skippedFiles: 0,
    indexedChunks: 0,
    currentFile: "",
    currentFileChunkIndex: 0,
    currentFileChunkTotal: 0,
    startedAt: new Date().toISOString(),
  };

  jobs.set(id, job);
  void runIndexJob(id, folderPaths);
  return job;
}

async function runIndexJob(jobId: string, folderPaths: string[]) {
  const current = jobs.get(jobId);
  if (!current) {
    return;
  }

  try {
    updateJob(jobId, { status: "running", stage: "Scanning files..." });
    const allFiles = await Promise.all(folderPaths.map((folderPath) => scanFolder(folderPath)));
    const files = allFiles.flat();
    updateJob(jobId, {
      scannedFiles: files.length,
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
      const displayPath = multipleRoots
        ? `${path.basename(matchedRoot)}/${relativePath}`
        : relativePath;
      updateJob(jobId, {
        currentFile: displayPath,
        currentFileChunkIndex: 0,
        currentFileChunkTotal: 0,
        stage: `Processing ${displayPath}`,
      });

      const result = await indexDocument({
        projectId: current.projectId,
        filePath: file.path,
        content: file.content,
      }, {
        onChunkProgress: ({ chunkIndex, totalChunks }) => {
          updateJob(jobId, {
            stage: `Embedding ${displayPath} (${chunkIndex}/${totalChunks})`,
            currentFile: displayPath,
            currentFileChunkIndex: chunkIndex,
            currentFileChunkTotal: totalChunks,
          });
        },
      });

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
      stage: "Completed",
      processedFiles,
      changedFiles,
      skippedFiles,
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
