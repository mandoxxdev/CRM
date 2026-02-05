# 🚀 Guia de Deploy no Coolify

## ❌ Erro Comum: Autenticação GitHub

Se você receber o erro:
```
fatal: could not read Username for 'https://github.com': No such device or address
```

Isso significa que o Coolify não consegue acessar seu repositório privado do GitHub.

## ✅ Soluções

### **Solução 1: Usar SSH (Recomendado)** ⭐

Esta é a melhor opção para repositórios privados.

#### Passo 1: Gerar Chave SSH Manualmente

Como a interface pode variar, vamos gerar a chave SSH manualmente:

1. **No servidor onde o Coolify está rodando**, acesse via SSH
2. Execute:
   ```bash
   ssh-keygen -t ed25519 -C "coolify-deploy" -f ~/.ssh/coolify_deploy
   ```
3. **Copie a chave pública:**
   ```bash
   cat ~/.ssh/coolify_deploy.pub
   ```
4. Copie todo o conteúdo que aparecer (começa com `ssh-ed25519`)

#### Passo 2: Adicionar a Chave SSH ao GitHub

1. Acesse: https://github.com/settings/keys
2. Clique em **New SSH key**
3. Dê um título: `Coolify Deploy`
4. Cole a chave pública que você copiou
5. Clique em **Add SSH key**

#### Passo 3: Configurar o Repositório no Coolify

**Opção A: Diretamente no projeto**
1. No seu projeto no Coolify, procure por:
   - **Source** ou **Repository** ou **Git**
   - Ou na aba **Settings** do projeto
2. Altere a URL do repositório de:
   ```
   https://github.com/mandoxxdev/CRM.git
   ```
   Para:
   ```
   git@github.com:mandoxxdev/CRM.git
   ```
3. Salve

**Opção B: Se não conseguir alterar a URL**
1. No servidor, configure o SSH:
   ```bash
   # Adicione o GitHub aos known hosts
   ssh-keyscan github.com >> ~/.ssh/known_hosts
   
   # Teste a conexão
   ssh -T git@github.com
   ```
2. O Coolify deve usar automaticamente as chaves SSH do servidor

---

### **Solução 2: Usar Personal Access Token (PAT)**

Se preferir usar HTTPS, você precisa criar um token de acesso pessoal.

#### Passo 1: Criar Token no GitHub

1. Acesse: https://github.com/settings/tokens
2. Clique em **Generate new token** → **Generate new token (classic)**
3. Dê um nome: `Coolify Deploy`
4. Selecione as permissões:
   - ✅ `repo` (acesso completo aos repositórios)
5. Clique em **Generate token**
6. **COPIE O TOKEN** (você só verá ele uma vez!)

#### Passo 2: Configurar no Coolify

**Onde encontrar no Coolify:**

Procure por uma dessas opções:
- **Settings** → **Source** → **GitHub Authentication**
- **Settings** → **Repository** → **Authentication**
- **Project Settings** → **Source** → **GitHub**
- **Admin Panel** (ícone de engrenagem) → **Git Providers**
- Na página do projeto: **Source** ou **Repository** → botão de configuração ⚙️

**Se encontrar:**
1. Selecione **GitHub**
2. Escolha **HTTPS** como método
3. Cole o token no campo **Personal Access Token** ou **Token**
4. Salve

**Se NÃO encontrar:**
Use a **Solução 3** (tornar público temporariamente) ou configure via variável de ambiente:
1. No projeto, vá em **Environment Variables**
2. Adicione:
   ```
   GITHUB_TOKEN=seu-token-aqui
   ```
3. O Coolify pode usar essa variável automaticamente

#### Passo 3: Atualizar URL do Repositório

1. No seu projeto, vá em **Source**
2. Certifique-se que a URL está como:
   ```
   https://github.com/mandoxxdev/CRM.git
   ```
3. Salve e tente fazer deploy novamente

---

### **Solução 3: Tornar Repositório Público** (Não Recomendado)

⚠️ **ATENÇÃO:** Isso torna seu código público para qualquer pessoa ver.

1. Acesse: https://github.com/mandoxxdev/CRM/settings
2. Role até **Danger Zone**
3. Clique em **Change visibility** → **Make public**
4. Confirme

Depois disso, o Coolify conseguirá acessar sem autenticação.

---

## 🔧 Configuração do Projeto no Coolify

Após resolver a autenticação, configure o projeto:

### 1. Variáveis de Ambiente

No Coolify, adicione estas variáveis de ambiente:

```env
NODE_ENV=production
PORT=3000
JWT_SECRET=sua-chave-secreta-super-segura-aqui
```

**Para gerar uma JWT_SECRET segura:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### 2. Build Command

**IMPORTANTE:** O projeto já tem um `Dockerfile` customizado que resolve o problema de `package-lock.json`.

**Se o Coolify usar Dockerfile (recomendado):**
- Não precisa configurar Build Command
- O Dockerfile já está configurado para usar `npm install` em vez de `npm ci`

**Se precisar configurar Build Command manualmente:**
```bash
rm -f package-lock.json server/package-lock.json client/package-lock.json && npm install --legacy-peer-deps && cd client && npm install --legacy-peer-deps && npm run build && cd ../server && npm install --legacy-peer-deps
```

### 3. Start Command

Configure o comando de inicialização:

```bash
cd server && node index.js
```

### 4. Port

Configure a porta: `3000`

### 5. Health Check Path (Opcional)

```
/api/health
```

---

## 📋 Checklist de Deploy

- [ ] Autenticação GitHub configurada (SSH ou PAT)
- [ ] URL do repositório correta
- [ ] Variáveis de ambiente configuradas
- [ ] Build command configurado
- [ ] Start command configurado
- [ ] Porta configurada
- [ ] Deploy iniciado

---

## 🔍 Onde Encontrar Configurações no Coolify

Se não encontrar "Source Providers", procure por:

1. **No Projeto:**
   - Aba **Settings** ou **Configuration**
   - Seção **Source** ou **Repository**
   - Botão de engrenagem ⚙️ ao lado da URL do repositório

2. **No Painel Admin:**
   - Menu lateral → **Settings** ou **Admin**
   - **Git Providers** ou **Source Providers**
   - **Integrations** → **GitHub**

3. **Alternativa:**
   - Edite diretamente a URL do repositório
   - Use formato SSH: `git@github.com:usuario/repo.git`
   - O Coolify pode detectar automaticamente

---

## 🐛 Troubleshooting

### Erro: "Repository not found"

- Verifique se o repositório existe
- Verifique se a URL está correta
- Verifique se a autenticação está configurada

### Erro: "Permission denied"

- Verifique se a chave SSH foi adicionada ao GitHub
- Verifique se o token PAT tem permissão `repo`

### Erro: "Build failed"

- Verifique os logs do build
- Verifique se todas as dependências estão no `package.json`
- Verifique se o Node.js está instalado no servidor

### Erro: "Application not starting"

- Verifique os logs da aplicação
- Verifique se a porta está correta
- Verifique se as variáveis de ambiente estão configuradas

### Não encontro "Source Providers" no Coolify

**Solução Rápida:**
1. Vá diretamente na página do seu projeto
2. Procure por **Source** ou **Repository**
3. Altere a URL para formato SSH: `git@github.com:mandoxxdev/CRM.git`
4. Configure a chave SSH no servidor (veja Solução 1, Passo 1)
5. Adicione a chave no GitHub (veja Solução 1, Passo 2)
6. Tente fazer deploy novamente

**Alternativa:**
- Use a Solução 3 (tornar repositório público temporariamente)
- Ou configure via linha de comando no servidor

---

## 💡 Dicas

1. **Use SSH** - É mais seguro e não expira como tokens
2. **Mantenha tokens seguros** - Nunca compartilhe tokens em código
3. **Use variáveis de ambiente** - Não hardcode valores sensíveis
4. **Monitore os logs** - Acompanhe o primeiro deploy de perto

---

## 📚 Recursos

- [Documentação do Coolify](https://coolify.io/docs)
- [GitHub SSH Keys](https://docs.github.com/en/authentication/connecting-to-github-with-ssh)
- [GitHub Personal Access Tokens](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token)

---

**Boa sorte com o deploy! 🚀**
