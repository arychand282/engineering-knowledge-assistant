import { createHash, randomUUID } from "node:crypto";

const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "ascii");

/**
 * Validates file content, not just the client-supplied extension/MIME type
 * (PLANNING.md #11: "Validasi file berdasarkan isi, bukan ekstensi saja").
 */
export function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES);
}

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Internal storage path derived from a random id, never the user-supplied filename
 * (PLANNING.md #7 tahap 1: "Gunakan UUID/internal storage key, bukan nama file dari
 * pengguna sebagai path").
 */
export function buildStorageKey(): string {
  return `documents/${randomUUID()}.pdf`;
}
