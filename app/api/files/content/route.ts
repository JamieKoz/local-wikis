import { NextResponse } from "next/server";
import { getProject } from "@/lib/db";
import { indexDocument } from "@/lib/indexing";
import {
  isEditableExtension,
  readTextProjectFile,
  resolveProjectFilePath,
  writeTextProjectFile,
} from "@/lib/projectFiles";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const projectId = searchParams.get("projectId")?.trim();
    const filePath = searchParams.get("filePath")?.trim();

    if (!projectId || !filePath) {
      return NextResponse.json(
        { error: "projectId and filePath are required" },
        { status: 400 },
      );
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const absolutePath = resolveProjectFilePath(project.folderPath, filePath);
    const content = readTextProjectFile(project.folderPath, absolutePath);

    return NextResponse.json({
      path: absolutePath,
      editable: isEditableExtension(absolutePath),
      content,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const body = (await request.json()) as {
      projectId?: string;
      filePath?: string;
      content?: string;
    };
    const projectId = body.projectId?.trim();
    const filePath = body.filePath?.trim();
    const content = body.content;

    if (!projectId || !filePath || typeof content !== "string") {
      return NextResponse.json(
        { error: "projectId, filePath, and content are required" },
        { status: 400 },
      );
    }

    const project = getProject(projectId);
    if (!project) {
      return NextResponse.json({ error: "Project not found" }, { status: 404 });
    }

    const absolutePath = writeTextProjectFile(project.folderPath, filePath, content);
    const result = await indexDocument({
      projectId,
      filePath: absolutePath,
      content,
    });

    return NextResponse.json({
      ok: true,
      path: absolutePath,
      reindexed: result.changed,
      chunks: result.chunks,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
