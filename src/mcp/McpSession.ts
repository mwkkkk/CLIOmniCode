/**
 * 单个 MCP Server 连接（stdio）
 */
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type { Tool } from '@modelcontextprotocol/sdk/types.js';
import { expandEnvRecord } from './expand-env.js';
import type { McpServerConfig } from './types.js';

export interface McpSessionOptions {
  serverId: string;
  config: McpServerConfig;
}

export class McpSession {
  readonly serverId: string;
  private client: Client;
  private transport: StdioClientTransport;
  private tools: Tool[] = [];
  private connected = false;

  constructor(options: McpSessionOptions) {
    this.serverId = options.serverId;
    const env = { ...process.env } as Record<string, string>;

    for (const [key, value] of Object.entries(expandEnvRecord(options.config.env) ?? {})) {
      if (value) env[key] = value;
    }

    this.transport = new StdioClientTransport({
      command: options.config.command,
      args: options.config.args ?? [],
      env,
      stderr: 'pipe',
    });

    this.client = new Client(
      { name: 'omni-code', version: '0.1.0' },
      { capabilities: {} },
    );
  }

  async connect(): Promise<void> {
    if (this.connected) return;
    await this.client.connect(this.transport);
    const result = await this.client.listTools();
    this.tools = result.tools;
    this.connected = true;
  }

  listTools(): Tool[] {
    return this.tools;
  }

  async callTool(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ output: string; isError: boolean }> {
    const result = await this.client.callTool({ name, arguments: args });
    const content = result.content as Array<{ type: string; text?: string }>;
    return {
      output: formatToolContent(content),
      isError: Boolean(result.isError),
    };
  }

  async close(): Promise<void> {
    if (!this.connected) return;
    await this.client.close();
    this.connected = false;
  }
}

function formatToolContent(
  content: Array<{ type: string; text?: string; [key: string]: unknown }>,
): string {
  if (!content?.length) return '';
  return content
    .map((part) => {
      if (part.type === 'text' && typeof part.text === 'string') {
        return part.text;
      }
      return JSON.stringify(part);
    })
    .join('\n');
}
