/**
 * 会话编排引擎（SessionEngine）
 *
 * 编排层入口：连接 CLI 与 AgentLoop，负责：
 * - Session 生命周期（创建 / 恢复 / 结束）
 * - L1 短期记忆（WorkingStore + Transcript 完整 messages）
 * - System Prompt 组装（ContextManager → OMNI.md + L2/L3 记忆召回）
 * - Phase 1 Reflection：Episode + Entity 直接写，semantic/procedural 进候选池
 * - Phase 2 Consolidation：跨 episode 归纳后写入 Semantic / Procedural Store
 */
import { loadConfig, getDataDir, getConsolidationConfig } from '../config/load-config.js';
import { ContextManager } from './ContextManager.js';
import { AgentLoop } from './AgentLoop.js';
import { ModelRouter } from '../llm/model-router.js';
import { QwenProvider } from '../llm/qwen-provider.js';
import { CandidatePoolStore } from '../memory/CandidatePoolStore.js';
import { ConsolidationPipeline } from '../memory/ConsolidationPipeline.js';
import { ReflectionPipeline } from '../memory/ReflectionPipeline.js';
import { assessSessionQuality } from '../memory/session-quality.js';
import { WorkingStore } from '../memory/WorkingStore.js';
import type { ConsolidationResult } from '../memory/types.js';
import { AgentRouter } from '../orchestrator/AgentRouter.js';
import { hashProjectPath, SessionIndex } from '../session/SessionIndex.js';
import { TranscriptStore } from '../session/TranscriptStore.js';
import { buildAgentToolRegistry } from '../mcp/build-agent-registry.js';
import { McpManager } from '../mcp/McpManager.js';
import type { ToolContext } from '../tools/types.js';

/** query() 的入参：一次用户输入所需的全部上下文与回调 */
export interface QueryOptions {
  message: string;
  cwd: string;
  sessionId?: string;
  askUser: ToolContext['askUser'];
  onText?: (text: string) => void;
  signal?: AbortSignal;
}

/** query() 的返回值：供 CLI 展示并保存 sessionId 以便后续 query 复用 */
export interface QueryResult {
  sessionId: string;
  response: string | null;
  turns: number;
}

export class SessionEngine {
  private provider = new QwenProvider();
  private contextManager = new ContextManager(this.provider);
  private workingStore = new WorkingStore();
  private mcpManager: McpManager | null = null;

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
    const mcpManager = await this.getMcpManager();
    const agentRouter = new AgentRouter(this.provider, modelRouter, mcpManager);

    const conductorProfile = config.agents.conductor;
    const registry = await buildAgentToolRegistry('conductor', mcpManager);

    const systemPrompt = await this.contextManager.buildSystemPrompt({
      cwd: options.cwd,
      agentId: 'conductor',
      projectHash: hashProjectPath(options.cwd),
      dataDir,
      userQuery: options.message,
      reflectionModel: config.models.reflection,
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
   * 结束 session：Phase 1 Reflection + 可选 Phase 2 Consolidation，然后清空 L1。
   */
  async endSession(sessionId: string, cwd: string): Promise<void> {
    const config = await loadConfig();
    const dataDir = await getDataDir();
    const sessionIndex = await SessionIndex.open(dataDir);
    const transcript = TranscriptStore.forSession(dataDir, sessionId);
    const messages = await transcript.readChatMessages();
    const projectHash = hashProjectPath(cwd);
    const consolidationConfig = getConsolidationConfig(config);

    const quality = assessSessionQuality(messages);

    if (quality.shouldReflect) {
      const transcriptSummary = messages
        .map((message) => JSON.stringify(message))
        .join('\n')
        .slice(0, 8000);

      const reflection = new ReflectionPipeline(
        this.provider,
        config.models.reflection,
        config.memory.reflection_confidence_threshold,
        consolidationConfig.procedural_min_steps,
      );

      await reflection.run(
        {
          sessionId,
          projectHash,
          transcriptSummary: transcriptSummary || 'Empty session',
        },
        dataDir,
      );

      await this.maybeRunConsolidation(cwd, dataDir, projectHash, consolidationConfig);
    }

    await sessionIndex.complete(sessionId);
    this.workingStore.clear(sessionId);
  }

  /** 手动触发 Consolidation（忽略自动触发阈值） */
  async consolidate(cwd: string): Promise<ConsolidationResult> {
    const config = await loadConfig();
    const dataDir = await getDataDir();
    const projectHash = hashProjectPath(cwd);
    const consolidationConfig = getConsolidationConfig(config);

    const pipeline = new ConsolidationPipeline(
      this.provider,
      config.models.reflection,
      consolidationConfig,
    );

    return pipeline.run({ projectHash, force: true }, dataDir);
  }

  async listSessions(cwd: string) {
    const dataDir = await getDataDir();
    const sessionIndex = await SessionIndex.open(dataDir);
    return sessionIndex.list(cwd);
  }

  private async maybeRunConsolidation(
    _cwd: string,
    dataDir: string,
    projectHash: string,
    consolidationConfig: ReturnType<typeof getConsolidationConfig>,
  ): Promise<ConsolidationResult | null> {
    const config = await loadConfig();
    const candidatePool = CandidatePoolStore.forProject(dataDir, projectHash);
    const state = await candidatePool.getState();

    const pipeline = new ConsolidationPipeline(
      this.provider,
      config.models.reflection,
      consolidationConfig,
    );

    if (!pipeline.shouldRun(state)) {
      return null;
    }

    return pipeline.run({ projectHash }, dataDir);
  }

  private async getMcpManager(): Promise<McpManager | null> {
    const config = await loadConfig();
    if (!config.mcp?.enabled) return null;

    if (!this.mcpManager) {
      this.mcpManager = new McpManager();
      await this.mcpManager.connect();
    }
    return this.mcpManager;
  }

  /** 关闭 MCP 连接（REPL 退出时调用） */
  async close(): Promise<void> {
    await this.mcpManager?.close();
    this.mcpManager = null;
  }

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
