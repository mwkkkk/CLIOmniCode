# OmniCode

Terminal-native agentic coding CLI with multi-agent orchestration, session management, and layered memory.

Built with **TypeScript + Node**, powered by **Alibaba Qwen** (DashScope OpenAI-compatible API).

## Features (v0.1 scaffold)

- Agentic loop with streaming output and function calling
- Tools: `read`, `write`, `edit`, `bash`, `grep`, `glob`, `dispatch`, `ask_user`
- Sub-agents: planner, explorer, coder, reviewer, verifier
- Session persistence (JSONL transcript + index)
- Three-tier memory: working → episodic → semantic
- Post-session reflection pipeline

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

Config is resolved in order: `./omni.config.yaml` → `~/.omni/config.yaml` → package default.

Optional: copy global config once:

```bash
mkdir -p ~/.omni && cp /path/to/OmniCode/omni.config.yaml ~/.omni/config.yaml
```

## Requirements

- Node.js 20+
- `ripgrep` (`rg`) for grep/glob tools
- DashScope API key from [阿里云百炼](https://help.aliyun.com/zh/model-studio/get-api-key)

## Project Structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md).

