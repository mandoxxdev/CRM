# ✅ Solução Definitiva: Deploy no Coolify

## 🔴 Problema

O Coolify está usando `npm ci` que requer `package-lock.json` sincronizado, mas os lock files estão desatualizados e ainda estão no repositório remoto.

## ✅ Solução: Remover Lock Files do Repositório

### **Passo 1: Remover Lock Files do Git**

Execute:
```powershell
.\remover-locks-git.bat
```

Este script:
- Remove lock files localmente
- Remove do Git (mas mantém localmente se existirem)
- Adiciona ao .gitignore
- Prepara para commit

### **Passo 2: Enviar para GitHub**

Execute:
```powershell
.\enviar-github.bat
```

Quando pedir mensagem do commit, use:
```
Remover package-lock.json do repositorio
```

### **Passo 3: Verificar no GitHub**

Acesse: https://github.com/mandoxxdev/CRM

Verifique se os arquivos `package-lock.json` foram removidos do repositório.

### **Passo 4: Configurar Coolify**

No painel do Coolify, **NÃO configure Build Command**. Deixe o Coolify usar o `nixpacks.toml` que já está configurado.

**OU** se precisar configurar manualmente:

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

1. **Sem lock files no repositório** → Coolify não pode usar `npm ci`
2. **Nixpacks detecta ausência de lock files** → Usa `npm install` automaticamente
3. **nixpacks.toml configurado** → Força uso de `npm install`

---

## 📋 Checklist Final

- [ ] Executar `remover-locks-git.bat`
- [ ] Executar `enviar-github.bat`
- [ ] Verificar no GitHub que lock files foram removidos
- [ ] Aguardar alguns segundos para GitHub atualizar
- [ ] Tentar deploy no Coolify novamente

---

## ⚠️ Importante

Depois de remover os lock files do repositório, **não os adicione novamente**. Eles estão no `.gitignore` e serão gerados localmente, mas não devem ser commitados.

---

**Siga estes passos na ordem e o deploy deve funcionar! 🚀**
