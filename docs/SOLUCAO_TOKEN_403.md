# 🔧 Solução: Erro 403 com Token do GitHub

## ❌ Erro

```
remote: Permission to mandoxxdev/CRM.git denied to mandoxxdev.
fatal: unable to access 'https://github.com/mandoxxdev/CRM.git/': The requested URL returned error: 403
```

## ✅ Soluções

### **Solução 1: Verificar Permissões do Token**

Se você está usando um **token fine-grained** (`github_pat_`):

1. Acesse: https://github.com/settings/tokens
2. Clique no seu token
3. Verifique se tem permissão **"Repository access"** → **"All repositories"** ou especificamente o repositório `mandoxxdev/CRM`
4. Verifique se tem permissão **"Contents"** → **Read and write**
5. Salve as alterações

### **Solução 2: Usar Token Clássico (Recomendado)**

Tokens clássicos (`ghp_`) são mais compatíveis:

1. Acesse: https://github.com/settings/tokens
2. Clique em **"Generate new token"** → **"Generate new token (classic)"**
3. Dê um nome: `Meu Computador`
4. Marque a permissão: ✅ **`repo`** (acesso completo aos repositórios)
5. Clique em **"Generate token"**
6. **COPIE O TOKEN** (começa com `ghp_`)
7. Use esse token no script `enviar-github.bat`

### **Solução 3: Configurar Token Manualmente**

Execute no PowerShell:

```powershell
# Configurar credential helper
git config --global credential.helper wincred

# Fazer push (vai pedir credenciais)
git push origin main
```

Quando pedir:
- **Username:** `mandoxxdev`
- **Password:** Cole seu token (não sua senha!)

O Windows salvará automaticamente.

### **Solução 4: Usar SSH em vez de HTTPS**

1. **Gerar chave SSH:**
   ```powershell
   ssh-keygen -t ed25519 -C "seu-email@exemplo.com"
   ```

2. **Copiar chave pública:**
   ```powershell
   type C:\Users\SeuUsuario\.ssh\id_ed25519.pub
   ```

3. **Adicionar no GitHub:**
   - Acesse: https://github.com/settings/keys
   - Clique em **"New SSH key"**
   - Cole a chave e salve

4. **Alterar remote para SSH:**
   ```powershell
   git remote set-url origin git@github.com:mandoxxdev/CRM.git
   git push origin main
   ```

---

## 🎯 Recomendação

**Use um token clássico (`ghp_`)** em vez de fine-grained (`github_pat_`) para maior compatibilidade.

1. Crie um novo token clássico: https://github.com/settings/tokens
2. Use esse token no script `enviar-github.bat`
3. Deve funcionar perfeitamente!

---

## 📝 Verificar Token Atual

Para verificar qual tipo de token você tem:

- **Token clássico:** Começa com `ghp_` (ex: `ghp_xxxxxxxxxxxx`)
- **Token fine-grained:** Começa com `github_pat_` (ex: `github_pat_xxxxxxxxxxxx`)

Tokens clássicos são mais simples e compatíveis com a maioria das ferramentas.
