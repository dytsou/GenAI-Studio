CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS memory_chunks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id TEXT NOT NULL,
  content TEXT NOT NULL,
  embedding DOUBLE PRECISION[],
  tags TEXT[] NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS memory_chunks_workspace_idx ON memory_chunks (workspace_id);
CREATE INDEX IF NOT EXISTS memory_chunks_workspace_created_idx ON memory_chunks (workspace_id, created_at DESC);
CREATE INDEX IF NOT EXISTS memory_chunks_workspace_tags_gin ON memory_chunks USING GIN (tags);
