import { useSettingsStore } from '../stores/useSettingsStore';
import type { Message } from '../stores/useChatStore';

export async function* streamChatCompletions(
  messages: Omit<Message, 'id'>[],
  systemPrompt?: string,
  responseFormat?: any,
  abortSignal?: AbortSignal
) {
  const { apiKey, baseUrl, model, temperature, topP, maxTokens } = useSettingsStore.getState();

  if (!apiKey) {
    throw new Error('API Key is not configured. Please set it in Settings.');
  }

  // Format messages for OpenAI API
  const apiMessages = [];
  
  if (systemPrompt) {
    apiMessages.push({ role: 'system', content: systemPrompt });
  }

  for (const msg of messages) {
    // Handling attachments (images and PDFs parsed to base64 images)
    if (msg.attachments && msg.attachments.length > 0) {
      const content: any[] = [
        { type: 'text', text: msg.content }
      ];
      for (const att of msg.attachments) {
        content.push({
          type: 'image_url',
          image_url: { url: att.dataUrl }
        });
      }
      apiMessages.push({ role: msg.role, content });
    } else {
      apiMessages.push({ role: msg.role, content: msg.content });
    }
  }

  const payload: Record<string, any> = {
    model,
    messages: apiMessages,
    temperature,
    top_p: topP,
    max_tokens: maxTokens,
    stream: true,
  };

  if (responseFormat) {
    payload.response_format = responseFormat;
  }

  // Determine completions URL safely
  const completeBaseUrl = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
  const url = completeBaseUrl.endsWith('/chat/completions') ? completeBaseUrl : `${completeBaseUrl}/chat/completions`;

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${apiKey}`
    },
    body: JSON.stringify(payload),
    signal: abortSignal
  });

  if (!response.ok) {
    let errorText = await response.text();
    try {
      const parsed = JSON.parse(errorText);
      errorText = parsed.error?.message || errorText;
    } catch (e) {
      // ignore
    }
    throw new Error(`API Error: ${response.status} - ${errorText}`);
  }

  if (!response.body) {
    throw new Error('No streaming body returned from API.');
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder('utf-8');
  let buffer = '';

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split('\n');
    buffer = chunks.pop() || '';

    for (const chunk of chunks) {
      const trimmed = chunk.trim();
      if (!trimmed || trimmed === 'data: [DONE]') continue;
      
      if (trimmed.startsWith('data: ')) {
        const dataStr = trimmed.slice(6);
        try {
          const parsed = JSON.parse(dataStr);
          if (parsed.choices && parsed.choices[0]?.delta?.content) {
            yield parsed.choices[0].delta.content;
          }
        } catch (e) {
          console.warn('Failed to parse stream chunk:', dataStr);
        }
      }
    }
  }
}
