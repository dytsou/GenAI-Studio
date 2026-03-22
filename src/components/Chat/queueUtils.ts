import type { QueuedSend } from './queuedSendTypes';

/**
 * Pop the first queue item that has non-empty text or attachments.
 * Skips empty items (e.g. user cleared everything while editing).
 */
export function popFirstSendable(queue: QueuedSend[]): {
  msg: QueuedSend | null;
  rest: QueuedSend[];
} {
  let rest = queue;
  while (rest.length > 0) {
    const [head, ...tail] = rest;
    if (head.content.trim() || head.attachments.length > 0) {
      return { msg: head, rest: tail };
    }
    rest = tail;
  }
  return { msg: null, rest: [] };
}
