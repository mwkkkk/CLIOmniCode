/**
 * 配置加载模块
 *
 * 负责读取 omni.config.yaml，提供模型映射、Agent 工具配置、记忆参数等。
 * 支持多级配置查找，使 omni 可在任意目录运行。
 */
import { access, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import type { ModelRouter } from '../llm/model-router.js';
import { ModelRouter as ModelRouterImpl } from '../llm/model-router.js';
import type { McpConfig } from '../mcp/types.js';

/** 单个 Agent 的配置：可用工具、是否只读、最大循环轮数 */
export interface AgentProfileConfig {
  tools: string[];
  readonly: boolean;
  max_turns: number;
}

/** Consolidation 阶段配置 */
export interface ConsolidationConfig {
  auto: boolean;
  min_pending_semantic: number;
  min_pending_procedural: number;
  min_episodes_since_last: number;
  procedural_min_steps: number;
  procedural_confidence: number;
  semantic_confidence: number;
}

/** omni.config.yaml 的完整结构 */
export interface OmniConfig {
  llm: { provider: string };
  models: {
    conductor: string;
    coder: string;
    explorer: string;
    planner: string;
    reviewer: string;
    verifier: string;
    reflection: string;
  };
  agents: Record<string, AgentProfileConfig>;
  memory: {
    reflection_confidence_threshold: number;
    semantic_recall_top_k: number;
    procedural_recall_top_k: number;
    episodic_recall_top_k: number;
    entity_recall_top_k: number;
    /** 启用 flash 侧查询精选记忆（对齐 CCB findRelevantMemories） */
    smart_recall?: boolean;
    /** 侧查询最终注入的记忆条数上限（跨类型合计） */
    recall_max_total?: number;
    consolidation?: ConsolidationConfig;
  };
  session: {
    data_dir: string;
  };
  mcp?: McpConfig;
}

export const DEFAULT_CONSOLIDATION_CONFIG: ConsolidationConfig = {
  auto: true,
  min_pending_semantic: 3,
  min_pending_procedural: 2,
  min_episodes_since_last: 5,
  procedural_min_steps: 3,
  procedural_confidence: 0.85,
  semantic_confidence: 0.75,
};

/** 获取 consolidation 配置（兼容旧配置文件） */
export function getConsolidationConfig(config: OmniConfig): ConsolidationConfig {
  return { ...DEFAULT_CONSOLIDATION_CONFIG, ...config.memory.consolidation };
}

export const DEFAULT_RECALL_MAX_TOTAL = 5;

/** 是否启用智能记忆召回 */
export function isSmartRecallEnabled(config: OmniConfig): boolean {
  return config.memory.smart_recall !== false;
}

/** 侧查询最终注入条数上限 */
export function getRecallMaxTotal(config: OmniConfig): number {
  return config.memory.recall_max_total ?? DEFAULT_RECALL_MAX_TOTAL;
}

// 进程内缓存，避免重复读盘
let cachedConfig: OmniConfig | null = null;
let cachedRouter: ModelRouter | null = null;
let cachedConfigPath: string | null = null;

/** 将 ~/path 展开为绝对路径 */
export function expandPath(path: string): string {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path);
}

/** 包内默认配置文件路径（npm link 后仍能找到） */
function packageConfigPath(): string {
  return resolve(dirname(fileURLToPath(import.meta.url)), '../../omni.config.yaml');
}

async function fileExists(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch {
    return false;
  }
}

/**
 * 配置文件查找顺序：
 * 1. 显式传入的路径
 * 2. OMNI_CONFIG 环境变量
 * 3. 当前目录 ./omni.config.yaml（目标项目自定义）
 * 4. ~/.omni/config.yaml（用户全局配置）
 * 5. 包内 omni.config.yaml（内置默认）
 */
export async function resolveConfigPath(explicit?: string): Promise<string> {
  if (explicit) {
    return resolve(explicit);
  }

  if (process.env.OMNI_CONFIG) {
    return resolve(process.env.OMNI_CONFIG);
  }

  const candidates = [
    resolve(process.cwd(), 'omni.config.yaml'),
    resolve(homedir(), '.omni', 'config.yaml'),
    packageConfigPath(),
  ];

  for (const candidate of candidates) {
    if (await fileExists(candidate)) {
      return candidate;
    }
  }

  throw new Error(
    [
      'No OmniCode config found. Tried:',
      ...candidates.map((c) => `  - ${c}`),
      '',
      'Run once: mkdir -p ~/.omni && cp $(npm root -g)/../omni-code/omni.config.yaml ~/.omni/config.yaml',
      'Or set OMNI_CONFIG to your config file path.',
    ].join('\n'),
  );
}

/** 加载并缓存 YAML 配置 */
export async function loadConfig(configPath?: string): Promise<OmniConfig> {
  const resolved = await resolveConfigPath(configPath);

  if (cachedConfig && cachedConfigPath === resolved) {
    return cachedConfig;
  }

  const raw = await readFile(resolved, 'utf-8');
  cachedConfig = parse(raw) as OmniConfig;
  cachedConfigPath = resolved;
  return cachedConfig;
}

/** 根据配置创建 ModelRouter（按 Agent 角色映射千问模型名） */
export async function getModelRouter(configPath?: string): Promise<ModelRouter> {
  if (cachedRouter) return cachedRouter;
  const config = await loadConfig(configPath);
  cachedRouter = new ModelRouterImpl(config.models);
  return cachedRouter;
}

/** 获取 session / 记忆 数据根目录，默认 ~/.omni */
export async function getDataDir(configPath?: string): Promise<string> {
  const config = await loadConfig(configPath);
  return expandPath(config.session.data_dir);
}
