# Design Decisions

## 1. TypeScript + Node (not Bun)

- **Choice**: Node 20+ with `tsx` for development.
- **Why**: Maximum compatibility; CCB is reference only, not a runtime dependency.
- **Trade-off**: Slightly slower than Bun; acceptable for a learning project.

## 2. Qwen via OpenAI-compatible API

- **Choice**: Official `openai` npm package + DashScope `compatible-mode/v1`.
- **Why**: DashScope has no Node SDK; OpenAI protocol is industry standard.
- **Trade-off**: Must aggregate streaming `tool_calls` chunks manually.

## 3. HandoffReport instead of raw tool_result text

- **Choice**: Sub-agents return structured `HandoffReport` JSON.
- **Why**: Prevents sub-agent output from polluting main context; demonstrates system design thinking.
- **Inspired by**: CCB AgentTool, but simplified.

## 4. Three-tier memory (not MEMORY.md index)

| Tier | Storage | Purpose |
|------|---------|---------|
| L1 Working | In-memory messages | Current turn context |
| L2 Episodic | `~/.omni/episodes/` | Per-session summaries |
| L3 Semantic | `facts.jsonl` + BM25-like recall | Cross-session facts |

- **Why**: Explicit tiers are easier to explain in interviews than a monolithic memory file.
- **Not doing (yet)**: Vector embeddings, `/dream` compaction cron.

## 5. Dispatch tool + AgentRouter (not nested AgentTool fork)

- **Choice**: Conductor calls `dispatch` → `AgentRouter` spawns isolated `AgentLoop`.
- **Why**: Clear separation of orchestration vs execution; easier to trace and test.
- **Not doing (yet)**: Async background agents, git worktree isolation, teammate swarm.

## 6. Permission ask mode for destructive tools

- **Choice**: `write`, `edit`, `bash` prompt user in REPL before execution.
- **Why**: Shell access requires guardrails; mirrors CCB's permission philosophy without full rule engine.

## 7. Intentionally skipped from CCB

| Feature | Reason |
|---------|--------|
| Pipe IPC / LAN | Out of scope for personal CLI |
| MCP protocol | v2; built-in tools sufficient for MVP |
| React/Ink TUI | readline first; upgrade later |
| 88 feature flags | `omni.config.yaml` is enough |
| GrowthBook / Sentry | Local trace only for now |
