# 📦 Guia: Enviar Projeto para GitHub

## 🚀 Método Rápido (Automático)

Execute o script:

```bash
enviar-github.bat
```

O script faz tudo automaticamente!

---

## 📝 Método Manual (Passo a Passo)

### 1. Verificar se Git está instalado

```bash
git --version
```

Se não estiver instalado, baixe em: https://git-scm.com/download/win

### 2. Configurar Git (primeira vez)

```bash
git config --global user.name "Seu Nome"
git config --global user.email "seu@email.com"
```

### 3. Inicializar repositório

```bash
git init
```

### 4. Adicionar arquivos

```bash
git add .
```

### 5. Fazer commit

```bash
git commit -m "Initial commit: CRM GMP - Sistema completo de gestão"
```

### 6. Conectar ao GitHub

```bash
git remote add origin https://github.com/mandoxxdev/CRM.git
```

### 7. Renomear branch para main

```bash
git branch -M main
```

### 8. Enviar para GitHub

```bash
git push -u origin main
```

---

## ⚠️ Problemas Comuns

### Erro: "Repository not found"

**Solução:** Crie o repositório no GitHub primeiro:
1. Acesse: https://github.com/mandoxxdev
2. Clique em "New repository"
3. Nome: `CRM`
4. Deixe vazio (sem README, .gitignore, etc.)
5. Clique em "Create repository"

### Erro: "Authentication failed"

**Solução:** Configure autenticação:

**Opção 1: Token de Acesso Pessoal (Recomendado)**
1. GitHub > Settings > Developer settings > Personal access tokens > Tokens (classic)
2. Generate new token
3. Selecione escopo: `repo`
4. Copie o token
5. Use no lugar da senha ao fazer push

**Opção 2: GitHub CLI**
```bash
gh auth login
```

**Opção 3: SSH (Avançado)**
```bash
git remote set-url origin git@github.com:mandoxxdev/CRM.git
```

### Erro: "Permission denied"

**Solução:** Verifique se você tem acesso ao repositório `mandoxxdev/CRM`.

---

## 🔄 Atualizar Código no GitHub

Após fazer mudanças:

```bash
git add .
git commit -m "Descrição das mudanças"
git push
```

---

## 📋 Checklist

- [ ] Git instalado
- [ ] Git configurado (nome e email)
- [ ] Repositório criado no GitHub
- [ ] Autenticação configurada
- [ ] Código enviado com sucesso

---

## 🔗 Links Úteis

- **GitHub**: https://github.com/mandoxxdev/CRM
- **Documentação Git**: https://git-scm.com/doc
- **GitHub Docs**: https://docs.github.com

---

**Pronto para enviar! 🚀**

