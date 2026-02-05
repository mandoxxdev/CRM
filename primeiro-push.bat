@echo off
echo ========================================
echo   Primeiro Push para o GitHub
echo ========================================
echo.

REM Verificar se Git está instalado
git --version >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Git nao esta instalado!
    pause
    exit /b 1
)

REM Verificar se é repositório Git
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Nao e um repositorio Git!
    echo Execute: git init
    pause
    exit /b 1
)

echo [1/5] Configurando remote do GitHub...
git remote -v >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Adicionando remote...
    git remote add origin https://github.com/mandoxxdev/CRM.git
) else (
    echo [INFO] Remote ja existe. Atualizando...
    git remote set-url origin https://github.com/mandoxxdev/CRM.git
)

echo [2/5] Verificando branch...
git branch --show-current >nul 2>&1
if %errorlevel% neq 0 (
    echo [INFO] Criando branch main...
    git checkout -b main
)

REM Verificar se está na branch master ou main
git branch --show-current | findstr /C:"master" >nul
if %errorlevel% equ 0 (
    echo [INFO] Renomeando branch master para main...
    git branch -M main
)

echo [3/5] Adicionando todos os arquivos...
git add .
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao adicionar arquivos!
    pause
    exit /b 1
)

echo [4/5] Criando primeiro commit...
git commit -m "Initial commit: CRM GMP Industriais"
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao criar commit!
    pause
    exit /b 1
)

echo [5/5] Enviando para o GitHub...
echo.
echo [AVISO] Na primeira vez, voce precisara autenticar!
echo Se pedir usuario: mandoxxdev
echo Se pedir senha: use um Personal Access Token (nao sua senha!)
echo.
echo Para criar token: https://github.com/settings/tokens
echo.
pause

git push -u origin main
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Tentando com branch master...
    git push -u origin master
    if %errorlevel% neq 0 (
        echo.
        echo [ERRO] Falha ao enviar para o GitHub!
        echo.
        echo Possiveis causas:
        echo 1. Nao configurou autenticacao (token ou SSH)
        echo 2. Repositorio nao existe no GitHub
        echo 3. Problema de conexao
        echo.
        echo Veja CONFIGURAR_GIT.md para mais detalhes
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   Primeiro push realizado com sucesso!
echo ========================================
echo.
echo Agora voce pode usar git-push.bat para
echo enviar futuras alteracoes!
echo.
pause
