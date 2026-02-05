# ✅ Instruções Finais: Deploy no Coolify

## 🔴 Problema Atual

O Coolify está tentando usar Node.js 22, mas essa versão não está disponível no Nixpacks.

## ✅ Solução Definitiva

### **Passo 1: Preparar Localmente**

Execute:
```powershell
.\configurar-coolify-final.bat
```

Depois:
```powershell
.\enviar-agora.bat
```

### **Passo 2: Configurar no Coolify**

No painel do Coolify, vá em **Settings** → **Environment Variables** e:

**OPÇÃO A: Remover variável (Recomendado)**
- Procure por `NIXPACKS_NODE_VERSION`
- Se existir, **DELETE** essa variável
- Deixe o Coolify usar a versão padrão (Node.js 20)

**OPÇÃO B: Definir versão 20**
- Adicione ou edite: `NIXPACKS_NODE_VERSION=20`
- Salve

### **Passo 3: Build Command (se necessário)**

Se ainda não funcionar, configure manualmente:

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

## 🎯 Resumo

1. ✅ Execute `configurar-coolify-final.bat`
2. ✅ Execute `enviar-agora.bat`
3. ✅ No Coolify: Remova `NIXPACKS_NODE_VERSION=22` ou mude para `20`
4. ✅ Tente deploy novamente

---

**Isso deve resolver definitivamente! 🚀**
