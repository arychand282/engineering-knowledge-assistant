/**
 * Minimal multi-line PDF builder for eval fixture documents (Task 7). Same approach as
 * tests/helpers/build-test-pdf.ts (hand-rolled PDF, no external dependency) but supports
 * multiple text lines per page so eval documents can contain realistic paragraphs.
 */
export interface EvalPdfPage {
  lines: string[];
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

export function buildPdf(pages: EvalPdfPage[]): Buffer {
  const objects: string[] = [];
  const pageObjectIds: number[] = [];
  const pageContentIds: number[] = [];
  let nextId = 4; // 1=Catalog, 2=Pages, 3=Font, then pages + content streams

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

    const lineHeight = 16;
    const startY = 740;
    const streamParts = ["BT", "/F1 11 Tf", `72 ${startY} Td`];
    page.lines.forEach((line, lineIndex) => {
      if (lineIndex > 0) {
        streamParts.push(`0 -${lineHeight} Td`);
      }
      streamParts.push(`(${escapePdfText(line)}) Tj`);
    });
    streamParts.push("ET");
    const content = streamParts.join("\n");

    objects.push(
      `${contentId} 0 obj\n<< /Length ${Buffer.byteLength(content, "latin1")} >>\nstream\n${content}\nendstream\nendobj\n`,
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
