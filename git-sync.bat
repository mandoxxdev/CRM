@echo off
echo ========================================
echo   Sincronizando com o GitHub
echo ========================================
echo.

REM Verificar se estamos em um repositório Git
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Nao e um repositorio Git!
    pause
    exit /b 1
)

echo [1/2] Baixando alteracoes do GitHub...
git pull origin main
if %errorlevel% neq 0 (
    echo [AVISO] Tentando com branch 'master'...
    git pull origin master
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao baixar alteracoes!
        pause
        exit /b 1
    )
)

echo [2/2] Verificando status...
git status

echo.
echo ========================================
echo   Sincronizacao concluida!
echo ========================================
echo.
pause
