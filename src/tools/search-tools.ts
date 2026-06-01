/**
 * 搜索工具：grep / glob
 *
 * 底层调用 ripgrep (rg)，需在系统中安装 rg。
 * 注意：当前未对搜索路径做 cwd 边界限制（与 read/write 不同）。
 */
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Tool } from './types.js';

const execFileAsync = promisify(execFile);

/** 封装 rg 调用，exit code 1 表示无匹配（非错误） */
async function runRipgrep(args: string[], cwd: string): Promise<string> {
  try {
    const { stdout } = await execFileAsync('rg', args, {
      cwd,
      maxBuffer: 2 * 1024 * 1024,
      timeout: 60_000,
    });
    return stdout.trim();
  } catch (err) {
    const error = err as { stdout?: string; code?: number };
    if (error.code === 1) return '(no matches)';
    return error.stdout?.trim() ?? String(err);
  }
}

/** 内容搜索：正则匹配文件内容，返回行号+路径 */
export const grepTool: Tool<{ pattern: string; path?: string; glob?: string }> = {
  name: 'grep',
  description: 'Search file contents with ripgrep. Returns matching lines with paths.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Regex pattern' },
      path: { type: 'string', description: 'Directory or file to search' },
      glob: { type: 'string', description: 'Glob filter, e.g. *.ts' },
    },
    required: ['pattern'],
  },
  schema: z.object({
    pattern: z.string(),
    path: z.string().optional(),
    glob: z.string().optional(),
  }),
  isReadOnly: true,
  isDestructive: false,
  async execute(input, context) {
    const args = ['--line-number', '--color=never', input.pattern];
    if (input.glob) args.push('--glob', input.glob);
    args.push(input.path ?? '.');
    const output = await runRipgrep(args, context.cwd);
    return { success: true, output: output.slice(0, 30_000) }; // 截断防 context 爆炸
  },
};

/** 文件路径匹配：按 glob 模式找文件 */
export const globTool: Tool<{ pattern: string; path?: string }> = {
  name: 'glob',
  description: 'Find files matching a glob pattern.',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Glob pattern, e.g. **/*.ts' },
      path: { type: 'string', description: 'Base directory' },
    },
    required: ['pattern'],
  },
  schema: z.object({
    pattern: z.string(),
    path: z.string().optional(),
  }),
  isReadOnly: true,
  isDestructive: false,
  async execute(input, context) {
    const args = ['--files', '-g', input.pattern, input.path ?? '.'];
    const output = await runRipgrep(args, context.cwd);
    return { success: true, output: output || '(no files)' };
  },
};
