export { CorruptPdfError, TooManyPagesError } from "@/lib/documents/extract-pdf";
export { CorruptDocxError, LibreOfficeUnavailableError } from "@/lib/documents/convert-docx";

export class InvalidFileError extends Error {
  constructor(message = "Only PDF or DOCX files are supported.") {
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
    super("A document with identical content has already been uploaded.");
    this.name = "DuplicateDocumentError";
  }
}

export class DocumentNotFoundError extends Error {
  constructor(documentId: string) {
    super(`Document ${documentId} not found.`);
    this.name = "DocumentNotFoundError";
  }
}

export class SelfSupersedeError extends Error {
  constructor() {
    super("A document cannot be its own supersedesDocumentId.");
    this.name = "SelfSupersedeError";
  }
}

export class PageNotFoundError extends Error {
  constructor(documentId: string, pageNumber: number) {
    super(`Page ${pageNumber} of document ${documentId} not found.`);
    this.name = "PageNotFoundError";
  }
}

export class UnknownRoleError extends Error {
  constructor(public readonly roleName: string) {
    super(`Unknown role: ${roleName}`);
    this.name = "UnknownRoleError";
  }
}

export class DuplicateAccessGrantError extends Error {
  constructor(roleName: string) {
    super(`Role "${roleName}" already has access to this document.`);
    this.name = "DuplicateAccessGrantError";
  }
}

export class AccessGrantNotFoundError extends Error {
  constructor(accessId: string) {
    super(`Access grant ${accessId} not found on this document.`);
    this.name = "AccessGrantNotFoundError";
  }
}
