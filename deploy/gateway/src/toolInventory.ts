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

export type McpServerDiscovery = {
  server: string;
  tools: Array<{ name: string; description?: string }>;
};

/** Parse `MCP_TOOLS_JSON` env into servers + tools (read-only introspection — no credential material). */
export function mcpServersFromEnvJson(raw?: string): McpServerDiscovery[] {
  if (!raw?.trim()) return [];
  try {
    const v = JSON.parse(raw) as Array<{
      server?: string;
      tools?: Array<{ name?: string; description?: string }>;
    }>;
    if (!Array.isArray(v)) return [];
    const servers: McpServerDiscovery[] = [];
    for (const entry of v) {
      const server = (entry.server || 'default').replace(/__/g, '_');
      const tools: Array<{ name: string; description?: string }> = [];
      for (const t of entry.tools || []) {
        if (!t.name) continue;
        tools.push({ name: t.name, description: t.description });
      }
      if (tools.length > 0) servers.push({ server, tools });
    }
    return servers;
  } catch {
    return [];
  }
}

/** MCP-ish tools surfaced as prefixed function names (`mcp__serverName__toolName`). */
function parseMcpTools(raw: string | undefined): ToolDef[] {
  const servers = mcpServersFromEnvJson(raw);
  const out: ToolDef[] = [];
  for (const entry of servers) {
    const server = entry.server;
    for (const t of entry.tools) {
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
}

export function buildToolInventory(): { tools: ToolDef[] } {
  const envTools = parseJsonArray(process.env.TOOLS_JSON, []);
  const mcp = parseMcpTools(process.env.MCP_TOOLS_JSON);
  return { tools: [...envTools, ...mcp] };
}
