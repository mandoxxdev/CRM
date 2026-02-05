@echo off
echo ========================================
echo   CRM GMP INDUSTRIAIS - Iniciando...
echo ========================================
echo.

echo [1/2] Iniciando servidor backend...
start "Servidor Backend" cmd /k "cd server && npm run dev"

timeout /t 3 /nobreak >nul

echo [2/2] Iniciando frontend...
start "Frontend React" cmd /k "cd client && npm start"

echo.
echo ========================================
echo   Sistema iniciado!
echo ========================================
echo.
echo Servidor Backend: http://localhost:5000
echo Frontend: http://localhost:3000
echo.
echo Pressione qualquer tecla para fechar esta janela...
pause >nul
