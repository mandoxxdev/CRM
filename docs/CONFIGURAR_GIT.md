# 🔧 Configurar Git para Push Automático

## 📋 Configuração Inicial (Primeira Vez)

### 1. Verificar se o Git está instalado

Abra o PowerShell e execute:
```powershell
git --version
```

Se não estiver instalado, baixe em: https://git-scm.com/download/win

### 2. Configurar suas credenciais (Primeira vez)

```powershell
git config --global user.name "Seu Nome"
git config --global user.email "seu-email@exemplo.com"
```

### 3. Verificar se o repositório está inicializado

```powershell
git status
```

Se aparecer erro, inicialize o repositório:
```powershell
git init
```

### 4. Adicionar o repositório remoto do GitHub

```powershell
git remote add origin https://github.com/mandoxxdev/CRM.git
```

Ou se já existir, atualize:
```powershell
git remote set-url origin https://github.com/mandoxxdev/CRM.git
```

### 5. Verificar o remote

```powershell
git remote -v
```

Deve mostrar:
```
origin  https://github.com/mandoxxdev/CRM.git (fetch)
origin  https://github.com/mandoxxdev/CRM.git (push)
```

---

## 🚀 Automação: Scripts para Push Automático

Criei scripts que você pode usar para automatizar o processo.

### **Opção 1: Script Simples (Recomendado)**

Use o arquivo `git-push.bat` que criei. Basta executar:
```powershell
.\git-push.bat
```

### **Opção 2: Push Manual Rápido**

Execute estes comandos quando quiser enviar suas alterações:

```powershell
# Adicionar todas as alterações
git add .

# Fazer commit
git commit -m "Atualização: $(Get-Date -Format 'dd/MM/yyyy HH:mm')"

# Enviar para o GitHub
git push origin main
```

Se a branch for `master` em vez de `main`:
```powershell
git push origin master
```

---

## 🔐 Configurar Autenticação GitHub

### **Método 1: Personal Access Token (Recomendado para Windows)**

1. **Criar Token no GitHub:**
   - Acesse: https://github.com/settings/tokens
   - Clique em **Generate new token** → **Generate new token (classic)**
   - Dê um nome: `Meu Computador`
   - Marque a permissão: ✅ `repo`
   - Clique em **Generate token**
   - **COPIE O TOKEN** (você só verá uma vez!)

2. **Configurar no Git:**
   ```powershell
   git config --global credential.helper wincred
   ```

3. **Na primeira vez que fizer push:**
   - Username: seu usuário do GitHub (`mandoxxdev`)
   - Password: cole o token que você copiou (não sua senha!)

4. **O Windows salvará as credenciais automaticamente**

### **Método 2: SSH (Mais Seguro)**

1. **Gerar chave SSH:**
   ```powershell
   ssh-keygen -t ed25519 -C "seu-email@exemplo.com"
   ```
   - Pressione Enter para aceitar o local padrão
   - Pressione Enter para não usar senha (ou crie uma)

2. **Copiar a chave pública:**
   ```powershell
   cat ~/.ssh/id_ed25519.pub
   ```
   Ou no Windows:
   ```powershell
   type C:\Users\SeuUsuario\.ssh\id_ed25519.pub
   ```

3. **Adicionar no GitHub:**
   - Acesse: https://github.com/settings/keys
   - Clique em **New SSH key**
   - Cole a chave e salve

4. **Alterar URL do repositório para SSH:**
   ```powershell
   git remote set-url origin git@github.com:mandoxxdev/CRM.git
   ```

---

## 📝 Workflow Diário Recomendado

### **Quando fizer alterações:**

1. **Ver o que mudou:**
   ```powershell
   git status
   ```

2. **Adicionar alterações:**
   ```powershell
   git add .
   ```

3. **Fazer commit:**
   ```powershell
   git commit -m "Descrição do que foi alterado"
   ```

4. **Enviar para GitHub:**
   ```powershell
   git push origin main
   ```

### **Ou use o script automático:**
```powershell
.\git-push.bat
```

---

## 🔄 Sincronizar com o GitHub (Se outras pessoas fizeram alterações)

Antes de fazer push, sempre puxe as alterações:

```powershell
git pull origin main
```

Se houver conflitos, resolva e depois:
```powershell
git add .
git commit -m "Resolvendo conflitos"
git push origin main
```

---

## 🛠️ Comandos Úteis

### Ver histórico de commits:
```powershell
git log --oneline
```

### Ver diferenças antes de commitar:
```powershell
git diff
```

### Desfazer alterações não commitadas:
```powershell
git restore .
```

### Ver branches:
```powershell
git branch
```

### Criar nova branch:
```powershell
git checkout -b nome-da-branch
```

### Voltar para branch main:
```powershell
git checkout main
```

---

## ⚠️ Arquivos que NÃO são enviados

O arquivo `.gitignore` já está configurado para NÃO enviar:
- `node_modules/` (dependências)
- `.env` (variáveis de ambiente)
- `database.sqlite` (banco de dados)
- `client/build/` (build de produção)
- Arquivos temporários

**Nunca commite:**
- Senhas
- Tokens
- Arquivos `.env` com dados reais
- Banco de dados de produção

---

## 🎯 Resumo Rápido

**Para enviar alterações para o GitHub:**

```powershell
git add .
git commit -m "Sua mensagem aqui"
git push origin main
```

**Ou use o script:**
```powershell
.\git-push.bat
```

---

## 🐛 Problemas Comuns

### Erro: "fatal: not a git repository"
```powershell
git init
git remote add origin https://github.com/mandoxxdev/CRM.git
```

### Erro: "Authentication failed"
- Configure o token (veja Método 1 acima)
- Ou configure SSH (veja Método 2 acima)

### Erro: "Updates were rejected"
```powershell
git pull origin main
# Resolva conflitos se houver
git push origin main
```

### Erro: "branch 'main' does not exist"
```powershell
git checkout -b main
git push -u origin main
```

---

**Pronto! Agora você pode enviar suas alterações para o GitHub facilmente! 🚀**
