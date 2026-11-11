import { OPS } from "pdfjs-dist/legacy/build/pdf.mjs";
import type { PDFOperatorList, TextItem } from "pdfjs-dist/types/src/display/api";
import { VerbosityLevel, cMapUrl, getDocument, standardFontDataUrl } from "./_pdfjs-setup";

export class CorruptPdfError extends Error {
  constructor(cause?: unknown) {
    super("The file could not be read as a valid PDF.");
    this.name = "CorruptPdfError";
    this.cause = cause;
  }
}

export class TooManyPagesError extends Error {
  constructor(
    public readonly actualPages: number,
    public readonly maxPages: number,
  ) {
    super(`The document has ${actualPages} pages, exceeding the limit of ${maxPages} pages.`);
    this.name = "TooManyPagesError";
  }
}

export type PageExtractionStatus = "success" | "empty" | "ocr_required";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  status: PageExtractionStatus;
  /** Set by a later OCR pass (src/lib/documents/ocr.ts), never by this function itself. */
  isOcr?: boolean;
  ocrConfidence?: number;
}

const IMAGE_DRAW_OPS = new Set<number>([
  OPS.paintImageXObject,
  OPS.paintInlineImageXObject,
  OPS.paintImageXObjectRepeat,
  OPS.paintImageMaskXObject,
]);

export function pageLikelyContainsImage(operatorList: Pick<PDFOperatorList, "fnArray">): boolean {
  return operatorList.fnArray.some((op) => IMAGE_DRAW_OPS.has(op));
}

function classifyEmptyPage(hasImage: boolean): PageExtractionStatus {
  return hasImage ? "ocr_required" : "empty";
}

export interface ExtractPdfOptions {
  maxPages?: number;
}

/**
 * Extracts text per page from a PDF buffer entirely locally (pdfjs-dist, no external
 * OCR/AI service). Pages without an extractable text layer are classified as either
 * `empty` (genuinely blank) or `ocr_required` (contains an image, likely a scan) using
 * a best-effort operator-list heuristic — never run through OCR automatically.
 */
export async function extractPdfPages(
  data: Uint8Array,
  options: ExtractPdfOptions = {},
): Promise<ExtractedPage[]> {
  const loadingTask = getDocument({
    data,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    verbosity: VerbosityLevel.ERRORS,
  });

  let doc;
  try {
    doc = await loadingTask.promise;
  } catch (error) {
    throw new CorruptPdfError(error);
  }

  try {
    if (options.maxPages !== undefined && doc.numPages > options.maxPages) {
      throw new TooManyPagesError(doc.numPages, options.maxPages);
    }

    const pages: ExtractedPage[] = [];

    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber += 1) {
      const page = await doc.getPage(pageNumber);
      const textContent = await page.getTextContent();
      const text = textContent.items
        .map((item) => ("str" in item ? (item as TextItem).str : ""))
        .join(" ")
        .replace(/\s+/g, " ")
        .trim();

      if (text.length > 0) {
        pages.push({ pageNumber, text, status: "success" });
        continue;
      }

      const operatorList = await page.getOperatorList();
      pages.push({
        pageNumber,
        text: "",
        status: classifyEmptyPage(pageLikelyContainsImage(operatorList)),
      });
    }

    return pages;
  } finally {
    await loadingTask.destroy();
  }
}
