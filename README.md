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
- **MCP integration** — external tools via Model Context Protocol (GitHub MCP: search issues/PRs, read remote files)

## Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Configure API keys (shell env, ~/.zshrc, or .env)
export DASHSCOPE_API_KEY=sk-xxx
export GITHUB_TOKEN=ghp_xxx          # optional; for GitHub MCP
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
omni mcp                      # List loaded MCP tools (debug)
```

REPL slash commands: `/sessions`, `/new`, `/exit`

## GitHub MCP (optional)

OmniCode can connect to [GitHub MCP](https://github.com/modelcontextprotocol/servers) so the agent can query GitHub beyond the local filesystem (issues, PRs, remote file contents).

1. Create a GitHub **fine-grained Personal Access Token** with **Public repositories (read-only)** access.
2. Set the token permanently, e.g. in `~/.zshrc`:

   ```bash
   export GITHUB_TOKEN=ghp_xxx
   ```

   Or use a secrets file: `mkdir -p ~/.omni && echo 'export GITHUB_TOKEN=ghp_xxx' >> ~/.omni/env` and add `[ -f ~/.omni/env ] && source ~/.omni/env` to `~/.zshrc`.

3. Verify:

   ```bash
   omni mcp
   omni run "List the 3 most recent open issues in facebook/react"
   ```

MCP is configured in `omni.config.yaml` under `mcp.servers.github`. By default only read-only tools are exposed to the **conductor** agent. Write tools (create issue, merge PR) require user confirmation via the existing permission ask flow.

See [Architecture — MCP](docs/ARCHITECTURE.md#mcp-external-tools) for wiring details.

All commands accept `-c, --cwd <path>`.

## Requirements

- Node.js 20+
- `ripgrep` (`rg`) for grep/glob tools
- DashScope API key from [阿里云百炼](https://help.aliyun.com/zh/model-studio/get-api-key)
- GitHub Personal Access Token (optional, for MCP)

## Documentation

- [Architecture](docs/ARCHITECTURE.md) — layers, memory flow, MCP, data layout, agent profiles
- [Design Decisions](docs/DESIGN_DECISIONS.md) — trade-offs and rationale
