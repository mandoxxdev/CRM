@echo off
echo ========================================
echo   Removendo Lock Files e Enviando
echo ========================================
echo.

echo [1/3] Removendo package-lock.json...
del /Q package-lock.json 2>nul
del /Q server\package-lock.json 2>nul
del /Q client\package-lock.json 2>nul
echo [INFO] Lock files removidos.

echo [2/3] Adicionando ao .gitignore...
findstr /C:"package-lock.json" .gitignore >nul
if %errorlevel% neq 0 (
    echo package-lock.json >> .gitignore
    echo server/package-lock.json >> .gitignore
    echo client/package-lock.json >> .gitignore
    echo [INFO] Adicionado ao .gitignore.
) else (
    echo [INFO] Ja esta no .gitignore.
)

echo [3/3] Enviando para GitHub...
echo.
echo Execute: enviar-github.bat
echo.
pause
