/**
 * Hand-rolled minimal single-page-object-per-page PDF builder for tests, so test
 * fixtures never depend on a binary checked-in sample file. Only supports what the
 * extraction/ingestion tests need: plain text per page, or a blank (no-text) page.
 */
export interface TestPdfPage {
  text?: string;
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildTestPdf(pages: TestPdfPage[]): Buffer {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  let nextId = 4; // 1=Catalog, 2=Pages, 3=Font, then pages + content streams

  const pageContentIds: number[] = [];
  for (let i = 0; i < pages.length; i += 1) {
    pageObjectIds.push(nextId);
    nextId += 1;
    pageContentIds.push(nextId);
    nextId += 1;
  }

  objects.push(`1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n`);
  objects.push(
    `2 0 obj\n<< /Type /Pages /Kids [${pageObjectIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>\nendobj\n`,
  );
  objects.push(`3 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n`);

  pages.forEach((page, index) => {
    const pageId = pageObjectIds[index];
    const contentId = pageContentIds[index];
    objects.push(
      `${pageId} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>\nendobj\n`,
    );

    const content = page.text ? `BT /F1 12 Tf 72 712 Td (${escapePdfText(page.text)}) Tj ET` : "";
    objects.push(
      `${contentId} 0 obj\n<< /Length ${content.length} >>\nstream\n${content}\nendstream\nendobj\n`,
    );
  });

  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const obj of objects) {
    offsets.push(Buffer.byteLength(pdf, "latin1"));
    pdf += obj;
  }

  const xrefStart = Buffer.byteLength(pdf, "latin1");
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;

  return Buffer.from(pdf, "latin1");
}
