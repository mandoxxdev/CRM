@echo off
echo ========================================
echo   Configurando Remote do GitHub
echo ========================================
echo.

REM Verificar se é repositório Git
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Nao e um repositorio Git!
    echo Execute: git init
    pause
    exit /b 1
)

echo [1/2] Verificando remote atual...
git remote -v >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Remote ja existe. Atualizando...
    git remote set-url origin https://github.com/mandoxxdev/CRM.git
) else (
    echo [INFO] Adicionando remote...
    git remote add origin https://github.com/mandoxxdev/CRM.git
)

echo [2/2] Verificando configuração...
git remote -v
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao configurar remote!
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Remote configurado com sucesso!
echo ========================================
echo.
echo Agora execute: corrigir-e-enviar.bat
echo.
pause
