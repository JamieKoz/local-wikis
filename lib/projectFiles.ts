import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const EDITABLE_EXTENSIONS = new Set([
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
]);
const BROWSABLE_EXTENSIONS = new Set([
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

export function resolveProjectFilePath(projectRoots: string | string[], targetPath: string): string {
  const roots = (Array.isArray(projectRoots) ? projectRoots : [projectRoots]).map((root) =>
    toRealPathIfExists(path.resolve(root)),
  );

  if (path.isAbsolute(targetPath)) {
    const normalized = toRealPathIfExists(path.resolve(targetPath));
    if (!roots.some((root) => isInsideProject(root, normalized))) {
      throw new Error("File path must be inside one of the project folders");
    }
    return normalized;
  }

  for (const root of roots) {
    const normalized = toRealPathIfExists(path.resolve(root, targetPath));
    if (isInsideProject(root, normalized)) {
      return normalized;
    }
  }

  throw new Error("File path must be inside one of the project folders");
}

export function isEditableExtension(filePath: string): boolean {
  return EDITABLE_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

export function listProjectFiles(projectRoots: string[]): ProjectFile[] {
  const files: ProjectFile[] = [];
  const dedupe = new Set<string>();

  function walk(root: string, currentPath: string) {
    const entries = fs.readdirSync(currentPath, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        if (IGNORED_DIRS.has(entry.name)) {
          continue;
        }
        walk(root, absolutePath);
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const extension = path.extname(entry.name).toLowerCase();
      if (!BROWSABLE_EXTENSIONS.has(extension)) {
        continue;
      }

      if (dedupe.has(absolutePath)) {
        continue;
      }
      dedupe.add(absolutePath);
      const relative = path.relative(root, absolutePath);
      const displayPath =
        projectRoots.length > 1 ? `${path.basename(root)}/${relative}` : relative;
      files.push({
        path: absolutePath,
        relativePath: displayPath,
        extension,
        editable: EDITABLE_EXTENSIONS.has(extension),
      });
    }
  }

  for (const rootPath of projectRoots) {
    const root = path.resolve(rootPath);
    if (!fs.existsSync(root)) {
      continue;
    }
    walk(root, root);
  }
  files.sort((a, b) => a.relativePath.localeCompare(b.relativePath));
  return files;
}

export function readTextProjectFile(projectRoots: string | string[], targetPath: string): string {
  const fullPath = resolveProjectFilePath(projectRoots, targetPath);
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

export function readSpreadsheetFile(projectRoots: string | string[], targetPath: string): SpreadsheetSheet[] {
  const fullPath = resolveProjectFilePath(projectRoots, targetPath);
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

export function readRawProjectFile(projectRoots: string | string[], targetPath: string): Buffer {
  const fullPath = resolveProjectFilePath(projectRoots, targetPath);
  return fs.readFileSync(fullPath);
}

export function writeTextProjectFile(projectRoots: string | string[], targetPath: string, content: string) {
  const fullPath = resolveProjectFilePath(projectRoots, targetPath);
  if (!isEditableExtension(fullPath)) {
    throw new Error("This file type is read-only in the editor");
  }
  fs.writeFileSync(fullPath, content, "utf8");
  return fullPath;
}
