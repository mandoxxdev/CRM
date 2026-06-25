# Resumo de Implementações — Orion CRM / GMP

**Documento gerado em:** 23 de junho de 2026  
**Período de desenvolvimento coberto:** 22 e 23 de junho de 2026 (sessão atual)  
**Ambiente de produção:** [https://systemgmp.online](https://systemgmp.online)  
**Público:** equipe GMP INDUSTRIAIS

---

## 1. Visão geral

O **Orion CRM** é o sistema integrado de gestão da GMP INDUSTRIAIS. Nesta sessão de desenvolvimento, o foco principal foi a consolidação do **módulo Almoxarifado v3**, a expansão das **requisições de material em todos os módulos**, o **chat interno** estilo WhatsApp e melhorias significativas de **UI/UX** com identidade Orion.

### Stack tecnológica

| Camada | Tecnologia |
|--------|------------|
| Frontend | React (SPA), React Router, React Icons, date-fns |
| Backend | Node.js + Express |
| Banco de dados | SQLite (`server/data/database.sqlite`) |
| Tempo real | Socket.IO (chat) |
| E-mail | Nodemailer (alertas, lembretes, compras) |
| Deploy | Docker + Coolify, build do client dentro do container |

### Arquitetura resumida

```
Browser (React)  →  API REST /api/*  →  Express + SQLite
                 →  WebSocket (chat)
                 →  Arquivos persistentes em server/data/
```

O banco e uploads (fotos de materiais, imagens do chat, etc.) ficam em **`server/data/`**, pasta pensada para volume persistente no servidor.

---

## 2. Módulo Almoxarifado

O módulo Almoxarifado v3 cobre o ciclo completo de materiais, estoque, requisições, recebimentos e configurações administrativas.

### 2.1 Cadastro de materiais, famílias e localizações

**Materiais**
- Cadastro e edição com foto (upload via `/api/almoxarifado/materiais/:id/foto`)
- Vínculo obrigatório a **família** no cadastro novo; código gerado automaticamente por família (`/api/almoxarifado/proximo-codigo`)
- Campos de estoque mínimo/máximo, custo, localização padrão, tipo de material e categoria
- Listagem com filtros, busca e visualização de foto corrigida (`resolveMaterialPhotoUrl`)

**Famílias de material**
- CRUD em Configurações → aba **Famílias**
- Classificação **tipo de uso**: administrativo, industrial ou ambos
- Prefixo de código por família (ex.: PAR, ROL, VAL para industrial)

**Localizações — wizard em 4 passos**
- Aba **Localizações** em Configurações
- Passo 1: escolher setor/corredor
- Passo 2: posição raiz ou dentro de estrutura existente (pai)
- Passo 3: tipo de área (Prateleira, Gaveta, Box, etc.) ou **subgrupo** (ex.: A1, A2)
- Passo 4: confirmação com código e descrição auto-gerados
- **Auto-código**: padrão `PREFIXO-NN` com prefixo do setor ou da estrutura pai
- **Subgrupo**: letras+número, com validação de duplicidade no mesmo pai/setor

**Tipos de material**
- Cadastro configurável (EPI, Ferramenta, Consumível, etc.)
- Permissões por setor requisitante na aba **Materiais por Setor**

### 2.2 Setores configuráveis e mapa de áreas

**Setores e áreas**
- Tipos: Corredor, Área, Bancada
- Prefixo de código por setor
- Seed automático de setores ligados aos módulos (Produção, Compras, Engenharia, etc.)

**Mapa de localizações** (`/almoxarifado/mapa`)
- Visualização SVG por setor com materiais em cada posição
- Modo edição (somente admin): arrastar e soltar com **snap-to-grid**
- Grade configurável por setor; evita sobreposição de células
- Persistência de posição via `PUT /api/almoxarifado/mapa/localizacoes/posicoes`

### 2.3 Requisições — fluxo completo

**Status do ciclo de vida**
1. `PENDENTE` — aguardando aprovação do almoxarifado
2. `AGUARDANDO_APROVACAO_VALOR` — quando valor total excede limite configurado
3. `APROVADO` — liberado para separação
4. `EM_SEPARACAO` — almoxarife separando itens
5. `PARCIALMENTE_ATENDIDA` — entrega parcial (estoque insuficiente)
6. `ATENDIDA` / `CANCELADA` / `REJEITADA`

**Funcionalidades**
- Criação pelo almoxarifado ou por outros módulos (ver seção 3)
- **Entrega parcial**: baixa só a quantidade entregue; pendente permanece para nova rodada
- Bloqueio de separação/entrega acima do estoque disponível
- Exclusão por admin com estorno automático de estoque já baixado
- Painel de requisições no dashboard e lista dedicada (`/almoxarifado/requisicoes`)
- Filtros por status, setor, solicitante e período

**Aprovação por valor**
- Quando ativa, requisições acima do limite (R$) ficam em `AGUARDANDO_APROVACAO_VALOR`
- Aprovadores configuráveis (usuários do sistema)
- Bloqueio de separação até aprovação; reprovação com motivo
- E-mail HTML aos aprovadores

### 2.4 Recebimentos de NF — fluxo Faturamento

Tela **Recebimentos** (`/almoxarifado/recebimentos`) com workflow alinhado ao processo documental da GMP:

| Etapa | Status | Responsável típico |
|-------|--------|-------------------|
| Almoxarifado | RECEBIDO → EM_CONFERENCIA → CONFERIDO_ALMOX | Almoxarife |
| Compras | EM_COMPRAS | Compras |
| Faturamento | ENCAMINHADO_FATURAMENTO → EM_ENTRADA_NF | Faturamento |
| Conclusão | PROCESSADO | Gera conta a pagar |

**Ações de workflow** (`POST /api/almoxarifado/recebimentos/:id/workflow`):
- `iniciar_conferencia`, `finalizar_conferencia`
- `encaminhar_compras`, `finalizar_compras`
- `iniciar_faturamento`, `processar` (gera registro em **Contas a Pagar** quando módulo financeiro disponível)

Inclui conferência de itens, inspeção, dados fiscais da NF e vínculo com pedido de compra/fornecedor.

### 2.5 Alertas de estoque e e-mails HTML

- Disparo automático quando saldo **cruza** de acima para no/abaixo do mínimo (não repete enquanto permanecer abaixo)
- E-mail em **HTML** com layout Orion (tabela de materiais, link para o sistema)
- Opcional: notificação via **webhook WhatsApp**
- Configuração SMTP dedicada (separada do restante do sistema)
- Teste de envio e verificação manual via API
- URL base padrão: `https://systemgmp.online/almoxarifado`

### 2.6 Configurações do módulo

Acesso: **Almoxarifado → Configurações** (`/almoxarifado/configuracoes`) — **somente administradores**.

| Aba | Conteúdo |
|-----|----------|
| Tipos de Material | CRUD de tipos |
| Famílias | CRUD + tipo de uso ADM/IND |
| Materiais por Setor | Permissões de quais materiais cada setor pode requisitar |
| Estoques Mínimos | Ajuste em lote de mínimos |
| Setores e Áreas | CRUD de setores físicos |
| Localizações | Wizard + lista + edição |
| Alertas de Estoque | SMTP, destinatários, WhatsApp, intervalo |
| Liberação por Valor | Limite R$, aprovadores, ativar/desativar |
| Configurações Gerais | SMTP global almox, e-mails compras, lembretes, URL do sistema |

### 2.7 Outras funcionalidades do almoxarifado

- **Dashboard** com KPIs, requisições pendentes, consumo por OS e materiais mais consumidos
- **Movimentações** de estoque (entrada, saída, transferência, cancelamento)
- **Conferência de estoque** (inventário cíclico)
- **Reservas** por OS
- Devoluções, sobras, ferramentas/ empréstimos, materiais de cliente
- **Auditoria** de operações
- Relatórios (`/api/almoxarifado/relatorios/:tipo`)

### 2.8 Perfis internos do almoxarifado

Perfis no backend (`permissions.js`): ADMINISTRADOR, ALMOXARIFE, COMPRAS, PRODUCAO, ENGENHARIA, GESTOR, CONSULTA — controlam ações como movimentar, receber, aprovar, configurar.

---

## 3. Requisições cross-módulo

As requisições de material foram estendidas para **todos os módulos** com comportamento adaptado ao tipo de setor.

### 3.1 Cesta ADM vs formulário fábrica

| Tipo | Módulos | Interface |
|------|---------|-----------|
| **Cesta (catálogo)** | Comercial, Admin, Administrativo, Compras, Financeiro, Engenharia, etc. | `RequisicaoMaterialCesta` — navegação tipo e-commerce, carrinho lateral |
| **Formulário industrial** | Produção (Fábrica), Frota/Manutenção | `RequisicaoForm` — busca e linhas de itens |

O admin pode **redefinir o tipo** de cada módulo na tela de seleção de módulos (modal industrial/administrativo).

### 3.2 Isolamento materiais ADM / industrial

- Setores classificados como **administrativo** ou **industrial**
- Famílias e categorias com `tipo_uso` (administrativo, industrial, ambos)
- API `/api/requisicoes-material/materiais?setor=...` retorna apenas materiais permitidos para aquele setor
- Aba **Materiais por Setor** permite ajuste fino de permissões

### 3.3 Disponibilidade de estoque (sem quantidade)

Requisitantes **não veem** quantidade exata, custo nem saldo numérico.

Exibem apenas badges:
- **Em estoque** — saldo suficiente para a quantidade solicitada
- **Parcial** — há estoque, mas insuficiente
- **Sem estoque** — saldo zero

Endpoint: `POST /api/requisicoes-material/disponibilidade`

### 3.4 E-mail automático para Compras

Quando uma requisição é criada com itens sem estoque completo:
- E-mail HTML automático para destinatários configurados em **Configurações Gerais → E-mails Compras**
- Assunto: `Solicitação de compra — Requisição {número} — {setor}`
- Lista itens com situação (sem expor quantidade de estoque ao compras na mensagem de disponibilidade)

### 3.5 Lembretes diários

- Requisições `PENDENTE` sem resposta do aprovador recebem lembrete por e-mail
- Intervalo configurável (padrão: 24 horas)
- Não reenvia antes do intervalo; desativável
- Processamento: cron externo ou `POST /api/almoxarifado/requisicoes/processar-lembretes`

### 3.6 Rotas por módulo

Cada módulo possui:
- `{modulo}/requisicoes-material/nova` — nova requisição
- `{modulo}/requisicoes-material` — minhas requisições

Exemplos: `/fabrica/requisicoes-material`, `/compras/requisicoes-material`, `/admin/requisicoes-material`.

---

## 4. Chat interno

Chat corporativo integrado ao Orion, inspirado no WhatsApp.

### Funcionalidades
- Conversas **diretas** e **grupos**
- Mensagens de texto em tempo real (Socket.IO)
- Envio de **imagens** (`POST /api/chat/conversas/:id/mensagens/imagem`)
- Indicador de digitação, contagem de **não lidas**, marcar como lido
- Separadores de data (Hoje, Ontem)
- Busca de usuários e participantes
- Persistência em SQLite (`chat_conversas`, `chat_mensagens`, etc.)
- Arquivos em `server/data/uploads/chat/`

### Acesso
- Rota: `/chat`
- Disponível na navegação principal para usuários autenticados

---

## 5. UI/UX

### 5.1 Tela de seleção de módulos (estilo Spotify)
- Layout em cards com gradientes por módulo
- Busca de módulos, **módulos recentes** (localStorage)
- Logo GMP (`/logo.png`) e constelação Orion
- Tema claro refinado (`TipoSelecao.css`, overrides em `glass-override.css`)
- Splash animado ao entrar em cada módulo

### 5.2 Intro Orion 3D
- `OrionIntro` na primeira visita (WebGL com cena 3D do pássaro Orion)
- Fallback SVG animado quando WebGL indisponível
- Duração ~3,5 s, barra de progresso, opção de pular

### 5.3 Admin como módulo (engrenagem)
- Módulo **Admin** na grade de seleção (ícone engrenagem / `FiSliders`)
- Menu próprio: Usuários, Permissões, Requisições de material
- Badge "Administrador" na tela de módulos
- Admin pode alternar tipo industrial/administrativo de qualquer módulo

### 5.4 Almoxarifado
- CSS dedicado (`Almoxarifado.css`), cabeçalho padronizado (`AlmoxPageHeader`)
- Dashboard com cards e atalhos
- Configurações com abas e wizard visual

---

## 6. Permissões

### 6.1 Módulo almoxarifado no cadastro de usuários
- **Admin → Usuários → Novo/Editar**
- Checkbox do módulo **Almoxarifado** na lista de módulos permitidos
- Sem o módulo marcado, o usuário não acessa `/almoxarifado` (`ProtectedModuleRoute`)

### 6.2 Configurações somente admin
- Tela `/almoxarifado/configuracoes` bloqueada para não-admin (mensagem com escudo)
- Item de menu Configurações no almoxarifado com flag `adminOnly: true`
- Mapa — salvar posições: apenas `role === 'admin'`

### 6.3 Perfis almoxarifado (backend)
- Tabela `perfil_almoxarifado_usuario` para perfil fino (ALMOXARIFE, PRODUCAO, etc.)
- Admins do sistema (`role: admin`) têm perfil ADMINISTRADOR automaticamente

---

## 7. Correções importantes

| Problema | Solução |
|--------|---------|
| **Crash do servidor na migration** | `initSchema` com `safeAlter`, tabelas base antes das migrations v3, controle `schema_migrations_almoxarifado`, retry em `runInitSchemaWithRetry` (até 3 tentativas) |
| **API bloqueada com dbReady=false** | Middleware passa a permitir requisições durante migrations para evitar travamento permanente |
| **Erro JSX em componentes** | Correções de sintaxe em listas e formulários de requisições durante refatoração do chat e almoxarifado |
| **Imagens de materiais quebradas** | Serviço `materialPhoto.js`, rota estática `/api/uploads/almoxarifado/`, helper `resolveMaterialPhotoUrl` no client |
| **Entrega parcial com estoque insuficiente** | Lógica revisada em `requisitionService` com testes de regressão (REQ-45657788) |
| **Isolamento de catálogo por setor** | `sectorMaterialService` + filtros na API cross-módulo |
| **Build Docker / memória** | `NODE_OPTIONS=--max-old-space-size=1536`, ESLint desabilitado no build de produção |

---

## 8. APIs principais

### Almoxarifado — materiais e configuração
```
GET    /api/almoxarifado/materiais
POST   /api/almoxarifado/materiais
PUT    /api/almoxarifado/materiais/:id
POST   /api/almoxarifado/materiais/:id/foto
GET    /api/almoxarifado/proximo-codigo
GET    /api/almoxarifado/familias
GET    /api/almoxarifado/localizacoes
GET    /api/almoxarifado/setores
GET    /api/almoxarifado/configuracoes
PUT    /api/almoxarifado/configuracoes
GET    /api/almoxarifado/configuracoes/alertas-estoque
PUT    /api/almoxarifado/configuracoes/alertas-estoque
GET    /api/almoxarifado/configuracoes/liberacao-valor
PUT    /api/almoxarifado/configuracoes/liberacao-valor
```

### Almoxarifado — estoque e mapa
```
GET    /api/almoxarifado/estoque
POST   /api/almoxarifado/movimentacoes/v2
GET    /api/almoxarifado/mapa/localizacoes
PUT    /api/almoxarifado/mapa/localizacoes/posicoes
GET    /api/almoxarifado/dashboard
```

### Almoxarifado — requisições
```
GET    /api/almoxarifado/requisicoes
POST   /api/almoxarifado/requisicoes
PUT    /api/almoxarifado/requisicoes/:id/aprovar
PUT    /api/almoxarifado/requisicoes/:id/separar
PUT    /api/almoxarifado/requisicoes/:id/entregar
PUT    /api/almoxarifado/requisicoes/:id/aprovar-valor
POST   /api/almoxarifado/requisicoes/processar-lembretes
```

### Almoxarifado — recebimentos
```
GET    /api/almoxarifado/recebimentos
POST   /api/almoxarifado/recebimentos
PUT    /api/almoxarifado/recebimentos/:id/conferir
POST   /api/almoxarifado/recebimentos/:id/workflow
POST   /api/almoxarifado/recebimentos/:id/processar
```

### Requisições cross-módulo
```
GET    /api/requisicoes-material/setores
GET    /api/requisicoes-material/materiais?setor=...
POST   /api/requisicoes-material/disponibilidade
GET    /api/requisicoes-material
POST   /api/requisicoes-material
```

### Chat
```
GET    /api/chat/conversas
POST   /api/chat/conversas/direta
POST   /api/chat/conversas/grupo
GET    /api/chat/conversas/:id/mensagens
POST   /api/chat/conversas/:id/mensagens
POST   /api/chat/conversas/:id/mensagens/imagem
GET    /api/chat/nao-lidas
```

### Configuração global de tipos de módulo
```
GET    /api/config/modulos-tipo
PUT    /api/config/modulos-tipo/:moduloId
```

### Saúde
```
GET    /api/health
```

---

## 9. Configurações para o usuário — passo a passo

### 9.1 Liberar acesso ao Almoxarifado para um colaborador
1. Entrar como **admin**
2. Ir em **Admin → Usuários**
3. Editar o usuário (ou criar novo)
4. Marcar o módulo **Almoxarifado** nas permissões
5. Salvar

### 9.2 Configurar famílias e tipos de material
1. **Almoxarifado → Configurações**
2. Aba **Tipos de Material** — cadastrar tipos usados na empresa
3. Aba **Famílias** — criar famílias com prefixo e tipo ADM/IND
4. Cadastrar materiais em **Almoxarifado → Materiais → Novo** (escolher família; código é gerado)

### 9.3 Configurar setores físicos e localizações
1. **Configurações → Setores e Áreas** — criar corredores/áreas com prefixo
2. **Configurações → Localizações** — usar **Nova localização (wizard)** em 4 passos
3. **Almoxarifado → Mapa** — arrastar posições no modo edição (admin) para organizar visualmente

### 9.4 Definir quais materiais cada setor pode pedir
1. **Configurações → Materiais por Setor**
2. Selecionar setor (ex.: Compras, Produção)
3. Ajustar permissões por família/categoria ou em lote (administrativas/industriais)

### 9.5 Alertas de estoque (e-mail)
1. **Configurações → Alertas de Estoque**
2. Preencher SMTP (host, porta, usuário, senha, remetente)
3. Informar e-mails e/ou números WhatsApp (webhook)
4. Definir URL do sistema (`https://systemgmp.online`)
5. Usar **Testar envio** para validar

### 9.6 E-mail automático para Compras (requisições sem estoque)
1. **Configurações → Configurações Gerais**
2. Campo **E-mails para notificar Compras** (lista separada por vírgula)
3. Salvar — dispara automaticamente ao criar requisição com itens sem estoque completo

### 9.7 Lembretes de requisições pendentes
1. **Configurações → Configurações Gerais**
2. Ativar **Lembretes de requisições pendentes**
3. Definir intervalo em horas (ex.: 24)
4. Configurar e-mails dos aprovadores (mesma seção de notificações de requisição)
5. Agendar chamada diária ao endpoint de lembretes no servidor (ou acionar manualmente)

### 9.8 Liberação por valor
1. **Configurações → Liberação por Valor**
2. Ativar regra
3. Definir **limite em R$**
4. Selecionar **aprovadores** (usuários)
5. Requisições acima do limite exigirão aprovação antes da separação

### 9.9 Recebimento de NF
1. **Almoxarifado → Recebimentos → Novo**
2. Informar NF, fornecedor e itens
3. Avançar workflow: conferência → compras → faturamento → processar
4. Ao processar, conta a pagar é gerada no financeiro (quando integrado)

### 9.10 Alterar tipo de módulo (cesta vs fábrica)
1. Na **tela de seleção de módulos**, admin clica no ícone de tipo do módulo
2. Escolhe **Administrativo** (cesta) ou **Industrial** (formulário)
3. Alteração vale para todos os usuários

---

## 10. Deploy

### Ambiente
- **URL:** [https://systemgmp.online](https://systemgmp.online)
- **Plataforma:** Coolify com **Dockerfile** customizado (não usar Nixpacks)
- **Porta:** 3000
- **Health check:** `/api/health`

### Volumes persistentes (obrigatório)
Montar volume no container para não perder dados entre deploys:

| Caminho no container | Conteúdo |
|---------------------|----------|
| `/app/server/data` | `database.sqlite`, uploads (materiais, chat, etc.) |

No Coolify: **Volumes / Persistent Storage** → path `/app/server/data`.

O código usa `PERSISTENT_DATA_DIR = server/data` e `database.sqlite` dentro dessa pasta.

### Variáveis de ambiente recomendadas
```env
NODE_ENV=production
PORT=3000
JWT_SECRET=
```

Opcional: `APP_URL=https://systemgmp.online` para links em e-mails.

### Restart após deploy
1. Coolify executa build (client + server no Docker)
2. Container inicia com `node index.js` em `/app/server`
3. Migrations do almoxarifado rodam automaticamente na subida
4. Se o banco não existir, é criado em `data/database.sqlite`
5. Usuário padrão (se seed ativo): configure via variáveis de ambiente (`SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`) — **alterar senha em produção**

### Atualização sem perder dados
- Garantir volume persistente **antes** do primeiro deploy em produção
- Novos deploys substituem código, mas preservam `data/`
- Em caso de erro de banco, ver documento `SOLUCAO_BANCO_DADOS.md` no repositório

---

## 11. Testes

### Almoxarifado
```bash
cd server
npm run test:almoxarifado
```

**Resultado atual: 43 testes passando, 0 falhas.**

Cobertura inclui:
- Movimentações, reservas, transferências, devoluções
- Recebimentos e workflow NF até contas a pagar
- Requisições (parcial, estorno, exclusão admin)
- Alertas de estoque
- Mapa e localização padrão
- Filtro por setor ADM/IND
- Lembretes de requisição
- Liberação por valor (aprovação, reprovação, bloqueio de separação)

### Chat (executar manualmente)
```bash
cd server
node tests/chat.test.js
```
**4 testes:** conversa direta, mensagens, não lidas, grupo.

### Outros testes auxiliares
```bash
node tests/sectorMaterial.test.js
node tests/stockAvailability.test.js
node tests/materialPhoto.test.js
```

---

## 12. Arquivos principais criados ou alterados

### Frontend — Almoxarifado (`client/src/components/almoxarifado/`)
| Arquivo | Função |
|---------|--------|
| `AlmoxarifadoDashboard.js` | Dashboard e KPIs |
| `MateriaisAlmoxarifado.js` | Listagem de materiais |
| `MaterialAlmoxarifadoForm.js` | Cadastro/edição com família e foto |
| `ConfiguracoesAlmoxarifado.js` | Todas as abas de configuração + wizard localizações |
| `MapaLocalizacoesAlmoxarifado.js` | Mapa SVG com snap-to-grid |
| `RequisicoesList.js` | Gestão de requisições (almoxarifado) |
| `RequisicaoForm.js` | Formulário industrial |
| `RequisicaoMaterialCesta.js` | Cesta administrativa |
| `RequisicoesMaterialPages.js` | Páginas wrapper por módulo |
| `RequisicoesMaterialContext.js` | Contexto React cross-módulo |
| `RecebimentosAlmoxarifado.js` | Workflow de NF |
| `MovimentacoesAlmoxarifado.js` | Movimentações |
| `ConferenciaEstoque.js` | Inventário |
| `AlmoxPageHeader.js` | Cabeçalho padronizado |
| `Almoxarifado.css` | Estilos do módulo |

### Frontend — Outros
| Arquivo | Função |
|---------|--------|
| `components/chat/ChatPage.js` | Interface do chat |
| `components/chat/Chat.css` | Estilos WhatsApp-like |
| `services/chatSocket.js` | Cliente Socket.IO |
| `components/TipoSelecao.js` + `.css` | Seleção de módulos estilo Spotify |
| `components/OrionIntro.js` | Intro 3D Orion |
| `components/UsuarioForm.js` | Módulo almoxarifado nas permissões |
| `config/requisicoesMaterialConfig.js` | Mapa módulo → setor → tipo |
| `hooks/useModulosTipoConfig.js` | Overrides industrial/admin |
| `utils/disponibilidadeEstoque.js` | Badges de disponibilidade |
| `utils/resolveMaterialPhotoUrl.js` | URLs de fotos de materiais |

### Backend — Serviços (`server/services/almoxarifado/`)
| Arquivo | Função |
|---------|--------|
| `schema.js` | Migrations v3 |
| `db.js` | Helpers SQLite |
| `permissions.js` | Perfis e ACL |
| `stockService.js` | Estoque e movimentações |
| `requisitionService.js` | Fluxo de requisições |
| `receiptService.js` | Recebimentos e workflow NF |
| `alertService.js` | Alertas e SMTP HTML |
| `sectorMaterialService.js` | Isolamento ADM/IND |
| `stockAvailabilityService.js` | Disponibilidade sem quantidade |
| `requisitionPurchaseNotifyService.js` | E-mail compras |
| `requisitionReminderService.js` | Lembretes diários |
| `requisitionValueApprovalService.js` | Aprovação por valor |
| `requisitionNotificationService.js` | Notificações de requisição |
| `materialPhoto.js` | Upload/resolução de fotos |

### Backend — Chat (`server/services/chat/`)
| Arquivo | Função |
|---------|--------|
| `chatService.js` | Lógica de conversas e mensagens |
| `socket.js` | Eventos Socket.IO |
| `schema.js` | Tabelas do chat |
| `sanitize.js` | Sanitização de conteúdo |

### Backend — Rotas
| Arquivo | Função |
|---------|--------|
| `server/routes/almoxarifado.js` | API principal do módulo |
| `server/routes/almoxarifado/extended.js` | API v3 estendida |
| `server/routes/requisicoesMaterial.js` | API cross-módulo |
| `server/routes/chat.js` | API REST do chat |
| `server/routes/modulosTipoConfig.js` | Tipo industrial/admin por módulo |
| `server/services/modulosTipoConfigService.js` | Persistência dos tipos |

### Testes (`server/tests/`)
| Arquivo | Função |
|---------|--------|
| `almoxarifado.test.js` | 43 testes integrados |
| `chat.test.js` | 4 testes do chat |
| `sectorMaterial.test.js` | Filtros por setor |
| `stockAvailability.test.js` | Disponibilidade |
| `materialPhoto.test.js` | URLs de foto |

### Infraestrutura
| Arquivo | Função |
|---------|--------|
| `Dockerfile` | Build produção (client + server) |
| `DEPLOY_COOLIFY.md` | Guia de deploy |
| `SOLUCAO_BANCO_DADOS.md` | Volume persistente e troubleshooting |

---

## Histórico de commits da sessão (referência)

Desenvolvimento intenso em **22/06/2026** (tarde) e **23/06/2026** (manhã e tarde), com commits de "Atualização completa" registrando entregas incrementais: configurações e wizard, mapa, chat, requisições cross-módulo, alertas, recebimentos NF, cesta ADM, liberação por valor, fotos de materiais e UI TipoSelecao.

---

*Documento elaborado para download e distribuição interna na GMP INDUSTRIAIS. Para dúvidas sobre configuração em produção, utilize o ambiente [systemgmp.online](https://systemgmp.online) com usuário administrador.*
