import { describe, expect, it } from "vitest";
import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import {
  CorruptPdfError,
  TooManyPagesError,
  extractPdfPages,
  pageLikelyContainsImage,
} from "@/lib/documents/extract-pdf";
import { buildTestPdf } from "../helpers/build-test-pdf";

describe("extractPdfPages", () => {
  it("extracts text per page for a normal text PDF", async () => {
    const pdf = buildTestPdf([
      { text: "Halaman satu berisi teks uji." },
      { text: "Halaman dua berisi teks lain." },
    ]);

    const pages = await extractPdfPages(new Uint8Array(pdf));

    expect(pages).toHaveLength(2);
    expect(pages[0]).toMatchObject({ pageNumber: 1, status: "success" });
    expect(pages[0].text).toContain("Halaman satu berisi teks uji.");
    expect(pages[1]).toMatchObject({ pageNumber: 2, status: "success" });
    expect(pages[1].text).toContain("Halaman dua berisi teks lain.");
  });

  it("marks a page with no extractable text and no image as empty", async () => {
    const pdf = buildTestPdf([{ text: "Halaman dengan teks." }, { text: "" }]);

    const pages = await extractPdfPages(new Uint8Array(pdf));

    expect(pages[1]).toMatchObject({ pageNumber: 2, status: "empty", text: "" });
  });

  it("rejects a corrupted / non-parseable file", async () => {
    const corrupted = new TextEncoder().encode("%PDF-1.4\nthis is not a real pdf body at all");

    await expect(extractPdfPages(corrupted)).rejects.toBeInstanceOf(CorruptPdfError);
  });

  it("rejects a document exceeding the configured max page count", async () => {
    const pdf = buildTestPdf([{ text: "satu" }, { text: "dua" }, { text: "tiga" }]);

    await expect(extractPdfPages(new Uint8Array(pdf), { maxPages: 2 })).rejects.toBeInstanceOf(
      TooManyPagesError,
    );
  });
});

describe("pageLikelyContainsImage", () => {
  it("returns true when the operator list draws an image", () => {
    expect(pageLikelyContainsImage({ fnArray: [OPS.paintImageXObject] })).toBe(true);
  });

  it("returns false for a plain text-drawing operator list", () => {
    expect(pageLikelyContainsImage({ fnArray: [OPS.showText] })).toBe(false);
  });
});
