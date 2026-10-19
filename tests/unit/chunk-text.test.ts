import { describe, expect, it } from "vitest";
import { chunkPages } from "@/lib/documents/chunk-text";

describe("chunkPages", () => {
  it("returns no chunks for empty input", () => {
    expect(chunkPages([])).toEqual([]);
    expect(chunkPages([{ pageNumber: 1, text: "" }])).toEqual([]);
  });

  it("keeps a short single-page document as one chunk", () => {
    const chunks = chunkPages([{ pageNumber: 1, text: "satu dua tiga empat lima" }], {
      chunkSizeWords: 700,
      overlapWords: 100,
    });

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toMatchObject({ pageStart: 1, pageEnd: 1, chunkIndex: 0, tokenCount: 5 });
    expect(chunks[0].content).toBe("satu dua tiga empat lima");
  });

  it("splits into overlapping windows and tracks page_start/page_end across a page boundary", () => {
    const page1Words = Array.from({ length: 6 }, (_, i) => `p1w${i}`).join(" ");
    const page2Words = Array.from({ length: 6 }, (_, i) => `p2w${i}`).join(" ");

    const chunks = chunkPages(
      [
        { pageNumber: 1, text: page1Words },
        { pageNumber: 2, text: page2Words },
      ],
      { chunkSizeWords: 5, overlapWords: 2 },
    );

    // 12 words total, window 5, stride 3 -> starts at 0,3,6,9 -> 4 chunks
    expect(chunks).toHaveLength(4);
    expect(chunks.map((c) => c.chunkIndex)).toEqual([0, 1, 2, 3]);

    // First chunk is entirely on page 1.
    expect(chunks[0]).toMatchObject({ pageStart: 1, pageEnd: 1 });
    // A chunk that straddles the boundary (words 6-10, i.e. index 6..10) spans both pages.
    const straddling = chunks.find((c) => c.pageStart === 1 && c.pageEnd === 2);
    expect(straddling).toBeDefined();
    // Last chunk is entirely on page 2.
    expect(chunks.at(-1)).toMatchObject({ pageStart: 2, pageEnd: 2 });
  });

  it("skips pages with no text (caller is expected to filter, but defends anyway)", () => {
    const chunks = chunkPages(
      [
        { pageNumber: 1, text: "halaman satu punya isi" },
        { pageNumber: 2, text: "" },
        { pageNumber: 3, text: "halaman tiga juga punya isi" },
      ],
      { chunkSizeWords: 700, overlapWords: 100 },
    );

    expect(chunks).toHaveLength(1);
    expect(chunks[0].pageStart).toBe(1);
    expect(chunks[0].pageEnd).toBe(3);
    expect(chunks[0].content).not.toContain("  ");
  });

  it("rejects an invalid overlap/size configuration", () => {
    expect(() =>
      chunkPages([{ pageNumber: 1, text: "a b c" }], { chunkSizeWords: 10, overlapWords: 10 }),
    ).toThrow();
    expect(() =>
      chunkPages([{ pageNumber: 1, text: "a b c" }], { chunkSizeWords: 0, overlapWords: 0 }),
    ).toThrow();
  });
});
