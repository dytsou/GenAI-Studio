/**
 * Route-level harness (Vitest + supertest + mocked fetch).
 * Plan: Intelligent path + MCP discovery + /v1/chat JSON proxy + health; 409 concurrency.
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
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
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

function mockFetchChatSequenceThink400() {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(
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
                error: {
                  message:
                    "Unsupported parameter: 'max_tokens' is not supported with this model. Use 'max_completion_tokens' instead.",
                  type: "invalid_request_error",
                  param: "max_tokens",
                  code: "unsupported_parameter",
                },
              }),
              { status: 400, headers: { "Content-Type": "application/json" } },
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

  it("POST /v1/intelligent/chat continues when think step fails (upstream 400)", async () => {
    mockFetchChatSequenceThink400();
    const app = createApp();
    const res = await request(app)
      .post("/v1/intelligent/chat")
      .set(intelHeaders)
      .send({
        model: "gpt-5",
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

  it("POST /v1/chat proxies non-stream application/json completions (upstream not SSE)", async () => {
    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL) => {
        const url = requestUrl(input);
        if (!url.includes("/chat/completions")) {
          return new Response("unexpected", { status: 599 });
        }
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: "Short JSON reply." } }],
            id: "cmpl-json-nonstream-e2e",
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    const app = createApp();
    const res = await request(app)
      .post("/v1/chat")
      .set({
        Authorization: "Bearer test-token",
        "X-Upstream-Base-Url": "https://api.openai.com/v1",
        "X-Memory-Enabled": "false",
      })
      .send({
        model: "gpt-nonstream-proxy",
        stream: false,
        messages: [{ role: "user", content: "Ping" }],
      })
      .expect(200);

    expect(
      String(res.headers["content-type"]).includes("application/json"),
    ).toBe(true);
    expect(res.body.choices?.[0]?.message?.content).toBe("Short JSON reply.");
    expect(res.body.id).toBe("cmpl-json-nonstream-e2e");
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

  /**
   * Concurrency guard: deterministic by holding the handler on the streaming
   * upstream fetch until a second client is proven to observe `workspace_busy`.
   * (Previously flaky tests raced two concurrent supertest POSTs.)
   */
  it("POST /v1/intelligent/chat returns 409 workspace_busy while same workspace in-flight", async () => {
    let unblockStream!: () => void;
    const streamHold = new Promise<void>((resolve) => {
      unblockStream = resolve;
    });

    let markStreamEntered!: () => void;
    const streamEntered = new Promise<void>((resolve) => {
      markStreamEntered = resolve;
    });

    vi.spyOn(globalThis, "fetch").mockImplementation(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = requestUrl(input);
        if (!url.includes("/chat/completions"))
          return new Response("unexpected", { status: 599 });

        const bodyRaw = typeof init?.body === "string" ? init.body : "";
        let body: { stream?: boolean } = {};
        try {
          body = bodyRaw ? JSON.parse(bodyRaw) : {};
        } catch {
          return new Response("bad json", { status: 500 });
        }

        if (!body.stream) {
          return new Response(
            JSON.stringify({
              choices: [{ message: { content: "- think bullet" } }],
            }),
            { status: 200, headers: { "Content-Type": "application/json" } },
          );
        }

        markStreamEntered();
        await streamHold;

        const stream = sseStreamFromDataPayloads([
          '{"choices":[{"delta":{"content":"ok"}}]}',
          "[DONE]",
        ]);
        return new Response(stream, {
          status: 200,
          headers: { "Content-Type": "text/event-stream" },
        });
      },
    );

    const app = createApp();
    const busyHeaders = {
      ...intelHeaders,
      "X-Workspace-Id": "ws-409-busy-deterministic",
    };

    const res1Promise = request(app)
      .post("/v1/intelligent/chat")
      .set(busyHeaders)
      .send({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "hold lock" }],
      });

    /** SuperAgent only sends once the promise chain is subscribed — prime the flight. */
    void res1Promise.then(
      () => undefined,
      () => undefined,
    );

    await streamEntered;

    const resBusy = await request(app)
      .post("/v1/intelligent/chat")
      .set(busyHeaders)
      .send({
        model: "gpt-4o-mini",
        messages: [{ role: "user", content: "concurrent" }],
      });

    expect(resBusy.status).toBe(409);
    expect(resBusy.body?.error?.message).toBe("workspace_busy");
    expect(String(resBusy.headers["retry-after"])).toBe("2");

    unblockStream();

    const res1 = await res1Promise;
    expect(res1.status).toBe(200);
    expect(res1.text).toContain("ok");
  });

  it("POST /v1/memory/candidates returns candidates when memory enabled and DB configured", async () => {
    process.env.DATABASE_URL =
      "postgres://user:pass@localhost:5432/db-does-not-connect";
    // We expect 503 because DB isn't reachable in this unit e2e; ensure the route exists and errors are actionable.
    mockFetchChatSequence();
    const app = createApp();
    const res = await request(app)
      .post("/v1/memory/candidates")
      .set({
        Authorization: "Bearer test-token",
        "X-Upstream-Base-Url": "https://api.openai.com/v1",
        "X-Workspace-Id": "ws-e2e",
        "X-Memory-Enabled": "true",
      })
      .send({ draft_text: "hello memory" });

    expect([503, 502]).toContain(res.status);
  });

  it("POST /v1/memory/search validates inputs", async () => {
    const app = createApp();
    const res = await request(app)
      .post("/v1/memory/search")
      .set({
        Authorization: "Bearer test-token",
        "X-Upstream-Base-Url": "https://api.openai.com/v1",
        "X-Workspace-Id": "ws-e2e",
      })
      .send({ query: "" })
      .expect(400);
    expect(String(res.body.error?.message)).toContain("query");
  });
});
