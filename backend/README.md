# 🚀 Backend CRM GMP

API REST para o sistema CRM GMP com PostgreSQL.

## 📦 Instalação

```bash
cd backend
npm install
```

## 🔧 Configuração

1. Copie `.env.example` para `.env`:
```bash
cp .env.example .env
```

2. Configure a `DATABASE_URL` no `.env`:
```
DATABASE_URL="postgresql://usuario:senha@localhost:5432/crm_gmp?schema=public"
```

3. Execute as migrações:
```bash
npm run db:migrate
```

4. Gere o cliente Prisma:
```bash
npm run db:generate
```

## 🏃 Executar

### Desenvolvimento:
```bash
npm run dev
```

### Produção:
```bash
npm run build
npm start
```

## 📡 Endpoints

### Autenticação
- `POST /api/auth/login` - Login
- `POST /api/auth/register` - Registrar (apenas admin)

### Vendas
- `GET /api/vendas` - Listar vendas
  - `?todos=true` - Todas as vendas (apenas Diretoria)
  - `?meus=true` - Apenas minhas vendas
  - `?usuarioId=xxx` - Vendas de um usuário (apenas Diretoria)
- `GET /api/vendas/:id` - Buscar venda
- `POST /api/vendas` - Criar venda
- `PUT /api/vendas/:id` - Atualizar venda

### Clientes, Produtos, Oportunidades, Atividades
- Similar aos endpoints de vendas

## 🔐 Autenticação

Envie o token JWT no header:
```
Authorization: Bearer <token>
```

## 🗄️ Banco de Dados

Usa Prisma ORM com PostgreSQL.

Para visualizar dados:
```bash
npm run db:studio
```

