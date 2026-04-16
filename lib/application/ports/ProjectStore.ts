import { Project } from "@/lib/types";

export interface ProjectStore {
  getProject(projectId: string): Project | null;
}
