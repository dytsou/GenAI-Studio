export type StoredSettings = {
  language: "en" | "zh-TW";
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  contextWindowTokens: number;
  includeStreamUsage: boolean;
  systemPrompt: string;
  useHostedGateway: boolean;
  gatewayBaseUrl: string;
  useIntelligentMode: boolean;
  memoryEnabled: boolean;
  memoryTopK: number;
  toolsEnabled: boolean;
  intelligentIncludeSessionMemory: boolean;
  intelligentIncludeGlobalMemory: boolean;
  intelligentRevealMemoryUi: boolean;
};

export type MaskedSettingsDraft = {
  language: "en" | "zh-TW";
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number | "";
  contextWindowTokens: number | "";
  includeStreamUsage: boolean;
  systemPrompt: string;
  gatewayBaseUrl: string;
  useHostedGateway: boolean;
  useIntelligentMode: boolean;
  memoryEnabled: boolean;
  memoryTopK: number | "";
  toolsEnabled: boolean;
  intelligentIncludeSessionMemory: boolean;
  intelligentIncludeGlobalMemory: boolean;
  intelligentRevealMemoryUi: boolean;
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
    language: draft.language,
    apiKey: draft.apiKey || stored.apiKey,
    baseUrl: draft.baseUrl || stored.baseUrl,
    model: draft.model || stored.model,
    temperature: draft.temperature,
    topP: draft.topP,
    maxTokens: draft.maxTokens === "" ? stored.maxTokens : draft.maxTokens,
    contextWindowTokens:
      draft.contextWindowTokens === ""
        ? stored.contextWindowTokens
        : draft.contextWindowTokens,
    includeStreamUsage: draft.includeStreamUsage,
    systemPrompt: draft.systemPrompt,
    useHostedGateway: draft.useHostedGateway,
    gatewayBaseUrl:
      draft.gatewayBaseUrl.trim() !== ""
        ? draft.gatewayBaseUrl.trim()
        : stored.gatewayBaseUrl,
    useIntelligentMode: draft.useIntelligentMode,
    memoryEnabled: draft.memoryEnabled,
    memoryTopK: draft.memoryTopK === "" ? stored.memoryTopK : draft.memoryTopK,
    toolsEnabled: draft.toolsEnabled,
    intelligentIncludeSessionMemory: draft.intelligentIncludeSessionMemory,
    intelligentIncludeGlobalMemory: draft.intelligentIncludeGlobalMemory,
    intelligentRevealMemoryUi: draft.intelligentRevealMemoryUi,
  };

  if (!merged.apiKey) {
    return { error: "Please enter an API Key." };
  }

  const topK =
    typeof merged.memoryTopK === "number"
      ? Math.min(16, Math.max(1, Math.floor(merged.memoryTopK)))
      : 8;
  merged.memoryTopK = topK;

  if (merged.useIntelligentMode && !merged.useHostedGateway) {
    merged.useIntelligentMode = false;
  }

  return { merged };
}
