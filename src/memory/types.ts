export type MemoryCategory =
  | 'preference'
  | 'convention'
  | 'architecture'
  | 'pitfall'
  | 'decision';

export interface MemoryCandidate {
  category: MemoryCategory;
  content: string;
  confidence: number;
  sourceSessionId: string;
  expiresAt?: string;
}

export interface SemanticFact {
  id: string;
  category: MemoryCategory;
  content: string;
  confidence: number;
  sourceSessionId: string;
  createdAt: string;
  expiresAt?: string;
}

export interface Episode {
  id: string;
  sessionId: string;
  projectHash: string;
  summary: string;
  createdAt: string;
}
