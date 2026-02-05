@echo off
echo ========================================
echo   Verificar Status do Git
echo ========================================
echo.

echo [1/4] Verificando se e repositorio Git...
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Nao e um repositorio Git!
    pause
    exit /b 1
)
echo [OK] E um repositorio Git.

echo.
echo [2/4] Verificando remote...
git remote -v
if %errorlevel% neq 0 (
    echo [ERRO] Remote nao configurado!
    pause
    exit /b 1
)

echo.
echo [3/4] Verificando status...
git status

echo.
echo [4/4] Verificando commits locais vs remotos...
git log --oneline -5
echo.
echo [INFO] Comparando com remoto...
git fetch origin >nul 2>&1
git log --oneline origin/main -5 2>nul
if %errorlevel% neq 0 (
    echo [AVISO] Nao foi possivel acessar o remoto.
)

echo.
echo [INFO] Verificando se ha commits para enviar...
git log origin/main..HEAD --oneline 2>nul
if %errorlevel% equ 0 (
    echo [INFO] Ha commits locais que nao estao no remoto.
) else (
    echo [INFO] Nenhum commit novo para enviar.
)

echo.
pause
