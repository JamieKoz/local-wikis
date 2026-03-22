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

  const folderPath = inputFolderPath?.trim()
    ? path.resolve(inputFolderPath)
    : project.folderPath;
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
    startedAt: new Date().toISOString(),
  };

  jobs.set(id, job);
  void runIndexJob(id);
  return job;
}

async function runIndexJob(jobId: string) {
  const current = jobs.get(jobId);
  if (!current) {
    return;
  }

  try {
    updateJob(jobId, { status: "running", stage: "Scanning files..." });
    const files = scanFolder(current.folderPath);
    updateJob(jobId, {
      scannedFiles: files.length,
      stage: "Indexing files...",
    });

    let changedFiles = 0;
    let skippedFiles = 0;
    let indexedChunks = 0;
    let processedFiles = 0;

    for (const file of files) {
      const result = await indexDocument({
        projectId: current.projectId,
        filePath: file.path,
        content: file.content,
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
      });
    }

    updateJob(jobId, {
      status: "completed",
      stage: "Completed",
      processedFiles,
      changedFiles,
      skippedFiles,
      indexedChunks,
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
