export interface MergedResult<T> {
  item: T;
  score: number;
  sources: Array<"vector" | "fulltext">;
}

export interface MergeRankedResultsOptions<T> {
  idOf: (item: T) => string;
  k?: number;
  limit?: number;
}

/**
 * Reciprocal Rank Fusion: combines two independently-ranked result lists (vector
 * similarity and full-text) into one ranking, without needing their scores to be on
 * comparable scales. A chunk appearing in both lists is boosted over one appearing in
 * only one — a simple, well-known way to do "hybrid search" (PLANNING.md #8 step 5).
 *
 * `rankedLists` order is fixed: `[vectorResults, fullTextResults]`.
 */
export function mergeRankedResults<T>(
  rankedLists: [vector: T[], fulltext: T[]],
  options: MergeRankedResultsOptions<T>,
): MergedResult<T>[] {
  const k = options.k ?? 60;
  const sourceNames: Array<"vector" | "fulltext"> = ["vector", "fulltext"];

  const scored = new Map<string, MergedResult<T>>();

  rankedLists.forEach((list, listIndex) => {
    list.forEach((item, rank) => {
      const id = options.idOf(item);
      const contribution = 1 / (k + rank + 1);
      const sourceName = sourceNames[listIndex];
      const existing = scored.get(id);

      if (existing) {
        existing.score += contribution;
        existing.sources.push(sourceName);
      } else {
        scored.set(id, { item, score: contribution, sources: [sourceName] });
      }
    });
  });

  const merged = Array.from(scored.values()).sort((a, b) => b.score - a.score);
  return options.limit ? merged.slice(0, options.limit) : merged;
}
