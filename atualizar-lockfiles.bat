@echo off
echo ========================================
echo   Atualizando package-lock.json
echo ========================================
echo.

echo [1/3] Atualizando package-lock.json da raiz...
call npm install --package-lock-only
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao atualizar package-lock.json da raiz!
    pause
    exit /b 1
)

echo [2/3] Atualizando package-lock.json do servidor...
cd server
call npm install --package-lock-only
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao atualizar package-lock.json do servidor!
    cd ..
    pause
    exit /b 1
)
cd ..

echo [3/3] Atualizando package-lock.json do cliente...
cd client
call npm install --package-lock-only
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao atualizar package-lock.json do cliente!
    cd ..
    pause
    exit /b 1
)
cd ..

echo.
echo ========================================
echo   Lock files atualizados com sucesso!
echo ========================================
echo.
echo Agora execute: git-push.bat
echo.
pause
