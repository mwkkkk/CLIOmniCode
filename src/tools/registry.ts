import { bashTool } from './bash-tool.js';
import { editTool, readTool, writeTool } from './file-tools.js';
import { askUserTool, dispatchTool } from './meta-tools.js';
import { globTool, grepTool } from './search-tools.js';
import type { Tool, ToolRegistry } from './types.js';

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

export function createToolRegistry(allowedNames?: string[]): ToolRegistry {
  const registry: ToolRegistry = new Map();

  for (const tool of ALL_TOOLS) {
    if (!allowedNames || allowedNames.includes(tool.name)) {
      registry.set(tool.name, tool);
    }
  }

  return registry;
}

export function toolsToDefinitions(registry: ToolRegistry) {
  return [...registry.values()].map((tool) => ({
    name: tool.name,
    description: tool.description,
    parameters: tool.parameters,
  }));
}

export { ALL_TOOLS };
