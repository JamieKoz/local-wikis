import fs from "node:fs";
import path from "node:path";
import { PDFParse } from "pdf-parse";
import * as XLSX from "xlsx";

export const SUPPORTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".markdown",
  ".mdx",
  ".js",
  ".jsx",
  ".ts",
  ".tsx",
  ".mjs",
  ".cjs",
  ".json",
  ".csv",
  ".py",
  ".java",
  ".go",
  ".rs",
  ".rb",
  ".php",
  ".c",
  ".h",
  ".cpp",
  ".hpp",
  ".cc",
  ".cs",
  ".swift",
  ".kt",
  ".kts",
  ".scala",
  ".sh",
  ".bash",
  ".zsh",
  ".sql",
  ".yaml",
  ".yml",
  ".toml",
  ".xml",
  ".html",
  ".css",
  ".scss",
  ".vue",
  ".svelte",
  ".dart",
  ".r",
  ".lua",
  ".pl",
  ".xlsx",
  ".pdf",
]);
const IGNORED_DIRS = new Set(["node_modules", ".git"]);

export type ScannedFile = {
  path: string;
  content: string;
};

async function readFileContent(absolutePath: string, ext: string): Promise<string> {
  if (ext === ".xlsx") {
    const fileBuffer = fs.readFileSync(absolutePath);
    const workbook = XLSX.read(fileBuffer, { type: "buffer" });
    const sheetTexts = workbook.SheetNames.map((sheetName) => {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      return `# Sheet: ${sheetName}\n${csv}`;
    });
    return sheetTexts.join("\n\n");
  }

  if (ext === ".pdf") {
    const fileBuffer = fs.readFileSync(absolutePath);
    const parser = new PDFParse({ data: fileBuffer });
    try {
      const parsed = await parser.getText();
      return parsed.text || "";
    } finally {
      await parser.destroy();
    }
  }

  return fs.readFileSync(absolutePath, "utf8");
}

async function walkDirectory(rootPath: string, currentPath: string, files: ScannedFile[]) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      await walkDirectory(rootPath, absolutePath, files);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      continue;
    }

    try {
      const content = await readFileContent(absolutePath, ext);
      files.push({
        path: absolutePath.startsWith(rootPath) ? absolutePath : path.resolve(absolutePath),
        content,
      });
    } catch {
      // Skip unreadable files to keep indexing resilient.
    }
  }
}

export async function scanFolder(folderPath: string): Promise<ScannedFile[]> {
  const resolved = path.resolve(folderPath);
  const stats = fs.statSync(resolved);
  if (!stats.isDirectory()) {
    throw new Error("folderPath must be a directory");
  }

  const files: ScannedFile[] = [];
  await walkDirectory(resolved, resolved, files);
  return files;
}
