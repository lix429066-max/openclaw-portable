# OpenClaw 便携安装脚本
# 用法: powershell -ExecutionPolicy Bypass -File setup.ps1
param(
    [switch]$SkipNodeCheck,
    [string]$InstallDir = "$env:USERPROFILE\.openclaw"
)

$ErrorActionPreference = "Stop"
$PACKAGE_DIR = Split-Path $MyInvocation.MyCommand.Path -Parent

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  OpenClaw 便携安装 — 龙虾优化版 🦞" -ForegroundColor Cyan  
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# 1. Check prerequisites
if (-not $SkipNodeCheck) {
    Write-Host "[1/6] 检查 Node.js..." -ForegroundColor Yellow
    $node = Get-Command node -ErrorAction SilentlyContinue
    if (-not $node) {
        Write-Host "  Node.js 未安装。请从 https://nodejs.org 安装 v22+ 后重试。" -ForegroundColor Red
        Write-Host "  或使用 -SkipNodeCheck 跳过此检查。" -ForegroundColor Gray
        exit 1
    }
    Write-Host "  Node.js $(& node --version) ✅" -ForegroundColor Green
}

# 2. Install OpenClaw
Write-Host "[2/6] 安装 OpenClaw..." -ForegroundColor Yellow
$openc = Get-Command openclaw -ErrorAction SilentlyContinue
if (-not $openc) {
    Write-Host "  安装 openclaw (此过程需要几分钟)..." -ForegroundColor Gray
    npm install -g openclaw@2026.3.28 2>&1 | Select-Object -Last 3
    Write-Host "  OpenClaw 2026.3.28 安装完成 ✅" -ForegroundColor Green
} else {
    Write-Host "  OpenClaw 已安装 ✅" -ForegroundColor Green
}

# 3. Create directory structure
Write-Host "[3/6] 创建目录结构..." -ForegroundColor Yellow
New-Item -ItemType Directory -Force -Path $InstallDir | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\extensions" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\workspace" | Out-Null
New-Item -ItemType Directory -Force -Path "$InstallDir\backup" | Out-Null
Write-Host "  $InstallDir ✅" -ForegroundColor Green

# 4. Copy plugins
Write-Host "[4/6] 安装 cc-optimize 插件..." -ForegroundColor Yellow
$ccDest = "$InstallDir\extensions\cc-optimize\src"
New-Item -ItemType Directory -Force -Path $ccDest | Out-Null
Copy-Item "$PACKAGE_DIR\extensions\cc-optimize\*" "$InstallDir\extensions\cc-optimize\" -Recurse -Force
Write-Host "  cc-optimize: 46 hooks + 11 tools + 5 integrations ✅" -ForegroundColor Green

Write-Host "[5/6] 安装 lossless-claw 插件..." -ForegroundColor Yellow
$lcDest = "$InstallDir\extensions\lossless-claw\src"  
New-Item -ItemType Directory -Force -Path $lcDest | Out-Null
Copy-Item "$PACKAGE_DIR\extensions\lossless-claw\*" "$InstallDir\extensions\lossless-claw\" -Recurse -Force
Write-Host "  lossless-claw: LCM 上下文引擎 ✅" -ForegroundColor Green

# 5. Copy config and workspace
Write-Host "[6/6] 复制配置和 workspace..." -ForegroundColor Yellow
if (-not (Test-Path "$InstallDir\openclaw.json")) {
    Copy-Item "$PACKAGE_DIR\config\openclaw.template.json" "$InstallDir\openclaw.json" -Force
    Write-Host "  配置模板已复制 → $InstallDir\openclaw.json" -ForegroundColor Green
    Write-Host "  ⚠️ 请编辑 openclaw.json 配置你的 API 密钥和 Gateway token" -ForegroundColor Yellow
} else {
    Write-Host "  配置文件已存在，跳过 (保留现有配置)" -ForegroundColor Gray
}
Copy-Item "$PACKAGE_DIR\workspace\*" "$InstallDir\workspace\" -Recurse -Force
Write-Host "  Workspace 文件已复制 ✅" -ForegroundColor Green

Write-Host ""
Write-Host "========================================" -ForegroundColor Cyan
Write-Host "  安装完成！" -ForegroundColor Green
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""
Write-Host " 下一步:" -ForegroundColor Yellow
Write-Host "  1. 编辑 $InstallDir\openclaw.json 配置 API 密钥"
Write-Host "  2. 运行: openclaw gateway start"
Write-Host "  3. 如使用本地模型: 启动 llama-server 并配置 models 段"
Write-Host ""
Write-Host "  故障排查: openclaw doctor"
Write-Host "  文档: https://opencode.ai/docs"
