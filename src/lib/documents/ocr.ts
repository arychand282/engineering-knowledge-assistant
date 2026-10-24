import { createCanvas } from "@napi-rs/canvas";
import { type Worker as TesseractWorker, createWorker } from "tesseract.js";
import type { PDFPageProxy } from "pdfjs-dist/types/src/display/api";
import { env } from "@/lib/env";
import { VerbosityLevel, cMapUrl, getDocument, standardFontDataUrl } from "./_pdfjs-setup";
import type { ExtractedPage } from "./extract-pdf";

export class OcrUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      `Mesin OCR lokal tidak dapat dijalankan (tesseract.js, bahasa "${env.OCR_LANGUAGES}"). ` +
        `Pastikan data bahasa sudah di-pull ke OCR_LANG_DATA_DIR ("${env.OCR_LANG_DATA_DIR}") ` +
        "lewat `npm run ocr:pull-language-data` — lihat README.",
    );
    this.name = "OcrUnavailableError";
    this.cause = cause;
  }
}

// Higher than the PDF's native point-based coordinate scale (1.0) because scanned-page
// source images are often low-resolution to begin with — upscaling before OCR measurably
// improves recognition on small text. Not benchmarked against a real dataset; a
// reasonable starting value.
const OCR_RENDER_SCALE = 2;

/**
 * One tesseract.js worker, meant to be reused across every ocr_required page of a
 * single document (worker startup is the expensive part, not recognition itself) —
 * caller must terminate() it when done. langPath points at a LOCAL directory only:
 * tesseract.js's own default behavior (no langPath given) is to fetch language data
 * from a CDN at first use, which this project never does implicitly for anything
 * (PLANNING.md: no external AI/processing service without an explicit, documented
 * opt-in — see "Mode Chat Eksternal" for the one existing exception, which this isn't).
 * cacheMethod 'none' skips tesseract's own filesystem cache lookup/write entirely, so
 * behavior is fully determined by what's actually in OCR_LANG_DATA_DIR.
 *
 * Manually wrapped in a Promise rather than a plain try/await: found via real testing
 * that a `loadLanguage` failure (e.g. missing/unreadable language data file) does NOT
 * reject createWorker()'s own returned promise — tesseract.js's internal message
 * handler only does that for its 'load' (core engine) action, not 'loadLanguage'. Left
 * at tesseract.js's default, a `loadLanguage` failure instead throws as an UNCAUGHT
 * exception from inside its worker-thread message handler (no `errorHandler` given),
 * crashing the process instead of rejecting here. Providing `errorHandler` captures
 * that error and routes it through this same promise instead.
 */
export async function createOcrWorker(): Promise<TesseractWorker> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const settleReject = (error: unknown) => {
      if (settled) return;
      settled = true;
      reject(new OcrUnavailableError(error));
    };

    createWorker(env.OCR_LANGUAGES, undefined, {
      langPath: env.OCR_LANG_DATA_DIR,
      gzip: true,
      cacheMethod: "none",
      logger: () => {},
      errorHandler: settleReject,
    })
      .then((worker) => {
        if (settled) return;
        settled = true;
        resolve(worker);
      })
      .catch(settleReject);
  });
}

export interface OcrPageResult {
  text: string;
  confidence: number;
}

/** Renders one PDF page to an image and runs OCR on it. Caller owns the worker's lifecycle. */
export async function ocrPage(worker: TesseractWorker, page: PDFPageProxy): Promise<OcrPageResult> {
  const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));

  await page.render({
    // @napi-rs/canvas's Canvas is API-compatible with the DOM HTMLCanvasElement pdfjs
    // expects here — not the same class, hence the cast.
    canvas: canvas as unknown as HTMLCanvasElement,
    viewport,
  }).promise;

  const imageBuffer = canvas.toBuffer("image/png");
  const { data } = await worker.recognize(imageBuffer);

  return { text: data.text.trim(), confidence: data.confidence };
}

/**
 * Second pass over already-extracted pages: re-opens the PDF (cheap relative to OCR
 * itself) and runs OCR only on pages classified `ocr_required` (image present, no text
 * layer — extract-pdf.ts's heuristic for "probably a scan"). A page's status becomes
 * `success` with `isOcr: true` only when OCR clears OCR_MIN_CONFIDENCE; below that, or
 * on any engine failure, the page is left exactly as `extractPdfPages` originally
 * classified it (never persists low-confidence text as if it were reliable, and never
 * fails the whole extraction over an OCR problem — this is a quality improvement on
 * pages that were otherwise completely unusable, not a hard dependency).
 */
export async function runOcrOnPages(
  pdfData: Uint8Array,
  pages: ExtractedPage[],
): Promise<ExtractedPage[]> {
  const needsOcr = pages.filter((page) => page.status === "ocr_required");
  if (needsOcr.length === 0) {
    return pages;
  }

  let worker: TesseractWorker;
  try {
    worker = await createOcrWorker();
  } catch (error) {
    console.error("[ocr] Tidak dapat memulai worker OCR, halaman tetap ocr_required:", error);
    return pages;
  }

  const loadingTask = getDocument({
    data: pdfData,
    standardFontDataUrl,
    cMapUrl,
    cMapPacked: true,
    verbosity: VerbosityLevel.ERRORS,
  });
  try {
    const doc = await loadingTask.promise;
    const results = new Map<number, ExtractedPage>();

    for (const page of needsOcr) {
      try {
        const pdfPage = await doc.getPage(page.pageNumber);
        const { text, confidence } = await ocrPage(worker, pdfPage);
        if (text.length > 0 && confidence >= env.OCR_MIN_CONFIDENCE) {
          results.set(page.pageNumber, {
            ...page,
            text,
            status: "success",
            isOcr: true,
            ocrConfidence: confidence,
          });
        } else {
          console.warn(
            `[ocr] Halaman ${page.pageNumber}: confidence ${confidence.toFixed(1)} di bawah ` +
              `OCR_MIN_CONFIDENCE (${env.OCR_MIN_CONFIDENCE}) atau teks kosong — tetap ocr_required.`,
          );
        }
      } catch (error) {
        console.error(`[ocr] Gagal OCR halaman ${page.pageNumber}, tetap ocr_required:`, error);
      }
    }

    return pages.map((page) => results.get(page.pageNumber) ?? page);
  } catch (error) {
    console.error(
      "[ocr] Gagal membuka ulang PDF untuk OCR, semua halaman tetap ocr_required:",
      error,
    );
    return pages;
  } finally {
    await loadingTask.destroy();
    await worker.terminate();
  }
}
