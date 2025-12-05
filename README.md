# CRM GMP - Sistema Premium de Gestão

Sistema completo de CRM (Customer Relationship Management) desenvolvido com React, TypeScript e IndexedDB. Totalmente responsivo e pronto para produção, com funcionalidades avançadas de gestão de clientes, produtos, vendas e análises.

## 🔐 Login

**Usuário Administrador:**
- Email: `matheus@gmp.ind.br`
- Senha: `597676`

> ⚠️ **Importante:** Apenas o administrador pode cadastrar novos usuários.

## 🚀 Funcionalidades Premium

### 📊 Dashboard Avançado
- **Gráficos Interativos**: Visualizações com Recharts (linha, barra, pizza, área)
- **Métricas em Tempo Real**: KPIs e estatísticas do negócio
- **Análise de Vendas**: Gráficos dos últimos 7 dias
- **Pipeline de Oportunidades**: Distribuição por etapa
- **Produtos Mais Vendidos**: Ranking automático

### 👥 Gestão de Clientes
- CRUD completo de clientes
- Busca avançada
- Histórico completo de interações
- Vinculação com contatos, oportunidades e vendas

### 📦 Gestão de Produtos
- Catálogo completo de produtos
- Controle de estoque automático
- Categorização
- Cálculo de margem de lucro
- Alertas de estoque baixo
- Múltiplas unidades de medida

### 💰 Sistema de Vendas
- Criação de vendas com múltiplos produtos
- Cálculo automático de totais
- Descontos por item e geral
- Múltiplas formas de pagamento
- Controle de status (pendente, paga, cancelada)
- Atualização automática de estoque
- Histórico completo de vendas

### 📈 Oportunidades de Negócio
- Pipeline completo de vendas
- Probabilidade de fechamento
- Valor esperado calculado
- Filtros por etapa
- Acompanhamento de fechamento

### 📅 Atividades e Tarefas
- Diferentes tipos de atividades (ligação, email, reunião, tarefa, nota)
- Controle de conclusão
- Vinculação com clientes e oportunidades
- Filtros e buscas

### 📊 Relatórios e Análises
- Gráficos de receita
- Análise de vendas por período
- Produtos mais vendidos
- Ticket médio
- Estatísticas de oportunidades

## 🛠️ Tecnologias

- **React 18**: Biblioteca JavaScript moderna
- **TypeScript**: Tipagem estática
- **Vite**: Build tool ultra-rápida
- **Tailwind CSS**: Design system responsivo
- **IndexedDB (Dexie)**: Banco de dados no navegador
- **Recharts**: Gráficos profissionais
- **Framer Motion**: Animações suaves
- **React Router**: Navegação SPA
- **Lucide React**: Ícones modernos
- **date-fns**: Manipulação de datas

## 📦 Instalação

### Pré-requisitos
- Node.js 18+ instalado
- npm ou yarn

### Passos

1. **Clone o repositório ou navegue até a pasta do projeto**

2. **Instale as dependências:**
   ```bash
   npm install
   ```

3. **Execute o projeto em modo desenvolvimento:**
   ```bash
   npm run dev
   ```

4. **Acesse no navegador:**
   ```
   http://localhost:5173
   ```

## 🏗️ Build para Produção

```bash
npm run build
```

Os arquivos otimizados estarão na pasta `dist`. Para visualizar:

```bash
npm run preview
```

## 💾 Banco de Dados

O sistema utiliza **IndexedDB** através da biblioteca **Dexie**, que oferece:

- ✅ Persistência local no navegador
- ✅ Performance superior ao LocalStorage
- ✅ Suporte a índices e queries complexas
- ✅ Transações ACID
- ✅ Dados permanecem entre sessões
- ✅ Sem necessidade de servidor

### Estrutura do Banco

- **Clientes**: Informações completas de clientes
- **Contatos**: Contatos vinculados a clientes
- **Produtos**: Catálogo completo com estoque
- **Vendas**: Histórico completo de vendas
- **Oportunidades**: Pipeline de negócios
- **Atividades**: Tarefas e interações

## 📱 Design Responsivo

O sistema foi desenvolvido com **mobile-first**, garantindo:

- ✅ Funcionalidade perfeita em smartphones
- ✅ Layout adaptável para tablets
- ✅ Experiência otimizada em desktop
- ✅ Menu hambúrguer no mobile
- ✅ Cards e formulários responsivos
- ✅ Gráficos adaptáveis

## 🎨 Design Premium

- Gradientes modernos
- Animações suaves com Framer Motion
- Cards com sombras e hover effects
- Cores profissionais
- Tipografia otimizada
- Transições fluidas

## 📂 Estrutura do Projeto

```
src/
├── components/        # Componentes reutilizáveis
│   ├── charts/       # Componentes de gráficos
│   └── Layout.tsx    # Layout principal
├── db/               # Configuração do banco de dados
│   └── database.ts   # Dexie database
├── pages/            # Páginas do sistema
│   ├── Dashboard.tsx
│   ├── Clientes.tsx
│   ├── Produtos.tsx
│   ├── Vendas.tsx
│   └── ...
├── types/            # Definições TypeScript
├── utils/            # Funções utilitárias
│   ├── dbService.ts  # Serviços do banco
│   ├── format.ts     # Formatação
│   └── helpers.ts    # Helpers
├── App.tsx           # Componente principal
├── main.tsx          # Ponto de entrada
└── index.css         # Estilos globais
```

## 🔑 Funcionalidades Principais

### Gestão de Produtos
- Cadastro com código, nome, categoria
- Preço de venda e custo
- Controle de estoque
- Múltiplas unidades (UN, KG, M, L, CX, PC)
- Status ativo/inativo
- Alertas de estoque baixo

### Sistema de Vendas
- Seleção de cliente
- Adição de múltiplos produtos
- Cálculo automático de totais
- Descontos por item e geral
- Formas de pagamento: Dinheiro, Cartão, PIX, Boleto, Transferência
- Atualização automática de estoque
- Numeração automática de vendas

### Dashboard
- 6 cards de métricas principais
- 4 gráficos interativos
- Ações rápidas
- Atualização em tempo real

## 🚀 Pronto para Produção

Este CRM está **100% funcional** e pronto para uso em produção:

- ✅ Banco de dados profissional (IndexedDB)
- ✅ Interface moderna e responsiva
- ✅ Gráficos e análises
- ✅ Controle completo de estoque
- ✅ Sistema de vendas completo
- ✅ Performance otimizada
- ✅ Código limpo e tipado
- ✅ Sem dependências de servidor

## 📝 Notas Importantes

- Os dados são armazenados **localmente no navegador**
- Cada navegador tem seus próprios dados
- Para backup, exporte os dados do IndexedDB
- Funciona offline após o primeiro carregamento

## 🔄 Próximas Melhorias (Opcional)

- Exportação de relatórios em PDF
- Importação de dados via CSV
- Sincronização com servidor
- Múltiplos usuários
- Notificações push
- App mobile nativo

## 📄 Licença

Este projeto foi desenvolvido para uso interno da empresa GMP.

## 🤝 Suporte

Para dúvidas ou sugestões, entre em contato com a equipe de desenvolvimento.

---

**Desenvolvido com ❤️ para GMP**
