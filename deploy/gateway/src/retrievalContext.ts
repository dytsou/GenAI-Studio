/** Last user message text for embedding-based memory retrieval */

function stringifyUserContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (content == null) return "";
  if (Array.isArray(content)) {
    const texts = content.flatMap((p) => {
      if (!p || typeof p !== "object") return [];
      const o = p as { type?: string; text?: string };
      if (o.type === "text" && typeof o.text === "string") return [o.text];
      return [];
    });
    if (texts.length) return texts.join("\n");
  }
  try {
    return JSON.stringify(content);
  } catch {
    return "";
  }
}

/** Walks backward for the latest `user` turn; trims and caps embedding input. */
export function extractLastUserTextForRetrieval(messages: unknown): string {
  if (!Array.isArray(messages)) return "";
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (!m || typeof m !== "object") continue;
    if ((m as { role?: string }).role !== "user") continue;
    const raw = stringifyUserContent((m as { content?: unknown }).content).trim();
    return raw.slice(0, 8000);
  }
  return "";
}
