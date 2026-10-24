import { createHash, randomUUID } from "node:crypto";

const PDF_MAGIC_BYTES = Buffer.from("%PDF-", "ascii");
// DOCX (OOXML) files are ZIP archives — "PK\x03\x04" is the ZIP local-file-header signature.
const ZIP_MAGIC_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04]);

export const PDF_MIME_TYPE = "application/pdf";
export const DOCX_MIME_TYPE =
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type SupportedDocumentExtension = "pdf" | "docx";

export function hasPdfMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, PDF_MAGIC_BYTES.length).equals(PDF_MAGIC_BYTES);
}

function hasZipMagicBytes(buffer: Buffer): boolean {
  return buffer.subarray(0, ZIP_MAGIC_BYTES.length).equals(ZIP_MAGIC_BYTES);
}

/**
 * Validates file content, not just the client-supplied extension/MIME type
 * (PLANNING.md #11: "Validasi file berdasarkan isi, bukan ekstensi saja"). Returns the
 * extension to store the file under, or null if neither the declared MIME type nor the
 * file's actual magic bytes match a supported format. Doesn't fully parse the DOCX
 * (OOXML) structure — that happens for real during LibreOffice conversion
 * (convert-docx.ts), which fails loudly on a genuinely malformed file.
 */
export function resolveSupportedDocumentFormat(
  mimeType: string,
  buffer: Buffer,
): SupportedDocumentExtension | null {
  if (mimeType === PDF_MIME_TYPE && hasPdfMagicBytes(buffer)) {
    return "pdf";
  }
  if (mimeType === DOCX_MIME_TYPE && hasZipMagicBytes(buffer)) {
    return "docx";
  }
  return null;
}

export function computeSha256(buffer: Buffer): string {
  return createHash("sha256").update(buffer).digest("hex");
}

/**
 * Internal storage path derived from a random id, never the user-supplied filename
 * (PLANNING.md #7 tahap 1: "Gunakan UUID/internal storage key, bukan nama file dari
 * pengguna sebagai path"). The extension reflects the actual stored format (the
 * original uploaded file, not a converted derivative — see convert-docx.ts).
 */
export function buildStorageKey(extension: SupportedDocumentExtension): string {
  return `documents/${randomUUID()}.${extension}`;
}
