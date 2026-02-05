@echo off
echo ========================================
echo   Enviar para GitHub
echo ========================================
echo.

REM Verificar se é repositório Git
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Nao e um repositorio Git!
    echo.
    echo Inicializando repositorio...
    git init
    git checkout -b main
)

REM Solicitar token
echo [1/5] Configurando token do GitHub...
set /p TOKEN="Cole seu token do GitHub: "
if "%TOKEN%"=="" (
    echo [ERRO] Token nao pode estar vazio!
    pause
    exit /b 1
)

REM Configurar remote (sem token na URL - mais seguro)
echo [2/5] Configurando remote do GitHub...
git remote remove origin >nul 2>&1
git remote add origin https://github.com/mandoxxdev/CRM.git
git config --global credential.helper wincred

REM Baixar alterações do GitHub se existirem
echo [3/5] Sincronizando com GitHub...
git fetch origin >nul 2>&1
if %errorlevel% equ 0 (
    echo [INFO] Baixando alteracoes do GitHub...
    git pull origin main --allow-unrelated-histories --no-rebase >nul 2>&1
    if %errorlevel% neq 0 (
        git merge origin/main --allow-unrelated-histories --no-edit >nul 2>&1
    )
)

REM Adicionar tudo (exceto lock files)
echo [4/5] Adicionando alteracoes...
git add .
REM Garantir que lock files não sejam adicionados
git rm --cached package-lock.json 2>nul
git rm --cached server/package-lock.json 2>nul
git rm --cached client/package-lock.json 2>nul
if %errorlevel% neq 0 (
    echo [AVISO] Alguns arquivos podem nao ter sido adicionados.
)

REM Verificar se há algo para commitar
git diff --cached --quiet
if %errorlevel% neq 0 (
    set MENSAGEM=Atualizacao: %date% %time%
    set /p MENSAGEM_INPUT="Digite a mensagem do commit (ou Enter para '%MENSAGEM%'): "
    if not "%MENSAGEM_INPUT%"=="" (
        set MENSAGEM=%MENSAGEM_INPUT%
    )
    git commit -m "%MENSAGEM%"
) else (
    git diff --quiet
    if %errorlevel% neq 0 (
        set MENSAGEM=Atualizacao: %date% %time%
        set /p MENSAGEM_INPUT="Digite a mensagem do commit (ou Enter para '%MENSAGEM%'): "
        if not "%MENSAGEM_INPUT%"=="" (
            set MENSAGEM=%MENSAGEM_INPUT%
        )
        git commit -am "%MENSAGEM%"
    ) else (
        echo [INFO] Nenhuma alteracao para commitar.
    )
)

REM Enviar para GitHub usando token
echo [5/5] Enviando para o GitHub...
echo.
echo [INFO] Usando token para autenticacao...
echo.

REM Configurar GIT_ASKPASS para usar o token automaticamente
set GIT_ASKPASS=echo
set GIT_TERMINAL_PROMPT=0

REM Criar script temporário para fornecer credenciais
echo @echo off > "%TEMP%\git_pass.bat"
echo if "%%1"=="Username for 'https://github.com':" echo mandoxxdev >> "%TEMP%\git_pass.bat"
echo if "%%1"=="Password for 'https://mandoxxdev@github.com':" echo %TOKEN% >> "%TEMP%\git_pass.bat"

set GIT_ASKPASS=%TEMP%\git_pass.bat

REM Tentar push
git push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Tentando metodo alternativo...
    REM Tentar com token na URL diretamente
    git remote set-url origin https://%TOKEN%@github.com/mandoxxdev/CRM.git
    git push -u origin main
    if %errorlevel% neq 0 (
        echo.
        echo [AVISO] Tentando criar branch main...
        git checkout -b main >nul 2>&1
        git push -u origin main
        if %errorlevel% neq 0 (
            echo.
            echo [ERRO] Falha ao enviar para o GitHub!
            echo.
            echo Possiveis solucoes:
            echo 1. Verifique se o token tem permissao 'repo' (acesso completo)
            echo 2. Para fine-grained token, verifique permissoes em:
            echo    https://github.com/settings/tokens
            echo 3. Tente criar um token CLASSICO (ghp_...) em vez de fine-grained
            echo 4. Verifique se o repositorio existe: https://github.com/mandoxxdev/CRM
            echo.
            echo Para criar token classico:
            echo https://github.com/settings/tokens
            echo - Clique em "Generate new token (classic)"
            echo - Marque permissao: repo
            echo.
            pause
            exit /b 1
        )
    )
)

REM Limpar arquivo temporário
del "%TEMP%\git_pass.bat" >nul 2>&1

echo.
echo ========================================
echo   Enviado com sucesso para o GitHub!
echo ========================================
echo.
pause
