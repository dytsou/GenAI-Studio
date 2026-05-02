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
    expect(state.useHostedGateway).toBe(false);
    expect(state.gatewayBaseUrl).toBe('http://127.0.0.1:8080');
    expect(state.memoryTopK).toBe(8);
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
          {
            id: '1',
            name: 'summary',
            type: 'string',
            required: true,
            description: 'A short summary',
          },
        ],
        useHostedGateway: true,
        gatewayBaseUrl: 'http://gw:8080',
        useIntelligentMode: true,
        memoryEnabled: false,
        memoryTopK: 4,
        toolsEnabled: true,
        intelligentRevealMemoryUi: true,
      },
      version: 0,
    });

    const mod = await import('./useSettingsStore');
    const state = mod.useSettingsStore.getState();

    expect(state.gatewayBaseUrl).toBe('http://gw:8080');
    expect(state.useHostedGateway).toBe(true);
    expect(state.memoryTopK).toBe(4);
  });
});
