# TOOLS.md — 本地工具索引
<!-- MAGIC_DOC: 自维护 -->

> **用法见各技能 SKILL.md。本文件只回答：有什么工具、什么时候用。**

---

## 📚 技能 (18)

| 分类 | 技能 | 触发场景 | 状态 |
|------|------|----------|------|
| 🔍 搜索 | `tavily-search` | 实时/事实/价格查询 | ✅ 主 |
| 🔍 搜索 | `multi-search-engine` | 多引擎备选 | ✅ 备 |
| 🔍 搜索 | `baidu-search` | 中文资料 | ⚠️ 需密钥 |
| 🔍 搜索 | `searxng` | 隐私搜索 | ✅ |
| 🎵 语音 | `edge-tts` | 文本→语音 | ✅ |
| 💻 代码 | `code` | 规范工作流 | ✅ |
| 🤖 Agent | `self-improving-agent` | 错误捕获/教训 | ✅ |
| 🤖 Agent | `proactive-agent` | 主动检查 | ✅ |
| 🤖 Agent | `agent-optimize` | 性能诊断 | ✅ |
| 🧠 记忆 | `persistent-memory` | 向量+KGraph | ✅ |
| 📊 监控 | `command-center` | 实时面板 :3333 | ✅ |
| 🌐 网页 | `agent-browser` | 无头浏览器 :18800 | ⚠️ |
| 🌐 网页 | `browser-ai-chat` | Playwright AI对话 | ✅ |
| 🧰 系统 | `skill-vetter` | 技能安全扫描 | ✅ |
| 🧰 系统 | `skill-manager` | 安装/卸载 | ✅ |
| 🧰 系统 | `find-skills` | 发现新技能 | ✅ |

## 🦞 cc-optimize 插件 (46 hooks + 10 tools + 5 integrations)

| 模块 | 功能 | CC 来源 |
|------|------|---------|
| compact | 三级压缩 (micro/auto/emergency), real token tracking | services/compact/ |
| errors | 7类错误分类 + auto-fallback 模型切换 | query.ts |
| shell | fail-closed 危险命令检测 + 实时告警 | utils/bash/ |
| health | 6点健康检查(60s) + rate-limit 滑动窗口 | claudeAiLimits.ts |
| partitioner | 并发安全工具分区 (10并发批处理) | toolOrchestration.ts |
| permissions | 5模式权限矩阵 + 安全路径 | utils/permissions/ |
| budget | Token预算追踪 + cost 估算 ($0.55/2.19) | QueryEngine.ts |
| git | 文件系统 git 状态 + 分支/SHA 检测 | utils/git/ |
| automemory | 4类型自动记忆提取 (每10条消息) | services/extractMemories/ |
| speculate | 9规则工具预测引擎 + 命中率追踪 | speculation pipeline |
| stall | 看门狗检测 (5s checks, 45s alert) | tasks/LocalShellTask.ts |
| recovery | crash-safe 会话恢复 (session-pointer) | bridge pointer |
| context | 工作区上下文注入 (SOUL/AGENTS/MEMORY 等12文件) | context injection |
| memory | 10-section 模板 + flush-plan + prompt integration | sessionMemory |
| model | 4级回退 (v4-pro→chat→reasoner→local-qwen) | model resolution |
| prompt | CC-style static+dynamic assembly | system prompt |
| session | session snapshot + resume | session management |
| ... | (+28个辅助模块) | |

## 📜 自定义脚本 (10)

| 脚本 | 用途 |
|------|------|
| `extract-memories.ps1` | 日志→话题文件 |
| `context-budget.ps1` | 6阈值上下文监控 |
| `subagent-budget.ps1` | 子代理预算+失联检测 |
| `compact-hooks.ps1` | 压缩前后快照校验 |
| `status-commands.ps1` | /context /doctor /cost |
| `config-backup.ps1` | 配置备份(保留7版) |
| `skill-verify.ps1` | 技能扫描 |
| `error-review.ps1` | .learnings 回顾 |
| `auto-compress.ps1` | 自动归档 |
| `topic-filter.py` | 关键词预筛选 |

## 🔑 关键路径

| 项目 | 值 |
|------|-----|
| edge-tts CLI | `D:\python310\Scripts\edge-tts.exe` |
| TTS 默认声音 | `zh-CN-XiaoxiaoNeural` |
| Tavily API Key | `~/.openclaw/.env` → `TAVILY_API_KEY` |
| Gateway | ws://127.0.0.1:18789 |
| cc-optimize 日志 | grep `[cc-optimize]` in gateway logs |

---

*最后更新: 2026-05-11 18:30 | v5.1 (cc-optimize 46 hooks + full wiring)*
