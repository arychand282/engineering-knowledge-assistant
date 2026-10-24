export { CorruptPdfError, TooManyPagesError } from "@/lib/documents/extract-pdf";

export class InvalidFileError extends Error {
  constructor(message = "Hanya file PDF yang didukung.") {
    super(message);
    this.name = "InvalidFileError";
  }
}

export class FileTooLargeError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "FileTooLargeError";
  }
}

export class DuplicateDocumentError extends Error {
  constructor(public readonly existingDocumentId: string) {
    super("Dokumen dengan isi yang sama sudah pernah diunggah.");
    this.name = "DuplicateDocumentError";
  }
}

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Dokumen ${documentId} tidak ditemukan.`);
    this.name = "DocumentNotFoundError";
  }
}

export class SelfSupersedeError extends Error {
  constructor() {
    super("Dokumen tidak boleh menjadi supersedesDocumentId untuk dirinya sendiri.");
    this.name = "SelfSupersedeError";
  }
}

export class PageNotFoundError extends Error {
  constructor(documentId: string, pageNumber: number) {
    super(`Halaman ${pageNumber} pada dokumen ${documentId} tidak ditemukan.`);
    this.name = "PageNotFoundError";
  }
}
