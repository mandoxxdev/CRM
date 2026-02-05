#!/bin/bash

# Script de Deploy para Hostinger
# Execute: bash deploy.sh

echo "🚀 Iniciando deploy do CRM GMP para Hostinger..."

# 1. Build do Frontend
echo "📦 Construindo frontend..."
cd client
npm install
npm run build
cd ..

# 2. Preparar estrutura
echo "📁 Preparando estrutura de arquivos..."
mkdir -p deploy
cp -r server deploy/
cp -r client/build deploy/public
cp package.json deploy/
cp .htaccess deploy/

# 3. Criar arquivo .env de exemplo
echo "⚙️  Criando arquivo .env de exemplo..."
cat > deploy/server/.env.example << EOF
PORT=3000
JWT_SECRET=altere-esta-chave-por-uma-chave-segura-aleatoria
API_URL=https://seudominio.com
NODE_ENV=production
EOF

# 4. Instruções
echo ""
echo "✅ Deploy preparado!"
echo ""
echo "📋 Próximos passos:"
echo "1. Acesse o File Manager da Hostinger"
echo "2. Faça upload da pasta 'deploy' para public_html"
echo "3. Renomeie 'deploy' para o nome desejado (ou mova o conteúdo)"
echo "4. Crie o arquivo .env em server/ com suas configurações"
echo "5. Acesse via SSH e execute:"
echo "   cd public_html/server"
echo "   npm install --production"
echo "   pm2 start index.js --name crm-gmp"
echo ""
echo "📖 Consulte DEPLOY_HOSTINGER.md para mais detalhes"
