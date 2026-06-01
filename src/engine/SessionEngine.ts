/**
 * 会话编排引擎（SessionEngine）
 *
 * 编排层入口：连接 CLI 与 AgentLoop，负责：
 * - Session 生命周期（创建 / 恢复 / 结束）
 * - L1 短期记忆（WorkingStore + Transcript 完整 messages）
 * - System Prompt 组装（ContextManager → OMNI.md + L2/L3 记忆召回）
 * - 会话结束时的 Reflection 记忆提炼（L2 episodic / semantic / procedural + L3 entity）
 *
 * 调用方：
 * - repl.ts：交互 REPL 的每条用户输入、/new、/exit
 * - cli/index.ts：omni run（单次）、omni sessions
 *
 * 架构位置：
 *   CLI → SessionEngine → AgentLoop → Tools / AgentRouter
 *              ↓
 *   SessionIndex / TranscriptStore / ReflectionPipeline
 *
 * 记忆分层：
 * - L1 Working：当前 session 完整 messages，注入每次 query 的 AgentLoop
 * - L2 Long-term：Episodic / Semantic / Procedural（session 结束时提炼）
 * - L3 Entity：结构化实体事实（session 结束时提炼）
 */
import { loadConfig, getDataDir } from '../config/load-config.js';
import { ContextManager } from './ContextManager.js';
import { AgentLoop } from './AgentLoop.js';
import { ModelRouter } from '../llm/model-router.js';
import { QwenProvider } from '../llm/qwen-provider.js';
import { ReflectionPipeline } from '../memory/ReflectionPipeline.js';
import { WorkingStore } from '../memory/WorkingStore.js';
import { AgentRouter } from '../orchestrator/AgentRouter.js';
import { hashProjectPath, SessionIndex } from '../session/SessionIndex.js';
import { TranscriptStore } from '../session/TranscriptStore.js';
import { createToolRegistry } from '../tools/registry.js';
import type { ToolContext } from '../tools/types.js';

/** query() 的入参：一次用户输入所需的全部上下文与回调 */
export interface QueryOptions {
  /** 用户自然语言输入（REPL 中不是 shell 命令） */
  message: string;
  /** 工作目录：工具执行 cwd、项目分组（projectHash）、OMNI.md 读取 */
  cwd: string;
  /**
   * 要绑定的 session ID。
   * 不传时：取 cwd 对应项目最近一条 active session（SessionIndex.list 首项）；
   * 若该项目尚无 session，则在 query 内新建，标题取 message 前 80 字符。
   */
  sessionId?: string;
  /**
   * 危险工具（write / edit / bash / dispatch 等）执行前的用户确认回调。
   * REPL 用 readline.question；omni run 用 stdin 一次性读取。
   */
  askUser: ToolContext['askUser'];
  /** 流式输出：AgentLoop 收到 LLM text_delta 时调用，用于实时打印到终端 */
  onText?: (text: string) => void;
  /** 可选取消信号，传给 AgentLoop → QwenProvider，中断长时间运行的 query */
  signal?: AbortSignal;
}

/** query() 的返回值：供 CLI 展示并保存 sessionId 以便后续 query 复用 */
export interface QueryResult {
  /** 本次 query 使用的 session UUID */
  sessionId: string;
  /** Agent 最终回复；达到 maxTurns 或无文本输出时可能为 null */
  response: string | null;
  /** AgentLoop 实际执行的 LLM ↔ 工具往返轮数 */
  turns: number;
}

export class SessionEngine {
  /** DashScope / Qwen LLM 客户端，供 AgentLoop 与 ReflectionPipeline 共用 */
  private provider = new QwenProvider();
  /** 动态组装 system prompt（角色、OMNI.md、L2/L3 recall） */
  private contextManager = new ContextManager();
  /** L1 短期记忆：按 sessionId 缓存完整 messages，session 结束时清空 */
  private workingStore = new WorkingStore();

  /**
   * 处理一次用户 query（REPL 每条输入或 omni run 的单次 prompt）。
   *
   * 流程概览：
   * 1. 解析/创建 session（SessionIndex）
   * 2. 加载 L1 历史 messages（WorkingStore ← Transcript）
   * 3. 组装 conductor Agent（工具集、模型、system prompt、AgentRouter）
   * 4. 运行 AgentLoop（注入历史 + 本轮 user message）
   * 5. 写回 L1（WorkingStore + Transcript）
   * 6. 更新 session 元数据（lastActiveAt、token 累计）
   */
  async query(options: QueryOptions): Promise<QueryResult> {
    const config = await loadConfig();
    const dataDir = await getDataDir();
    const sessionIndex = await SessionIndex.open(dataDir);

    const session = options.sessionId
      ? await sessionIndex.get(options.sessionId)
      : (await sessionIndex.list(options.cwd, 'active'))[0];

    const activeSession =
      session ?? (await sessionIndex.create(options.cwd, options.message.slice(0, 80)));

    const transcript = TranscriptStore.forSession(dataDir, activeSession.id);
    const historyMessages = await this.loadWorkingMemory(activeSession.id, transcript);

    const modelRouter = new ModelRouter(config.models);
    const agentRouter = new AgentRouter(this.provider, modelRouter);

    const conductorProfile = config.agents.conductor;
    const registry = createToolRegistry(conductorProfile.tools);

    const systemPrompt = await this.contextManager.buildSystemPrompt({
      cwd: options.cwd,
      agentId: 'conductor',
      projectHash: hashProjectPath(options.cwd),
      dataDir,
      userQuery: options.message,
    });

    const loop = new AgentLoop({
      provider: this.provider,
      model: modelRouter.resolve('conductor'),
      tools: registry,
      maxTurns: conductorProfile.max_turns,
      agentId: 'conductor',
      systemPrompt,
      agentRouter,
      permissionMode: 'ask',
    });

    const result = await loop.run({
      userMessage: options.message,
      cwd: options.cwd,
      sessionId: activeSession.id,
      historyMessages,
      askUser: options.askUser,
      onText: options.onText,
      signal: options.signal,
    });

    await this.saveWorkingMemory(activeSession.id, transcript, result.newMessages);
    await sessionIndex.touch(activeSession.id, result.usage);

    return {
      sessionId: activeSession.id,
      response: result.finalMessage,
      turns: result.turns,
    };
  }

  /**
   * 结束 session：从 L1 transcript 提炼 L2/L3 长期记忆，并清空 L1。
   *
   * 调用时机：
   * - REPL `/new`：结束当前 session 后再开新上下文
   * - REPL `/exit`：退出前对当前 session 做一次 Reflection
   */
  async endSession(sessionId: string, cwd: string): Promise<void> {
    const config = await loadConfig();
    const dataDir = await getDataDir();
    const sessionIndex = await SessionIndex.open(dataDir);
    const transcript = TranscriptStore.forSession(dataDir, sessionId);
    const messages = await transcript.readChatMessages();

    const transcriptSummary = messages
      .map((message) => JSON.stringify(message))
      .join('\n')
      .slice(0, 8000);

    const reflection = new ReflectionPipeline(
      this.provider,
      config.models.reflection,
      config.memory.reflection_confidence_threshold,
    );

    await reflection.run(
      {
        sessionId,
        projectHash: hashProjectPath(cwd),
        transcriptSummary: transcriptSummary || 'Empty session',
      },
      dataDir,
    );

    await sessionIndex.complete(sessionId);
    this.workingStore.clear(sessionId);
  }

  async listSessions(cwd: string) {
    const dataDir = await getDataDir();
    const sessionIndex = await SessionIndex.open(dataDir);
    return sessionIndex.list(cwd);
  }

  /** 从 WorkingStore 或 Transcript 加载 L1 历史 messages */
  private async loadWorkingMemory(sessionId: string, transcript: TranscriptStore) {
    if (this.workingStore.has(sessionId)) {
      return this.workingStore.getMessages(sessionId);
    }

    const messages = await transcript.readChatMessages();
    if (messages.length > 0) {
      this.workingStore.setMessages(sessionId, messages);
    }
    return messages;
  }

  /** 将本轮新增 messages 写回 L1（内存 + 磁盘） */
  private async saveWorkingMemory(
    sessionId: string,
    transcript: TranscriptStore,
    newMessages: Awaited<ReturnType<AgentLoop['run']>>['newMessages'],
  ) {
    if (!newMessages.length) return;

    this.workingStore.append(sessionId, ...newMessages);
    await transcript.appendChatMessages(newMessages);
  }
}
