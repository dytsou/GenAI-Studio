import {
  extractContentJsonFromCompletion,
  resolveExtractionModel,
} from "./memoryChatExtract.js";

export const MEMORY_KEYPHRASES_SCHEMA_NAME = "memory_keyphrases_v1" as const;

export type ParsedKeyphrasesEnvelope = {
  keyphrases: string[];
};

function looksLikeApiSecretLine(s: string): boolean {
  return /sk-[a-zA-Z0-9_-]{8,}/i.test(s);
}

function isProbablySentence(s: string): boolean {
  // Heuristic guardrail: reject obvious sentence-like outputs.
  if (/[.?!;:]/.test(s)) return true;
  if (s.split(/\s+/).length >= 8) return true;
  return false;
}

export function sanitizeAndCapKeyphrases(
  raw: unknown,
  caps: { maxItems: number; maxPerItemChars: number; maxTotalChars: number },
): string[] {
  if (!Array.isArray(raw)) return [];

  const out: string[] = [];
  const seen = new Set<string>();
  let totalChars = 0;

  for (const item of raw) {
    if (typeof item !== "string") continue;
    let s = item
      .replace(/\u0000/g, "")
      .replace(/\s+/g, " ")
      .trim();
    if (!s) continue;
    if (looksLikeApiSecretLine(s)) continue;
    if (s.length > caps.maxPerItemChars) s = s.slice(0, caps.maxPerItemChars);
    if (isProbablySentence(s)) continue;
    if (seen.has(s)) continue;

    if (out.length >= caps.maxItems) break;
    if (totalChars + s.length > caps.maxTotalChars) break;

    out.push(s);
    seen.add(s);
    totalChars += s.length;
  }

  return out;
}

export function parseKeyphrasesFromMessageBody(json: unknown): string[] | null {
  if (json == null) return null;
  if (typeof json === "string") {
    try {
      return parseKeyphrasesFromMessageBody(JSON.parse(json) as unknown);
    } catch {
      return null;
    }
  }
  if (typeof json !== "object") return null;
  const keyphrases = (json as ParsedKeyphrasesEnvelope).keyphrases;
  if (!Array.isArray(keyphrases)) return null;
  return keyphrases;
}

function resolveKeyphraseModel(fallbackFromRequest: string): string {
  const env = process.env.MEMORY_KEYPHRASES_MODEL?.trim();
  if (env) return env;
  return resolveExtractionModel(fallbackFromRequest);
}

export async function extractMemoryKeyphrases(params: {
  upstream: { auth: string; baseUrl: string };
  model: string;
  content: string;
}): Promise<string[] | null> {
  const caps = { maxItems: 12, maxPerItemChars: 32, maxTotalChars: 512 };

  const content = params.content.trim();
  if (!content || content.length < 24) return null;

  const model = resolveKeyphraseModel(params.model);
  const userMsg = ["Memory chunk content:", content.slice(0, 12_000)].join(
    "\n",
  );

  const bodyBase = {
    model,
    temperature: 0.2,
    messages: [
      {
        role: "system" as const,
        content:
          "Extract 0–12 keyword-style keyphrases for this memory chunk.\n" +
          "Return short phrases (typically 1–4 words). Do NOT return sentences.\n" +
          "Avoid secrets, tokens, API keys, and long identifiers.\n" +
          "Respond with JSON only matching the schema (keyphrases array of strings).",
      },
      { role: "user" as const, content: userMsg },
    ],
    stream: false,
    response_format: {
      type: "json_schema" as const,
      json_schema: {
        name: MEMORY_KEYPHRASES_SCHEMA_NAME,
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            keyphrases: {
              type: "array",
              items: { type: "string" },
            },
          },
          required: ["keyphrases"],
        },
      },
    },
  } as Record<string, unknown>;

  async function attempt(extra: Record<string, unknown>) {
    const res = await fetch(`${params.upstream.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.upstream.auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...bodyBase, ...extra }),
    });
    const textRaw = await res.text();
    return { res, textRaw };
  }

  let { res, textRaw } = await attempt({ max_completion_tokens: 400 });
  if (
    !res.ok &&
    /Unsupported parameter:\s*'max_completion_tokens'/.test(textRaw)
  ) {
    ({ res, textRaw } = await attempt({ max_tokens: 400 }));
  }
  if (!res.ok) return null;

  let envelope: unknown;
  try {
    envelope = JSON.parse(textRaw) as unknown;
  } catch {
    return null;
  }

  const parsedFromMsg = extractContentJsonFromCompletion(envelope);
  if (parsedFromMsg == null) return null;

  const rawArray = parseKeyphrasesFromMessageBody(parsedFromMsg);
  if (rawArray === null) return null;

  const sanitized = sanitizeAndCapKeyphrases(rawArray, caps);
  if (sanitized.length === 0) return null;
  return sanitized;
}
