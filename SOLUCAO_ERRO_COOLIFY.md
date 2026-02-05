# 🔧 Solução: Erro de Deploy no Coolify

## ❌ Erro Encontrado

```
npm error `npm ci` can only install packages when your package.json and package-lock.json are in sync.
npm error Missing: terser@5.46.0 from lock file
```

## ✅ Solução

O problema é que o `package-lock.json` está desatualizado. Siga estes passos:

### **Passo 1: Atualizar Lock Files Localmente**

Execute no PowerShell:

```powershell
# Atualizar lock file da raiz
npm install --package-lock-only

# Atualizar lock file do servidor
cd server
npm install --package-lock-only
cd ..

# Atualizar lock file do cliente
cd client
npm install --package-lock-only
cd ..
```

**Ou use o script automático:**
```powershell
.\atualizar-lockfiles.bat
```

### **Passo 2: Fazer Commit e Push**

```powershell
git add package-lock.json
git add server/package-lock.json
git add client/package-lock.json
git commit -m "Atualizar package-lock.json para sincronizar com package.json"
git push origin main
```

### **Passo 3: Configurar Build no Coolify**

No painel do Coolify, configure:

**Build Command:**
```bash
npm install && cd client && npm install && npm run build && cd ../server && npm install
```

**Start Command:**
```bash
cd server && node index.js
```

**Port:** `3000`

**Ou use o arquivo `nixpacks.toml`** que já foi criado - o Coolify deve detectar automaticamente.

---

## 🔄 Alternativa: Usar npm install em vez de npm ci

Se o problema persistir, você pode configurar o Coolify para usar `npm install` em vez de `npm ci`:

1. No Coolify, vá em **Settings** do projeto
2. Procure por **Build Settings** ou **Build Command**
3. Altere para usar `npm install` em vez de `npm ci`

---

## 📋 Checklist

- [ ] Atualizar package-lock.json localmente
- [ ] Fazer commit dos lock files atualizados
- [ ] Fazer push para o GitHub
- [ ] Configurar Build Command no Coolify
- [ ] Configurar Start Command no Coolify
- [ ] Tentar deploy novamente

---

## 🐛 Se o Erro Persistir

### Verificar se os arquivos foram commitados:

```powershell
git status
```

Certifique-se de que `package-lock.json` aparece na lista.

### Limpar cache do npm (se necessário):

```powershell
npm cache clean --force
cd server
npm cache clean --force
cd ../client
npm cache clean --force
cd ..
```

Depois execute novamente:
```powershell
.\atualizar-lockfiles.bat
```

---

**Depois de seguir estes passos, tente fazer deploy novamente no Coolify! 🚀**
