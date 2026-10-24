/**
 * Downloads tesseract.js language data files into OCR_LANG_DATA_DIR (default
 * "ocr-lang-data") so OCR runs fully offline at request time — tesseract.js's own
 * default behavior is to fetch this data from a CDN on first use, which this project
 * doesn't do implicitly for anything (see src/lib/documents/ocr.ts). This is an
 * explicit, one-time pull step, same pattern as `npm run ai:pull-embedding-model` for
 * Ollama models: network access only here, never during actual document processing.
 *
 * Usage: tsx scripts/pull-ocr-language-data.ts [lang...]
 * (defaults to OCR_LANGUAGES, e.g. "ind+eng" -> ind, eng)
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { env } from "@/lib/env";

// Same source tesseract.js itself defaults to for the LSTM-only ("best_int") model —
// see node_modules/tesseract.js/src/worker-script/index.js. Pulling from the identical
// source keeps this a one-time, explicit version of what the library would otherwise
// fetch silently per-request.
const TESSDATA_BASE_URL = "https://cdn.jsdelivr.net/npm/@tesseract.js-data";
const TESSDATA_VARIANT = "4.0.0_best_int";

async function pullLanguage(lang: string): Promise<void> {
  const url = `${TESSDATA_BASE_URL}/${lang}/${TESSDATA_VARIANT}/${lang}.traineddata.gz`;
  console.log(`Downloading ${lang}.traineddata.gz from ${url}...`);

  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Gagal mengunduh data bahasa "${lang}": HTTP ${response.status} (${url})`);
  }

  const buffer = Buffer.from(await response.arrayBuffer());
  const destPath = path.join(env.OCR_LANG_DATA_DIR, `${lang}.traineddata.gz`);
  await writeFile(destPath, buffer);
  console.log(`Saved ${destPath} (${(buffer.byteLength / 1024 / 1024).toFixed(1)} MB)`);
}

async function main() {
  const langs = process.argv.slice(2);
  const targets = langs.length > 0 ? langs : env.OCR_LANGUAGES.split("+");

  await mkdir(env.OCR_LANG_DATA_DIR, { recursive: true });
  for (const lang of targets) {
    await pullLanguage(lang);
  }
  console.log(
    `Done. OCR_LANG_DATA_DIR=${env.OCR_LANG_DATA_DIR}, OCR_LANGUAGES=${targets.join("+")}`,
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
