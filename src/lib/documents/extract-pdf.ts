import path from "node:path";
import { getDocument, OPS, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";
import type { PDFOperatorList, TextItem } from "pdfjs-dist/types/src/display/api";

// pdfjs-dist ships its own standard font metrics and CMaps locally; pointing at them
// explicitly keeps text-position decoding fully offline (no network fetch attempted).
// A plain node_modules join (not createRequire/import.meta.resolve) because Next's
// build-time "collect page data" step runs this module in a context where
// import.meta.url isn't a usable file path, breaking require.resolve.
const pdfjsPackageDir = path.join(process.cwd(), "node_modules", "pdfjs-dist");
const standardFontDataUrl = path.join(pdfjsPackageDir, "standard_fonts") + path.sep;
const cMapUrl = path.join(pdfjsPackageDir, "cmaps") + path.sep;

// Node has no Worker threads story pdf.js can bundle-discover dynamically, and under
// Turbopack its default dynamic `import(workerSrc)` fallback ("fake worker") fails to
// resolve at all ("Setting up fake worker failed"). Statically importing the worker
// module and publishing it on globalThis is pdf.js's documented escape hatch — it skips
// the dynamic import entirely and runs the worker's message handler on the main thread.
(globalThis as { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;

export class CorruptPdfError extends Error {
  constructor(cause?: unknown) {
    super("File tidak dapat dibaca sebagai PDF yang valid.");
    this.name = "CorruptPdfError";
    this.cause = cause;
  }
}

export class TooManyPagesError extends Error {
  constructor(
    public readonly actualPages: number,
    public readonly maxPages: number,
  ) {
    super(`Dokumen memiliki ${actualPages} halaman, melebihi batas ${maxPages} halaman.`);
    this.name = "TooManyPagesError";
  }
}

export type PageExtractionStatus = "success" | "empty" | "ocr_required";

export interface ExtractedPage {
  pageNumber: number;
  text: string;
  status: PageExtractionStatus;
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
