# OpenClaw Quick Reference 🦞

## 启动
```powershell
# 方式1: 双击运行
C:\Users\yanping\.openclaw\gateway.cmd

# 方式2: 命令行
openclaw gateway start
```

## 管理
```
openclaw status          # 查看状态
openclaw doctor           # 健康检查
openclaw cron list        # 定时任务
openclaw memory status    # 记忆索引状态
health-check.cmd          # 本地自检脚本
```

## 模型
```
主:   deepseek/deepseek-v4-pro (131K ctx, $0.55/$2.19 per MTok)
备1:  deepseek/deepseek-chat   (131K ctx, $0.27/$1.10)
备2:  deepseek/deepseek-reasoner (131K ctx, 思考模式)
本地: llama-qwen35b/Qwen3.6-35B (72K ctx, localhost:8080)
```

## cc-optimize 工具 (会话内使用)
```
cc_mode(mode:"beast")   # 完全自主模式
cc_mode(mode:"plan")    # 只读规划模式
cc_context()            # 上下文使用率
cc_doctor()             # 系统健康检查
cc_status()             # 会话状态
cc_diff(mode:"unstaged") # Git diff
cc_lint(path:"src/")    # 快速语法检查
cache(action:"get",key) # 缓存读取
todo_write(todos:[...]) # 任务管理
session_note(action:"set",key,value) # 便签
```

## 故障排查
```
1. Gateway 挂了 → 运行 health-check.cmd
2. 端口占用  → netstat -ano | findstr 18789
3. 日志      → C:\tmp\openclaw\openclaw-*.log
4. 清除缓存  → 删 %TEMP%\jiti\*, 重启网关
```

## 便携版分发
```
1. 复制 openclaw-portable.zip 到目标机器
2. 解压, 运行 setup.ps1
3. 编辑 ~\.openclaw\openclaw.json 配 API 密钥
4. openclaw gateway start
```
