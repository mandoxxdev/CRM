@echo off
echo ========================================
echo   Remover Lock Files do Git
echo ========================================
echo.

echo [1/4] Removendo lock files localmente...
del /Q package-lock.json 2>nul
del /Q server\package-lock.json 2>nul
del /Q client\package-lock.json 2>nul
echo [INFO] Lock files locais removidos.

echo [2/4] Removendo do Git (mantendo arquivos locais)...
git rm --cached package-lock.json 2>nul
git rm --cached server/package-lock.json 2>nul
git rm --cached client/package-lock.json 2>nul
echo [INFO] Lock files removidos do Git.

echo [3/4] Verificando .gitignore...
findstr /C:"package-lock.json" .gitignore >nul
if %errorlevel% neq 0 (
    echo. >> .gitignore
    echo # Lock files >> .gitignore
    echo package-lock.json >> .gitignore
    echo server/package-lock.json >> .gitignore
    echo client/package-lock.json >> .gitignore
    echo [INFO] Adicionado ao .gitignore.
) else (
    echo [INFO] Ja esta no .gitignore.
)

echo [4/4] Preparando commit...
git add .gitignore
git add nixpacks.toml
git add Dockerfile
git add .dockerignore

echo.
echo ========================================
echo   Pronto para enviar!
echo ========================================
echo.
echo Agora execute: enviar-github.bat
echo.
echo O commit vai remover os lock files do repositorio.
echo.
pause
