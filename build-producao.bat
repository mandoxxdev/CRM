@echo off
echo ========================================
echo   Build de Producao - CRM GMP
echo ========================================
echo.

echo [1/2] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias
    pause
    exit /b 1
)

echo.
echo [2/2] Gerando build de producao...
call npm run build
if errorlevel 1 (
    echo ERRO: Falha ao gerar build
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Build concluido com sucesso!
echo ========================================
echo.
echo Os arquivos estao na pasta: dist/
echo.
echo Agora voce pode:
echo 1. Fazer upload da pasta dist/ para seu servidor
echo 2. Usar um dos scripts de deploy (deploy-vercel.bat ou deploy-netlify.bat)
echo 3. Testar localmente com: npm run preview
echo.
pause

