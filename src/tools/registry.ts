/**
 * 工具注册表
 *
 * 集中注册全部 8 个内置工具，按 Agent 配置的 allowedNames 过滤后
 * 传给 LLM（不同 Agent 看到不同工具子集）。
 */
import { bashTool } from './bash-tool.js';
import { editTool, readTool, writeTool } from './file-tools.js';
import { askUserTool, dispatchTool } from './meta-tools.js';
import { globTool, grepTool } from './search-tools.js';
import type { Tool, ToolRegistry } from './types.js';

/** 全部内置工具列表 */
const ALL_TOOLS: Tool[] = [
  readTool,
  writeTool,
  editTool,
  bashTool,
  grepTool,
  globTool,
  askUserTool,
  dispatchTool,
];

/**
 * 创建工具注册表
 * @param allowedNames 若传入，只注册指定名称的工具（按 Agent 配置过滤）
 * @param extraTools MCP 等外部工具，按 allowedNames 过滤后合并
 */
export function createToolRegistry(
  allowedNames?: string[],
  extraTools: Tool[] = [],
): ToolRegistry {
  const registry: ToolRegistry = new Map();

  for (const tool of ALL_TOOLS) {
    if (!allowedNames || allowedNames.includes(tool.name)) {
      registry.set(tool.name, tool);
    }
  }

  for (const tool of extraTools) {
    if (!allowedNames || allowedNames.includes(tool.name)) {
      registry.set(tool.name, tool);
    }
  }

  return registry;
}

/** 将 ToolRegistry 转为 LLM 可用的 ToolDefinition 数组 */
export function toolsToDefinitions(registry: ToolRegistry) {
  return [...registry.values()].map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export { ALL_TOOLS };
