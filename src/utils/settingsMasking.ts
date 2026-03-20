export type StoredSettings = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
};

export type MaskedSettingsDraft = {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number | '';
};

export type MergeMaskedSettingsResult =
  | { merged: StoredSettings }
  | { error: string };

/**
 * Merge masked draft values into stored settings.
 * Rule: For masked text fields, an empty draft value means "keep stored".
 */
export function mergeMaskedSettings(params: {
  stored: StoredSettings;
  draft: MaskedSettingsDraft;
}): MergeMaskedSettingsResult {
  const { stored, draft } = params;

  const merged: StoredSettings = {
    apiKey: draft.apiKey || stored.apiKey,
    baseUrl: draft.baseUrl || stored.baseUrl,
    model: draft.model || stored.model,
    temperature: draft.temperature,
    topP: draft.topP,
    maxTokens: draft.maxTokens === '' ? stored.maxTokens : draft.maxTokens,
  };

  if (!merged.apiKey) {
    return { error: 'Please enter an API Key.' };
  }

  return { merged };
}

