# Dockerfile customizado para Coolify
# O build do client é feito no SEU PC; o Docker só copia a pasta client/build (evita OOM no Coolify).

FROM node:20-alpine

WORKDIR /app

# Copiar arquivos de dependências (só raiz e server; client não precisa de npm install)
COPY package*.json ./
COPY server/package*.json ./server/

RUN rm -f package-lock.json server/package-lock.json && \
    npm install --legacy-peer-deps && \
    cd server && npm install --legacy-peer-deps && cd ..

# Copiar todo o código (incluindo client/build)
COPY . .

# Exigir que client/build exista (você deve rodar "cd client && npm run build" e "git add -f client/build" antes do push)
RUN test -d client/build && test -f client/build/index.html || (echo "ERRO: Falta a pasta client/build. No seu PC rode: cd client && npm run build && git add -f client/build && git commit -m 'build' && git push" && exit 1)

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
