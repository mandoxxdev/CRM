# Etapa 162 (Almoxarifado e Operacional): o dia de Brasília nos relatórios e no painel do Almoxarifado (C401), nos indicadores (C403 — medido), na expiração das reservas (C404) e nos dias em espera das Inspeções (C405) — plano

> Origem: "Próxima tarefa detalhada — Etapa 162" do plano da 161
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa161-respostas-velhas-e-o-dia-local.md`). Etapa de consertos técnicos; o
> design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B1032**, último C **C405**,
> última A **A103**. Esta etapa: **B1033+**, **C406+**, **A104+**. Worktree `CRM-wt-e162`, branch `etapa-e162` (da main `e10912bc`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 3 Important, 8 Minor — todos aceitos; o plano abaixo já está
> corrigido.** **I1** a T2 estava incompleta: mais quatro arquivos calculam o *hoje* em UTC e batem no que a RN-162.04/.07 muda —
> `relatoriosIndicadoresSpec27` (`:48-49`, outro arquivo, não o `indicadoresSpec27Integracao`), `alertaRegistro` (`:32-33`), `alertaCentral`
> (`:37-38`) e `alertaJornada` (`:35-36`) — entram na T2. **I2** a planilha do *Histórico* (e de todo relatório exportável com coluna de
> instante) sai com o `created_at` cru em UTC (`extended.js:2436`), enquanto a tela o mostra na hora local (`formatCelula`): com o filtro no
> dia de Brasília, a movimentação das 22h30 de 19/10 entra no filtro de 19/10 e aparece `2026-10-20 01:30:00` no arquivo — entra a **B1039**
> (o arquivo mostra o instante na hora de Brasília, pela mesma régua da tela). **I3** a massa só estava escrita para os relatórios: a
> RN-162.03, .04, .06 e o alerta *Requisição atrasada* ganham cenário com as três réguas separadas (abaixo, T1). **Minor:** a ordem dos binds
> (um a menos zera em silêncio, um a mais é 500 `SQLITE_RANGE`) — o teste pega o zero; o `referencia` congelado como
> `options.referencia || hojeLocalISO()` (o `''` do cron continua sendo "hoje"); `?` em linha, **sem CTE** (a varredura do registro só captura
> `SELECT`, `relatoriosRegistro.api.test.js:345`); as guardas de meia-noite dos testes que leem o *hoje* uma vez passam à meia-noite de
> Brasília; a frase que justifica mudar o gráfico e a rota sem consumidor (têm dado real e prova por API) e não o C403 (sem escritor nem tela),
> com o gráfico testado; a T4 cruza a 161 com a T1 (não a T3); a guarda da T3 é `getTimezoneOffset() > 0`; o *"hoje"* ao lado de uma data de
> ontem (blocos de 24 h) declarado na B1036; a Sucata tem **duas** colunas (`m.created_at` e `s.destino_registrado_em`) — massa nas duas.

## Fase 0 — medido (antes de qualquer código)

Três leitores em paralelo (relatórios e painel do Almoxarifado; os indicadores do Operacional; a expiração das reservas, os dias em espera
e os indicadores de prazo), conferido aqui nas linhas citadas. Base `test:api` **481/481** rodada às 23h40 locais — **dentro** da janela em
que o dia UTC já é o de amanhã (`scratchpad/e162/base-api.log`).

**C401 — os relatórios e o painel do Almoxarifado.** Todos passam pelo despachante `GET /api/almoxarifado/relatorios/:tipo` e `/:tipo/export`
(`routes/almoxarifado/extended.js:2396`, `:2409`; registro `:2289-2338`). As colunas filtradas são **todas de instante UTC** (prova):
`movimentacoes_almoxarifado.created_at` (`DEFAULT CURRENT_TIMESTAMP`, `schema.js:393`; os dois `INSERT` do motor, `stockService.js:2289`,
`:3071`, não o passam), `recebimentos_material_almoxarifado.data_recebimento` (`DEFAULT CURRENT_TIMESTAMP`, `schema.js:1507`; o único `INSERT`,
`receiptService.js:518`, não o passa) e `sucateamentos_almoxarifado.destino_registrado_em` (`DATETIME`, único escritor
`scrapDisposalService.js:864` = `CURRENT_TIMESTAMP`).

| Relatório (chave) | Função (`reportService.js`) | Linhas | Coluna |
|---|---|---|---|
| Consumo por O.S. (`consumo-os`) | `relatorioConsumoPorOS` | `:154-155` | `m.created_at` |
| Histórico de movimentações (`historico-movimentacoes`) | `relatorioHistoricoMovimentacoes` | `:260-261` | `m.created_at` |
| Ajustes por motivo (`ajustes-por-motivo`) | `relatorioAjustesPorMotivo` | `:293-294` | `mv.created_at` |
| Perdas por motivo (`perdas-por-motivo`) | `relatorioPerdasPorMotivo` | `:338-339` | `mv.created_at` |
| Qualidade de fornecedores (`qualidade-fornecedores`) | `relatorioQualidadeFornecedores` | `:420-421` | `r.data_recebimento` |
| Materiais mais consumidos (`materiais-mais-consumidos`) | `relatorioMateriaisMaisConsumidos` | `:506-507` | `m.created_at` |
| Consumo por período (`consumo-periodo`) | `relatorioConsumoPeriodo` | `:518-519` | `m.created_at` |
| Sucata — financeiro (`sucata-financeiro`, `de`/`ate`) | `relatorioSucataFinanceiro` | `:615-616`, `:626-627` | `m.created_at`, `s.destino_registrado_em` |
| Custo por projeto (`custo-por-projeto`) | `relatorioCustoProjeto` | `:981-982` | `mv.created_at` |

- Nenhum relatório **agrupa** por dia (os `GROUP BY` são por material, motivo, projeto, tipo, fornecedor). A tela dos Relatórios não tem
  período padrão (os campos começam vazios — `RelatoriosAlmoxarifado.js:214`, `:294`); o nome do arquivo baixado já usa o dia local
  (`:361`), mas o **servidor** manda `filename="<tipo>-<dia UTC>.xlsx"` (`extended.js:2447`).
- **O painel** (`GET /api/almoxarifado/dashboard`, `routes/almoxarifado.js:470`): *movimentações hoje* `DATE(created_at) = DATE('now')`
  (`:501`, mostrado no cartão *"Movimentações Hoje"*, `AlmoxarifadoDashboard.js:301-302`); o gráfico de 7 dias (`:523-525`,
  `DATE(created_at) AS dia`, `created_at >= DATE('now','-7 days')`) **não é desenhado** em lugar nenhum (só o estado inicial
  `AlmoxarifadoDashboard.js:49`).
- **`GET /api/almoxarifado/relatorio/movimentacoes-periodo`** (`routes/almoxarifado.js:2144-2155`, `DATE(m.created_at) BETWEEN ? AND ?`):
  **nenhum consumidor** no navegador.
- **Os *Indicadores*** (`relatorioIndicadores`): as janelas `datetime('now','-N days')` (`:731`, `:779`, `:827`, `:847`, `:859`, `:884`) são
  N×24 h, instante UTC contra instante UTC — **o fuso não muda o resultado** (medido; ficam). **Mas o bloco "no prazo"** (`:821-835`) muda:
  `x.dn = date(r.data_necessidade)` é coluna **só de data** (`schema.js:2554`; o navegador manda `type="date"`, o servidor exige
  `AAAA-MM-DD`, `requisitionCreateService.js:96-106`) comparada com `date('now')` (o dia UTC); e `x.de = date(r.data_entrega)` é o dia UTC
  de um **instante** (`data_entrega = CURRENT_TIMESTAMP`, `requisitionService.js:1909`). Entre 21h e meia-noite a janela anda um dia, a
  requisição de prazo hoje ainda não entregue entra como *fora do prazo* em vez de *em aberto no dia*; e a entrega feita entre 21h e 24h do
  dia do prazo conta como **atrasada** a qualquer hora em que o relatório for lido.
- **O alerta *Requisição atrasada*** (`alertRegistry.js:538`, `date(r.data_necessidade) < date('now')`): só data contra dia UTC — atrasada a
  partir das 21h do dia do prazo.
- **Os testes que calculam *hoje* em UTC** (medido): `conferidoSemTrilha`, `estadoForaDaAuditoriaIntegracao`, `relatorioAjustesPorMotivo`,
  `relatorioQualidadeFornecedores` (`SELECT date('now')`), `indicadoresSpec27Integracao` (o `dia()` pelo SQLite e a guarda da meia-noite
  **UTC**, `:69`), `relatoriosRegistro` (o nome do arquivo pelo `toISOString`, `:222`); e os que **fixam a fronteira do dia UTC**:
  `relatorioPerdasPorMotivo` (`:131-136`, `23:59:59`/`00:00:00` UTC) e `relatorioCustoProjeto` (`:295-300`). Os demais da lista (20
  arquivos tocam esses relatórios) usam datas fixas longe da fronteira ou nenhuma data — conferido por `grep`.

**C403 — os indicadores do Operacional: não há tela montada.** Os 17 `date('now')` de `index.js:21859-22175` estão **todos** numa rota só,
`GET /api/operacional/dashboard-mes` (`index.js:21809-22205`), cujo único chamador é `components/mes/DashboardMES.js:32` — exportado em
`routes/lazyModules.js:72`, **importado por ninguém** (o `/fabrica` do `App.js:428-464` não o monta). E as tabelas: `oee_registros`,
`alarmes`, `controle_qualidade` e `manutencao_preventiva` **não têm escritor** nenhum (sempre vazias); a consulta da manutenção (`:22172`)
pede `tipo` e `data_abertura`, que **não existem** na tabela (cai no ramo que zera). Fora dessa rota, nenhum `date('now')` em `/api/operacional/*`.
De passagem (lido no código, AtividadeForm): **editar uma atividade apaga o fim, as horas reais e volta o status para *em andamento*** —
o `PUT /operacional/atividades-colaboradores/:id` (`index.js:21557-21571`) grava `status || 'em_andamento'`, `data_fim || null`,
`horas_reais || null`, e o formulário de edição (`AtividadeForm.js:21-31`, `:77`) não manda nenhum dos três (**C407**, novo).

**C404 — a expiração das reservas.** `processarExpiracao` (`reservationService.js:133-209`), chamada só pela rota
`POST /api/almoxarifado/reservas/processar-expiracao` (`extended.js:986`, `configurar`) e pelo botão da tela (`ReservasAlmoxarifado.js:299`) —
não há agendador. Filtro `:139`: `date(expira_em) < date(COALESCE(?, 'now'))` (o `?` é `body.referencia`). Com saldo: `liberarReserva(...,
{ statusFinal: 'EXPIRADA' })` — devolve o reservado ao livre **sem distribuir** para quem espera; sem saldo: só o `UPDATE`; depois do lote, o
recálculo das requisições donas (`reservaChegadaService.recalcularRequisicoesDasReservas`, que já pega a trava sozinho, `:296-302`).
`expira_em` é coluna **só de data** (`DATE`, `schema.js:1474`; formulário `type="date"`, `ReservasAlmoxarifado.js:559`); único escritor
`criarReservaSemTrava` (`stockService.js:3683-3690`): o explícito cru, ou o padrão `new Date(Date.now() + dias·864e5).toISOString().slice(0,10)`
— o dia **UTC** (a reserva criada entre 21h e 24h ganha um dia a mais). O alerta *Reserva parada* (`alertRegistry.js:563-564`): o tempo
parado (`julianday('now') - julianday(created_at)`, instante × instante — certo) **ou** `date(res.expira_em) < date('now')` (só data × dia
UTC — errado). **Efeito:** a reserva que vence hoje é expirada (e liberada) se a rotina rodar entre 21h e meia-noite, e o alerta a mostra
vencida desde as 21h; a tela de Reservas (desde a 161) só a mostra vencida no dia seguinte. **Testes de antes** usam datas fixas
(`2020-01-01`, `2999-12-31`, `referencia: '2099-01-01'`) e a tolerância de 9–10 dias do padrão (`reservaCicloIntegracao.api.test.js:77`) — nenhum
toca a janela das 21h.

**C405 — os dias em espera.** `InspecoesAlmoxarifado.js:112-115`: `Math.floor((Date.now() - new Date(d).getTime()) / 86400000)` com
`d = p.data_entrada` = o `created_at` do recebimento (`inspectionService.js:533`, `'AAAA-MM-DD HH:MM:SS'` UTC sem `Z`) — lido como hora
local, 3 h depois do real: o decorrido sai 3 h menor (o recebimento de 24h30 atrás aparece *"hoje"*). Mostrado na coluna *Entrada*
(*"hoje"* / *"há N dia(s)"*, `:394`, `:412`); a data logo acima já usa `formatarInstanteDoBanco` (`:64`, `:411`). Nenhum teste cobre o
*"há N dias"* (o `InspecoesAlmoxarifado.test.js:38` usa ISO com `Z`, onde o defeito não aparece).

**Fica no dia UTC, medido, fora desta etapa (C406, novo):** o vencimento do empréstimo de ferramenta e a validade da calibração
(`toolService.js:62`, `:450`, `:512`; `toolReminderService.js:18`, `:23`), a validade de lote (`notificationQueueService.js:444`, `:500`;
`lotService.js:26`, `:216`; `inspectionService.js:27`), o prazo da remessa a terceiro (`notificationQueueService.js:531`), o mês do alerta
(`alertRegistry.js:74`) e a data de entrada da NF padrão (`receiptService.js:1851`) — colunas só de data comparadas com o dia UTC.

**Nenhuma porta de saldo, permissão ou trava entra**, salvo a régua da data da expiração (C404): a expiração **solta sem distribuir** — pela
regra do CLAUDE.md (B441) **não** pega a trava, e esta etapa não muda isso.

## Decisões (letra B — reversíveis)

- **B1033 — os relatórios e o painel do Almoxarifado passam ao dia de Brasília (responde a B1027 pelo caminho reversível).** Escolhido: os
  nove relatórios, a rota sem consumidor `movimentacoes-periodo`, o *movimentações hoje* e o gráfico do painel, pelo `date(col, '-180 minutes')`
  (`diaLocal.modificadorDoFuso`) e o *hoje* pelo `hojeLocalISO`; o nome do arquivo exportado pelo servidor leva o dia local. **Os números
  mudam:** a movimentação (o recebimento, a sucata vendida) feita entre 21h e meia-noite passa a entrar no dia em que foi feita — e o
  *Histórico de movimentações* volta a bater com a lista das Movimentações. **Descartado:** manter UTC (a B1027 — a lista e o Histórico
  continuariam divergindo); `'localtime'` (segue o `TZ` do processo — a mesma razão da B1025).
- **B1034 — os indicadores do Operacional (C403) não mudam.** Medido: a rota (`/api/operacional/dashboard-mes`) não tem tela montada, quatro
  das tabelas nunca recebem dado e a consulta da manutenção pede colunas que não existem — mudar a régua seria código sem prova possível (nenhum
  gesto de usuário chega lá). **Descartado:** consertar às cegas. Fica como aviso (C403 reescrita).
- **B1035 — a expiração automática, o padrão do vencimento e o alerta *Reserva parada* passam ao dia de Brasília (C404).** Escolhido: a régua
  da data e mais nada — `date(expira_em) < date(?)` com `options.referencia || diaLocal.hojeLocalISO()` (o `''`, ausente, `0` continuam sendo
  "hoje"; texto inválido continua não expirando nada — Fase 2 M2); o padrão `hojeLocalISO + N dias` (dias de
  calendário); o alerta `date(res.expira_em) < ?` com o `hojeLocalISO`. A expiração continua **sem** pegar a trava (solta sem distribuir —
  B441) e o recálculo das requisições continua como estava. **Os números mudam:** a reserva que vence hoje não é mais liberada entre 21h e
  meia-noite, e a criada nesse horário não ganha um dia a mais. **Descartado:** não mexer (a tela e a rotina discordariam sobre a mesma
  reserva); mudar a coluna para instante (mudaria o contrato do formulário).
- **B1036 — os *dias em espera* continuam em blocos de 24 h (C405).** Escolhido: só ler o instante como UTC (`lerInstanteDoBanco`).
  **Descartado:** contar dias de calendário (*"ontem"* = 1 dia mesmo com 2 h) — é mudança de régua, não de fuso. **Consequência
  declarada (Fase 2 M7):** o recebimento de ontem às 10h, visto hoje às 9h, mostra a data de ontem e *"hoje"* logo abaixo (menos de 24 h).
- **B1037 — o indicador *requisições no prazo* e o alerta *Requisição atrasada* passam ao dia de Brasília.** O *hoje* pelo `hojeLocalISO`; o
  dia da entrega pelo `date(data_entrega, '-180 minutes')`; o prazo (só data) sem modificador. **Os números mudam:** a entrega feita entre 21h
  e 24h do dia do prazo passa a contar *no prazo*; a requisição de prazo hoje fica *em aberto no dia* até a meia-noite e o alerta só a dá
  atrasada no dia seguinte. **Descartado:** deixar (o indicador acusaria atraso de quem entregou no dia).
- **B1039 — a planilha exportada mostra o instante na hora de Brasília (Fase 2 I2).** Escolhido: no export, o valor no formato do banco
  (`AAAA-MM-DD HH:MM:SS`, o `CURRENT_TIMESTAMP`) sai convertido para a hora de Brasília no mesmo formato — a mesma régua que a tela já usa
  (`formatCelula` trata esse formato como UTC). **Os arquivos mudam:** a coluna *Data* do Histórico (e as de instante dos outros
  exportáveis) passa a bater com a tela e com o filtro. **Descartado:** deixar e declarar (o arquivo pareceria fora do período pedido).
- **B1038 — a próxima etapa (163).**

## Regras de negócio

- **RN-162.01 (C401, relatórios)** — nos nove relatórios da tabela e no `movimentacoes-periodo`, a linha entra se o **dia de Brasília** do
  instante filtrado está no período (`data_inicio`/`data_fim`, ou `de`/`ate` na Sucata), inclusivo. Valor fora do formato continua comparado
  como texto (como hoje).
- **RN-162.02 (C401, painel)** — *movimentações hoje* = as movimentações cujo dia de Brasília é o hoje de Brasília; o gráfico: `dia` = o dia
  de Brasília, dos últimos 7 dias mais hoje (o mesmo alcance de antes, agora em dias locais).
- **RN-162.03 (C401, exportação)** — o arquivo exportado pelo servidor chama `<tipo>-<hoje de Brasília>.xlsx`.
- **RN-162.04 (B1037, indicadores)** — *requisições no prazo*: o prazo (só data) contra o hoje de Brasília (janela `[hoje − N, hoje]`); a
  entrega pelo dia de Brasília do instante; *em aberto no dia* = prazo hoje (Brasília) sem entrega. As janelas de N×24 h dos outros
  indicadores não mudam.
- **RN-162.05 (C404, expiração)** — `POST /reservas/processar-expiracao`: expira a reserva ATIVA cujo `expira_em` (só data) é **anterior** ao
  dia de referência — o `referencia` do corpo, ou o hoje de Brasília. A reserva que vence hoje continua ativa até a meia-noite de Brasília.
  Nada mais muda (sem trava, sem distribuição, o mesmo recálculo).
- **RN-162.06 (C404, padrão)** — a reserva criada sem vencimento vence em `hoje de Brasília + reserva_dias_validade` dias.
- **RN-162.07 (C404/B1037, alertas)** — *Reserva parada*: `expira_em` anterior ao hoje de Brasília (o tempo parado não muda); *Requisição
  atrasada*: `data_necessidade` anterior ao hoje de Brasília.
- **RN-162.09 (B1039, exportação)** — na planilha, o valor no formato do banco (`AAAA-MM-DD HH:MM:SS`) sai na hora de Brasília, no mesmo
  formato; os outros valores (só data, ISO com `Z`, números, texto) saem como estão.
- **RN-162.08 (C405)** — os *dias em espera* das Inspeções pendentes contam do instante real do recebimento (lido como UTC), em blocos de 24 h.

## Contratos (congelados)

- **`GET /api/almoxarifado/relatorios/:tipo`** e **`/:tipo/export`** — mesmas chaves, parâmetros, respostas e códigos; o período pelo dia de
  Brasília (RN-162.01); o `Content-Disposition` do export: `attachment; filename="<tipo>-<AAAA-MM-DD de Brasília>.xlsx"`.
- **`GET /api/almoxarifado/relatorio/movimentacoes-periodo`** — mesma resposta; RN-162.01.
- **`GET /api/almoxarifado/dashboard`** — mesmas chaves; `movimentacoesHoje` e `graficoMovimentacoes[].dia` pelo dia de Brasília (RN-162.02).
- **`GET /api/almoxarifado/relatorios/indicadores`** — mesma forma; `requisicoes_no_prazo` pela RN-162.04.
- **`POST /api/almoxarifado/reservas/processar-expiracao`** — mesmo portão (`configurar`), mesmo corpo (`referencia` opcional), mesma
  resposta; RN-162.05.
- **`POST /api/almoxarifado/reservas`** (e as reservas das requisições) — mesmo contrato; o `expira_em` padrão pela RN-162.06.
- **`GET /api/almoxarifado/alertas/central`** (e a varredura que enfileira) — mesma forma; RN-162.07.
- **Servidor:** nenhum utilitário novo — o `diaLocal.js` da 161 (`modificadorDoFuso`, `hojeLocalISO`) é parâmetro (`?`) em toda consulta
  (nunca interpolado no texto do SQL), em linha — **sem CTE** (a varredura do registro só captura `SELECT`). Nenhum código nem mensagem nova;
  nenhum parâmetro novo vem do usuário. Somar dias a um `AAAA-MM-DD`: `date(?, '+N days')` no SQLite ou `Date.UTC` no JS — nunca `new Date(texto)`.
- **Navegador:** `lerInstanteDoBanco` (`utils/dataLocal.js`, da 161).

## Tasks (sort topológico)

- [x] **T1 (tronco, servidor)** — `e2d2306c` (com a T2 e a T4, um assunto: a régua do dia no servidor). — RN-162.01 a .07 em `reportService.js`, `routes/almoxarifado.js`, `routes/almoxarifado/extended.js` (o nome do
  arquivo), `reservationService.js`, `stockService.js`, `alertRegistry.js`. Teste novo `server/tests/api/diaLocalDosRelatoriosEReservas.api.test.js`
  pelo `index.js` real (molde: `respostasVelhasEDiaLocal.api.test.js`), com o filho em `TZ=UTC` e o relógio do JavaScript adiantado para as 22h de
  Brasília de daqui a dois dias (o hoje local, o dia UTC do JS e o `date('now')` do SQLite são três dias diferentes a qualquer hora). Massa com
  números **diferentes** de cada lado da régua (a lição do r3 da 161): em cada relatório o ato das 22h30 do dia D (gravado D+1 01h30 UTC, quantidade
  3) e o das 01h30 do dia D+1 (gravado D+1 04h30 UTC, quantidade 5) — o período D tem o 3 e não o 5; o D+1 o 5 e não o 3; na Sucata, o par nas **duas** colunas (a movimentação SUCATA e a venda).
  E as portas de *hoje* (no filho, hoje local = HOJE, dia UTC do JS = HOJE+1, `date('now')` = HOJE−2 ou HOJE−1): RN-162.02 (*movimentações
  hoje* e o gráfico, com a borda dos 7 dias); RN-162.03 (`<tipo>-HOJE.xlsx`); RN-162.04 (prazo D entregue às 22h de D = *no prazo*; prazo HOJE
  sem entrega = *em aberto no dia*); RN-162.05 (vence HOJE fica, vence HOJE−1 expira); RN-162.06 (`reserva_dias_validade = 1` → `HOJE+1`);
  RN-162.07 (a reserva e a requisição de HOJE fora do alerta, as de HOJE−1 dentro); RN-162.09 (a coluna *Data* do arquivo na hora de Brasília).
- [x] **T2 (servidor, junto da T1)** — `e2d2306c` (12 arquivos). — os testes antigos que calculam *hoje* ou a fronteira do dia em UTC passam ao dia de Brasília (os 8
  arquivos da Fase 0 e os 4 da Fase 2 I1; as guardas de meia-noite passam à de Brasília) — senão passam a falhar só entre 21h e meia-noite. Cada mudança declarada no plano (testes antigos mudados ≠ 0).
- [x] **T3 (galho, navegador)** — `d5c430b4`. — RN-162.08 em `InspecoesAlmoxarifado.js`, com teste no `client/src/components/almoxarifado/Etapa162Almoxarifado.test.js`
  (o relógio do Jest fixo; o recebimento de 24h30 atrás é *"há 1 dia"*, o de 23h30 é *"hoje"*; guarda `getTimezoneOffset() > 0`, que derruba em UTC e a leste). Pequeno — o
  condutor faz (sem executor em paralelo; declarado).
- [x] **T4 (integração — cruza a lista da 161 com a T1, não a T3)** — `e2d2306c` (no teste do servidor). — no teste do servidor: a mesma movimentação das 22h30 entra no dia D pela lista das Movimentações (161),
  pelo *Histórico de movimentações* e pelo *movimentações hoje* do painel (quando D é o hoje do filho); e a reserva que vence hoje: não expira pela
  rota, não aparece no alerta, e a de ontem sai pelas duas.

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. O modificador **só** em coluna de instante; coluna só de data (`expira_em`, `data_necessidade`) compara com o hoje local.
3. O modificador e o hoje entram como parâmetro (`?`), nunca no texto do SQL.
4. A expiração não ganha trava nem distribuição (B441) — só a data muda.
5. Nenhuma porta de saldo, permissão ou trava muda.

## Execução — o que divergiu do plano

- **T1, T2 e T4 num commit só** (`e2d2306c`): a régua do dia no servidor é um assunto; os testes antigos mudados são a consequência dela (sem
  eles a suíte fica vermelha entre 21h e meia-noite).
- **A T3 não foi para executor em paralelo** (era uma função e um teste): o condutor fez, em sequência — paralelismo 0, declarado.
- **A B1039 entrou pela Fase 2 (I2)** — a planilha com a hora de Brasília; o plano original não a previa.
- **O teste do servidor achou dois erros dele mesmo na primeira rodada** (o campo do *Ajustes por motivo* é `ajustes`, não `lancamentos`; o
  recebimento precisa de `numero` único) — corrigidos antes do commit. **Controle positivo:** contra o código de antes (os seis arquivos de
  produção em `e10912bc`), 11 dos 13 cenários caem (os dois que ficam verdes são o utilitário novo e a guarda do relógio); as duas fronteiras
  fixas mudadas (*Perdas*, *Custo por projeto*) caem com o `reportService.js` de antes; o teste do navegador cai com o `InspecoesAlmoxarifado.js`
  de antes (recebe *"hoje"* onde espera *"há 1 dia"*).
- **Os 12 testes antigos mudados só rodaram fora da janela das 21h** (perto da meia-noite e de madrugada): a mudança deles (o *hoje* de
  Brasília) é lida, não executada às 22h — declarado em F (162).

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo, sob a trava)

- **r1 (regra) — 1 Minor real + 2 informativos.** Sonda executada com o relógio fixo às 22h45 de Brasília (os nove relatórios com filtros
  extras, a ordem dos 10 binds dos indicadores, o painel e a borda dos 7 dias, a planilha, a expiração com `{}`/`''`/`0`/`'abc'`/juliano, o
  padrão do vencimento nas viradas de mês, ano e bissexto, os alertas pela central e pela varredura da fila). **Achado:** o painel do
  Almoxarifado mandava o período dos quadros *Consumo por O.S.* e *Materiais mais consumidos* pelo dia UTC (`getPeriodDates`,
  `toISOString`) — com o servidor lendo o dia de Brasília, das 21h a meia-noite o quadro perdia o dia mais antigo (reproduzido: 6 → 4).
  **Informativos:** a planilha converte também texto livre no formato do banco (como a tela — declarado); a data impossível (`2026-02-30
  10:00:00`) era rolada para março.
- **r2 (autorização) — 0 achados.** O `index.js` real em pasta vazia na HEAD e na base, 57 rotas × 12 usuários: matrizes 401/403/200
  idênticas. Nenhum valor do usuário cai na posição do modificador (sonda das 10 funções com controle positivo: 21 posições, 0 falhas; o
  controle com os binds trocados acusa 2). **Minor (o mesmo do r1):** a data impossível e o ano `0000` na planilha. **Observação:** o
  `referencia: 'now'` explícito continua sendo o dia UTC (só o administrador chama — declarado).
- **r3 (sabotagem, worktree própria `CRM-wt-e162-r3`) — 82 rodadas: 68 caíram pela asserção certa (2 só nos testes antigos), 2 controles, 8
  sobreviveram (4 achados), 0 inalcançável.** **S1** o *Movimentações Hoje* sem o modificador: a massa dava 2 dos dois lados (a colisão da lição
  da 161, de novo); **S2** o teto da janela do *no prazo* = amanhã: nenhum prazo de amanhã na massa; **S3** o piso da janela: nenhum prazo na
  borda; **S4** o `||` → `??` da `referencia`: nenhum teste mandava `''`. **Fragilidade:** a leitura como UTC na planilha (o `Z`) só era
  provada pelo unitário, que roda no fuso da máquina.
- **Correção da Fase 5 (`e1ac2cfa`):** o período do painel no dia local (`AlmoxarifadoDashboard.js`, com teste no navegador); a data impossível e
  o ano antes de 1900 voltam como estão na planilha; as asserções de S1–S4 (o painel com 3 × 2, o *no prazo* com prazo amanhã e com a janela
  de 5 dias, a `referencia` vazia e o corpo vazio) e a guarda de fuso do unitário (derruba em UTC). **Controles da correção (todos caíram
  pela asserção do cenário deles):** F1–F10 no servidor (P3, I2, I5, I1, I14, I4, I13, E5, D1 reaplicadas e a guarda da data impossível
  retirada — `scratchpad/e162/controles-f5.txt`) e o do painel no navegador (com o `AlmoxarifadoDashboard.js` de antes: `2026-09-21`..`2026-10-21`).

## Suítes (lidas na saída, `scratchpad/e162/`)

- **Base (antes de qualquer código, `base-api.log`, às 23h40 locais — dentro da janela):** `test:api` **481/481**.
- **Bateria 1 — antes de `e2d2306c`/`d5c430b4` (`b1-*.log`, ~00h10):** `test:api` **482/482** (`diaLocalDosRelatoriosEReservas` **13/0**);
  `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **165** suítes / **2087** testes; `CI=true build`
  *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts (*"TODOS OS INVARIANTES OK"*) + editor **39/39**.
- **Bateria 2 — antes de `e1ac2cfa` (depois da Fase 5, `b2-*.log`, ~01h20 — fora da janela; é também a do fechamento: depois só mudaram
  documentos):** `test:api` **482/482** arquivos (`diaLocalDosRelatoriosEReservas` **13/0**); `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **165** suítes / **2088** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória da proposta **23/23** + editor **39/39**.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (o período do painel, a data impossível e as asserções). As tasks ficaram verdes na
   primeira aplicação depois de duas correções do próprio teste novo (o nome do campo e o `numero` único). **Testes antigos mudados: 12**
   (todos por causa da régua: o *hoje* e duas fronteiras de meia-noite UTC).
2. **Achados da revisão:** Fase 2 — **0 Critical + 3 Important + 8 Minor**, todos reais (o mais caro: a lista de testes antigos incompleta —
   quatro arquivos dos alertas e dos indicadores falhariam só entre 21h e meia-noite; e a planilha que passaria a discordar do próprio filtro).
   Fase 5 — r1 **1** real (o período do painel) + 2 informativos; r2 **0** (1 Minor, o mesmo do r1); r3 **4** faltas de asserção reais (8
   sabotagens sobreviventes) + 1 fragilidade; **0** ruído. **O que mais pesou:** de novo a **massa com o mesmo número dos dois lados da régua**
   (o *Movimentações Hoje* 2 = 2) — a lição do r3 da 161 repetida no primeiro cenário de contagem que não a aplicou; e as **bordas de janela**
   (teto e piso) que nenhuma massa tocava.
3. **Paralelismo:** **0** galhos de código em paralelo (a T3 era uma função — o condutor fez); **3** leitores na Fase 0, **1** revisor na Fase
   2, **3** revisores em paralelo na Fase 5 (o r3 na worktree própria, 82 rodadas sob a trava) — **0** incidente de trava, **0** retrabalho.
4. **Defeito que escapou:** **0 de código** até o fechamento da Etapa 163 (que mexeu nas réguas vizinhas — as validades — e cujos três
   revisores da Fase 5 não acharam defeito nas réguas da 162). **1 de medição:** a C406 desta etapa listava *"o vencimento da conta a pagar sem
   data de entrada"* como defeito vivo — **estava errado**: o padrão é inalcançável (o processamento recusa a nota sem data de entrada antes,
   `receiptService.js:1387`/`:1946`); e a C407 descrevia um gesto de tela (*"o formulário de edição não manda"*) que não existe — a tela de
   Atividades não abre a edição (Fase 0 da 163).

## Próxima tarefa detalhada — Etapa 163

*(A série desta etapa foi B1033–B1039, C401, C404 e C405 resolvidos, C403 medido e reescrito, C406 e C407 novos, nenhuma A — a 163 começa em
**B1040**, **C408**, **A104**; confira com `grep -oE` antes.)*

**Escolhida: editar uma atividade de colaborador sem apagar o fim (C407) e o dia de Brasília nas datas sem hora que sobraram (C406).**
(1) **C407** — `PUT /api/operacional/atividades-colaboradores/:id` (`index.js:21557-21571`) grava `status || 'em_andamento'`, `data_fim || null`,
`horas_reais || null`, e o `AtividadeForm.js` (`:21-31`, `:77`) não manda os três: **reproduzir antes** pela rota (concluir uma atividade e
editá-la — o status volta a *em andamento*, o fim e as horas somem; conferir também o `UPDATE colaboradores` do mesmo PUT). Conserto reversível
provável: o PUT só grava o que veio (distinguindo *ausente* de *vazio*), sem mudar o contrato do POST nem quem pode — medir antes quem mais chama
o PUT (a tela de Atividades conclui por ele, `AtividadesColaboradores.js:52`, mandando `data_fim` pelo `toISOString`). (2) **C406** — colunas
**só de data** comparadas com o dia UTC: o empréstimo e a calibração de ferramentas (`toolService.js:62`, `:450`, `:512`;
`toolReminderService.js:18`, `:23` — também a calibração vigente que a inspeção exige), a validade de lote (`lotService.js:26`, `:216` — o selo
*vencido*; `notificationQueueService.js:444`, `:500` — o aviso), o prazo da remessa (`notificationQueueService.js:531`), o mês do alerta
(`alertRegistry.js:74`) e o vencimento da conta a pagar sem data de entrada (`receiptService.js:1851`). Régua: o `hojeLocalISO` do
`diaLocal.js`, **sem** modificador (são colunas só de data). **Medir antes** os testes que calculam *hoje* em UTC nesses fluxos (`alertaRegistro`
usa `diasAtras`/`diasAFrente` UTC para a calibração — a 162 criou o `diasAtrasLocal` só para a requisição e a reserva; `alertasNovos`,
`recebimentoReservaChegadaIntegracao` e afins usam `date('now','-1 day')`). **A validade de lote que a inspeção ou a saída recusa é regra de
saldo** — se alguma porta de saldo depender dela, só a régua da data e mais nada, com o teste às 22h (relógio adiantado), respeitando a trava
(CLAUDE.md). **Pontos de atenção:** (1) a trava de máquina (um `test:api` por vez); (2) a massa com números **diferentes** dos dois lados de cada
régua e **as bordas** de cada janela (as lições do r3 da 161 e da 162); (3) o modificador **só** em coluna de instante; (4) nenhuma porta de
permissão muda.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332** e ligar o painel antigo (*Dashboard
MES*, **C403** — se for ligado a um menu, consertar antes a régua do dia e a consulta da manutenção); do Comercial, a **C354**, a **C357**/**B988**,
a **C359**/**B989** (e a **C360** junto), a **C358**, a **C383**, ignorar também o acento nas buscas (**B1013**, **B1019**) e o resto da **C382**
(**B1016**); do núcleo, a **C362**; da 160, o filtro *Status* dos Materiais (**C398**) e os tipos do filtro das Movimentações e o material de
cliente nos seletores das Reservas/Inspeções (**C399**); da C400, acrescentar a descrição da OS à busca das OPs (muda o resultado); da 162, contar
os *dias em espera* em dias de calendário (**B1036** — é régua). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** o `diaLocal.js` (`hojeLocalISO`, `modificadorDoFuso`, `instanteDoBancoNoFuso`) e o
`dataLocal.js` do navegador; os nove relatórios, o painel, a planilha, o indicador *no prazo*, os alertas de prazo e de reserva, a expiração e
o vencimento padrão (`e2d2306c`, `e1ac2cfa`); os dias em espera (`d5c430b4`); o período do painel (`e1ac2cfa`).
