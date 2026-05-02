import pg from 'pg';

const { Pool } = pg;

let poolSingleton: pg.Pool | null | undefined;

export function getPgPool(): pg.Pool | null {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) return null;
  if (poolSingleton === undefined) {
    poolSingleton = new Pool({ connectionString: url });
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

export async function embedText(params: { auth: string; baseUrl: string; text: string }): Promise<
  number[] | null
> {
  const model = process.env.EMBEDDING_MODEL || 'text-embedding-3-small';
  const res = await fetch(`${params.baseUrl}/embeddings`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.auth}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model, input: params.text }),
  });
  if (!res.ok) {
    console.warn('[memory] embeddings failed', res.status, await res.text());
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
  }>(`SELECT content, embedding FROM memory_chunks WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 200`, [
    params.workspaceId,
  ]);
  const scored = rows
    .map((r) => ({
      content: r.content,
      score: Array.isArray(r.embedding) ? cosineSimilarity(params.embedding, r.embedding) : 0,
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, params.topK)
    .map((r) => r.content);
  return scored;
}

export async function insertMemoryChunk(params: {
  pool: pg.Pool;
  workspaceId: string;
  content: string;
  embedding: number[] | null;
}): Promise<void> {
  await params.pool.query(`INSERT INTO memory_chunks (workspace_id, content, embedding) VALUES ($1, $2, $3)`, [
    params.workspaceId,
    params.content,
    params.embedding,
  ]);
}
