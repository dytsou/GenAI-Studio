import { describe, it, expect, beforeEach, vi } from 'vitest';

const SETTINGS_KEY = 'chatgpt-settings-storage';

function setStoredSettings(raw: unknown) {
  localStorage.setItem(SETTINGS_KEY, JSON.stringify(raw));
}

describe('useSettingsStore persistence', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetModules();
  });

  it('defaults when storage is empty', async () => {
    const mod = await import('./useSettingsStore');
    const state = mod.useSettingsStore.getState();

    expect(state.apiKey).toBe('');
    expect(state.baseUrl).toBe('https://api.openai.com/v1');
    expect(state.model).toBe('gpt-4o');
    expect(state.temperature).toBe(0.7);
    expect(state.topP).toBe(1.0);
    expect(state.maxTokens).toBe(4096);
    expect(state.contextWindowTokens).toBe(128000);
    expect(state.includeStreamUsage).toBe(true);
    expect(state.structuredOutputMode).toBe(false);
  });

  it('rehydrates from localStorage', async () => {
    setStoredSettings({
      state: {
        apiKey: 'stored-key',
        baseUrl: 'https://example.com/v1',
        model: 'llama-3',
        temperature: 0.2,
        topP: 0.9,
        maxTokens: 1234,
        contextWindowTokens: 262144,
        includeStreamUsage: false,
        structuredOutputMode: true,
        schemaFields: [
          { id: '1', name: 'summary', type: 'string', required: true, description: 'A short summary' },
        ],
      },
      version: 0,
    });

    const mod = await import('./useSettingsStore');
    const state = mod.useSettingsStore.getState();

    expect(state.apiKey).toBe('stored-key');
    expect(state.baseUrl).toBe('https://example.com/v1');
    expect(state.model).toBe('llama-3');
    expect(state.temperature).toBe(0.2);
    expect(state.topP).toBe(0.9);
    expect(state.maxTokens).toBe(1234);
    expect(state.contextWindowTokens).toBe(262144);
    expect(state.includeStreamUsage).toBe(false);
    expect(state.structuredOutputMode).toBe(true);
  });
});

