/** Facts extraction for standard `/v1/chat` → `memory_chunks` (strategy=facts). */

export const STANDARD_CHAT_MEMORY_FACTS_SCHEMA_NAME =
  "standard_chat_memory_facts" as const;

export type ChatMemorySaveStrategy = "verbatim" | "facts";

/** Default `facts` — semantic-worthy chunks; `verbatim` preserves legacy whole-reply ingest. */
export function readChatMemorySaveStrategy(): ChatMemorySaveStrategy {
  const raw = process.env.MEMORY_CHAT_SAVE_STRATEGY?.trim().toLowerCase();
  if (raw === "verbatim") return "verbatim";
  return "facts";
}

export function readFactsMaxItems(): number {
  const n = Number(process.env.MEMORY_CHAT_FACTS_MAX_ITEMS ?? "10");
  if (!Number.isFinite(n) || n < 1) return 10;
  return Math.min(32, Math.floor(n));
}

export function readFactMaxChars(): number {
  const n = Number(process.env.MEMORY_CHAT_FACT_MAX_CHARS ?? "2000");
  if (!Number.isFinite(n) || n < 32) return 2000;
  return Math.min(8000, Math.floor(n));
}

export function readFactsMaxTotalChars(): number {
  const n = Number(
    process.env.MEMORY_CHAT_FACTS_MAX_TOTAL_CHARS ?? "32000",
  );
  if (!Number.isFinite(n) || n < 64) return 32000;
  return Math.min(128_000, Math.floor(n));
}

function looksLikeApiSecretLine(s: string): boolean {
  return /sk-[a-zA-Z0-9_-]{8,}/i.test(s);
}

/** Normalize model id for extraction (optional override). */
export function resolveExtractionModel(fallbackFromRequest: string): string {
  const env = process.env.MEMORY_EXTRACTION_MODEL?.trim();
  if (env) return env;
  const v = fallbackFromRequest?.trim();
  return v || "gpt-4o-mini";
}

export type ParsedFactsEnvelope = {
  facts: string[];
};

/**
 * Drops empty / oversize fragments, leaks-ish patterns, enforces counts and global char budget.
 * Returns only strings safe to persist (may be empty).
 */
export function sanitizeAndCapFacts(
  rawFacts: unknown,
  caps: { maxItems: number; maxPerFactChars: number; maxTotalChars: number },
): string[] {
  if (!Array.isArray(rawFacts)) return [];

  const out: string[] = [];
  let totalChars = 0;
  for (const item of rawFacts) {
    if (typeof item !== "string") continue;
    let s = item.replace(/\u0000/g, "").trim();
    if (!s) continue;
    if (looksLikeApiSecretLine(s)) continue;
    if (s.length > caps.maxPerFactChars) s = s.slice(0, caps.maxPerFactChars);
    if (out.length >= caps.maxItems) break;
    if (totalChars + s.length > caps.maxTotalChars) break;
    out.push(s);
    totalChars += s.length;
  }
  return out;
}

export function parseFactsFromMessageBody(json: unknown): string[] | null {
  if (json == null) return null;
  if (typeof json === "string") {
    try {
      return parseFactsFromMessageBody(JSON.parse(json) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof json !== "object") return null;
  const facts = (json as ParsedFactsEnvelope).facts;
  if (!Array.isArray(facts)) return null;
  return facts;
}

function logSkipped(reason: string): void {
  console.warn("[memory-chat] extract_skipped_reason=", reason);
}

export async function extractChatMemoryFacts(params: {
  upstream: { auth: string; baseUrl: string };
  model: string;
  lastUserText: string;
  assistantText: string;
}): Promise<string[] | null> {
  const caps = {
    maxItems: readFactsMaxItems(),
    maxPerFactChars: readFactMaxChars(),
    maxTotalChars: readFactsMaxTotalChars(),
  };

  const userT = params.lastUserText.trim();
  if (!userT) {
    logSkipped("empty_last_user");
    return null;
  }

  const assistantSnippet = params.assistantText.slice(0, 12_000);
  const model = resolveExtractionModel(params.model);

  const userMsg = [
    "Last user message:",
    userT.slice(0, 8000),
    "",
    "Assistant reply:",
    assistantSnippet || "(empty)",
  ].join("\n");

  const body = {
    model,
    temperature: 0.1,
    max_tokens: 800,
    messages: [
      {
        role: "system" as const,
        content:
          "You classify what is worth storing in long-term searchable memory.\n" +
          "Extract 0–K short standalone facts or durable preferences ONLY if clearly stated by the user or strongly implied answers worth recalling.\n" +
          "Skip greetings, chit-chat, filler, disclaimers, and content with no retrieval value.\n" +
          "Each fact must be ONE concise sentence.\n" +
          "Respond with JSON only matching the schema (facts array strings). Empty array means nothing to store.",
      },
      { role: "user" as const, content: userMsg },
    ],
    stream: false,
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: STANDARD_CHAT_MEMORY_FACTS_SCHEMA_NAME,
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            facts: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["facts"],
        },
      },
    },
  };

  let res: Response;
  try {
    res = await fetch(`${params.upstream.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.upstream.auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  } catch {
    logSkipped("fetch_throw");
    return null;
  }

  if (!res.ok) {
    logSkipped(`upstream_http_${res.status}`);
    return null;
  }

  let envelope: unknown;
  try {
    envelope = await res.json();
  } catch {
    logSkipped("upstream_json_parse");
    return null;
  }

  const parsedFromMsg = extractContentJsonFromCompletion(envelope);
  if (parsedFromMsg == null) {
    logSkipped("missing_message_content_json");
    return null;
  }

  const rawFactsArray = parseFactsFromMessageBody(parsedFromMsg);
  if (rawFactsArray === null) {
    logSkipped("schema_facts_missing");
    return null;
  }

  const sanitized = sanitizeAndCapFacts(rawFactsArray, caps);
  if (sanitized.length === 0) {
    logSkipped("empty_facts_after_sanitize");
    return null;
  }
  return sanitized;
}

/** Pull JSON object/array from assistant message.content (string or structured). */
export function extractContentJsonFromCompletion(
  envelope: unknown,
): unknown | null {
  if (!envelope || typeof envelope !== "object") return null;
  const c = (envelope as { choices?: Array<{ message?: { content?: unknown } }> })
    ?.choices?.[0]?.message?.content;

  if (c == null) return null;
  if (typeof c === "object") return c;
  if (typeof c === "string") {
    const t = c.trim();
    try {
      return JSON.parse(t) as unknown;
    } catch {
      return null;
    }
  }
  return null;
}
