/**
 * Session 质量评估
 *
 * 在 Reflection 前判断 session 是否值得提炼记忆，避免寒暄/空 session 污染候选池。
 */
import type { ChatMessage } from '../llm/types.js';
import type { SessionQuality } from './types.js';

export interface SessionQualityOptions {
  /** 单轮且无工具时，transcript 低于此字符数则跳过 */
  minTranscriptChars?: number;
}

const DEFAULT_MIN_TRANSCRIPT_CHARS = 200;

export function assessSessionQuality(
  messages: ChatMessage[],
  options: SessionQualityOptions = {},
): SessionQuality {
  const minChars = options.minTranscriptChars ?? DEFAULT_MIN_TRANSCRIPT_CHARS;

  const userMessageCount = messages.filter((m) => m.role === 'user').length;
  const assistantMessageCount = messages.filter((m) => m.role === 'assistant').length;
  const toolMessageCount = messages.filter((m) => m.role === 'tool').length;
  const totalMessages = messages.length;
  const transcriptChars = messages.reduce((acc, m) => acc + (m.content?.length ?? 0), 0);

  const stats = {
    userMessageCount,
    assistantMessageCount,
    toolMessageCount,
    totalMessages,
    transcriptChars,
  };

  if (userMessageCount === 0) {
    return { shouldReflect: false, reason: 'no user messages', stats };
  }

  if (
    userMessageCount === 1 &&
    toolMessageCount === 0 &&
    transcriptChars < minChars
  ) {
    return {
      shouldReflect: false,
      reason: 'trivial single-turn session (likely greeting)',
      stats,
    };
  }

  return { shouldReflect: true, reason: 'session has sufficient substance', stats };
}
