# MEMORY.md — 长期记忆索引
<!-- MAGIC_DOC: 自维护文档，每次重要操作后同步；≤ 80 行 -->

> **这是索引，不是存储。** 实际内容在 `memory/topics/` 下的话题文件中。  
> 借鉴 Claude Code memdir 架构：索引 ≤ 200 行，内容分离，按需加载。

---

## 🎯 核心原则

| # | 原则 | 要点 |
|---|------|------|
| 1 | **诚实第一** | 绝不骗用户、不编造结果、验证后再说 |
| 2 | **简单命令直接执行** | 不绕弯、遇到障碍先承认 |
| 3 | **新技能安装流程** | link → vetter → 审查 → install → 记录 |
| 4 | **配置先备份** | 备份 → 修改 → 验证，保留 7 个历史版本 |
| 5 | **用户说停止** | 立即停止，不擅自操作 |

## 💡 经验速查

| 类别 | 要点 |
|------|------|
| API 密钥 | `.env` > 环境变量，不在任何配置文件暴露 |
| TTS (QQ) | edge-tts CLI → 验证 > 0 → `<qqvoice>` |
| 搜索 | Tavily (主) → multi-search-engine (备用) |
| 路径 | `$env:USERPROFILE` 不用 `~` |
| 配置 | 先备份 → 再修改 → 验证有效性 |
| 群聊 | 质量 > 数量，不当复读机 |
| 安全 | gateway.cmd/openclaw.json 不含明文密钥 |

## 📂 话题文件索引 (12)

| 文件 | 类型 | 说明 |
|------|------|------|
| `lessons-cheating-user.md` | feedback | 欺骗用户教训 |
| `lessons-qqbot-tts.md` | feedback | QQ TTS 标准流程 |
| `lessons-tavily-api.md` | feedback | Tavily API 环境变量优先级 |
| `lessons-browser-ports.md` | feedback | 浏览器端口耗尽 |
| `lessons-skill-tracking.md` | feedback | 技能数量追踪 |
| `lessons-coding-agent.md` | feedback | coding-agent 误用 |
| `reference-notes.md` | reference | 日常参考笔记 |
| `claude-code-source-analysis.md` | project | Claude Code 源码分析 |
| `claude-code-learning.md` | project | Claude Code 学习笔记 |
| `claude-code-architecture.md` | project | Claude Code 架构笔记 |
| `self-optimization-log.md` | project | 自我优化记录 |
| `skill-verification-history.md` | reference | 技能验证历史 |

## ⚙️ 重要决策

- **2026-05-11**: cc-optimize 插件上线 → 持续优化至 46 hooks + 10 tools + 5 integrations, 0警告, 0冲突
- **2026-05-11**: 安全加固 — gateway.cmd/openclaw.json 密钥移出
- **2026-05-11**: 磁盘清理 — vector_memory venv (~1GB) + CC源码 (~237MB)
- **2026-05-11**: 技能清理 — 5个僵尸技能移除 (baidunetdisk/github-star/n8n/automation/whisper)
- **2026-05-11**: Cron 修复 — 错误复盘添加送达目标，记忆提取 timeout 300→600s
- **2026-05-11**: 模型 fallback 链 — deepseek-v4-pro → deepseek-chat → 本地 Qwen35b
- **2026-05-11**: MEMORY.md 索引化 — 详细内容迁移至 memory/topics/
- **2026-05-07**: MEMORY.md + TOOLS.md 大清理，去重压缩
- **2026-03-20**: 改名"小龙虾"→"无涯"

---

*最后更新: 2026-05-11 17:15 | v5.0 (cc-optimize上线，全面同步)*
