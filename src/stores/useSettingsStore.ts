import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export interface SchemaField {
  id: string;
  name: string;
  type: 'string' | 'number' | 'boolean' | 'array' | 'object';
  required: boolean;
  description: string;
}

interface SettingsState {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  /** Max context window for stats denominator (tokens). */
  contextWindowTokens: number;
  /** Request usage in stream when supported (OpenAI-compatible). */
  includeStreamUsage: boolean;
  systemPrompt: string;
  structuredOutputMode: boolean;
  schemaFields: SchemaField[];

  /** When true, chat uses hosted gateway paths instead of direct upstream `/chat/completions`. */
  useHostedGateway: boolean;
  gatewayBaseUrl: string;
  /** Intelligent route `POST .../v1/intelligent/chat` (only when gateway is on). */
  useIntelligentMode: boolean;

  /** Long-term memory retrieve + save on gateway (`X-Memory-*`). */
  memoryEnabled: boolean;
  /** 1–16 (project-config); gateway clamps. */
  memoryTopK: number;
  /** Tool loop (`X-Tools-Enabled`). */
  toolsEnabled: boolean;

  /** Intelligent-mode memory tiers (gateway headers `X-Studio-Intelligent-*`). */
  intelligentIncludeSessionMemory: boolean;
  intelligentIncludeGlobalMemory: boolean;
  /** When false, injected memory values shown with masking/framing server-side UX contract. */
  intelligentRevealMemoryUi: boolean;

  setSettings: (settings: Partial<SettingsState>) => void;
  setSchemaFields: (fields: SchemaField[]) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o',
      temperature: 0.7,
      topP: 1.0,
      maxTokens: 4096,
      contextWindowTokens: 128000,
      includeStreamUsage: true,
      systemPrompt: '',
      structuredOutputMode: false,
      schemaFields: [
        {
          id: '1',
          name: 'summary',
          type: 'string',
          required: true,
          description: 'A short summary',
        },
      ],

      useHostedGateway: false,
      gatewayBaseUrl: 'http://127.0.0.1:8080',
      useIntelligentMode: false,
      memoryEnabled: true,
      memoryTopK: 8,
      toolsEnabled: false,
      intelligentIncludeSessionMemory: true,
      intelligentIncludeGlobalMemory: true,
      intelligentRevealMemoryUi: false,

      setSettings: (settings) => set((state) => ({ ...state, ...settings })),
      setSchemaFields: (fields) => set(() => ({ schemaFields: fields })),
    }),
    {
      name: 'chatgpt-settings-storage',
    },
  ),
);
