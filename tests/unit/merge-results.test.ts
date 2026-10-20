import { describe, expect, it } from "vitest";
import { mergeRankedResults } from "@/lib/retrieval/merge-results";

interface Item {
  id: string;
}

describe("mergeRankedResults", () => {
  it("boosts an item that appears in both lists over one appearing in only one", () => {
    const vector: Item[] = [{ id: "a" }, { id: "b" }];
    const fulltext: Item[] = [{ id: "b" }, { id: "c" }];

    const merged = mergeRankedResults([vector, fulltext], { idOf: (item) => item.id });

    expect(merged[0].item.id).toBe("b");
    expect(merged[0].sources).toEqual(expect.arrayContaining(["vector", "fulltext"]));
    expect(merged.map((m) => m.item.id)).toEqual(["b", "a", "c"]);
  });

  it("tags single-source items with only that source", () => {
    const merged = mergeRankedResults([[{ id: "a" }], []], { idOf: (item) => item.id });

    expect(merged).toHaveLength(1);
    expect(merged[0].sources).toEqual(["vector"]);
  });

  it("respects the limit option", () => {
    const vector: Item[] = [{ id: "a" }, { id: "b" }, { id: "c" }];

    const merged = mergeRankedResults([vector, []], { idOf: (item) => item.id, limit: 2 });

    expect(merged).toHaveLength(2);
  });

  it("returns an empty list when both inputs are empty", () => {
    expect(mergeRankedResults([[], []], { idOf: (item: Item) => item.id })).toEqual([]);
  });
});
