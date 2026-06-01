/**
 * MCP 连接管理：启动 server 进程、列举 tools、按需关闭
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config/load-config.js';
import type { Tool } from '../tools/types.js';
import { adaptMcpTool } from './McpToolAdapter.js';
import { McpSession } from './McpSession.js';
import type { McpServerConfig } from './types.js';

const require = createRequire(fileURLToPath(import.meta.url));

/** 内置 GitHub MCP server 入口（省略 args 时使用） */
export function defaultGithubServerArgs(): string[] {
  const entry = require.resolve('@modelcontextprotocol/server-github/dist/index.js');
  return [entry];
}

export class McpManager {
  private sessions = new Map<string, McpSession>();
  private tools: Tool[] = [];
  private toolAgents = new Map<string, string[] | undefined>();
  private connected = false;

  async connect(): Promise<void> {
    if (this.connected) return;

    const config = await loadConfig();
    const mcp = config.mcp;
    if (!mcp?.enabled || !mcp.servers) {
      this.connected = true;
      return;
    }

    for (const [serverId, serverConfig] of Object.entries(mcp.servers)) {
      if (serverConfig.enabled === false) continue;

      try {
        const resolved = resolveServerConfig(serverId, serverConfig);
        const session = new McpSession({ serverId, config: resolved });
        await session.connect();

        const allowedTools = filterServerTools(session.listTools(), serverConfig);
        for (const mcpTool of allowedTools) {
          const tool = adaptMcpTool(session, serverId, mcpTool, serverConfig);
          this.tools.push(tool);
          this.toolAgents.set(tool.name, serverConfig.agents);
        }

        this.sessions.set(serverId, session);
        console.error(`[omni] MCP connected: ${serverId} (${allowedTools.length} tools)`);
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        console.error(`[omni] MCP server "${serverId}" skipped: ${message}`);
      }
    }

    this.connected = true;
  }

  getToolsForAgent(agentId: string): Tool[] {
    return this.tools.filter((tool) => {
      const agents = this.toolAgents.get(tool.name);
      if (!agents?.length) return true;
      return agents.includes(agentId);
    });
  }

  getAllTools(): Tool[] {
    return this.tools;
  }

  async close(): Promise<void> {
    await Promise.all([...this.sessions.values()].map((s) => s.close()));
    this.sessions.clear();
    this.tools = [];
    this.toolAgents.clear();
    this.connected = false;
  }
}

function resolveServerConfig(serverId: string, config: McpServerConfig): McpServerConfig {
  if (serverId === 'github' && (!config.args || config.args.length === 0)) {
    return { ...config, args: defaultGithubServerArgs() };
  }
  return config;
}

function filterServerTools(
  tools: Awaited<ReturnType<McpSession['listTools']>>,
  config: McpServerConfig,
) {
  if (!config.tools?.length) return tools;
  const allow = new Set(config.tools);
  return tools.filter((tool) => allow.has(tool.name));
}