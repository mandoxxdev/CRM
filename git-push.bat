@echo off
echo ========================================
echo   Enviando alteracoes para o GitHub
echo ========================================
echo.

REM Verificar se estamos em um repositório Git
git rev-parse --git-dir >nul 2>&1
if %errorlevel% neq 0 (
    echo [ERRO] Nao e um repositorio Git!
    echo Execute: git init
    pause
    exit /b 1
)

REM Verificar se há alterações
git diff --quiet
if %errorlevel% equ 0 (
    git diff --cached --quiet
    if %errorlevel% equ 0 (
        echo [INFO] Nenhuma alteracao para enviar.
        pause
        exit /b 0
    )
)

echo [1/3] Adicionando alteracoes...
git add .
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao adicionar arquivos!
    pause
    exit /b 1
)

echo [2/3] Criando commit...
set /p MENSAGEM="Digite a mensagem do commit (ou Enter para usar data/hora): "
if "%MENSAGEM%"=="" (
    for /f "tokens=2 delims==" %%I in ('wmic os get localdatetime /value') do set datetime=%%I
    set MENSAGEM=Atualizacao: %date% %time%
)
git commit -m "%MENSAGEM%"
if %errorlevel% neq 0 (
    echo [ERRO] Falha ao criar commit!
    pause
    exit /b 1
)

echo [3/3] Enviando para o GitHub...
git push origin main
if %errorlevel% neq 0 (
    echo.
    echo [AVISO] Tentando com branch 'master'...
    git push origin master
    if %errorlevel% neq 0 (
        echo [ERRO] Falha ao enviar para o GitHub!
        echo.
        echo Possiveis solucoes:
        echo 1. Verifique sua conexao com a internet
        echo 2. Configure autenticacao (veja CONFIGURAR_GIT.md)
        echo 3. Execute: git pull origin main (para sincronizar)
        pause
        exit /b 1
    )
)

echo.
echo ========================================
echo   Alteracoes enviadas com sucesso!
echo ========================================
echo.
pause
