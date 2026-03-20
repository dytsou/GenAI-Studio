import { describe, it, expect } from 'vitest';
import { mergeMaskedSettings } from './settingsMasking';
import type { MaskedSettingsDraft, StoredSettings } from './settingsMasking';

const storedBase: StoredSettings = {
  apiKey: 'stored-key',
  baseUrl: 'https://api.openai.com/v1',
  model: 'gpt-4o',
  temperature: 0.7,
  topP: 1,
  maxTokens: 4096,
};

describe('mergeMaskedSettings', () => {
  it('emptyDraftKeepsStored', () => {
    const draft: MaskedSettingsDraft = {
      apiKey: '',
      baseUrl: '',
      model: '',
      temperature: 0.2,
      topP: 0.8,
      maxTokens: '',
    };

    const result = mergeMaskedSettings({ stored: storedBase, draft });

    expect('merged' in result).toBe(true);
    if ('merged' in result) {
      expect(result.merged).toEqual({
        ...storedBase,
        temperature: draft.temperature,
        topP: draft.topP,
      });
    }
  });

  it('draftOverridesStored', () => {
    const draft: MaskedSettingsDraft = {
      apiKey: 'draft-key',
      baseUrl: 'https://example.com/v1',
      model: 'llama-3',
      temperature: 0.1,
      topP: 0.9,
      maxTokens: 2048,
    };

    const result = mergeMaskedSettings({ stored: storedBase, draft });

    expect('merged' in result).toBe(true);
    if ('merged' in result) {
      expect(result.merged).toEqual({
        ...storedBase,
        apiKey: draft.apiKey,
        baseUrl: draft.baseUrl,
        model: draft.model,
        temperature: draft.temperature,
        topP: draft.topP,
        maxTokens: draft.maxTokens,
      });
    }
  });

  it('missingApiKeyErrors', () => {
    const stored: StoredSettings = { ...storedBase, apiKey: '' };
    const draft: MaskedSettingsDraft = {
      apiKey: '',
      baseUrl: '',
      model: '',
      temperature: 0.7,
      topP: 1,
      maxTokens: '',
    };

    const result = mergeMaskedSettings({ stored, draft });

    expect('error' in result).toBe(true);
    if ('error' in result) {
      expect(result.error).toBe('Please enter an API Key.');
    }
  });
});

