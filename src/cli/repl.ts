import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import { SessionEngine } from '../engine/SessionEngine.js';

export async function startRepl(cwd: string): Promise<void> {
  const engine = new SessionEngine();
  const rl = createInterface({ input, output });

  console.log(chalk.cyan('OmniCode REPL'));
  console.log(chalk.gray(`cwd: ${cwd}`));
  console.log(chalk.gray('Commands: /exit, /sessions, /new\n'));

  let sessionId: string | undefined;

  const askUser = async (question: string): Promise<string> => {
    return rl.question(chalk.yellow(`${question}\n> `));
  };

  while (true) {
    const line = await rl.question(chalk.green('omni> '));
    const trimmed = line.trim();

    if (!trimmed) continue;
    if (trimmed === '/exit') break;

    if (trimmed === '/sessions') {
      const sessions = await engine.listSessions(cwd);
      if (!sessions.length) {
        console.log(chalk.gray('No sessions for this project.'));
        continue;
      }
      for (const s of sessions) {
        console.log(
          `${chalk.blue(s.id.slice(0, 8))}  ${s.title}  ${chalk.gray(s.status)}  ${s.lastActiveAt}`,
        );
      }
      continue;
    }

    if (trimmed === '/new') {
      if (sessionId) {
        await engine.endSession(sessionId, cwd);
      }
      sessionId = undefined;
      console.log(chalk.gray('Started new session context.'));
      continue;
    }

    process.stdout.write(chalk.white('\n'));
    const result = await engine.query({
      message: trimmed,
      cwd,
      sessionId,
      askUser,
      onText: (text) => process.stdout.write(text),
    });
    sessionId = result.sessionId;
    process.stdout.write('\n\n');
    console.log(chalk.gray(`[session ${result.sessionId.slice(0, 8)} · ${result.turns} turns]`));
  }

  if (sessionId) {
    await engine.endSession(sessionId, cwd);
  }

  rl.close();
}
