# Etapa 36 (linha `main`) — Configurações com uma aba por módulo

> Design: `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`, seções 1.6 e 6
> (a seção 6 foi **reescrita** em 2026-10-07 com as decisões abaixo; a task 2 — categorias por
> família — saiu desta etapa e virou a **Etapa 37**, que continua esperando a decisão D-36a).
> Task de origem: nº 3 do lote de 2026-10-06. Branch: `main`. **Zero linhas de servidor.**
> Baseline: `test:api` 172/172; jest do client 49 suítes / 729 testes; build limpo.

## O que o usuário pediu, literalmente
"Em configurações criar dinamicamente tabs pra cada módulo para criar as configurações
centralizadas. (…) Configurar essas categorias pras famílias pode ficar em Configurações >
Almoxarifado > daí ter essa config lá centralizada num submenu por exemplo."

## Decisões tomadas pelo caminho reversível (registradas em B8–B10 do doc de novidades)

- **D-36b → embutir, não mover.** `/configuracoes` ganha uma barra de **módulos** (primeiro nível)
  e, dentro de cada módulo, as abas que ele já tinha (segundo nível). A tela do almoxarifado
  (`ConfiguracoesAlmoxarifado`) e a da produção (`ConfiguracoesProducao`) passam a aceitar
  `embedded` e são **renderizadas dentro** da aba do módulo. As rotas antigas
  (`/almoxarifado/configuracoes`, `/fabrica/configuracoes`) **continuam** funcionando, com os
  mesmos links no menu — nada é removido. Reverter = apagar a aba.
- **D-36c → quem vê o quê.** O gate da rota `/configuracoes` **não muda** (módulo `administrativo`
  + `ProtectedModuleConfigRoute administrativoConfig`). Dentro dela, a aba de um módulo só aparece
  para quem passa em `canConfigureModule(effectiveUser, modulo)` (a mesma régua que o menu já usa
  para o item "Configurações" de cada módulo). O administrador do almoxarifado que **não** tem o
  módulo administrativo continua usando `/almoxarifado/configuracoes` — por isso ela fica.
- **Lista de módulos:** `MODULOS_ORDEM` + `MODULOS_META` de `client/src/constants/modulosMeta.js`
  (a lista que já existe no cliente), **sem** `admin` (é `/admin`) e **sem** `todolist` (não tem
  configuração e não tem admin de módulo). `administrativo` vira a aba **Geral**. Descartado:
  criar `GET /api/modulos` (seria a 5ª lista; aposentar as outras quatro é etapa própria — G7).
- **Onde cada aba antiga fica:** Geral = Empresa, Sistema, E-mail, Backup. **Comercial** = Template
  de proposta, Opções por família, Variáveis técnicas (os três operam `familias_produto`/propostas,
  que são do comercial). Reverter = trocar uma linha no mapa `ABAS_POR_MODULO`.
- **URL:** `?modulo=<chave>&tab=<aba>`. O `?tab=` é o **mesmo** parâmetro que
  `ConfiguracoesAlmoxarifado` já lê (`useSearchParams`, `:199-204`). ⚠️ **Achado da revisão do
  plano (trava):** ela lê o `?tab=` **uma vez**, no `useState` inicial, e `onClick` só faz
  `setTab` (`:244`) — a URL nunca é escrita. Clicar "Localizações" e dar F5 voltaria para "Tipos".
  Por isso a T3 **faz a URL ser a fonte da verdade** da aba interna: `tab` derivado de
  `searchParams.get('tab')` (fallback `'tipos'`) e o clique faz `setSearchParams(prev => {
  prev.set('tab', id); return prev; }, { replace: true })`. Vale também na rota antiga (declarado
  em RN-36.04). `location.state.tab` (legado, usado por `PropostasList.js:180` com
  `'template-proposta'`) continua aceito e é traduzido para `modulo=comercial&tab=template-proposta`
  com `setSearchParams(…, { replace: true })` — o `replace` derruba o `location.state` e o efeito
  não roda de novo; só traduzir quando `?modulo` está ausente.
- **Componente `Tabs` reutilizável** (`client/src/components/ui/Tabs.js` + `Tabs.css`): a primeira
  tela a usá-lo é esta (os dois níveis). As outras seis barras de abas do sistema **não** são
  migradas nesta etapa (G8).

## Regras (`grep RN-36`)

- **RN-36.01** `/configuracoes` mostra a barra de módulos: **Geral** sempre; depois, na ordem de
  `MODULOS_ORDEM`, cada módulo (exceto `admin`/`todolist`) para o qual `canConfigureModule` é
  verdadeiro. Admin do sistema vê todos.
- **RN-36.02** A aba **Geral** tem as 4 abas internas (Empresa, Sistema, E-mail, Backup) com o
  comportamento de hoje (salvar a cada tecla, senha SMTP no blur, botão Atualizar).
- **RN-36.03** A aba **Comercial** tem Template de proposta, Opções por família e Variáveis
  técnicas — os mesmos componentes de hoje.
- **RN-36.04** A aba **Almoxarifado** renderiza `<ConfiguracoesAlmoxarifado embedded />`: sem o
  cabeçalho próprio (h1 "Configurações do Almoxarifado", parágrafo e selo), o wrapper `.almox-page`
  (padding 24px + max-width + 72px de rodapé no celular) trocado por `.almox-embedded` (só `color`),
  **com** a barra das 11 abas internas. **A aba interna passa a viver na URL** (`?tab=`), lida e
  escrita — nos dois modos. Sem `embedded`, a tela é idêntica à de hoje **com uma exceção
  declarada**: a URL reflete a aba (os 3 testes existentes que a montam só leem `?tab=` e continuam
  verdes sem alteração). A barra interna ganha `overflowX: 'auto'`, `flexWrap: 'nowrap'`,
  `whiteSpace: 'nowrap'` (hoje, com `html { overflow-x: hidden }` do mobile, as abas além de 360px
  são inalcançáveis — defeito pré-existente que a aba nova herdaria).
- **RN-36.05** A aba **Operacional** renderiza `<ConfiguracoesProducao embedded />`: sem o
  `ProducaoPageHeader`, wrapper `.producao-embedded`. O botão "Novo motivo" vai para o cabeçalho do
  card "Motivos de parada" **nos dois modos** (um caminho de render só); `embedded` apenas suprime o
  header da página.
- **RN-36.06** Módulo sem tela de configuração (Compras, Financeiro, Engenharia, Projetos, Frota)
  mostra um painel curto: "O módulo ⟨Nome⟩ ainda não tem configurações próprias." — a aba existe
  (é o lugar onde elas vão nascer), não é escondida.
- **RN-36.07** URL: `?modulo=` escolhe o módulo; `?tab=` a aba interna; os dois sobrevivem a
  recarregar a página. Módulo inválido ou não permitido → Geral. `?tab=` fora de
  `ABAS_POR_MODULO[modulo]` → **primeira aba do módulo** (`?modulo=administrativo&tab=geral` cai em
  Empresa). Trocar de módulo pela barra **limpa** `?tab=`. `location.state.tab` legado → traduzido
  pelo mapa `ABAS_POR_MODULO`. A barra de módulos renderiza **fora** do `if (loading)` (o spinner
  fica só no conteúdo da Geral) — senão `?modulo=almoxarifado` esperaria o `GET /configuracoes`.
- **RN-36.08** O menu lateral do módulo Administrativo (`Layout.js:429-433`) não muda; os itens
  "Configurações" do Almoxarifado (`Layout.js:415`) e do MES (`mes/MESLayout.js:47`,
  `producao/ProducaoDashboard.js:20`) **continuam** apontando para as rotas antigas. É isso que
  atende o administrador do almoxarifado que **não** tem o módulo administrativo (ele não chega a
  `/configuracoes`: `ProtectedModuleRoute` → `hasModuleAccess` → `AcessoNegado`).
- **RN-36.09** `Tabs`: `role="tablist"`/`role="tab"`/`aria-selected`, setas ← → trocam a aba,
  `aria-controls`; CSS escopado `.ui-tabs`, tokens `--gmp-*`, `overflow-x: auto` + `flex-wrap:
  nowrap` (repõe o que `Configuracoes.css:234-237` fazia). **Nenhuma classe** que case
  `[class*='header'|'toolbar'|'barra'|'actions']` (o `mobile-app.css:231-238` forçaria `flex-wrap:
  wrap` e mataria a rolagem). Não tentar vencer o `min-height: 44px` que o mobile dá a todo
  `button` — o `.ui-tabs-sm` é menor só no desktop.
- **RN-36.10** Card dentro de card: quando o módulo ativo é embutido (almoxarifado/operacional), o
  `.configuracoes-content` perde fundo/sombra (`configuracoes-content--embutido`), porque as abas
  internas do almox já desenham `.almox-card` com surface e borda próprias.

## Contratos (congelados — sem servidor, os contratos são de componente)

| Componente | Props | Comportamento |
|---|---|---|
| `Tabs` | `{ abas: [{id, label, icon?}], ativa, onChange, ariaLabel, tamanho?: 'md'\|'sm' }` | renderiza `tablist`; `onChange(id)` ao clicar ou nas setas; a ativa tem `aria-selected="true"` e classe `ui-tab-ativa` |
| `ConfiguracoesAlmoxarifado` | `{ embedded?: boolean }` (default `false`) | `embedded` oculta `.almox-header` (`:225-237`) e troca `.almox-page` por `.almox-embedded`; a aba interna vem de `?tab=` e é escrita em `?tab=` nos dois modos; tudo o mais igual |
| `ConfiguracoesProducao` | `{ embedded?: boolean }` | `embedded` oculta `ProducaoPageHeader` e troca `.producao-page` por `.producao-embedded`; "Novo motivo" no cabeçalho do card sempre |
| `Configuracoes` | — | lê `?modulo`/`?tab` e `state.tab`; `ABAS_POR_MODULO` exportado para teste |

## Tasks

**Tronco:** T1 (o `Tabs`). **T2 parte do commit que fecha T1** (ela importa `./ui/Tabs` — numa
worktree ramificada antes, o teste nem compila). **T3 não depende de T1** e roda em paralelo com
T1+T2, em worktree separada: executor A faz T1 → T2 na mesma worktree; executor B faz T3.
T2 **mocka** as duas telas de módulo no teste (fronteira de componente, contrato congelado); T3
testa as telas reais com e sem `embedded`. Arquivos disjuntos (verificado na revisão).

### T1 — tronco: `client/src/components/ui/Tabs.js` + `Tabs.css` + `Tabs.test.js` (RN-36.09)
Teste primeiro: renderiza N `role="tab"` dentro de `role="tablist"`; a ativa tem
`aria-selected=true`; clicar chama `onChange(id)`; `ArrowRight` na última volta para a primeira;
`ArrowLeft` idem. CSS: `.ui-tabs` (flex, `gap`, `border-bottom: 2px solid var(--gmp-border)`,
`overflow-x: auto` no celular), `.ui-tab` (padding, `color: var(--gmp-text-light)`),
`.ui-tab-ativa` (`color: var(--gmp-primary)`, `border-bottom-color`), `.ui-tabs-sm` menor para o
segundo nível. Foco visível (`:focus-visible` com anel).

### T2 — galho: `Configuracoes.js` vira duas camadas (RN-36.01, 02, 03, 06, 07, 08)
1. Teste primeiro `client/src/components/Configuracoes.test.js` (não existe; modelo de montagem:
   `almoxarifado/ConfiguracoesGerais.test.js` — `createRoot`+`act`, mocks de `../services/api`,
   `react-toastify`, `../context/AuthContext` (`useAuth`), `../services/permissionsCache`
   (`getEffectiveUser`, `getCachedUserPermissions`); **mockar** `./almoxarifado/ConfiguracoesAlmoxarifado`
   e `./producao/ConfiguracoesProducao` com stubs que renderizam `data-testid="stub-almox"` /
   `"stub-producao"` e expõem a prop `embedded` como atributo — a factory do `jest.mock` é içada,
   então **`const React = require('react')` dentro dela** e `{ __esModule: true, default: ({ embedded })
   => React.createElement('div', { 'data-testid': 'stub-almox', 'data-embedded': String(embedded) }) }`
   (o `default` é o que `React.lazy` exige); depois do render, um `await act(async () => {})` extra
   para o `Suspense` resolver; `MemoryRouter`). Cenários:
   (a) admin do sistema (`role:'admin'`): barra de módulos com Geral + comercial, compras,
   financeiro, operacional, engenharia, engenharia_projetos, almoxarifado, frota — nesta ordem; sem
   `admin`/`todolist`;
   (b) usuário com `admin_modulos: ['comercial']` (e acesso ao administrativo): só Geral + Comercial;
   (c) Geral abre com Empresa/Sistema/E-mail/Backup e o campo da empresa continua salvando por
   `PUT /configuracoes/:chave` (reusar o fluxo de hoje);
   (d) `?modulo=almoxarifado&tab=geral` → `stub-almox` com `embedded="true"` e a URL mantém `tab=geral`;
   (e) `?modulo=operacional` → `stub-producao` embedded;
   (f) `?modulo=compras` → texto "ainda não tem configurações próprias";
   (g) `state.tab = 'template-proposta'` (sem `?modulo`) → aba Comercial ativa e Template de proposta aberto;
   (h) `?modulo=frota` para quem não configura frota → cai em Geral;
   (i) trocar de módulo pela barra atualiza `?modulo=` (e limpa `?tab=`).
2. Implementar: `ABAS_POR_MODULO` exportado (`{ administrativo: [empresa, sistema, email, backup],
   comercial: [template-proposta, opcoes-familia, variaveis-tecnicas] }`); `modulosConfiguraveis(user)`
   = `MODULOS_ORDEM.filter(...)`; `useSearchParams` para `modulo`/`tab`; dois `<Tabs>`; o conteúdo
   de cada módulo: Geral/Comercial = os blocos de hoje; almoxarifado/operacional = componentes
   embutidos (lazy? **não** — `ConfiguracoesAlmoxarifado` já é importado onde é rota; importar
   direto aqui aumenta o chunk de `Configuracoes`; usar `React.lazy` **local** + `Suspense` com
   `<ModuleLoading module="almoxarifado" inline />` (`ModuleLoading.js:22-33`; sem `inline` ele ocupa
   60vh com logo) — **não** importar de `routes/lazyModules.js`, que já importa `Configuracoes` e
   faria ciclo); demais = `PainelSemConfiguracoes`. Cabeçalho da página: manter "Configurações do
   Sistema" + descrição; o botão Atualizar fica só quando Geral está ativo (é dele). Os hooks novos
   (`useSearchParams`, `useAuth`) ficam junto dos de `:25-34`, **acima** do `return` de `loading`.
3. `Configuracoes.css`: aposentar `.configuracoes-tabs .tab` (vira `Tabs`); manter o resto.
4. `App.js`: nada (a rota é a mesma). `PropostasList.js:180`: nada (o `state.tab` legado é traduzido).

### T3 — galho: `embedded` nas duas telas de módulo (RN-36.04, 36.05)
1. Teste primeiro: em `ConfiguracoesAlmoxarifado` — novo arquivo
   `almoxarifado/ConfiguracoesEmbedded.test.js` (montagem igual a `ConfiguracoesGerais.test.js`,
   inclusive o mock de `useAuth` — ele **lança** sem provider): sem prop → o `h1` "Configurações do
   Almoxarifado" existe e o wrapper é `.almox-page`; com `embedded` → não existe, wrapper
   `.almox-embedded`, mas a barra com a aba "Tipos de Material" existe e `?tab=geral` abre a aba
   geral; **clicar numa aba interna escreve `?tab=<id>` na URL** (ler `location.search` por um
   componente-espião dentro do `MemoryRouter`) nos dois modos; `?tab=` inválido cai em `tipos`; a
   barra interna tem `overflow-x: auto`. Em `ConfiguracoesProducao` —
   `producao/ConfiguracoesProducao.test.js` (não existe; mock de `api` e de `useAuth` se a tela
   usar): sem prop → `ProducaoPageHeader` com "Configurações — Produção" e o botão "Novo motivo"
   no cabeçalho do card; com `embedded` → sem o header, botão no card.
2. Implementar a prop nos dois (`({ embedded = false })`). No almox: `tab` derivado de
   `searchParams` (não `useState`), `setSearchParams(prev => { prev.set('tab', id); return prev; },
   { replace: true })` no clique; wrapper condicional; `.almox-header` condicional; estilo da
   barra interna com rolagem. Nenhuma aba interna é tocada.
3. Rodar os 3 testes existentes que montam `ConfiguracoesAlmoxarifado` (`Categorias`,
   `ConfiguracoesGerais`, `PerfisAcesso`) — têm de continuar verdes **sem alteração**.

### T4 — integração e fechamento
Merge dos galhos em `main`; jest inteiro + `CI=true build` (servidor não mudou — rodar
`test:api` mesmo assim, é barato em background); seção da Etapa 36 no
`docs/compras-novidades-por-etapa.md` (roteiro: Administrativo > Configurações → ver a barra de
módulos → Almoxarifado → trocar aba interna → recarregar a página e ver que ficou → Comercial >
Template de proposta → voltar por Propostas > "Configurar template"); linha no
`specs/modulo-compras/README.md`; B8–B10 e G7–G8; marcar este plano com hashes e retro.

## Pontos de atenção
- `ConfiguracoesAlmoxarifado` tem gate **interno** (`:206-221`, "Acesso restrito"): embutida para
  quem não é admin do almox ela mostraria esse aviso — mas RN-36.01 já esconde a aba para esse
  usuário. Não mexer no gate.
- Os três testes existentes do almoxarifado montam em `/almoxarifado/configuracoes?tab=…` e
  **não passam prop** — RN-36.04 exige que fiquem verdes sem edição; é o controle de regressão.
- `Configuracoes.js` tem `loading` que retorna antes de montar as abas (`:142-149`): o `useSearchParams`
  precisa ser lido antes do `return` condicional (regra de hooks).
- `MODULOS_META` tem `icon` por módulo — usar na barra de módulos.
- Build: `client/.env.production` tem `CI=false` (G3); a verificação é com `CI=true` no comando.
- A divergência cliente×servidor de `canConfigureModule` (`role==='admin'`) **não** é tocada
  (G9): esta etapa não cria porta de servidor, então não há como um gate novo ficar mais frouxo do
  que o que já existe.
- "Geral sempre" (RN-36.01): um admin do almoxarifado que **recebeu** o módulo administrativo vê
  Geral (SMTP, backup) + Almoxarifado — é o que ele já vê hoje nas 7 abas, não regressão; registrar
  em B (não é esquecimento).
- `Almoxarifado.css` e `Producao.css` **não vazam** (verificado: só seletores `.almox-*`,
  `.producao-*`, `.ped-rec-*`); `mobile-app.css:231-238` casa `[class*='header']` — o `.almox-header`
  some com `embedded`, então nada muda.
- Inconsistência visual aceita (G8): primeiro nível `Tabs`, Geral/Comercial `Tabs sm`, a barra
  interna do almox continua inline (`#4facfe`) — migrá-la é da etapa que migrar as outras seis.

## Retro (preencher no fechamento)
- Rodadas de correção até verde: _preencher_
- Achados da revisão: _preencher_ (reais vs. ruído)
- Paralelismo: _preencher_
- Defeito escapado: preencher na etapa seguinte.

## Como foi executado

_Preencher no fechamento, com o que foi medido de verdade._
