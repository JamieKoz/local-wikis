import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

export const SUPPORTED_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".js",
  ".ts",
  ".json",
  ".csv",
  ".xlsx",
]);
const IGNORED_DIRS = new Set(["node_modules", ".git"]);

export type ScannedFile = {
  path: string;
  content: string;
};

function readFileContent(absolutePath: string, ext: string): string {
  if (ext !== ".xlsx") {
    return fs.readFileSync(absolutePath, "utf8");
  }

  const fileBuffer = fs.readFileSync(absolutePath);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetTexts = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return `# Sheet: ${sheetName}\n${csv}`;
  });
  return sheetTexts.join("\n\n");
}

function walkDirectory(rootPath: string, currentPath: string, files: ScannedFile[]) {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      walkDirectory(rootPath, absolutePath, files);
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
      const content = readFileContent(absolutePath, ext);
      files.push({
        path: absolutePath.startsWith(rootPath) ? absolutePath : path.resolve(absolutePath),
        content,
      });
    } catch {
      // Skip unreadable files to keep indexing resilient.
    }
  }
}

export function scanFolder(folderPath: string): ScannedFile[] {
  const resolved = path.resolve(folderPath);
  const stats = fs.statSync(resolved);
  if (!stats.isDirectory()) {
    throw new Error("folderPath must be a directory");
  }

  const files: ScannedFile[] = [];
  walkDirectory(resolved, resolved, files);
  return files;
}
