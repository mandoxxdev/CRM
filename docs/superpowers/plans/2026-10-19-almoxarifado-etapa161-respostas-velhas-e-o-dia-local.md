# Etapa 161 (Fábrica e Almoxarifado): as listas que mostravam a resposta de um pedido que não é o último (C396), o dia em UTC (C397) e as sobras técnicas da C399/C400 — plano

> Origem: "Próxima tarefa detalhada — Etapa 161" do plano da 160
> (`docs/superpowers/plans/2026-10-19-almoxarifado-etapa160-filtros-da-fabrica-e-do-almoxarifado.md`). Etapa de consertos técnicos; o
> design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-19): última B **B1024**, último C **C400**,
> última A **A103**. Esta etapa: **B1025+**, **C401+**, **A104+**. Worktree `CRM-wt-e161`, branch `etapa-e161` (da main `256f4f05`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 4 Important, 11 Minor — todos aceitos; o plano abaixo já está
> corrigido.** **I1** a frase "as telas irmãs já acrescentam o `Z`" estava **errada**: o Extrato do material (`ExtratoMaterialModal.js:40`,
> `:253`), as últimas movimentações do painel (`AlmoxarifadoDashboard.js:535`, `:564`), Recebimentos (`:944`, `:1136`) e Requisições
> (`:1289`, `:1439`, `:1497`) mostram o `created_at` sem `Z` — com só a lista consertada, a mesma movimentação apareceria 19/10 22:30 na
> lista e 20/10 01:30 no Extrato. Entram (B1026 ampliada; o leitor do instante vai para a T1). **I2** o truque `D 01:00Z`/`D 04:00Z` não prova
> o *hoje* das colunas só de data (presente hoje, status de trabalho, atrasadas): fora das 21h–24h o `date('now')` antigo e o hoje local
> coincidem e a sabotagem passa — o processo filho do teste sobe com um *preload* que adianta o relógio do JavaScript em 2 dias (o hoje novo
> vem do JS, o antigo do SQLite: divergem sempre); e cada cenário de instante ganha a metade positiva. **I3** as Remessas a terceiros
> (`RemessasTerceirosAlmoxarifado.js:141`, `:690-697`) usam a mesma rota de fornecedores com o corte nos 50 — entram na RN-161.09. **I4**
> Presença (`ControlePresenca.js:17-34`), Atividades (`AtividadesColaboradores.js:18-23`) e Horas extras (`HorasExtras.js:18-21`) também
> não descartam o pedido velho — entram na RN-161.01. **Minor:** a busca de fornecedores com `escapar` (o texto vale como texto) e, se
> falhar, as opções ficam como estavam (sem aviso, como hoje); o 500 da rota nova é inalcançável (constante em memória) — declarado, sem
> teste; o nome do arquivo exportado dos Relatórios usa o dia UTC (`:345`) — entra; o `todayISO` do servidor da produção passa a ser o
> local (conserta também a OP gravada sem data planejada, `producaoService.js:260`); `atividades_colaboradores.data_inicio` é o texto do
> `datetime-local` (hora local sem `Z`) — **não** leva deslocamento, e a edição da atividade (`AtividadeForm.js:32`) passa a mostrar a hora
> local; a OS aberta pelo Comercial (`OSComercialForm.js:28`) entra na B1028; o `hojeLocalISO` do servidor **muda de casa** para o
> `diaLocal.js` (o de Compras passa a delegar — sem segunda cópia); o leitor do instante fica no `dataLocal.js` da T1 (sem conflito de
> galhos); o fuso do teste do navegador: a guarda derruba em `TZ` UTC (a máquina deste projeto é UTC−3; declarado); o QR — editar volta
> sem o `?material_id` (o filtro some), inativar esvazia a lista, o filtro do QR soma com os outros filtros (declarado); a busca de
> fornecedores tem portão só de login (exposição: B1031); os Relatórios da produção zeram os dados ao trocar de aba (senão a aba nova
> desenha a resposta da anterior até a nova chegar); a lista de pedidos pendentes do Recebimento deixa de se atualizar ao trocar o filtro
> (declarado na RN-161.12).

## Fase 0 — medido (antes de qualquer código)

Régua: o componente que a rota do `App.js` monta (pelo `routes/lazyModules.js`); para cada lista, a função que carrega, quem a dispara e
quem mais a chama, e se a resposta/erro/carregando de um pedido que não é o último é descartado; para as datas, como a coluna é gravada
(instante UTC ou só a data) e como é filtrada e mostrada. Três leitores em paralelo (Fábrica; Almoxarifado; datas das Movimentações e
C399/C400), conferido aqui nas linhas citadas. Medido às 21h33 locais — **dentro** da janela em que o dia UTC já é o de amanhã.

**C396 — nenhuma das 13 listas descarta a resposta de um pedido anterior** (os guardas que existem cobrem só detalhe, modal e opções):

| Tela (componente montado) | Função que carrega | Disparo | Outros chamadores |
|---|---|---|---|
| OPs (`producao/OrdensProducao`) | `load` `:18-35` (`Promise.all` com `fetchProducaoMeta`) | `[search, filtroStatus]`, sem pausa | `mudarStatus` `:44`, `excluir` `:56` |
| Máquinas (`producao/MaquinasProducao`) | `load` `:24-38` (com `fetchProducaoMeta`) | `[search]`, sem pausa | `salvar` `:63`, `excluir` `:76` |
| Colaboradores (`operacional/Colaboradores`) | `loadColaboradores` `:31-44` | `[search, filterStatus, filterSetor, filterTrabalho]` + `setInterval` 30 s | excluir, disponibilidade, o formulário |
| Equipamentos (`operacional/Equipamentos`) | `loadEquipamentos` `:21-34` | `[search, filterStatus]` | excluir, o formulário |
| Relatórios da produção (`producao/RelatoriosProducao`) | `load` `:20-37`, um pedido por aba, **um** estado `dados` para as três | `[aba, dataInicio, dataFim]` | *Atualizar* `:47` |
| Movimentações (`MovimentacoesAlmoxarifado`) | `loadMovimentacoes` `:489-503` | montagem `[]` **e** `[tipo, dataInicio, dataFim]` com 300 ms (dois GETs na abertura) | salvar `:618`, estorno `:664`, *Atualizar* `:700` |
| Requisições (`RequisicoesList`, as duas rotas) | `loadRequisicoes` `:558-581` | `[filtroStatus, filtroMinha, filtroAprovacoesValor]` | ~20 ações com `await` (`:624`–`:1536`) |
| Recebimentos (`RecebimentosAlmoxarifado`) | `loadRecebimentos` `:279-298` | `[filtroStatus, filtroEtapa]` — **o mesmo efeito** (`:300-304`) recarrega materiais, pedidos e fornecedores (4 GETs por troca — C400) | 7 ações |
| Reservas (`ReservasAlmoxarifado`) | `loadReservas` `:102-116` | `[status, material, projeto]` | 5 ações |
| Inspeções (`InspecoesAlmoxarifado`) + aba Histórico (`HistoricoInspecoes`) | `loadPendentes` `:143-155`; `loadHistorico` `:61-77` | `[materialFilter]` | decisão `:276`, *Atualizar* `:329` |
| Não conformidades (`NaoConformidadesAlmoxarifado`) | `carregar` `:294-320` | `[status, origem, execucao]` + `recarga` | 4 ações via `setRecarga` |
| Painel do Almoxarifado (`AlmoxarifadoDashboard`) | `loadRelatorios(dias)` `:93-102` (2 GETs) | `[periodoDias]` (dois selects, um estado) | `loadDashboard` `:114` |
| Relatórios do Almoxarifado (`RelatoriosAlmoxarifado`) | `handleConsultar` `:296-331` | clique; a troca de relatório (`selecionarRelatorio` `:287-294`) zera os dados mas **não** o *carregando* nem a consulta em voo | — |

**O cenário dos Relatórios se reproduz** (lido no código): consultar A, trocar para B com A em voo → a resposta de A grava os dados **e** os
parâmetros de A (`:319-320`) sob o relatório B: a tela mostra as linhas de A com as colunas de B, e *Exportar XLSX* (`:339-341`) pede
`/relatorios/B/export` com os parâmetros de A. A falha de A mostra o erro de A na tela de B. Os Relatórios da produção têm a mesma forma
(as três abas num estado só): a resposta de uma aba pode ser desenhada pela outra.

**C397 — o dia em UTC.** Medido por coluna (a forma decide o conserto — conferido no SQLite: `date('2026-10-20T01:30:00.000Z','-180 minutes')`
= `2026-10-19`, com ou sem o `Z`; **mas** `date('2026-10-19','-180 minutes')` = `2026-10-18`: o deslocamento só vale para coluna de
**instante**, nunca para coluna só de data):

- **Instantes UTC:** os apontamentos e as paradas (`data_inicio`/`data_fim` = `toISOString()`, `producaoService.js:369`, `:399`, `:456`,
  `:479`); a OP (`data_inicio`/`data_fim` `:313`, `:319`; `created_at` = `CURRENT_TIMESTAMP`); as movimentações (`created_at` =
  `CURRENT_TIMESTAMP`, `schema.js:381`; os dois `INSERT` do motor não o passam).
- **Só a data:** a presença (`controle_presenca.data`, o `AAAA-MM-DD` que a tela manda — `PresencaForm.js:10` o calcula em **UTC**); a
  `data_prevista_fim` da OP (`type="date"`).
- **O que filtra/agrupa pelo dia UTC:** apontamentos e paradas (`date(x.data_inicio) >= date(?)`, `:350-351`, `:437-438`); os três
  relatórios da produção (`:594-630`, e o padrão `todayISO()`/início do mês em UTC, `:24`, `:592`, `:607`, `:619`); o painel da produção
  (`date('now')` em `:73`, `:75`, `:78-79`, `:86`, `:100`, `:103`); o *presente hoje* dos colaboradores (`index.js:20135`, `:20222` —
  `cp.data = date('now')`: depois das 21h o presente de hoje aparece *"ausente"*); a lista das Movimentações (`DATE(m.created_at)`,
  `routes/almoxarifado.js:1253-1254`).
- **O que mostra:** a lista das Movimentações (`formatDate` `:688-690`) lê `'2026-10-20 01:30:00'` **sem** `Z` como hora local — mostra
  *01:30 de 20/10* para o ato das 22:30 de 19/10 (3 h adiantada); as telas irmãs (Auditoria `:84`, Alertas, Notificações, Relatórios…) já
  acrescentam o `Z`. Apontamentos e paradas mostram certo (`toLocaleString` de ISO com `Z`).
- **No navegador:** `toISOString().slice(0,10)`/`split('T')[0]` como *hoje* — filtro da Presença (`ControlePresenca.js:12-13`), fim dos
  Relatórios da produção (`:15`; o início do mês `:10` dá certo em UTC−3 por acaso), e os padrões gravados dos formulários: presença
  (`PresencaForm.js:10`), hora extra (`HoraExtraForm.js:10`), abertura da OS (`OSForm.js:29`), data planejada da OP
  (`OrdemProducaoFormPage.js:17`), início da atividade (`AtividadeForm.js:14`, `datetime-local` com a hora UTC — 3 h adiantada). Não há
  utilitário de data local no `client/src/utils` (há três cópias de `hojeISO` em Compras e Ferramentas).
- **O que já existe no servidor:** `auditFiltros.js` (`FUSO_PADRAO = 'America/Sao_Paulo'`, `offsetMinutos`, `janelaUtc` — a Auditoria já
  filtra pelo dia local) e `hojeLocalISO` (`pedidoCompraService.js:985`). Nenhum `'localtime'` no servidor.
- **Fica UTC (medido, não muda nesta etapa — C401):** os relatórios do Almoxarifado que filtram por `DATE(created_at)` — *Consumo por
  O.S.*, *Histórico de movimentações*, *Ajustes por motivo*, *Perdas por motivo*, *Materiais mais consumidos*, *Consumo por período*,
  *Sucata (financeiro)*, *Custo por projeto*, *Qualidade de fornecedores* (`reportService.js:154`…`:982`) — e o painel do Almoxarifado
  (*movimentações hoje*, o gráfico de 7 dias, `routes/almoxarifado.js:500`, `:522`). São 9 relatórios com ~17 arquivos de teste, vários
  calculando *hoje* em UTC (medido: 9 arquivos) — mudar junto é uma etapa própria (ver B1027).

**C399/C400 — os itens técnicos:**

- **Setor dos Colaboradores** (`Colaboradores.js:170`): as opções saem da lista **já filtrada** — escolher um setor some com os outros. E o
  *Trabalho* (filtro do navegador, `:111-117`) está nas dependências do efeito: recarrega do servidor à toa.
- **Evento das Notificações** (`NotificacoesAlmoxarifado.js:31-46`): 10 eventos fixos; a fila também grava as **15** chaves do
  `ALERT_REGISTRY` (`alertRegistry.js:414`, `evento: entrada.chave`, `notificationQueueService.js:606`, `:660`) — impossível filtrar por
  elas. Não há rota de eventos; a da fila (`extended.js:2061`) compara `evento = ?` exato.
- **Fornecedores do recebimento** (`RecebimentosAlmoxarifado.js:316-336`, `:1394-1402`): carrega uma vez, sem `search` — o servidor corta
  nos 50 primeiros em ordem alfabética (`receiptService.js:2879-2892`, que já aceita `search`, com `LIKE` cru).
- **Usuários da Auditoria** (`extended.js:2234-2235`): `SELECT DISTINCT usuario_id, usuario_nome` — o nome é retrato de cada linha, então o
  usuário renomeado aparece duas vezes (com a mesma `key` no React); o filtro manda o id, então as duas dão o mesmo resultado.
- **QR da etiqueta** (`etiquetasPdf.js:26-31` codifica `?material_id=<id>`): a tela acha o material pelo id e põe o **código** na busca
  (`MateriaisAlmoxarifado.js:67-77`) — a busca é parcial, `MAT-001` lista também `MAT-0010`.
- **Recebimentos** (`:300-304`): trocar o filtro recarrega materiais, pedidos e fornecedores.

**Nenhuma porta de saldo, permissão ou trava entra.** Todas as rotas mexidas são leituras; a rota nova (`/notificacoes/eventos`) tem o
mesmo portão da lista que a consome.

## Decisões (letra B — reversíveis)

- **B1025 — o dia da Fábrica e o filtro das Movimentações passam a ser o de Brasília.** Escolhido: o dia de um instante gravado em UTC é
  o do fuso do negócio (`FUSO_PADRAO`), pelo deslocamento do fuso no SQLite (`date(col, '-180 minutes')`); a coluna que já guarda só a
  data (presença, prazo da OP) é comparada com o *hoje* local calculado no JavaScript. **Os números mudam:** entre 21h e meia-noite, o que
  entrava no dia seguinte passa a entrar no dia certo — nos relatórios da produção (por dia, eficiência, paradas), nos filtros de
  apontamentos/paradas, no painel da produção (*paradas/apontamentos de hoje*, *atrasadas*, *concluídas no mês*), no *presente hoje* dos
  colaboradores, e no filtro de data da lista das Movimentações. **Descartado:** `'localtime'` do SQLite (segue o `TZ` do processo — o
  `Dockerfile` o fixa, a máquina de teste não, e a Auditoria já escolheu a constante); gravar em hora local (mudaria o banco inteiro).
  **Limite declarado:** o deslocamento é o de agora, aplicado a todas as linhas (o Brasil não tem horário de verão desde 2019 — a mesma
  premissa da `auditFiltros.js`).
- **B1026 — a hora mostrada na lista das Movimentações passa a ser a de Brasília** (era a UTC lida como local: 3 h adiantada) — junto do
  filtro, senão o ato das 22h30 apareceria como *19/10 22:30* e sairia do filtro do dia 19. **Descartado:** consertar só uma das duas.
- **B1027 — os relatórios e o painel do Almoxarifado continuam no dia UTC (C401).** Escolhido: esta etapa conserta a lista das
  Movimentações (o item nomeado) e deixa os 9 relatórios e o painel para uma etapa própria. **Consequência declarada:** entre 21h e
  meia-noite, o mesmo período pode dar movimentações diferentes na lista e no *Histórico de movimentações*. **Descartado:** mudar os 9 agora
  (17 arquivos de teste, 9 calculando *hoje* em UTC — risco de suíte que falha conforme a hora; merece medição dedicada).
- **B1028 — as datas padrão dos formulários da Fábrica passam a ser o dia/hora local.** A presença, a hora extra, a abertura da OS, a data
  planejada da OP e o início da atividade vinham com o dia UTC (depois das 21h, *amanhã*) — e são **gravados** se a pessoa não mexer.
  **Descartado:** só o filtro (a presença lançada às 22h ia para o dia seguinte e o *presente hoje* não a acharia).
- **B1029 — a rota nova `GET /almoxarifado/notificacoes/eventos`** (contrato abaixo), com o portão da lista (`gerenciar_notificacoes`).
  **Descartado:** copiar as 15 chaves no navegador (desatualiza quando o registro ganhar alerta); usar `/alertas/central` (portão diferente,
  `ver_alertas`).
- **B1030 — o nome do usuário nas opções da Auditoria é o da linha mais recente da trilha.** **Descartado:** o nome atual do cadastro de
  usuários (outra tabela; o usuário apagado sumiria das opções).
- **B1031 — a busca de fornecedores do Recebimento e das Remessas alcança todos os fornecedores ativos** (antes, os 50 primeiros). O
  portão da rota é só o login (de antes): quem abre o Recebimento passa a achar qualquer fornecedor ativo pelo nome ou CNPJ. **Descartado:**
  pôr portão de perfil na rota (mudaria quem abre o formulário — é regra de autorização, não desta etapa).
- **B1032 — a próxima etapa (162).**

## Regras de negócio

- **RN-161.01 (C396, Fábrica)** — OPs, Máquinas, Colaboradores, Equipamentos, Presença, Atividades, Horas extras e Relatórios da produção: só o **último** pedido da lista mexe
  na tela — a resposta, o erro (o aviso) e o fim do *carregando* de um pedido anterior são descartados. Vale para qualquer chamador da
  função (filtro, excluir, salvar, o intervalo de 30 s dos Colaboradores). Nos Relatórios da produção a troca de aba também invalida e zera os dados (a aba nova não desenha a resposta da anterior).
- **RN-161.02 (C396, Almoxarifado)** — Movimentações, Requisições, Recebimentos, Reservas, Inspeções (pendentes e histórico), Não
  conformidades e o painel ao trocar o período: idem. Quem chama com `await` continua recebendo uma promessa que resolve (o descarte é
  `return`, nunca erro).
- **RN-161.03 (C396, Relatórios do Almoxarifado)** — trocar de relatório invalida a consulta em voo: a resposta e o erro dela são
  descartados e o *Consultar* do relatório novo volta a valer na hora. A exportação usa o tipo **e** os parâmetros da última consulta
  bem-sucedida **do relatório que está aberto**.
- **RN-161.04 (C397, servidor da Fábrica)** — apontamentos e paradas (`?data_inicio`/`?data_fim`), os três relatórios da produção (os
  padrões: o dia 1 do mês local e o hoje local; o `porDia.dia` é o dia local) e o painel da produção: o dia de um instante é o de Brasília;
  a coluna só de data (a `data_prevista_fim`) é comparada com o hoje local. O *presente hoje* e o *status de trabalho* dos colaboradores:
  `controle_presenca.data` = o hoje local. O `todayISO` do serviço da produção é o hoje local (também o padrão da `data_planejada` gravada).
  `atividades_colaboradores.data_inicio` é hora local sem `Z` — **sem** deslocamento.
- **RN-161.05 (C397, navegador da Fábrica)** — o filtro padrão da Presença e dos Relatórios da produção, e os padrões dos formulários
  (presença, hora extra, abertura da OS — também a do Comercial —, data planejada da OP; início da atividade com a hora local, e a
  edição da atividade mostrando a hora gravada sem convertê-la para UTC): o dia/hora **local** do navegador.
- **RN-161.06 (C397, Movimentações)** — `GET /almoxarifado/movimentacoes?data_inicio&data_fim`: a movimentação entra se o dia de Brasília
  do `created_at` está no período (inclusivo). A lista e o modal de estorno mostram a hora de Brasília (o `created_at` lido como UTC) — e
  também o Extrato do material, as últimas movimentações do painel, e as datas de Recebimentos e Requisições citadas na Fase 2 I1 (o mesmo
  `CURRENT_TIMESTAMP`). O nome do arquivo exportado dos Relatórios leva o dia local.
- **RN-161.07 (C399/C400, Colaboradores)** — as opções de *Setor* são todos os setores que a tela já recebeu (não encolhem com o filtro);
  o *Trabalho* filtra sem pedir de novo.
- **RN-161.08 (C399, Notificações)** — o *Evento* oferece os 10 de hoje e as chaves do registro de alertas (pela rota nova); se a rota
  falhar, os 10 (falha aberta — é só a lista de opções).
- **RN-161.09 (C399, Recebimentos e Remessas)** — o seletor de fornecedores (do Recebimento e das Remessas a terceiros) procura no servidor
  pelo texto digitado (aparado, sem caixa, `%`/`_` como texto — a `condicaoDeBusca` com `escapar`), em vez dos 50 primeiros fixos; só a
  resposta da última busca vale; a busca que falha deixa as opções como estavam.
- **RN-161.10 (C400, Auditoria)** — uma opção por usuário (`usuario_id`), com o nome da linha mais recente da trilha.
- **RN-161.11 (C400, QR)** — o QR do material (`?material_id=`) mostra só aquele material, mesmo que outro código comece igual; mexer na
  busca solta. Soma com os outros filtros; editar o material volta sem o filtro; inativar esvazia a lista (o inativo não é achado — de antes).
- **RN-161.12 (C400, Recebimentos)** — trocar o filtro recarrega só a lista; materiais, pedidos e fornecedores carregam na abertura (a lista de pedidos
  pendentes deixa de se atualizar ao trocar o filtro — recarregar a página a atualiza).

## Contratos (congelados)

- **`GET /api/almoxarifado/movimentacoes`** — mesmas chaves e resposta; `data_inicio`/`data_fim` comparados com `DATE(m.created_at, <mod>)`
  (o resto igual: valor fora do formato continua comparado como texto, como hoje).
- **`GET /api/producao/apontamentos`, `/paradas`, `/relatorios/producao`, `/relatorios/eficiencia`, `/relatorios/paradas`, `/dashboard`** —
  mesmas chaves e formas de resposta; o dia é o local (RN-161.04). `periodo.data_inicio`/`data_fim` padrão = dia 1 local / hoje local.
- **`GET /api/operacional/colaboradores`** — mesma resposta; `presente_hoje`/`status_trabalho` pelo hoje local.
- **`GET /api/almoxarifado/recebimentos-aux/fornecedores?search=`** — mesma resposta (até 50, por razão social); `search` aparado e nas
  formas da `condicaoDeBusca` (com `escapar`) em `razao_social`, `nome_fantasia`, `cnpj`; vazio, só espaços ou não texto = sem filtro.
- **`GET /api/almoxarifado/auditoria/opcoes`** — mesma forma; `usuarios` com um item por `id` (o nome da linha de maior `id` da trilha
  daquele usuário), ordenado por nome e id.
- **`GET /api/almoxarifado/notificacoes/eventos`** (novo) — `auth` + `requirePermission('gerenciar_notificacoes')`; **200**
  `[{ "evento": "<chave>", "rotulo": "<titulo>" }]` na ordem do `ALERT_REGISTRY`; **403** a recusa padrão do `requirePermission`; **500**
  `{ "error": "Erro ao listar os eventos" }` (inalcançável: o registro é constante em memória — sem teste, declarado). Registrada **antes** de qualquer `/notificacoes/:id` GET (hoje não há).
- **Servidor, utilitário novo `server/services/diaLocal.js`** — `modificadorDoFuso(agora = new Date())` → `'<n> minutes'` (ex.
  `'-180 minutes'`, do `offsetMinutos` da `auditFiltros`, que passa a ser exportado); `hojeLocalISO(agora)` → `AAAA-MM-DD` no
  `FUSO_PADRAO`; `inicioDoMesLocalISO(agora)` → `AAAA-MM-01`. Nada de `'localtime'`. O `hojeLocalISO` de `pedidoCompraService.js` passa a delegar para este.
- **Navegador, utilitários novos** — `client/src/utils/dataLocal.js`: `hojeLocalISO(agora = new Date())`, `inicioDoMesLocalISO(agora)`,
  `agoraLocalParaInput(agora)` (`AAAA-MM-DDTHH:MM`), todos pelos componentes locais do `Date`; `lerInstanteDoBanco(valor)` → `Date` (o
  `'AAAA-MM-DD HH:MM:SS'` sem `T`/`Z` é lido como UTC; ISO com `Z` como está; vazio/inválido → `null`). `client/src/hooks/useUltimoPedido.js`:
  `const novoPedido = useUltimoPedido(); const ehUltimo = novoPedido(); … if (!ehUltimo()) return;` (função estável; `novoPedido()` também
  serve só para invalidar — a troca de relatório).

## Tasks (sort topológico)

- [ ] **T1 (tronco, navegador)** — `useUltimoPedido` + `dataLocal.js`, com testes (o controle positivo: o contador sem o incremento; o
  `hojeLocalISO` pelo `toISOString`). O teste de `dataLocal` declara o fuso: guarda que derruba se o processo estiver em UTC (o cenário
  23h30 local só prova algo fora de UTC).
- [ ] **T2 (tronco, servidor)** — `diaLocal.js` + exportar `offsetMinutos`.
- [ ] **T3 (servidor, depois de T2)** — RN-161.04 (`producaoService.js`, `index.js` do *presente hoje*), RN-161.06 (servidor), RN-161.09
  (servidor), RN-161.10, a rota da RN-161.08. Teste `server/tests/api/respostasVelhasEDiaLocal.api.test.js` pelo `index.js` real (molde:
  `filtrosDaFabricaEAlmoxarifado.api.test.js`), com o processo filho em `TZ=UTC` (prova que a régua não depende do `TZ`) e com um *preload* que
  adianta o relógio do JavaScript em 2 dias (Fase 2 I2): o *hoje* novo vem do JS, o antigo vinha do `date('now')` do SQLite — divergem a
  qualquer hora. Cada cenário de instante tem a metade positiva (o das 22h entra no dia local) e a negativa (o das 01h30 do dia local
  seguinte, mesmo dia UTC, não entra).
- [ ] **T4 (galho, navegador da Fábrica — worktree própria)** — RN-161.01, RN-161.05, RN-161.07. Arquivo de teste novo
  `client/src/components/operacional/Etapa161Fabrica.test.js`; cada lista com o cenário da resposta lenta **e** o da falha do pedido
  anterior (a lição do r3 da 160).
- [ ] **T5 (galho, navegador do Almoxarifado — worktree própria)** — RN-161.02, RN-161.03, RN-161.06 (a hora), RN-161.08 (tela, contra o
  contrato), RN-161.09 (tela), RN-161.11, RN-161.12. Arquivo de teste novo `client/src/components/almoxarifado/Etapa161Almoxarifado.test.js`.
- [ ] **T6 (integração, cruza galhos)** — no teste do servidor: a movimentação das 22h30 de 19/10 (gravada `2026-10-20 01:30:00`) entra no
  filtro do dia 19 **pela rota**, e o mesmo `created_at` formatado pela regra da tela (o `Z`) dá 19/10 22:30; e o apontamento das 22h30
  entra no `porDia` do dia 19 **pelo relatório** e na lista filtrada pelo dia 19 **pela rota de apontamentos**.

T4 e T5 não tocam os mesmos arquivos (Fábrica × Almoxarifado) e só consomem T1 (e, a T5, o contrato congelado da rota nova). T3 é do
condutor, na worktree da etapa, sob a trava de máquina.

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`scratchpad/trava-test-api.d`, `mkdir` atômico; quem pegou apaga).
2. Medir pelo componente que a rota monta.
3. O deslocamento do fuso **só** em coluna de instante; coluna só de data compara com o hoje local.
4. Quem chama a função de carga com `await` (Requisições, Recebimentos) não pode passar a receber erro.
5. Nenhuma porta de saldo, permissão ou trava muda.
