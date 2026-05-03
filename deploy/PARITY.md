# Gateway parity & memory behavior

## Chat vs Intelligent persistence

| Route                       | Persists long-term retrieval to                              | Notes                                                                                                                                                                              |
| --------------------------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `POST /v1/chat`             | `memory_chunks` (Postgres text + optional embedding vectors) | Save policy controlled by **`MEMORY_CHAT_SAVE_STRATEGY`** (`facts` \| `verbatim`).                                                                                                 |
| `POST /v1/intelligent/chat` | `memory_chunks` when `X-Memory-Enabled: true` assistant save | Structured session/global tiers live in **other** Intelligent tables elsewhere in the broader stack; hosted gateway bundle here mirrors assistant text chunk only for that toggle. |

`facts` aligns with semantic “worth saving” excerpts; `verbatim` stores the **whole** trimmed assistant reply (larger disclosure surface).

## Standard `/v1/chat` memory env

See `deploy/.env.example`. Operator-facing summary:

| Variable                            | Meaning                                                                                                                                                 |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MEMORY_CHAT_SAVE_STRATEGY`         | `facts` (default): extraction + chunked inserts. `verbatim`: legacy whole-reply path (assistant length gate still applies).                             |
| `MEMORY_CHAT_FACTS_MAX_ITEMS`       | Upper bound on how many discrete facts insert per assistant turn (`facts`).                                                                             |
| `MEMORY_CHAT_FACT_MAX_CHARS`        | Max characters per extracted fact **after** truncation.                                                                                                 |
| `MEMORY_CHAT_FACTS_MAX_TOTAL_CHARS` | Rough cap on summed fact length for one extraction batch.                                                                                               |
| `MEMORY_EXTRACTION_MODEL`           | Optional — defaults to **the inbound chat body `model`** (then `gpt-4o-mini` if absent). Extra LiteLLM `chat/completions` call used only under `facts`. |

Extraction uses `response_format.json_schema.name = standard_chat_memory_facts` — distinct from any Intelligent refresh schema stub your LiteLLM test harness may emulate.

### Automated verification

- **HTTP mocks:** `pnpm run test:e2e` in `deploy/gateway`.
- **`memory_chunks` row counts:** `pnpm run test:e2e:runtime` with Postgres up and `DATABASE_URL` set (`deploy/README.md`). Uses `globalThis.fetch` stubs from **`src/e2e/harness.ts`** + real `pg` client `COUNT(*)`.

Operational behavior when `facts`:

- LiteLLM (or upstream) **`/chat/completions` non-stream** JSON extraction fires **after** the user-visible reply completes.
- Extraction/embed/insert failures **skip saving** — no downgrade to `verbatim` (rollback only via env).
- No **`stream: false` vs SSE** divergence for **when** save runs — both branches finish persistence after the outbound response is finalized.

### Residual caution

Tenant isolation is **`X-Workspace-Id`** only — anyone who guesses or reuses workspace IDs shares the same Postgres partition. Persisted memory enlarges blast radius document as an operational/security review item alongside auth.
