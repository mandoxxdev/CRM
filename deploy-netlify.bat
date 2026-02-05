@echo off
echo ========================================
echo   Deploy do CRM GMP para Netlify
echo ========================================
echo.

echo [1/3] Instalando dependencias...
call npm install
if errorlevel 1 (
    echo ERRO: Falha ao instalar dependencias
    pause
    exit /b 1
)

echo.
echo [2/3] Gerando build de producao...
call npm run build
if errorlevel 1 (
    echo ERRO: Falha ao gerar build
    pause
    exit /b 1
)

echo.
echo [3/3] Fazendo deploy para Netlify...
call netlify deploy --prod --dir=dist
if errorlevel 1 (
    echo ERRO: Falha no deploy
    echo.
    echo Tente instalar o Netlify CLI primeiro:
    echo npm install -g netlify-cli
    echo.
    echo Ou faca login primeiro:
    echo netlify login
    pause
    exit /b 1
)

echo.
echo ========================================
echo   Deploy concluido com sucesso!
echo ========================================
pause

