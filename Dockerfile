# Dockerfile customizado para Coolify
# Build do client em estagio separado (sem Chromium) para reduzir RAM no npm run build.
# Runtime sem client/node_modules — so serve client/build estatico.

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
ENV NODE_ENV=production
ENV PORT=3000

COPY package*.json ./
COPY server/package*.json ./server/

# So runtime: root + server. Client build vem do stage 1 (sem node_modules do React).
RUN rm -f package-lock.json server/package-lock.json && \
    npm install --omit=dev --legacy-peer-deps && \
    cd server && npm install --omit=dev --legacy-peer-deps && cd ..

COPY server/ ./server/
COPY --from=client-builder /app/client/build ./client/build

EXPOSE 3000

RUN mkdir -p /app/server/data /app/server/data/uploads /app/server/uploads && chmod -R 777 /app/server/data /app/server/uploads || true

VOLUME ["/app/server/data", "/app/server/uploads"]

WORKDIR /app/server
CMD ["node", "index.js"]
