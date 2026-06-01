/**
 * 记忆系统类型定义
 *
 * 三层记忆架构：
 * - L1 Working（短期）：当前 session 的完整 messages（用户 / 助手 / 工具），任务结束即清空
 * - L2 Long-term（长期）：
 *     - Episodic：具体事件经历（时间、场景、过程、结果）
 *     - Semantic：跨经历提炼的通用知识与规律
 *     - Procedural：可复用的操作流程（SOP）
 * - L3 Entity（实体）：从对话提炼的结构化事实（实体 + 属性 + 值）
 */

export type SemanticCategory =
  | 'preference'
  | 'convention'
  | 'architecture'
  | 'pitfall'
  | 'decision'
  | 'pattern';

/** Reflection 阶段提取的语义记忆候选 */
export interface SemanticCandidate {
  category: SemanticCategory;
  content: string;
  confidence: number;
  sourceSessionId: string;
  expiresAt?: string;
}

/** L2 语义记忆：持久化的事实记录 */
export interface SemanticFact {
  id: string;
  category: SemanticCategory;
  content: string;
  confidence: number;
  sourceSessionId: string;
  createdAt: string;
  expiresAt?: string;
}

/** L2 情节记忆：单次 session 的完整任务经历 */
export interface Episode {
  id: string;
  sessionId: string;
  projectHash: string;
  title: string;
  narrative: string;
  outcome: string;
  tags: string[];
  createdAt: string;
}

/** Reflection 阶段提取的情节记忆候选 */
export interface EpisodicCandidate {
  title: string;
  narrative: string;
  outcome: string;
  tags: string[];
  sourceSessionId: string;
}

/** L2 程序记忆：可复用的操作流程 */
export interface Procedure {
  id: string;
  title: string;
  steps: string[];
  tags: string[];
  confidence: number;
  sourceSessionId: string;
  createdAt: string;
}

/** Reflection 阶段提取的程序记忆候选 */
export interface ProceduralCandidate {
  title: string;
  steps: string[];
  tags: string[];
  confidence: number;
  sourceSessionId: string;
}

/** L3 实体记忆：结构化事实 */
export interface EntityFact {
  id: string;
  entity: string;
  attribute: string;
  value: string;
  confidence: number;
  sourceSessionId: string;
  createdAt: string;
  expiresAt?: string;
}

/** Reflection 阶段提取的实体记忆候选 */
export interface EntityCandidate {
  entity: string;
  attribute: string;
  value: string;
  confidence: number;
  sourceSessionId: string;
  expiresAt?: string;
}

/** Reflection LLM 一次性返回的结构化提炼结果 */
export interface ReflectionExtraction {
  episode: EpisodicCandidate | null;
  semanticFacts: SemanticCandidate[];
  procedures: ProceduralCandidate[];
  entities: EntityCandidate[];
}

/** @deprecated 使用 SemanticCandidate */
export type MemoryCategory = SemanticCategory;

/** @deprecated 使用 SemanticCandidate */
export type MemoryCandidate = SemanticCandidate;
