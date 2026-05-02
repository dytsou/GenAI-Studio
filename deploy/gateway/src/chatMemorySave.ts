import {
  extractChatMemoryFacts,
  readChatMemorySaveStrategy,
} from "./memoryChatExtract.js";
import type { Pool } from "pg";
import { embedText, insertMemoryChunk } from "./memoryService.js";
import { autoTagMemoryContent } from "./memoryApiTypes.js";

const VERBATIM_ASSISTANT_MIN_CHARS = 24;

/** Assistant plain text from a non-streaming OpenAI-compatible completion payload. */
export function assistantTextFromOpenAiCompletionJson(
  envelope: unknown,
): string {
  if (!envelope || typeof envelope !== "object") return "";
  const content = (
    envelope as {
      choices?: Array<{ message?: { content?: unknown } }>;
    }
  ).choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (content == null) return "";
  if (Array.isArray(content)) {
    const parts = content.flatMap((p) => {
      if (!p || typeof p !== "object") return [];
      const o = p as { type?: string; text?: string };
      if (o.type === "text" && typeof o.text === "string") return [o.text];
      return [];
    });
    return parts.join("\n").trim();
  }
  try {
    return JSON.stringify(content).trim();
  } catch {
    return "";
  }
}

/**
 * Persist a completed `/v1/chat` turn into `memory_chunks` per `MEMORY_CHAT_SAVE_STRATEGY`.
 * Failures are swallowed; extraction/embed errors never block the HTTP response path.
 */
export async function saveChatTurnToLongTermMemory(params: {
  pool: Pool | null;
  upstream: { auth: string; baseUrl: string };
  workspaceId: string;
  lastUserText: string;
  assistantText: string;
  chatModel: string;
}): Promise<void> {
  const { pool, upstream, workspaceId } = params;
  if (!pool || !workspaceId.trim()) return;

  const strategy = readChatMemorySaveStrategy();
  const trimmedAssistant = params.assistantText.trim();

  if (strategy === "verbatim") {
    if (
      !trimmedAssistant ||
      trimmedAssistant.length < VERBATIM_ASSISTANT_MIN_CHARS
    )
      return;
    try {
      const emb =
        (await embedText({
          auth: upstream.auth,
          baseUrl: upstream.baseUrl,
          text: trimmedAssistant.slice(0, 8000),
        })) || null;
      await insertMemoryChunk({
        pool,
        workspaceId,
        content: trimmedAssistant.slice(0, 32_000),
        embedding: emb,
        tags: autoTagMemoryContent(trimmedAssistant),
      });
    } catch (e) {
      console.warn("[memory-chat] verbatim insert failed", e);
    }
    return;
  }

  const facts = await extractChatMemoryFacts({
    upstream,
    model: params.chatModel,
    lastUserText: params.lastUserText,
    assistantText: params.assistantText,
  });
  if (!facts?.length) return;

  for (const fact of facts) {
    const text = fact.trim();
    if (!text) continue;
    try {
      const emb =
        (await embedText({
          auth: upstream.auth,
          baseUrl: upstream.baseUrl,
          text: text.slice(0, 8000),
        })) || null;
      await insertMemoryChunk({
        pool,
        workspaceId,
        content: text.slice(0, 32_000),
        embedding: emb,
        tags: autoTagMemoryContent(text),
      });
    } catch (e) {
      console.warn("[memory-chat] fact insert failed", e);
    }
  }
}
