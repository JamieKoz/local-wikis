import path from "node:path";
import { NextResponse } from "next/server";
import { createProject, listProjects } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const projects = listProjects();
  return NextResponse.json({ projects });
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { name?: string; folderPath?: string };
    const name = body.name?.trim();
    const folderPath = body.folderPath?.trim();

    if (!name || !folderPath) {
      return NextResponse.json(
        { error: "name and folderPath are required" },
        { status: 400 },
      );
    }

    const normalizedPath = path.resolve(folderPath);
    const project = createProject(name, normalizedPath);
    return NextResponse.json({ project }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
