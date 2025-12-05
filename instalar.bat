@echo off
echo ========================================
echo Instalando dependencias do CRM GMP
echo ========================================
echo.

REM Verificar se node existe
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Node.js nao encontrado!
    echo Por favor, instale o Node.js de https://nodejs.org/
    echo Certifique-se de marcar "Add to PATH" durante a instalacao
    pause
    exit /b 1
)

echo Node.js encontrado!
node --version
echo.

echo Instalando dependencias...
call npm install

if %ERRORLEVEL% EQU 0 (
    echo.
    echo ========================================
    echo Instalacao concluida com sucesso!
    echo ========================================
    echo.
    echo Para executar o projeto, use:
    echo   npm run dev
    echo.
) else (
    echo.
    echo ERRO durante a instalacao!
    pause
    exit /b 1
)

pause

