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
| Detalhes da OS — *Data Abertura*, *Data Prevista* (`OSDetalhesForm.js:502`, `:514`, montado pelo `OSFormPage` em `/comercial/ordens-servico/editar/:id` — o *Ver Detalhes* do cartão e o *Ver OS* da aba *Propostas Aprovadas* (`OrdensServicoComercial.js:386`, `:508`); a rota `/fabrica/…/editar/:id` existe mas nenhum botão a abre: o *Editar* da Fábrica abre o `OSForm`, que mostra o campo cru — certo; corrigido no fechamento) | `GET /api/operacional/ordens-servico/:id` (`:20504`) | as mesmas | as mesmas | não |
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

- [x] **T1 (galho, front) — Aprovações (B1073, RN-169.01).** `1e8fa390`.
- [x] **T2 (galho, front) — as OS e o quadro da Produção (B1074/B1075, RN-169.02/03)** — um helper `osVencida(os, agora)` no componente
  do Comercial para as três réguas. `1537b0d6`.
- [x] **T3 (galho, front) — as Tarefas (B1076, RN-169.04).** `009b560e`.
- [x] **T4 (galho, back) — o PDF da OS (B1077, RN-169.05).** Teste `server/tests/api/datasDoPdfDaOsNoDiaLocal.api.test.js`: extrai a
  declaração `formatDate` do corpo de `gerarHTMLOS` no `index.js` e a avalia com o `diaLocal` real, sob `TZ=America/Sao_Paulo` (guarda que
  derruba fora dele) **e de novo com `TZ=UTC`** (Fase 2 M1, o molde do `auditoriaFiltros.api.test.js:169-180`); a rota do PDF precisa do
  Chromium e fica de fora (declarado). `c8b14a86`.
- [x] **T5 (integração, front) — `datasDasOsEDasTarefasNoDiaLocal.test.js`**, o molde do `horaDeCriacaoNoDiaLocal.test.js` (o fuso do
  `jest.globalSetup.js` com guarda; só a fronteira HTTP mockada) **com o relógio às 22h30 de 20/10** (`global.Date` trocado por uma subclasse
  fixa, como o `PedidoCompraForm.test.js (q)` — o Jest 27 desta base fakeia o `setTimeout` junto com o relógio). Cada cenário vai do gesto ao
  texto, com a metade positiva e a negativa e a **célula exata**: Aprovações (a lista, clicar no detalhe — a solicitação e a decisão); o
  Comercial (o cartão; o contador *Vencidas*; clicar no filtro *Vencidas* — a lista mostra só a de 19/10; o ⚠️; a aba *Propostas Aprovadas*);
  o Operacional (a lista); os detalhes (`OSFormPage` na rota); a prévia (o `OSComercialForm`, clicar *Ver Preview*); o quadro da Produção; as
  Tarefas (o cartão, clicar para editar — o *Criada em*). `d380d53c`.
- [x] **T6 (documentação)** — no fechamento (o commit do fechamento, depois de `ddab7b70`).

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

## Execução — o que divergiu do plano

- **Paralelismo 0:** T1–T4 pequenas, feitas em sequência pelo condutor (cada uma num arquivo; o `test:api` é serial pela trava de máquina) —
  nenhum retrabalho.
- **T1–T5 verdes de primeira** (`datasDasOsEDasTarefasNoDiaLocal` **12/12**, `datasDoPdfDaOsNoDiaLocal` **6/6**). **Controle positivo**
  (`scratchpad/e169/`): as sete telas na versão de `34815589` — **10/12** caem (passam a guarda e o *"Criada em: —"* sem data, inalterado), cada
  uma pelo texto antigo (*20/10/2026 às 19:30*, *19/10/2026*, *2* vencidas…); mais **13 sabotagens de uma linha** (`sabota-t5.js`: o aviso, o
  contador, o filtro, a *Data Aprovação*, cada data do cartão/detalhe/prévia, o `soData` do prazo, o *Criada em*, o *Criada*, o ilegível das
  Aprovações) — **13/13** caem pela asserção da linha; o servidor: o `index.js` de `34815589` derruba **4/6**, e o "hoje" pelo dia do processo
  derruba o cenário `TZ=UTC`. md5 restaurado ao pós-conserto em todas.
- **Testes antigos mudados: 0.**
- **O plano dizia que os detalhes da OS abriam também pela Fábrica** (`/fabrica/…/editar/:id`) — **estava errado**: só o Comercial os abre
  (*Ver Detalhes*, *Ver OS*); o *Editar* da Fábrica abre o formulário (`OSForm`), que já mostrava o dia gravado no campo. Corrigido na tabela da
  Fase 0 e nos documentos. O teste monta o `OSFormPage` pela rota (o mesmo componente).
- **A próxima tarefa da 168 estava errada em dois pontos** (corrigidos aqui e na **C421**, com a correção visível): as Aprovações eram **3 h**
  atrasadas, não 6 h; e faltava o **PDF da OS** (gerado no servidor, véspera em produção pelo `TZ` do Dockerfile — achado da Fase 0).

**Specs de feature:** nenhuma — as telas desta etapa (Aprovações, Ordens de Serviço, Quadro de Produção, Tarefas) não são features do mapa do
Almoxarifado nem têm `specs/<modulo>/<feature>/README.md`; o registro é o mapa (a linha *Última atualização*), este plano e as novidades. A
revisão da proposta (`specs/proposta-editavel/review-proposta.md`) não muda: nenhum arquivo do template ou da paginação foi tocado.

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo)

- **r1 (a regra):** **0** Critical, **0** Important, **2** Minor **de antes**, só por integração — **M1** com `soData`, o texto que não começa
  por `AAAA-MM-DD` caía no `new Date` leniente (o prazo `'2026-10'` saía *30/09/2026* no cartão e `2026-10-01` no formulário; `'sexta 10'`,
  *01/10/2001*) — reproduzido (`scratchpad/e169/r1/leniente.mjs`); **aceito**: `lerDataDoBanco` com `soData` devolve `null` para esse texto
  (muda também a leitura das 165/168 com `soData`, só para o valor ilegível — vira o *vazio* de cada tela) + cenário em `dataLocal.test.js` e na
  T5. **M2** a data impossível com hora (`'2026-02-30 10:00:00'`) rola para março nas Aprovações e na criação das Tarefas — **declarado** (o
  banco nunca grava assim; mexer no `lerInstanteDoBanco` muda todas as telas da 161–168). Conferidos e certos: as bordas 02:59:59/03:00 UTC, a
  `osVencida` às 00:00, 20:59, 21:00, 22:30, 23:59:59 e 00:00/00:30 do dia seguinte, o PDF em três fusos, os 114 testes das suítes vizinhas.
- **r2 (autorização):** **0** Critical, **0** Important, **1** Minor — o PDF com data gravada como **número** (só por integração) passa a sair
  em branco (antes formatada) — **declarado** na B1077. Conferidos: nenhum portão, consulta ou gravação mudou (diff do servidor: só o
  `formatDate`); o ilegível que agora aparece cru é nó de texto do React (nenhum `dangerouslySetInnerHTML`); o PDF só emite `DD/MM/AAAA` ou
  vazio (sonda com `<script>`, `"><b>`); `created_at`/`aprovado_em` das aprovações só o servidor grava; o `new Function` do teste avalia o
  próprio `index.js`.
- **r3 (sabotagem, worktree `CRM-wt-e169-r3`):** **43** sabotagens novas, **26** mortas pela asserção certa, **17** sobreviventes: **9**
  equivalentes provadas (o `toISOString` da meia-noite local em UTC-3; o `agora` default no filtro; o `soData` nas colunas `DATE` estritas; o
  vazio da abertura `NOT NULL`; o `if (!date)` do PDF coberto pelo `dataDoBancoBR`) e **8 asserções faltando**: R15 o `-` da Prevista do
  Operacional satisfeito por outra coluna; R11 a *Data Aprovação* vazia; R19 a abertura apagada da prévia; R25 a criação ilegível no cartão; R5
  a prevista com hora antes das 3h UTC (só o `soData` distingue); P6a/P6b a fiação das duas aberturas do PDF (`includes` aceitava uma); **R28 o
  relógio parado sem prova de que vale** (sem o `global.Date = DataFixa` a suíte passava — de dia, provando nada da janela das 21h). **R12**
  (a `data_aprovacao` da proposta) é **ruído**: `propostas` não tem a coluna (a de mesmo nome é de `custos_viagens`). **Todas as 8 aceitas** na
  correção da revisão; controle (`scratchpad/e169/sabota-f5.js`): as 7 do cliente (mais a do r1 M1) caem cada uma pela asserção nova
  (*Expected "-" / Received ""*, *Expected false / Received true*, *Expected 1792546200000*…); as do PDF pelas contagens novas; md5
  restaurado.

## Baterias (os números lidos nos logs, `scratchpad/e169/`)

- **Base, antes de qualquer código (`base-api.log`):** `test:api` **489/489**.
- **Bateria 1 — antes de `1e8fa390`…`d380d53c` (`b1-*.log`):** `test:api` **490/490** arquivos (`datasDoPdfDaOsNoDiaLocal` **6/0**);
  `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **171** suítes / **2165** testes;
  `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor
  (`clausulasInlineEditor` + `marcadorVivoNoPreview`) **2** suítes / **59** testes.
- **Bateria 2 — antes de `ddab7b70` (`b2-*.log`):** `test:api` **490/490**; `test:almoxarifado` **44/0**; **4/0, 3/0, 16/0**; client **171** /
  **2167**; *Compiled successfully*; proposta **23/23** + editor **59/59**. *(Durante ela, o controle da P6 trocou o `index.js` por ~1 s e o
  restaurou — md5 conferido; por isso a bateria 3 roda inteira de novo.)*
- **Bateria 3 — o fechamento (`b3-*.log`; depois dela só documentos):** `test:api` **490/490** arquivos; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **171** suítes / **2167** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor **59/59**. O intermitente conhecido do
  `superPadraoNoBoot` não apareceu em nenhuma das três baterias.

## Fora desta etapa (declarado)

- **C423 (novo, Fase 2 I1 — de antes)** — quatro datas do formulário da OS (*Data Entrega*, *Data Conferência*, entrada do pedido, ordem de
  produção) não são gravadas pelo `PUT` (`index.js:20669`).
- **C424 (novo — de antes, produto)** — a OS cancelada conta como vencida. **C425 (novo, Fase 2 M5 — de antes, produto)** — a *Data Aprovação*
  das Propostas Aprovadas é a última alteração (`updated_at`), não a aprovação (existe `data_fechamento`).
- O resto da **C421** (o Chat, Compras, o Almoxarifado, os PDFs de remessa e de posição do cliente) e a **C422** — a próxima.
- **Fase 5 r1 M2** — a data impossível com hora (`'2026-02-30 10:00:00'`) rola para março no `lerInstanteDoBanco` (Aprovações, criação das
  Tarefas e todas as telas da 161–168); o banco nunca grava assim. **Fase 5 r2** — a data gravada como número no PDF sai em branco.
- O PDF já guardado de uma OS (o *Ver PDF*) só muda ao gerar de novo; a rota que gera o PDF precisa do Chromium e não tem teste por rota nesta
  etapa (o formatador é provado extraído do `index.js` real).
- Tudo o que depende do P.O. (a lista abaixo).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (oito asserções e a leitura do texto ilegível com `soData`; nenhum defeito de
   comportamento nas telas da etapa). As tasks ficaram verdes na primeira aplicação do código **e o teste também** (12/12 de primeira — por
   isso o controle de 13 + 1 sabotagens). **Testes antigos mudados: 0.**
2. **Achados da revisão:** Fase 2 — **0 Critical + 2 Important + 5 Minor**, todos reais (o mais caro: a tabela dizia que três colunas do PDF
   eram gravadas, e nenhuma rota as grava — virou a C423; e o PDF que só muda ao gerar de novo). Fase 5 — r1 **2** Minor de antes (1 aceito, 1
   declarado); r2 **1** Minor (declarado); r3 **8** faltas de asserção reais + 9 equivalentes provadas + **1** ruído (R12, a coluna que não
   existe na tabela). **O que mais pesou:** o **relógio parado sem prova** (R28) — o arquivo inteiro passava sem ele porque a sessão rodou de
   dia; e, de novo, o `toContain` satisfeito por outra coluna (R15).
3. **Paralelismo:** **0** galhos de código em paralelo (T1–T4 pequenas, em sequência); **3** revisores em paralelo na Fase 5 (o r3 na worktree
   própria) — **0** incidente de trava, **0** retrabalho. (O controle da P6 do condutor tocou o `index.js` por ~1 s durante a bateria 2 — sem
   efeito medido; a bateria 3 rodou inteira.)
4. **Defeito que escapou:** **nenhum no código da 169** (preenchido na Etapa 170: as suítes da 169 — `datasDasOsEDasTarefasNoDiaLocal` 12, `datasDoPdfDaOsNoDiaLocal` 6 — verdes nas baterias da 170; nenhum achado das Fases 2 e 5 da 170 aponta código da 169). Na **lista** da próxima tarefa, uma frase herdada da 168 estava errada e a 169 a repetiu: a **C422** dizia "a tela sempre manda 100" — a tela não manda limite nenhum (o 100 é o padrão do servidor); corrigida na C422 com a correção visível. E a instrução "o fuso de produção é o do Dockerfile" não vale para os PDFs de remessa e de posição: são gerados no navegador (Fase 0 da 170).

## Próxima tarefa detalhada — Etapa 170

*(A série desta etapa foi B1073–B1078, C423–C425 novos; nenhuma A — a 170 começa em **B1079**, **C426**, **A106**; confira com `grep -oE`
antes.)*

**Escolhida: o resto da C421 — o Chat, Compras, o Almoxarifado e os PDFs** (a metade da C421 que esta etapa não tocou) **e a C422** (validar o
`limit` dos Logs — técnico). Medido na 168 por um agente Explore (**cada linha a confirmar na Fase 0 da 170**, inclusive se é roteada e como a
coluna é gravada — a 169 achou uma linha errada na lista da 168, as "6 h", e uma que faltava, o PDF da OS):

- **Chat:** `chat/ChatPage.js:19`, `:27`, `:35`, `:43-44` (`parseISO(created_at.replace(' ', 'T'))` do `CURRENT_TIMESTAMP` — lido como hora
  local, 3 h adiantado; o *Hoje*/*Ontem* e o separador do dia erram à noite — `isToday`/`isSameDay` do date-fns sobre o `Date` errado).
- **Compras:** `components/ItensFornecedor.js:292`, `:417` (`planilha_atualizado_em` depois de recarregar — o arquivo fica em `components/`,
  não em `components/compras/`); `components/Compras.js:300` (o `created_at` da planilha de fornecedores pelo prefixo — o dia UTC).
- **Almoxarifado:** `LotesAlmoxarifado.js:464` (`certificado_em`), `AnexosDocumento.js:71-75` (o `created_at` dos anexos, sem o `Z`),
  `FerramentasAlmoxarifado.js:602` (a retirada pelo prefixo — o dia UTC), `utils/remessaPdf.js:15-20` e `utils/posicaoClientePdf.js:14-17` (o
  *gerado em* com `timeZone: 'UTC'`).
- **C422:** `GET /api/auditoria/logs?limit=abc` → 500 com a mensagem do SQLite; `limit=-1` → sem limite (`index.js:22330`, a rota dos logs).
  Decidir o contrato (400 com mensagem literal × limite padrão) — registrar em B.

**Ferramentas prontas:** `client/src/utils/dataLocal.js` — `formatarInstanteDoBanco(valor, opcoes, vazio)`, `COM_SEGUNDOS`,
`formatarDataDoBanco(valor, vazio, { soData })` (com `soData`, o texto que não começa por `AAAA-MM-DD` é ilegível — 169), `lerDataDoBanco`,
`lerInstanteDoBanco`, `hojeLocalISO`; no servidor, `services/diaLocal.js` (`dataDoBancoBR`, `hojeLocalISO`, `modificadorDoFuso`,
`instanteDoBancoNoFuso`). **Pontos de atenção:** (1) a trava de máquina
(`C:/Users/User/AppData/Local/Temp/claude/C--Users-User-projetos-CRM/trava-test-api.d`); (2) **o relógio parado precisa de prova de que vale**
(a lição da r3 desta etapa: `expect(Date.now()).toBe(AGORA)` no `beforeEach`) — o molde é `datasDasOsEDasTarefasNoDiaLocal.test.js`; (3) o
Chat usa `isToday`/`isYesterday` — o "hoje" tem de ser o do relógio parado; (4) as asserções **exatas** da célula (`toContain` satisfeito por
outra coluna, de novo, na r3 desta etapa); (5) os PDFs do Almoxarifado têm teste próprio (`utils/etiquetasPdf.test.js` é o vizinho) — ler
antes; (6) a C423 (gravar as quatro datas do formulário da OS) é técnica e pode entrar se a 170 sobrar — muda o que o `PUT` aceita: contrato
congelado no plano.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 167 (da 152 em diante: **B853**/**C279**, **B808**, **B755**, **B761**/**C239**,
**C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a
régua do tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens
de produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**, ligar o painel antigo (*Dashboard
MES*, **C403**) e **ligar a edição de atividades e decidir o que ela grava** (**C408**); do Comercial, a **C354**, a **C357**/**B988**, a
**C359**/**B989** (e a **C360** junto), a **C358**, a **C383**, ignorar também o acento nas buscas (**B1013**, **B1019**) e o resto da **C382**
(**B1016**); do núcleo, a **C362**; da 160, a **C398** e a **C399**; da C400, a descrição da OS na busca das OPs; da 162, a **B1036**; da 163, o
`referencia` das remessas com 400 e o `horas_reais: 0`; da 164, a **C411**, a **C412** e o `mes` fora de 1–12 com 400; da 165, congelar a
emissão (**B1057**), imprimir a validade, unificar *hoje* × *vencido* do lembrete e o `validade_dias` fora de faixa com 400; da 166, a **C417**,
as janelas no dia 1 do mês e os atalhos no fuso de Brasília (**B1061**); da 167, restringir o `{{raw.…}}` ou escapar `{{` nos valores (**C420**) e
reescrever em massa as cláusulas congeladas (**B1067**); da 168, trocar o formato das datas de cada tela (a B1069 manteve o de cada
uma); **desta etapa**, tirar a OS cancelada das vencidas (**C424**) e o que a *Data Aprovação* mostra (**C425** — o dia de fechamento?).
Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** as datas das Aprovações, das OS (cartão, lista, detalhes, prévia, quadro, PDF), a OS vencida e
as Tarefas (`1e8fa390`, `1537b0d6`, `009b560e`, `c8b14a86`, `d380d53c`, `ddab7b70`); o `dataLocal.js` e o `diaLocal.js`.
