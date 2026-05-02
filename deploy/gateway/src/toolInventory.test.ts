import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { buildToolInventory } from './toolInventory.js';

describe('buildToolInventory', () => {
  const prevTools = process.env.TOOLS_JSON;
  const prevMcp = process.env.MCP_TOOLS_JSON;

  afterEach(() => {
    process.env.TOOLS_JSON = prevTools;
    process.env.MCP_TOOLS_JSON = prevMcp;
  });

  beforeEach(() => {
    delete process.env.TOOLS_JSON;
    delete process.env.MCP_TOOLS_JSON;
  });

  it('parses MCP_JSON into prefixed names', () => {
    process.env.MCP_TOOLS_JSON = JSON.stringify([
      { server: 'demo', tools: [{ name: 'ping', description: 'Ping' }] },
    ]);
    const { tools } = buildToolInventory();
    expect(tools.some((t) => t.function.name === 'mcp__demo__ping')).toBe(true);
  });
});
