# Deploy stack (Postgres + gateway)

## Gateway (Express)

Use **pnpm** (not npm). From repo root:

```bash
cd deploy/gateway
pnpm install
pnpm dev
pnpm run build
pnpm test
```

Docker build uses Corepack + pinned pnpm (see `gateway/package.json` `packageManager` and `gateway/Dockerfile`).

## Compose

```bash
cd deploy
docker compose up --build
```

Gateway listens on `127.0.0.1:8080` by default. Postgres is exposed on host port `5433` to avoid clashes with a local Postgres.

Copy `deploy/.env.example` to `deploy/.env` only if you extend Compose with extra variables.

### Gateway hardening

- **`ALLOWED_ORIGINS`** — When set (comma-separated), CORS only allows those browser `Origin` values. If unset, the gateway mirrors the request origin (`origin: true`), which is convenient for local dev but too open for a public URL.
- **`ALLOWED_UPSTREAM_ORIGINS`** — When set, `X-Upstream-Base-Url` must resolve to the same **origin** (scheme + host) as one of the entries. Prevents SSRF-style abuse of the gateway with a victim’s API key. Leave unset only in trusted environments.
- **`GATEWAY_BLOCK_PRIVATE_UPSTREAM`** — Set to `1` or `true` to reject upstream hostnames that look like loopback or RFC1918 space.
- **`EXPRESS_JSON_LIMIT`** — JSON body size cap (default `10mb`).

Intelligent chat requires a non-empty **`X-Workspace-Id`** so concurrent requests do not share a synthetic `default_ws` lock.
