/**
 * `plainto_tsquery` ANDs every word together, so a natural-language question like
 * "Bagaimana prosedur evakuasi kebakaran?" never matches content that doesn't also
 * contain the word "bagaimana" — in practice this makes full-text search fail on almost
 * any real question. Build an OR query instead: match chunks containing ANY of the
 * question's words, ranked by how many matched (via ts_rank).
 *
 * Returns a `to_tsquery`-compatible string, or "" if the input has no usable words
 * (callers must treat that as "no match" — `to_tsquery('simple', '')` throws).
 */
export function buildOrTsQuery(query: string): string {
  const words = query
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((word) => word.length > 0);

  if (words.length === 0) {
    return "";
  }

  // Words are already stripped to letters/digits only, so none can contain tsquery
  // operator syntax (& | ! ( ) :) — safe to join bare, no quoting needed.
  return words.join(" | ");
}
