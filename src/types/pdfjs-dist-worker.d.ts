// pdfjs-dist does not ship a .d.ts for its worker entry point; we only need to publish
// it on globalThis (see src/lib/documents/extract-pdf.ts), not use its exports directly.
declare module "pdfjs-dist/legacy/build/pdf.worker.mjs";
