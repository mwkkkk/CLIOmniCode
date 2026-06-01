/**
 * 为指定 agent 组装 ToolRegistry（内置 + MCP）
 */
import { loadConfig } from '../config/load-config.js';
import { createToolRegistry } from '../tools/registry.js';
import type { ToolRegistry } from '../tools/types.js';
import type { McpManager } from './McpManager.js';

export async function buildAgentToolRegistry(
  agentId: string,
  mcpManager: McpManager | null,
): Promise<ToolRegistry> {
  const config = await loadConfig();
  const profile = config.agents[agentId];
  if (!profile) {
    throw new Error(`No profile for agent: ${agentId}`);
  }

  const mcpTools = mcpManager?.getToolsForAgent(agentId) ?? [];
  const mcpToolNames = mcpTools.map((tool) => tool.name);
  const allowedNames = [...profile.tools, ...mcpToolNames];

  return createToolRegistry(allowedNames, mcpTools);
}
