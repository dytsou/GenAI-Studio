import i18next from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./locales/en.json";
import zhTW from "./locales/zh-TW.json";

export const DEFAULT_LANGUAGE = "en" as const;
export const SUPPORTED_LANGUAGES = ["en", "zh-TW"] as const;

export type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number];

let initialized = false;
let initPromise: Promise<typeof i18next> | null = null;
let missingKeys = new Set<string>();

function isSupportedLanguage(value: string): value is SupportedLanguage {
  return (SUPPORTED_LANGUAGES as readonly string[]).includes(value);
}

export function normalizeLanguage(
  value: string | null | undefined,
): SupportedLanguage {
  if (!value) return DEFAULT_LANGUAGE;
  return isSupportedLanguage(value) ? value : DEFAULT_LANGUAGE;
}

/**
 * Idempotent initialization for both app runtime and tests.
 */
export function initI18n(
  language?: SupportedLanguage,
): Promise<typeof i18next> {
  if (initialized) {
    if (language && i18next.language !== language) {
      return i18next.changeLanguage(language).then(() => i18next);
    }
    return Promise.resolve(i18next);
  }

  if (initPromise) return initPromise;

  initPromise = i18next
    .use(initReactI18next)
    .init({
      lng: language ?? DEFAULT_LANGUAGE,
      fallbackLng: DEFAULT_LANGUAGE,
      supportedLngs: [...SUPPORTED_LANGUAGES],
      resources: {
        en: { translation: en },
        "zh-TW": { translation: zhTW },
      },
      interpolation: { escapeValue: false },
      returnNull: false,
      returnEmptyString: false,
      saveMissing: import.meta.env.MODE === "test",
      missingKeyHandler:
        import.meta.env.MODE === "test"
          ? (lng, _ns, key) => {
              const langs = Array.isArray(lng) ? lng : [lng];
              for (const l of langs) missingKeys.add(`${l}:${key}`);
            }
          : undefined,
    })
    .then(() => {
      initialized = true;
      return i18next;
    })
    .finally(() => {
      initPromise = null;
    });

  return initPromise;
}

export function getI18n() {
  if (!initialized) {
    throw new Error("i18n is not initialized. Call initI18n() first.");
  }
  return i18next;
}

export function t(key: string, options?: Record<string, unknown>) {
  return getI18n().t(key, options);
}

export function popMissingKeys(): string[] {
  const keys = [...missingKeys];
  missingKeys = new Set();
  return keys;
}
