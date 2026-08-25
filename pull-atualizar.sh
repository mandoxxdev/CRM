#!/bin/bash

# Orion CRM - Atualizar do GitHub
# Execute: bash pull-atualizar.sh (ou ./pull-atualizar.sh)

cd "$(dirname "$0")" || exit 1

echo ""
echo "========================================"
echo "  Orion CRM - Atualizar do GitHub"
echo "========================================"
echo ""
echo "Pasta: $(pwd)"
echo ""

if ! command -v git >/dev/null 2>&1; then
    echo "[ERRO] Git nao encontrado. Instale com: sudo apt install git"
    exit 1
fi

if [ ! -d ".git" ]; then
    echo "[ERRO] Esta pasta nao e um repositorio Git."
    exit 1
fi

BRANCH=$(git rev-parse --abbrev-ref HEAD 2>/dev/null)
if [ -z "$BRANCH" ]; then
    BRANCH="main"
fi

echo "Branch atual: $BRANCH"
echo ""

git status --short

echo ""
if [ -n "$(git status --porcelain 2>/dev/null)" ]; then
    echo "[AVISO] Voce tem alteracoes locais. O pull pode falhar ou gerar conflito."
fi

echo ""
echo "Buscando atualizacoes no GitHub..."
echo ""

if ! git fetch origin; then
    echo "[ERRO] Falha no git fetch. Verifique internet e credenciais do GitHub."
    exit 1
fi

if ! git pull origin "$BRANCH"; then
    echo ""
    echo "[ERRO] Falha no git pull."
    echo "Dicas: resolva conflitos, commite ou descarte alteracoes locais, depois tente de novo."
    exit 1
fi

echo ""
echo "========================================"
echo "  Atualizado com sucesso!"
echo "========================================"
echo ""
