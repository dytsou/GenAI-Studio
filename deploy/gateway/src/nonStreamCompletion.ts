/** OpenAI-compat non-stream completion helper. */

export async function chatCompletionSingleText(params: {
  upstreamBase: string;
  auth: string;
  model: string;
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
}): Promise<string> {
  const url = `${params.upstreamBase}/chat/completions`;
  const baseBody = {
    model: params.model,
    messages: params.messages,
    stream: false,
    temperature: params.temperature ?? 0.4,
  } as Record<string, unknown>;

  const max = params.max_tokens ?? 1024;

  async function attempt(extra: Record<string, unknown>) {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${params.auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ ...baseBody, ...extra }),
    });
    const textRaw = await res.text();
    return { res, textRaw };
  }

  // Newer OpenAI models prefer `max_completion_tokens`; older stacks may only
  // accept `max_tokens`. We try the modern field first, then fall back.
  let { res, textRaw } = await attempt({ max_completion_tokens: max });
  if (!res.ok && /Unsupported parameter:\s*'max_completion_tokens'/.test(textRaw)) {
    ({ res, textRaw } = await attempt({ max_tokens: max }));
  }

  if (!res.ok) throw new Error(`upstream ${res.status}: ${textRaw}`);

  try {
    const json = JSON.parse(textRaw) as {
      choices?: Array<{ message?: { content?: string } }>;
    };
    const c = json.choices?.[0]?.message?.content;
    return typeof c === 'string' ? c : '';
  } catch {
    return '';
  }
}
