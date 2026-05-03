import { useSettingsStore } from "../stores/useSettingsStore";
import { getOrCreateWorkspaceId } from "./gatewayWorkspaceId";

export type MemoryChunkRow = {
  chunk_id: string;
  created_at: string;
  preview: string;
  tags: string[];
  keyphrases: string[];
  rank?: number;
  relevance_bucket?: "high" | "medium" | "low";
};

export type MemoryCandidatesResponse = {
  candidates: MemoryChunkRow[];
  draft_hash: string;
  memory_tokens_estimate?: number;
};

export async function fetchMemoryCandidates(params: {
  draftText: string;
  topK?: number;
  signal?: AbortSignal;
}): Promise<MemoryCandidatesResponse> {
  const s = useSettingsStore.getState();
  if (!s.useHostedGateway) throw new Error("Hosted gateway is not enabled.");
  const gw = (s.gatewayBaseUrl || "http://127.0.0.1:8080").replace(/\/$/, "");
  const url = `${gw}/v1/memory/candidates`;
  const workspaceId = getOrCreateWorkspaceId();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.apiKey}`,
      "X-Upstream-Base-Url": s.baseUrl.endsWith("/")
        ? s.baseUrl.slice(0, -1)
        : s.baseUrl,
      "X-Workspace-Id": workspaceId,
      "X-Memory-Enabled": s.memoryEnabled ? "true" : "false",
      "X-Memory-Top-K": String(s.memoryTopK),
    },
    body: JSON.stringify({ draft_text: params.draftText, top_k: params.topK }),
    signal: params.signal,
  });
  if (!res.ok) {
    throw new Error(`Memory candidates failed: ${res.status}`);
  }
  return (await res.json()) as MemoryCandidatesResponse;
}

export type MemorySearchRequest = {
  query: string;
  filters?: {
    time?: { from?: string; to?: string };
    tags?: string[];
  };
  pagination?: { limit?: number; cursor?: string };
};

export type MemorySearchResponse = {
  hits: MemoryChunkRow[];
  next_cursor?: string;
};

export type MemoryRecentResponse = {
  chunks: MemoryChunkRow[];
};

export async function fetchMemoryRecent(params: {
  limit?: number;
  signal?: AbortSignal;
}): Promise<MemoryRecentResponse> {
  const s = useSettingsStore.getState();
  if (!s.useHostedGateway) throw new Error("Hosted gateway is not enabled.");
  const gw = (s.gatewayBaseUrl || "http://127.0.0.1:8080").replace(/\/$/, "");
  const qs = typeof params.limit === "number" ? `?limit=${params.limit}` : "";
  const url = `${gw}/v1/memory/recent${qs}`;
  const workspaceId = getOrCreateWorkspaceId();

  const res = await fetch(url, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${s.apiKey}`,
      "X-Upstream-Base-Url": s.baseUrl.endsWith("/")
        ? s.baseUrl.slice(0, -1)
        : s.baseUrl,
      "X-Workspace-Id": workspaceId,
      "X-Memory-Enabled": s.memoryEnabled ? "true" : "false",
    },
    signal: params.signal,
  });
  if (!res.ok) {
    throw new Error(`Memory recent failed: ${res.status}`);
  }
  return (await res.json()) as MemoryRecentResponse;
}

export async function searchMemory(params: {
  request: MemorySearchRequest;
  signal?: AbortSignal;
}): Promise<MemorySearchResponse> {
  const s = useSettingsStore.getState();
  if (!s.useHostedGateway) throw new Error("Hosted gateway is not enabled.");
  const gw = (s.gatewayBaseUrl || "http://127.0.0.1:8080").replace(/\/$/, "");
  const url = `${gw}/v1/memory/search`;
  const workspaceId = getOrCreateWorkspaceId();
  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${s.apiKey}`,
      "X-Upstream-Base-Url": s.baseUrl.endsWith("/")
        ? s.baseUrl.slice(0, -1)
        : s.baseUrl,
      "X-Workspace-Id": workspaceId,
      "X-Memory-Enabled": s.memoryEnabled ? "true" : "false",
    },
    body: JSON.stringify(params.request),
    signal: params.signal,
  });
  if (!res.ok) {
    throw new Error(`Memory search failed: ${res.status}`);
  }
  return (await res.json()) as MemorySearchResponse;
}

export async function deleteMemoryChunk(params: {
  chunkId: string;
  signal?: AbortSignal;
}): Promise<void> {
  const s = useSettingsStore.getState();
  if (!s.useHostedGateway) throw new Error("Hosted gateway is not enabled.");
  const gw = (s.gatewayBaseUrl || "http://127.0.0.1:8080").replace(/\/$/, "");
  const url = `${gw}/v1/memory/chunks/${encodeURIComponent(params.chunkId)}`;
  const workspaceId = getOrCreateWorkspaceId();
  const res = await fetch(url, {
    method: "DELETE",
    headers: {
      Authorization: `Bearer ${s.apiKey}`,
      "X-Workspace-Id": workspaceId,
      "X-Memory-Enabled": s.memoryEnabled ? "true" : "false",
    },
    signal: params.signal,
  });
  if (res.status === 204) return;
  if (!res.ok) {
    throw new Error(`Memory delete failed: ${res.status}`);
  }
}
