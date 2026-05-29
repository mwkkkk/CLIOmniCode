# OmniCode Architecture

## Overview

OmniCode is a terminal-native agentic coding CLI. It uses Alibaba Qwen (DashScope) via the OpenAI-compatible API.

## Layers

```
CLI (Commander + readline REPL)
  → SessionEngine (session lifecycle, transcript, reflection)
    → AgentLoop (core while-loop: LLM → tools → LLM)
      → Tools (read, write, edit, bash, grep, glob, dispatch)
      → AgentRouter (sub-agent dispatch + HandoffReport)
    → Memory (L1 working, L2 episodic, L3 semantic)
    → QwenProvider (streaming + tool call aggregation)
```

## Key Files

| Path | Responsibility |
|------|----------------|
| `src/engine/AgentLoop.ts` | Core agentic loop |
| `src/engine/SessionEngine.ts` | Session orchestration |
| `src/llm/qwen-provider.ts` | DashScope / Qwen integration |
| `src/orchestrator/AgentRouter.ts` | Sub-agent dispatch |
| `src/memory/ReflectionPipeline.ts` | Post-session memory extraction |
| `src/session/SessionIndex.ts` | Session metadata index |

## Data Layout

```
~/.omni/
├── sessions/
│   ├── index.json
│   └── {sessionId}/transcript.jsonl
├── episodes/{projectHash}/
└── semantic/{projectHash}/facts.jsonl
```

## Commands

```bash
omni              # Interactive REPL
omni run "..."    # Single-shot mode
omni sessions     # List sessions
```

REPL slash commands: `/sessions`, `/new`, `/exit`
