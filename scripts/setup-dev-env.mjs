import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

const repoRoot = process.cwd();

function randomToken(prefix = "gw_") {
  return `${prefix}${crypto.randomBytes(32).toString("hex")}`;
}

function readTextIfExists(p) {
  try {
    return fs.readFileSync(p, "utf8");
  } catch {
    return null;
  }
}

function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function upsertEnvLine(contents, key, value) {
  const line = `${key}=${value}`;
  const re = new RegExp(`^${key}=.*$`, "m");
  if (re.test(contents)) return contents.replace(re, line);
  const suffix = contents.endsWith("\n") || contents.length === 0 ? "" : "\n";
  return `${contents}${suffix}${line}\n`;
}

function main() {
  const token = randomToken("gw_");
  const litellmMasterKey = randomToken("litellm_");

  // Root .env (ignored) — used by Vite dev proxy helper values.
  const rootEnvPath = path.join(repoRoot, ".env");
  let rootEnv = readTextIfExists(rootEnvPath) ?? "";
  rootEnv = upsertEnvLine(rootEnv, "VITE_DEV_GATEWAY_PROXY", "true");
  rootEnv = upsertEnvLine(rootEnv, "DEV_GATEWAY_PROXY_TARGET", "http://127.0.0.1:8080");
  rootEnv = upsertEnvLine(rootEnv, "DEV_GATEWAY_PROXY_AUTH_TOKEN", token);
  fs.writeFileSync(rootEnvPath, rootEnv, "utf8");

  // deploy/.env (ignored) — compose overrides (operators edit).
  const deployDir = path.join(repoRoot, "deploy");
  const deployEnvPath = path.join(deployDir, ".env");
  let deployEnv = readTextIfExists(deployEnvPath);
  if (deployEnv == null) {
    const example = readTextIfExists(path.join(deployDir, ".env.example"));
    deployEnv = example ?? "";
  }

  // Local dev-safe defaults (can be edited later).
  deployEnv = upsertEnvLine(deployEnv, "PORT", "8080");
  deployEnv = upsertEnvLine(deployEnv, "DATABASE_URL", "postgres://postgres:postgres@postgres:5432/studio");
  deployEnv = upsertEnvLine(deployEnv, "EMBEDDING_MODEL", "text-embedding-3-small");
  deployEnv = upsertEnvLine(deployEnv, "LITELLM_MASTER_KEY", litellmMasterKey);
  deployEnv = upsertEnvLine(deployEnv, "MEMORY_CHAT_SAVE_STRATEGY", "facts");
  deployEnv = upsertEnvLine(deployEnv, "ALLOWED_ORIGINS", "http://localhost:5173");
  deployEnv = upsertEnvLine(deployEnv, "ALLOWED_UPSTREAM_ORIGINS", "https://api.openai.com");
  // This token is used by the Vite dev proxy (if enabled) to override Authorization.
  // The gateway itself does not currently enforce it; it's a dev convenience knob.
  deployEnv = upsertEnvLine(deployEnv, "GATEWAY_BEARER_TOKEN", token);

  fs.writeFileSync(deployEnvPath, deployEnv, "utf8");

  process.stdout.write(
    [
      "Wrote .env and deploy/.env.",
      "",
      "Generated token:",
      token,
      "",
      "Generated LITELLM_MASTER_KEY:",
      litellmMasterKey,
      "",
      "Next:",
      "  cd deploy && docker compose up --build",
      "  cd .. && pnpm dev   # SPA",
      "  In SPA Settings: enable hosted gateway (base URL http://127.0.0.1:8080)",
      "",
    ].join("\n"),
  );
}

main();

