import type { Request } from "express";

export function normalizeUpstreamOrigin(baseUrl: string): string | null {
  try {
    const trimmed = baseUrl.trim();
    const u = new URL(trimmed.endsWith("/") ? trimmed.slice(0, -1) : trimmed);
    if (u.username || u.password) return null;
    if (u.protocol !== "http:" && u.protocol !== "https:") return null;
    return `${u.protocol}//${u.host}`.toLowerCase();
  } catch {
    return null;
  }
}

function hostnameLooksPrivate(hostname: string): boolean {
  const h = hostname.toLowerCase();
  if (h === "localhost" || h === "[::1]") return true;
  if (h.endsWith(".localhost") || h.endsWith(".local")) return true;
  if (!/^\d{1,3}(\.\d{1,3}){3}$/.test(h)) return false;
  const parts = h.split(".").map((x) => Number(x));
  const [a, b] = parts;
  if (a === 10) return true;
  if (a === 127) return true;
  if (a === 169 && b === 254) return true;
  if (a === 192 && b === 168) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;
  return false;
}

export type ValidateUpstreamResult =
  | { ok: true }
  | {
      ok: false;
      code:
        | "invalid_upstream_url"
        | "private_upstream_forbidden"
        | "upstream_origin_not_allowed";
    };

export function validateUpstreamUrl(baseUrl: string): ValidateUpstreamResult {
  const origin = normalizeUpstreamOrigin(baseUrl);
  if (!origin) return { ok: false, code: "invalid_upstream_url" };

  const list = process.env.ALLOWED_UPSTREAM_ORIGINS?.trim();
  if (list) {
    const allowed = list
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    for (const entry of allowed) {
      const norm = entry.replace(/\/+$/, "");
      const ao = normalizeUpstreamOrigin(norm);
      if (ao && ao === origin) return { ok: true };
    }
    return { ok: false, code: "upstream_origin_not_allowed" };
  }

  const blockPrivate = ["1", "true", "yes"].includes(
    String(process.env.GATEWAY_BLOCK_PRIVATE_UPSTREAM || "").toLowerCase(),
  );
  if (blockPrivate) {
    try {
      const host = new URL(baseUrl).hostname;
      if (hostnameLooksPrivate(host))
        return { ok: false, code: "private_upstream_forbidden" };
    } catch {
      return { ok: false, code: "invalid_upstream_url" };
    }
  }

  return { ok: true };
}

const FORBIDDEN_MESSAGE: Record<
  Extract<ValidateUpstreamResult, { ok: false }>["code"],
  string
> = {
  invalid_upstream_url: "Invalid or disallowed X-Upstream-Base-Url.",
  private_upstream_forbidden:
    "That upstream hostname is blocked (GATEWAY_BLOCK_PRIVATE_UPSTREAM).",
  upstream_origin_not_allowed:
    "Upstream origin is not listed in ALLOWED_UPSTREAM_ORIGINS.",
};

export type ReadUpstreamResult =
  | { ok: true; auth: string; baseUrl: string }
  | { ok: false; status: 401 | 403; message: string };

export function readUpstream(req: Request): ReadUpstreamResult {
  const rawAuth = req.header("authorization") || "";
  const m = /^Bearer\s+(.+)$/i.exec(rawAuth);
  const token = m?.[1]?.trim();
  let baseUrl = req.header("x-upstream-base-url")?.trim() || "";
  if (!token || !baseUrl)
    return {
      ok: false,
      status: 401,
      message:
        "Missing Authorization Bearer token or X-Upstream-Base-Url header.",
    };
  baseUrl = baseUrl.replace(/\/+$/, "");
  const val = validateUpstreamUrl(baseUrl);
  if (!val.ok)
    return {
      ok: false,
      status: 403,
      message: FORBIDDEN_MESSAGE[val.code],
    };
  return { ok: true, auth: token, baseUrl };
}
