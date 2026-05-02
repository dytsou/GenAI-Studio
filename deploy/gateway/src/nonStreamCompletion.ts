/** OpenAI-compat non-stream completion helper. */

export async function chatCompletionSingleText(params: {
  upstreamBase: string;
  auth: string;
  model: string;
  messages: unknown[];
  temperature?: number;
  max_tokens?: number;
}): Promise<string> {
  const res = await fetch(`${params.upstreamBase}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: params.model,
      messages: params.messages,
      stream: false,
      temperature: params.temperature ?? 0.4,
      max_tokens: params.max_tokens ?? 1024,
    }),
  });

  const textRaw = await res.text();
  if (!res.ok) {
    throw new Error(`upstream ${res.status}: ${textRaw}`);
  }

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
