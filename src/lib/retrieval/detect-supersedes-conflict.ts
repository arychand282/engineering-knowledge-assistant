export interface SupersedesCheckDocument {
  id: string;
  supersedesDocumentId: string | null;
}

/**
 * Deterministic conflict signal: if a document AND the document it supersedes both
 * show up as retrieval context together, that's a document-hierarchy ambiguity the
 * backend can detect for certain — not a judgment call left to the LLM
 * (PLANNING.md: "Jangan menganggap revisi dengan nomor tertinggi otomatis mengalahkan
 * dokumen lain"). Returns [newerDocumentId, olderSupersededDocumentId] pairs.
 */
export function findSupersedesConflictPairs(
  docs: SupersedesCheckDocument[],
): Array<[string, string]> {
  const idsPresent = new Set(docs.map((doc) => doc.id));
  const pairs: Array<[string, string]> = [];

  for (const doc of docs) {
    if (doc.supersedesDocumentId && idsPresent.has(doc.supersedesDocumentId)) {
      pairs.push([doc.id, doc.supersedesDocumentId]);
    }
  }

  return pairs;
}
