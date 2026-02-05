# ✅ Solução Final: Deploy no Coolify

## 🔴 Problema

O Coolify está usando `npm ci` que requer `package-lock.json` sincronizado, mas os lock files estão desatualizados.

## ✅ Solução: Remover Lock Files

A melhor solução é **remover os lock files do repositório** e deixar o Coolify gerar novos durante o build.

### **Passo 1: Remover Lock Files Localmente**

Execute:
```powershell
.\remover-locks-e-enviar.bat
```

Ou manualmente:
```powershell
del package-lock.json
del server\package-lock.json
del client\package-lock.json
```

### **Passo 2: Adicionar ao .gitignore**

Os lock files já foram adicionados ao `.gitignore` para não serem enviados.

### **Passo 3: Enviar para GitHub**

Execute:
```powershell
.\enviar-github.bat
```

### **Passo 4: Configurar Coolify**

No painel do Coolify, configure:

**Build Command:**
```bash
npm install --legacy-peer-deps && cd client && npm install --legacy-peer-deps && npm run build && cd ../server && npm install --legacy-peer-deps
```

**Start Command:**
```bash
cd server && node index.js
```

**Port:** `3000`

---

## 🎯 Por que isso funciona?

- Sem lock files no repositório, o Coolify não pode usar `npm ci`
- O `nixpacks.toml` está configurado para usar `npm install`
- O build vai gerar novos lock files durante o processo (mas não serão commitados)

---

## 📋 Checklist

- [ ] Remover lock files localmente
- [ ] Verificar se estão no .gitignore
- [ ] Enviar alterações para GitHub
- [ ] Configurar Build Command no Coolify
- [ ] Tentar deploy novamente

---

**Depois de seguir estes passos, o deploy deve funcionar! 🚀**
