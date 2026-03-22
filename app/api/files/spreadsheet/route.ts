import { NextResponse } from "next/server";
import { getProject } from "@/lib/db";
import { readSpreadsheetFile } from "@/lib/projectFiles";

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

    const sheets = readSpreadsheetFile(project.folderPath, filePath);
    return NextResponse.json({ sheets });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
