#!/bin/bash

echo "========================================"
echo "  BUILD PARA PRODUÇÃO - CRM GMP"
echo "========================================"
echo ""

echo "[1/3] Instalando dependências do cliente..."
cd client
npm install
if [ $? -ne 0 ]; then
    echo "ERRO ao instalar dependências do cliente!"
    exit 1
fi

echo ""
echo "[2/3] Fazendo build do frontend..."
npm run build
if [ $? -ne 0 ]; then
    echo "ERRO ao fazer build do frontend!"
    exit 1
fi
cd ..

echo ""
echo "[3/3] Instalando dependências do servidor..."
cd server
npm install --production
if [ $? -ne 0 ]; then
    echo "ERRO ao instalar dependências do servidor!"
    exit 1
fi
cd ..

echo ""
echo "========================================"
echo "  BUILD CONCLUÍDO COM SUCESSO!"
echo "========================================"
echo ""
echo "Próximos passos:"
echo "1. Renomeie client/build para public"
echo "2. Faça upload das pastas para Hostinger:"
echo "   - server/"
echo "   - public/ (renomeado de client/build)"
echo "   - .htaccess"
echo "3. Acesse via SSH e configure o .env"
echo "4. Inicie com PM2: pm2 start server/index.js"
echo ""
echo "Consulte DEPLOY_HOSTINGER.md para mais detalhes."
echo ""
