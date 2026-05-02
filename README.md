# GenAI Studio

A local-first AI chat workspace built with React + TypeScript + Vite.

It supports streaming chat completions, multi-chat history, attachments (images/PDF), structured JSON output mode with schema editing, and GitHub Pages deployment through a single CI/CD workflow.

## How to configure (overview)

Pick **one** path and follow its section:

| Goal                                                                                                                                                       | Follow                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- |
| Use your API key in the browser and call OpenAI-compat **`/chat/completions` directly**                                                                    | [Mode A: Direct upstream](#mode-a-direct-upstream-spa-only) |
| Proxy through the repo **hosted gateway** (recommended for **voice transcribe**, **long-term memory** via Postgres, **tools inventory**, Intelligent mode) | [Mode B: Hosted gateway](#mode-b-hosted-gateway)            |

Gateway-specific env vars live in **`deploy/.env.example`** (copy to **`deploy/.env`** when customizing Compose). Memory behavior parity is summarized in **`deploy/PARITY.md`**.

## Features

- Multi-chat sidebar with create, search, switch, and delete.
- Streaming assistant responses (`/chat/completions` SSE-style chunks).
- Assistant messages rendered as **Markdown** (GFM) with **HTML sanitization** for safe display.
- Attachment support:
  - Images (up to 20MB each)
  - PDFs (up to 50MB each, converted to images before sending)
- Settings modal with persisted model/API settings:
  - API key and base URL (masked by default; **eye buttons beside each field** — press and hold to peek; release to hide again)
  - Model
  - Temperature / Top P / Max Tokens
  - Global system prompt
  - Optional **hosted gateway**: enable, set gateway base URL, intelligent mode, memory / tools (see [deploy/README.md](deploy/README.md))
- Per-message system prompt override in composer.
- Structured output mode:
  - Build JSON schema fields in UI
  - Send schema via `response_format`
  - Preview schema
  - Export last valid assistant JSON response as JSON/CSV
- Local persistence with Zustand (`chat` and `settings` stores).
- CI + deploy pipeline with pnpm and GitHub Actions.

## Tech Stack

- React 19
- TypeScript
- Vite 8
- Zustand (state + persistence)
- Vitest
- ESLint
- pnpm
- **react-markdown** + **remark-gfm** (message rendering)
- **dompurify** (sanitized HTML in messages)
- **pdfjs-dist** (PDF processing)
- **lucide-react** (icons)

## Project Structure

```text
src/
  api/
    client.ts                   # Chat completion streaming client
  components/
    Chat/                       # Composer, chat view, message rendering
    Sidebar/                    # Chat list + settings trigger
    SettingsModal/              # Model/API/system settings UI
    StructuredOutput/           # Schema workspace + exports
    Layout/                     # App shell
  stores/
    useChatStore.ts             # Chat persistence and operations
    useSettingsStore.ts         # Model/settings persistence
  utils/
    attachmentManager.ts        # Image/PDF validation and processing
    pdfProcessor.ts             # PDF to image conversion
    settingsMasking.ts          # Settings merge behavior
```

## Prerequisites

- Node.js 20+
- pnpm 10+
- Docker

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Choose a configuration mode:

### Mode A: Direct upstream (SPA only)

Use this when you **do not** run the gateway.

1. Start the SPA:

```bash
pnpm dev
```

2. Open the URL Vite prints (usually **`http://localhost:5173`**).

3. Open **Settings** in the app and set:
   - **API Base URL** (default `https://api.openai.com/v1`)
   - **API key** — use eye button to peek
   - **Model** / temperature / other options
   - Leave **Use hosted gateway** **off**.

4. Save.

### Mode B: Hosted gateway

Use this when you want **`POST …/v1/chat`** / **`POST …/v1/intelligent/chat`**, **Postgres-backed memory**, **`POST …/v1/transcribe`**, or **tools**.

1. Generate local env files (recommended)

```bash
pnpm run setup:dev
```

This writes:

- root **`.env`** (ignored by git): Vite dev-proxy defaults + a generated bearer token
- **`deploy/.env`** (ignored by git): Compose overrides + the same generated bearer token

2. Run gateway + Postgres with Docker Compose (recommended)

From the **`deploy`** directory:

```bash
cd deploy
docker compose up --build
```

This starts:

- **Gateway** on **`127.0.0.1:8080`**
- **Postgres** on **`127.0.0.1:5433`** → **`5432`** in the container (schema from **`deploy/postgres/init.sql`**)

Gateway’s `DATABASE_URL` is already wired inside Compose to `postgres://postgres:postgres@postgres:5432/studio` (the internal service DNS name).

To customize gateway env vars, copy **`deploy/.env.example`** → **`deploy/.env`** and edit (examples: `ALLOWED_ORIGINS`, `ALLOWED_UPSTREAM_ORIGINS`, `MEMORY_CHAT_SAVE_STRATEGY`, `TOOLS_JSON`, `MCP_TOOLS_JSON`).

This repo’s recommended workflow is to **always run the gateway via Docker Compose** (no local `pnpm dev` gateway path in the README).

If the DB already existed with another password and you see auth failures, reset volumes (⚠ destroys DB data):

```bash
cd deploy
docker compose down -v
docker compose up --build
```

1. SPA settings (must match gateway auth model)

Still from repo root **`pnpm dev`**, open **Settings** and configure:

| App setting                             | Effect                                                                                                                                                                                                      |
| --------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Use hosted gateway**                  | ON                                                                                                                                                                                                          |
| **Gateway base URL**                    | `http://127.0.0.1:8080` unless you mapped another port/host                                                                                                                                                 |
| **API Base URL / key**                  | Still required: gateway receives **`Authorization: Bearer …`** and **`X-Upstream-Base-Url`** from the SPA. Point them at **your OpenAI-compat upstream** (`https://api.openai.com/v1` or your LiteLLM URL). |
| **Intelligent mode**                    | Uses **`/v1/intelligent/chat`**; leave off for standard **`/v1/chat`**.                                                                                                                                     |
| **Long-term memory** / **Memory top K** | Sends **`X-Memory-Enabled`** / **`X-Memory-Top-K`** (Postgres must be up and **`DATABASE_URL`** set on gateway).                                                                                            |
| **Tools**                               | **`X-Tools-Enabled`** (plus gateway **`TOOLS_JSON`** / **`MCP_TOOLS_JSON`** if you use inventory).                                                                                                          |
| Intelligent memory toggles              | Only when Intelligent is on: session/global/reveal → **`X-Studio-Intelligent-*`** headers.                                                                                                                  |

`X-Workspace-Id` is generated once per browser and persisted (required for Intelligent and for **409 workspace_busy** locking).

---

**After either mode**, use **Settings → Save** so Zustand persists values to local storage.

## Available Scripts

- `pnpm dev` - run local dev server
- `pnpm build` - type-check and build production bundle
- `pnpm preview` - preview built output
- `pnpm lint` - run ESLint
- `pnpm test` - run Vitest tests

### Hosted gateway (optional)

The Express gateway under **`deploy/gateway`** is its **own** pnpm package (not installed by root `pnpm install`).

Developer commands (`build`, Vitest suites, Postgres runtime harness):

```bash
cd deploy/gateway
pnpm install
pnpm dev
pnpm run build
pnpm test                 # unit (excludes *.e2e / *.runtime.e2e)
pnpm run test:e2e          # HTTP harness (mocked upstream)
pnpm run test:e2e:runtime  # requires DATABASE_URL, e.g. host → 5433 (see deploy/README.md)
pnpm run test:all          # unit + e2e + runtime (runtime skips if DATABASE_URL unset)
```

More Compose / hardening detail: **[deploy/README.md](deploy/README.md)**. Standard **`/v1/chat`** persistence vs Intelligent tables: **[deploy/PARITY.md](deploy/PARITY.md)**.

Gateway env templates: **[deploy/.env.example](deploy/.env.example)**.

#### Gateway env cheatsheet (Compose file vs host dev)

| Variable                        | Typical host dev (`pnpm dev` in gateway)             | Docker Compose gateway service                          |
| ------------------------------- | ---------------------------------------------------- | ------------------------------------------------------- |
| **`DATABASE_URL`**              | `postgres://postgres:postgres@127.0.0.1:5433/studio` | Already set to `@postgres:5432` in `docker-compose.yml` |
| **`PORT`**                      | `8080`                                               | `8080`                                                  |
| **`EMBEDDING_MODEL`**           | `text-embedding-3-small` (default)                   | same                                                    |
| **`MEMORY_CHAT_SAVE_STRATEGY`** | `facts` (default) or `verbatim` rollback             | configure in `deploy/.env` or compose `environment`     |

## Configuration Details

All settings are stored in browser local storage through Zustand persistence.

### Chat Store

- Storage key: `chatgpt-chat-storage`
- Includes:
  - chat threads
  - active chat id
  - messages + attachments + error state

### Settings Store

- Storage key: `chatgpt-settings-storage`
- Includes:
  - `apiKey`
  - `baseUrl` (default: `https://api.openai.com/v1`)
  - `model` (default: `gpt-4o`)
  - `temperature`, `topP`, `maxTokens`
  - `contextWindowTokens`, `includeStreamUsage`
  - `systemPrompt`
  - structured output mode + schema fields
  - **Gateway:** `useHostedGateway`, `gatewayBaseUrl` (default `http://127.0.0.1:8080`), `useIntelligentMode`, `workspaceId` (auto-generated once per browser when using gateway)
  - **Gateway features:** `memoryEnabled`, `memoryTopK` (1–16), `toolsEnabled`
  - **Intelligent-mode headers (when intelligent is on):** `intelligentIncludeSessionMemory`, `intelligentIncludeGlobalMemory`, `intelligentRevealMemoryUi`

### Settings UI (sensitive fields)

- **API Base URL** and **API Key** use password-style masking in the form.
- Each field has an **eye** button on the right: **press and hold** (mouse, touch, or Space/Enter on the button) to show plaintext; **release** to mask again.
- Copy/cut from those fields is only allowed while the value is temporarily visible.

## API Compatibility

### Direct upstream (default)

The app posts to:

- `{baseUrl}/chat/completions` (or uses `baseUrl` directly if it already ends with `/chat/completions`)

### Hosted gateway (optional)

When **Use hosted gateway** is on in Settings, the SPA posts to:

- `{gatewayBaseUrl}/v1/chat`, or
- `{gatewayBaseUrl}/v1/intelligent/chat` when **Intelligent mode** is on

Headers include `Authorization` (your API key), `X-Upstream-Base-Url`, `X-Workspace-Id` (stable per browser), `X-Memory-*`, `X-Tools-Enabled`, and when intelligent is on, `X-Studio-Intelligent-*` tier flags. **Intelligent** mode requires a non-empty `X-Workspace-Id` (the app sets this automatically). The gateway proxies to your configured upstream. For production lock down `ALLOWED_UPSTREAM_ORIGINS` and optional CORS origins — see [deploy/README.md](deploy/README.md).

### Request payload (both modes)

Payload includes:

- `model`
- `messages` (with optional system prompt)
- `temperature`
- `top_p`
- `max_tokens`
- `stream: true`
- optional `response_format` (structured output mode)

This works with OpenAI-compatible chat completion endpoints.

## Composer System Prompt Behavior

There are two levels of system prompt:

- **Global system prompt** in Settings (default behavior).
- **Per-message override** in Composer:
  - Toggle the small icon button
  - Enter temporary prompt
  - It applies to that send only
  - It resets after send

## Structured Output Mode

When enabled:

- You can define schema fields (`name`, `type`, `required`, `description`).
- The app builds a JSON schema and sends it as `response_format`.
- The workspace previews schema JSON.
- The latest valid assistant JSON can be exported:
  - JSON export (object/array)
  - CSV export (array responses only)

## Testing

Run all tests:

```bash
pnpm test
```

Run lint:

```bash
pnpm lint
```

Build validation:

```bash
pnpm build
```

## CI/CD (GitHub Actions)

Single workflow file: `.github/workflows/ci.yml`

### Trigger rules

- `pull_request`: run quality checks (lint/test/build) **and gateway package tests**
- `push` to `main`/`master`: same; deploy on `main`
- `workflow_dispatch`: manual run (includes deploy path)

### Job flow

1. **`quality`** — root `pnpm install` → `pnpm lint` → `pnpm test` → `pnpm build`
2. **`gateway`** — `deploy/gateway`: `pnpm install` → build → unit tests → `test:e2e` → start Compose **Postgres** → **`test:e2e:runtime`** (real `memory_chunks` counts with mocked upstream)
3. **`pages-build`** (`main`/manual only, after `quality` + `gateway`)
   - `pnpm build --base "/<repo-name>/"`
   - upload `dist` artifact
4. **`deploy`** — Pages publish

## Deployment Notes (GitHub Pages)

This project is configured for Pages project-site paths by building with:

```bash
pnpm build --base "/<repo-name>/"
```

If you see asset 404 errors in production (`index-*.js`, `index-*.css`), it is usually a base path mismatch. The workflow already handles this.

## Troubleshooting

- **`API Key is not configured`**
  - Open settings and save a valid API key.
- **Assets 404 on GitHub Pages**
  - Confirm deployment ran from the latest workflow.
  - Confirm Pages is enabled in repository settings.
- **`ERR_BLOCKED_BY_CLIENT` in browser**
  - Usually caused by extensions (ad/privacy blockers), not app code.
- **CI TypeScript errors for settings types**
  - Ensure tests and typed fixtures include all required fields (e.g., `systemPrompt`).
- **Gateway / browser blocks the request (CORS or mixed content)**
  - The bundled gateway enables CORS with `origin: true` so the requesting origin is echoed (fine for dev and same-site setups). Lock this down in production behind your reverse proxy or by tightening gateway CORS if you expose it publicly — see [deploy/README.md](deploy/README.md).
  - Set **`ALLOWED_ORIGINS`** on the gateway to comma-separated SPA origins when you tighten CORS (e.g. GitHub Pages + local dev origins).
  - **HTTPS Pages + HTTP local gateway:** the browser treats that as mixed content (`http://…` blocked from an `https://…` page). Use TLS on the gateway, a tunnel with HTTPS, or run the SPA over HTTP locally when testing against a local gateway.
- **`password authentication failed` when running `pnpm run test:e2e:runtime`** (gateway)
  - Your Postgres volume may predate **`deploy/docker-compose.yml`** credentials. From **`deploy/`**: `docker compose down -v` then `docker compose up -d postgres`, then rerun with **`DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5433/studio`** (see [deploy/README.md](deploy/README.md)).
- **Memory never persists on standard `/v1/chat`**
  - SPA: enable long-term memory; gateway: **`DATABASE_URL`** must be reachable; embeddings must succeed against **`X-Upstream-Base-Url`** embeddings route. **`MEMORY_CHAT_SAVE_STRATEGY=facts`** can skip noisy turns (normal); use **`verbatim`** only if you intentionally want whole-reply storage — see **`deploy/PARITY.md`**.

## Security Notes

- API key is stored in browser local storage.
- URL and key are masked in the settings form; use the eye control only when you need to verify values, and avoid shoulder-surfing on shared screens.
- Do not use this setup for shared/public devices without additional hardening.
- Avoid committing secrets or tokens into the repository.

## License

This project is licensed under the MIT License. See `LICENSE`.
