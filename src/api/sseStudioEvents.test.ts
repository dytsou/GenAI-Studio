import { describe, it, expect } from "vitest";
import { eventsFromSseDataJson } from "./sseStudioEvents";

describe("eventsFromSseDataJson", () => {
  it("emits content from choices delta", () => {
    const ev = eventsFromSseDataJson(
      '{"choices":[{"delta":{"content":"Hi"}}],"usage":{"prompt_tokens":1}}',
    );
    expect(ev.some((e) => e.type === "content" && e.text === "Hi")).toBe(true);
    expect(ev.some((e) => e.type === "usage")).toBe(true);
  });

  it("parses studio meta envelope", () => {
    const ev = eventsFromSseDataJson(
      '{"studio":{"v":1,"kind":"meta","chosen_model":"gpt-4o","memory_tokens_used":42}}',
    );
    expect(ev).toEqual([
      {
        type: "studio_meta",
        meta: expect.objectContaining({
          kind: "meta",
          chosen_model: "gpt-4o",
          memory_tokens_used: 42,
        }),
      },
    ]);
  });

  it("parses studio tool envelope", () => {
    const ev = eventsFromSseDataJson(
      '{"studio":{"kind":"tool","id":"t1","name":"echo","phase":"start"}}',
    );
    expect(ev).toEqual([
      {
        type: "studio_tool",
        tool: expect.objectContaining({
          kind: "tool",
          name: "echo",
          phase: "start",
        }),
      },
    ]);
  });

  it("parses studio memory_injection envelope", () => {
    const ev = eventsFromSseDataJson(
      '{"studio":{"v":1,"kind":"memory_injection","mode":"manual","chunk_ids_injected":["c1","c2"],"memory_tokens_estimate":12}}',
    );
    expect(ev).toEqual([
      {
        type: "studio_memory_injection",
        memory: expect.objectContaining({
          kind: "memory_injection",
          mode: "manual",
          chunk_ids_injected: ["c1", "c2"],
          memory_tokens_estimate: 12,
        }),
      },
    ]);
  });
});
