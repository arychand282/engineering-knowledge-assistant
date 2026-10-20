import { describe, expect, it } from "vitest";
import { buildOrTsQuery } from "@/lib/retrieval/build-or-tsquery";

describe("buildOrTsQuery", () => {
  it("joins words with OR so any single word can match", () => {
    expect(buildOrTsQuery("prosedur evakuasi kebakaran")).toBe("prosedur | evakuasi | kebakaran");
  });

  it("strips punctuation and lowercases", () => {
    expect(buildOrTsQuery("Bagaimana prosedur evakuasi kebakaran?")).toBe(
      "bagaimana | prosedur | evakuasi | kebakaran",
    );
  });

  it("returns an empty string for input with no usable words", () => {
    expect(buildOrTsQuery("???")).toBe("");
    expect(buildOrTsQuery("   ")).toBe("");
    expect(buildOrTsQuery("")).toBe("");
  });

  it("never produces characters that are special in tsquery syntax", () => {
    const result = buildOrTsQuery("test & injection | attempt ! (parens) :weight");
    expect(result).not.toMatch(/[&!()!:]/);
  });
});
