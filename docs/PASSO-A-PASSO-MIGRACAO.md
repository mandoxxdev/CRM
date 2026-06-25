# 🚀 Passo a Passo: Migração para Banco de Dados

## 1️⃣ Configurar Banco de Dados

### Opção A: Supabase (Recomendado - Gratuito)

1. Acesse: https://supabase.com
2. Crie conta e novo projeto
3. Vá em **Settings > Database**
4. Copie a **Connection string** (URI)
5. Formato: `postgresql://postgres:[SENHA]@db.[PROJETO].supabase.co:5432/postgres`

### Opção B: Railway

1. Acesse: https://railway.app
2. New Project > Database > PostgreSQL
3. Copie `DATABASE_URL`

---

## 2️⃣ Configurar Backend

```bash
cd backend
npm install
```

Crie arquivo `.env`:
```env
DATABASE_URL="sua-url-do-banco"
JWT_SECRET=
PORT=3000
```

---

## 3️⃣ Executar Migrações

```bash
# Gerar cliente Prisma
npm run db:generate

# Criar tabelas no banco
npm run db:migrate

# Popular com usuário admin
npm run db:seed
```

---

## 4️⃣ Testar Backend

```bash
npm run dev
```

Acesse: http://localhost:3000/api/health

Deve retornar: `{"status":"ok",...}`

---

## 5️⃣ Testar Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<seu-email>","senha":"<sua-senha>"}'
```

Use credenciais configuradas via seed (`SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` nas variáveis de ambiente).

---

## 6️⃣ Configurar Frontend

Crie `.env` na raiz do projeto:
```
VITE_API_URL=http://localhost:3000/api
```

---

## 7️⃣ Atualizar Login

Edite `src/pages/Login.tsx` para usar `apiAuth.login()` (veja `COMO-USAR-API.md`)

---

## 8️⃣ Migrar Módulos Gradualmente

1. **Vendas** (prioridade)
2. **Clientes**
3. **Produtos**
4. **Oportunidades**
5. **Atividades**

---

## 9️⃣ Deploy

### Backend (Vercel):
```bash
cd backend
vercel
```

### Frontend (Netlify):
Já está configurado! Só atualizar `VITE_API_URL` no Netlify.

---

## ✅ Checklist

- [ ] Banco de dados criado
- [ ] Backend configurado
- [ ] Migrações executadas
- [ ] Seed executado (usuário admin criado)
- [ ] Backend testado localmente
- [ ] Frontend configurado com `VITE_API_URL`
- [ ] Login atualizado para usar API
- [ ] Primeiro módulo migrado (Vendas)
- [ ] Deploy do backend
- [ ] Deploy do frontend atualizado

---

**Boa sorte! 🎯**

