export type MemoryTag =
  | "person"
  | "project"
  | "preference"
  | "constraint"
  | "fact"
  | "decision";

export const MEMORY_TAG_ALLOWLIST: ReadonlySet<string> = new Set<string>([
  "person",
  "project",
  "preference",
  "constraint",
  "fact",
  "decision",
]);

export function sanitizeMemoryTags(raw: unknown): MemoryTag[] {
  if (!Array.isArray(raw)) return [];
  const out: MemoryTag[] = [];
  for (const t of raw) {
    if (typeof t !== "string") continue;
    const v = t.trim().toLowerCase();
    if (!MEMORY_TAG_ALLOWLIST.has(v)) continue;
    out.push(v as MemoryTag);
  }
  return Array.from(new Set(out));
}

export function autoTagMemoryContent(content: string): MemoryTag[] {
  const c = content.trim().toLowerCase();
  const tags: MemoryTag[] = [];

  // Lightweight heuristic tags for MVP. Prefer stable labels over free-text values.
  if (c.startsWith("preference:") || c.includes(" i prefer "))
    tags.push("preference");
  if (
    c.startsWith("constraint:") ||
    c.includes(" must not ") ||
    c.includes(" cannot ")
  )
    tags.push("constraint");
  if (
    c.startsWith("decision:") ||
    c.includes(" we decided ") ||
    c.includes(" decision ")
  )
    tags.push("decision");
  if (c.includes(" project ") || c.startsWith("project:")) tags.push("project");
  if (c.includes(" my name is ") || c.startsWith("person:"))
    tags.push("person");
  if (tags.length === 0) tags.push("fact");

  return Array.from(new Set(tags));
}

const SECRET_PATTERNS: Array<RegExp> = [
  /\bsk-[A-Za-z0-9]{10,}\b/g, // OpenAI-like
  /\bAKIA[0-9A-Z]{16}\b/g, // AWS access key id
  /\bAIza[0-9A-Za-z\-_]{20,}\b/g, // Google API key-ish
];

export function redactSecrets(text: string): {
  redacted: string;
  didRedact: boolean;
} {
  let out = text;
  let did = false;
  for (const re of SECRET_PATTERNS) {
    const next = out.replace(re, "⟦redacted⟧");
    if (next !== out) did = true;
    out = next;
  }
  return { redacted: out, didRedact: did };
}

export function makeChunkPreview(content: string, maxChars = 240): string {
  const { redacted } = redactSecrets(content);
  const s = redacted.replace(/\s+/g, " ").trim();
  if (s.length <= maxChars) return s;
  return `${s.slice(0, Math.max(0, maxChars - 1)).trimEnd()}…`;
}
