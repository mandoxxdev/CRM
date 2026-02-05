@echo off
echo ========================================
echo   Corrigir Versao do Node.js
echo ========================================
echo.

echo [1/3] Corrigindo nixpacks.toml...
echo [INFO] Alterando nodejs-22_x para nodejs-20_x

echo [2/3] Corrigindo Dockerfile...
echo [INFO] Alterando node:22-alpine para node:20-alpine

echo [3/3] Preparando para enviar...
git add nixpacks.toml
git add Dockerfile
git commit -m "Corrigir: Usar Node.js 20 em vez de 22"
if %errorlevel% neq 0 (
    echo [AVISO] Nenhuma alteracao para commitar.
)

echo.
echo Agora execute: enviar-agora.bat
echo.
pause
