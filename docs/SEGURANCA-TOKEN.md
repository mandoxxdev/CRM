# 🔐 Segurança: Token do GitHub Exposto

## ⚠️ ATENÇÃO IMPORTANTE

O token que você compartilhou foi **exposto** e deve ser **revogado imediatamente** por segurança!

---

## 🚨 O Que Fazer AGORA

### 1. Revogar o Token Exposto

1. Acesse: https://github.com/settings/tokens
2. Encontre o token que começa com `github_pat_11AWLT27I0...`
3. Clique em **"Revoke"** (Revogar)
4. Confirme a revogação

### 2. Criar um Novo Token

1. Acesse: https://github.com/settings/tokens
2. Clique em **"Generate new token"** > **"Generate new token (classic)"**
3. Dê um nome: `CRM Deploy - Novo`
4. Selecione escopo: **`repo`** (todas as opções)
5. Clique em **"Generate token"**
6. **COPIE O TOKEN** (você não verá ele novamente!)

### 3. Usar o Novo Token

**IMPORTANTE:** Nunca compartilhe tokens em mensagens, chats ou arquivos públicos!

**Forma Segura de Usar:**

```bash
# Opção 1: Usar quando pedir senha
# Usuário: mandoxxdev
# Senha: [cole o token aqui]

# Opção 2: Configurar no Git (temporário)
git remote set-url origin https://[SEU_TOKEN]@github.com/mandoxxdev/CRM.git

# Opção 3: Usar variável de ambiente (mais seguro)
set GITHUB_TOKEN=seu_token_aqui
git push -u origin main
```

---

## ✅ Verificar se o Push Funcionou

Acesse o repositório:
**https://github.com/mandoxxdev/CRM**

Se você ver os arquivos do projeto, o push foi bem-sucedido!

---

## 🔒 Boas Práticas de Segurança

1. ✅ **Nunca compartilhe tokens** em:
   - Mensagens de chat
   - Emails públicos
   - Arquivos de código
   - Screenshots
   - Repositórios públicos

2. ✅ **Use tokens com escopo mínimo necessário**
   - Apenas `repo` se precisar apenas de repositórios

3. ✅ **Revogue tokens expostos imediatamente**

4. ✅ **Use tokens diferentes para diferentes projetos**

5. ✅ **Configure expiração** para tokens (se disponível)

---

## 📋 Checklist de Segurança

- [ ] Token exposto foi revogado
- [ ] Novo token foi criado
- [ ] Novo token está seguro (não compartilhado)
- [ ] Repositório está funcionando
- [ ] Token antigo não está mais em uso

---

**Mantenha seus tokens seguros! 🔐**

