@echo off
echo ========================================
echo   Regenerando package-lock.json
echo ========================================
echo.

echo [1/3] Removendo lock files antigos...
del /Q package-lock.json 2>nul
del /Q server\package-lock.json 2>nul
del /Q client\package-lock.json 2>nul
echo [INFO] Lock files antigos removidos.

echo [2/3] Gerando novos lock files...
echo.
echo Gerando package-lock.json da raiz...
call npm install --package-lock-only --legacy-peer-deps
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao gerar package-lock.json da raiz!
    pause
    exit /b 1
)

echo Gerando package-lock.json do servidor...
cd server
call npm install --package-lock-only --legacy-peer-deps
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao gerar package-lock.json do servidor!
    cd ..
    pause
    exit /b 1
)
cd ..

echo Gerando package-lock.json do cliente...
cd client
call npm install --package-lock-only --legacy-peer-deps
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao gerar package-lock.json do cliente!
    cd ..
    pause
    exit /b 1
)
cd ..

echo [3/3] Lock files regenerados com sucesso!
echo.
echo Agora execute: enviar-github.bat
echo.
pause
