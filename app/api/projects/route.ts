import path from "node:path";
import { NextResponse } from "next/server";
import {
  addProjectFolder,
  createProject,
  deleteProject,
  listProjects,
  removeProjectFolder,
} from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      name?: string;
      folderPath?: string;
      folderPaths?: string[];
      projectId?: string;
      action?: "add_folder" | "remove_folder";
    };
    if (body.action === "add_folder" || body.action === "remove_folder") {
      const projectId = body.projectId?.trim();
      const folderPath = body.folderPath?.trim();
      if (!projectId || !folderPath) {
        return NextResponse.json(
          { error: "projectId and folderPath are required" },
          { status: 400 },
        );
      }
      const normalizedPath = path.resolve(folderPath);
      if (body.action === "add_folder") {
        const ok = addProjectFolder(projectId, normalizedPath);
        if (!ok) {
          return NextResponse.json({ error: "Project not found" }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
      }
      try {
        const ok = removeProjectFolder(projectId, normalizedPath);
        if (!ok) {
          return NextResponse.json({ error: "Folder not found in project" }, { status: 404 });
        }
        return NextResponse.json({ ok: true });
      } catch (error) {
        const message = error instanceof Error ? error.message : "Unknown error";
        return NextResponse.json({ error: message }, { status: 400 });
      }
    }

    const name = body.name?.trim();
    const rawFolderPaths = body.folderPaths?.length
      ? body.folderPaths
      : body.folderPath
        ? [body.folderPath]
        : [];
    const folderPaths = rawFolderPaths.map((folder) => path.resolve(folder.trim())).filter(Boolean);

    if (!name || folderPaths.length === 0) {
      return NextResponse.json(
        { error: "name and at least one folderPath are required" },
        { status: 400 },
      );
    }

    const project = createProject(name, folderPaths);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { projectId?: string };
    const projectId = body.projectId?.trim();
    if (!projectId) {
      return NextResponse.json({ error: "projectId is required" }, { status: 400 });
    }

    const deleted = deleteProject(projectId);
    if (!deleted) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
