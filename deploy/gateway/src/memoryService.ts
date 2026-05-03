import pg from "pg";
import { autoTagMemoryContent, sanitizeMemoryTags } from "./memoryApiTypes.js";

const { Pool } = pg;

let poolSingleton: pg.Pool | null | undefined;
let schemaEnsured: Promise<void> | null = null;

async function ensureMemorySchema(pool: pg.Pool): Promise<void> {
  // Idempotent schema upgrades for existing persisted volumes.
  // `deploy/postgres/init.sql` is only applied on first container init.
  await pool.query(`CREATE EXTENSION IF NOT EXISTS pgcrypto;`);
  await pool.query(`
    CREATE TABLE IF NOT EXISTS memory_chunks (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      workspace_id TEXT NOT NULL,
      content TEXT NOT NULL,
      embedding DOUBLE PRECISION[],
      tags TEXT[] NOT NULL DEFAULT '{}',
      keyphrases TEXT[] NOT NULL DEFAULT '{}',
      deleted_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    );
  `);
  await pool.query(
    `ALTER TABLE memory_chunks ADD COLUMN IF NOT EXISTS tags TEXT[] NOT NULL DEFAULT '{}';`,
  );
  await pool.query(
    `ALTER TABLE memory_chunks ADD COLUMN IF NOT EXISTS keyphrases TEXT[] NOT NULL DEFAULT '{}';`,
  );
  await pool.query(
    `ALTER TABLE memory_chunks ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS memory_chunks_workspace_idx ON memory_chunks (workspace_id);`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS memory_chunks_workspace_created_idx ON memory_chunks (workspace_id, created_at DESC);`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS memory_chunks_workspace_tags_gin ON memory_chunks USING GIN (tags);`,
  );
}

export function getPgPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (poolSingleton === undefined) {
    poolSingleton = new Pool({ connectionString: url });
    schemaEnsured = ensureMemorySchema(poolSingleton).catch((e) => {
      console.warn(
        "[memory] failed to ensure schema; memory may be degraded",
        e,
      );
    });
  }
  return poolSingleton;
}

function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dp = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i++) {
    dp += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const d = Math.sqrt(na) * Math.sqrt(nb);
  return d === 0 ? 0 : dp / d;
}

export async function embedText(params: {
  auth: string;
  baseUrl: string;
  text: string;
}): Promise<number[] | null> {
  const model = process.env.EMBEDDING_MODEL || "text-embedding-3-small";
  const res = await fetch(`${params.baseUrl}/embeddings`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${params.auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ model, input: params.text }),
  });
  if (!res.ok) {
    console.warn("[memory] embeddings failed", res.status, await res.text());
    return null;
  }
  const json = (await res.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const emb = json.data?.[0]?.embedding;
  return Array.isArray(emb) ? emb : null;
}

export async function retrieveTopKChunks(params: {
  pool: pg.Pool;
  workspaceId: string;
  embedding: number[];
  topK: number;
}): Promise<string[]> {
  const { rows } = await params.pool.query<{
    content: string;
    embedding: number[] | null;
  }>(
    `SELECT content, embedding FROM memory_chunks WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 200`,
    [params.workspaceId],
  );
  const scored = rows
    .map((r) => ({
      content: r.content,
      score: Array.isArray(r.embedding)
        ? cosineSimilarity(params.embedding, r.embedding)
        : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, params.topK)
    .map((r) => r.content);
  return scored;
}

export type MemoryChunkDbRow = {
  id: string;
  content: string;
  embedding: number[] | null;
  created_at: string;
  tags: string[] | null;
  keyphrases: string[] | null;
  deleted_at: string | null;
};

export type MemoryChunkHit = {
  chunk_id: string;
  content: string;
  created_at: string;
  tags: string[];
  keyphrases: string[];
  score: number;
};

function sortHitsDeterministically(
  a: MemoryChunkHit,
  b: MemoryChunkHit,
): number {
  if (b.score !== a.score) return b.score - a.score;
  if (a.created_at !== b.created_at)
    return a.created_at < b.created_at ? 1 : -1;
  return a.chunk_id.localeCompare(b.chunk_id);
}

export async function retrieveTopKChunkHits(params: {
  pool: pg.Pool;
  workspaceId: string;
  embedding: number[];
  topK: number;
  /** Scan window; defensive cap to keep JS scoring bounded. */
  scanLimit?: number;
}): Promise<MemoryChunkHit[]> {
  const scanLimit = Math.min(
    2000,
    Math.max(50, Math.floor(params.scanLimit ?? 500)),
  );
  const { rows } = await params.pool.query<MemoryChunkDbRow>(
    `SELECT id, content, embedding, created_at, tags, keyphrases
     FROM memory_chunks
     WHERE workspace_id = $1 AND deleted_at IS NULL
     ORDER BY created_at DESC
     LIMIT $2`,
    [params.workspaceId, scanLimit],
  );
  const scored = rows
    .map((r) => ({
      chunk_id: r.id,
      content: r.content,
      created_at: r.created_at,
      tags: Array.isArray(r.tags) ? r.tags : [],
      keyphrases: Array.isArray(r.keyphrases) ? r.keyphrases : [],
      score: Array.isArray(r.embedding)
        ? cosineSimilarity(params.embedding, r.embedding)
        : 0,
    }))
    .sort(sortHitsDeterministically)
    .slice(0, params.topK);
  return scored;
}

export async function searchChunkHits(params: {
  pool: pg.Pool;
  workspaceId: string;
  embedding: number[];
  /** If provided, only include chunks with ALL these tags. */
  tagsAll?: string[];
  /** ISO bounds (inclusive). */
  createdFrom?: string;
  createdTo?: string;
  limit: number;
  offset: number;
  scanLimit?: number;
}): Promise<{ hits: MemoryChunkHit[]; scanned: number }> {
  const scanLimit = Math.min(
    5000,
    Math.max(50, Math.floor(params.scanLimit ?? 1200)),
  );
  const limit = Math.min(50, Math.max(1, Math.floor(params.limit)));
  const offset = Math.max(0, Math.floor(params.offset));

  const where: string[] = ["workspace_id = $1", "deleted_at IS NULL"];
  const args: Array<string | number | string[]> = [params.workspaceId];

  if (params.createdFrom) {
    args.push(params.createdFrom);
    where.push(`created_at >= $${args.length}`);
  }
  if (params.createdTo) {
    args.push(params.createdTo);
    where.push(`created_at <= $${args.length}`);
  }
  if (params.tagsAll && params.tagsAll.length > 0) {
    args.push(params.tagsAll);
    where.push(`tags @> $${args.length}::text[]`);
  }

  args.push(scanLimit);

  const { rows } = await params.pool.query<MemoryChunkDbRow>(
    `SELECT id, content, embedding, created_at, tags, keyphrases
     FROM memory_chunks
     WHERE ${where.join(" AND ")}
     ORDER BY created_at DESC
     LIMIT $${args.length}`,
    args,
  );

  const scoredAll = rows
    .map((r) => ({
      chunk_id: r.id,
      content: r.content,
      created_at: r.created_at,
      tags: Array.isArray(r.tags) ? r.tags : [],
      keyphrases: Array.isArray(r.keyphrases) ? r.keyphrases : [],
      score: Array.isArray(r.embedding)
        ? cosineSimilarity(params.embedding, r.embedding)
        : 0,
    }))
    .sort(sortHitsDeterministically);

  const hits = scoredAll.slice(offset, offset + limit);
  return { hits, scanned: rows.length };
}

export async function loadChunksByIds(params: {
  pool: pg.Pool;
  workspaceId: string;
  chunkIds: string[];
}): Promise<
  Array<{
    chunk_id: string;
    content: string;
    created_at: string;
    tags: string[];
    keyphrases: string[];
  }>
> {
  const ids = Array.from(new Set(params.chunkIds)).filter(Boolean);
  if (ids.length === 0) return [];
  const { rows } = await params.pool.query<{
    id: string;
    content: string;
    created_at: string;
    tags: string[] | null;
    keyphrases: string[] | null;
  }>(
    `SELECT id, content, created_at, tags, keyphrases
     FROM memory_chunks
     WHERE workspace_id = $1 AND deleted_at IS NULL AND id = ANY($2::uuid[])`,
    [params.workspaceId, ids],
  );
  const byId = new Map(
    rows.map((r) => [
      r.id,
      {
        chunk_id: r.id,
        content: r.content,
        created_at: r.created_at,
        tags: Array.isArray(r.tags) ? r.tags : [],
        keyphrases: Array.isArray(r.keyphrases) ? r.keyphrases : [],
      },
    ]),
  );
  return ids.flatMap((id) => {
    const v = byId.get(id);
    return v ? [v] : [];
  });
}

export async function insertMemoryChunk(params: {
  pool: pg.Pool;
  workspaceId: string;
  content: string;
  embedding: number[] | null;
  tags?: unknown;
  keyphrases?: unknown;
}): Promise<void> {
  const tags =
    params.tags === undefined
      ? autoTagMemoryContent(params.content)
      : sanitizeMemoryTags(params.tags);
  const keyphrases =
    params.keyphrases === undefined
      ? []
      : Array.isArray(params.keyphrases)
        ? params.keyphrases
            .filter((p): p is string => typeof p === "string")
            .map((p) => p.trim())
            .filter(Boolean)
        : [];
  await params.pool.query(
    `INSERT INTO memory_chunks (workspace_id, content, embedding, tags, keyphrases) VALUES ($1, $2, $3, $4, $5)`,
    [params.workspaceId, params.content, params.embedding, tags, keyphrases],
  );
}
