# 🔧 Solução para Erro de Rede (Network Error)

## 🐛 Problema

O erro "Network Error" ou "Erro ao carregar usuários: Network Error" geralmente significa que:

1. **O servidor não está rodando** na porta 5000
2. **A URL da API está incorreta**
3. **O servidor está em uma porta diferente**

## ✅ Soluções

### 1. **Verificar se o servidor está rodando**

Abra um terminal e execute:

```bash
# No diretório raiz do projeto
cd server
npm start
```

Ou use o script do package.json:

```bash
# No diretório raiz
npm run server
```

Você deve ver a mensagem:
```
🚀 Servidor CRM GMP INDUSTRIAIS rodando na porta 5000
```

### 2. **Verificar a porta do servidor**

O servidor deve estar rodando na porta **5000**. Verifique no arquivo `server/index.js`:

```javascript
const PORT = process.env.PORT || 5000;
```

### 3. **Verificar a URL da API no frontend**

No arquivo `client/src/services/api.js`, a URL padrão é:

```javascript
baseURL: process.env.REACT_APP_API_URL || 'http://localhost:5000/api',
```

### 4. **Executar ambos (servidor e cliente)**

Você precisa ter **dois terminais** abertos:

**Terminal 1 - Servidor:**
```bash
cd server
npm start
```

**Terminal 2 - Cliente:**
```bash
cd client
npm start
```

Ou use o script unificado (se configurado):
```bash
npm run dev
```

### 5. **Verificar firewall/antivírus**

Às vezes, o firewall ou antivírus pode bloquear a conexão. Verifique se a porta 5000 está liberada.

### 6. **Limpar cache e recarregar**

1. Abra o DevTools (F12)
2. Vá em "Network" (Rede)
3. Marque "Disable cache"
4. Recarregue a página (Ctrl+Shift+R)

## 🔍 Como Diagnosticar

1. **Abra o Console do Navegador (F12)**
2. **Vá na aba "Network" (Rede)**
3. **Tente carregar a página de usuários**
4. **Veja se há requisições para `http://localhost:5000/api/usuarios`**
5. **Verifique o status da requisição:**
   - ❌ **Failed/Network Error**: Servidor não está rodando
   - ✅ **200 OK**: Servidor está funcionando
   - ❌ **404**: Rota não encontrada
   - ❌ **401/403**: Problema de autenticação

## 📝 Checklist

- [ ] Servidor está rodando na porta 5000
- [ ] Cliente está rodando (geralmente porta 3000)
- [ ] Não há erros no console do servidor
- [ ] Não há erros no console do navegador
- [ ] A URL da API está correta (`http://localhost:5000/api`)
- [ ] O token está sendo enviado nas requisições

## 🚀 Comando Rápido

Para executar tudo de uma vez (se configurado):

```bash
# No diretório raiz
npm run dev
```

Ou manualmente:

```bash
# Terminal 1
cd server && npm start

# Terminal 2 (novo terminal)
cd client && npm start
```

---

**Se o problema persistir, verifique os logs do servidor para mais detalhes!**




