export { CorruptPdfError, TooManyPagesError } from "@/lib/documents/extract-pdf";
export { CorruptDocxError, LibreOfficeUnavailableError } from "@/lib/documents/convert-docx";

export class InvalidFileError extends Error {
  constructor(message = "Hanya file PDF atau DOCX yang didukung.") {
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

export class UnknownRoleError extends Error {
  constructor(public readonly roleName: string) {
    super(`Role tidak dikenal: ${roleName}`);
    this.name = "UnknownRoleError";
  }
}

export class DuplicateAccessGrantError extends Error {
  constructor(roleName: string) {
    super(`Role "${roleName}" sudah memiliki akses ke dokumen ini.`);
    this.name = "DuplicateAccessGrantError";
  }
}

export class AccessGrantNotFoundError extends Error {
  constructor(accessId: string) {
    super(`Akses ${accessId} tidak ditemukan pada dokumen ini.`);
    this.name = "AccessGrantNotFoundError";
  }
}
