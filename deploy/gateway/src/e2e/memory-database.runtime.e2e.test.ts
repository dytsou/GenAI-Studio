/**
 * Postgres-backed runtime checks: real `memory_chunks` rows with mocked upstream (fetch).
 * Requires `DATABASE_URL` (e.g. compose Postgres on `127.0.0.1:5433`). Skipped when unset.
 */
import pg from "pg";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createApp } from "../app.js";
import { createLitellmUpstreamFetchMock } from "./harness.js";

const { Client } = pg;

const databaseUrl = process.env.DATABASE_URL?.trim();

describe.skipIf(!databaseUrl)(
  "runtime e2e: memory_chunks (Postgres + fetch stub)",
  () => {
    let client: pg.Client | undefined;

    beforeEach(async () => {
      client = new Client({ connectionString: databaseUrl! });
      await client.connect();
    });

    afterEach(async () => {
      vi.restoreAllMocks();
      delete process.env.MEMORY_CHAT_SAVE_STRATEGY;
      await client?.end().catch(() => undefined);
      client = undefined;
    });

    async function waitForRowCount(
      workspaceId: string,
      expected: number,
      ms = 10_000,
    ): Promise<void> {
      const deadline = Date.now() + ms;
      while (Date.now() < deadline) {
        if ((await rowCount(workspaceId)) === expected) return;
        await new Promise((r) => setTimeout(r, 25));
      }
      expect(await rowCount(workspaceId)).toBe(expected);
    }

    async function rowCount(workspaceId: string): Promise<number> {
      const { rows } = await client!.query<{ c: string }>(
        `SELECT COUNT(*)::text AS c FROM memory_chunks WHERE workspace_id = $1`,
        [workspaceId],
      );
      return Number(rows[0]?.c ?? 0);
    }

    async function purgeWorkspace(workspaceId: string): Promise<void> {
      await client!.query(`DELETE FROM memory_chunks WHERE workspace_id = $1`, [
        workspaceId,
      ]);
    }

    const chatHeaders = {
      Authorization: "Bearer runtime-token",
      "X-Upstream-Base-Url": "https://api.openai.com/v1",
      "X-Memory-Enabled": "true",
    };

    it("facts + SSE: inserts one row per extracted fact", async () => {
      process.env.MEMORY_CHAT_SAVE_STRATEGY = "facts";
      const ws = `ws-rt-${randomUUID()}`;
      await purgeWorkspace(ws);
      expect(await rowCount(ws)).toBe(0);

      vi.spyOn(globalThis, "fetch").mockImplementation(
        createLitellmUpstreamFetchMock({
          extractionFacts: [
            "Preference: prefers dark UI.",
            "Uses Postgres for persistence.",
          ],
          ssePayloads: [
            JSON.stringify({
              choices: [{ delta: { content: "Noted preferences." } }],
            }),
            "[DONE]",
          ],
        }),
      );

      const app = createApp();
      await request(app)
        .post("/v1/chat")
        .set({ ...chatHeaders, "X-Workspace-Id": ws })
        .send({
          model: "gpt-runtime",
          stream: true,
          messages: [
            {
              role: "user",
              content: "Remember: I prefer dark mode and Postgres.",
            },
          ],
        })
        .expect(200);

      await waitForRowCount(ws, 2);
      await purgeWorkspace(ws);
    });

    it("facts + empty extraction: no new rows", async () => {
      process.env.MEMORY_CHAT_SAVE_STRATEGY = "facts";
      const ws = `ws-rt-empty-${randomUUID()}`;
      await purgeWorkspace(ws);

      vi.spyOn(globalThis, "fetch").mockImplementation(
        createLitellmUpstreamFetchMock({
          extractionFacts: [],
          ssePayloads: [
            JSON.stringify({
              choices: [{ delta: { content: "Hi!" } }],
            }),
            "[DONE]",
          ],
        }),
      );

      const app = createApp();
      await request(app)
        .post("/v1/chat")
        .set({ ...chatHeaders, "X-Workspace-Id": ws })
        .send({
          model: "gpt-runtime",
          stream: true,
          messages: [{ role: "user", content: "Just saying hello." }],
        })
        .expect(200);

      await new Promise((r) => setTimeout(r, 200));
      expect(await rowCount(ws)).toBe(0);
      await purgeWorkspace(ws);
    });

    it("verbatim + JSON completion: single chunk insert over threshold", async () => {
      process.env.MEMORY_CHAT_SAVE_STRATEGY = "verbatim";
      const ws = `ws-rt-ver-${randomUUID()}`;
      await purgeWorkspace(ws);

      const assistant = `${"Detailed answer. ".repeat(4)}`; // >= 24 chars
      vi.spyOn(globalThis, "fetch").mockImplementation(
        createLitellmUpstreamFetchMock({
          nonStreamAssistantContent: assistant,
        }),
      );

      const app = createApp();
      const res = await request(app)
        .post("/v1/chat")
        .set({ ...chatHeaders, "X-Workspace-Id": ws })
        .send({
          model: "gpt-runtime-json",
          stream: false,
          messages: [{ role: "user", content: "Explain briefly." }],
        })
        .expect(200);

      expect(
        String(res.headers["content-type"]).includes("application/json"),
      ).toBe(true);
      await waitForRowCount(ws, 1);

      const { rows } = await client!.query<{ content: string }>(
        `SELECT content FROM memory_chunks WHERE workspace_id = $1 ORDER BY created_at DESC LIMIT 1`,
        [ws],
      );
      expect(rows[0]?.content?.includes("Detailed")).toBe(true);
      await purgeWorkspace(ws);
    });
  },
);
