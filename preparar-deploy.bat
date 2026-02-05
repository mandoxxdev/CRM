@echo off
echo ========================================
echo   Preparar para Deploy no Coolify
echo ========================================
echo.

echo [1/4] Removendo package-lock.json...
del /Q package-lock.json 2>nul
del /Q server\package-lock.json 2>nul
del /Q client\package-lock.json 2>nul
echo [INFO] Lock files removidos.

echo [2/4] Verificando .gitignore...
findstr /C:"package-lock.json" .gitignore >nul
if %errorlevel% neq 0 (
    echo package-lock.json >> .gitignore
    echo server/package-lock.json >> .gitignore
    echo client/package-lock.json >> .gitignore
    echo [INFO] Adicionado ao .gitignore.
) else (
    echo [INFO] Ja esta no .gitignore.
)

echo [3/4] Adicionando alteracoes ao Git...
git add .gitignore
git add nixpacks.toml
git add Dockerfile
git add .dockerignore

echo [4/4] Pronto para enviar!
echo.
echo Agora execute: enviar-github.bat
echo.
echo Depois, no Coolify, configure:
echo Build Command: npm install --legacy-peer-deps ^&^& cd client ^&^& npm install --legacy-peer-deps ^&^& npm run build ^&^& cd ../server ^&^& npm install --legacy-peer-deps
echo Start Command: cd server ^&^& node index.js
echo.
pause
