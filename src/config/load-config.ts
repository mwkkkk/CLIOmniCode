import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { resolve } from 'node:path';
import { parse } from 'yaml';
import type { ModelRouter } from '../llm/model-router.js';
import { ModelRouter as ModelRouterImpl } from '../llm/model-router.js';

export interface AgentProfileConfig {
  tools: string[];
  readonly: boolean;
  max_turns: number;
}

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
  };
  session: {
    data_dir: string;
  };
}

let cachedConfig: OmniConfig | null = null;
let cachedRouter: ModelRouter | null = null;

export function expandPath(path: string): string {
  return path.startsWith('~/') ? resolve(homedir(), path.slice(2)) : resolve(path);
}

export async function loadConfig(configPath = 'omni.config.yaml'): Promise<OmniConfig> {
  if (cachedConfig) return cachedConfig;

  const raw = await readFile(resolve(configPath), 'utf-8');
  cachedConfig = parse(raw) as OmniConfig;
  return cachedConfig;
}

export async function getModelRouter(configPath?: string): Promise<ModelRouter> {
  if (cachedRouter) return cachedRouter;
  const config = await loadConfig(configPath);
  cachedRouter = new ModelRouterImpl(config.models);
  return cachedRouter;
}

export async function getDataDir(configPath?: string): Promise<string> {
  const config = await loadConfig(configPath);
  return expandPath(config.session.data_dir);
}
