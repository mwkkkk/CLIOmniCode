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

# 2. Configure API key
cp .env.example .env
# Edit .env with your DASHSCOPE_API_KEY

# 3. Run
npm run dev

# Single-shot
npm run dev -- run "List all TypeScript files in src/"

# List sessions
npm run dev -- sessions
```

## Requirements

- Node.js 20+
- `ripgrep` (`rg`) for grep/glob tools
- DashScope API key from [阿里云百炼](https://help.aliyun.com/zh/model-studio/get-api-key)

## Project Structure

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/DESIGN_DECISIONS.md](docs/DESIGN_DECISIONS.md).

## License

MIT
