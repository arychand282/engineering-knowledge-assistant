import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

// turbopackIgnore: STORAGE_DIR is server config, not user input — this path is scoped
// and doesn't need (or want) Next's build-time output-tracing to follow it.
const storageRoot = path.resolve(/*turbopackIgnore: true*/ process.cwd(), env.STORAGE_DIR);

/**
 * Resolves a storage key to an absolute path, rejecting anything that would escape
 * the storage root (defense in depth — storage keys are always server-generated UUIDs,
 * never derived from user input, but this guards against future regressions).
 */
function resolveStoragePath(storageKey: string): string {
  const resolved = path.resolve(/*turbopackIgnore: true*/ storageRoot, storageKey);
  if (resolved !== storageRoot && !resolved.startsWith(storageRoot + path.sep)) {
    throw new Error(`storageKey tidak valid: ${storageKey}`);
  }
  return resolved;
}

export async function saveFile(storageKey: string, data: Buffer): Promise<void> {
  const filePath = resolveStoragePath(storageKey);
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, data);
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  return readFile(resolveStoragePath(storageKey));
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  await rm(resolveStoragePath(storageKey), { force: true });
}
