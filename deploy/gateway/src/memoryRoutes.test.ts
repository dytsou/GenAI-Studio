import request from "supertest";
import { describe, expect, it, vi } from "vitest";

import { createApp } from "./app.js";
import * as memoryService from "./memoryService.js";

describe("memory routes", () => {
  it("GET /v1/memory/recent requires X-Workspace-Id", async () => {
    const app = createApp();
    const res = await request(app).get("/v1/memory/recent").expect(400);
    expect(String(res.body.error?.message)).toContain("Workspace");
  });
  it("GET /v1/memory/recent returns 503 when DB missing", async () => {
    const old = process.env.DATABASE_URL;
    delete process.env.DATABASE_URL;
    const app = createApp();
    await request(app)
      .get("/v1/memory/recent")
      .set({ "X-Workspace-Id": "ws" })
      .expect(503);
    if (old) process.env.DATABASE_URL = old;
  });
  it("GET /v1/memory/recent returns chunks with preview, tags, and keyphrases", async () => {
    vi.spyOn(memoryService, "getPgPool").mockReturnValue({
      query: vi.fn(async () => ({
        rows: [
          {
            id: "00000000-0000-0000-0000-000000000000",
            content: "hello world",
            created_at: "2026-05-03T00:00:00.000Z",
            tags: ["fact"],
            keyphrases: ["hello", "world"],
          },
        ],
      })),
    } as unknown as ReturnType<typeof memoryService.getPgPool>);

    const app = createApp();
    const res = await request(app)
      .get("/v1/memory/recent?limit=20")
      .set({ "X-Workspace-Id": "ws" })
      .expect(200);

    expect(res.headers["cache-control"]).toContain("no-store");
    expect(res.body.chunks).toHaveLength(1);
    expect(res.body.chunks[0]).toEqual({
      chunk_id: "00000000-0000-0000-0000-000000000000",
      created_at: "2026-05-03T00:00:00.000Z",
      preview: expect.any(String),
      tags: ["fact"],
      keyphrases: ["hello", "world"],
    });
  });
});
