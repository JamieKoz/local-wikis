import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const EDITABLE_EXTENSIONS = new Set([".txt", ".md", ".js", ".ts", ".json", ".csv"]);
const BROWSABLE_EXTENSIONS = new Set([
  ".txt",
  ".md",
  ".js",
  ".ts",
  ".json",
  ".csv",
  ".xlsx",
  ".pdf",
]);
const IGNORED_DIRS = new Set(["node_modules", ".git"]);

export type ProjectFile = {
  path: string;
  relativePath: string;
  extension: string;
  editable: boolean;
};

function isInsideProject(projectRoot: string, filePath: string): boolean {
  const relative = path.relative(projectRoot, filePath);
  return !relative.startsWith("..") && !path.isAbsolute(relative);
}

function toRealPathIfExists(inputPath: string): string {
  if (!fs.existsSync(inputPath)) {
    return inputPath;
  }
  return fs.realpathSync(inputPath);
}

export function resolveProjectFilePath(projectRoot: string, targetPath: string): string {
  const resolvedRoot = toRealPathIfExists(path.resolve(projectRoot));
  const normalized = path.isAbsolute(targetPath)
    ? path.resolve(targetPath)
    : path.resolve(resolvedRoot, targetPath);
  const normalizedRealPath = toRealPathIfExists(normalized);

  if (!isInsideProject(resolvedRoot, normalizedRealPath)) {
    throw new Error("File path must be inside the project folder");
  }

  return normalizedRealPath;
}

export function isEditableExtension(filePath: string): boolean {
  return EDITABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function listProjectFiles(projectRoot: string): ProjectFile[] {
  const root = path.resolve(projectRoot);
  const files: ProjectFile[] = [];

  function walk(currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        walk(absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!BROWSABLE_EXTENSIONS.has(extension)) {
        continue;
      }

      files.push({
        path: absolutePath,
        relativePath: path.relative(root, absolutePath),
        extension,
        editable: EDITABLE_EXTENSIONS.has(extension),
      });
    }
  }

  walk(root);
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

export function readTextProjectFile(projectRoot: string, targetPath: string): string {
  const fullPath = resolveProjectFilePath(projectRoot, targetPath);
  const ext = path.extname(fullPath).toLowerCase();
  if (ext === ".pdf") {
    throw new Error("PDF files are view-only and should be opened with the PDF viewer");
  }
  if (ext !== ".xlsx") {
    return fs.readFileSync(fullPath, "utf8");
  }

  const fileBuffer = fs.readFileSync(fullPath);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });
  const sheetTexts = workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const csv = XLSX.utils.sheet_to_csv(sheet);
    return `# Sheet: ${sheetName}\n${csv}`;
  });
  return sheetTexts.join("\n\n");
}

export type SpreadsheetSheet = {
  name: string;
  rows: string[][];
};

export function readSpreadsheetFile(projectRoot: string, targetPath: string): SpreadsheetSheet[] {
  const fullPath = resolveProjectFilePath(projectRoot, targetPath);
  const ext = path.extname(fullPath).toLowerCase();
  if (ext !== ".xlsx") {
    throw new Error("Spreadsheet viewer only supports .xlsx files");
  }

  const fileBuffer = fs.readFileSync(fullPath);
  const workbook = XLSX.read(fileBuffer, { type: "buffer" });

  return workbook.SheetNames.map((sheetName) => {
    const sheet = workbook.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false }) as Array<
      Array<string | number | boolean | null | undefined>
    >;
    return {
      name: sheetName,
      rows: rows.map((row) => row.map((cell) => (cell == null ? "" : String(cell)))),
    };
  });
}

export function readRawProjectFile(projectRoot: string, targetPath: string): Buffer {
  const fullPath = resolveProjectFilePath(projectRoot, targetPath);
  return fs.readFileSync(fullPath);
}

export function writeTextProjectFile(projectRoot: string, targetPath: string, content: string) {
  const fullPath = resolveProjectFilePath(projectRoot, targetPath);
  if (!isEditableExtension(fullPath)) {
    throw new Error("This file type is read-only in the editor");
  }
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}
