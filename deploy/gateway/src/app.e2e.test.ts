/**
 * Route-level harness (Vitest + supertest + mocked fetch).
 * Plan: Intelligent path + MCP discovery + health; concurrency 409.
 */
import request from "supertest";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createApp } from "./app.js";

function requestUrl(input: RequestInfo | URL): string {
  if (typeof input === "string") return input;
  if (input instanceof URL) return input.href;
  return (input as Request).url;
}

/** Build an upstream-style SSE stream (each frame ends with `\n\n`). */
function sseStreamFromDataPayloads(payloads: string[]) {
  const enc = new TextEncoder();
  const body = payloads.map((p) => `data: ${p}\n\n`).join("");
  return new ReadableStream({
    start(c) {
      c.enqueue(enc.encode(body));
      c.close();
    },
  });
}

function mockFetchChatSequence() {
  return vi.spyOn(globalThis, "fetch").mockImplementation(
    async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = requestUrl(input);
      const bodyRaw = typeof init?.body === "string" ? init.body : "";
      let body: { stream?: boolean } = {};
      try {
        body = bodyRaw ? JSON.parse(bodyRaw) : {};
      } catch {
        return new Response("bad json", { status: 500 });
      }

      if (url.includes("/chat/completions")) {
        if (!body.stream) {
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: "- think bullet" } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        const stream = sseStreamFromDataPayloads([
          '{"choices":[{"delta":{"content":"Hey"}}]}',
          "[DONE]",
        ]);
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      }

      return new Response("unexpected", { status: 599 });
    },
  );
}

const intelHeaders = {
  Authorization: "Bearer test-token",
  "X-Upstream-Base-Url": "https://api.openai.com/v1",
  "X-Workspace-Id": "ws-e2e",
  "X-Memory-Enabled": "false",
  "x-studio-intelligent-session-memory": "false",
  "x-studio-intelligent-global-memory": "false",
};

describe("gateway e2e (supertest)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.MCP_TOOLS_JSON;
  });

  it("GET /health", async () => {
    const app = createApp();
    const res = await request(app).get("/health").expect(200);
    expect(res.body.ok).toBe(true);
    expect(res.body.service).toBe("genai-gateway");
  });

  it("GET /v1/mcp/discovery reflects MCP_TOOLS_JSON (MCP/env discovery)", async () => {
    process.env.MCP_TOOLS_JSON = JSON.stringify([
      {
        server: "demo",
        tools: [{ name: "ping", description: "Echo" }],
      },
    ]);
    const app = createApp();
    const res = await request(app).get("/v1/mcp/discovery").expect(200);
    expect(res.body.source).toBe("env");
    expect(res.body.servers).toEqual([
      {
        server: "demo",
        tools: [{ name: "ping", description: "Echo" }],
      },
    ]);
  });

  it("POST /v1/intelligent/chat streams answer with studio prelude (mock upstream)", async () => {
    mockFetchChatSequence();
    const app = createApp();
    const res = await request(app)
      .post("/v1/intelligent/chat")
      .set(intelHeaders)
      .send({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hello" }],
      })
      .expect(200);

    expect(res.headers["content-type"]?.includes("text/event-stream")).toBe(
      true,
    );
    expect(res.text).toContain('"kind":"meta"');
    expect(res.text).toContain("Hey");
    expect(res.text).toContain("[DONE]");
  });

  it("POST /v1/intelligent/chat requires X-Workspace-Id", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/v1/intelligent/chat")
      .set({
        Authorization: "Bearer t",
        "X-Upstream-Base-Url": "https://api.openai.com/v1",
      })
      .send({ model: "m", messages: [{ role: "user", content: "x" }] })
      .expect(400);

    expect(String(res.body.error?.message)).toContain("Workspace");
  });
});
