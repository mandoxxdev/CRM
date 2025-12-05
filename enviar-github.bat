@echo off
echo ========================================
echo   Enviar CRM para GitHub
echo ========================================
echo.

echo [1/6] Configurando Git...
git config --global user.name "Matheus Honrado"
git config --global user.email "mandoxxdev@gmail.com"
echo Git configurado!
echo.

echo [2/6] Verificando se Git esta instalado...
git --version
if errorlevel 1 (
    echo ERRO: Git nao esta instalado!
    echo Instale em: https://git-scm.com/download/win
    pause
    exit /b 1
)
echo.

echo [3/6] Inicializando repositorio Git...
if not exist .git (
    git init
    echo Repositorio inicializado.
) else (
    echo Repositorio Git ja existe.
)
echo.

echo [4/6] Adicionando arquivos ao Git...
git add .
echo Arquivos adicionados.
echo.

echo [5/6] Fazendo commit...
git commit -m "Initial commit: CRM GMP - Sistema completo de gestao"
if errorlevel 1 (
    echo AVISO: Verificando se ja existe commit...
    git log --oneline -1
)
echo.

echo [6/6] Configurando remote e enviando para GitHub...
git branch -M main
git remote remove origin 2>nul
git remote add origin https://github.com/mandoxxdev/CRM.git
echo Remote configurado: https://github.com/mandoxxdev/CRM.git
echo.

echo Enviando para GitHub...
git push -u origin main
if errorlevel 1 (
    echo.
    echo ========================================
    echo   ATENCAO: Push falhou!
    echo ========================================
    echo.
    echo Possiveis causas:
    echo 1. Repositorio nao existe no GitHub
    echo    Solucao: Crie em https://github.com/mandoxxdev/CRM
    echo.
    echo 2. Problema de autenticacao
    echo    Solucao: Use Personal Access Token quando pedir senha
    echo.
    pause
    exit /b 1
)

echo.
echo ========================================
echo   SUCESSO! Codigo enviado para GitHub!
echo ========================================
echo.
echo Repositorio: https://github.com/mandoxxdev/CRM
echo.
echo IMPORTANTE: Revogue o token usado e crie um novo
echo para manter a seguranca!
echo.
pause
