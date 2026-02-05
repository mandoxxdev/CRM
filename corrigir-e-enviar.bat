@echo off
echo ========================================
echo   Corrigindo e Enviando para GitHub
echo ========================================
echo.

echo [1/6] Atualizando package-lock.json da raiz...
call npm install --package-lock-only
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao atualizar package-lock.json da raiz!
    pause
    exit /b 1
)

echo [2/6] Atualizando package-lock.json do servidor...
cd server
call npm install --package-lock-only
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao atualizar package-lock.json do servidor!
    cd ..
    pause
    exit /b 1
)
cd ..

echo [3/6] Atualizando package-lock.json do cliente...
cd client
call npm install --package-lock-only
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao atualizar package-lock.json do cliente!
    cd ..
    pause
    exit /b 1
)
cd ..

echo [4/6] Verificando remote do GitHub...
git remote show origin >nul 2>&1
if %errorlevel% neq 0 (
    echo [AVISO] Remote nao configurado. Configurando...
    git remote remove origin >nul 2>&1
    git remote add origin https://github.com/mandoxxdev/CRM.git
    echo [INFO] Remote configurado: https://github.com/mandoxxdev/CRM.git
) else (
    echo [INFO] Remote ja configurado.
    git remote set-url origin https://github.com/mandoxxdev/CRM.git
)

echo [5/6] Adicionando todos os arquivos...
git add .
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao adicionar arquivos!
    pause
    exit /b 1
)

REM Verificar se há algo para commitar
git diff --cached --quiet
if %errorlevel% neq 0 (
    echo [INFO] Criando commit...
    git commit -m "Corrigir: Atualizar package-lock.json e adicionar arquivos de configuracao"
) else (
    echo [INFO] Nenhuma alteracao para commitar.
)

echo [6/6] Enviando para o GitHub...
git push -u origin main
if %errorlevel% neq 0 (
    echo [AVISO] Tentando com branch master...
    git push origin master
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao enviar para o GitHub!
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   Correcao concluida e enviada!
echo ========================================
echo.
echo Agora tente fazer deploy novamente no Coolify.
echo.
pause
