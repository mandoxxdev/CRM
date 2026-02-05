@echo off
echo ========================================
echo   Configurar para Coolify (Final)
echo ========================================
echo.

echo [1/4] Removendo arquivos .nixpacks gerados...
rmdir /S /Q .nixpacks 2>nul
echo [INFO] Arquivos .nixpacks removidos.

echo [2/4] Adicionando ao .gitignore...
findstr /C:".nixpacks" .gitignore >nul
if %errorlevel% neq 0 (
    echo. >> .gitignore
    echo # Nixpacks gerados automaticamente >> .gitignore
    echo .nixpacks/ >> .gitignore
    echo [INFO] Adicionado ao .gitignore.
) else (
    echo [INFO] Ja esta no .gitignore.
)

echo [3/4] Preparando commit...
git add .gitignore
git add nixpacks.toml
git add Dockerfile

echo [4/4] Pronto para enviar!
echo.
echo Agora execute: enviar-agora.bat
echo.
echo DEPOIS, no Coolify, configure:
echo - NIXPACKS_NODE_VERSION=20 (nas variaveis de ambiente)
echo - OU remova a variavel NIXPACKS_NODE_VERSION se existir
echo.
pause
