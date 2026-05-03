import { describe, it, expect, beforeEach } from "vitest";
import { initI18n, getI18n, popMissingKeys } from "./i18n";

const CANARY_KEYS = [
  "app.name",
  "sidebar.toggle",
  "sidebar.newChat",
  "sidebar.searchPlaceholder",
  "sidebar.searchAriaLabel",
  "sidebar.emptyNoChats",
  "sidebar.emptyNoMatches",
  "sidebar.selectChat",
  "sidebar.deleteChat",
  "sidebar.settings",
  "chat.emptySelectOrCreate",
  "chat.structuredOutput",
  "chat.welcome",
  "composer.placeholder",
  "message.errorOccurred",
  "settings.title",
  "memoryDrawer.title",
  "queue.title",
  "schema.title",
  "streamStats.ariaLabel",
] as const;

describe("i18n guardrails", () => {
  beforeEach(async () => {
    await initI18n("en");
    popMissingKeys();
  });

  it("captures missing keys during tests", () => {
    // Trigger a missing key lookup (test-mode saveMissing + handler).
    getI18n().t("missing.key");
    expect(popMissingKeys()).toContain("en:missing.key");
  });

  it("canary keys exist in both locales", () => {
    const i18n = getI18n();
    for (const lng of ["en", "zh-TW"] as const) {
      for (const key of CANARY_KEYS) {
        expect(i18n.exists(key, { lng })).toBe(true);
      }
    }
  });
});
