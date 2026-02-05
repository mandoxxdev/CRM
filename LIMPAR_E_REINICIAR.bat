@echo off
echo ========================================
echo   LIMPANDO CACHE E REINICIANDO
echo ========================================
echo.

echo [1/4] Parando processos...
taskkill /F /IM node.exe 2>nul
timeout /t 2 /nobreak >nul

echo [2/4] Limpando cache do webpack...
cd client
if exist node_modules\.cache (
    rmdir /s /q node_modules\.cache
    echo Cache removido!
) else (
    echo Cache nao encontrado.
)
if exist build (
    rmdir /s /q build
    echo Build removido!
)

cd ..

echo [3/4] Verificando dependencias...
cd client
if not exist node_modules\react-toastify (
    echo Instalando react-toastify...
    call npm install react-toastify --save
)
if not exist node_modules\xlsx (
    echo Instalando xlsx...
    call npm install xlsx --save
)

cd ..

echo [4/4] Iniciando sistema...
start "Servidor Backend" cmd /k "cd server && npm run dev"
timeout /t 3 /nobreak >nul
start "Frontend React" cmd /k "cd client && npm start"

echo.
echo ========================================
echo   LIMPEZA CONCLUIDA!
echo ========================================
echo.
echo Aguarde alguns segundos para o sistema iniciar...
echo.
echo Servidor: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
pause




