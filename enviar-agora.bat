@echo off
echo ========================================
echo   ENVIAR PARA GITHUB AGORA
echo ========================================
echo.

REM Solicitar token
set /p TOKEN="Cole seu token do GitHub: "
if "%TOKEN%"=="" (
    echo [ERRO] Token obrigatorio!
    pause
    exit /b 1
)

echo.
echo [1/4] Configurando remote...
git remote remove origin >nul 2>&1
git remote add origin https://%TOKEN%@github.com/mandoxxdev/CRM.git

echo [2/4] Adicionando TODOS os arquivos...
git add -A

echo [3/4] Fazendo commit...
git commit -m "Atualizacao completa: %date% %time%"
if %errorlevel% neq 0 (
    echo [AVISO] Nenhuma alteracao para commitar.
)

echo [4/4] FORCANDO push para GitHub...
git push -f origin main
if %errorlevel% neq 0 (
    echo [AVISO] Tentando sem force...
    git push origin main
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha no push!
        echo.
        echo Teste manualmente:
        echo git push origin main
        echo.
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   SUCESSO! Verifique em:
echo   https://github.com/mandoxxdev/CRM
echo ========================================
echo.
pause
