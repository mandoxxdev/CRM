# 🚀 Guia Rápido de Deploy na Hostinger

## ℹ️ Sistema Operacional

**A Hostinger oferece apenas hospedagem Linux** (não Windows). Todas as instruções abaixo são para ambiente Linux.

## 📦 Preparação Local

### 1. Build do Frontend
```bash
cd client
npm install
npm run build
```

### 2. Estrutura de Arquivos para Upload

Após o build, você terá:
- `client/build/` → Pasta com arquivos otimizados do React
- `server/` → Servidor Node.js completo
- `.htaccess` → Configuração do Apache

## 📤 Upload para Hostinger

### Opção 1: File Manager (Mais Fácil)

1. Acesse o **File Manager** no painel da Hostinger
2. Navegue até `public_html` (ou `domains/seudominio.com/public_html`)
3. Faça upload das seguintes pastas/arquivos:
   - `server/` (pasta completa)
   - `client/build/` → Renomeie para `public/`
   - `.htaccess` (na raiz de `public_html`)
   - `package.json` (opcional, na raiz)

### Opção 2: FTP/SFTP

Use FileZilla ou similar:
- **Host:** ftp.seudominio.com
- **Usuário:** (fornecido pela Hostinger)
- **Senha:** (fornecido pela Hostinger)
- **Porta:** 21 (FTP) ou 22 (SFTP)

## ⚙️ Configuração no Servidor

### 1. Acessar SSH

No painel Hostinger, encontre as credenciais SSH e acesse:
```bash
ssh usuario@seudominio.com
```

### 2. Navegar e Instalar Dependências

```bash
cd public_html/server
npm install --production
```

### 3. Criar Arquivo .env

```bash
nano .env
```

Cole o seguinte conteúdo (ajuste conforme necessário):
```env
PORT=3000
JWT_SECRET=sua-chave-secreta-super-segura-aqui-2024
API_URL=https://seudominio.com
NODE_ENV=production
```

**IMPORTANTE:** Gere uma `JWT_SECRET` segura! Use um gerador online ou:
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Salve com `Ctrl+X`, depois `Y`, depois `Enter`.

### 4. Configurar Permissões

```bash
chmod 755 ../public_html
chmod 755 uploads
chmod 644 database.sqlite
```

### 5. Iniciar o Servidor com PM2

```bash
# Instalar PM2 globalmente (se ainda não tiver)
npm install -g pm2

# Iniciar o servidor
pm2 start index.js --name crm-gmp

# Salvar configuração para reiniciar automaticamente
pm2 save
pm2 startup
```

### 6. Verificar Status

```bash
pm2 status
pm2 logs crm-gmp
```

## 🔧 Configuração do Apache (.htaccess)

O arquivo `.htaccess` já está configurado, mas verifique se está na raiz de `public_html`:

```apache
# Redirecionar API para Node.js na porta 3000
RewriteCond %{REQUEST_URI} ^/api/(.*)$
RewriteRule ^api/(.*)$ http://localhost:3000/api/$1 [P,L]
```

## ✅ Testar

1. Acesse: `https://seudominio.com`
2. Teste o login
3. Verifique a API: `https://seudominio.com/api/health`

## 🔄 Comandos Úteis PM2

```bash
# Ver status
pm2 status

# Ver logs
pm2 logs crm-gmp

# Reiniciar
pm2 restart crm-gmp

# Parar
pm2 stop crm-gmp

# Remover
pm2 delete crm-gmp
```

## 🐛 Troubleshooting

### Erro: "Cannot find module"
```bash
cd public_html/server
npm install --production
```

### Erro: "Port already in use"
Verifique qual porta está configurada no `.env` e ajuste o `.htaccess` se necessário.

### Arquivos estáticos não carregam
- Verifique se `client/build` foi renomeado para `public/`
- Verifique se o `.htaccess` está na raiz de `public_html`
- Limpe o cache do navegador

### API não funciona
- Verifique se o PM2 está rodando: `pm2 status`
- Verifique os logs: `pm2 logs crm-gmp`
- Teste diretamente: `curl http://localhost:3000/api/health`

## 📞 Suporte

- **Hostinger:** painel.hostinger.com → Suporte
- **Documentação:** help.hostinger.com

## 🔒 Segurança

1. ✅ Use HTTPS (SSL gratuito na Hostinger)
2. ✅ Gere uma `JWT_SECRET` forte
3. ✅ Não commite o `.env` no Git
4. ✅ Mantenha dependências atualizadas
5. ✅ Configure firewall se disponível
