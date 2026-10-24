import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { env } from "@/lib/env";

const execFileAsync = promisify(execFile);

export class LibreOfficeUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      `LibreOffice tidak ditemukan di path/perintah "${env.SOFFICE_BINARY}" (env SOFFICE_BINARY). ` +
        "Upload DOCX butuh LibreOffice terinstal — lihat README 'Prasyarat' untuk instalasi. Jika " +
        "LibreOffice sudah terinstal tapi tidak ada di PATH, set SOFFICE_BINARY ke path lengkapnya.",
    );
    this.name = "LibreOfficeUnavailableError";
    this.cause = cause;
  }
}

export class CorruptDocxError extends Error {
  constructor(cause?: unknown) {
    super("File tidak dapat dibaca sebagai DOCX yang valid.");
    this.name = "CorruptDocxError";
    this.cause = cause;
  }
}

function isBinaryNotFoundError(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as { code?: unknown }).code === "ENOENT"
  );
}

/**
 * Converts a DOCX buffer to PDF via headless LibreOffice, so DOCX ingestion can reuse
 * the existing PDF extraction pipeline (extract-pdf.ts) unchanged — including its real,
 * renderer-derived page numbers. DOCX itself stores no page boundaries (pagination is a
 * rendering-time concern there, not part of the format), so this is the only way to get
 * genuine page numbers rather than an invented approximation (PLANNING.md §7 tahap 2,
 * "Stack yang direkomendasikan" DOCX row).
 *
 * Every temp file lives under its own per-call temp directory, removed afterward
 * whether conversion succeeded or not.
 */
export async function convertDocxToPdf(buffer: Buffer): Promise<Buffer> {
  const workDir = await mkdtemp(path.join(tmpdir(), "eka-docx-"));
  const inputPath = path.join(workDir, "input.docx");
  const outputPath = path.join(workDir, "input.pdf");

  try {
    await writeFile(inputPath, buffer);

    try {
      await execFileAsync(
        env.SOFFICE_BINARY,
        ["--headless", "--convert-to", "pdf", "--outdir", workDir, inputPath],
        { timeout: env.DOCX_CONVERT_TIMEOUT_MS },
      );
    } catch (error) {
      if (isBinaryNotFoundError(error)) {
        throw new LibreOfficeUnavailableError(error);
      }
      // Non-zero exit or timeout — most likely a malformed/unparseable DOCX, not a
      // missing-tool problem (LibreOffice itself is confirmed reachable at this point).
      throw new CorruptDocxError(error);
    }

    try {
      return await readFile(outputPath);
    } catch (error) {
      // soffice can exit 0 but still produce no output for a file it can't actually read.
      throw new CorruptDocxError(error);
    }
  } finally {
    await rm(workDir, { recursive: true, force: true });
  }
}
