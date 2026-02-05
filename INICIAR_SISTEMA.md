# 🚀 Como Iniciar o Sistema CRM GMP

## ⚠️ IMPORTANTE: O servidor backend DEVE estar rodando!

O erro de proxy acontece porque o **servidor backend não está rodando na porta 5000**.

## 📋 Passos para Iniciar o Sistema

### Opção 1: Iniciar Tudo de Uma Vez (RECOMENDADO)

No diretório raiz do projeto, execute:

```bash
npm run dev
```

Isso iniciará:
- ✅ Servidor backend na porta **5000**
- ✅ Frontend React na porta **3000**

### Opção 2: Iniciar Separadamente

#### 1. Iniciar o Servidor Backend (OBRIGATÓRIO)

Abra um terminal e execute:

```bash
cd server
npm run dev
```

Ou se não tiver o script `dev`:

```bash
cd server
node index.js
```

**Verifique se apareceu a mensagem:**
```
✅ Servidor rodando na porta 5000
```

#### 2. Iniciar o Frontend

Abra **OUTRO terminal** e execute:

```bash
cd client
npm start
```

## 🔍 Verificar se o Servidor Está Rodando

Abra no navegador:
- http://localhost:5000/health

Se aparecer uma mensagem de sucesso, o servidor está rodando corretamente.

## 🌐 Acessar de Outro PC na Rede

Se você está acessando de outro PC (como `192.168.1.126`):

1. **O servidor DEVE estar rodando no PC principal**
2. **O firewall deve permitir conexões na porta 5000**
3. **Acesse:** http://192.168.1.126:3000 (frontend)
4. **O frontend automaticamente detecta o IP e conecta ao backend**

## ⚙️ Configuração Automática

O sistema já está configurado para:
- ✅ Detectar automaticamente se está sendo acessado por IP ou localhost
- ✅ Conectar ao backend no mesmo IP automaticamente
- ✅ Mostrar mensagens de erro claras se o servidor não estiver rodando

## 🐛 Solução de Problemas

### Erro: "ECONNREFUSED" ou "Proxy error"

**Causa:** O servidor backend não está rodando.

**Solução:**
1. Verifique se o servidor está rodando: http://localhost:5000/health
2. Se não estiver, inicie o servidor: `cd server && npm run dev`
3. Aguarde a mensagem "Servidor rodando na porta 5000"
4. Recarregue o frontend

### Erro: "Cannot read properties of null (reading 'useState')"

**Causa:** Problema com cache do webpack ou múltiplas versões do React.

**Solução:**
1. Pare o servidor (Ctrl+C)
2. Limpe o cache:
   ```bash
   cd client
   rm -rf node_modules/.cache
   rm -rf build
   ```
3. Reinicie: `npm start`

### Porta 5000 já está em uso

**Solução:**
1. Encontre o processo usando a porta:
   ```bash
   # Windows
   netstat -ano | findstr :5000
   ```
2. Encerre o processo ou mude a porta no `server/index.js`:
   ```javascript
   const PORT = process.env.PORT || 5001; // Mude para outra porta
   ```

## 📝 Checklist de Inicialização

Antes de usar o sistema, verifique:

- [ ] Servidor backend está rodando (porta 5000)
- [ ] Frontend está rodando (porta 3000)
- [ ] Banco de dados foi criado (automaticamente na primeira execução)
- [ ] Nenhum erro no console do servidor
- [ ] Nenhum erro no console do navegador

## 🎯 Comandos Rápidos

```bash
# Iniciar tudo
npm run dev

# Apenas servidor
cd server && npm run dev

# Apenas frontend
cd client && npm start

# Instalar todas as dependências
npm run install-all
```

---

**Desenvolvido para GMP INDUSTRIAIS** 🏭




