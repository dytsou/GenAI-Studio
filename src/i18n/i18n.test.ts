import { describe, it, expect, beforeEach } from "vitest";
import { initI18n, getI18n } from "./i18n";

describe("i18n init", () => {
  beforeEach(async () => {
    // Each test file runs in a single VM; ensure initialized before asserts.
    await initI18n("en");
  });

  it("initializes with en and returns known key", () => {
    expect(getI18n().language).toBe("en");
    expect(getI18n().t("app.name")).toBe("GenAI Studio");
  });

  it("returns key for missing translations without throwing", () => {
    expect(() => getI18n().t("missing.key")).not.toThrow();
    expect(getI18n().t("missing.key")).toBe("missing.key");
  });

  it("switches language to zh-TW", async () => {
    await initI18n("zh-TW");
    expect(getI18n().language).toBe("zh-TW");
    expect(getI18n().t("app.name")).toBe("GenAI Studio");
  });
});
