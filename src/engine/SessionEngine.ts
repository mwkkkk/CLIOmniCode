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

export interface QueryOptions {
  message: string;
  cwd: string;
  sessionId?: string;
  askUser: ToolContext['askUser'];
  onText?: (text: string) => void;
  signal?: AbortSignal;
}

export interface QueryResult {
  sessionId: string;
  response: string | null;
  turns: number;
}

export class SessionEngine {
  private provider = new QwenProvider();
  private contextManager = new ContextManager();
  private workingStore = new WorkingStore();

  async query(options: QueryOptions): Promise<QueryResult> {
    const config = await loadConfig();
    const dataDir = await getDataDir();
    const sessionIndex = await SessionIndex.open(dataDir);

    const session = options.sessionId
      ? await sessionIndex.get(options.sessionId)
      : (await sessionIndex.list(options.cwd))[0];

    const activeSession =
      session ?? (await sessionIndex.create(options.cwd, options.message.slice(0, 80)));

    const transcript = TranscriptStore.forSession(dataDir, activeSession.id);
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

    await transcript.append({
      type: 'message',
      timestamp: new Date().toISOString(),
      payload: { role: 'user', content: options.message },
    });

    const result = await loop.run({
      userMessage: options.message,
      cwd: options.cwd,
      sessionId: activeSession.id,
      askUser: options.askUser,
      onText: options.onText,
      signal: options.signal,
    });

    await sessionIndex.touch(activeSession.id, result.usage);

    await transcript.append({
      type: 'message',
      timestamp: new Date().toISOString(),
      payload: { role: 'assistant', content: result.finalMessage, turns: result.turns },
    });

    return {
      sessionId: activeSession.id,
      response: result.finalMessage,
      turns: result.turns,
    };
  }

  async endSession(sessionId: string, cwd: string): Promise<void> {
    const config = await loadConfig();
    const dataDir = await getDataDir();
    const sessionIndex = await SessionIndex.open(dataDir);
    const transcript = TranscriptStore.forSession(dataDir, sessionId);
    const entries = await transcript.readAll();

    const summary = entries
      .filter((e) => e.type === 'message')
      .map((e) => JSON.stringify(e.payload))
      .join('\n')
      .slice(0, 4000);

    const reflection = new ReflectionPipeline(
      this.provider,
      config.models.reflection,
      config.memory.reflection_confidence_threshold,
    );

    await reflection.run(
      {
        sessionId,
        projectHash: hashProjectPath(cwd),
        transcriptSummary: summary || 'Empty session',
      },
      dataDir,
    );

    await sessionIndex.complete(sessionId);
    this.workingStore.clear();
  }

  async listSessions(cwd: string) {
    const dataDir = await getDataDir();
    const sessionIndex = await SessionIndex.open(dataDir);
    return sessionIndex.list(cwd);
  }
}
