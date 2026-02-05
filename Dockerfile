# Dockerfile customizado para Coolify
# Força uso de npm install em vez de npm ci

FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências
COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

# Remover lock files antigos e instalar dependências
RUN rm -f package-lock.json server/package-lock.json client/package-lock.json && \
    npm install --legacy-peer-deps && \
    cd server && npm install --legacy-peer-deps && cd .. && \
    cd client && npm install --legacy-peer-deps && cd ..

# Copiar resto do código
COPY . .

# Build do cliente (desabilitar CI para não tratar warnings como erros)
RUN cd client && CI=false npm run build && cd ..

# Expor porta
EXPOSE 3000

# Variáveis de ambiente
ENV NODE_ENV=production
ENV PORT=3000

# Garantir permissões para criar banco de dados
RUN mkdir -p /app/server && chmod -R 777 /app/server || true

# Comando para iniciar
WORKDIR /app/server
CMD ["node", "index.js"]
