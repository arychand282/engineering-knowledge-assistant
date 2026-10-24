import { convertDocxToPdf } from "./convert-docx";
import { type ExtractedPage, extractPdfPages } from "./extract-pdf";
import { DOCX_MIME_TYPE } from "./metadata";

export interface ExtractDocumentOptions {
  maxPages?: number;
}

/**
 * Format-dispatching entry point shared by upload and reprocess. PDF is parsed
 * directly; DOCX is converted to PDF first (convertDocxToPdf) and then parsed by the
 * exact same PDF pipeline, so both formats end up with real, rendering-derived page
 * numbers — see convert-docx.ts for why DOCX can't just be parsed for text directly.
 */
export async function extractDocumentPages(
  buffer: Buffer,
  mimeType: string,
  options: ExtractDocumentOptions = {},
): Promise<ExtractedPage[]> {
  if (mimeType === DOCX_MIME_TYPE) {
    const pdfBuffer = await convertDocxToPdf(buffer);
    return extractPdfPages(new Uint8Array(pdfBuffer), options);
  }
  return extractPdfPages(new Uint8Array(buffer), options);
}
