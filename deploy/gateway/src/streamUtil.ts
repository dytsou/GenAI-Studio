/**
 * Streams upstream SSE chunks to Express response while optionally collecting assistant text (via tee).
 */

import type { Response as ExpressResponse } from 'express';

export function sseWrite(res: ExpressResponse, data: unknown): void {
  res.write(`data: ${JSON.stringify(data)}\n\n`);
}

function extractAssistantDeltaFromTrimmed(line: string, acc: { value: string }): void {
  if (!line.startsWith('data: ') || line === 'data: [DONE]') return;
  const payload = line.slice(6).trimStart();
  if (payload === '[DONE]') return;
  try {
    const j = JSON.parse(payload) as { choices?: Array<{ delta?: { content?: string } }> };
    const c = j.choices?.[0]?.delta?.content;
    if (typeof c === 'string') acc.value += c;
  } catch {
    /* ignore */
  }
}

export async function streamSseUpstream(
  upstream: globalThis.Response,
  res: ExpressResponse,
  preludeObjects: Record<string, unknown>[],
): Promise<{ assistantText: string }> {
  const body = upstream.body;
  if (!body || typeof body.tee !== 'function') {
    throw new Error('Upstream body missing or not tee-able');
  }

  const assistantAcc = { value: '' };

  async function accumulateFromBranch(branch: ReadableStream<Uint8Array>): Promise<void> {
    const reader = branch.getReader();
    const dec = new TextDecoder();
    let carry = '';
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunkStr = carry + dec.decode(value, { stream: true });
        const lines = chunkStr.split(/\r?\n/);
        carry = lines.pop() ?? '';
        for (const ln of lines) extractAssistantDeltaFromTrimmed(ln.trimStart(), assistantAcc);
      }
      const tail = carry.trim();
      if (tail) extractAssistantDeltaFromTrimmed(tail.trimStart(), assistantAcc);
    } finally {
      reader.releaseLock();
    }
  }

  async function pumpRawBranch(branch: ReadableStream<Uint8Array>): Promise<void> {
    const reader = branch.getReader();
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
      }
    } finally {
      reader.releaseLock();
    }
  }

  for (const obj of preludeObjects) sseWrite(res, obj);

  const [toClient, toCollector] = body.tee();
  await Promise.all([pumpRawBranch(toClient), accumulateFromBranch(toCollector)]);
  return { assistantText: assistantAcc.value.trim() };
}

export function sseDone(res: ExpressResponse): void {
  res.write('data: [DONE]\n\n');
}
