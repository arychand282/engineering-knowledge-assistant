import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { DOCX_MIME_TYPE } from "@/lib/documents/metadata";
import {
  conversations,
  documentChunks,
  documentPages,
  documents,
  messageSources,
  messages,
  users,
} from "@/lib/db/schema";
import { env } from "@/lib/env";
import { deleteStoredFile, readStoredFile } from "@/lib/storage/local-storage";
import { getDocument } from "@/server/usecases/documents/get-document.usecase";
import {
  CorruptDocxError,
  CorruptPdfError,
  DocumentNotFoundError,
  DuplicateDocumentError,
  FileTooLargeError,
  InvalidFileError,
  TooManyPagesError,
} from "@/server/usecases/documents/errors";
import { reprocessDocument } from "@/server/usecases/documents/reprocess-document.usecase";
import { uploadDocument } from "@/server/usecases/documents/upload-document.usecase";
import { buildGarbageZip, buildTestDocx } from "../helpers/build-test-docx";
import { buildTestPdf } from "../helpers/build-test-pdf";

let userId: string;
const createdDocumentIds: string[] = [];

/** `admin` bypasses document_access for management reads — irrelevant to what these tests assert (ingestion mechanics, not RBAC). */
function managementActor() {
  return { id: userId, roles: ["admin"] };
}

function baseMetadata(overrides: Partial<Parameters<typeof uploadDocument>[0]["metadata"]> = {}) {
  return {
    title: "Integration Test Document",
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
    const pdf = buildTestPdf([{ text: "First page content for document upload testing." }]);

    const result = await uploadDocument({
      file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "test.pdf" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(result.document.id);

    expect(result.document.status).toBe("draft");
    expect(result.pageCount).toBe(1);
    expect(result.chunkCount).toBe(1);

    const stored = await readStoredFile(result.document.storageKey);
    expect(stored.equals(pdf)).toBe(true);

    const detail = await getDocument(result.document.id, managementActor());
    expect(detail.pages).toHaveLength(1);
    expect(detail.pages[0]).toMatchObject({ pageNumber: 1, extractionStatus: "success" });
    expect(detail.chunkCount).toBe(1);
  });

  it("marks a blank page as empty and still stores the rest of the document", async () => {
    const pdf = buildTestPdf([{ text: "Page one has content." }, { text: "" }]);

    const result = await uploadDocument({
      file: {
        buffer: pdf,
        mimeType: "application/pdf",
        originalFilename: "has-blank-page.pdf",
      },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(result.document.id);

    const detail = await getDocument(result.document.id, managementActor());
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
        file: { buffer: corrupted, mimeType: "application/pdf", originalFilename: "corrupted.pdf" },
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
          originalFilename: "not-a-pdf.txt",
        },
        metadata: baseMetadata(),
        uploadedBy: userId,
      }),
    ).rejects.toBeInstanceOf(InvalidFileError);
  });

  it("rejects a duplicate upload of the same file content", async () => {
    const pdf = buildTestPdf([{ text: "Identical content." }]);

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
          file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "large.pdf" },
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
      const pdf = buildTestPdf([{ text: "one" }, { text: "two" }]);
      await expect(
        uploadDocument({
          file: {
            buffer: pdf,
            mimeType: "application/pdf",
            originalFilename: "too-many-pages.pdf",
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

describe("uploadDocument (DOCX via LibreOffice — requires soffice installed)", () => {
  it("converts via LibreOffice and extracts real page text, storing the original .docx", async () => {
    const docx = buildTestDocx(["First paragraph content for DOCX testing."]);

    const result = await uploadDocument({
      file: { buffer: docx, mimeType: DOCX_MIME_TYPE, originalFilename: "test.docx" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(result.document.id);

    expect(result.document.storageKey).toMatch(/\.docx$/);
    expect(result.document.mimeType).toBe(DOCX_MIME_TYPE);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);

    // The ORIGINAL uploaded file is what's stored, not the converted PDF derivative.
    const stored = await readStoredFile(result.document.storageKey);
    expect(stored.equals(docx)).toBe(true);

    const detail = await getDocument(result.document.id, managementActor());
    expect(detail.pages[0].extractedText).toContain("First paragraph content for DOCX testing.");
  }, 30_000);

  it("rejects a ZIP with valid magic bytes but no real DOCX parts inside", async () => {
    const garbage = buildGarbageZip();

    await expect(
      uploadDocument({
        file: { buffer: garbage, mimeType: DOCX_MIME_TYPE, originalFilename: "corrupted.docx" },
        metadata: baseMetadata(),
        uploadedBy: userId,
      }),
    ).rejects.toBeInstanceOf(CorruptDocxError);

    const rows = await db.select().from(documents).where(eq(documents.uploadedBy, userId));
    expect(rows).toHaveLength(0);
  }, 30_000);
});

describe("reprocessDocument", () => {
  it("replaces pages/chunks for an existing document", async () => {
    const pdf = buildTestPdf([{ text: "Original document content." }]);
    const uploaded = await uploadDocument({
      file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "reprocess.pdf" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(uploaded.document.id);

    const before = await getDocument(uploaded.document.id, managementActor());
    const firstPageId = before.pages[0].id;

    const result = await reprocessDocument(uploaded.document.id);
    expect(result.pageCount).toBe(1);
    expect(result.chunkCount).toBe(1);

    const after = await getDocument(uploaded.document.id, managementActor());
    expect(after.pages[0].id).not.toBe(firstPageId); // old row deleted, new one inserted
    expect(after.pages[0].extractedText).toContain("Original document content.");
  });

  it("throws DocumentNotFoundError for an unknown id", async () => {
    await expect(reprocessDocument(randomUUID())).rejects.toBeInstanceOf(DocumentNotFoundError);
  });

  it("reprocesses a document that was already cited in a chat answer (real bug: FK violation deleting its old chunks)", async () => {
    const pdf = buildTestPdf([{ text: "Content that will be cited in chat." }]);
    const uploaded = await uploadDocument({
      file: { buffer: pdf, mimeType: "application/pdf", originalFilename: "cited.pdf" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(uploaded.document.id);

    const [chunk] = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, uploaded.document.id));

    const [conversation] = await db.insert(conversations).values({ userId }).returning();
    await db
      .insert(messages)
      .values({ conversationId: conversation.id, role: "user", content: "Test question" });
    const [assistantMessage] = await db
      .insert(messages)
      .values({
        conversationId: conversation.id,
        role: "assistant",
        content: "Answer that cites this document.",
        answerStatus: "answered",
      })
      .returning();
    await db.insert(messageSources).values({
      messageId: assistantMessage.id,
      documentId: uploaded.document.id,
      chunkId: chunk.id,
      pageNumber: 1,
      quotedText: "Content that will be cited in chat.",
    });

    // Before the fix: deleteChunksByDocumentId() inside reprocessDocument() threw a
    // Postgres FK violation here (message_sources.chunk_id was ON DELETE RESTRICT).
    await expect(reprocessDocument(uploaded.document.id)).resolves.toMatchObject({
      chunkCount: 1,
    });

    // The message's own text is untouched — only its structured source citation is
    // gone (cascaded away with the chunk it pointed at, which no longer exists).
    const [reloadedMessage] = await db
      .select()
      .from(messages)
      .where(eq(messages.id, assistantMessage.id));
    expect(reloadedMessage.content).toBe("Answer that cites this document.");
    const remainingSources = await db
      .select()
      .from(messageSources)
      .where(eq(messageSources.messageId, assistantMessage.id));
    expect(remainingSources).toHaveLength(0);

    await db.delete(messages).where(eq(messages.conversationId, conversation.id));
    await db.delete(conversations).where(eq(conversations.id, conversation.id));
  });

  it("re-converts a DOCX-sourced document via LibreOffice again (requires soffice installed)", async () => {
    const docx = buildTestDocx(["Original DOCX paragraph."]);
    const uploaded = await uploadDocument({
      file: { buffer: docx, mimeType: DOCX_MIME_TYPE, originalFilename: "reprocess.docx" },
      metadata: baseMetadata(),
      uploadedBy: userId,
    });
    createdDocumentIds.push(uploaded.document.id);

    const result = await reprocessDocument(uploaded.document.id);
    expect(result.pageCount).toBeGreaterThanOrEqual(1);

    const after = await getDocument(uploaded.document.id, managementActor());
    expect(after.pages[0].extractedText).toContain("Original DOCX paragraph.");
  }, 30_000);
});
