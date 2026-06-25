@echo off
chcp 65001 >nul
title Orion CRM - Atualizar do GitHub
color 0A

cd /d "%~dp0"

echo.
echo ========================================
echo   Orion CRM - Atualizar do GitHub
echo ========================================
echo.
echo Pasta: %CD%
echo.

where git >nul 2>&1
if errorlevel 1 (
    echo [ERRO] Git nao encontrado. Instale em https://git-scm.com/
    goto fim
)

if not exist ".git" (
    echo [ERRO] Esta pasta nao e um repositorio Git.
    goto fim
)

for /f "delims=" %%b in ('git rev-parse --abbrev-ref HEAD 2^>nul') do set BRANCH=%%b
if "%BRANCH%"=="" set BRANCH=main

echo Branch atual: %BRANCH%
echo.

git status --short
if errorlevel 1 goto fim

echo.
for /f "delims=" %%i in ('git status --porcelain 2^>nul') do (
    echo [AVISO] Voce tem alteracoes locais. O pull pode falhar ou gerar conflito.
    goto tem_alteracoes
)
:tem_alteracoes

echo.
echo Buscando atualizacoes no GitHub...
echo.

git fetch origin
if errorlevel 1 (
    echo [ERRO] Falha no git fetch. Verifique internet e credenciais do GitHub.
    goto fim
)

git pull origin %BRANCH%
if errorlevel 1 (
    echo.
    echo [ERRO] Falha no git pull.
    echo Dicas: resolva conflitos, commite ou descarte alteracoes locais, depois tente de novo.
    goto fim
)

echo.
echo ========================================
echo   Atualizado com sucesso!
echo ========================================

:fim
echo.
pause
