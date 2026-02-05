@echo off
echo ========================================
echo   CRM GMP INDUSTRIAIS
echo   Instalando dependencias...
echo ========================================
echo.

cd /d "%~dp0"

echo Instalando dependencias do projeto raiz...
call npm install

echo.
echo Instalando dependencias do servidor...
cd server
call npm install
cd ..

echo.
echo Instalando dependencias do cliente...
cd client
call npm install
cd ..

echo.
echo ========================================
echo   Instalacao concluida!
echo ========================================
echo.
echo Agora voce pode executar: iniciar.bat
echo.
pause




