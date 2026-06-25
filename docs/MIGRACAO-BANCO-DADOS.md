# 🗄️ Migração para Banco de Dados no Servidor

## 📋 Objetivo

Migrar de IndexedDB (banco local) para um banco de dados no servidor para:
- ✅ Compartilhar dados entre usuários
- ✅ Consultar vendas de outros usuários
- ✅ Filtrar dados de todos os usuários
- ✅ Centralizar informações
- ✅ Backup automático
- ✅ Sincronização em tempo real

---

## 🏗️ Arquitetura Proposta

### Opção 1: Node.js + Express + PostgreSQL (Recomendado)

**Vantagens:**
- ✅ SQL robusto e confiável
- ✅ Relacionamentos bem definidos
- ✅ Escalável
- ✅ Gratuito (Supabase, Railway, Render)

**Stack:**
- Backend: Node.js + Express + TypeScript
- Banco: PostgreSQL
- ORM: Prisma ou TypeORM
- Autenticação: JWT
- Hospedagem: Vercel (API) + Supabase (DB) ou Railway/Render

### Opção 2: Node.js + Express + MongoDB

**Vantagens:**
- ✅ Flexível (NoSQL)
- ✅ Fácil de começar
- ✅ MongoDB Atlas gratuito

**Stack:**
- Backend: Node.js + Express + TypeScript
- Banco: MongoDB
- ODM: Mongoose
- Autenticação: JWT
- Hospedagem: Vercel (API) + MongoDB Atlas (DB)

### Opção 3: Firebase (Mais Rápido)

**Vantagens:**
- ✅ Backend completo pronto
- ✅ Autenticação integrada
- ✅ Real-time automático
- ✅ Gratuito até certo limite

**Stack:**
- Backend: Firebase (Firestore + Functions)
- Banco: Firestore
- Autenticação: Firebase Auth
- Hospedagem: Firebase Hosting

---

## 🚀 Implementação Recomendada: Node.js + PostgreSQL

### Estrutura do Projeto

```
crm-gmp/
├── frontend/          # React app atual
├── backend/          # Nova pasta
│   ├── src/
│   │   ├── routes/   # Rotas da API
│   │   ├── controllers/
│   │   ├── models/   # Modelos do banco
│   │   ├── middleware/
│   │   ├── services/
│   │   └── utils/
│   ├── prisma/       # Schema do Prisma
│   └── package.json
└── package.json      # Root
```

---

## 📦 Próximos Passos

1. **Criar estrutura do backend**
2. **Configurar banco de dados (PostgreSQL)**
3. **Criar API REST**
4. **Implementar autenticação JWT**
5. **Migrar serviços do frontend para API**
6. **Atualizar frontend para usar API**

---

## 🔐 Sistema de Permissões

### Níveis de Acesso:
- **Diretoria**: Ver tudo de todos
- **Comercial**: Ver vendas próprias + estatísticas gerais
- **Outros perfis**: Ver apenas próprios dados

### Filtros:
- `/api/vendas?usuarioId=123` - Vendas de um usuário
- `/api/vendas?todos=true` - Todas as vendas (apenas Diretoria)
- `/api/vendas?meus=true` - Apenas minhas vendas

---

**Qual opção você prefere? Recomendo Opção 1 (PostgreSQL) para máxima flexibilidade.**

