/**
 * 将 MCP tool 桥接为 OmniCode Tool 接口
 */
import { z } from 'zod';
import type { Tool as McpTool } from '@modelcontextprotocol/sdk/types.js';
import type { Tool } from '../tools/types.js';
import type { McpSession } from './McpSession.js';
import type { McpServerConfig } from './types.js';

const WRITE_PREFIXES = ['create_', 'update_', 'push_', 'merge_', 'fork_', 'add_'];

/** OmniCode 侧 tool 名：mcp__{serverId}__{originalName} */
export function mcpToolName(serverId: string, originalName: string): string {
  return `mcp__${serverId}__${originalName}`;
}

export function parseMcpToolName(
  name: string,
): { serverId: string; originalName: string } | null {
  const match = /^mcp__([^_]+)__(.+)$/.exec(name);
  if (!match) return null;
  return { serverId: match[1], originalName: match[2] };
}

export function isDestructiveMcpTool(
  originalName: string,
  config: McpServerConfig,
): boolean {
  if (config.destructive?.includes(originalName)) return true;
  return WRITE_PREFIXES.some((prefix) => originalName.startsWith(prefix));
}

export function adaptMcpTool(
  session: McpSession,
  serverId: string,
  mcpTool: McpTool,
  config: McpServerConfig,
): Tool {
  const name = mcpToolName(serverId, mcpTool.name);
  const destructive = isDestructiveMcpTool(mcpTool.name, config);

  return {
    name,
    description: `[GitHub MCP] ${mcpTool.description ?? mcpTool.name}`,
    parameters: (mcpTool.inputSchema as Record<string, unknown>) ?? {
      type: 'object',
      properties: {},
    },
    schema: z.record(z.unknown()),
    isReadOnly: !destructive,
    isDestructive: destructive,
    async execute(input) {
      try {
        const { output, isError } = await session.callTool(
          mcpTool.name,
          input as Record<string, unknown>,
        );
        return { success: !isError, output, error: isError ? output : undefined };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        return { success: false, output: '', error: message };
      }
    },
  };
}
