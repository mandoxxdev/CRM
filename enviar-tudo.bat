@echo off
echo ========================================
echo   Enviando Tudo para o GitHub
echo ========================================
echo.

REM Verificar se é repositório Git
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Nao e um repositorio Git!
    pause
    exit /b 1
)

echo [1/4] Configurando remote do GitHub...
git remote show origin >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Adicionando remote...
    git remote add origin https://github.com/mandoxxdev/CRM.git
) else (
    echo [INFO] Atualizando remote...
    git remote set-url origin https://github.com/mandoxxdev/CRM.git
)
git remote -v

echo [2/4] Adicionando todos os arquivos...
git add .
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao adicionar arquivos!
    pause
    exit /b 1
)

echo [3/4] Criando commit...
git status --short
set /p MENSAGEM="Digite a mensagem do commit (ou Enter para usar padrao): "
if "%MENSAGEM%"=="" (
    set MENSAGEM=Atualizacao: %date% %time%
)
git commit -m "%MENSAGEM%"
if %errorlevel% neq 0 (
    echo [AVISO] Nenhuma alteracao para commitar ou commit ja existe.
)

echo [4/4] Enviando para o GitHub...
echo.
echo [AVISO] Se pedir autenticacao:
echo Username: mandoxxdev
echo Password: Use um Personal Access Token (nao sua senha!)
echo.
pause

git push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Tentando com branch master...
    git checkout -b main >nul 2>&1
    git push -u origin main
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha ao enviar para o GitHub!
        echo.
        echo Possiveis causas:
        echo 1. Nao configurou autenticacao (token ou SSH)
        echo 2. Repositorio nao existe no GitHub
        echo 3. Problema de conexao
        echo.
        echo Para criar token: https://github.com/settings/tokens
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   Enviado com sucesso!
echo ========================================
echo.
pause
