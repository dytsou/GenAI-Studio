import { create } from "zustand";
import { persist } from "zustand/middleware";
import { v4 as uuidv4 } from "uuid";

export type Role = "system" | "user" | "assistant";

export interface Attachment {
  type: "image" | "pdf";
  dataUrl: string; // base64 or object URL
  name: string;
}

export interface Message {
  id: string;
  role: Role;
  content: string;
  attachments?: Attachment[];
  error?: boolean;
  memoryInjection?: {
    mode: "disabled" | "auto" | "manual";
    chunkIdsInjected: string[];
    chunksInjected?: Array<{
      chunk_id: string;
      tags: string[];
      keyphrases: string[];
      preview: string;
    }>;
    memoryTokensEstimate: number | null;
  };
  recentMemory?: {
    status: "saving" | "reconciled" | "error";
    chunks: Array<{
      chunk_id: string;
      created_at: string;
      preview: string;
      tags: string[];
      keyphrases?: string[];
    }>;
  };
}

export interface Chat {
  id: string;
  title: string;
  messages: Message[];
  createdAt: number;
  updatedAt: number;
}

interface ChatState {
  chats: Chat[];
  activeChatId: string | null;
  createChat: () => string;
  setActiveChat: (id: string | null) => void;
  deleteChat: (id: string) => void;
  addMessage: (chatId: string, message: Omit<Message, "id">) => void;
  updateMessage: (
    chatId: string,
    messageId: string,
    updates: Partial<Message>,
  ) => void;
  deleteMessageAndSubsequent: (chatId: string, messageId: string) => void;
  deleteLastMessage: (chatId: string) => void;
  setChatTitle: (chatId: string, title: string) => void;
}

export const useChatStore = create<ChatState>()(
  persist(
    (set) => ({
      chats: [],
      activeChatId: null,
      createChat: () => {
        const newChat: Chat = {
          id: uuidv4(),
          title: "New Chat",
          messages: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        set((state) => ({
          chats: [newChat, ...state.chats],
          activeChatId: newChat.id,
        }));
        return newChat.id;
      },
      setActiveChat: (id) => set({ activeChatId: id }),
      deleteChat: (id) => {
        set((state) => {
          const newChats = state.chats.filter((c) => c.id !== id);
          return {
            chats: newChats,
            activeChatId:
              state.activeChatId === id
                ? newChats[0]?.id || null
                : state.activeChatId,
          };
        });
      },
      addMessage: (chatId, message) => {
        set((state) => {
          const newChats = state.chats.map((c) => {
            if (c.id === chatId) {
              // Simple auto-title logic on first message
              const title =
                c.messages.length === 0 && message.role === "user"
                  ? message.content.slice(0, 30) +
                    (message.content.length > 30 ? "..." : "")
                  : c.title;
              return {
                ...c,
                title,
                messages: [...c.messages, { ...message, id: uuidv4() }],
                updatedAt: Date.now(),
              };
            }
            return c;
          });
          return { chats: newChats };
        });
      },
      updateMessage: (chatId, messageId, updates) => {
        set((state) => {
          return {
            chats: state.chats.map((c) => {
              if (c.id === chatId) {
                return {
                  ...c,
                  messages: c.messages.map((m) =>
                    m.id === messageId ? { ...m, ...updates } : m,
                  ),
                };
              }
              return c;
            }),
          };
        });
      },
      deleteMessageAndSubsequent: (chatId, messageId) => {
        set((state) => {
          return {
            chats: state.chats.map((c) => {
              if (c.id === chatId) {
                const msgIndex = c.messages.findIndex(
                  (m) => m.id === messageId,
                );
                if (msgIndex === -1) return c;
                // Keep the message itself, delete everything after
                return { ...c, messages: c.messages.slice(0, msgIndex + 1) };
              }
              return c;
            }),
          };
        });
      },
      deleteLastMessage: (chatId) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, messages: c.messages.slice(0, -1) } : c,
          ),
        }));
      },
      setChatTitle: (chatId, title) => {
        set((state) => ({
          chats: state.chats.map((c) =>
            c.id === chatId ? { ...c, title } : c,
          ),
        }));
      },
    }),
    {
      name: "chatgpt-chat-storage",
    },
  ),
);
