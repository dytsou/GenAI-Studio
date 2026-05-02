import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import {
  STANDARD_CHAT_MEMORY_FACTS_SCHEMA_NAME,
  extractChatMemoryFacts,
  extractContentJsonFromCompletion,
  parseFactsFromMessageBody,
  readFactMaxChars,
  readFactsMaxItems,
  readFactsMaxTotalChars,
  readChatMemorySaveStrategy,
  sanitizeAndCapFacts,
} from "./memoryChatExtract.js";

describe("readChatMemorySaveStrategy", () => {
  afterEach(() => {
    delete process.env.MEMORY_CHAT_SAVE_STRATEGY;
    delete process.env.MEMORY_CHAT_FACTS_MAX_ITEMS;
    delete process.env.MEMORY_CHAT_FACT_MAX_CHARS;
    delete process.env.MEMORY_CHAT_FACTS_MAX_TOTAL_CHARS;
  });

  it("defaults to facts", () => {
    expect(readChatMemorySaveStrategy()).toBe("facts");
  });

  it("supports verbatim rollback", () => {
    process.env.MEMORY_CHAT_SAVE_STRATEGY = " verbatim ";
    expect(readChatMemorySaveStrategy()).toBe("verbatim");
  });
});

describe("sanitizeAndCapFacts", () => {
  it("returns empty for non-array", () => {
    expect(sanitizeAndCapFacts(null, caps())).toEqual([]);
    expect(sanitizeAndCapFacts({}, caps())).toEqual([]);
  });

  it("filters sk- style secrets", () => {
    const out = sanitizeAndCapFacts(
      ["User prefers dark mode", "key sk-abcdefghijklmnopqrst"],
      caps(),
    );
    expect(out).toEqual(["User prefers dark mode"]);
  });

  it("caps item count and total chars", () => {
    const out = sanitizeAndCapFacts(
      ["aa", "bb", "cc"],
      { maxItems: 2, maxPerFactChars: 100, maxTotalChars: 4 },
    );
    expect(out.length).toBeLessThanOrEqual(2);
    expect(out.join("").length).toBeLessThanOrEqual(4);
  });

  it("truncates single fact to maxPerFactChars", () => {
    const long = "x".repeat(100);
    const out = sanitizeAndCapFacts([long], {
      maxItems: 10,
      maxPerFactChars: 20,
      maxTotalChars: 500,
    });
    expect(out[0]?.length).toBe(20);
  });
});

function caps() {
  return {
    maxItems: readFactsMaxItems(),
    maxPerFactChars: readFactMaxChars(),
    maxTotalChars: readFactsMaxTotalChars(),
  };
}

describe("parseFactsFromMessageBody", () => {
  it("parses object envelope", () => {
    expect(parseFactsFromMessageBody({ facts: ["a"] })).toEqual(["a"]);
  });

  it("parses JSON string", () => {
    expect(parseFactsFromMessageBody('{"facts":[]}')).toEqual([]);
  });

  it("rejects malformed", () => {
    expect(parseFactsFromMessageBody({})).toBeNull();
    expect(parseFactsFromMessageBody('{bad')).toBeNull();
  });
});

describe("extractContentJsonFromCompletion", () => {
  it("parses JSON string content", () => {
    const v = extractContentJsonFromCompletion({
      choices: [{ message: { content: '{"facts":["x"]}' } }],
    });
    expect(v).toEqual({ facts: ["x"] });
  });

  it("accepts object content", () => {
    const payload = { facts: ["z"] };
    const v = extractContentJsonFromCompletion({
      choices: [{ message: { content: payload } }],
    });
    expect(v).toEqual(payload);
  });
});

describe("extractChatMemoryFacts (mocked fetch)", () => {
  beforeEach(() => {
    process.env.MEMORY_CHAT_SAVE_STRATEGY = "facts";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(JSON.stringify({ not: "completion" }), { status: 200 }),
      ),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MEMORY_CHAT_SAVE_STRATEGY;
  });

  it("respects distinctive json_schema.name in request body", async () => {
    const spy = vi.mocked(fetch);
    spy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            { message: { content: '{"facts":["User prefers tea"]}' } },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      ),
    );

    const facts = await extractChatMemoryFacts({
      upstream: { auth: "t", baseUrl: "https://api.example/v1" },
      model: "gpt-test",
      lastUserText: "I drink tea daily.",
      assistantText: "Sounds good.",
    });
    expect(facts).toEqual(["User prefers tea"]);

    expect(spy).toHaveBeenCalledTimes(1);
    const [, init] = spy.mock.calls[0]!;
    const body = JSON.parse(String(init!.body));
    expect(body.response_format.json_schema.name).toBe(
      STANDARD_CHAT_MEMORY_FACTS_SCHEMA_NAME,
    );
    expect(body.stream).toBe(false);
  });

  it("returns null on empty facts after sanitize (empty array)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [{ message: { content: '{"facts":[]}' } }],
        }),
        { status: 200 },
      ),
    );

    const facts = await extractChatMemoryFacts({
      upstream: { auth: "t", baseUrl: "https://api.example/v1" },
      model: "gpt-test",
      lastUserText: "Hi",
      assistantText: "Hello",
    });
    expect(facts).toBeNull();
  });

  it("returns null when model returns Intelligent-shaped payload (misbranch)", async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  tiers: [{ id: "x" }],
                  sessionNote: "",
                }),
              },
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const facts = await extractChatMemoryFacts({
      upstream: { auth: "t", baseUrl: "https://api.example/v1" },
      model: "gpt-test",
      lastUserText: "Real user fact here",
      assistantText: "ok",
    });
    expect(facts).toBeNull();
  });

  it("skips when last user missing", async () => {
    const facts = await extractChatMemoryFacts({
      upstream: { auth: "t", baseUrl: "https://api.example/v1" },
      model: "gpt-test",
      lastUserText: "   ",
      assistantText: "Long assistant reply ".repeat(5),
    });
    expect(facts).toBeNull();
    expect(fetch).not.toHaveBeenCalled();
  });
});
