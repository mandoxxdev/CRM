# CRM GMP INDUSTRIAIS

Sistema completo de gestão de relacionamento com clientes (CRM) desenvolvido especificamente para a GMP INDUSTRIAIS, empresa especializada em projetos Turn Key para diversos segmentos industriais.

## 🏢 Sobre a GMP INDUSTRIAIS

A GMP INDUSTRIAIS é uma empresa brasileira com mais de 35 anos de experiência no mercado, especializada na implantação de projetos "Turn Key" para diversos segmentos industriais:

- Tintas & Vernizes
- Químico
- Cosméticos
- Alimentícios
- Domissanitários
- Saneantes

## 🚀 Funcionalidades

### Gestão de Clientes
- Cadastro completo de clientes com informações empresariais
- Filtros por segmento e busca avançada
- Histórico de relacionamento

### Gestão de Projetos
- Controle completo de projetos Turn Key
- Acompanhamento de status e prazos
- Vinculação com clientes

### Propostas Comerciais
- Criação de propostas detalhadas
- Gestão de itens e valores
- Controle de status e validade

### Oportunidades de Negócio
- Pipeline de vendas
- Acompanhamento de etapas
- Probabilidade de fechamento
- Valor estimado

### Atividades
- Gestão de tarefas e compromissos
- Agendamento de reuniões e visitas
- Controle de atividades por cliente/projeto

### Dashboard
- Visão geral do negócio
- Estatísticas e métricas
- Gráficos e relatórios

## 🛠️ Tecnologias

### Backend
- Node.js
- Express.js
- SQLite (banco de dados)
- JWT (autenticação)
- bcryptjs (criptografia de senhas)

### Frontend
- React
- React Router
- Axios
- Recharts (gráficos)
- React Icons
- date-fns

## 📦 Instalação

### Pré-requisitos
- Node.js (versão 14 ou superior)
- npm ou yarn

### Passos

1. **Clone o repositório ou navegue até a pasta do projeto**

2. **Instale as dependências do projeto raiz:**
```bash
npm install
```

3. **Instale as dependências do servidor:**
```bash
cd server
npm install
```

4. **Instale as dependências do cliente:**
```bash
cd ../client
npm install
```

5. **Configure as variáveis de ambiente:**
```bash
cd ../server
cp .env.example .env
```
Edite o arquivo `.env` e configure o `JWT_SECRET` (em produção, use uma chave segura).

## 🚀 Executando o Projeto

### Desenvolvimento

Para executar o servidor e o cliente simultaneamente:

```bash
# Na raiz do projeto
npm run dev
```

Ou execute separadamente:

**Servidor (Backend):**
```bash
cd server
npm run dev
```
O servidor estará disponível em `http://localhost:5000`

**Cliente (Frontend):**
```bash
cd client
npm start
```
O cliente estará disponível em `http://localhost:3000`

### Produção

1. **Build do frontend:**
```bash
cd client
npm run build
```

2. **Inicie o servidor:**
```bash
cd server
npm start
```

## 🔐 Credenciais Padrão

**Usuário Administrador:**
- Email: `admin@gmp.com.br`
- Senha: `admin123`

⚠️ **IMPORTANTE:** Altere a senha padrão após o primeiro acesso em produção!

## 📁 Estrutura do Projeto

```
crm-gmp-industriais/
├── server/                 # Backend
│   ├── index.js           # Servidor principal
│   ├── package.json
│   └── database.sqlite    # Banco de dados (criado automaticamente)
├── client/                # Frontend
│   ├── public/
│   ├── src/
│   │   ├── components/    # Componentes React
│   │   ├── context/       # Context API
│   │   └── services/      # Serviços API
│   └── package.json
├── package.json
└── README.md
```

## 📊 Banco de Dados

O sistema utiliza SQLite e cria automaticamente as seguintes tabelas:

- `usuarios` - Usuários do sistema
- `clientes` - Cadastro de clientes
- `projetos` - Projetos Turn Key
- `propostas` - Propostas comerciais
- `proposta_itens` - Itens das propostas
- `oportunidades` - Oportunidades de negócio
- `atividades` - Atividades e tarefas

## 🔄 API Endpoints

### Autenticação
- `POST /api/auth/login` - Login

### Clientes
- `GET /api/clientes` - Listar clientes
- `GET /api/clientes/:id` - Obter cliente
- `POST /api/clientes` - Criar cliente
- `PUT /api/clientes/:id` - Atualizar cliente
- `DELETE /api/clientes/:id` - Desativar cliente

### Projetos
- `GET /api/projetos` - Listar projetos
- `GET /api/projetos/:id` - Obter projeto
- `POST /api/projetos` - Criar projeto
- `PUT /api/projetos/:id` - Atualizar projeto

### Propostas
- `GET /api/propostas` - Listar propostas
- `GET /api/propostas/:id` - Obter proposta
- `POST /api/propostas` - Criar proposta

### Oportunidades
- `GET /api/oportunidades` - Listar oportunidades
- `POST /api/oportunidades` - Criar oportunidade
- `PUT /api/oportunidades/:id` - Atualizar oportunidade

### Atividades
- `GET /api/atividades` - Listar atividades
- `POST /api/atividades` - Criar atividade
- `PUT /api/atividades/:id` - Atualizar atividade

### Dashboard
- `GET /api/dashboard` - Estatísticas do dashboard

## 🎨 Personalização

O sistema foi desenvolvido especificamente para a GMP INDUSTRIAIS, mas pode ser facilmente personalizado:

- Cores e tema: Edite os arquivos CSS em `client/src/components/`
- Segmentos: Modifique a lista de segmentos nos componentes de formulário
- Campos adicionais: Adicione campos nas tabelas do banco e nos formulários

## 📝 Licença

Este projeto foi desenvolvido para uso interno da GMP INDUSTRIAIS.

## 🤝 Suporte

Para dúvidas ou suporte, entre em contato com a equipe de desenvolvimento.

---

**Desenvolvido com ❤️ para GMP INDUSTRIAIS**




