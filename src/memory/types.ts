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
  /** 供召回判断相关性的一句话（非给人读的摘要） */
  recallHint: string;
  confidence: number;
  sourceSessionId: string;
  expiresAt?: string;
}

/** L2 语义记忆：持久化的事实记录 */
export interface SemanticFact {
  id: string;
  category: SemanticCategory;
  content: string;
  recallHint?: string;
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
  recallHint?: string;
  createdAt: string;
}

/** Reflection 阶段提取的情节记忆候选 */
export interface EpisodicCandidate {
  title: string;
  narrative: string;
  outcome: string;
  tags: string[];
  recallHint: string;
  sourceSessionId: string;
}

/** L2 程序记忆：可复用的操作流程 */
export interface Procedure {
  id: string;
  title: string;
  steps: string[];
  tags: string[];
  recallHint?: string;
  confidence: number;
  sourceSessionId: string;
  createdAt: string;
}

/** Reflection 阶段提取的程序记忆候选 */
export interface ProceduralCandidate {
  title: string;
  steps: string[];
  tags: string[];
  recallHint: string;
  confidence: number;
  sourceSessionId: string;
}

/** L3 实体记忆：结构化事实 */
export interface EntityFact {
  id: string;
  entity: string;
  attribute: string;
  value: string;
  recallHint?: string;
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
  recallHint: string;
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

/** 候选池记录类型 */
export type CandidateType = 'semantic' | 'procedural';

/** 候选池记录状态 */
export type CandidateStatus = 'pending' | 'consolidated' | 'rejected';

/** 候选 resolution 原因 */
export type CandidateResolution =
  | 'promoted'
  | 'merged'
  | 'rejected_noise'
  | 'rejected_insufficient_evidence';

/** 候选池中的一条记录 */
export interface CandidateRecord {
  id: string;
  type: CandidateType;
  status: CandidateStatus;
  payload: SemanticCandidate | ProceduralCandidate;
  sourceSessionId: string;
  createdAt: string;
  resolvedAt?: string;
  resolution?: CandidateResolution;
  promotedToId?: string;
}

/** Consolidation 状态（按项目维护） */
export interface ConsolidationState {
  lastConsolidatedAt: string | null;
  episodesSinceLastConsolidation: number;
  pendingSemanticCount: number;
  pendingProceduralCount: number;
}

/** Consolidation 运行结果 */
export interface ConsolidationResult {
  promotedSemantic: number;
  promotedProcedural: number;
  rejected: number;
  kept: number;
}

/** Consolidation LLM 返回：待提升的语义记忆 */
export interface SemanticPromotion {
  category: SemanticCategory;
  content: string;
  recallHint: string;
  confidence: number;
  evidenceStrength?: 'normal' | 'strong';
  sourceCandidateIds: string[];
  sourceSessionIds: string[];
}

/** Consolidation LLM 返回：待提升的程序记忆 */
export interface ProceduralPromotion {
  title: string;
  steps: string[];
  tags: string[];
  recallHint: string;
  confidence: number;
  sourceCandidateIds: string[];
}

/** Consolidation LLM 提取结果 */
export interface ConsolidationExtraction {
  semanticToPromote: SemanticPromotion[];
  proceduresToPromote: ProceduralPromotion[];
  candidatesToReject: Array<{ id: string; reason: string }>;
  candidatesToKeep: Array<{ id: string; reason: string }>;
}

/** Session 质量评估结果 */
export interface SessionQuality {
  shouldReflect: boolean;
  reason: string;
  stats: {
    userMessageCount: number;
    assistantMessageCount: number;
    toolMessageCount: number;
    totalMessages: number;
    transcriptChars: number;
  };
}

/** Reflection 运行结果 */
export interface ReflectionResult {
  episodeSaved: boolean;
  savedEntities: number;
  savedSemanticCandidates: number;
  savedProceduralCandidates: number;
  skipped: boolean;
  skipReason?: string;
}

/** @deprecated 使用 SemanticCandidate */
export type MemoryCategory = SemanticCategory;

/** @deprecated 使用 SemanticCandidate */
export type MemoryCandidate = SemanticCandidate;
