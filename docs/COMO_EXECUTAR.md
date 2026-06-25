# 🚀 Como Executar o CRM GMP INDUSTRIAIS

## Passo a Passo no Windows

### 1️⃣ Abrir o PowerShell ou Prompt de Comando

- Pressione `Windows + R`
- Digite `powershell` ou `cmd` e pressione Enter
- OU clique com botão direito na pasta e escolha "Abrir no Terminal" ou "Abrir no PowerShell"

### 2️⃣ Navegar até a Pasta do Projeto

No PowerShell/Terminal, digite:

```powershell
cd "C:\Users\mathe\OneDrive - MOINHO YPIRANGA INDUSTRIA DE MAQUINAS LTDA\GMP - MODELO DE DOCUMENTOS\CRM GMP - FINAL"
```

**OU** se você já estiver na pasta, verifique com:
```powershell
pwd
```

### 3️⃣ Instalar as Dependências (PRIMEIRA VEZ APENAS)

Execute este comando para instalar todas as dependências:

```powershell
npm run install-all
```

Isso vai instalar:
- Dependências do projeto raiz
- Dependências do servidor (backend)
- Dependências do cliente (frontend)

⏱️ Isso pode levar alguns minutos na primeira vez.

### 4️⃣ Iniciar o Sistema

Depois de instalar, execute:

```powershell
npm run dev
```

Isso vai iniciar:
- ✅ **Backend** na porta **5000** (http://localhost:5000)
- ✅ **Frontend** na porta **3000** (http://localhost:3000)

### 5️⃣ Acessar o Sistema

Abra seu navegador e acesse:

**http://localhost:3000**

### 6️⃣ Fazer Login

Use as credenciais padrão:
- **Email:** `admin@gmp.com.br`
- **Senha:** `admin123`

---

## ⚠️ Solução de Problemas

### Erro: "npm não é reconhecido"
- Instale o Node.js: https://nodejs.org/
- Escolha a versão LTS (Long Term Support)
- Reinicie o PowerShell após instalar

### Erro: "Porta já está em uso"
- Feche outros programas que possam estar usando as portas 3000 ou 5000
- Ou altere as portas nos arquivos de configuração

### Erro ao instalar dependências
- Tente limpar o cache: `npm cache clean --force`
- Delete as pastas `node_modules` e tente novamente

### O navegador não abre automaticamente
- Acesse manualmente: http://localhost:3000

---

## 📋 Comandos Úteis

```powershell
# Instalar tudo (primeira vez)
npm run install-all

# Iniciar servidor e cliente juntos
npm run dev

# Apenas o servidor (backend)
npm run server

# Apenas o cliente (frontend)
npm run client

# Parar o servidor
# Pressione Ctrl + C no terminal
```

---

## 🎯 Próximos Passos

Após fazer login, você pode:

1. **Cadastrar Clientes** - Menu "Clientes" → "Novo Cliente"
2. **Criar Projetos** - Menu "Projetos" → "Novo Projeto"
3. **Gerar Propostas** - Menu "Propostas" → "Nova Proposta"
4. **Gerenciar Oportunidades** - Menu "Oportunidades"
5. **Ver Dashboard** - Página inicial com estatísticas

---

## 💡 Dica

Para facilitar, você pode criar um arquivo `.bat` na pasta do projeto:

**iniciar.bat**
```batch
@echo off
cd /d "%~dp0"
npm run dev
pause
```

Assim, basta dar duplo clique no arquivo para iniciar!

---

**Boa sorte com o CRM! 🎉**




