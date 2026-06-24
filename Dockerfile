# Dockerfile customizado para Coolify
# Build do client em estagio separado (sem Chromium) para reduzir RAM no npm run build.

# --- Estagio 1: build do React (so client; menos memoria que build na imagem final) ---
FROM node:20-alpine AS client-builder

WORKDIR /app/client

COPY client/package*.json ./
RUN rm -f package-lock.json && npm install --legacy-peer-deps

COPY client/ ./

ENV CI=false
ENV GENERATE_SOURCEMAP=false
ENV DISABLE_ESLINT_PLUGIN=true
ENV NODE_OPTIONS="--max-old-space-size=2048"
ARG BUILD_ID
ENV REACT_APP_BUILD_ID=${BUILD_ID}
RUN npm run build

# --- Estagio 2: runtime ---
FROM node:20-alpine

WORKDIR /app

# Chromium para Puppeteer (PDF de propostas e OS) - Alpine usa apk, nao apt
RUN apk add --no-cache \
    chromium \
    nss \
    freetype \
    harfbuzz \
    ca-certificates \
    ttf-freefont

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

# Artefato do estagio de build (client/build esta no .dockerignore; nao vem do COPY acima)
COPY --from=client-builder /app/client/build ./client/build

EXPOSE 3000

ENV NODE_ENV=production
ENV PORT=3000

RUN mkdir -p /app/server && chmod -R 777 /app/server || true

WORKDIR /app/server
CMD ["node", "index.js"]