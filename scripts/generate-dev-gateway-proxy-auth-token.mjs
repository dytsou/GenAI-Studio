import crypto from "node:crypto";

// 32 bytes → 43 chars base64url (no padding). Good enough for a dev bearer token.
const token = crypto.randomBytes(32).toString("base64url");

process.stdout.write(`${token}\n`);

