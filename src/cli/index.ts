#!/usr/bin/env node
import 'dotenv/config';
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

program
  .command('chat', { isDefault: true })
  .description('Start interactive REPL (default)')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .action(async (opts: { cwd: string }) => {
    await startRepl(resolve(opts.cwd));
  });

program
  .command('run')
  .description('Single-shot query (print mode)')
  .argument('<prompt>', 'User prompt')
  .option('-c, --cwd <path>', 'Working directory', process.cwd())
  .option('--session <id>', 'Resume session by ID')
  .action(async (prompt: string, opts: { cwd: string; session?: string }) => {
    const engine = new SessionEngine();
    const cwd = resolve(opts.cwd);

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
      onText: (text) => process.stdout.write(text),
    });

    process.stdout.write('\n');
    console.log(chalk.gray(`\n[session ${result.sessionId} · ${result.turns} turns]`));
  });

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

program.parse();
