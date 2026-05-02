import { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { useChatStore } from '../../stores/useChatStore';
import type { Attachment } from '../../stores/useChatStore';
import { useSettingsStore } from '../../stores/useSettingsStore';
import type { SchemaField } from '../../stores/useSettingsStore';
import { MessageRenderer } from './MessageRenderer';
import { Composer } from './Composer';
import { SchemaWorkspace } from '../StructuredOutput/SchemaWorkspace';
import { streamChatCompletions } from '../../api/client';
import { fetchMemoryRecent } from '../../api/memory';
import { estimatePromptTokens, estimateTokensFromChars } from '../../utils/tokenEstimate';
import { StreamStatsBar } from './StreamStatsBar';
import { ToggleRight, ToggleLeft } from 'lucide-react';
import { v4 as uuidv4 } from 'uuid';
import type { QueuedSend } from './queuedSendTypes';
import { popFirstSendable } from './queueUtils';
import './Chat.css';

export function Chat() {
  const { chats, activeChatId, addMessage, updateMessage, deleteMessageAndSubsequent, deleteLastMessage } = useChatStore();
  const settings = useSettingsStore();

  const activeChat = chats.find(c => c.id === activeChatId);
  const messages = activeChat?.messages || [];

  const [isGenerating, setIsGenerating] = useState(false);
  const [streamStats, setStreamStats] = useState<{
    promptTokens: number;
    completionTokens: number;
    tokensPerSecond: number | null;
    studioChosenModel?: string | null;
    studioMemoryTokensUsed?: number | null;
  } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [sendQueue, setSendQueue] = useState<QueuedSend[]>([]);
  const sendQueueRef = useRef<QueuedSend[]>([]);

  useEffect(() => {
    sendQueueRef.current = sendQueue;
  }, [sendQueue]);

  useEffect(() => {
    // Outbound queue is per-thread; discard when switching active chat.
    setSendQueue([]);
  }, [activeChatId]);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const updateQueuedSend = useCallback(
    (id: string, patch: Partial<Pick<QueuedSend, 'content' | 'attachments' | 'promptOverride'>>) => {
      setSendQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
    },
    [],
  );

  const removeQueuedSend = useCallback((id: string) => {
    setSendQueue((prev) => prev.filter((q) => q.id !== id));
  }, []);

  const appendAttachmentsToQueued = useCallback((id: string, newAttachments: Attachment[]) => {
    setSendQueue((prev) =>
      prev.map((q) => (q.id === id ? { ...q, attachments: [...q.attachments, ...newAttachments] } : q)),
    );
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const lastMessageContent = messages[messages.length - 1]?.content;

  useEffect(() => {
    scrollToBottom();
  }, [messages.length, lastMessageContent]);

  // Derive generated schema for the request
  const generatedSchema = useMemo(() => {
    if (!settings.structuredOutputMode) return undefined;
    type JsonSchemaProperty = {
      type: SchemaField['type'];
      description: string;
      items?: { type: 'string' };
    };

    const properties: Record<string, JsonSchemaProperty> = {};
    const required: string[] = [];

    settings.schemaFields.forEach(field => {
      properties[field.name] = {
        type: field.type,
        description: field.description
      };
      if (field.type === 'array') {
        properties[field.name].items = { type: 'string' };
      }
      if (field.required) {
        required.push(field.name);
      }
    });

    return {
      type: "json_schema",
      json_schema: {
        name: "user_defined_schema",
        strict: true,
        schema: {
          type: "object",
          properties,
          required,
          additionalProperties: false
        }
      }
    };
  }, [settings.structuredOutputMode, settings.schemaFields]);

  const handleSend = async (
    content: string,
    attachments: Attachment[],
    promptOverride?: string,
    memoryOverride?: { includeChunkIds: string[]; excludeChunkIds: string[]; draftHash?: string } | null,
  ) => {
    if (!activeChatId) return;

    if (isGenerating) {
      setSendQueue((prev) => [
        ...prev,
        { id: uuidv4(), content, attachments, promptOverride },
      ]);
      return;
    }

    addMessage(activeChatId, {
      role: 'user',
      content,
      attachments
    });

    await handleGenerate(promptOverride, activeChatId, memoryOverride ?? null);
  };

  const handleRegenerate = async () => {
    if (!activeChatId) return;
    if (messages.length > 0 && messages[messages.length - 1].role === 'assistant') {
       deleteLastMessage(activeChatId);
    }
    await handleGenerate(undefined, activeChatId);
  };

  const handleEdit = async (messageId: string, newContent: string) => {
     if (!activeChatId) return;
     updateMessage(activeChatId, messageId, { content: newContent });
     deleteMessageAndSubsequent(activeChatId, messageId);
     await handleGenerate(undefined, activeChatId);
  };

  const handleGenerate = async (
    promptOverride?: string,
    explicitChatId?: string,
    memoryOverride?: { includeChunkIds: string[]; excludeChunkIds: string[]; draftHash?: string } | null,
  ) => {
    const chatIdForRun = explicitChatId ?? activeChatId;
    if (!chatIdForRun) return;

    const currentChat = useChatStore.getState().chats.find(c => c.id === chatIdForRun);
    if (!currentChat) return;
    const currentMessages = currentChat.messages;

    useChatStore.getState().addMessage(chatIdForRun, {
      role: 'assistant',
      content: '',
    });
    
    const newlyAddedChat = useChatStore.getState().chats.find(c => c.id === chatIdForRun);
    const lastMsg = newlyAddedChat?.messages[newlyAddedChat.messages.length - 1];
    if (!lastMsg) return;

    setIsGenerating(true);
    abortControllerRef.current = new AbortController();

    const promptEstimate = estimatePromptTokens(
      currentMessages,
      (promptOverride ?? settings.systemPrompt).trim() || undefined,
    );
    setStreamStats({
      promptTokens: promptEstimate,
      completionTokens: 0,
      tokensPerSecond: null,
      studioChosenModel: null,
      studioMemoryTokensUsed: null,
    });

    let receivedUsage = false;
    let aborted = false;
    let firstTokenMs: number | null = null;
    let fullContent = '';
    const shouldRefreshMemory =
      settings.useHostedGateway &&
      settings.useIntelligentMode &&
      settings.memoryEnabled;

    try {
      const systemPrompt = (promptOverride ?? settings.systemPrompt).trim();
      const intelligentOptions =
        settings.useHostedGateway && settings.useIntelligentMode
          ? {
              includeSessionMemory: settings.intelligentIncludeSessionMemory,
              includeGlobalMemory: settings.intelligentIncludeGlobalMemory,
              revealMemoryValues: settings.intelligentRevealMemoryUi,
              memoryOverride: memoryOverride ?? null,
            }
          : undefined;
      const generator = streamChatCompletions(
        currentMessages,
        systemPrompt || undefined,
        generatedSchema,
        abortControllerRef.current.signal,
        intelligentOptions ?? null,
      );

      for await (const event of generator) {
        if (event.type === 'content') {
          fullContent += event.text;
          if (firstTokenMs === null) firstTokenMs = performance.now();
          const completionEstimate = estimateTokensFromChars(fullContent);
          const elapsed = (performance.now() - firstTokenMs) / 1000;
          const tps =
            elapsed > 0 && completionEstimate > 0 ? completionEstimate / elapsed : null;
          updateMessage(chatIdForRun, lastMsg.id, { content: fullContent });
          setStreamStats((prev) => ({
            promptTokens: prev?.promptTokens ?? promptEstimate,
            completionTokens: completionEstimate,
            tokensPerSecond: tps,
            studioChosenModel: prev?.studioChosenModel ?? null,
            studioMemoryTokensUsed: prev?.studioMemoryTokensUsed ?? null,
          }));
        } else if (event.type === 'usage') {
          receivedUsage = true;
          const u = event.usage;
          setStreamStats((prev) => ({
            promptTokens: u.prompt_tokens ?? prev?.promptTokens ?? promptEstimate,
            completionTokens: u.completion_tokens ?? prev?.completionTokens ?? 0,
            tokensPerSecond: prev?.tokensPerSecond ?? null,
            studioChosenModel: prev?.studioChosenModel ?? null,
            studioMemoryTokensUsed: prev?.studioMemoryTokensUsed ?? null,
          }));
        } else if (event.type === 'studio_meta') {
          const m = event.meta;
          setStreamStats((prev) => ({
            promptTokens: prev?.promptTokens ?? promptEstimate,
            completionTokens: prev?.completionTokens ?? 0,
            tokensPerSecond: prev?.tokensPerSecond ?? null,
            studioChosenModel: m.chosen_model ?? prev?.studioChosenModel ?? null,
            studioMemoryTokensUsed:
              m.memory_tokens_used ?? prev?.studioMemoryTokensUsed ?? null,
          }));
        } else if (event.type === 'studio_memory_injection') {
          const mem = event.memory;
          updateMessage(chatIdForRun, lastMsg.id, {
            memoryInjection: {
              mode: mem.mode,
              chunkIdsInjected: Array.isArray(mem.chunk_ids_injected) ? mem.chunk_ids_injected : [],
              chunksInjected: Array.isArray((mem as any).chunks_injected) ? (mem as any).chunks_injected : undefined,
              memoryTokensEstimate:
                typeof mem.memory_tokens_estimate === 'number' ? mem.memory_tokens_estimate : null,
            },
          });
        }
      }
    } catch (err: unknown) {
      const maybeError = err as { name?: unknown };
      if (maybeError.name === 'AbortError') {
        aborted = true;
      } else {
        updateMessage(chatIdForRun, lastMsg.id, { error: true });
        console.error(err);
      }
    } finally {
      if (firstTokenMs !== null) {
        const elapsed = (performance.now() - firstTokenMs) / 1000;
        setStreamStats((prev) => {
          if (!prev) return null;
          const completion = receivedUsage ? prev.completionTokens : estimateTokensFromChars(fullContent);
          const tps = elapsed > 0 && completion > 0 ? completion / elapsed : null;
          return {
            promptTokens: prev.promptTokens,
            completionTokens: completion,
            tokensPerSecond: tps,
            studioChosenModel: prev.studioChosenModel,
            studioMemoryTokensUsed: prev.studioMemoryTokensUsed,
          };
        });
      }
      setIsGenerating(false);
      abortControllerRef.current = null;

      if (!aborted && shouldRefreshMemory) {
        updateMessage(chatIdForRun, lastMsg.id, {
          recentMemory: {
            status: 'saving',
            chunks: [
              {
                chunk_id: 'pending',
                created_at: new Date().toISOString(),
                preview: fullContent.slice(0, 240),
                tags: [],
              },
            ],
          },
        });

        void fetchMemoryRecent({ limit: 12 })
          .then((r) => {
            updateMessage(chatIdForRun, lastMsg.id, {
              recentMemory: { status: 'reconciled', chunks: r.chunks ?? [] },
            });
          })
          .catch(() => {
            updateMessage(chatIdForRun, lastMsg.id, {
              recentMemory: {
                status: 'error',
                chunks: [
                  {
                    chunk_id: 'pending',
                    created_at: new Date().toISOString(),
                    preview: fullContent.slice(0, 240),
                    tags: [],
                  },
                ],
              },
            });
          });
      }

      if (!aborted) {
        const { msg, rest } = popFirstSendable(sendQueueRef.current);
        sendQueueRef.current = rest;
        setSendQueue(rest);
        if (msg) {
          const trimmed = msg.content.trim();
          addMessage(chatIdForRun, {
            role: 'user',
            content: trimmed,
            attachments: msg.attachments,
          });
          const override = msg.promptOverride?.trim();
          void handleGenerate(override || undefined, chatIdForRun);
        }
      }
    }
  };

  const handleStop = () => {
    setSendQueue([]);
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
  };

  if (!activeChat) {
    return (
      <div className="chat-empty-state">
        <p>Select or create a chat to begin.</p>
      </div>
    );
  }

  const isMessageLastAssistantMsg = (msgId: string) => {
     if (messages.length === 0) return false;
     return messages[messages.length - 1].id === msgId && messages[messages.length - 1].role === 'assistant';
  };

  return (
    <div className={`chat-layout ${settings.structuredOutputMode ? 'with-sidebar' : ''}`}>
      <div className="chat-container">
        
        <div className="chat-header">
           <h3 className="chat-title truncate">{activeChat.title}</h3>
           <button 
             className="mode-toggle-btn" 
             onClick={() => settings.setSettings({ structuredOutputMode: !settings.structuredOutputMode })}
           >
             {settings.structuredOutputMode ? <ToggleRight size={20} className="active-toggle" /> : <ToggleLeft size={20} />}
             <span>Structured Output</span>
           </button>
        </div>

        <div className="chat-messages-area">
          {messages.length === 0 ? (
            <div className="chat-welcome">
              <h2>How can I help you today?</h2>
            </div>
          ) : (
            <div className="messages-list">
              {messages.map((msg) => (
                <MessageRenderer 
                  key={msg.id} 
                  message={msg} 
                  onRegenerate={isMessageLastAssistantMsg(msg.id) && !isGenerating ? handleRegenerate : undefined}
                  onEdit={msg.role === 'user' && !isGenerating ? (content) => handleEdit(msg.id, content) : undefined}
                />
              ))}
              <div ref={messagesEndRef} />
            </div>
          )}
        </div>
        <div className="chat-composer-area">
          {streamStats && (
            <StreamStatsBar
              promptTokens={streamStats.promptTokens}
              contextWindowTokens={settings.contextWindowTokens}
              completionTokens={streamStats.completionTokens}
              maxOutputTokens={settings.maxTokens}
              tokensPerSecond={streamStats.tokensPerSecond}
              active={isGenerating}
              studioChosenModel={streamStats.studioChosenModel}
              studioMemoryTokensUsed={streamStats.studioMemoryTokensUsed}
            />
          )}
          <Composer
            onSend={handleSend}
            onStop={handleStop}
            isGenerating={isGenerating}
            sendQueue={sendQueue}
            onUpdateQueuedSend={updateQueuedSend}
            onRemoveQueuedSend={removeQueuedSend}
            onAppendAttachmentsToQueued={appendAttachmentsToQueued}
          />
        </div>
      </div>
      
      {settings.structuredOutputMode && (
         <SchemaWorkspace onClose={() => settings.setSettings({ structuredOutputMode: false })} />
      )}
    </div>
  );
}
