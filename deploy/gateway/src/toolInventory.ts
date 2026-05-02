type ToolDef = {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
};

function parseJsonArray(raw: string | undefined, fallback: ToolDef[]): ToolDef[] {
  if (!raw) return fallback;
  try {
    const v = JSON.parse(raw);
    return Array.isArray(v) ? (v as ToolDef[]) : fallback;
  } catch {
    return fallback;
  }
}

/** MCP-ish tools surfaced as prefixed function names (`mcp__serverName__toolName`). */
function parseMcpTools(raw: string | undefined): ToolDef[] {
  if (!raw) return [];
  try {
    const v = JSON.parse(raw) as Array<{
      server?: string;
      tools?: Array<{ name?: string; description?: string }>;
    }>;
    if (!Array.isArray(v)) return [];
    const out: ToolDef[] = [];
    for (const entry of v) {
      const server = entry.server || 'default';
      for (const t of entry.tools || []) {
        if (!t.name) continue;
        const fname = `mcp__${server.replace(/__/g, '_')}__${t.name}`;
        out.push({
          type: 'function',
          function: {
            name: fname,
            description:
              (t.description || '') +
              '\n(Server-side MCP executor may be minimal in dev — confirm gateway config.)',
            parameters: { type: 'object', properties: {} },
          },
        });
      }
    }
    return out;
  } catch {
    return [];
  }
}

export function buildToolInventory(): { tools: ToolDef[] } {
  const envTools = parseJsonArray(process.env.TOOLS_JSON, []);
  const mcp = parseMcpTools(process.env.MCP_TOOLS_JSON);
  return { tools: [...envTools, ...mcp] };
}
