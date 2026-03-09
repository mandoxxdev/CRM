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

# Build do client: sem ESLint no build para saída limpa (evita "Compiled with warnings" e falha no deploy)
ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV NODE_OPTIONS="--max-old-space-size=1536"
RUN cd client && npm run build && cd ..

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
