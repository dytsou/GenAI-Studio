/**
 * LiteLLM-style upstream stubs for gateway tests (compose + Postgres runtime e2e).
 * Patches **`globalThis.fetch`** — symmetrical handling for **`/chat/completions`** vs **`/embeddings`**.
 */
import { STANDARD_CHAT_MEMORY_FACTS_SCHEMA_NAME } from "../memoryChatExtract.js";

export type LitellmStubOptions = {
  /** Returned for extraction calls (`json_schema.name === standard_chat_memory_facts`). */
  extractionFacts?: string[];
  /** Main streaming chat SSE `data:` JSON payloads (+ optional `[DONE]`). */
  ssePayloads?: string[];
  /** Non-stream main chat assistant `message.content`. */
  nonStreamAssistantContent?: string;
  /** Embedding vector dimensions (deterministic filler). */
  embeddingDimensions?: number;
};

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

/** Build upstream-style SSE (`data: …\n\n`). */
export function sseStreamFromDataPayloads(payloads: string[]) {
  const enc = new TextEncoder();
  const body = payloads.map((p) => `data: ${p}\n\n`).join("");
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(body));
      c.close();
    },
  });
}

/**
 * `fetch` implementation: `/embeddings`, main `/chat/completions` (stream or JSON),
 * and facts extraction completions (named JSON schema branch).
 */
export function createLitellmUpstreamFetchMock(
  opts: LitellmStubOptions = {},
): (input: RequestInfo | URL, init?: RequestInit) => Promise<Response> {
  const extractionFacts = opts.extractionFacts ?? [
    "Runtime fact one",
    "Runtime fact two",
  ];
  const embDim = Math.min(512, Math.max(3, opts.embeddingDimensions ?? 32));

  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = requestUrl(input);

    if (url.includes("/embeddings")) {
      const embedding = Array.from(
        { length: embDim },
        (_, i) => (i + 1) * 0.001,
      );
      return new Response(JSON.stringify({ data: [{ embedding }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    if (!url.includes("/chat/completions")) {
      return new Response("unexpected url", { status: 599 });
    }

    let body: Record<string, unknown> = {};
    try {
      body = JSON.parse(
        typeof init?.body === "string" ? init.body : "{}",
      ) as Record<string, unknown>;
    } catch {
      return new Response("bad json", { status: 400 });
    }

    const rf = body.response_format as
      | { type?: string; json_schema?: { name?: string } }
      | undefined;
    const schemaName = rf?.json_schema?.name;

    if (schemaName === STANDARD_CHAT_MEMORY_FACTS_SCHEMA_NAME) {
      const facts = extractionFacts;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: { content: JSON.stringify({ facts }) },
            },
          ],
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
      );
    }

    if (body.stream === true) {
      const payloads = opts.ssePayloads ?? [
        JSON.stringify({
          choices: [{ delta: { content: "Short ack." } }],
        }),
        "[DONE]",
      ];
      return new Response(sseStreamFromDataPayloads(payloads), {
        status: 200,
        headers: { "Content-Type": "text/event-stream" },
      });
    }

    return new Response(
      JSON.stringify({
        choices: [
          {
            message: {
              content: opts.nonStreamAssistantContent ?? "Json mode reply.",
            },
          },
        ],
      }),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  };
}
