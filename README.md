# OpenClaw 便携版 — 龙虾优化版 🦞

基于 OpenClaw 2026.3.28，集成 107 项优化的即用型 AI 代理平台。

## 快速安装 (Windows)

```powershell
powershell -ExecutionPolicy Bypass -File setup.ps1
```

## 前置条件

- Node.js v22+ (https://nodejs.org)
- (可选) 本地 llama-server (用于本地模型)
- DeepSeek API Key (https://platform.deepseek.com)

## 包含内容

### 插件
| 插件 | 功能 |
|------|------|
| **cc-optimize** | 46 hooks + 11 tools + 5 integrations — Claude Code 对标优化引擎 |
| **lossless-claw** | LCM 上下文引擎 — 无损耗对话压缩 |

### cc-optimize 核心能力
- **4级模型回退**: DeepSeek V4 Pro → Chat → Reasoner → 本地 Qwen
- **3层压缩级联**: micro(45%) → auto+LCM(60%) → emergency(90%)
- **16+ 自动允许工具**: read/grep/glob/cache/cc_*/lcm_*...
- **Git 安全协议**: 注入系统提示词防止危险操作
- **错误恢复级联**: L1(等待/重试) → L2(压缩) → L3(切换/报告)
- **实时 Token 追踪**: budget-guard → health-monitor + compaction-manager
- **结构化工具**: 21 tools 全量元数据 + 搜索提示

### 工具列表
```
规划:  todo_write        | 支持 pending/in_progress/completed/cancelled
记忆:  session_note      | KV 暂存器 (get/set/list/delete)
缓存:  cache             | 30s TTL, get/set/clear
诊断:  cc_context        | Token 使用率 + 压缩建议
       cc_doctor         | 6点健康检查 (gateway/config/plugins/memory/node)
       cc_status         | 会话状态 + cron + 配置版本
       cc_config         | 插件配置展示
       cc_help           | 工具目录 + 模块分类
       cc_question       | 结构化选项式提问
Git:   cc_diff           | staged/unstaged/all diff
质量:  cc_lint           | 括号平衡 + JSON 校验 + import 检测
```

## 配置

1. 编辑 `~/.openclaw/openclaw.json`
2. 设置 `auth.profiles.deepseek:default.mode = "api_key"`  
3. 运行 `openclaw /connect` 输入 DeepSeek API Key
4. (可选) 配置本地模型: 编辑 models.providers 段

## 启动

```powershell
# 启动网关
openclaw gateway start

# 检查状态
openclaw status
openclaw doctor

# 查看模块加载
grep "[cc-optimize]" C:\tmp\openclaw\openclaw-*.log
```

## 配置本地模型

```json
"models": {
  "providers": {
    "llama-qwen35b": {
      "baseUrl": "http://localhost:8080/v1",
      "apiKey": "sk-no-key-required",
      "api": "openai-completions",
      "models": [{
        "id": "YOUR_MODEL_ID",
        "name": "本地模型",
        "contextWindow": 72000,
        "maxTokens": 65536
      }]
    }
  }
}
```

## 文件结构

```
~/.openclaw/
├── openclaw.json          # 主配置
├── gateway.cmd             # Windows 启动脚本
├── extensions/
│   ├── cc-optimize/       # CC 优化引擎
│   └── lossless-claw/     # LCM 上下文引擎
└── workspace/
    ├── AGENTS.md           # Agent 运行指南
    ├── SOUL.md             # AI 人格定义
    ├── TOOLS.md            # 工具索引
    ├── HEARTBEAT.md        # 心跳检查指南
    └── MEMORY.md           # 记忆索引
```

## 技术架构

```
budgetGuard.tokenTrack → healthMonitor + compactionManager (实时!)
errorClassifier → modelResolver.getBestAvailable (自动 fallback!)
contextInjector → before_prompt_build (workspace 上下文注入!)
shellSafety → sharedState (危险命令实时告警!)
```

## 版本

- OpenClaw: 2026.3.28
- cc-optimize: 1.0.0 (46 hooks + 11 tools + 5 integrations)
- 优化项: 107 项 (对标 Claude Code 15/15 + OpenCode 12/15)
