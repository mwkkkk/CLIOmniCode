# OmniCode

面向终端的智能体编程 CLI，支持多智能体编排、会话管理与分层记忆。

基于 **TypeScript + Node** 构建，由 **阿里通义千问（Qwen）**（DashScope OpenAI 兼容 API）驱动。

## 功能特性

- **智能体循环** — 流式输出、函数调用、对破坏性工具进行权限门控
- **工具** — `read`、`write`、`edit`、`bash`、`grep`、`glob`、`dispatch`、`ask_user`
- **多智能体** — Conductor 通过结构化 `HandoffReport` 委派给 planner、explorer、coder、reviewer、verifier
- **会话持久化** — JSONL 对话记录 + 项目级索引；自动恢复活跃会话
- **三层记忆** — L1 工作记忆 → L2 情节 / 语义 / 程序性 → L3 实体
- **L2 两阶段晋升** — 会话结束时反思（Reflection），跨情节整合（Consolidation）
- **智能召回** — 通过 flash 侧查询从完整清单中选取相关记忆（由 `recallHint` 驱动）
- **项目记忆** — 可选的 `OMNI.md` 注入到每次系统提示中
- **MCP 集成** — 通过 Model Context Protocol 接入外部工具（GitHub MCP：搜索 issue/PR、读取远程文件）

## 快速开始

```bash
# 1. 安装依赖
npm install

# 2. 配置 API 密钥（shell 环境变量、~/.zshrc 或 .env）
export DASHSCOPE_API_KEY=sk-xxx
export GITHUB_TOKEN=ghp_xxx          # 可选；用于 GitHub MCP
# DASHSCOPE_BASE_URL 可选；默认为北京兼容端点

# 3. 全局安装（在 OmniCode 仓库中执行一次）
npm run build && npm link

# 确保 node bin 在 PATH 中（Homebrew node@22）：
# export PATH="/opt/homebrew/opt/node@22/bin:$PATH"

# 4. 在任意项目目录中使用
cd ~/work/your-project
omni
```

配置按以下顺序解析：`OMNI_CONFIG` → `./omni.config.yaml` → `~/.omni/config.yaml` → 包内默认配置。

可选：一次性复制全局配置：

```bash
mkdir -p ~/.omni && cp /path/to/OmniCode/omni.config.yaml ~/.omni/config.yaml
```

## 命令

```bash
omni                          # 交互式 REPL（默认）
omni run "fix the login bug"  # 单次执行模式
omni run "..." --session <id> # 恢复指定会话
omni sessions                 # 列出当前项目的会话
omni consolidate              # 强制触发记忆整合
omni mcp                      # 列出已加载的 MCP 工具（调试）
```

REPL 斜杠命令：`/sessions`、`/new`、`/exit`

## GitHub MCP（可选）

OmniCode 可连接 [GitHub MCP](https://github.com/modelcontextprotocol/servers)，使智能体能在本地文件系统之外查询 GitHub（issue、PR、远程文件内容）。

1. 创建 GitHub **细粒度个人访问令牌（PAT）**，授予 **公共仓库（只读）** 权限。
2. 永久设置令牌，例如在 `~/.zshrc` 中：

   ```bash
   export GITHUB_TOKEN=ghp_xxx
   ```

   或使用密钥文件：`mkdir -p ~/.omni && echo 'export GITHUB_TOKEN=ghp_xxx' >> ~/.omni/env`，并在 `~/.zshrc` 中加入 `[ -f ~/.omni/env ] && source ~/.omni/env`。

3. 验证：

   ```bash
   omni mcp
   omni run "List the 3 most recent open issues in facebook/react"
   ```

MCP 在 `omni.config.yaml` 的 `mcp.servers.github` 下配置。默认仅向 **conductor** 智能体暴露只读工具。写操作工具（创建 issue、合并 PR）需通过现有权限询问流程经用户确认。

接线细节见 [架构文档 — MCP](docs/ARCHITECTURE.zh-CN.md#mcp-外部工具)。

所有命令均支持 `-c, --cwd <path>`。

## 环境要求

- Node.js 20+
- `ripgrep`（`rg`），用于 grep/glob 工具
- 来自 [阿里云百炼](https://help.aliyun.com/zh/model-studio/get-api-key) 的 DashScope API 密钥
- GitHub 个人访问令牌（可选，用于 MCP）

## 文档

- [架构](docs/ARCHITECTURE.zh-CN.md) — 分层、记忆流、MCP、数据布局、智能体配置
- [设计决策](docs/DESIGN_DECISIONS.zh-CN.md) — 权衡与 rationale
