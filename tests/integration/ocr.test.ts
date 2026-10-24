import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { OcrUnavailableError, createOcrWorker, runOcrOnPages } from "@/lib/documents/ocr";
import { documentChunks, documentPages, documents, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { deleteStoredFile } from "@/lib/storage/local-storage";
import { getDocument } from "@/server/usecases/documents/get-document.usecase";
import { uploadDocument } from "@/server/usecases/documents/upload-document.usecase";
import { buildTestPdf } from "../helpers/build-test-pdf";
import { buildTestScannedPdf } from "../helpers/build-test-scanned-pdf";

/**
 * Requires `npm run ocr:pull-language-data` to have been run (OCR_LANG_DATA_DIR
 * populated with ind/eng traineddata). Exercises the real tesseract.js engine + real
 * @napi-rs/canvas PDF rasterization — not mocked. Each OCR call is genuinely slow
 * (worker startup + recognition), hence the generous per-test timeouts.
 */

let userId: string;
const createdDocumentIds: string[] = [];

function managementActor() {
  return { id: userId, roles: ["admin"] };
}

function baseMetadata(overrides: Partial<Parameters<typeof uploadDocument>[0]["metadata"]> = {}) {
  return {
    title: "Dokumen Uji OCR",
    documentNumber: `DOC-${randomUUID()}`,
    documentType: "procedure",
    revision: "0",
    ...overrides,
  };
}

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `ocr-test-${randomUUID()}@example.test`, name: "OCR Test User" })
    .returning();
  userId = user.id;
});

afterEach(async () => {
  for (const id of createdDocumentIds.splice(0)) {
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (doc) {
      await db.delete(documentChunks).where(eq(documentChunks.documentId, id));
      await db.delete(documentPages).where(eq(documentPages.documentId, id));
      await db.delete(documents).where(eq(documents.id, id));
      await deleteStoredFile(doc.storageKey);
    }
  }
});

afterAll(async () => {
  await db.delete(users).where(eq(users.id, userId));
  await pool.end();
});

describe("runOcrOnPages (real tesseract.js engine)", () => {
  it("recognizes real text from a scanned (image-only) page and marks provenance", async () => {
    const pdf = buildTestScannedPdf("Tekanan maksimum boiler adalah 12 bar");
    const classified = [{ pageNumber: 1, text: "", status: "ocr_required" as const }];

    const result = await runOcrOnPages(new Uint8Array(pdf), classified);

    expect(result).toHaveLength(1);
    expect(result[0].status).toBe("success");
    expect(result[0].isOcr).toBe(true);
    expect(result[0].text).toContain("Tekanan maksimum boiler adalah 12 bar");
    expect(result[0].ocrConfidence).toBeGreaterThan(env.OCR_MIN_CONFIDENCE);
  }, 30_000);

  it("returns pages unchanged (no worker spun up) when nothing needs OCR", async () => {
    const pages = [{ pageNumber: 1, text: "halo", status: "success" as const }];
    const result = await runOcrOnPages(new Uint8Array(buildTestPdf([{ text: "halo" }])), pages);
    expect(result).toEqual(pages);
  }, 10_000);

  it("leaves a page as ocr_required when confidence is below OCR_MIN_CONFIDENCE", async () => {
    const original = env.OCR_MIN_CONFIDENCE;
    env.OCR_MIN_CONFIDENCE = 101; // impossible to clear — forces the reject branch
    try {
      const pdf = buildTestScannedPdf("Tekanan maksimum boiler adalah 12 bar");
      const classified = [{ pageNumber: 1, text: "", status: "ocr_required" as const }];
      const result = await runOcrOnPages(new Uint8Array(pdf), classified);

      expect(result[0].status).toBe("ocr_required");
      expect(result[0].isOcr).toBeUndefined();
    } finally {
      env.OCR_MIN_CONFIDENCE = original;
    }
  }, 30_000);

  it("degrades gracefully (pages unchanged) when the OCR engine can't start", async () => {
    const original = env.OCR_LANG_DATA_DIR;
    env.OCR_LANG_DATA_DIR = "/nonexistent/path/for/testing";
    try {
      const pdf = buildTestScannedPdf("halo dunia");
      const classified = [{ pageNumber: 1, text: "", status: "ocr_required" as const }];
      const result = await runOcrOnPages(new Uint8Array(pdf), classified);
      expect(result).toEqual(classified);
    } finally {
      env.OCR_LANG_DATA_DIR = original;
    }
  }, 30_000);
});

describe("createOcrWorker", () => {
  it("throws OcrUnavailableError when language data is missing", async () => {
    const original = env.OCR_LANG_DATA_DIR;
    env.OCR_LANG_DATA_DIR = "/nonexistent/path/for/testing";
    try {
      await expect(createOcrWorker()).rejects.toBeInstanceOf(OcrUnavailableError);
    } finally {
      env.OCR_LANG_DATA_DIR = original;
    }
  }, 30_000);
});

describe("uploadDocument (OCR end-to-end)", () => {
  it("OCRs a scanned PDF on upload, making it searchable (chunked + embedded)", async () => {
    const pdf = buildTestScannedPdf("Prosedur evakuasi gedung kantor pusat");

    const result = await uploadDocument({
      file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "scan.pdf" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(result.document.id);

    expect(result.pageCount).toBe(1);
    expect(result.chunkCount).toBe(1); // only chunked because OCR succeeded

    const detail = await getDocument(result.document.id, managementActor());
    expect(detail.pages[0]).toMatchObject({ extractionStatus: "success", isOcr: true });
    expect(detail.pages[0].extractedText).toContain("Prosedur evakuasi gedung kantor pusat");
    expect(detail.pages[0].ocrConfidence).toBeGreaterThan(0);
  }, 30_000);

  it("leaves a scanned page unsearchable (no chunk) when OCR is disabled", async () => {
    const original = env.OCR_ENABLED;
    env.OCR_ENABLED = false;
    try {
      const pdf = buildTestScannedPdf("Konten yang seharusnya tidak di-OCR");
      const result = await uploadDocument({
        file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "scan-off.pdf" },
        metadata: baseMetadata(),
        uploadedBy: userId,
      });
      createdDocumentIds.push(result.document.id);

      expect(result.chunkCount).toBe(0);
      const detail = await getDocument(result.document.id, managementActor());
      expect(detail.pages[0]).toMatchObject({ extractionStatus: "ocr_required", isOcr: false });
    } finally {
      env.OCR_ENABLED = original;
    }
  }, 15_000);
});
