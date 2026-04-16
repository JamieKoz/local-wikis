import { Hasher } from "@/lib/application/ports/Hasher";
import { hashContent } from "@/lib/hash";

export class Sha1Hasher implements Hasher {
  hashContent(content: string): string {
    return hashContent(content);
  }
}
