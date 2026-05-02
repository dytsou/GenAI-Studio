import { describe, it, expect } from 'vitest';
import { mergeMaskedSettings } from './settingsMasking';
import type { MaskedSettingsDraft, StoredSettings } from './settingsMasking';

const gwDefaults = {
  gatewayBaseUrl: 'http://127.0.0.1:8080',
  useHostedGateway: false,
  useIntelligentMode: false,
  memoryEnabled: true,
  memoryTopK: 8,
  toolsEnabled: false,
  intelligentIncludeSessionMemory: true,
  intelligentIncludeGlobalMemory: true,
  intelligentRevealMemoryUi: false,
} as const;

const storedBase: StoredSettings = {
  apiKey: 'stored-key',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  temperature: 0.7,
  topP: 1,
  maxTokens: 4096,
  contextWindowTokens: 128000,
  includeStreamUsage: true,
  systemPrompt: 'You are a helpful assistant.',
  ...gwDefaults,
};

const draftGw = (partial: Partial<MaskedSettingsDraft> = {}): MaskedSettingsDraft => ({
  apiKey: '',
  baseUrl: '',
  model: '',
  temperature: 0.2,
  topP: 0.8,
  maxTokens: '',
  contextWindowTokens: '',
  includeStreamUsage: false,
  systemPrompt: '',
  gatewayBaseUrl: '',
  useHostedGateway: false,
  useIntelligentMode: false,
  memoryEnabled: true,
  memoryTopK: '' as number | '',
  toolsEnabled: false,
  intelligentIncludeSessionMemory: true,
  intelligentIncludeGlobalMemory: true,
  intelligentRevealMemoryUi: false,
  ...partial,
});

describe('mergeMaskedSettings', () => {
  it('emptyDraftKeepsStored', () => {
    const draft = draftGw({
      apiKey: '',
      baseUrl: '',
      model: '',
    });

    const result = mergeMaskedSettings({ stored: storedBase, draft });

    expect('merged' in result).toBe(true);
    if ('merged' in result) {
      expect(result.merged).toEqual({
        ...storedBase,
        systemPrompt: '',
        temperature: draft.temperature,
        topP: draft.topP,
        includeStreamUsage: false,
      });
    }
  });

  it('draftOverridesStored', () => {
    const draft = draftGw({
      apiKey: 'draft-key',
      baseUrl: 'https://example.com/v1',
      model: 'llama-3',
      temperature: 0.1,
      topP: 0.9,
      maxTokens: 2048,
      contextWindowTokens: 262144,
      includeStreamUsage: false,
      systemPrompt: 'Answer with bullet points.',
      gatewayBaseUrl: 'http://gw.local:9999',
      useHostedGateway: true,
      useIntelligentMode: true,
      memoryTopK: 12,
      toolsEnabled: true,
      intelligentRevealMemoryUi: true,
    });

    const result = mergeMaskedSettings({ stored: storedBase, draft });

    expect('merged' in result).toBe(true);
    if ('merged' in result) {
      expect(result.merged.apiKey).toBe('draft-key');
      expect(result.merged.gatewayBaseUrl).toBe('http://gw.local:9999');
      expect(result.merged.memoryTopK).toBe(12);
      expect(result.merged.useHostedGateway).toBe(true);
      expect(result.merged.useIntelligentMode).toBe(true);
    }
  });

  it('intelligentModeOffWhenGatewayOff', () => {
    const draft = draftGw({
      apiKey: 'k',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      useHostedGateway: false,
      useIntelligentMode: true,
      maxTokens: 100,
      contextWindowTokens: 1000,
    });

    const result = mergeMaskedSettings({ stored: storedBase, draft });
    expect('merged' in result).toBe(true);
    if ('merged' in result) {
      expect(result.merged.useIntelligentMode).toBe(false);
    }
  });

  it('missingApiKeyErrors', () => {
    const stored: StoredSettings = { ...storedBase, apiKey: '' };
    const draft = draftGw({
      apiKey: '',
      baseUrl: '',
      model: '',
      temperature: 0.7,
      topP: 1,
      includeStreamUsage: true,
    });

    const result = mergeMaskedSettings({ stored, draft });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('Please enter an API Key.');
    }
  });
});
