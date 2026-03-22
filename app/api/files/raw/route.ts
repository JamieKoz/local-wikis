import path from "node:path";
import { NextResponse } from "next/server";
import { getProject } from "@/lib/db";
import { readRawProjectFile, resolveProjectFilePath } from "@/lib/projectFiles";

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

    const roots = project.folderPaths.length ? project.folderPaths : [project.folderPath];
    const absolutePath = resolveProjectFilePath(roots, filePath);
    const ext = path.extname(absolutePath).toLowerCase();

    if (ext !== ".pdf") {
      return NextResponse.json(
        { error: "Raw viewer currently supports .pdf files only" },
        { status: 400 },
      );
    }

    const fileBuffer = readRawProjectFile(roots, filePath);
    const fileBytes = new Uint8Array(fileBuffer);
    return new Response(fileBytes, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${path.basename(absolutePath)}"`,
      },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
