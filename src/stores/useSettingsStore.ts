import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface SettingsState {
  apiKey: string;
  baseUrl: string;
  model: string;
  temperature: number;
  topP: number;
  maxTokens: number;
  structuredOutputMode: boolean;
  setSettings: (settings: Partial<SettingsState>) => void;
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
      structuredOutputMode: false,
      setSettings: (settings) => set((state) => ({ ...state, ...settings })),
    }),
    {
      name: 'chatgpt-settings-storage',
    }
  )
);
