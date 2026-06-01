# Design Decisions

## 1. TypeScript + Node (not Bun)

- **Choice**: Node 20+ with `tsx` for development.
- **Why**: Maximum compatibility; CCB is reference only, not a runtime dependency.
- **Trade-off**: Slightly slower than Bun; acceptable for a learning project.

## 2. Qwen via OpenAI-compatible API

- **Choice**: Official `openai` npm package + DashScope `compatible-mode/v1`.
- **Why**: DashScope has no Node SDK; OpenAI protocol is industry standard.
- **Trade-off**: Must aggregate streaming `tool_calls` chunks manually (`tool-call-accumulator.ts`).

## 3. HandoffReport instead of raw tool_result text

- **Choice**: Sub-agents return structured `HandoffReport` JSON.
- **Why**: Prevents sub-agent output from polluting main context; demonstrates system design thinking.
- **Inspired by**: CCB AgentTool, but simplified.
- **Current state**: `artifacts`, `openQuestions`, and `memoryCandidates` fields exist in the type but are not populated yet. `HandoffBus` is reserved for future trace collection.

## 4. Three-tier memory with two-phase L2 promotion

| Tier | Storage | Purpose | Write timing |
|------|---------|---------|--------------|
| L1 Working | `WorkingStore` + `transcript.jsonl` | Full session messages (user/assistant/tool) | During session; cleared on end |
| L2 Episodic | `~/.omni/episodes/` | Complete task narratives | Phase 1: session end |
| L2 Semantic | `~/.omni/semantic/` | Abstract cross-session patterns | Phase 2: consolidation only |
| L2 Procedural | `~/.omni/procedures/` | Validated reusable SOPs | Phase 2: consolidation only |
| L3 Entity | `~/.omni/entities/` | Structured facts (`entity.attr = value`) | Phase 1: session end |

**Phase 1 (Reflection)** on `/exit` or `/new`:

- `SessionQualityGate` skips trivial sessions (no user messages, or single-turn greeting with < 200 chars and no tool use).
- Episode + Entity written directly (entity requires confidence ≥ threshold).
- Semantic / Procedural candidates go to `~/.omni/candidates/{projectHash}/pool.jsonl`.
- Candidate pool deduplicates by content/title; longer procedural variants replace shorter ones.

**Phase 2 (Consolidation)** when thresholds met or `omni consolidate`:

- LLM reviews pending candidates + recent episodes + existing stores.
- Hard validation rules before promotion:
  - **Semantic**: confidence ≥ threshold AND (≥ 2 source sessions OR ≥ 2 candidates OR strong evidence with confidence ≥ 0.9).
  - **Procedural**: confidence ≥ threshold, ≥ min steps, not trivial ("read file then explain"), and either ≥ 2 candidates or corroborated by a recent episode.
- Rejects noise; keeps insufficient-evidence candidates pending.
- Auto-trigger after session end when `consolidation.auto: true` and any threshold is met.

- **Why**: Semantic and procedural memories require cross-episode evidence; writing them on every session end pollutes long-term stores with single-event noise.
- **Not doing (yet)**: Vector embeddings, user `/save-sop`, rejected-candidate archival.

## 5. Smart recall with recallHint (not per-type top-K)

- **Choice**: Build a full manifest of all project memories; select ≤ `recall_max_total` items per query via flash side-query (`MemoryRecallSelector`), with keyword fallback.
- **Why**: Per-type top-K caps waste context on irrelevant items and miss cross-type relevance. A single side-query over `recallHint` fields (aligned with CCB `findRelevantMemories`) picks the most task-relevant memories regardless of type.
- **recallHint**: Every memory item stores search keywords (not a summary) written during Reflection/Consolidation. Guidelines encourage synonyms, bilingual terms, and anticipated vague referential queries.
- **Fallback**: If the side-query LLM fails, `rankManifestIdsByQuery` scores manifest items by keyword overlap — does not discard zero-score items when under cap.
- **Config note**: `semantic_recall_top_k` etc. in `omni.config.yaml` are reserved for a future per-type mode; current recall uses `recall_max_total` only.

## 6. Memory drift defense

- **Choice**: System prompt includes a block instructing the agent to verify file paths, symbols, and flags with tools before acting on recalled memories.
- **Why**: Memories describe claims from past sessions; the codebase may have changed. Mirrors CCB's trusting-recall section without a full verification pipeline.
- **Also**: Reflection/Consolidation prompts explicitly reject memories derivable from reading the current codebase (file paths, symbol names, repo layout).

## 7. OMNI.md as project-scoped human memory

- **Choice**: If `OMNI.md` exists in the project root, its contents are injected into every system prompt under "Project Memory".
- **Why**: Some conventions are intentionally human-authored and should not wait for automatic extraction. Complements the automated L2/L3 stores.

## 8. Dispatch tool + AgentRouter (not nested AgentTool fork)

- **Choice**: Conductor calls `dispatch` → `AgentRouter` spawns isolated `AgentLoop`.
- **Why**: Clear separation of orchestration vs execution; easier to trace and test.
- **Not doing (yet)**: Async background agents, git worktree isolation, teammate swarm.

## 9. Permission ask mode for destructive tools

- **Choice**: `write`, `edit`, `bash`, and `dispatch` prompt user in REPL before execution.
- **Why**: Shell access and sub-agent delegation require guardrails; mirrors CCB's permission philosophy without full rule engine.
- **Applies to**: Both Conductor and sub-agents (each sub-agent loop also runs in `permissionMode: 'ask'`).

## 10. Multi-path config resolution

- **Choice**: Config lookup: explicit path → `OMNI_CONFIG` → `./omni.config.yaml` → `~/.omni/config.yaml` → package default.
- **Why**: `omni` runs from any project directory via `npm link`; each project can override models/agents while sharing a global fallback.

## 11. MCP via Tool adapter (not AgentLoop fork)

- **Choice**: MCP servers connect over stdio (`@modelcontextprotocol/sdk`); each MCP tool is adapted to the existing `Tool` interface and merged into `ToolRegistry` at runtime.
- **Naming**: `mcp__{serverId}__{toolName}` prevents collisions with builtin `read`/`grep`/etc.
- **Why**: AgentLoop, permission ask, and LLM function calling stay unchanged; new capabilities are config-driven extensions.
- **First server**: GitHub MCP (`@modelcontextprotocol/server-github`) — issues, PRs, remote file read. Builtin tools handle local files; MCP handles external SaaS APIs.
- **Scope control**: Per-server `agents` list and `tools` whitelist in `omni.config.yaml`. Default demo exposes read-only GitHub tools to conductor only.
- **Permissions**: MCP write tools (`create_*`, `merge_*`, …) map to `isDestructive: true` and use the same REPL ask flow as `write`/`bash`.
- **Failure mode**: If MCP fails to connect (missing token, spawn error), log warning and continue with builtin tools — no hard crash.
- **Not doing (yet)**: HTTP/SSE MCP transport, multiple concurrent MCP servers beyond config list, OAuth browser flow.
