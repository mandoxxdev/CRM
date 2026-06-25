# 🚀 Instruções Rápidas de Deploy

## Método Mais Fácil: Vercel (Recomendado)

### Opção A: Via Interface Web (Mais Fácil)

1. **Criar conta no Vercel:**
   - Acesse: https://vercel.com
   - Faça login com GitHub, GitLab ou email

2. **Conectar repositório:**
   - Clique em "Add New Project"
   - Conecte seu repositório GitHub (ou faça upload)
   - Configure:
     - Framework Preset: **Vite**
     - Build Command: `npm run build`
     - Output Directory: `dist`
     - Install Command: `npm install`

3. **Deploy automático:**
   - Vercel faz deploy automaticamente
   - Você recebe uma URL: `https://seu-projeto.vercel.app`

4. **Domínio personalizado:**
   - Settings > Domains
   - Adicione seu domínio
   - Configure DNS conforme instruções

---

### Opção B: Via CLI (Terminal)

1. **Instalar Vercel CLI:**
   ```bash
   npm install -g vercel
   ```

2. **Fazer login:**
   ```bash
   vercel login
   ```

3. **Executar script de deploy:**
   ```bash
   deploy-vercel.bat
   ```
   
   Ou manualmente:
   ```bash
   npm run build
   vercel --prod
   ```

---

## Método Alternativo: Netlify

### Via Interface Web:

1. Acesse: https://netlify.com
2. Arraste a pasta `dist/` (após `npm run build`) para a área de deploy
3. Pronto! Você recebe uma URL

### Via CLI:

```bash
npm install -g netlify-cli
netlify login
deploy-netlify.bat
```

---

## Preparar Build Localmente

Execute:

```bash
build-producao.bat
```

Isso gera a pasta `dist/` com os arquivos prontos para deploy.

---

## Testar Build Localmente

```bash
npm run preview
```

Acesse `http://localhost:4173` para verificar.

---

## ⚠️ IMPORTANTE: Sobre os Dados

**O CRM atual armazena dados localmente no navegador de cada usuário.**

Isso significa:
- ✅ Cada usuário tem seus próprios dados
- ❌ Dados não são compartilhados entre usuários
- ❌ Se limpar cache, dados são perdidos

**Para um CRM compartilhado, você precisará:**
1. Criar um backend (API)
2. Usar banco de dados no servidor (PostgreSQL, MySQL, etc.)
3. Conectar o frontend à API

---

## 📋 Checklist Rápido

- [ ] Executar `build-producao.bat`
- [ ] Testar com `npm run preview`
- [ ] Escolher plataforma (Vercel recomendado)
- [ ] Fazer deploy
- [ ] Configurar domínio personalizado
- [ ] Testar login e funcionalidades
- [ ] Compartilhar URL com usuários

---

## 🆘 Problemas?

1. **Erro 404 em rotas:** Configure redirects (já incluído nos arquivos)
2. **Assets não carregam:** Verifique `base` no `vite.config.ts`
3. **Build falha:** Verifique se todas as dependências estão instaladas

---

**Pronto para fazer deploy! 🎉**

