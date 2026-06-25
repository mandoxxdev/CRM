# 📦 Instalação do Backend

## Opção 1: Supabase (Recomendado - Gratuito)

### 1. Criar conta no Supabase
1. Acesse: https://supabase.com
2. Crie uma conta gratuita
3. Crie um novo projeto
4. Anote a `DATABASE_URL` (Settings > Database > Connection string)

### 2. Configurar Backend
```bash
cd backend
npm install
cp .env.example .env
```

Edite `.env`:
```
DATABASE_URL="sua-url-do-supabase"
JWT_SECRET="seu-secret-aqui"
```

### 3. Executar Migrações
```bash
npm run db:migrate
npm run db:generate
```

### 4. Iniciar Servidor
```bash
npm run dev
```

---

## Opção 2: Railway (Gratuito)

1. Acesse: https://railway.app
2. Crie conta
3. New Project > Database > PostgreSQL
4. Copie `DATABASE_URL`
5. Siga passos 2-4 da Opção 1

---

## Opção 3: Render (Gratuito)

1. Acesse: https://render.com
2. Crie conta
3. New > PostgreSQL
4. Copie `DATABASE_URL`
5. Siga passos 2-4 da Opção 1

---

## 🚀 Deploy do Backend

### Vercel (Recomendado)
1. Instale Vercel CLI: `npm i -g vercel`
2. No diretório `backend`: `vercel`
3. Configure variáveis de ambiente no dashboard

### Railway
1. Conecte repositório GitHub
2. Configure `DATABASE_URL` e `JWT_SECRET`
3. Deploy automático

---

## ✅ Próximos Passos

1. ✅ Backend configurado
2. ⏳ Atualizar frontend para usar API
3. ⏳ Testar integração
4. ⏳ Deploy completo

