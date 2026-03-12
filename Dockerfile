# Dockerfile customizado para Coolify
# Build do client DENTRO do Docker com pouca memória (1.5GB) para não estourar no Coolify.

FROM node:20-alpine

WORKDIR /app

# Chromium para Puppeteer (PDF de propostas e OS) — Alpine usa apk, não apt
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

# Usar Chromium do sistema; evita download do Puppeteer e erro ENOENT no container
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

COPY package*.json ./
COPY server/package*.json ./server/
COPY client/package*.json ./client/

RUN rm -f package-lock.json server/package-lock.json client/package-lock.json && \
    npm install --legacy-peer-deps && \
    cd server && npm install --legacy-peer-deps && cd .. && \
    cd client && npm install --legacy-peer-deps && cd ..

COPY . .

# Build do client: agora é feito LOCALMENTE antes do deploy
# para deixar o build do Docker mais leve e evitar timeout no Coolify.
# No pipeline atual, o diretório client/build já chega pronto no repositório.
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV NODE_OPTIONS="--max-old-space-size=1536"

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
