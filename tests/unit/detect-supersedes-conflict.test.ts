import { describe, expect, it } from "vitest";
import { findSupersedesConflictPairs } from "@/lib/retrieval/detect-supersedes-conflict";

describe("findSupersedesConflictPairs", () => {
  it("flags a pair when both the newer and the superseded document are present", () => {
    const pairs = findSupersedesConflictPairs([
      { id: "new-doc", supersedesDocumentId: "old-doc" },
      { id: "old-doc", supersedesDocumentId: null },
    ]);

    expect(pairs).toEqual([["new-doc", "old-doc"]]);
  });

  it("returns nothing when the superseded document is not also present", () => {
    const pairs = findSupersedesConflictPairs([
      { id: "new-doc", supersedesDocumentId: "old-doc-not-in-context" },
      { id: "unrelated-doc", supersedesDocumentId: null },
    ]);

    expect(pairs).toEqual([]);
  });

  it("returns nothing for documents with no supersedes relationship at all", () => {
    expect(
      findSupersedesConflictPairs([
        { id: "a", supersedesDocumentId: null },
        { id: "b", supersedesDocumentId: null },
      ]),
    ).toEqual([]);
  });
});
