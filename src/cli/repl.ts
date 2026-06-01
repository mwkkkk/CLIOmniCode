/**
 * 交互式 REPL
 *
 * omni> 提示符下的主循环。用户输入会作为自然语言发给 AI，
 * 不是 shell 命令（ls/cd 等不会直接执行）。
 *
 * 内置斜杠命令：
 * - /exit     退出并触发会话结束（Reflection 记忆整理）
 * - /sessions 列出当前项目的 session
 * - /new      结束当前 session 并开新会话
 */
import { createInterface } from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';
import chalk from 'chalk';
import { SessionEngine } from '../engine/SessionEngine.js';

export async function startRepl(cwd: string): Promise<void> {
  const engine = new SessionEngine();
  const rl = createInterface({ input, output });

  console.log(chalk.cyan('OmniCode REPL'));
  console.log(chalk.gray(`cwd: ${cwd}`));
  console.log(chalk.gray('Commands: /exit, /sessions, /new'));
  console.log(chalk.gray('Note: input here goes to the AI, not the shell (ls, cd, etc.)\n'));

  // 当前 REPL 绑定的 session；undefined 时 SessionEngine 会自动创建或恢复最近 session
  let sessionId: string | undefined;

  /** 工具权限确认 & ask_user 工具的统一输入回调 */
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
      // 结束旧 session → 触发 ReflectionPipeline 提炼长期记忆
      if (sessionId) {
        await engine.endSession(sessionId, cwd);
      }
      sessionId = undefined;
      console.log(chalk.gray('Started new session context.'));
      continue;
    }

    // 普通输入 → 交给 SessionEngine → AgentLoop
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
