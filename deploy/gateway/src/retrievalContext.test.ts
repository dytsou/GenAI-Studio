import { describe, expect, it } from "vitest";
import { extractLastUserTextForRetrieval } from "./retrievalContext.js";

describe("extractLastUserTextForRetrieval", () => {
  it("returns latest user string content", () => {
    expect(
      extractLastUserTextForRetrieval([
        { role: "user", content: "first" },
        { role: "assistant", content: "ok" },
        { role: "user", content: "second" },
      ]),
    ).toBe("second");
  });

  it("aggregates text parts from multimodal user content", () => {
    expect(
      extractLastUserTextForRetrieval([
        {
          role: "user",
          content: [
            { type: "text", text: "hello" },
            { type: "text", text: "world" },
          ],
        },
      ]),
    ).toBe("hello\nworld");
  });
});
