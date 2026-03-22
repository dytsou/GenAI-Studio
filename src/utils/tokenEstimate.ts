import type { Message } from '../stores/useChatStore';

const CHARS_PER_TOKEN = 4;

export function estimateTokensFromChars(text: string): number {
  if (!text.length) return 0;
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

/** Rough vision-style token cost from a data URL (very approximate). */
function estimateAttachmentTokens(dataUrl: string): number {
  const approxBytes = Math.ceil((dataUrl.length * 3) / 4);
  return Math.max(256, Math.ceil(approxBytes / 512));
}

/**
 * Rough prompt token count for display (matches server poorly for images; good enough for UI).
 */
export function estimatePromptTokens(
  messages: Omit<Message, 'id'>[],
  systemPrompt?: string,
): number {
  let total = 0;
  if (systemPrompt?.trim()) {
    total += estimateTokensFromChars(systemPrompt) + 4;
  }
  for (const msg of messages) {
    total += 4;
    total += estimateTokensFromChars(msg.content);
    if (msg.attachments?.length) {
      for (const att of msg.attachments) {
        total += estimateAttachmentTokens(att.dataUrl);
      }
    }
  }
  return total;
}
