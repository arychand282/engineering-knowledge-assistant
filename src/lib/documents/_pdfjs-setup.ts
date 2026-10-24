import path from "node:path";
import { getDocument, VerbosityLevel } from "pdfjs-dist/legacy/build/pdf.mjs";
import * as pdfjsWorker from "pdfjs-dist/legacy/build/pdf.worker.mjs";

export { getDocument, VerbosityLevel };

// pdfjs-dist ships its own standard font metrics and CMaps locally; pointing at them
// explicitly keeps text-position decoding fully offline (no network fetch attempted).
// A plain node_modules join (not createRequire/import.meta.resolve) because Next's
// build-time "collect page data" step runs this module in a context where
// import.meta.url isn't a usable file path, breaking require.resolve.
const pdfjsPackageDir = path.join(process.cwd(), "node_modules", "pdfjs-dist");
export const standardFontDataUrl = path.join(pdfjsPackageDir, "standard_fonts") + path.sep;
export const cMapUrl = path.join(pdfjsPackageDir, "cmaps") + path.sep;

// Node has no Worker threads story pdf.js can bundle-discover dynamically, and under
// Turbopack its default dynamic `import(workerSrc)` fallback ("fake worker") fails to
// resolve at all ("Setting up fake worker failed"). Statically importing the worker
// module and publishing it on globalThis is pdf.js's documented escape hatch — it skips
// the dynamic import entirely and runs the worker's message handler on the main thread.
// Shared by every pdfjs caller (extract-pdf.ts, ocr.ts) so this side effect runs once,
// explicitly, rather than relying on import order between them.
(globalThis as { pdfjsWorker?: typeof pdfjsWorker }).pdfjsWorker = pdfjsWorker;
