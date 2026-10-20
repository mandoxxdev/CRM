# Etapa 169 (Comercial, Operacional e Tarefas): as datas das Aprovações, das Ordens de Serviço e das Tarefas no dia de Brasília — plano

> Origem: "Próxima tarefa detalhada — Etapa 169" do plano da 168
> (`docs/superpowers/plans/2026-10-20-almoxarifado-etapa168-a-hora-de-criacao-no-relogio-de-brasilia-no-nucleo-na-viagem-e-nas-solicitacoes.md`).
> Etapa de consertos técnicos fora do Almoxarifado; o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-20): última B **B1072**, último C **C422**,
> última A **A105**. Esta etapa: **B1073+**, **C423+**, **A106+**. Worktree `CRM-wt-e169`, branch `etapa-e169` (da main `34815589`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 2 Important, 5 Minor — todos aceitos; o plano abaixo já está
> corrigido** (sondas em `scratchpad/e169/f2/`). **I1** a linha do PDF dizia que `data_entrada_pedido`/`data_entrega`/`data_conferencia` são
> gravadas `'AAAA-MM-DD'` — **estava errado: nenhuma rota as grava** (o `INSERT` `:20622`/`:20641` e o `UPDATE` `:20669` só listam abertura,
> prevista, início e conclusão); o *Data Entrega* e o *Data Conferência* do `OSForm` somem ao salvar (**C423**, de antes, fora desta etapa — muda o
> contrato do `PUT`); no PDF a entrega cai sempre na prevista e a conferência é sempre o dia da geração. **I2** quem chama o `gerarHTMLOS` é o
> `POST /:id/gerar-pdf` (`:20699`), não o `GET /:id/pdf` (que só serve o arquivo salvo) — o conserto vale para os PDFs gerados daqui em diante.
> **Minor:** M1 o `formatDate(new Date())` do PDF precisa de ramo próprio (`dataDoBancoBR` só aceita texto) e o teste roda também com `TZ=UTC`;
> M2 o prazo da Tarefa com `{ soData: true }` e o ilegível pelo `vazio` = os 10 primeiros caracteres; M3 os vazios/ilegíveis das Tarefas e da
> *Data Aprovação* escritos nas RN; M4 cuidados do teste (o contador conta a lista já filtrada; a aba inicial é *Propostas*; o *Ver Preview*
> precisa de itens); M5 a *Data Aprovação* é a última alteração, não a aprovação (existe `data_fechamento`) — **C425**, pergunta de produto.

## Fase 0 — medido (antes de qualquer código)

Lido no código nas linhas citadas (o condutor). Base `test:api` rodada antes de qualquer código (`scratchpad/e169/base-api.log`).
Medição em Node com `TZ=America/Sao_Paulo`.

### O formato de cada coluna — medido, não suposto

| Tela (linha) | Rota | Coluna | Como é gravada | A rota transforma? |
|---|---|---|---|---|
| Aprovações — *Data* da lista (`Aprovacoes.js:484`), *Data da Solicitação* do detalhe (`:569`), a data da decisão (`:627`, `:636`) | `GET /api/aprovacoes`, `GET /api/aprovacoes/:id` (`index.js:14140`, `:14214`, `SELECT a.*`) | `aprovacoes.created_at`, `aprovado_em` | `DEFAULT CURRENT_TIMESTAMP` (`:2898`; o único `INSERT`, `:14068`, não passa a coluna); `aprovado_em = CURRENT_TIMESTAMP` (`:14309`, `:14310`) | não |
| OS do Comercial — *Data Abertura*, *Data Prevista* do cartão (`OrdensServicoComercial.js:466`, `:476`); o contador e o filtro *Vencidas* (`:111-118`, `:184-191`) e o ⚠️ do cartão (`:417`) | `GET /api/comercial/ordens-servico` (`:20379`, cru) | `ordens_servico.data_abertura DATE NOT NULL`, `data_prevista DATE` (`:19279`) | o que a tela manda: `hojeLocalISO()` e `<input type="date">` (`OSComercialForm.js:30`, `:430`, `:440`; `OSForm.js:31`, `:418`, `:451`) — `'AAAA-MM-DD'`; os dois `INSERT` (`:20622`, `:20641`) e o `UPDATE` (`:20669`) gravam o que veio | não |
| OS do Comercial — *Data Aprovação* da aba *Propostas Aprovadas* (`:359`, `proposta.data_aprovacao \|\| proposta.updated_at`) | `GET /api/propostas` (`:5554`, as colunas da tabela) | **`propostas` não tem `data_aprovacao`** (o `PRAGMA` da lista; a coluna de mesmo nome é de `custos_viagens`, `:1986`) → sempre `propostas.updated_at` | `DEFAULT CURRENT_TIMESTAMP` e `updated_at = CURRENT_TIMESTAMP` em todos os `UPDATE propostas` | não |
| OS do Operacional — *Abertura*, *Prevista* da lista (`operacional/OrdensServico.js:75`, `:190`, `:191`) | `GET /api/operacional/ordens-servico` (`:20295`, cru) | as mesmas | as mesmas | não |
| Detalhes da OS — *Data Abertura*, *Data Prevista* (`OSDetalhesForm.js:502`, `:514`, montado pelo `OSFormPage` em `/comercial/ordens-servico/editar/:id` e `/fabrica/…`) | `GET /api/operacional/ordens-servico/:id` (`:20504`) | as mesmas | as mesmas | não |
| Prévia da OS ao criar (`PreviewOSEditavel.js:285`, `:295`, aberta pelo *Ver Preview* do `OSComercialForm`, `:582`) | — (o `formData` do formulário) | o `<input type="date">` / `hojeLocalISO()` | `'AAAA-MM-DD'`; a abertura **sem guarda** (vazia → *Invalid Date*) | — |
| Quadro da Produção — o prazo do cartão (`operacional/Producao.js:211`) | `GET /api/operacional/producao/kanban` (`:21356`, cru) | `ordens_servico.data_prevista` | a mesma | não |
| Tarefas — o prazo (`todolist/TodolistBoard.js:323`), *Criada* do cartão (`:327`), *Criada em* do formulário (`:432`), *Resolvida* (`:330`, `:436`) | `GET /api/todolist/board` (`services/todolist/todolistService.js:76`) | `prazo TEXT` (o `<input type="date">`, `:425`; o serviço guarda até 32 caracteres, `:108`); `created_at` `CURRENT_TIMESTAMP` (`:122`); `data_conclusao` `new Date().toISOString()` (`:13`, `:109`, `:152`, `:188`) | — | não |
| **(achado da Fase 0)** o **PDF da OS**, gerado no servidor (`gerarHTMLOS`, `index.js:13067`; usado em `:13672`, `:13693`, `:13729`, `:13737`, `:13985`) | `POST /api/operacional/ordens-servico/:id/gerar-pdf` (`:20699`, chama em `:21112`; o *Gerar PDF* do `OSDetalhesForm.js:260` e o criar do `OSComercialForm.js:273`) — o `GET …/:id/pdf` (`:21243`) só serve o arquivo salvo (Fase 2 I2) | `data_abertura`/`data_prevista` (`DATE`); `data_entrada_pedido`/`data_entrega`/`data_conferencia` existem (`:19291-19319`) mas **nenhuma rota as grava** (Fase 2 I1 — a tabela dizia `'AAAA-MM-DD'`; estava errado) | abertura/prevista `'AAAA-MM-DD'`; as outras três sempre nulas | — |

**Medido em Node (`TZ=America/Sao_Paulo`):**

- **Aprovações — o plano da 168 dizia "6 h a menos"; estava errado, são 3 h a menos.** O `formatDate` lê o `'AAAA-MM-DD HH:MM:SS'` como
  UTC (`Date.UTC`, certo) e **subtrai mais 3 h** à mão (`:297`; o ISO com `Z` também, `:303`): `'2026-10-21 01:30:00'` (22h30 de Brasília de
  20/10) sai *20/10/2026 às 19:30* — o certo é *20/10/2026 às 22:30*. As **6 h** são a distância para as telas que liam como hora local (3 h
  **adiantadas**, *21/10 às 01:30*), não para o relógio. Da meia-noite às 3h de Brasília a data também erra (a véspera). O valor ilegível
  (`Date.UTC(NaN)`) faz o `format` lançar e sai `-`.
- **Só data:** `new Date('2026-10-20').toLocaleDateString('pt-BR')` = *19/10/2026* — a véspera, o dia inteiro, em todas as telas de OS, no
  quadro da Produção e no prazo da Tarefa.
- **A contagem de *vencidas* (pergunta 2 da 168):** `new Date('2026-10-20')` é 19/10 21h; `setHours(0,0,0,0)` → 19/10 0h; `< hoje 0h` →
  **a OS prevista para hoje conta como vencida o dia inteiro** (o contador e o filtro). O ⚠️ do cartão (`:417`) compara o instante com o
  relógio: **vencida desde as 21h da véspera**. **O servidor não tem essa contagem** (medido: nenhum `vencid` nem `data_prevista <` nas rotas de
  OS; o *Dashboard MES* não é montado — **C403**/**B1034**, não mexer). As três réguas da tela continuam contando `cancelado` como vencida (só
  `concluido` sai) — **inalterado** (C424).
- **Hora de criação:** `new Date('2026-10-21 01:30:05').toLocaleString` = *21/10/2026, 01:30:05* (o certo, *20/10/2026, 22:30:05*) — o
  *Criada* e o *Criada em* das Tarefas e a *Data Aprovação* da aba *Propostas Aprovadas* (o dia seguinte, das 21h à meia-noite). O
  `data_conclusao` das Tarefas é ISO com `Z` e **já está certo**.
- **PDF da OS:** o `Dockerfile` fixa `TZ=America/Sao_Paulo` (`:47`) — o `new Date('AAAA-MM-DD').toLocaleDateString` do servidor imprime
  a **véspera** em produção (na máquina de teste em UTC, o dia certo — por isso nenhum teste o via). O `formatDate(new Date())` da conferência
  segue o `TZ` do processo.

**Todas roteadas:** `Aprovacoes` (`/comercial/aprovacoes`), `OrdensServicoComercial` (`/comercial/ordens-servico`), `OSComercialForm` (→
`PreviewOSEditavel`), `OSFormPage` (→ `OSDetalhesForm`), `OrdensServico` (`/fabrica/ordens-servico`), `ProducaoMES` (`producao-kanban`),
`TodolistBoard` (`/todolist`) — `routes/lazyModules.js`, `App.js:284-287`, `:336`, `:448-457`. **Sem rota (não mexer):**
`operacional/DashboardOperacional.js:167`, `Oportunidades.js:128` (nenhuma rota os monta). **Latente:** `Projetos.js:132`
(`data_prevista_entrega` não existe na tabela — a tela nunca mostra; inalterado, declarado na 168).

**Ferramentas prontas (`client/src/utils/dataLocal.js`):** `formatarDataDoBanco(valor, vazio, { soData })` (só data no dia gravado; vazio ou
ilegível → `vazio`), `formatarInstanteDoBanco(valor, opcoes, vazio)` (o `CURRENT_TIMESTAMP` como UTC; vazio → `vazio`; ilegível → o texto cru),
`lerDataDoBanco`, `lerInstanteDoBanco`, `hojeLocalISO`. No servidor, `diaLocal.dataDoBancoBR(valor)` (`'AAAA-MM-DD'` → reformatado sem fuso;
instante → o dia de Brasília; ilegível → `''`).

### Portas de saldo, trava e permissão

Nenhuma. Nenhuma rota muda de portão; nenhum valor gravado muda; nenhuma consulta SQL muda (o servidor não conta *vencidas*). A única mudança
de servidor é o texto da data no PDF da OS.

## Decisões (letra B — reversíveis)

- **B1073 — as Aprovações na hora de Brasília.** O `formatDate` à mão (`Aprovacoes.js:268-312`) vira `lerInstanteDoBanco` + o mesmo
  `format(…, "dd/MM/yyyy 'às' HH:mm")`. **Muda:** a data e a hora da lista, do detalhe e da decisão — **3 h mais tarde** que antes (das 0h às
  3h, o dia certo em vez da véspera). Vazio → `-` (inalterado); ilegível → o texto gravado (antes `-`, como a 168 fez nas outras telas).
  **Descartado:** trocar o formato (o *às* é desta tela).
- **B1074 — as datas da OS no dia gravado** — o cartão do Comercial, a lista do Operacional, os detalhes, a prévia ao criar, o quadro da
  Produção: `formatarDataDoBanco(valor, '-', { soData: true })`. **Muda:** o dia certo em vez da véspera, o dia inteiro; a abertura vazia da
  prévia sai `-` (antes *Invalid Date*); o ilegível sai `-` (antes *Invalid Date*). A *Data Aprovação* da aba *Propostas Aprovadas*
  (`updated_at`, instante) por `formatarInstanteDoBanco(valor, undefined, '-')` — das 21h à meia-noite, o dia certo em vez do seguinte.
- **B1075 — a OS *vencida* é a que tem a data prevista ANTES de hoje (o dia de Brasília)** — o contador *Vencidas*, o filtro *Vencidas* e o ⚠️
  do cartão, numa régua só. **Muda:** a OS prevista para hoje deixa de contar como vencida (antes contava o dia inteiro; o ⚠️, desde as 21h
  da véspera) e passa a contar a partir de amanhã. A OS sem data prevista ou com a data ilegível não é vencida (inalterado). Quem sai da
  conta continua sendo só a `concluido` (C424). **Descartado:** levar a contagem para o servidor (ele não tem uma; mudaria o contrato da rota
  sem necessidade); "vencida no próprio dia" (a data prevista é o dia em que a entrega ainda está no prazo).
- **B1076 — as Tarefas.** O prazo no dia gravado (antes a véspera); o *Criada* do cartão no dia de Brasília e o *Criada em* do formulário na
  hora de Brasília (antes o dia seguinte das 21h à meia-noite e a hora 3 h adiantada); o *Resolvida* não muda (já era certo). O prazo por
  `formatarDataDoBanco(v, String(v).slice(0, 10), { soData: true })` — o prefixo vale, como no formulário (Fase 2 M2); ilegível continua
  mostrando os 10 primeiros caracteres (como antes). O `created_at` vazio continua sem texto no cartão e *—* no formulário; o ilegível passa a
  aparecer inteiro também no cartão (antes os 10 primeiros caracteres — Fase 2 M3).
- **B1077 — o PDF da OS no dia gravado** — as datas do cabeçalho e do quadro (abertura, entrega prevista, conferência) por
  `diaLocal.dataDoBancoBR`; a data de hoje (sem conferência) no dia de Brasília pela régua `FUSO_PADRAO`, não pelo `TZ` do processo.
  **Muda:** em produção, o dia certo em vez da véspera — **só nos PDFs gerados daqui em diante** (o *Gerar PDF*; o *Ver PDF* de uma OS gerada
  antes continua com a véspera até gerar de novo — Fase 2 I2). Vazio/ilegível → vazio (inalterado). Na prática a entrega impressa é sempre a
  prevista e a conferência é sempre o dia da geração (as colunas nunca são gravadas — **C423**). **Descartado:** depender do `TZ` do
  processo (o teste e a produção divergiam).
- **B1078 — a próxima etapa (170).**

## Regras de negócio

- **RN-169.01 (B1073)** — Aprovações: `created_at`/`aprovado_em` por `lerInstanteDoBanco`, `"dd/MM/yyyy 'às' HH:mm"`. **Cenário:**
  `'2026-10-21 01:30:00'` → *20/10/2026 às 22:30* (antes *20/10/2026 às 19:30*); `'2026-10-21 04:30:00'` (01h30 de 21/10) → *21/10/2026 às
  01:30* (antes *20/10/2026 às 22:30* — a véspera); vazio → `-`; `'lixo'` → *lixo*.
- **RN-169.02 (B1074)** — as datas só de dia das OS (cartão do Comercial, lista do Operacional, detalhes, prévia, quadro da Produção):
  `'2026-10-20'` → *20/10/2026* (antes *19/10/2026*); vazio → `-`. **E** a *Data Aprovação* da aba *Propostas Aprovadas*: `updated_at =
  '2026-10-21 01:30:05'` → *20/10/2026* (antes *21/10/2026*); ilegível → o texto gravado (antes *Invalid Date*; nas células de OS, `-` — Fase 2 M3).
- **RN-169.03 (B1075)** — OS vencida ⇔ `data_prevista` legível **e** o seu dia < `hojeLocalISO()` **e** `status !== 'concluido'`. **Cenário,
  às 22h30 de 20/10 (Brasília — 01h30 de 21/10 em UTC):** prevista 19/10 → vencida (contador, filtro e ⚠️); prevista 20/10 → **não** (antes
  sim, nas três); prevista 21/10 → não (antes o ⚠️ sim — as 21h da véspera); concluída de 19/10 → não; sem prevista → não.
- **RN-169.04 (B1076)** — Tarefas: o prazo `'2026-10-20'` → *20/10/2026* (antes *19/10/2026*); `created_at = '2026-10-21 01:30:05'` → o
  cartão *Criada 20/10/2026* (antes *21/10/2026*) e o formulário *Criada em: 20/10/2026, 22:30* (antes *21/10/2026, 01:30*);
  `data_conclusao = '2026-10-21T01:30:05.000Z'` → *20/10/2026, 22:30* (inalterado); prazo `'2026-10-20T02:00:00.000Z'` (pela API) → *20/10/2026*
  (o dia do prefixo, o mesmo do formulário — Fase 2 M2); `created_at` vazio → *Criada* sem data e *Criada em: —* (inalterado).
- **RN-169.05 (B1077)** — PDF da OS: `formatDate('2026-10-20')` → *20/10/2026* com o processo em `America/Sao_Paulo` (antes *19/10/2026*);
  `formatDate(new Date('2026-10-21T01:30:00Z'))` → *20/10/2026* em qualquer `TZ` (ramo próprio para `Date` — `hojeLocalISO` do `diaLocal`;
  Fase 2 M1); vazio/`null`/ilegível → `''`.

## Contratos

Nenhuma rota muda (método, portão, payload, resposta). Só o texto que a tela e o PDF mostram e as três réguas de *vencida* da tela.

## Tasks (sort topológico)

- [ ] **T1 (galho, front) — Aprovações (B1073, RN-169.01).**
- [ ] **T2 (galho, front) — as OS e o quadro da Produção (B1074/B1075, RN-169.02/03)** — um helper `osVencida(os, agora)` no componente
  do Comercial para as três réguas.
- [ ] **T3 (galho, front) — as Tarefas (B1076, RN-169.04).**
- [ ] **T4 (galho, back) — o PDF da OS (B1077, RN-169.05).** Teste `server/tests/api/datasDoPdfDaOsNoDiaLocal.api.test.js`: extrai a
  declaração `formatDate` do corpo de `gerarHTMLOS` no `index.js` e a avalia com o `diaLocal` real, sob `TZ=America/Sao_Paulo` (guarda que
  derruba fora dele) **e de novo com `TZ=UTC`** (Fase 2 M1, o molde do `auditoriaFiltros.api.test.js:169-180`); a rota do PDF precisa do
  Chromium e fica de fora (declarado).
- [ ] **T5 (integração, front) — `datasDasOsEDasTarefasNoDiaLocal.test.js`**, o molde do `horaDeCriacaoNoDiaLocal.test.js` (o fuso do
  `jest.globalSetup.js` com guarda; só a fronteira HTTP mockada) **com o relógio às 22h30 de 20/10** (`global.Date` trocado por uma subclasse
  fixa, como o `PedidoCompraForm.test.js (q)` — o Jest 27 desta base fakeia o `setTimeout` junto com o relógio). Cada cenário vai do gesto ao
  texto, com a metade positiva e a negativa e a **célula exata**: Aprovações (a lista, clicar no detalhe — a solicitação e a decisão); o
  Comercial (o cartão; o contador *Vencidas*; clicar no filtro *Vencidas* — a lista mostra só a de 19/10; o ⚠️; a aba *Propostas Aprovadas*);
  o Operacional (a lista); os detalhes (`OSFormPage` na rota); a prévia (o `OSComercialForm`, clicar *Ver Preview*); o quadro da Produção; as
  Tarefas (o cartão, clicar para editar — o *Criada em*).
- [ ] **T6 (documentação)** — no fechamento.

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`C:/Users/User/AppData/Local/Temp/claude/C--Users-User-projetos-CRM/trava-test-api.d`).
2. **Asserções exatas** na célula (a lição da r3 da 168).
3. O relógio fixo tem de valer **antes** de montar a tela (as réguas leem `new Date()` no render) e ser restaurado no `finally`.
4. A revisão obrigatória da proposta (23 + editor 39) roda no fechamento (nenhum arquivo do template).
5. Nenhuma porta de permissão muda; nenhum valor gravado muda.
6. (Fase 2 M4) o contador *Vencidas* é calculado sobre a lista já filtrada; a aba inicial do Comercial é *Propostas* (clicar na aba das OS);
   o *Ver Preview* fica desabilitado sem itens na proposta (o mock de `/propostas/:id` precisa de itens).
7. **Avisos novos (fora desta etapa):** **C423** o *Data Entrega*/*Data Conferência* (e *Entrada do Pedido*, *Ordem de Produção*) do
   formulário da OS somem ao salvar (de antes); **C424** a OS *cancelada* conta como vencida (de antes — pergunta de produto); **C425** a
   *Data Aprovação* da aba *Propostas Aprovadas* é a última alteração da proposta (de antes — pergunta de produto).
