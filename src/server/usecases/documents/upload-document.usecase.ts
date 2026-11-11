import { extractDocumentPages } from "@/lib/documents/extract-document";
import {
  buildStorageKey,
  computeSha256,
  resolveSupportedDocumentFormat,
} from "@/lib/documents/metadata";
import { env } from "@/lib/env";
import { deleteStoredFile, saveFile } from "@/lib/storage";
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
  embeddedCount: number;
  embeddingSkipped: boolean;
}

export async function uploadDocument(input: UploadDocumentInput): Promise<UploadDocumentResult> {
  const { file, metadata, uploadedBy } = input;

  const format = resolveSupportedDocumentFormat(file.mimeType, file.buffer);
  if (!format) {
    throw new InvalidFileError();
  }

  const maxBytes = env.MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  if (file.buffer.byteLength > maxBytes) {
    throw new FileTooLargeError(`File size exceeds the ${env.MAX_UPLOAD_SIZE_MB}MB limit.`);
  }

  const sha256 = computeSha256(file.buffer);
  const existing = await findDocumentBySha256(sha256);
  if (existing) {
    throw new DuplicateDocumentError(existing.id);
  }

  // Parse before persisting anything — an unparseable/oversized file never creates a
  // document row or a stored file (CorruptPdfError/CorruptDocxError/TooManyPagesError
  // propagate here).
  const extractedPages = await extractDocumentPages(file.buffer, file.mimeType, {
    maxPages: env.MAX_DOCUMENT_PAGES,
  });

  const storageKey = buildStorageKey(format);
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

    const { pages, chunks, embeddedCount, embeddingSkipped } = await persistExtractedContent(
      document.id,
      extractedPages,
    );

    return {
      document,
      pageCount: pages.length,
      chunkCount: chunks.length,
      embeddedCount,
      embeddingSkipped,
    };
  } catch (error) {
    await deleteStoredFile(storageKey);
    throw error;
  }
}
