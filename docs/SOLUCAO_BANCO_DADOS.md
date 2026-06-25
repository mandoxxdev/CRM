# 🔧 Solução: Banco de Dados Não Funcionando no Coolify

## Problema

O banco de dados SQLite não está sendo criado ou não está acessível no ambiente do Coolify, resultando em erro de login.

## ✅ Soluções

### Solução 1: Verificar Logs do Servidor (IMPORTANTE)

1. No Coolify, vá para seu projeto
2. Clique em **Logs** ou **Show Logs**
3. Procure por mensagens como:
   - `✅ Conectado ao banco de dados SQLite`
   - `✅ Usuário admin criado: admin@gmp.com.br / admin123`
   - `❌ Erro ao conectar ao banco de dados`
   - `⚠️ Pasta de build não encontrada`

**Se aparecer erro de banco de dados:**
- O problema é de permissões ou caminho
- Veja Solução 2

**Se não aparecer nenhuma mensagem sobre banco:**
- O servidor pode não estar iniciando corretamente
- Veja Solução 3

### Solução 2: Configurar Volume Persistente para o Banco de Dados

O banco SQLite precisa ser armazenado em um volume persistente no Docker.

1. No Coolify, vá para seu projeto
2. Procure por **Volumes** ou **Storage** ou **Persistent Storage**
3. Adicione um volume:
   - **Path no container:** `/app/server`
   - **Mount point:** (deixe o Coolify gerenciar)
   - **Type:** `bind` ou `volume`

**Alternativa:** Se não encontrar a opção de volumes, adicione no Dockerfile:

```dockerfile
# Criar diretório para banco de dados com permissões corretas
RUN mkdir -p /app/server/data && chmod 777 /app/server/data

# Variável de ambiente para caminho do banco
ENV DB_PATH=/app/server/data/database.sqlite
```

E modifique o `server/index.js` para usar a variável de ambiente:

```javascript
const dbPath = process.env.DB_PATH || path.join(__dirname, 'database.sqlite');
```

### Solução 3: Verificar Variáveis de Ambiente

No Coolify, verifique se estas variáveis estão configuradas:

1. Vá em **Settings** → **Environment Variables**
2. Verifique:
   - `NODE_ENV=production` ✅
   - `PORT=3000` ✅
   - `JWT_SECRET` (opcional, mas recomendado)

### Solução 4: Usuário Admin Padrão

O sistema cria automaticamente um usuário admin:

- **Email:** `admin@gmp.com.br`
- **Senha:** `admin123`

**Tente fazer login com essas credenciais!**

Se não funcionar, o banco não foi criado corretamente.

### Solução 5: Verificar Permissões no Dockerfile

Adicione ao Dockerfile para garantir permissões:

```dockerfile
# Garantir permissões para criar banco de dados
RUN chmod -R 777 /app/server || true
```

## 🔍 Diagnóstico Rápido

Execute estes comandos no terminal do Coolify (se disponível) ou verifique os logs:

1. **Verificar se o banco existe:**
   ```bash
   ls -la /app/server/database.sqlite
   ```

2. **Verificar permissões:**
   ```bash
   ls -la /app/server/
   ```

3. **Verificar se o servidor está rodando:**
   ```bash
   ps aux | grep node
   ```

## 📋 Checklist

- [ ] Logs do servidor mostram "✅ Conectado ao banco de dados SQLite"
- [ ] Logs mostram "✅ Usuário admin criado"
- [ ] Volume persistente configurado (se disponível)
- [ ] Variáveis de ambiente configuradas
- [ ] Tentou login com `admin@gmp.com.br` / `admin123`

## 🚨 Se Nada Funcionar

1. **Verifique os logs completos** do servidor no Coolify
2. **Copie os erros** e compartilhe
3. **Verifique se o container está rodando** (Status no Coolify)
4. **Tente reiniciar o deploy** no Coolify

## 💡 Dica

Se o banco não está sendo criado, pode ser que o diretório `/app/server` não tenha permissões de escrita. Nesse caso, você pode:

1. Modificar o caminho do banco para `/tmp/database.sqlite` (temporário, mas funciona)
2. Ou configurar um volume persistente no Coolify

---

**Próximo passo:** Verifique os logs do servidor no Coolify e me diga o que aparece!
