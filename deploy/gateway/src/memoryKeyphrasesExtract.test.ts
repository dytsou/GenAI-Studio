import { describe, expect, it } from "vitest";

import { sanitizeAndCapKeyphrases } from "./memoryKeyphrasesExtract.js";

describe("sanitizeAndCapKeyphrases", () => {
  it("drops empties, dedupes, caps length and count", () => {
    const out = sanitizeAndCapKeyphrases(
      [
        "  project roadmap  ",
        "",
        "project roadmap",
        "a".repeat(200),
        "budget",
        "team staffing",
      ],
      { maxItems: 3, maxPerItemChars: 10, maxTotalChars: 999 },
    );
    expect(out).toEqual(["project ro", "aaaaaaaaaa", "budget"]);
  });

  it("drops sentence-like outputs and secret-ish fragments", () => {
    const out = sanitizeAndCapKeyphrases(
      ["This is a full sentence.", "sk-abcdef1234567890", "quarterly planning"],
      { maxItems: 12, maxPerItemChars: 32, maxTotalChars: 999 },
    );
    expect(out).toEqual(["quarterly planning"]);
  });
});
