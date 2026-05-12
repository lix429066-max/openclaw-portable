@echo off
rem OpenClaw Health Check — 启动后自检
echo ========================================
echo   OpenClaw Health Check
echo ========================================
echo.

echo [1/5] Gateway port...
powershell -Command "if ((Test-NetConnection 127.0.0.1 -Port 18789 -WarningAction SilentlyContinue).TcpTestSucceeded) { Write-Host '  PASS' -ForegroundColor Green } else { Write-Host '  FAIL' -ForegroundColor Red }"
echo.

echo [2/5] Config...
if exist "%USERPROFILE%\.openclaw\openclaw.json" (
    echo   PASS
) else (
    echo   FAIL - config missing
)
echo.

echo [3/5] Plugins...
set count=0
if exist "%USERPROFILE%\.openclaw\extensions\cc-optimize\index.ts" set /a count+=1
if exist "%USERPROFILE%\.openclaw\extensions\lossless-claw\openclaw.plugin.json" set /a count+=1
echo   %count%/2 plugins found
echo.

echo [4/5] Memory index...
if exist "%USERPROFILE%\.openclaw\lcm.db" (
    echo   PASS
) else (
    echo   SKIP - not initialized yet
)
echo.

echo [5/5] Model files...
set models=0
if exist "D:\Program Files\model\Qwen3.6-35B-A3B-APEX-I-Mini.gguf" set /a models+=1
if exist "D:\Program Files\model\embeddinggemma-300m-qat-Q8_0.gguf" set /a models+=1
echo   %models%/2 model files present
echo.

echo ========================================
echo   Health check complete
echo ========================================
pause
