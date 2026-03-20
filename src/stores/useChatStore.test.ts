import { describe, it, expect, beforeEach, vi } from 'vitest';

const CHAT_KEY = 'chatgpt-chat-storage';

describe('useChatStore persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('defaults when storage is empty', async () => {
    const mod = await import('./useChatStore');
    const state = mod.useChatStore.getState();

    expect(state.chats).toEqual([]);
    expect(state.activeChatId).toBeNull();
  });

  it('rehydrates from localStorage', async () => {
    localStorage.setItem(
      CHAT_KEY,
      JSON.stringify({
        state: {
          chats: [
            {
              id: 'chat-1',
              title: 'Chat 1',
              messages: [{ id: 'msg-1', role: 'user', content: 'Hello' }],
              createdAt: 1,
              updatedAt: 1,
            },
          ],
          activeChatId: 'chat-1',
        },
        version: 0,
      }),
    );

    const mod = await import('./useChatStore');
    const state = mod.useChatStore.getState();

    expect(state.chats).toHaveLength(1);
    expect(state.chats[0]?.id).toBe('chat-1');
    expect(state.activeChatId).toBe('chat-1');
    expect(state.chats[0]?.messages).toHaveLength(1);
    expect(state.chats[0]?.messages[0]?.content).toBe('Hello');
  });
});

