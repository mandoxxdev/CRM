@echo off
echo ========================================
echo   BUILD PARA PRODUCAO - CRM GMP
echo ========================================
echo.

echo [1/3] Instalando dependencias do cliente...
cd client
call npm install
if errorlevel 1 (
    echo ERRO ao instalar dependencias do cliente!
    pause
    exit /b 1
)

echo.
echo [2/3] Fazendo build do frontend...
call npm run build
if errorlevel 1 (
    echo ERRO ao fazer build do frontend!
    pause
    exit /b 1
)
cd ..

echo.
echo [3/3] Instalando dependencias do servidor...
cd server
call npm install --production
if errorlevel 1 (
    echo ERRO ao instalar dependencias do servidor!
    pause
    exit /b 1
)
cd ..

echo.
echo ========================================
echo   BUILD CONCLUIDO COM SUCESSO!
echo ========================================
echo.
echo Proximos passos:
echo 1. Renomeie client\build para public
echo 2. Faca upload das pastas para Hostinger:
echo    - server/
echo    - public/ (renomeado de client/build)
echo    - .htaccess
echo 3. Acesse via SSH e configure o .env
echo 4. Inicie com PM2: pm2 start server/index.js
echo.
echo Consulte DEPLOY_HOSTINGER.md para mais detalhes.
echo.
pause
