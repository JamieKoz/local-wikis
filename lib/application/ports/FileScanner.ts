import { ScanResult } from "@/lib/fileScanner";

export interface FileScanner {
  scanFolder(folderPath: string): Promise<ScanResult>;
}
