import { describe, expect, it } from "vitest";
import {
  DOCX_MIME_TYPE,
  PDF_MIME_TYPE,
  buildStorageKey,
  computeSha256,
  hasPdfMagicBytes,
  resolveSupportedDocumentFormat,
} from "@/lib/documents/metadata";

const ZIP_BYTES = Buffer.from([0x50, 0x4b, 0x03, 0x04, 0x00, 0x00]);

describe("hasPdfMagicBytes", () => {
  it("accepts a buffer starting with %PDF-", () => {
    expect(hasPdfMagicBytes(Buffer.from("%PDF-1.4\n..."))).toBe(true);
  });

  it("rejects a buffer without the PDF magic bytes", () => {
    expect(hasPdfMagicBytes(Buffer.from("not a pdf at all"))).toBe(false);
    expect(hasPdfMagicBytes(Buffer.alloc(0))).toBe(false);
  });
});

describe("resolveSupportedDocumentFormat", () => {
  it("accepts a PDF: correct MIME type and magic bytes", () => {
    expect(resolveSupportedDocumentFormat(PDF_MIME_TYPE, Buffer.from("%PDF-1.4\n..."))).toBe("pdf");
  });

  it("accepts a DOCX: correct MIME type and ZIP magic bytes", () => {
    expect(resolveSupportedDocumentFormat(DOCX_MIME_TYPE, ZIP_BYTES)).toBe("docx");
  });

  it("rejects a PDF MIME type whose content isn't actually a PDF", () => {
    expect(resolveSupportedDocumentFormat(PDF_MIME_TYPE, Buffer.from("not a pdf"))).toBeNull();
  });

  it("rejects a DOCX MIME type whose content isn't actually a ZIP", () => {
    expect(resolveSupportedDocumentFormat(DOCX_MIME_TYPE, Buffer.from("not a zip"))).toBeNull();
  });

  it("rejects a real PDF file whose declared MIME type claims DOCX", () => {
    expect(resolveSupportedDocumentFormat(DOCX_MIME_TYPE, Buffer.from("%PDF-1.4\n..."))).toBeNull();
  });

  it("rejects an unsupported MIME type entirely", () => {
    expect(resolveSupportedDocumentFormat("text/plain", Buffer.from("plain text"))).toBeNull();
  });
});

describe("computeSha256", () => {
  it("is deterministic for the same content", () => {
    const buffer = Buffer.from("test document content");
    expect(computeSha256(buffer)).toBe(computeSha256(Buffer.from("test document content")));
  });

  it("differs for different content", () => {
    expect(computeSha256(Buffer.from("a"))).not.toBe(computeSha256(Buffer.from("b")));
  });

  it("returns a 64-character hex digest", () => {
    expect(computeSha256(Buffer.from("x"))).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("buildStorageKey", () => {
  it("generates a unique internal path, never based on user input", () => {
    const a = buildStorageKey("pdf");
    const b = buildStorageKey("pdf");

    expect(a).not.toBe(b);
    expect(a).toMatch(/^documents\/[0-9a-f-]{36}\.pdf$/);
  });

  it("uses the given extension, matching the actual stored format", () => {
    expect(buildStorageKey("docx")).toMatch(/^documents\/[0-9a-f-]{36}\.docx$/);
  });
});
