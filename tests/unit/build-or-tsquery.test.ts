import { describe, expect, it } from "vitest";
import { buildOrTsQuery } from "@/lib/retrieval/build-or-tsquery";

describe("buildOrTsQuery", () => {
  it("joins words with OR so any single word can match", () => {
    expect(buildOrTsQuery("fire evacuation procedure")).toBe("fire | evacuation | procedure");
  });

  it("strips punctuation and lowercases", () => {
    expect(buildOrTsQuery("What is the fire evacuation procedure?")).toBe(
      "what | is | the | fire | evacuation | procedure",
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
