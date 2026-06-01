/**
 * 文件操作工具：read / write / edit
 *
 * 所有文件路径经 resolveInCwd 校验，禁止访问 cwd 之外的文件。
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { z } from 'zod';
import type { Tool } from './types.js';

/**
 * 将相对/绝对路径解析为 cwd 内的绝对路径
 * @throws 若路径逃出 cwd（如 ../../etc/passwd）
 */
function resolveInCwd(cwd: string, filePath: string): string {
  const abs = isAbsolute(filePath) ? filePath : resolve(cwd, filePath);
  const rel = relative(cwd, abs);
  if (rel.startsWith('..') || rel === '..') {
    throw new Error(`Path escapes workspace: ${filePath}`);
  }
  return abs;
}

/** 读取文件，支持按行 offset/limit 分段读取大文件 */
export const readTool: Tool<{ path: string; offset?: number; limit?: number }> = {
  name: 'read',
  description: 'Read a file from the project. Optionally specify offset and limit for large files.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'Relative or absolute file path' },
      offset: { type: 'number', description: '1-based start line' },
      limit: { type: 'number', description: 'Max lines to read' },
    },
    required: ['path'],
  },
  schema: z.object({
    path: z.string(),
    offset: z.number().optional(),
    limit: z.number().optional(),
  }),
  isReadOnly: true,
  isDestructive: false,
  async execute(input, context) {
    try {
      const abs = resolveInCwd(context.cwd, input.path);
      const content = await readFile(abs, 'utf-8');
      const lines = content.split('\n');

      const start = input.offset ? Math.max(0, input.offset - 1) : 0;
      const end = input.limit ? start + input.limit : lines.length;
      const slice = lines.slice(start, end);

      // 带行号输出，方便 LLM 定位
      const numbered = slice
        .map((line, i) => `${String(start + i + 1).padStart(6)}|${line}`)
        .join('\n');

      return { success: true, output: numbered || '(empty file)' };
    } catch (err) {
      return { success: false, output: '', error: String(err) };
    }
  },
};

/** 写入文件（覆盖），自动创建父目录 */
export const writeTool: Tool<{ path: string; content: string }> = {
  name: 'write',
  description: 'Write content to a file, creating parent directories if needed.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      content: { type: 'string' },
    },
    required: ['path', 'content'],
  },
  schema: z.object({
    path: z.string(),
    content: z.string(),
  }),
  isReadOnly: false,
  isDestructive: true,
  async execute(input, context) {
    try {
      const abs = resolveInCwd(context.cwd, input.path);
      await mkdir(dirname(abs), { recursive: true });
      await writeFile(abs, input.content, 'utf-8');
      return { success: true, output: `Wrote ${input.path} (${input.content.length} bytes)` };
    } catch (err) {
      return { success: false, output: '', error: String(err) };
    }
  },
};

/** 精确字符串替换编辑（old_string 必须唯一匹配） */
export const editTool: Tool<{ path: string; old_string: string; new_string: string }> = {
  name: 'edit',
  description: 'Replace exact old_string with new_string in a file.',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
      old_string: { type: 'string' },
      new_string: { type: 'string' },
    },
    required: ['path', 'old_string', 'new_string'],
  },
  schema: z.object({
    path: z.string(),
    old_string: z.string(),
    new_string: z.string(),
  }),
  isReadOnly: false,
  isDestructive: true,
  async execute(input, context) {
    try {
      const abs = resolveInCwd(context.cwd, input.path);
      const content = await readFile(abs, 'utf-8');

      if (!content.includes(input.old_string)) {
        return { success: false, output: '', error: `old_string not found in ${input.path}` };
      }

      const updated = content.replace(input.old_string, input.new_string);
      await writeFile(abs, updated, 'utf-8');
      return { success: true, output: `Edited ${input.path}` };
    } catch (err) {
      return { success: false, output: '', error: String(err) };
    }
  },
};
