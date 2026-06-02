# 设计决策

## 1. TypeScript + Node（而非 Bun）

- **选择**：Node 20+，开发时使用 `tsx`。
- **原因**：兼容性最广；CCB 仅作参考，不是运行时依赖。
- **权衡**：比 Bun 略慢；对学习型项目可接受。

## 2. 通过 OpenAI 兼容 API 使用 Qwen

- **选择**：官方 `openai` npm 包 + DashScope `compatible-mode/v1`。
- **原因**：DashScope 无 Node SDK；OpenAI 协议是行业标准。
- **权衡**：需手动聚合流式 `tool_calls` 分片（`tool-call-accumulator.ts`）。

## 3. HandoffReport 而非原始 tool_result 文本

- **选择**：子智能体返回结构化 `HandoffReport` JSON。
- **原因**：避免子智能体输出污染主上下文；体现系统设计思路。
- **灵感来源**：CCB AgentTool，但做了简化。
- **当前状态**：类型中的 `artifacts`、`openQuestions`、`memoryCandidates` 字段尚存在但未填充。`HandoffBus` 预留给未来的追踪收集。

## 4. 三层记忆与 L2 两阶段晋升

| 层级 | 存储 | 用途 | 写入时机 |
|------|------|------|----------|
| L1 工作记忆 | `WorkingStore` + `transcript.jsonl` | 完整会话消息（用户/助手/工具） | 会话进行中；结束时清空 |
| L2 情节记忆 | `~/.omni/episodes/` | 完整任务叙事 | 阶段 1：会话结束 |
| L2 语义记忆 | `~/.omni/semantic/` | 跨会话抽象模式 | 阶段 2：仅整合时 |
| L2 程序性记忆 | `~/.omni/procedures/` | 已验证可复用 SOP | 阶段 2：仅整合时 |
| L3 实体记忆 | `~/.omni/entities/` | 结构化事实（`entity.attr = value`） | 阶段 1：会话结束 |

**阶段 1（反思）** 在 `/exit` 或 `/new` 时：

- `SessionQualityGate` 跳过琐碎会话（无用户消息，或单轮问候且少于 200 字符且无工具调用）。
- 情节记忆与实体记忆直接写入（实体需 confidence ≥ 阈值）。
- 语义 / 程序性候选写入 `~/.omni/candidates/{projectHash}/pool.jsonl`。
- 候选池按内容/标题去重；较长的程序性变体替换较短者。

**阶段 2（整合）** 在达到阈值或执行 `omni consolidate` 时：

- LLM 审阅待处理候选 + 近期情节 + 已有存储。
- 晋升前的硬性校验规则：
  - **语义**：confidence ≥ 阈值，且（≥ 2 个来源会话，或 ≥ 2 个候选，或 confidence ≥ 0.9 的强证据）。
  - **程序性**：confidence ≥ 阈值、步骤数 ≥ 最小值、非琐碎（非「读文件再解释」），且（≥ 2 个候选，或由近期情节佐证）。
- 拒绝噪声；证据不足的候选保持 pending。
- 当 `consolidation.auto: true` 且任一阈值满足时，会话结束后自动触发。

- **原因**：语义与程序性记忆需要跨情节证据；每次会话结束都写入会污染长期存储中的单次事件噪声。
- **尚未实现**：向量嵌入、用户 `/save-sop`、被拒候选归档。

## 5. 基于 recallHint 的智能召回（非按类型 top-K）

- **选择**：构建项目全部记忆的完整清单；通过 flash 侧查询（`MemoryRecallSelector`）每次选取 ≤ `recall_max_total` 条，关键词作后备。
- **原因**：按类型 top-K 会在无关项上浪费上下文，且错过跨类型相关性。对 `recallHint` 字段的单次侧查询（与 CCB `findRelevantMemories` 对齐）可按任务选取最相关记忆，不限类型。
- **recallHint**：每条记忆存储检索关键词（非摘要），在反思/整合时写入。指南鼓励同义词、双语词，以及应对模糊指代的查询。
- **后备**：侧查询 LLM 失败时，`rankManifestIdsByQuery` 按关键词重叠为清单项打分 — 未达上限时不丢弃零分项。
- **配置说明**：`omni.config.yaml` 中的 `semantic_recall_top_k` 等保留给未来的按类型模式；当前召回仅使用 `recall_max_total`。

## 6. 记忆漂移防护

- **选择**：系统提示包含一块内容，要求智能体在根据召回记忆行动前，用工具核实文件路径、符号与标志。
- **原因**：记忆描述的是过往会话中的主张；代码库可能已变更。镜像 CCB 的信任召回章节，尚无完整校验流水线。
- **另**：反思/整合提示明确拒绝可从当前代码库阅读得出的记忆（文件路径、符号名、仓库布局）。

## 7. OMNI.md 作为项目级人工记忆

- **选择**：若项目根存在 `OMNI.md`，其内容注入每次系统提示的「Project Memory」段。
- **原因**：部分约定有意由人编写，不应等待自动抽取。与自动化 L2/L3 存储互补。

## 8. Dispatch 工具 + AgentRouter（非嵌套 AgentTool fork）

- **选择**：Conductor 调用 `dispatch` → `AgentRouter` 启动隔离的 `AgentLoop`。
- **原因**：编排与执行清晰分离；更易追踪与测试。
- **尚未实现**：异步后台智能体、git worktree 隔离、队友 swarm。

## 9. 破坏性工具的权限询问模式

- **选择**：`write`、`edit`、`bash`、`dispatch` 在 REPL 执行前提示用户。
- **原因**：Shell 访问与子智能体委派需要护栏；镜像 CCB 权限理念，尚无完整规则引擎。
- **适用范围**：Conductor 与子智能体（每个子智能体循环也在 `permissionMode: 'ask'` 下运行）。

## 10. 多路径配置解析

- **选择**：配置查找顺序：显式路径 → `OMNI_CONFIG` → `./omni.config.yaml` → `~/.omni/config.yaml` → 包内默认。
- **原因**：通过 `npm link` 可在任意项目目录运行 `omni`；各项目可覆盖模型/智能体，同时共享全局后备配置。

## 11. 通过 Tool 适配器接入 MCP（非 AgentLoop fork）

- **选择**：MCP 服务器经 stdio 连接（`@modelcontextprotocol/sdk`）；每个 MCP 工具适配为现有 `Tool` 接口，运行时合并进 `ToolRegistry`。
- **命名**：`mcp__{serverId}__{toolName}` 避免与内置 `read`/`grep` 等冲突。
- **原因**：AgentLoop、权限询问与 LLM 函数调用保持不变；新能力由配置驱动扩展。
- **首个服务器**：GitHub MCP（`@modelcontextprotocol/server-github`）— issue、PR、远程文件读取。内置工具处理本地文件；MCP 处理外部 SaaS API。
- **范围控制**：`omni.config.yaml` 中每服务器的 `agents` 列表与 `tools` 白名单。默认演示仅向 conductor 暴露 GitHub 只读工具。
- **权限**：MCP 写工具（`create_*`、`merge_*` 等）映射为 `isDestructive: true`，与 `write`/`bash` 使用相同 REPL 询问流程。
- **失败模式**：MCP 连接失败（缺令牌、spawn 错误）时记录警告并继续仅内置工具 — 不硬崩溃。
- **尚未实现**：HTTP/SSE MCP 传输、配置列表外多 MCP 服务器并发、OAuth 浏览器流程。
