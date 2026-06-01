#!/usr/bin/env node
/**
 * OmniCode CLI 入口
 *
 * 使用 Commander.js 注册子命令，是用户与 OmniCode 交互的顶层入口：
 * - omni / omni chat  → 交互式 REPL
 * - omni run <prompt> → 单次问答（print 模式）
 * - omni sessions     → 列出当前项目的会话
 * - omni consolidate  → 手动触发记忆 Consolidation
 */
import 'dotenv/config'; // 加载 .env；不覆盖已存在的 shell 环境变量
import { resolve } from 'node:path';
import { Command } from 'commander';
import chalk from 'chalk';
import { startRepl } from './repl.js';
import { SessionEngine } from '../engine/SessionEngine.js';

const program = new Command();

program
  .name('omni')
  .description('OmniCode — terminal-native agentic coding CLI')
  .version('0.1.0');

/** 默认命令：启动交互 REPL，cwd 默认为当前终端所在目录 */
program
  .command('chat', { isDefault: true })
  .description('Start interactive REPL (default)')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => {
    await startRepl(resolve(opts.cwd));
  });

/** 单次模式：执行一条 prompt 后退出，适合脚本或快速提问 */
program
  .command('run')
  .description('Single-shot query (print mode)')
  .argument('<prompt>', 'User prompt')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('--session <id>', 'Resume session by ID')
  .action(async (prompt: string, opts: { cwd: string; session?: string }) => {
    const engine = new SessionEngine();
    const cwd = resolve(opts.cwd);

    // 危险工具执行前的确认回调（write/edit/bash/dispatch）
    const askUser = async (question: string): Promise<string> => {
      process.stdout.write(chalk.yellow(`\n${question}\n> `));
      return new Promise((resolveAnswer) => {
        process.stdin.once('data', (data) => resolveAnswer(data.toString().trim()));
      });
    };

    const result = await engine.query({
      message: prompt,
      cwd,
      sessionId: opts.session,
      askUser,
      onText: (text) => process.stdout.write(text), // 流式输出 token
    });

    process.stdout.write('\n');
    console.log(chalk.gray(`\n[session ${result.sessionId} · ${result.turns} turns]`));
  });

/** 列出会话；注意：只显示与 --cwd 对应项目的 session（按 projectHash 过滤） */
program
  .command('sessions')
  .description('List sessions for current project')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => {
    const engine = new SessionEngine();
    const sessions = await engine.listSessions(resolve(opts.cwd));

    if (!sessions.length) {
      console.log('No sessions found.');
      return;
    }

    for (const s of sessions) {
      console.log(`${s.id}\t${s.status}\t${s.title}\t${s.lastActiveAt}`);
    }
  });

/** 手动触发记忆 Consolidation（跨 episode 归纳候选池） */
program
  .command('consolidate')
  .description('Run memory consolidation for current project (promote pending candidates)')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => {
    const engine = new SessionEngine();
    const result = await engine.consolidate(resolve(opts.cwd));

    console.log(chalk.cyan('Consolidation complete:'));
    console.log(`  Promoted semantic facts: ${result.promotedSemantic}`);
    console.log(`  Promoted procedures:     ${result.promotedProcedural}`);
    console.log(`  Rejected candidates:     ${result.rejected}`);
    console.log(`  Kept pending:            ${result.kept}`);
  });

program.parse();
