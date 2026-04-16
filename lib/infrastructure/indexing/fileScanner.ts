import { FileScanner } from "@/lib/application/ports/FileScanner";
import { scanFolder } from "@/lib/fileScanner";

export class DiskFileScanner implements FileScanner {
  async scanFolder(folderPath: string) {
    return scanFolder(folderPath);
  }
}
