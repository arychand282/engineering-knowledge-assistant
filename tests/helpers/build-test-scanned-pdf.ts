import { createCanvas } from "@napi-rs/canvas";

/**
 * Builds a minimal single-page PDF containing ONLY a raster image (a JPEG XObject) —
 * no text layer at all, simulating a scanned page. Renders the given text onto a canvas
 * with @napi-rs/canvas (already a project dependency for OCR rendering) and embeds the
 * JPEG bytes directly via DCTDecode, hand-rolled the same way build-test-pdf.ts builds
 * a text PDF — no external PDF-authoring library dependency.
 */
export function buildTestScannedPdf(text: string): Buffer {
  const width = 900;
  const height = 300;
  const canvas = createCanvas(width, height);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "black";
  ctx.font = "40px sans-serif";
  ctx.fillText(text, 20, 150);

  const jpeg = canvas.toBuffer("image/jpeg", 95);

  const objects: string[] = [];
  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(`2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n`);
  objects.push(
    `3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] ` +
      `/Resources << /XObject << /Im1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n`,
  );
  // Image XObject: raw JPEG bytes via DCTDecode — no PDF-side re-encoding needed.
  const imageHeader =
    `4 0 obj\n<< /Type /XObject /Subtype /Image /Width ${width} /Height ${height} ` +
    `/ColorSpace /DeviceRGB /BitsPerComponent 8 /Filter /DCTDecode /Length ${jpeg.length} >>\nstream\n`;
  const imageFooter = `\nendstream\nendobj\n`;

  // Content stream: draw the image to fill the full page (same unit square -> MediaBox mapping).
  const content = `q ${width} 0 0 ${height} 0 0 cm /Im1 Do Q`;
  objects.push(`5 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`);

  // Objects are assembled as a mix of text and binary (the image stream) — build as
  // Buffers throughout so byte offsets (needed for xref) stay correct regardless of
  // encoding, unlike the pure-text build-test-pdf.ts.
  const head = Buffer.from("%PDF-1.4\n", "latin1");
  const obj1 = Buffer.from(objects[0], "latin1");
  const obj2 = Buffer.from(objects[1], "latin1");
  const obj3 = Buffer.from(objects[2], "latin1");
  const obj4 = Buffer.concat([
    Buffer.from(imageHeader, "latin1"),
    jpeg,
    Buffer.from(imageFooter, "latin1"),
  ]);
  const obj5 = Buffer.from(objects[3], "latin1");

  const parts = [obj1, obj2, obj3, obj4, obj5];
  let offset = head.length;
  const offsets: number[] = [];
  for (const part of parts) {
    offsets.push(offset);
    offset += part.length;
  }

  const xrefStart = offset;
  let xref = `xref\n0 ${parts.length + 1}\n0000000000 65535 f \n`;
  for (const o of offsets) {
    xref += `${String(o).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${parts.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.concat([head, ...parts, Buffer.from(xref, "latin1")]);
}
