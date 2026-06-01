/**
 * MCP 配置与运行时类型
 */

/** 单个 MCP Server 配置（stdio 传输） */
export interface McpServerConfig {
  /** 设为 false 可禁用单个 server，省略则默认启用 */
  enabled?: boolean;
  transport?: 'stdio';
  command: string;
  args?: string[];
  env?: Record<string, string>;
  /** 暴露给哪些 agent；省略 = 全部 agent */
  agents?: string[];
  /** 工具白名单（MCP 原始 tool 名）；省略 = 全部 */
  tools?: string[];
  /** 需要用户确认的写操作（MCP 原始 tool 名）；省略 = 启发式判断 */
  destructive?: string[];
}

export interface McpConfig {
  enabled?: boolean;
  servers?: Record<string, McpServerConfig>;
}

/** 已连接的 MCP 工具元数据（供 registry 过滤） */
export interface McpToolMeta {
  serverId: string;
  originalName: string;
  agents?: string[];
  isDestructive: boolean;
}
