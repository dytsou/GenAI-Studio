import { useSettingsStore } from '../stores/useSettingsStore';
import type { Message } from '../stores/useChatStore';
import type { ChatStreamUsage } from './streamTypes';
import { readSseStream } from './sseStudioEvents';
import { getOrCreateWorkspaceId } from './gatewayWorkspaceId';

export type { ChatStreamUsage } from './streamTypes';

type ResponseFormat = Record<string, unknown>;

type TextContentPart = { type: 'text'; text: string };
type ImageUrlContentPart = { type: 'image_url'; image_url: { url: string } };
type ChatContentPart = TextContentPart | ImageUrlContentPart;

type ChatCompletionMessage = {
  role: Message['role'];
  content: string | ChatContentPart[];
};

type ChatCompletionRequestPayload = {
  model: string;
  messages: ChatCompletionMessage[];
  temperature: number;
  top_p: number;
  max_tokens: number;
  stream: true;
  response_format?: ResponseFormat;
  stream_options?: { include_usage: boolean };
};

export type ChatStreamEvent =
  | { type: 'content'; text: string }
  | { type: 'usage'; usage: ChatStreamUsage }
  | {
      type: 'studio_meta';
      meta: { kind: 'meta'; chosen_model?: string; memory_tokens_used?: number };
    }
  | {
      type: 'studio_tool';
      tool: {
        kind: 'tool';
        id: string;
        name: string;
        phase: 'start' | 'end' | 'error';
        ok?: boolean;
        detail?: string;
      };
    };

export interface IntelligentSendOptions {
  includeSessionMemory: boolean;
  includeGlobalMemory: boolean;
  revealMemoryValues: boolean;
}

function clampMemoryTopK(n: number): number {
  const x = Number.isFinite(n) ? Math.floor(n) : 8;
  return Math.min(16, Math.max(1, x));
}

async function fetchWithBusyRetry(
  execute: () => Promise<Response>,
  signal?: AbortSignal,
): Promise<Response> {
  const maxAttempts = 6;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    if (signal?.aborted) throw new DOMException('Aborted', 'AbortError');
    const res = await execute();
    if (res.status !== 409) return res;
    let waitMs = Number(res.headers.get('retry-after')) * 1000;
    if (!Number.isFinite(waitMs) || waitMs < 0) waitMs = 2000;
    waitMs = Math.min(waitMs, 8000);
    await new Promise((r) => setTimeout(r, waitMs));
  }
  const res = await execute();
  if (res.status === 409) {
    await res.body?.cancel();
    throw new Error('workspace_busy — max retries exceeded');
  }
  return res;
}

export function buildCompletionMessages(
  messages: Omit<Message, 'id'>[],
  systemPrompt?: string,
): ChatCompletionMessage[] {
  const apiMessages: ChatCompletionMessage[] = [];
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }
  for (const msg of messages) {
    if (msg.attachments && msg.attachments.length > 0) {
      const contentParts: ChatContentPart[] = [{ type: 'text', text: msg.content }];
      for (const att of msg.attachments) {
        contentParts.push({
          type: 'image_url',
          image_url: { url: att.dataUrl },
        });
      }
      apiMessages.push({ role: msg.role, content: contentParts });
    } else {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  }
  return apiMessages;
}

export async function* streamChatCompletions(
  messages: Omit<Message, 'id'>[],
  systemPrompt?: string,
  responseFormat?: ResponseFormat,
  abortSignal?: AbortSignal,
  intelligentOptions?: IntelligentSendOptions | null,
): AsyncGenerator<ChatStreamEvent, void, undefined> {
  const s = useSettingsStore.getState();
  const {
    apiKey,
    baseUrl,
    model,
    temperature,
    topP,
    maxTokens,
    includeStreamUsage,
    useHostedGateway,
    gatewayBaseUrl,
    useIntelligentMode,
    memoryEnabled,
    memoryTopK,
    toolsEnabled,
  } = s;

  if (!apiKey) {
    throw new Error('API Key is not configured. Please set it in Settings.');
  }

  const apiMessages = buildCompletionMessages(messages, systemPrompt?.trim() || undefined);

  const payload: ChatCompletionRequestPayload = {
    model,
    messages: apiMessages,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    stream: true,
  };

  if (includeStreamUsage) {
    payload.stream_options = { include_usage: true };
  }
  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  let url: string;
  let headers: Record<string, string>;

  const signal = abortSignal;

  if (useHostedGateway) {
    const gw = (gatewayBaseUrl || 'http://127.0.0.1:8080').replace(/\/$/, '');
    const path =
      useIntelligentMode ? '/v1/intelligent/chat' : '/v1/chat';
    url = `${gw}${path}`;
    const workspaceId = getOrCreateWorkspaceId();
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
      'X-Upstream-Base-Url': baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl,
      'X-Workspace-Id': workspaceId,
      'X-Memory-Enabled': memoryEnabled ? 'true' : 'false',
      'X-Memory-Top-K': String(clampMemoryTopK(memoryTopK)),
      'X-Tools-Enabled': toolsEnabled ? 'true' : 'false',
    };
    if (useIntelligentMode) {
      const io = intelligentOptions ?? {
        includeSessionMemory: true,
        includeGlobalMemory: true,
        revealMemoryValues: false,
      };
      headers['X-Studio-Intelligent-Session-Memory'] = io.includeSessionMemory ? 'true' : 'false';
      headers['X-Studio-Intelligent-Global-Memory'] = io.includeGlobalMemory ? 'true' : 'false';
      headers['X-Studio-Intelligent-Reveal-Memory'] = io.revealMemoryValues ? 'true' : 'false';
    }
  } else {
    const completeBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    url = completeBaseUrl.endsWith('/chat/completions')
      ? completeBaseUrl
      : `${completeBaseUrl}/chat/completions`;
    headers = {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    };
  }

  const response = await fetchWithBusyRetry(
    () =>
      fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
        signal,
      }),
    signal,
  );

  if (!response.ok) {
    let errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText) as { error?: { message?: string } };
      errorText = parsed.error?.message || errorText;
    } catch {
      /* ignore */
    }
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No streaming body returned from API.');
  }

  for await (const event of readSseStream(response.body)) {
    if (
      event.type === 'studio_meta' ||
      event.type === 'studio_tool' ||
      event.type === 'usage' ||
      event.type === 'content'
    ) {
      yield event;
    }
  }
}
