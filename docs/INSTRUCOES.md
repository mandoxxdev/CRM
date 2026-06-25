# 🚀 Instruções Rápidas - CRM GMP INDUSTRIAIS

## Instalação Rápida

1. **Instale todas as dependências:**
```bash
npm run install-all
```

Ou manualmente:
```bash
npm install
cd server && npm install && cd ..
cd client && npm install && cd ..
```

2. **Inicie o servidor e cliente:**
```bash
npm run dev
```

Isso iniciará:
- Backend na porta 5000
- Frontend na porta 3000

## Primeiro Acesso

1. Acesse: `http://localhost:3000`
2. Faça login com as credenciais fornecidas pelo administrador do sistema.

## Estrutura de Pastas

```
CRM GMP - FINAL/
├── server/          # Backend (Node.js/Express)
│   └── index.js    # Servidor principal
├── client/         # Frontend (React)
│   └── src/        # Código fonte React
└── package.json    # Scripts principais
```

## Comandos Úteis

- `npm run dev` - Inicia servidor e cliente juntos
- `npm run server` - Apenas o servidor
- `npm run client` - Apenas o cliente
- `npm run build` - Build de produção do frontend

## Funcionalidades Principais

✅ **Clientes** - Cadastro completo de clientes industriais
✅ **Projetos** - Gestão de projetos Turn Key
✅ **Propostas** - Criação e gestão de propostas comerciais
✅ **Oportunidades** - Pipeline de vendas
✅ **Atividades** - Gestão de tarefas e compromissos
✅ **Dashboard** - Visão geral com estatísticas

## Banco de Dados

O banco de dados SQLite é criado automaticamente na primeira execução em:
`server/database.sqlite`

## Personalização

- **Segmentos:** Edite a lista em `client/src/components/ClienteForm.js`
- **Cores:** Modifique os arquivos CSS em `client/src/components/`
- **Campos:** Adicione campos nas tabelas e formulários conforme necessário

## Suporte

Em caso de problemas:
1. Verifique se Node.js está instalado (versão 14+)
2. Verifique se as portas 3000 e 5000 estão livres
3. Verifique os logs no terminal

---

**Desenvolvido para GMP INDUSTRIAIS** 🏭




