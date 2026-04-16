import { IndexJob } from "@/lib/application/indexing/runIndexJob";
import { createProjectIndexJob, getIndexJob } from "@/lib/composition/ragPipeline";

export type { IndexJobStatus } from "@/lib/application/indexing/runIndexJob";
export type { IndexJob };

export { getIndexJob };

export function createIndexJob(projectId: string, inputFolderPath?: string): IndexJob {
  return createProjectIndexJob(projectId, inputFolderPath);
}
