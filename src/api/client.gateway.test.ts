import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../stores/useSettingsStore", () => ({
  useSettingsStore: { getState: vi.fn() },
}));

vi.mock("./gatewayWorkspaceId", () => ({
  getOrCreateWorkspaceId: () => "workspace-test-id",
}));

import { streamChatCompletions } from "./client";
import { useSettingsStore } from "../stores/useSettingsStore";

function gatewaySettings(overrides: Record<string, unknown> = {}) {
  return {
    apiKey: "sk-test",
    baseUrl: "https://api.openai.com/v1",
    model: "gpt-4o-mini",
    temperature: 0,
    topP: 1,
    maxTokens: 100,
    contextWindowTokens: 8192,
    includeStreamUsage: false,
    systemPrompt: "",
    structuredOutputMode: false,
    schemaFields: [],
    useHostedGateway: true,
    gatewayBaseUrl: "http://127.0.0.1:8089",
    useIntelligentMode: false,
    memoryEnabled: true,
    memoryTopK: 3,
    toolsEnabled: true,
    intelligentIncludeSessionMemory: true,
    intelligentIncludeGlobalMemory: true,
    intelligentRevealMemoryUi: false,
    setSettings: vi.fn(),
    setSchemaFields: vi.fn(),
    ...overrides,
  } as ReturnType<typeof useSettingsStore.getState>;
}

describe("streamChatCompletions hosted gateway", () => {
  beforeEach(() => {
    vi.mocked(useSettingsStore.getState).mockReset();
  });

  it("POSTs /v1/chat with gateway and memory/tool headers", async () => {
    vi.mocked(useSettingsStore.getState).mockReturnValue(gatewaySettings());

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(
              enc.encode('data: {"choices":[{"delta":{"content":"Hi"}}]}\n\n'),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    let out = "";
    for await (const ev of streamChatCompletions([
      { role: "user", content: "yo" },
    ])) {
      if (ev.type === "content") out += ev.text;
    }

    expect(out).toBe("Hi");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("http://127.0.0.1:8089/v1/chat");
    const h = new Headers(init.headers);
    expect(h.get("Authorization")).toBe("Bearer sk-test");
    expect(h.get("X-Upstream-Base-Url")).toBe("https://api.openai.com/v1");
    expect(h.get("X-Workspace-Id")).toBe("workspace-test-id");
    expect(h.get("X-Memory-Enabled")).toBe("true");
    expect(h.get("X-Memory-Top-K")).toBe("3");
    expect(h.get("X-Tools-Enabled")).toBe("true");

    fetchMock.mockRestore();
  });

  it("POSTs /v1/intelligent/chat with tier headers when intelligent mode on", async () => {
    vi.mocked(useSettingsStore.getState).mockReturnValue(
      gatewaySettings({
        useIntelligentMode: true,
      }),
    );

    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValue(
      new Response(
        new ReadableStream({
          start(controller) {
            const enc = new TextEncoder();
            controller.enqueue(
              enc.encode('data: {"choices":[{"delta":{"content":"!"}}]}\n\n'),
            );
            controller.close();
          },
        }),
        { status: 200, headers: { "Content-Type": "text/event-stream" } },
      ),
    );

    let streamed = "";
    for await (const ev of streamChatCompletions(
      [{ role: "user", content: "yo" }],
      undefined,
      undefined,
      undefined,
      {
        includeSessionMemory: false,
        includeGlobalMemory: true,
        revealMemoryValues: true,
      },
    )) {
      if (ev.type === "content") streamed += ev.text;
    }
    expect(streamed).toBe("!");

    const call = fetchMock.mock.calls[0] as [string, RequestInit] | undefined;
    const init = call?.[1];
    if (!init) throw new Error("expected fetch init");
    const h = new Headers(init.headers);
    expect(h.get("X-Studio-Intelligent-Session-Memory")).toBe("false");
    expect(h.get("X-Studio-Intelligent-Global-Memory")).toBe("true");
    expect(h.get("X-Studio-Intelligent-Reveal-Memory")).toBe("true");

    fetchMock.mockRestore();
  });
});
