import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // @napi-rs/canvas ships a native .node addon (PDF-page rasterization for OCR) that
  // Turbopack can't statically bundle into a route's ESM chunk ("non-ecmascript
  // placeable asset"). tesseract.js spawns its own worker_thread from a file path,
  // which has the same bundling problem. Both need to stay real `require()`s resolved
  // at runtime instead of being bundled — found via a real 500 on POST
  // /api/v1/documents once OCR (src/lib/documents/ocr.ts) was wired into the upload path.
  serverExternalPackages: ["@napi-rs/canvas", "tesseract.js"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
