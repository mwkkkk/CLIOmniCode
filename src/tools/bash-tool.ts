import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { z } from 'zod';
import type { Tool } from './types.js';

const execFileAsync = promisify(execFile);

const BLOCKED_PATTERNS = [
  /\brm\s+-rf\s+\//,
  /\bsudo\b/,
  /\bmkfs\b/,
  /\bdd\s+if=/,
  />\s*\/dev\//,
];

export const bashTool: Tool<{ command: string; description?: string }> = {
  name: 'bash',
  description: 'Run a shell command in the project directory. Use for builds, tests, and git.',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Shell command to execute' },
      description: { type: 'string', description: 'Why this command is being run' },
    },
    required: ['command'],
  },
  schema: z.object({
    command: z.string(),
    description: z.string().optional(),
  }),
  isReadOnly: false,
  isDestructive: true,
  async execute(input, context) {
    for (const pattern of BLOCKED_PATTERNS) {
      if (pattern.test(input.command)) {
        return { success: false, output: '', error: `Blocked dangerous command: ${input.command}` };
      }
    }

    try {
      const { stdout, stderr } = await execFileAsync('bash', ['-lc', input.command], {
        cwd: context.cwd,
        maxBuffer: 1024 * 1024,
        timeout: 120_000,
      });

      const output = [stdout, stderr].filter(Boolean).join('\n').trim();
      return { success: true, output: output || '(no output)' };
    } catch (err) {
      const error = err as { stdout?: string; stderr?: string; message?: string };
      const output = [error.stdout, error.stderr].filter(Boolean).join('\n').trim();
      return {
        success: false,
        output: output || '',
        error: error.message ?? String(err),
      };
    }
  },
};
