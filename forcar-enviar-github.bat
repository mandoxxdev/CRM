@echo off
echo ========================================
echo   FORCAR Envio para GitHub
echo ========================================
echo.

REM Verificar se é repositório Git
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Nao e um repositorio Git!
    git init
    git checkout -b main
)

REM Solicitar token
echo [1/6] Configurando token do GitHub...
set /p TOKEN="Cole seu token do GitHub: "
if "%TOKEN%"=="" (
    echo [ERRO] Token nao pode estar vazio!
    pause
    exit /b 1
)

REM Configurar remote com token na URL
echo [2/6] Configurando remote com token...
git remote remove origin >nul 2>&1
git remote add origin https://%TOKEN%@github.com/mandoxxdev/CRM.git
git remote set-url origin https://%TOKEN%@github.com/mandoxxdev/CRM.git
echo [INFO] Remote configurado.

REM Mostrar status
echo [3/6] Verificando status do Git...
git status
echo.

REM Remover lock files do Git se existirem
echo [4/6] Removendo lock files do Git...
git rm --cached package-lock.json 2>nul
git rm --cached server/package-lock.json 2>nul
git rm --cached client/package-lock.json 2>nul
echo [INFO] Lock files removidos do Git.

REM Adicionar tudo
echo [5/6] Adicionando TODAS as alteracoes...
git add -A
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao adicionar arquivos!
    pause
    exit /b 1
)

REM Verificar o que será commitado
echo.
echo [INFO] Arquivos que serao commitados:
git status --short
echo.
pause

REM Fazer commit
set /p MENSAGEM="Digite a mensagem do commit (ou Enter para padrao): "
if "%MENSAGEM%"=="" (
    set MENSAGEM=Atualizacao: %date% %time%
)

git commit -m "%MENSAGEM%"
if %errorlevel% neq 0 (
    echo [AVISO] Nenhuma alteracao para commitar ou commit ja existe.
    git status
    echo.
    set /p CONTINUAR="Deseja continuar mesmo assim? (S/N): "
    if /i not "%CONTINUAR%"=="S" (
        exit /b 0
    )
)

REM Forçar push
echo [6/6] FORCANDO envio para o GitHub...
echo.
echo [INFO] Usando: git push -f origin main
echo [AVISO] Isso vai sobrescrever o repositorio remoto!
echo.
echo [DEBUG] Verificando branch atual...
git branch --show-current
echo [DEBUG] Verificando remote...
git remote -v
echo.
pause

echo [INFO] Executando push...
git push -f origin main
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Tentando criar branch main...
    git checkout -b main >nul 2>&1
    git push -f -u origin main
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha ao enviar para o GitHub!
        echo.
        echo [DEBUG] Verificando conexao com GitHub...
        git ls-remote origin
        echo.
        echo [DEBUG] Ultimos commits locais:
        git log --oneline -3
        echo.
        echo [DEBUG] Status do Git:
        git status
        echo.
        echo Possiveis causas:
        echo 1. Token invalido ou expirado
        echo 2. Token nao tem permissao 'repo'
        echo 3. Repositorio nao existe: https://github.com/mandoxxdev/CRM
        echo 4. Problema de conexao
        echo.
        echo Teste manualmente:
        echo git push -v origin main
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   ENVIADO COM SUCESSO!
echo ========================================
echo.
echo Verifique em: https://github.com/mandoxxdev/CRM
echo.
pause
