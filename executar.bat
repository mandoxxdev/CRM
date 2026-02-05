@echo off
echo ========================================
echo Iniciando CRM GMP
echo ========================================
echo.

REM Verificar se node existe
where node >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo ERRO: Node.js nao encontrado!
    pause
    exit /b 1
)

echo Iniciando servidor de desenvolvimento...
echo.
echo O CRM estara disponivel em: http://localhost:5173
echo.
echo Pressione Ctrl+C para parar o servidor
echo.

call npm run dev

pause

