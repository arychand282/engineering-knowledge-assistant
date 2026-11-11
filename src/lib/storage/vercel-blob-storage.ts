import { del, get, put } from "@vercel/blob";

/**
 * Vercel Blob-backed storage — same 3-function contract as local-storage.ts, swapped in
 * via STORAGE_PROVIDER=vercel-blob (see src/lib/storage/index.ts) for deployments where
 * the local filesystem isn't persistent across requests (e.g. Vercel Functions).
 * `access: "private"` — blobs are never directly reachable by URL; only this app's own
 * authenticated routes read them back via `get()`, consistent with this project's
 * document-level RBAC (storageKey is never exposed to clients as a fetchable path).
 */

export async function saveFile(storageKey: string, data: Buffer): Promise<void> {
  await put(storageKey, data, { access: "private", addRandomSuffix: false });
}

export async function readStoredFile(storageKey: string): Promise<Buffer> {
  const result = await get(storageKey, { access: "private" });
  if (!result || result.statusCode !== 200) {
    throw new Error(`Blob not found for storageKey: ${storageKey}`);
  }
  return Buffer.from(await new Response(result.stream).arrayBuffer());
}

export async function deleteStoredFile(storageKey: string): Promise<void> {
  await del(storageKey);
}
