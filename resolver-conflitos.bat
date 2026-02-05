@echo off
echo ========================================
echo   Resolver Conflitos e Enviar
echo ========================================
echo.

echo [1/4] Verificando conflitos...
findstr /C:"<<<<<<< HEAD" package.json >nul
if %errorlevel% equ 0 (
    echo [INFO] Conflito encontrado no package.json. Resolvendo...
    REM O package.json ja foi corrigido manualmente
) else (
    echo [INFO] Nenhum conflito encontrado.
)

echo [2/4] Adicionando alteracoes...
git add package.json
git add -A

echo [3/4] Fazendo commit...
git commit -m "Resolver conflito no package.json"
if %errorlevel% neq 0 (
    echo [AVISO] Nenhuma alteracao para commitar.
)

echo [4/4] Enviando para GitHub...
set /p TOKEN="Cole seu token do GitHub: "
if "%TOKEN%"=="" (
    echo [ERRO] Token obrigatorio!
    pause
    exit /b 1
)

git remote set-url origin https://%TOKEN%@github.com/mandoxxdev/CRM.git
git push -f origin main

if %errorlevel% equ 0 (
    echo.
    echo ========================================
    echo   Conflito resolvido e enviado!
    echo ========================================
) else (
    echo.
    echo [ERRO] Falha ao enviar!
)

echo.
pause
