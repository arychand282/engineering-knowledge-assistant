import { env } from "@/lib/env";
import { convertDocxToPdf } from "./convert-docx";
import { type ExtractedPage, extractPdfPages } from "./extract-pdf";
import { DOCX_MIME_TYPE } from "./metadata";
import { runOcrOnPages } from "./ocr";

export interface ExtractDocumentOptions {
  maxPages?: number;
}

/**
 * Format-dispatching entry point shared by upload and reprocess. PDF is parsed
 * directly; DOCX is converted to PDF first (convertDocxToPdf) and then parsed by the
 * exact same PDF pipeline, so both formats end up with real, rendering-derived page
 * numbers — see convert-docx.ts for why DOCX can't just be parsed for text directly.
 *
 * When OCR_ENABLED (default true), a second pass (runOcrOnPages) attempts OCR on any
 * page classified `ocr_required` — reuses the same PDF bytes (the original for a PDF
 * upload, the LibreOffice-converted one for DOCX), so OCR works for either source.
 */
export async function extractDocumentPages(
  buffer: Buffer,
  mimeType: string,
  options: ExtractDocumentOptions = {},
): Promise<ExtractedPage[]> {
  const pdfBuffer =
    mimeType === DOCX_MIME_TYPE ? await convertDocxToPdf(buffer) : Buffer.from(buffer);

  // Separate Uint8Array instances per getDocument() call, not one shared/reused
  // reference — pdfjs's Node "fake worker" transfers (detaches) the buffer behind
  // whatever typed array it's given, so reusing the same instance across two
  // getDocument() calls leaves the second with a dead buffer (found via real testing:
  // reusing one instance threw "DOMException: Cannot transfer object of unsupported
  // type" on the second load).
  const pages = await extractPdfPages(new Uint8Array(pdfBuffer), options);
  if (!env.OCR_ENABLED) {
    return pages;
  }
  return runOcrOnPages(new Uint8Array(pdfBuffer), pages);
}
