import { afterEach, describe, expect, it, vi } from "vitest";
import {
  normalizeUpstreamOrigin,
  readUpstream,
  validateUpstreamUrl,
} from "./upstream.js";

describe("validateUpstreamUrl", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("allows any http(s) origin when ALLOWED_UPSTREAM_ORIGINS unset", () => {
    vi.stubEnv("ALLOWED_UPSTREAM_ORIGINS", "");
    expect(validateUpstreamUrl("https://api.openai.com/v1")).toEqual({
      ok: true,
    });
  });

  it("rejects when origin not in allowlist", () => {
    vi.stubEnv("ALLOWED_UPSTREAM_ORIGINS", "https://api.openai.com");
    expect(validateUpstreamUrl("https://evil.example/v1")).toEqual({
      ok: false,
      code: "upstream_origin_not_allowed",
    });
  });

  it("matches allowlisted origin regardless of path on base URL", () => {
    vi.stubEnv(
      "ALLOWED_UPSTREAM_ORIGINS",
      "https://api.openai.com/v1,https://second.example",
    );
    expect(validateUpstreamUrl("https://api.openai.com")).toEqual({
      ok: true,
    });
  });

  it("blocks private host when GATEWAY_BLOCK_PRIVATE_UPSTREAM=1", () => {
    vi.stubEnv("GATEWAY_BLOCK_PRIVATE_UPSTREAM", "1");
    expect(validateUpstreamUrl("http://127.0.0.1:11434/v1")).toEqual({
      ok: false,
      code: "private_upstream_forbidden",
    });
  });

  it("readUpstream returns 403 when validation fails", () => {
    vi.stubEnv("ALLOWED_UPSTREAM_ORIGINS", "https://only.example");
    const req = {
      header: vi.fn((name: string) => {
        if (name.toLowerCase() === "authorization") return "Bearer tok";
        if (name.toLowerCase() === "x-upstream-base-url")
          return "https://other.example/v1";
        return undefined;
      }),
    } as unknown as import("express").Request;
    const r = readUpstream(req);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.status).toBe(403);
      expect(r.message).toContain("ALLOWED_UPSTREAM_ORIGINS");
    }
  });
});

describe("normalizeUpstreamOrigin", () => {
  it("strips userinfo and path for comparison", () => {
    expect(normalizeUpstreamOrigin("https://api.openai.com/v1")).toBe(
      "https://api.openai.com",
    );
  });
});
