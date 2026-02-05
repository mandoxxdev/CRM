@echo off
echo ========================================
echo   Inicializando Repositorio Git
echo ========================================
echo.

REM Verificar se Git está instalado
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Git nao esta instalado!
    echo.
    echo Baixe em: https://git-scm.com/download/win
    pause
    exit /b 1
)

echo [1/4] Inicializando repositorio Git...
git init
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao inicializar repositorio!
    pause
    exit /b 1
)

echo [2/4] Verificando remote do GitHub...
git remote -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Adicionando remote do GitHub...
    git remote add origin https://github.com/mandoxxdev/CRM.git
) else (
    echo [INFO] Remote ja existe. Atualizando...
    git remote set-url origin https://github.com/mandoxxdev/CRM.git
)

echo [3/4] Verificando branch...
git branch --show-current >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Criando branch main...
    git checkout -b main
)

echo [4/4] Verificando configuracoes do Git...
git config user.name >nul 2>&1
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Configure suas credenciais Git:
    echo.
    set /p GIT_NAME="Digite seu nome: "
    set /p GIT_EMAIL="Digite seu email: "
    git config --global user.name "%GIT_NAME%"
    git config --global user.email "%GIT_EMAIL%"
)

echo.
echo ========================================
echo   Repositorio Git inicializado!
echo ========================================
echo.
echo Proximos passos:
echo 1. Configure autenticacao GitHub (veja CONFIGURAR_GIT.md)
echo 2. Execute: git-push.bat para enviar alteracoes
echo.
pause
