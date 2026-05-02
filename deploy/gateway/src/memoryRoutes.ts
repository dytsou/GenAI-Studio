import express from "express";
import { createHash } from "node:crypto";
import { readUpstream } from "./upstream.js";
import {
  getPgPool,
  embedText,
  retrieveTopKChunkHits,
  searchChunkHits,
} from "./memoryService.js";
import { makeChunkPreview, sanitizeMemoryTags } from "./memoryApiTypes.js";

function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

function clampTopK(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(16, Math.max(1, Math.floor(x)));
}

function clampLimit(n: unknown, fallback: number): number {
  const x = typeof n === "number" ? n : Number(n);
  if (!Number.isFinite(x)) return fallback;
  return Math.min(50, Math.max(1, Math.floor(x)));
}

function decodeCursor(raw: unknown): number {
  if (typeof raw !== "string" || !raw) return 0;
  try {
    const n = Number(Buffer.from(raw, "base64url").toString("utf8"));
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  } catch {
    return 0;
  }
}

function encodeCursor(n: number): string {
  return Buffer.from(String(Math.max(0, Math.floor(n))), "utf8").toString(
    "base64url",
  );
}

function relevanceBucket(score: number): "high" | "medium" | "low" {
  if (score >= 0.82) return "high";
  if (score >= 0.65) return "medium";
  return "low";
}

export function createMemoryRoutes(): express.Router {
  const r = express.Router();

  r.post("/v1/memory/candidates", async (req, res) => {
    const ur = readUpstream(req);
    if (!ur.ok)
      return res.status(ur.status).json({ error: { message: ur.message } });
    const up = { auth: ur.auth, baseUrl: ur.baseUrl };

    const workspaceId = String(req.header("x-workspace-id") || "").trim();
    if (!workspaceId) {
      return res
        .status(400)
        .json({ error: { message: "X-Workspace-Id header is required." } });
    }

    const memEnabled =
      String(req.header("x-memory-enabled") || "false").toLowerCase() ===
      "true";
    if (!memEnabled) {
      return res.json({
        candidates: [],
        draft_hash: "",
        memory_tokens_estimate: 0,
      });
    }

    const pool = getPgPool();
    if (!pool) {
      return res
        .status(503)
        .json({ error: { message: "Memory database is not configured." } });
    }

    const body = req.body as { draft_text?: unknown; top_k?: unknown };
    const draftText =
      typeof body?.draft_text === "string" ? body.draft_text.trim() : "";
    if (!draftText) {
      return res
        .status(400)
        .json({ error: { message: "`draft_text` is required." } });
    }

    const headerTopK = clampTopK(req.header("x-memory-top-k"), 8);
    const topK = clampTopK(body?.top_k, headerTopK);

    const emb = await embedText({
      auth: up.auth,
      baseUrl: up.baseUrl,
      text: draftText.slice(0, 2000),
    });
    if (!emb) {
      return res
        .status(502)
        .json({ error: { message: "Embedding query failed." } });
    }

    const hits = await retrieveTopKChunkHits({
      pool,
      workspaceId,
      embedding: emb,
      topK,
    });

    const candidates = hits.map((h, idx) => ({
      chunk_id: h.chunk_id,
      created_at: h.created_at,
      preview: makeChunkPreview(h.content),
      tags: h.tags,
      rank: idx + 1,
      relevance_bucket: relevanceBucket(h.score),
    }));

    const draft_hash = createHash("sha256")
      .update(`${workspaceId}\n${topK}\n${draftText}`)
      .digest("base64url");

    const memory_tokens_estimate = estimateTokens(
      candidates.map((c) => c.preview).join("\n---\n"),
    );

    return res.json({ candidates, draft_hash, memory_tokens_estimate });
  });

  r.post("/v1/memory/search", async (req, res) => {
    const ur = readUpstream(req);
    if (!ur.ok)
      return res.status(ur.status).json({ error: { message: ur.message } });
    const up = { auth: ur.auth, baseUrl: ur.baseUrl };

    const workspaceId = String(req.header("x-workspace-id") || "").trim();
    if (!workspaceId) {
      return res
        .status(400)
        .json({ error: { message: "X-Workspace-Id header is required." } });
    }

    const pool = getPgPool();
    if (!pool) {
      return res
        .status(503)
        .json({ error: { message: "Memory database is not configured." } });
    }

    const body = req.body as {
      query?: unknown;
      filters?: {
        time?: { preset?: unknown; from?: unknown; to?: unknown };
        tags?: unknown;
      };
      pagination?: { limit?: unknown; cursor?: unknown };
    };
    const query = typeof body?.query === "string" ? body.query.trim() : "";
    if (!query) {
      return res
        .status(400)
        .json({ error: { message: "`query` is required." } });
    }

    const limit = clampLimit(body?.pagination?.limit, 20);
    const offset = decodeCursor(body?.pagination?.cursor);

    const tagsAll = sanitizeMemoryTags(body?.filters?.tags);

    const from =
      typeof body?.filters?.time?.from === "string"
        ? body.filters.time.from
        : undefined;
    const to =
      typeof body?.filters?.time?.to === "string"
        ? body.filters.time.to
        : undefined;

    const emb = await embedText({
      auth: up.auth,
      baseUrl: up.baseUrl,
      text: query.slice(0, 2000),
    });
    if (!emb) {
      return res
        .status(502)
        .json({ error: { message: "Embedding query failed." } });
    }

    const { hits } = await searchChunkHits({
      pool,
      workspaceId,
      embedding: emb,
      tagsAll,
      createdFrom: from,
      createdTo: to,
      limit,
      offset,
    });

    const out = hits.map((h, i) => ({
      chunk_id: h.chunk_id,
      created_at: h.created_at,
      preview: makeChunkPreview(h.content),
      tags: h.tags,
      rank: offset + i + 1,
      relevance_bucket: relevanceBucket(h.score),
    }));

    const next_cursor =
      out.length === limit ? encodeCursor(offset + out.length) : undefined;

    return res.json({ hits: out, next_cursor });
  });

  return r;
}
