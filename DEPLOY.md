# 🚀 Guia de Deploy do CRM GMP

Este guia explica como fazer o deploy do CRM em um domínio público para que todos possam acessar.

## ⚠️ IMPORTANTE - Sobre o Banco de Dados

**O CRM atual usa IndexedDB (banco local no navegador).** Isso significa que:
- Cada usuário terá seu próprio banco de dados local
- Os dados não são compartilhados entre usuários
- Se o usuário limpar o cache do navegador, os dados serão perdidos

**Para um CRM compartilhado, você precisará:**
- Migrar para um banco de dados no servidor (PostgreSQL, MySQL, MongoDB, etc.)
- Criar uma API backend (Node.js, Python, etc.)
- Conectar o frontend à API

Por enquanto, este guia mostra como fazer o deploy do frontend.

---

## 📦 Passo 1: Build de Produção

### 1.1. Gerar os arquivos de produção

Execute no terminal:

```bash
npm run build
```

Isso criará uma pasta `dist/` com todos os arquivos otimizados para produção.

### 1.2. Testar localmente antes de fazer deploy

```bash
npm run preview
```

Acesse `http://localhost:4173` para verificar se está tudo funcionando.

---

## 🌐 Opções de Hospedagem

### Opção 1: Vercel (Recomendado - Gratuito e Fácil) ⭐

**Vantagens:**
- ✅ Gratuito
- ✅ Deploy automático via GitHub
- ✅ HTTPS automático
- ✅ Domínio personalizado
- ✅ Muito rápido

**Passos:**

1. **Instalar Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Fazer login:**
   ```bash
   vercel login
   ```

3. **Fazer deploy:**
   ```bash
   vercel --prod
   ```

4. **Ou conectar ao GitHub:**
   - Acesse [vercel.com](https://vercel.com)
   - Conecte seu repositório GitHub
   - Vercel detecta automaticamente e faz deploy

**Configuração do projeto:**
- Build Command: `npm run build`
- Output Directory: `dist`
- Install Command: `npm install`

---

### Opção 2: Netlify (Gratuito e Fácil)

**Vantagens:**
- ✅ Gratuito
- ✅ Deploy via drag-and-drop
- ✅ HTTPS automático
- ✅ Domínio personalizado

**Passos:**

1. **Via Netlify CLI:**
   ```bash
   npm install -g netlify-cli
   netlify login
   netlify deploy --prod --dir=dist
   ```

2. **Via Interface Web:**
   - Acesse [netlify.com](https://netlify.com)
   - Arraste a pasta `dist/` para a área de deploy
   - Pronto!

3. **Via GitHub:**
   - Conecte seu repositório
   - Build command: `npm run build`
   - Publish directory: `dist`

---

### Opção 3: GitHub Pages (Gratuito)

**Vantagens:**
- ✅ Gratuito
- ✅ Integrado ao GitHub
- ⚠️ HTTPS, mas domínio personalizado requer configuração

**Passos:**

1. **Instalar gh-pages:**
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Adicionar script no package.json:**
   ```json
   "scripts": {
     "deploy": "npm run build && gh-pages -d dist"
   }
   ```

3. **Fazer deploy:**
   ```bash
   npm run deploy
   ```

4. **Configurar no GitHub:**
   - Settings > Pages
   - Source: `gh-pages branch`
   - URL: `https://seu-usuario.github.io/crm-gmp`

---

### Opção 4: Firebase Hosting (Google - Gratuito)

**Vantagens:**
- ✅ Gratuito
- ✅ Muito rápido (CDN global)
- ✅ HTTPS automático
- ✅ Domínio personalizado

**Passos:**

1. **Instalar Firebase CLI:**
   ```bash
   npm install -g firebase-tools
   ```

2. **Login:**
   ```bash
   firebase login
   ```

3. **Inicializar:**
   ```bash
   firebase init hosting
   ```
   - Public directory: `dist`
   - Single-page app: `Yes`
   - Overwrite index.html: `No`

4. **Deploy:**
   ```bash
   npm run build
   firebase deploy
   ```

---

### Opção 5: Servidor Próprio (VPS/Shared Hosting)

**Para Apache (.htaccess):**

Crie um arquivo `.htaccess` na pasta `dist/`:

```apache
<IfModule mod_rewrite.c>
  RewriteEngine On
  RewriteBase /
  RewriteRule ^index\.html$ - [L]
  RewriteCond %{REQUEST_FILENAME} !-f
  RewriteCond %{REQUEST_FILENAME} !-d
  RewriteRule . /index.html [L]
</IfModule>
```

**Para Nginx:**

```nginx
server {
    listen 80;
    server_name seu-dominio.com;
    root /var/www/crm-gmp/dist;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }
}
```

**Passos:**

1. Fazer build: `npm run build`
2. Fazer upload da pasta `dist/` para o servidor
3. Configurar servidor web (Apache/Nginx)
4. Configurar domínio e DNS

---

## 🔧 Configurações Adicionais

### Configurar Base URL (se necessário)

Se o app não estiver na raiz do domínio, edite `vite.config.ts`:

```typescript
export default defineConfig({
  base: '/crm-gmp/', // Se estiver em subpasta
  // ... resto da config
})
```

### Variáveis de Ambiente

Crie `.env.production`:

```env
VITE_API_URL=https://api.seudominio.com
VITE_APP_NAME=CRM GMP
```

---

## 📝 Checklist de Deploy

- [ ] Executar `npm run build` sem erros
- [ ] Testar com `npm run preview`
- [ ] Verificar se todas as rotas funcionam
- [ ] Testar login e autenticação
- [ ] Verificar responsividade (mobile/desktop)
- [ ] Configurar domínio personalizado
- [ ] Configurar HTTPS
- [ ] Testar em diferentes navegadores
- [ ] Verificar performance

---

## 🆘 Problemas Comuns

### Erro 404 em rotas

**Solução:** Configure o servidor para redirecionar todas as rotas para `index.html` (SPA).

### Assets não carregam

**Solução:** Verifique se o `base` no `vite.config.ts` está correto.

### CORS errors

**Solução:** Configure CORS no servidor ou use um proxy.

---

## 🔄 Deploy Contínuo

### GitHub Actions (Automático)

Crie `.github/workflows/deploy.yml`:

```yaml
name: Deploy
on:
  push:
    branches: [ main ]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm install
      - run: npm run build
      - name: Deploy to Vercel
        uses: amondnet/vercel-action@v20
        with:
          vercel-token: ${{ secrets.VERCEL_TOKEN }}
          vercel-org-id: ${{ secrets.ORG_ID }}
          vercel-project-id: ${{ secrets.PROJECT_ID }}
```

---

## 📞 Suporte

Se tiver problemas, verifique:
1. Console do navegador (F12)
2. Logs do servidor
3. Documentação da plataforma escolhida

---

**Boa sorte com o deploy! 🚀**

