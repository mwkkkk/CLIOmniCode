# OmniCode

Terminal-native agentic coding CLI with multi-agent orchestration, session management, and layered memory.

Built with **TypeScript + Node**, powered by **Alibaba Qwen** (DashScope OpenAI-compatible API).

## Features

- **Agentic loop** — streaming output, function calling, permission-gated destructive tools
- **Tools** — `read`, `write`, `edit`, `bash`, `grep`, `glob`, `dispatch`, `ask_user`
- **Multi-agent** — Conductor delegates to planner, explorer, coder, reviewer, verifier via structured `HandoffReport`
- **Session persistence** — JSONL transcript + project-scoped index; auto-resume active session
- **Three-tier memory** — L1 working → L2 episodic / semantic / procedural → L3 entity
- **Two-phase L2 promotion** — Reflection at session end, Consolidation across episodes
- **Smart recall** — flash side-query selects relevant memories from a full manifest (`recallHint`-driven)
- **Project memory** — optional `OMNI.md` injected into every system prompt

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure API key (shell env or .env)
export DASHSCOPE_API_KEY=sk-xxx
# DASHSCOPE_BASE_URL is optional; defaults to Beijing compatible endpoint

# 3. Global install (run once from OmniCode repo)
npm run build && npm link

# Ensure node bin is on PATH (Homebrew node@22):
# export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# 4. Use from any project directory
cd ~/work/your-project
omni
```

Config is resolved in order: `OMNI_CONFIG` → `./omni.config.yaml` → `~/.omni/config.yaml` → package default.

Optional: copy global config once:

```bash
mkdir -p ~/.omni && cp /path/to/OmniCode/omni.config.yaml ~/.omni/config.yaml
```

## Commands

```bash
omni                          # Interactive REPL (default)
omni run "fix the login bug"  # Single-shot mode
omni run "..." --session <id> # Resume a session
omni sessions                 # List sessions for current project
omni consolidate              # Force memory consolidation
```

REPL slash commands: `/sessions`, `/new`, `/exit`

All commands accept `-c, --cwd <path>`.

## Requirements

- Node.js 20+
- `ripgrep` (`rg`) for grep/glob tools
- DashScope API key from [阿里云百炼](https://help.aliyun.com/zh/model-studio/get-api-key)

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, memory flow, data layout, agent profiles
- [Design Decisions](docs/DESIGN_DECISIONS.md) — trade-offs and rationale
