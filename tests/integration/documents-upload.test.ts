import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { documentChunks, documentPages, documents, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { deleteStoredFile, readStoredFile } from "@/lib/storage/local-storage";
import { getDocument } from "@/server/usecases/documents/get-document.usecase";
import {
  CorruptPdfError,
  DocumentNotFoundError,
  DuplicateDocumentError,
  FileTooLargeError,
  InvalidFileError,
  TooManyPagesError,
} from "@/server/usecases/documents/errors";
import { reprocessDocument } from "@/server/usecases/documents/reprocess-document.usecase";
import { uploadDocument } from "@/server/usecases/documents/upload-document.usecase";
import { buildTestPdf } from "../helpers/build-test-pdf";

let userId: string;
const createdDocumentIds: string[] = [];

function baseMetadata(overrides: Partial<Parameters<typeof uploadDocument>[0]["metadata"]> = {}) {
  return {
    title: "Dokumen Uji Integrasi",
    documentNumber: `DOC-${randomUUID()}`,
    documentType: "procedure",
    revision: "0",
    ...overrides,
  };
}

beforeAll(async () => {
  const [user] = await db
    .insert(users)
    .values({ email: `test-${randomUUID()}@example.test`, name: "Integration Test User" })
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

describe("uploadDocument (real DB + real local storage)", () => {
  it("stores metadata, pages, and chunks for a normal text PDF", async () => {
    const pdf = buildTestPdf([{ text: "Isi halaman pertama untuk pengujian unggahan dokumen." }]);

    const result = await uploadDocument({
      file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "uji.pdf" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(result.document.id);

    expect(result.document.status).toBe("draft");
    expect(result.pageCount).toBe(1);
    expect(result.chunkCount).toBe(1);

    const stored = await readStoredFile(result.document.storageKey);
    expect(stored.equals(pdf)).toBe(true);

    const detail = await getDocument(result.document.id);
    expect(detail.pages).toHaveLength(1);
    expect(detail.pages[0]).toMatchObject({ pageNumber: 1, extractionStatus: "success" });
    expect(detail.chunkCount).toBe(1);
  });

  it("marks a blank page as empty and still stores the rest of the document", async () => {
    const pdf = buildTestPdf([{ text: "Halaman satu ada isi." }, { text: "" }]);

    const result = await uploadDocument({
      file: {
        buffer: pdf,
        mimeType: "application/pdf",
        originalFilename: "ada-halaman-kosong.pdf",
      },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(result.document.id);

    const detail = await getDocument(result.document.id);
    expect(detail.pages).toHaveLength(2);
    expect(detail.pages[1]).toMatchObject({
      pageNumber: 2,
      extractionStatus: "empty",
      extractedText: null,
    });
  });

  it("rejects a corrupted file without creating any document row", async () => {
    const corrupted = Buffer.from("%PDF-1.4\nthis is not a real pdf body at all");

    await expect(
      uploadDocument({
        file: { buffer: corrupted, mimeType: "application/pdf", originalFilename: "rusak.pdf" },
        metadata: baseMetadata(),
        uploadedBy: userId,
      }),
    ).rejects.toBeInstanceOf(CorruptPdfError);

    const rows = await db.select().from(documents).where(eq(documents.uploadedBy, userId));
    expect(rows).toHaveLength(0);
  });

  it("rejects a non-PDF file", async () => {
    await expect(
      uploadDocument({
        file: {
          buffer: Buffer.from("plain text"),
          mimeType: "text/plain",
          originalFilename: "bukan-pdf.txt",
        },
        metadata: baseMetadata(),
        uploadedBy: userId,
      }),
    ).rejects.toBeInstanceOf(InvalidFileError);
  });

  it("rejects a duplicate upload of the same file content", async () => {
    const pdf = buildTestPdf([{ text: "Konten identik." }]);

    const first = await uploadDocument({
      file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "a.pdf" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(first.document.id);

    const error = await uploadDocument({
      file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "b.pdf" },
      metadata: baseMetadata({ documentNumber: `DOC-${randomUUID()}` }),
      uploadedBy: userId,
    }).catch((e: unknown) => e);

    expect(error).toBeInstanceOf(DuplicateDocumentError);
    expect((error as DuplicateDocumentError).existingDocumentId).toBe(first.document.id);
  });

  it("rejects a file over the configured size limit", async () => {
    const original = env.MAX_UPLOAD_SIZE_MB;
    env.MAX_UPLOAD_SIZE_MB = 0; // smallest possible limit for this test only
    try {
      const pdf = buildTestPdf([{ text: "a" }]);
      await expect(
        uploadDocument({
          file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "besar.pdf" },
          metadata: baseMetadata(),
          uploadedBy: userId,
        }),
      ).rejects.toBeInstanceOf(FileTooLargeError);
    } finally {
      env.MAX_UPLOAD_SIZE_MB = original;
    }
  });

  it("rejects a document exceeding the configured max page count", async () => {
    const original = env.MAX_DOCUMENT_PAGES;
    env.MAX_DOCUMENT_PAGES = 1;
    try {
      const pdf = buildTestPdf([{ text: "satu" }, { text: "dua" }]);
      await expect(
        uploadDocument({
          file: {
            buffer: pdf,
            mimeType: "application/pdf",
            originalFilename: "banyak-halaman.pdf",
          },
          metadata: baseMetadata(),
          uploadedBy: userId,
        }),
      ).rejects.toBeInstanceOf(TooManyPagesError);
    } finally {
      env.MAX_DOCUMENT_PAGES = original;
    }
  });
});

describe("reprocessDocument", () => {
  it("replaces pages/chunks for an existing document", async () => {
    const pdf = buildTestPdf([{ text: "Versi awal konten dokumen." }]);
    const uploaded = await uploadDocument({
      file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "reprocess.pdf" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(uploaded.document.id);

    const before = await getDocument(uploaded.document.id);
    const firstPageId = before.pages[0].id;

    const result = await reprocessDocument(uploaded.document.id);
    expect(result.pageCount).toBe(1);
    expect(result.chunkCount).toBe(1);

    const after = await getDocument(uploaded.document.id);
    expect(after.pages[0].id).not.toBe(firstPageId); // old row deleted, new one inserted
    expect(after.pages[0].extractedText).toContain("Versi awal konten dokumen.");
  });

  it("throws DocumentNotFoundError for an unknown id", async () => {
    await expect(reprocessDocument(randomUUID())).rejects.toBeInstanceOf(DocumentNotFoundError);
  });
});
