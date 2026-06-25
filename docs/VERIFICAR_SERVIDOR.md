# 🔍 Como Verificar se o Servidor Está Rodando

## ✅ Verificação Rápida

### 1. **Verificar se o servidor está rodando:**

Abra o navegador e acesse:
```
http://localhost:5000/api/health
```

Se o servidor estiver rodando, você verá:
```json
{
  "status": "ok",
  "message": "Servidor CRM GMP INDUSTRIAIS está rodando",
  "timestamp": "2024-..."
}
```

### 2. **Verificar no terminal:**

No terminal onde você executou `npm run dev`, você deve ver:
```
============================================================
🚀 Servidor CRM GMP INDUSTRIAIS rodando na porta 5000
📊 Banco de dados: C:\...\database.sqlite
🌐 API disponível em: http://localhost:5000/api
💚 Health check: http://localhost:5000/api/health
============================================================
```

## 🔧 Se o Servidor Não Estiver Rodando

### Passo 1: Verificar se a porta 5000 está em uso

No PowerShell:
```powershell
netstat -ano | findstr :5000
```

Se houver algo usando a porta, você verá um PID. Para matar o processo:
```powershell
taskkill /PID <número_do_pid> /F
```

### Passo 2: Reiniciar o servidor

1. Pare o servidor (Ctrl+C no terminal)
2. Execute novamente:
```bash
npm run dev
```

### Passo 3: Verificar erros no console

Procure por mensagens de erro no terminal do servidor. Os erros mais comuns são:
- ❌ Erro ao conectar ao banco de dados
- ❌ Porta já em uso
- ❌ Dependências faltando

## 🚀 Comandos Úteis

### Iniciar apenas o servidor:
```bash
cd server
npm start
```

### Iniciar servidor com auto-reload:
```bash
cd server
npm run dev
```

### Verificar se as dependências estão instaladas:
```bash
cd server
npm list
```

## 📝 Checklist de Diagnóstico

- [ ] Servidor está rodando (verificar com `/api/health`)
- [ ] Porta 5000 não está sendo usada por outro processo
- [ ] Banco de dados existe (`server/database.sqlite`)
- [ ] Todas as dependências estão instaladas
- [ ] Não há erros no console do servidor
- [ ] Firewall não está bloqueando a porta 5000

---

**Se o problema persistir, verifique os logs do servidor para mais detalhes!**




