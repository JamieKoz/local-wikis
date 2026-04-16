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
let pdfWorkerSetupPromise: Promise<void> | null = null;

async function ensurePdfWorkerConfigured() {
  if (!pdfWorkerSetupPromise) {
    pdfWorkerSetupPromise = (async () => {
      const globalWorker = globalThis as { pdfjsWorker?: { WorkerMessageHandler?: unknown } };
      if (globalWorker.pdfjsWorker?.WorkerMessageHandler) {
        return;
      }
      try {
        globalWorker.pdfjsWorker = await import("pdfjs-dist/legacy/build/pdf.worker.mjs");
        return;
      } catch {
        // fall back to non-legacy worker path when legacy bundle is unavailable
      }
      try {
        globalWorker.pdfjsWorker = await import("pdfjs-dist/build/pdf.worker.mjs");
      } catch {
        // Keep best-effort behavior; parser may still work in some runtimes.
      }
    })();
  }
  await pdfWorkerSetupPromise;
}

export type ScannedFile = {
  path: string;
  content: string;
};

export type ScanFailure = {
  path: string;
  reason: string;
};

export type ScanResult = {
  files: ScannedFile[];
  matchedFiles: number;
  failedFiles: ScanFailure[];
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
    await ensurePdfWorkerConfigured();
    const fileBuffer = fs.readFileSync(absolutePath);
    const parser = new PDFParse({ data: fileBuffer, disableWorker: true });
    try {
      const parsed = await parser.getText();
      return parsed.text || "";
    } finally {
      await parser.destroy();
    }
  }

  return fs.readFileSync(absolutePath, "utf8");
}

async function walkDirectory(
  rootPath: string,
  currentPath: string,
  files: ScannedFile[],
  failedFiles: ScanFailure[],
): Promise<number> {
  const entries = fs.readdirSync(currentPath, { withFileTypes: true });
  let matchedFiles = 0;

  for (const entry of entries) {
    const absolutePath = path.join(currentPath, entry.name);

    if (entry.isDirectory()) {
      if (IGNORED_DIRS.has(entry.name)) {
        continue;
      }
      matchedFiles += await walkDirectory(rootPath, absolutePath, files, failedFiles);
      continue;
    }

    if (!entry.isFile()) {
      continue;
    }

    const ext = path.extname(entry.name).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(ext)) {
      continue;
    }
    matchedFiles += 1;

    try {
      const content = await readFileContent(absolutePath, ext);
      files.push({
        path: absolutePath.startsWith(rootPath) ? absolutePath : path.resolve(absolutePath),
        content,
      });
    } catch (error) {
      const reason = error instanceof Error ? error.message : "Unknown read error";
      failedFiles.push({
        path: absolutePath.startsWith(rootPath) ? absolutePath : path.resolve(absolutePath),
        reason,
      });
    }
  }

  return matchedFiles;
}

export async function scanFolder(folderPath: string): Promise<ScanResult> {
  const resolved = path.resolve(folderPath);
  const stats = fs.statSync(resolved);
  if (!stats.isDirectory()) {
    throw new Error("folderPath must be a directory");
  }

  const files: ScannedFile[] = [];
  const failedFiles: ScanFailure[] = [];
  const matchedFiles = await walkDirectory(resolved, resolved, files, failedFiles);
  return {
    files,
    matchedFiles,
    failedFiles,
  };
}
