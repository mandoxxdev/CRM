# Guia de Deploy na Hostinger

## 📋 Pré-requisitos

1. Conta na Hostinger com acesso SSH
2. Node.js instalado no servidor (versão 16 ou superior)
3. Acesso ao painel de controle da Hostinger

## ℹ️ Informação Importante

**A Hostinger oferece apenas hospedagem Linux** (não Windows). Isso é ideal para aplicações Node.js, pois:
- ✅ Linux é mais eficiente para Node.js
- ✅ Melhor suporte para PM2 e processos em background
- ✅ Comandos SSH padrão do Linux
- ✅ Melhor performance e estabilidade

Todas as instruções abaixo são para ambiente **Linux**.

## 🚀 Passo a Passo

### 1. Preparar o Projeto Localmente

#### 1.1. Build do Frontend
```bash
cd client
npm install
npm run build
```

Isso criará a pasta `client/build` com os arquivos otimizados.

#### 1.2. Instalar Dependências do Servidor
```bash
cd server
npm install --production
```

### 2. Configurar Variáveis de Ambiente

Crie um arquivo `.env` no diretório `server/` com as seguintes variáveis:

```env
# Porta do servidor (a Hostinger geralmente usa 3000 ou fornece uma porta específica)
PORT=3000

# Secret para JWT (GERE UMA CHAVE SEGURA - use um gerador online)
JWT_SECRET=sua-chave-secreta-super-segura-aqui-2024

# URL da API (substitua pelo seu domínio)
API_URL=https://seudominio.com

# Ambiente
NODE_ENV=production
```

### 3. Upload para Hostinger

#### Opção A: Via File Manager (Painel Hostinger)
1. Acesse o File Manager no painel da Hostinger
2. Navegue até `public_html` ou `domains/seudominio.com/public_html`
3. Faça upload de TODOS os arquivos do projeto:
   - `server/` (pasta completa)
   - `client/build/` (renomeie para `public/` ou mantenha como está)
   - `package.json` (raiz)
   - `.env` (no diretório `server/`)

#### Opção B: Via FTP/SFTP
Use um cliente FTP como FileZilla:
- Host: ftp.seudominio.com
- Usuário: seu-usuario-ftp
- Senha: sua-senha-ftp
- Porta: 21 (FTP) ou 22 (SFTP)

### 4. Estrutura de Pastas no Servidor

A estrutura deve ficar assim:
```
public_html/
├── server/
│   ├── index.js
│   ├── package.json
│   ├── .env
│   ├── node_modules/
│   ├── database.sqlite
│   └── uploads/
├── public/  (ou client/build/)
│   ├── index.html
│   └── static/
└── package.json
```

### 5. Configurar o Servidor Node.js

#### 5.1. Via SSH (Recomendado)

1. Acesse o SSH da Hostinger:
   ```bash
   ssh usuario@seudominio.com
   ```

2. Navegue até o diretório:
   ```bash
   cd public_html
   ```

3. Instale as dependências:
   ```bash
   cd server
   npm install --production
   ```

4. Teste o servidor:
   ```bash
   node index.js
   ```

#### 5.2. Configurar PM2 (Gerenciador de Processos)

Instale o PM2 globalmente:
```bash
npm install -g pm2
```

Inicie o servidor com PM2:
```bash
cd public_html/server
pm2 start index.js --name "crm-gmp"
pm2 save
pm2 startup
```

### 6. Configurar Proxy Reverso (Nginx/Apache)

A Hostinger geralmente usa Apache. Crie ou edite o arquivo `.htaccess` na raiz:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  
  # Redirecionar API para o servidor Node.js
  RewriteCond %{REQUEST_URI} ^/api/(.*)$
  RewriteRule ^api/(.*)$ http://localhost:3000/api/$1 [P,L]
  
  # Servir arquivos estáticos do React
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteCond %{REQUEST_URI} !^/api/
  RewriteRule ^(.*)$ /public/index.html [L]
</IfModule>
```

### 7. Configurar o Servidor para Servir Arquivos Estáticos

Edite o `server/index.js` para servir os arquivos do build do React:

```javascript
// Adicione após as configurações de middleware
const clientBuildPath = path.join(__dirname, '../public');

// Servir arquivos estáticos do React
app.use(express.static(clientBuildPath));

// Rota catch-all: serve o index.html para todas as rotas não-API
app.get('*', (req, res) => {
  if (!req.path.startsWith('/api')) {
    res.sendFile(path.join(clientBuildPath, 'index.html'));
  }
});
```

### 8. Configurar Banco de Dados

O SQLite já está configurado. Certifique-se de que:
- A pasta `server/` tem permissões de escrita
- O arquivo `database.sqlite` existe ou será criado automaticamente
- A pasta `uploads/` tem permissões de escrita (chmod 755)

### 9. Configurar SSL/HTTPS

Se você tem SSL na Hostinger:
1. Ative o SSL no painel
2. Configure redirecionamento HTTP → HTTPS
3. Atualize a variável `API_URL` no `.env` para usar `https://`

### 10. Testar o Deploy

1. Acesse: `https://seudominio.com`
2. Teste o login
3. Verifique se as APIs estão funcionando: `https://seudominio.com/api/health`

## 🔧 Troubleshooting

### Erro: "Cannot find module"
- Execute `npm install` no diretório `server/`
- Verifique se o `node_modules/` foi enviado ou instale no servidor

### Erro: "Port already in use"
- Verifique qual porta está configurada no `.env`
- Use `pm2 list` para ver processos rodando
- Use `pm2 stop all` para parar todos os processos

### Erro: "Permission denied"
- Configure permissões: `chmod 755 server/`
- Configure permissões para uploads: `chmod 777 server/uploads/`

### Arquivos estáticos não carregam
- Verifique se a pasta `public/` está no lugar correto
- Verifique o caminho no `server/index.js`
- Limpe o cache do navegador

## 📞 Suporte Hostinger

Se precisar de ajuda com configurações específicas da Hostinger:
- Suporte via chat: painel.hostinger.com
- Documentação: help.hostinger.com

## 🔒 Segurança

1. **NUNCA** commite o arquivo `.env` no Git
2. Use uma `JWT_SECRET` forte e única
3. Configure firewall se disponível
4. Mantenha as dependências atualizadas
5. Use HTTPS sempre

## 📝 Checklist Final

- [ ] Build do frontend executado
- [ ] Arquivo `.env` configurado
- [ ] Arquivos enviados para o servidor
- [ ] Dependências instaladas no servidor
- [ ] Servidor Node.js rodando (PM2)
- [ ] Proxy reverso configurado
- [ ] SSL/HTTPS ativado
- [ ] Testes realizados
- [ ] Permissões de arquivo configuradas
