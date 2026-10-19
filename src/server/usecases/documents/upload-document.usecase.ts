import { extractPdfPages } from "@/lib/documents/extract-pdf";
import { buildStorageKey, computeSha256, hasPdfMagicBytes } from "@/lib/documents/metadata";
import { env } from "@/lib/env";
import { deleteStoredFile, saveFile } from "@/lib/storage/local-storage";
import type { UploadDocumentMetadata } from "@/server/dto/documents.dto";
import {
  findDocumentBySha256,
  insertDocument,
  type DocumentRow,
} from "@/server/repositories/document.repository";
import { persistExtractedContent } from "./_persist-extracted-content";
import { DuplicateDocumentError, FileTooLargeError, InvalidFileError } from "./errors";

export interface UploadDocumentInput {
  file: { buffer: Buffer; mimeType: string; originalFilename: string };
  metadata: UploadDocumentMetadata;
  uploadedBy: string;
}

export interface UploadDocumentResult {
  document: DocumentRow;
  pageCount: number;
  chunkCount: number;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
  const { file, metadata, uploadedBy } = input;

  if (file.mimeType !== "application/pdf" || !hasPdfMagicBytes(file.buffer)) {
    throw new InvalidFileError();
  }

  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (file.buffer.byteLength > maxBytes) {
    throw new FileTooLargeError(`Ukuran file melebihi batas ${env.MAX_UPLOAD_SIZE_MB}MB.`);
  }

  const sha256 = computeSha256(file.buffer);
  const existing = await findDocumentBySha256(sha256);
  if (existing) {
    throw new DuplicateDocumentError(existing.id);
  }

  // Parse before persisting anything — an unparseable/oversized file never creates a
  // document row or a stored file (CorruptPdfError / TooManyPagesError propagate here).
  const extractedPages = await extractPdfPages(new Uint8Array(file.buffer), {
    maxPages: env.MAX_DOCUMENT_PAGES,
  });

  const storageKey = buildStorageKey();
  await saveFile(storageKey, file.buffer);

  try {
    const document = await insertDocument({
      title: metadata.title,
      documentNumber: metadata.documentNumber,
      documentType: metadata.documentType,
      revision: metadata.revision,
      projectId: metadata.projectId ?? null,
      siteId: metadata.siteId ?? null,
      originalFilename: file.originalFilename,
      mimeType: file.mimeType,
      fileSize: file.buffer.byteLength,
      sha256,
      storageKey,
      uploadedBy,
    });

    const { pages, chunks } = await persistExtractedContent(document.id, extractedPages);

    return { document, pageCount: pages.length, chunkCount: chunks.length };
  } catch (error) {
    await deleteStoredFile(storageKey);
    throw error;
  }
}
