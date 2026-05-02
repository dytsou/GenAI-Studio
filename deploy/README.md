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
