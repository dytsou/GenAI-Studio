/**
 * Parses OpenAI-style SSE `data:` lines for chat streams.
 * `studio`-envelope payloads are surfaced separately (project-config convention).
 */

export type StudioMetaPayload = {
  kind: 'meta';
  chosen_model?: string;
  memory_tokens_used?: number;
};

export type StudioToolPayload = {
  kind: 'tool';
  id: string;
  name: string;
  phase: 'start' | 'end' | 'error';
  ok?: boolean;
  detail?: string;
};

export type ParsedStreamPayload =
  | {
      choices?: Array<{ delta?: { content?: string | null } }>;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
      studio?: Record<string, unknown> & { kind?: string };
    }
  | Record<string, unknown>;

export type StreamEventFromSse =
  | { type: 'content'; text: string }
  | {
      type: 'usage';
      usage: {
        prompt_tokens?: number;
        completion_tokens?: number;
        total_tokens?: number;
      };
    }
  | { type: 'studio_meta'; meta: StudioMetaPayload }
  | { type: 'studio_tool'; tool: StudioToolPayload };

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

export function parseSseDataPayload(dataStr: string): ParsedStreamPayload | null {
  try {
    return JSON.parse(dataStr) as ParsedStreamPayload;
  } catch {
    return null;
  }
}

/**
 * Map one `data:` JSON payload string to stream events (order: studio, usage, delta text).
 */
export function eventsFromSseDataJson(dataStr: string): StreamEventFromSse[] {
  const parsed = parseSseDataPayload(dataStr);
  if (!parsed || !isRecord(parsed)) return [];

  const out: StreamEventFromSse[] = [];

  if ('studio' in parsed && isRecord(parsed.studio) && typeof parsed.studio.kind === 'string') {
    const sk = parsed.studio as { kind: string };
    if (sk.kind === 'meta') {
      out.push({ type: 'studio_meta', meta: parsed.studio as unknown as StudioMetaPayload });
    } else if (sk.kind === 'tool') {
      out.push({ type: 'studio_tool', tool: parsed.studio as unknown as StudioToolPayload });
    }
  }

  if ('usage' in parsed && isRecord(parsed.usage)) {
    const u = parsed.usage as {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
    if (u.prompt_tokens != null || u.completion_tokens != null || u.total_tokens != null) {
      out.push({ type: 'usage', usage: u });
    }
  }

  if ('choices' in parsed && Array.isArray(parsed.choices)) {
    const first = parsed.choices[0] as { delta?: { content?: string | null } } | undefined;
    const text = first?.delta?.content;
    if (typeof text === 'string' && text.length > 0) {
      out.push({ type: 'content', text });
    }
  }

  return out;
}

export async function* readSseStream(
  body: ReadableStream<Uint8Array>,
): AsyncGenerator<StreamEventFromSse, void, undefined> {
  const reader = body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const chunks = buffer.split('\n');
      buffer = chunks.pop() ?? '';

      for (const chunk of chunks) {
        const trimmed = chunk.trim();
        if (!trimmed || trimmed === 'data: [DONE]') continue;
        if (!trimmed.startsWith('data: ')) continue;
        const dataStr = trimmed.slice(6);
        for (const ev of eventsFromSseDataJson(dataStr)) {
          yield ev;
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
