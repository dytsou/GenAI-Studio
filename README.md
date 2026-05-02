# GenAI Studio

A local-first AI chat workspace built with React + TypeScript + Vite.

It supports streaming chat completions, multi-chat history, attachments (images/PDF), structured JSON output mode with schema editing, and GitHub Pages deployment through a single CI/CD workflow.

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

## Getting Started

1. Install dependencies:

```bash
pnpm install
```

2. Start development server:

```bash
pnpm dev
```

3. Open the local URL shown by Vite (typically `http://localhost:5173`).

4. Configure settings in-app:
   - Open **Settings**
   - Set API key and model config (use the eye control next to URL/key to **hold and reveal** when needed)
   - Save configuration

## Available Scripts

- `pnpm dev` - run local dev server
- `pnpm build` - type-check and build production bundle
- `pnpm preview` - preview built output
- `pnpm lint` - run ESLint
- `pnpm test` - run Vitest tests

### Hosted gateway (optional)

The Express gateway under `deploy/gateway` is a **separate pnpm package** (not the root `pnpm install`). See [deploy/README.md](deploy/README.md) for `pnpm install`, `pnpm dev`, `pnpm test`, `pnpm run test:e2e`, and Docker Compose.

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
  - **Gateway:** `useHostedGateway`, `gatewayBaseUrl` (default `http://127.0.0.1:8080`), `useIntelligentMode`
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

- `pull_request`: run quality checks (lint/test/build)
- `push` to `main`/`master`: run quality checks; deploy on `main`
- `workflow_dispatch`: manual run (includes deploy path)

### Job flow

1. `quality`
   - install deps with pnpm
   - lint
   - test
   - build
2. `pages-build` (main/manual only, after quality)
   - build with Pages base path:
     - `pnpm build --base "/<repo-name>/"`
   - upload `dist` artifact
3. `deploy`
   - deploy artifact to GitHub Pages

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
  - **HTTPS Pages + HTTP local gateway:** the browser treats that as mixed content (`http://…` blocked from an `https://…` page). Use TLS on the gateway, a tunnel with HTTPS, or run the SPA over HTTP locally when testing against a local gateway.

## Security Notes

- API key is stored in browser local storage.
- URL and key are masked in the settings form; use the eye control only when you need to verify values, and avoid shoulder-surfing on shared screens.
- Do not use this setup for shared/public devices without additional hardening.
- Avoid committing secrets or tokens into the repository.

## License

This project is licensed under the MIT License. See `LICENSE`.
