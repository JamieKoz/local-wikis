import crypto from "node:crypto";
import { ProjectStore } from "@/lib/application/ports/ProjectStore";
import { getDb } from "@/lib/infrastructure/db/sqliteClient";
import { Project } from "@/lib/types";

type ProjectFolderRow = {
  folder_path: string;
};

function randomId() {
  return crypto.randomUUID();
}

export class SqliteProjectRepository implements ProjectStore {
  listProjects(): Project[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT id, name, folder_path, created_at
        FROM projects
        ORDER BY created_at DESC
        `,
      )
      .all() as Array<{
      id: string;
      name: string;
      folder_path: string;
      created_at: string;
    }>;

    return rows.map((row) => {
      const folderPaths = this.listProjectFolderPaths(row.id);
      return {
        id: row.id,
        name: row.name,
        folderPath: folderPaths[0] || row.folder_path,
        folderPaths,
        createdAt: row.created_at,
      };
    });
  }

  getProject(projectId: string): Project | null {
    const db = getDb();
    const row = db
      .prepare(
        `
        SELECT id, name, folder_path, created_at
        FROM projects
        WHERE id = ?
        `,
      )
      .get(projectId) as { id: string; name: string; folder_path: string; created_at: string } | undefined;

    if (!row) {
      return null;
    }

    const folderPaths = this.listProjectFolderPaths(row.id);
    return {
      id: row.id,
      name: row.name,
      folderPath: folderPaths[0] || row.folder_path,
      folderPaths,
      createdAt: row.created_at,
    };
  }

  createProject(name: string, folderPaths: string[]): Project {
    const db = getDb();
    const id = randomId();
    const dedupedFolderPaths = Array.from(new Set(folderPaths.map((folder) => folder.trim()))).filter(
      Boolean,
    );
    if (dedupedFolderPaths.length === 0) {
      throw new Error("At least one folder path is required");
    }

    db.prepare(
      `
      INSERT INTO projects (id, name, folder_path)
      VALUES (?, ?, ?)
      `,
    ).run(id, name, dedupedFolderPaths[0]);

    const insertFolder = db.prepare(
      `
      INSERT OR IGNORE INTO project_folders (project_id, folder_path)
      VALUES (?, ?)
      `,
    );
    for (const folderPath of dedupedFolderPaths) {
      insertFolder.run(id, folderPath);
    }

    const project = db
      .prepare(
        `
        SELECT id, name, folder_path, created_at
        FROM projects
        WHERE id = ?
        `,
      )
      .get(id) as { id: string; name: string; folder_path: string; created_at: string };

    return {
      id: project.id,
      name: project.name,
      folderPath: dedupedFolderPaths[0],
      folderPaths: dedupedFolderPaths,
      createdAt: project.created_at,
    };
  }

  deleteProject(projectId: string): boolean {
    const db = getDb();
    const project = this.getProject(projectId);
    if (!project) {
      return false;
    }

    const tx = db.transaction(() => {
      db.prepare(
        `
        DELETE FROM chunks
        WHERE document_id IN (
          SELECT id FROM documents WHERE project_id = ?
        )
        `,
      ).run(projectId);
      db.prepare("DELETE FROM documents WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM chat_messages WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM chat_sessions WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM project_folders WHERE project_id = ?").run(projectId);
      db.prepare("DELETE FROM projects WHERE id = ?").run(projectId);
    });

    tx();
    return true;
  }

  listProjectFolderPaths(projectId: string): string[] {
    const db = getDb();
    const rows = db
      .prepare(
        `
        SELECT folder_path
        FROM project_folders
        WHERE project_id = ?
        ORDER BY created_at ASC
        `,
      )
      .all(projectId) as ProjectFolderRow[];
    return rows.map((row) => row.folder_path);
  }

  addProjectFolder(projectId: string, folderPath: string): boolean {
    const db = getDb();
    const project = this.getProject(projectId);
    if (!project) {
      return false;
    }
    db.prepare(
      `
      INSERT OR IGNORE INTO project_folders (project_id, folder_path)
      VALUES (?, ?)
      `,
    ).run(projectId, folderPath);
    return true;
  }

  removeProjectFolder(projectId: string, folderPath: string): boolean {
    const db = getDb();
    const folderPaths = this.listProjectFolderPaths(projectId);
    if (folderPaths.length <= 1) {
      throw new Error("Project must keep at least one folder");
    }

    const removed = db
      .prepare(
        `
        DELETE FROM project_folders
        WHERE project_id = ? AND folder_path = ?
        `,
      )
      .run(projectId, folderPath);

    if (removed.changes === 0) {
      return false;
    }

    const remaining = this.listProjectFolderPaths(projectId);
    if (remaining.length > 0) {
      db.prepare(
        `
        UPDATE projects
        SET folder_path = ?
        WHERE id = ?
        `,
      ).run(remaining[0], projectId);
    }

    return true;
  }
}
