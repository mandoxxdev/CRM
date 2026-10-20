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
  portão da rota é o login **mais o acesso ao módulo** (o `app.use` do prefixo — *esta frase dizia "só o login"; **estava errada**, Fase 5 r2*),
  de antes: quem abre o Recebimento (qualquer perfil, inclusive PRODUÇÃO e CONSULTA) passa a achar qualquer fornecedor ativo pelo nome ou CNPJ
  (só id, razão social, nome fantasia e CNPJ). **Descartado:**
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

- [x] **T1 (tronco, navegador)** — `86242381`. — `useUltimoPedido` + `dataLocal.js`, com testes (o controle positivo: o contador sem o incremento; o
  `hojeLocalISO` pelo `toISOString`). O teste de `dataLocal` declara o fuso: guarda que derruba se o processo estiver em UTC (o cenário
  23h30 local só prova algo fora de UTC).
- [x] **T2 (tronco, servidor)** — `6885caf9` (junto da T3: o utilitário só tem teste pela rota). — `diaLocal.js` + exportar `offsetMinutos`.
- [x] **T3 (servidor, depois de T2)** — `6885caf9`. — RN-161.04 (`producaoService.js`, `index.js` do *presente hoje*), RN-161.06 (servidor), RN-161.09
  (servidor), RN-161.10, a rota da RN-161.08. Teste `server/tests/api/respostasVelhasEDiaLocal.api.test.js` pelo `index.js` real (molde:
  `filtrosDaFabricaEAlmoxarifado.api.test.js`), com o processo filho em `TZ=UTC` (prova que a régua não depende do `TZ`) e com um *preload* que
  adianta o relógio do JavaScript em 2 dias (Fase 2 I2): o *hoje* novo vem do JS, o antigo vinha do `date('now')` do SQLite — divergem a
  qualquer hora. Cada cenário de instante tem a metade positiva (o das 22h entra no dia local) e a negativa (o das 01h30 do dia local
  seguinte, mesmo dia UTC, não entra).
- [x] **T4 (galho, navegador da Fábrica — worktree própria)** — `e0912a6d` (integrada por cherry-pick). — RN-161.01, RN-161.05, RN-161.07. Arquivo de teste novo
  `client/src/components/operacional/Etapa161Fabrica.test.js`; cada lista com o cenário da resposta lenta **e** o da falha do pedido
  anterior (a lição do r3 da 160).
- [x] **T5 (galho, navegador do Almoxarifado — worktree própria)** — `f2a10ffe`, `db960831`, `3acfec05` (integradas por cherry-pick). — RN-161.02, RN-161.03, RN-161.06 (a hora), RN-161.08 (tela, contra o
  contrato), RN-161.09 (tela), RN-161.11, RN-161.12. Arquivo de teste novo `client/src/components/almoxarifado/Etapa161Almoxarifado.test.js`.
- [x] **T6 (integração, cruza galhos)** — `6885caf9` (no teste do servidor).
- [x] **Fase 4** — `6d84c427` (C402, o achado da T4). **Fase 5** — `84353119` (as asserções e os resíduos; ver abaixo). — no teste do servidor: a movimentação das 22h30 de 19/10 (gravada `2026-10-20 01:30:00`) entra no
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

## Execução — o que divergiu do plano

- **T2 foi junto da T3** (`6885caf9`): o `diaLocal.js` só tem prova pela rota (e, depois da Fase 5, pelo teste direto do utilitário no mesmo
  arquivo).
- **O teste do servidor achou duas fraquezas dele mesmo na primeira rodada de sabotagem** (26 sabotagens, K12 sobreviveu): as datas fixas
  dos cenários (19–20/10/2026) coincidiam com o *hoje* real — a parada das 22h30 de 19/10 caía no `date('now')` do SQLite; e o cenário do
  painel dependia da máquina do cenário anterior (caía em cascata sem chegar às próprias asserções). As datas fixas foram para 2025-03 e o
  painel ganhou máquina própria; as 29 sabotagens caíram depois.
- **A T4 achou um defeito novo da família** (C402): a coluna *Data* da Presença e das Horas extras mostrava o dia anterior (a data pura
  lida como meia-noite UTC) — consertado na Fase 4 (`6d84c427`).
- **A T5 criou dois módulos de tela que o plano não previa** (`instanteDoBanco.js` com o `formatarInstanteDoBanco`, e o
  `useBuscaFornecedores.js`), dentro de `components/almoxarifado` (o galho não podia tocar `utils`); e formatou também colunas de
  Requisições e do Extrato que o plano não listava (todas conferidas como `CURRENT_TIMESTAMP`/`datetime('now')`). Nos Recebimentos, os
  pedidos pendentes passaram a carregar separados dos fornecedores (antes, a falha de um derrubava o outro).
- **A frase "as telas irmãs já acrescentam o `Z`" estava errada** (Fase 2 I1) e **a B1031 dizia "o portão é só o login" — estava errada**
  (Fase 5 r2: é o login mais o acesso ao módulo, pelo `app.use` do prefixo) — as duas corrigidas no texto, dizendo que estavam.
- **Os dois commits intermediários da T5** (`f2a10ffe`, `db960831`) foram montados com versões intermediárias dos arquivos para ficar um
  assunto por commit; só o estado final rodou a suíte (declarado pelo executor).

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo, sob a trava)

- **r1 (regra) — 0 achados.** Sonda do serviço da produção com o relógio fixo às 22h45 de Brasília (a data planejada gravada, o período
  padrão, o `porDia`, a lista, o painel); o `diaLocal` nas viradas; as opções da Auditoria no SQL. Conferido certo: todo `setX` das listas
  pela guarda; o descarte é `return`; cada coluna pela forma como é gravada; os formulários; o leitor de instante só em
  `CURRENT_TIMESTAMP`. **Resíduos de antes** (fora das RN, sem regressão): a data das Inspeções (pendentes e histórico) e das Devoluções
  lida como hora local, e o *hoje* das Reservas pelo `toISOString` — **consertados na correção da Fase 5**. Medida (não achado): as opções
  da Auditoria custam 267 ms contra 15 ms com 300 mil linhas.
- **r2 (autorização) — 0 achados.** O `index.js` real em pasta vazia no HEAD e na base `256f4f05`, onze colunas de usuário (sem token, sem
  nada, só Comercial, só Operacional, só Almoxarifado, os cinco perfis, admin): fora a rota nova (404 → o portão da lista), as respostas
  401/403/200 são idênticas. A busca de fornecedores expõe só id, razão social, nome fantasia e CNPJ de ativo; injeção (`') OR 1=1--`,
  arrays e objetos do `qs`, 7 mil e 50 mil caracteres, `%`, `_`, `\`) sem efeito; nenhum valor do usuário cai na posição do modificador do
  SQLite (`+1 day`, `localtime`, `unixepoch` em `data_inicio`/`data_fim` nas seis rotas, com controle positivo). **Correção de texto:** a
  B1031.
- **r3 (sabotagem, worktree própria `CRM-wt-e161-r3`) — 46 sabotagens (22 servidor, 24 telas): 27 caíram pela asserção certa; 13
  sobreviveram por falta de asserção; 6 equivalentes ou inalcançáveis (provados: C02, C05 no V8, C11, C13, C14; C04 e C06 pelo `NOT NULL`
  das colunas).** As faltas: o painel com a massa que não distinguia as duas réguas (S05, S08 — as paradas de 1 min coincidiam), a data
  planejada da OP criada (S02), o `porMaquina` (S10), a virada do mês (S13), o nome fantasia (S25); nas telas, a aba já aberta (C01), o
  *Limpar filtros* do QR (C07), a busca duplicada de fornecedores (C08), a Remessa sem formulário (C09), o texto que fica ao fechar (C10), o
  evento sem rótulo (C12), o vazio (C17), o *Consumo por O.S.* (C19), o terceiro duplicado (C27), o subtítulo e o vazio do QR (C30, C31).
- **Correção da Fase 5 (`84353119`):** as asserções de todos os sobreviventes e os resíduos do r1. **Controles da correção (todos caíram pelo
  cenário deles):** F01–F06 no servidor (as sabotagens S02, S05, S08, S10, S13, S25 reaplicadas) e 16 nas telas (C01, C07, C08, C09, C10,
  C12, C17, C19, C27, C30, C31, C16/C32 nas Requisições — nos Recebimentos não há chamador com `await` —, e os quatro resíduos). **Achados
  novos, de antes, registrados:** a expiração automática das reservas e o alerta de reserva parada pelo dia UTC (**C404** — porta que solta
  reserva: não mexida) e os *dias em espera* das Inspeções com 3 h de erro (**C405**).

## Suítes (lidas na saída, `scratchpad/e161/`)

- **Base (antes de qualquer código, `base-api.log`, às ~21h40 locais):** `test:api` **480/480**.
- **Antes de `86242381` (T1):** client **162** suítes / **2005** testes.
- **Antes de `6885caf9` (T3, `t3-*.log`, às ~22h10 — dentro da janela em que o dia UTC já é amanhã):** `test:api` **481/481**
  (`respostasVelhasEDiaLocal` **9/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**.
- **Bateria 1 — antes de `6d84c427` (com a T4 e a T5 integradas, `b1-*.log`):** client **164** suítes / **2070** testes; `CI=true build`
  *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts (invariantes: *"TODOS OS INVARIANTES OK"*) + editor **39/39**.
- **Bateria 2 — antes de `84353119` (depois da Fase 5 — também a do fechamento; depois só mudaram documentos, `b2-*.log`):** `test:api`
  ****481/481** arquivos** (`respostasVelhasEDiaLocal` **10/0**); `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**;
  client **164** suítes / **2086** testes; `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** + editor
  **39/39** (só documentos e telas do Almoxarifado/Fábrica mudaram depois da bateria 1 — a proposta não foi tocada; rodada de novo no
  fechamento: ****23/23** + editor **39/39****).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (as asserções e os resíduos). As tasks ficaram verdes na primeira aplicação; o teste
   do servidor teve uma rodada interna de ajuste antes do commit (as datas fixas e o painel em cascata, achados pela própria sabotagem).
   Testes antigos mudados: **0**.
2. **Achados da revisão:** Fase 2 — **0 Critical + 4 Important + 11 Minor**, todos reais (o mais caro: a afirmação errada de que as telas
   irmãs já mostravam a hora certa — com só a lista consertada, a mesma movimentação apareceria com duas horas diferentes; e o teste do
   *hoje* que passaria vazio fora das 21h–24h). Fase 5 — r1 **0** (2 resíduos de antes, consertados); r2 **0** (1 correção de texto); r3
   **13** faltas de asserção reais + **6** equivalentes/inalcançáveis provados; **0** ruído. **O que mais pesou:** a massa de teste do painel
   com valores iguais nas duas réguas (a contagem coincidia) — o mesmo princípio de "sabote a posição", agora na **massa**: o cenário tem de
   ter números diferentes de cada lado da régua.
3. **Paralelismo:** **2** galhos de código em paralelo de fato (T4 Fábrica e T5 Almoxarifado, worktrees próprias) enquanto o condutor fazia o
   servidor — **0** retrabalho entre eles (nenhum arquivo em comum; o contrato da rota nova congelado bastou para a T5 testar contra o
   mock); **3** leitores na Fase 0, **1** revisor na Fase 2, **3** revisores em paralelo na Fase 5 e **1** executor da correção da Fase 5 em
   paralelo com o condutor (navegador × servidor) — **0** incidente de trava.
4. **Defeito que escapou** *(preenchido na Etapa 162)*: **0** defeitos de código da 161 achados depois do fechamento; **2 furos de
   medição**: (1) a varredura do navegador da Fase 0 listou os *hoje* em UTC da Fábrica e deixou de fora o `getPeriodDates` do painel do
   Almoxarifado (o `toISOString` no período dos quadros de consumo) — inofensivo enquanto o servidor contava o dia UTC, passou a valer quando a
   162 levou os relatórios ao dia de Brasília (achado pelo r1 da Fase 5 da 162, consertado em `e1ac2cfa`); (2) a contagem de testes que calculam
   *hoje* em UTC ("9 arquivos") estava incompleta para o que a 162 mudou — eram 12 (os alertas e o segundo arquivo dos indicadores, Fase 2 I1
   da 162).

## Próxima tarefa detalhada — Etapa 162

*(A série desta etapa foi B1025–B1032, C396 e C397 resolvidos, C399 e C400 resolvidos em parte, C401–C405 novos (C402 resolvido), nenhuma
A — a 162 começa em **B1033**, **C406**, **A104**; confira com `grep -oE` antes.)*

**Escolhida: o dia de Brasília no resto do Almoxarifado e do Operacional — C401 (os 9 relatórios e o painel do Almoxarifado), C403 (os
indicadores do Operacional), C405 (os dias em espera) — e medir a C404 antes de decidir.** (1) **C401** — `reportService.js` (as nove
funções com `DATE(x.created_at) >= ?`, a `DATE(r.data_recebimento)` da qualidade de fornecedores, a `DATE(s.destino_registrado_em)` da
sucata) e o painel (`routes/almoxarifado.js:500`, `:522` — *movimentações hoje*, o gráfico de 7 dias) pelo `diaLocal`
(`date(col, modificadorDoFuso())` em coluna de instante; o *hoje* pelo `hojeLocalISO`). **Medir antes** os ~17 arquivos de teste que tocam
esses relatórios — vários calculam *hoje* em UTC (medido nesta etapa: 9 arquivos com `toISOString().slice(0,10)`/`date('now')`) e passariam
a falhar só entre 21h e meia-noite: cada um precisa do *hoje* pela mesma régua, ou do relógio adiantado (`tests/helpers/relogioAdiantado.js`).
Os números dos relatórios mudam (**B** — é a pergunta da **B1027**; o caminho reversível é mudar e registrar). Os *Indicadores*
(`relatorioIndicadores`, `datetime('now','-N days')`) são janela relativa — medir se mudam. (2) **C403** — os `date('now')` do Operacional
em `index.js` (OEE, manutenção preventiva/corretiva, inspeções do dia, atividades/OS concluídas hoje, `:21857`…`:22173`): **medir antes quais
rotas o `App.js` monta** (o painel operacional antigo não é montado — C400) e a forma de cada coluna (instante × só data). (3) **C405** — o
`diasEmEspera` de `InspecoesAlmoxarifado.js:109` pelo `lerInstanteDoBanco`. (4) **C404** — a expiração automática das reservas
(`reservationService.js:139`, `date(expira_em) < date('now')`), o alerta de reserva parada (`alertRegistry.js:564`) e o padrão do
`expira_em` (`stockService.js:3688`): **só medir e decidir** — a expiração solta reserva (não distribui, então não pega a trava — CLAUDE.md,
B441), e trocar a régua do dia é seguro só se nada mais muda; se for implementar, a régua da data e mais nada, com o teste da expiração às
22h (relógio adiantado). **Pontos de atenção:** (1) a trava de máquina (um `test:api` por vez); (2) o modificador **só** em coluna de
instante; (3) a massa de teste com valores **diferentes** de cada lado da régua (a lição do r3 desta etapa); (4) nenhuma porta de saldo,
permissão ou trava muda, salvo a régua da data da C404 se decidida.

**Dependem do P.O. — NÃO implemente:** a lista inteira do plano da 152 — **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o
resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246** e a **C247**, a tabela de conversões e o grupo acima de família, a régua do
tempo de recebimento (E2), **C268**, **C269**, **C275**, **C276**, **C277**, **C109**, **C117**/**C118**, **C139**, **C278**; na 05, os itens de
produto e a **C198**; na 06, a **B11** e a Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30,
**G38**; no Compras, D-35, D-37, D-78, D-90, G9/G30, G4, G15, B63, B60, B62, a **C348**; nas propostas, a verificação do dono da proposta (Fase
12 — também a **C305**), o filtro por permissão do histórico, a **B910**, a **C307**, a Frente B da lentidão, a **C297** (**B924**), a **B926**,
a **C312**, a **C316**, a régua de quantidade da **C314**, a **B949** e a **C330**; no Operacional, a **C332**; do Comercial, a **C354**, a
**C357**/**B988**, a **C359**/**B989** (e a **C360** junto), a **C358**, a **C383**, ignorar também o acento nas buscas (**B1013**, **B1019**) e o
resto da **C382** (**B1016**); do núcleo, a **C362**; da 160, o filtro *Status* dos Materiais (**C398**) e os tipos do filtro das Movimentações e
o material de cliente nos seletores das Reservas/Inspeções (**C399**); da C400, acrescentar a descrição da OS à busca das OPs (muda o
resultado). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** o `useUltimoPedido` e o `dataLocal.js` do navegador (`86242381`); o `diaLocal.js` do
servidor, o dia da Fábrica, o filtro das Movimentações, a rota de eventos, a busca de fornecedores e as opções da Auditoria (`6885caf9`); as
telas da Fábrica (`e0912a6d`, `6d84c427`); as do Almoxarifado (`f2a10ffe`, `db960831`, `3acfec05`); as asserções da Fase 5 e os resíduos
(`84353119`).
