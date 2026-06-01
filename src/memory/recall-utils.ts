/**
 * 记忆召回工具：关键词打分 + 防漂移提示文案
 */

/** 注入 system prompt：推荐记忆内容前须用工具验证（对齐 CCB TRUSTING_RECALL_SECTION） */
export const MEMORY_DRIFT_DEFENSE = [
  '## Before recommending from memory',
  'Memories describe claims from past sessions. Files, functions, flags, or configs may have changed since then.',
  'Before acting on a memory that names a specific path, function, flag, or config:',
  '- If it names a file path: use read or glob to confirm it exists.',
  '- If it names a function, symbol, or flag: use grep to confirm it still exists.',
  '- Do not assume outdated memories are still accurate.',
].join('\n');

/** 按 query 词在多个文本字段上计分（用于预筛选） */
export function scoreByQuery(query: string, texts: (string | undefined)[]): number {
  const terms = query.toLowerCase().split(/\s+/).filter((t) => t.length > 1);
  if (!terms.length) return 0;

  const combined = texts.filter(Boolean).join(' ').toLowerCase();
  return terms.reduce((acc, term) => (combined.includes(term) ? acc + 1 : acc), 0);
}

/** 无 recallHint 时从 content 生成简短检索句 */
export function fallbackRecallHint(parts: string[]): string {
  return parts.filter(Boolean).join(' ').slice(0, 120);
}

/** Reflection / Consolidation 共用：recallHint 写作规范 */
export const RECALL_HINT_GUIDELINES = [
  'recallHint rules (for future retrieval — NOT a human-readable summary):',
  '- Write keywords/phrases the user might type in a FUTURE session to need this memory',
  '- Include synonyms, task names, and both English and Chinese terms when relevant',
  '- Anticipate vague referential queries (e.g. "that issue again", "how we solved the bot problem")',
  '- Do NOT restate the memory content; write search hooks only',
  '- Bad: "We used Selenium successfully on Tuesday"',
  '- Good: "scraping crawler 爬虫 anti-bot 反爬 JS rendering dynamic page Selenium Playwright requests fails"',
].join('\n');

/** 侧查询失败时的软排序：按 query 对 manifest 项打分，不丢弃 score=0 */
export function rankManifestIdsByQuery(
  query: string,
  items: Array<{ id: string; recallHint: string; summary: string }>,
  maxSelect: number,
): string[] {
  return items
    .map((item) => ({
      id: item.id,
      score: scoreByQuery(query, [item.recallHint, item.summary]),
    }))
    .sort((a, b) => b.score - a.score)
    .slice(0, maxSelect)
    .map(({ id }) => id);
}
