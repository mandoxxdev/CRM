# Etapa 168 (núcleo, Comercial e Compras): a hora de criação no relógio de Brasília — Clientes, Usuários, Logs, Custos de Viagem, Minhas Solicitações e o modelo da proposta — plano

> Origem: "Próxima tarefa detalhada — Etapa 168" do plano da 167
> (`docs/superpowers/plans/2026-10-20-almoxarifado-etapa167-o-marcador-vivo-no-preview-e-a-atividade-recente-da-viagem-no-dia-de-brasilia.md`).
> Etapa de consertos técnicos fora do Almoxarifado; o design, com a Fase 0 medida, está neste plano.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-20): última B **B1068**, último C **C420**,
> última A **A105**. Esta etapa: **B1069+**, **C421+**, **A106+**. Worktree `CRM-wt-e168`, branch `etapa-e168` (da main `046daecd`).
>
> **Fase 2 (um revisor fresco, só leitura, ANTES do código): 0 Critical, 2 Important, 6 Minor — todos aceitos; o plano abaixo já está
> corrigido** (sondas e relatório em `scratchpad/e168/f2/`). **I1** a coluna *Data* da lista de Custos de Viagem (`CustosViagens.js:1355`,
> `data_viagem DATE`, `'AAAA-MM-DD'`) mostra a **véspera** o dia inteiro (`new Date('2026-10-20')` = 19/10 em Brasília) — e o filtro *Data
> Início*/*Data Fim* da mesma tela (`index.js:15833`, `:15838`, texto) acha a viagem no dia 20: entra na T2 (`formatarDataDoBanco`, a 165) e
> na T4. **I2** o cenário 20/10 22:30:05 não distingue `'2-digit'` de `'numeric'` (com `'numeric'` o 05/01 08:04:05 sai *5/01/2026, 8:04:05*) —
> a constante é escrita por extenso e a T1 ganha o cenário com dia, mês e hora de um algarismo. **Minor:** M1 o par `(mod, data)` só entra
> quando a data veio; M2 a data inválida no filtro continua 200 e lista vazia (inalterado, declarado); M3 eram 10 linhas, não 11 (com a I1,
> 11); M4 o `GET /api/usuarios` é `services/leituraDeUsuarios.js:318` (cru — a conclusão vale); M5 o que a T4 precisa (o `axios` direto do
> editor do modelo, os mocks de leaflet/recharts, a *Autorização #n* só pelo *Editar*, o `exportToExcel` na fronteira); M6 o `created_at`
> nulo é teórico (nenhum caminho grava nulo — a RN-168.02 fica como robustez). **Sem defeito:** a tabela da Fase 0 (as 8 colunas, nenhum
> `INSERT`/`UPDATE`/`ALTER` grava outra forma), a equivalência de texto no jsdom (Node 24, ICU 78), o filtro novo, os testes antigos (o
> `rotasDePermissoes.api.test.js:271` corta o fonte antes do `WHERE`), a mudança do formatador (nenhum `jest.mock` dos dois caminhos).

## Fase 0 — medido (antes de qualquer código)

Lido no código nas linhas citadas (o condutor). Base `test:api` rodada antes de qualquer código (`scratchpad/e168/base-api.log`).

### O formato do `created_at` de cada tabela — medido, não suposto

`new Date('AAAA-MM-DD HH:MM:SS')` (sem `T`, sem `Z`) é lido pelo navegador como hora **local**; `new Date('…Z')` como UTC. Por isso a
pergunta decisiva é como cada coluna é **gravada** e se a rota a **transforma**:

| Tela (linha) | Rota | Tabela.coluna | Como é gravada | A rota transforma? |
|---|---|---|---|---|
| Clientes — *Cadastrado em* da planilha (`Clientes.js:80`) | `GET /api/clientes` | `clientes.created_at` | `DEFAULT CURRENT_TIMESTAMP` (`index.js:1261`; o único `INSERT`, `:4494`, não passa a coluna) | não |
| Usuários — *Cadastrado em* da planilha e da lista (`Usuarios.js:140`, `:292`) | `GET /api/usuarios` | `usuarios.created_at` | `DEFAULT CURRENT_TIMESTAMP` (`:1233`; os `INSERT` `:2272`, `:3955` não passam a coluna) | não |
| Logs — *Data/Hora* da planilha e da tabela (`Logs.js:50`, `:194`) | `GET /api/auditoria/logs` (`:22328`) | `logs_auditoria.created_at` | `datetime('now')` explícito (`:22308`, `services/acessoNegadoLog.js:31`) — UTC, o mesmo formato | não (`SELECT *`) |
| Custos de Viagem — *Autorização #n* (`CustosViagens.js:1978`) | `GET /api/custos-viagens/:id/logs-autorizacao` (`:16469`) | `logs_autorizacao_viagens.created_at` | `DEFAULT CURRENT_TIMESTAMP` (`:1905`; `INSERT` `:16237`) | só o JSON das regras |
| Custos de Viagem — *Enviado por … em* (`:2362`) | `GET …/:id/comprovantes` (`:16652`) | `custos_viagens_anexos.created_at` | `DEFAULT CURRENT_TIMESTAMP` (`:1932`; `INSERT` `:16617`) | não |
| Custos de Viagem — *Alteração #n* (`:2413`) | `GET …/:id/historico` (`:16739`) | `custos_viagens_historico.created_at` | `DEFAULT CURRENT_TIMESTAMP` (`:1919`; `INSERT` `:16418`) | só o JSON |
| Minhas Solicitações de Compra (`MinhasSolicitacoesCompra.js:62`) | `GET /api/solicitacoes-compra/minhas` (`:18457`) | `solicitacoes_compra.created_at` | `DEFAULT CURRENT_TIMESTAMP` (`:1795`; `INSERT` `:18431`) | não |
| **(achado da Fase 0)** Editor do modelo da proposta — a data em *Templates Salvos* (`EditorTemplateProposta.js:741`) | `GET /api/proposta-template/list` (`:10039`) | `proposta_template_config.updated_at` | `DEFAULT CURRENT_TIMESTAMP` e `updated_at = CURRENT_TIMESTAMP` nos `UPDATE` (`:1295`, `:9932`) | não |

**Todas** chegam ao navegador como `'AAAA-MM-DD HH:MM:SS'` em UTC, sem fuso — o defeito é real em todas. Medido em Node com
`TZ=America/Sao_Paulo`: `new Date('2026-10-21 01:30:05').toLocaleString('pt-BR')` = *21/10/2026, 01:30:05* (o certo, o instante 22h30 de
Brasília de 20/10, é *20/10/2026, 22:30:05*). Das 21h à meia-noite a data é a do dia seguinte; a hora, sempre 3 h adiantada.

**Todas roteadas:** `Clientes`, `CustosViagens`, `MinhasSolicitacoesCompra`, `EditorTemplateProposta` em `routes/lazyModules.js` e `App.js`
(`/comercial/clientes`, `/comercial/custos-viagens`, `minhas-solicitacoes`, `propostas/editor-template`); `Usuarios` e `Logs` nas abas do
`Admin.js` (`:49`, `:51`). **Sem uso (C414, não mexer):** `components/Propostas.js`, `components/PropostaForm.js`, `utils/gerarPDFProposta.js`.

**Dois defeitos de passagem, na mesma linha:** `Usuarios.js:292` não tem guarda — o usuário com `created_at` nulo aparece *31/12/1969*
(`new Date(null)` é o instante zero, 21h de 31/12/1969 em Brasília); `Logs.js:50`/`:194` e `CustosViagens.js` mostram *Invalid Date* para o
valor ilegível.

**O filtro da tela de Logs conta o dia UTC (achado da Fase 0, pergunta 4 — o gesto seguinte):** a tela tem *Data início* e *Data fim*
(`Logs.js:152`, `:162`, `type="date"`, o dia local) e a rota filtra `DATE(created_at) >= ?` / `<= ?` (`index.js:22346`, `:22350`) — o dia **UTC**.
Consertar só a exibição deixaria a linha *20/10/2026 22:30* fora do filtro *20/10 a 20/10* e dentro do *21/10 a 21/10*. Entra na etapa.

**O formatador já existe:** `formatarInstanteDoBanco(valor, opcoes, vazio)` (Etapa 161, `client/src/components/almoxarifado/instanteDoBanco.js`)
— lê o `'AAAA-MM-DD HH:MM:SS'` como UTC (`lerInstanteDoBanco` de `utils/dataLocal.js`), ISO com `Z` como está, vazio → `vazio`, ilegível →
o texto **cru**; formata com `toLocaleDateString('pt-BR', opcoes)`. Medido: com as opções explícitas de dia/mês/ano/hora/minuto/segundo ele
dá **exatamente** o texto do `toLocaleString('pt-BR')` sem opções (*20/10/2026, 22:30:05*); sem opções, o do `toLocaleDateString('pt-BR')`
(*20/10/2026*). A tela fica idêntica, menos o fuso.

### Portas de saldo, trava e permissão

Nenhuma. Nenhuma rota muda de portão; nenhum valor gravado muda; a única mudança de servidor é o `WHERE` do filtro de datas dos logs.

### O resto da varredura (o que fica para depois)

Varredura de **todas** as telas roteadas (um agente Explore, só leitura; cada linha conferida contra o `CREATE TABLE`/`INSERT`). Fora do
escopo desta etapa (o escopo é a hora de criação no núcleo, na viagem e nas solicitações); vira a **C421** e a próxima tarefa:

- **Comercial:** `Aprovacoes.js:268-310` (o `formatDate` lê UTC certo e **subtrai mais 3 h** — 6 h a menos; usado em `:484`, `:569`, `:627`,
  `:636`); `OrdensServicoComercial.js:147` (a abertura e a previsão, só data — véspera; `:359` a aprovação `CURRENT_TIMESTAMP` — dia
  seguinte à noite; `:116`/`:188` a contagem de *vencidas* um dia antes); `PreviewOSEditavel.js:285`, `:295` (véspera); latente
  `Projetos.js:132` (a coluna não existe).
- **Operacional / Fábrica:** `operacional/OrdensServico.js:75` (`:190`, `:191`), `OSDetalhesForm.js:502`, `:514`, `operacional/Producao.js:211`
  — só data, véspera.
- **Compras:** `ItensFornecedor.js:292`, `:417` (`planilha_atualizado_em` depois de recarregar); `Compras.js:300` (o `created_at` da planilha
  de fornecedores pelo prefixo — o dia UTC).
- **Chat:** `chat/ChatPage.js:19`, `:27`, `:35`, `:43-44` (`parseISO` do `CURRENT_TIMESTAMP` — 3 h adiantado; *Hoje*/*Ontem* e o separador do
  dia erram à noite).
- **Tarefas:** `todolist/TodolistBoard.js:43-45` (o prazo só data — véspera; o `created_at` — dia seguinte), `:50` (`created_at` 3 h adiantado).
- **Almoxarifado:** `LotesAlmoxarifado.js:464` (`certificado_em`), `AnexosDocumento.js:71-75` (o `created_at` dos anexos, sem o `Z`),
  `FerramentasAlmoxarifado.js:602` (a retirada pelo prefixo — o dia UTC), `utils/remessaPdf.js:15-20` e `utils/posicaoClientePdf.js:14-17`
  (o *gerado em* com `timeZone: 'UTC'`).
- **Conferidos e certos:** Frotas, Financeiro, as propostas (`formatDateTimeBR`), Atividades e calendário, Apontamentos e Paradas
  (`toISOString`), as Atividades de colaboradores (texto local), o resto do Almoxarifado.

## Decisões (letra B — reversíveis)

- **B1069 — a hora de criação no relógio de Brasília nas oito exibições, e a data da viagem no dia gravado.** Clientes (planilha), Usuários
  (planilha e lista), Logs (planilha e tabela), Custos de Viagem (autorização, comprovante, histórico), Minhas Solicitações de Compra e o
  modelo salvo da proposta passam a mostrar o instante gravado no relógio de Brasília: o texto continua o mesmo formato de cada tela, só a
  data e a hora mudam (das 21h à meia-noite, o dia certo; a hora, 3 h a menos que antes). A coluna *Data* da lista de Custos de Viagem mostra o
  dia gravado (antes a **véspera**, o dia inteiro — Fase 2 I1), o mesmo dia em que o filtro *Data Início*/*Data Fim* a acha. **Muda também:** o vazio aparece `—` na tela (antes *31/12/1969* na lista de
  Usuários e *Invalid Date* nos Logs e na viagem) e vazio na planilha (como Clientes e Usuários já faziam); o valor ilegível aparece como
  gravado, em vez de *Invalid Date*. **Descartado:** trocar o formato (ex.: o `formatDateTimeBR` *dd/MM/aaaa HH:mm* da 165) — mudaria o
  texto de cada tela (a vírgula e os segundos) sem pedido; converter no servidor (`instanteDoBancoNoFuso` da 162) — mudaria o contrato das
  rotas para todos os consumidores.
- **B1070 — o filtro *Data início* / *Data fim* dos Logs no dia de Brasília.** `date(created_at, ?) >= ?` com `diaLocal.modificadorDoFuso()`
  (a régua das 161–167). **Muda:** o log das 21h à meia-noite entra no filtro do dia em que aconteceu (antes, no do dia seguinte); a ordem e o
  `limit`/`offset` não mudam. **Descartado:** mudar só a exibição (a linha mostraria um dia e o filtro acharia em outro).
- **B1071 — o `formatarInstanteDoBanco` passa a morar em `utils/dataLocal.js`** (o `instanteDoBanco.js` do Almoxarifado o reexporta, as
  telas do Almoxarifado não mudam). **Descartado:** importar do diretório do Almoxarifado no núcleo (a ferramenta é de todos); escrever um
  terceiro formatador.
- **B1072 — a próxima etapa (169).**

## Regras de negócio

- **RN-168.01 (B1069)** — toda exibição listada na tabela da Fase 0 mostra o `created_at`/`updated_at` por `formatarInstanteDoBanco` com as
  opções que reproduzem o texto de antes daquela tela: `toLocaleDateString` sem opções → sem opções (*DD/MM/AAAA*); `toLocaleString` sem
  opções → `COM_SEGUNDOS` = `{ day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' }`
  (*DD/MM/AAAA, HH:MM:SS* — Fase 2 I2: escrito por extenso; com `'numeric'` o 05/01 08:04:05 sairia *5/01/2026, 8:04:05*); as opções
  explícitas (Logs `:194`, viagem `:1978`) → as mesmas. **Cenário:** `created_at = '2026-10-21 01:30:05'` → *20/10/2026* / *20/10/2026,
  22:30:05* / *20/10/2026, 22:30* (antes *21/10/2026*, *21/10/2026, 01:30:05*, *21/10/2026, 01:30*).
- **RN-168.02 (B1069)** — vazio (`null`, `undefined`, `''`) → `—` na tela e `''` na planilha; ilegível → o texto gravado. **Cenário:** o
  usuário com `created_at` nulo na lista → `—` (antes *31/12/1969*); o log com `created_at = 'lixo'` → *lixo* (antes *Invalid Date*).
- **RN-168.03 (B1070)** — `GET /api/auditoria/logs?data_inicio=D1&data_fim=D2` devolve os logs cujo dia de **Brasília** está entre D1 e
  D2 (inclusive). **Cenário:** log `'2026-10-21 01:30:00'` (22h30 de 20/10) → aparece em `20/10–20/10`, não em `21/10–21/10`; log
  `'2026-10-20 12:00:00'` → aparece em `20/10–20/10` (metade positiva); os filtros `tipo`/`modulo` e a ordem continuam. Data inválida
  (`data_inicio=lixo`) → 200 e lista vazia (inalterado — Fase 2 M2).
- **RN-168.05 (B1069, Fase 2 I1)** — a coluna *Data* da lista de Custos de Viagem mostra `data_viagem` por `formatarDataDoBanco(valor, '—')`.
  **Cenário:** `data_viagem = '2026-10-20'` → *20/10/2026* (antes *19/10/2026*).
- **RN-168.04 (B1071)** — `formatarInstanteDoBanco` importado de `utils/dataLocal` e de `components/almoxarifado/instanteDoBanco` é a mesma
  função.

## Contratos

- `GET /api/auditoria/logs` — mesmo método, mesmo portão (`canManageUsers`, 403 *"Acesso negado. Apenas administradores podem visualizar
  logs."*), mesma resposta (`SELECT *`, `ORDER BY created_at DESC LIMIT ? OFFSET ?`). Só o recorte de `data_inicio`/`data_fim` muda
  (RN-168.03). Parâmetros posicionais, na ordem do SQL: `[tipo?, modulo?, (mod, data_inicio)?, (mod, data_fim)?, limit, offset]` — o par
  `(mod, data)` só entra quando a data veio (Fase 2 M1).
- Nenhuma outra rota muda.

## Tasks (sort topológico)

- [x] **T1 (tronco) — o formatador em `utils/dataLocal.js` (B1071, RN-168.04).** Mover `formatarInstanteDoBanco` (corpo idêntico) e a
  constante `COM_SEGUNDOS`; `instanteDoBanco.js` reexporta (default e nomeado). `4d8df969`. Teste em `utils/dataLocal.test.js`: as três formas, vazio,
  ilegível, o cenário de um algarismo (Fase 2 I2: *05/01/2026, 08:04:05*) e a identidade das duas importações.
- [x] **T2 (galho, front) — as oito exibições e a data da viagem (B1069, RN-168.01/02/05).** As 10 linhas da tabela da Fase 0 por
  `formatarInstanteDoBanco` e a `CustosViagens.js:1355` por `formatarDataDoBanco` (Fase 2 I1, M3) — `df13f98a`; o `{ soData: true }` da data da
  viagem (Fase 5 r1 M1) em `e3dca5a6`.
- [x] **T3 (galho, back) — o filtro dos logs (B1070, RN-168.03).** `date(created_at, ?)` nos dois recortes; teste
  `server/tests/api/filtroDosLogsNoDiaLocal.api.test.js` pelo `index.js` de verdade (pasta vazia, o molde da 167 sem o relógio adiantado: o
  dia do log é escolhido por fora) — `6e1011f3`.
- [x] **T4 (integração, front) — `horaDeCriacaoNoDiaLocal.test.js`**: o molde de `datasDoComercialNoDiaLocal.test.js` (o fuso do
  `jest.globalSetup.js` com guarda; só a fronteira HTTP mockada). Uma linha por tela com o `created_at` às 01h30 UTC (= 22h30 de Brasília do
  dia anterior), o gesto do usuário até o texto (abrir a aba, clicar *Comprovantes*/*Histórico*/*Editar*, exportar a planilha — o
  `exportToExcel` capturado na fronteira), e a metade positiva (o texto certo **está** lá) junto da negativa (o do dia seguinte não está).
  **Cruza T1+T2+T3:** a tela de Logs filtrando o dia 20 manda `data_inicio=data_fim=2026-10-20` e mostra a linha das 22h30 — a fronteira
  HTTP devolve o que a rota real devolveria (o contrato da T3). — `df13f98a`; as asserções da Fase 5 (r3) em `e3dca5a6`.
- [x] **T5 (documentação)** — no fechamento (o commit do fechamento, depois de `e3dca5a6`).

## Pontos de atenção

1. A trava de máquina: um `test:api` por vez (`C:/Users/User/AppData/Local/Temp/claude/C--Users-User-projetos-CRM/trava-test-api.d`,
   `mkdir` atômico; quem pegou apaga).
2. `?` posicional na T3: o `mod` antes de cada data — `?` a menos liga NULL calado (o filtro sairia vazio).
3. A revisão obrigatória da proposta (23 + editor 39): o `EditorTemplateProposta.js` não é template nem paginação, mas roda no fechamento.
4. O `heredoc` do Bash come contrabarra — scripts com regex pelo Write.
5. Nenhuma porta de permissão muda; nenhum valor gravado muda.

## Execução — o que divergiu do plano

- **Paralelismo 0:** T1–T3 pequenas, feitas em sequência pelo condutor (T2 depende do caminho de import da T1; a T3 é independente mas o
  `test:api` é serial pela trava de máquina) — nenhum retrabalho.
- **T1 verde de primeira** (`dataLocal.test.js` **8/8**, 4 novos). A identidade das duas importações (RN-168.04) é a prova da reexportação.
- **T2/T4 verde depois de três ajustes do próprio teste** (não do código): a tela das *Minhas Solicitações* não mostra o título (a espera
  passou a ser o `#2`); o `mudancas` do histórico chega como lista (a rota faz o `JSON.parse`); a resposta do filtro tinha de estar posta
  **antes** de mexer nos campos de data. **Controle positivo** (`scratchpad/e168/sabota-t4.js`): as seis telas na versão de `046daecd` —
  **6/6** cenários caem (só a guarda passa), cada um pela asserção do texto (*21/10/2026*, *21/10/2026, 01:30:05*, *19/10/2026* na viagem);
  como a viagem caía na **primeira** asserção (a data da lista), mais **8 sabotagens de uma linha** — o comprovante, o histórico, a
  autorização, a lista e a planilha de Usuários, a planilha dos Logs, o `data_fim` do filtro, as Minhas Solicitações: **8/8** caem pela
  asserção daquela linha; md5 das seis telas restaurado ao pós-conserto.
- **T3 verde de primeira** (7/7) — controle: o `index.js` de `046daecd` (**3** cenários caem: os dois recortes, a data sozinha, o tipo com
  as datas) e o `data_fim` voltado ao dia UTC sozinho (os mesmos **3**); md5 restaurado.
- **Testes antigos mudados: 0.**

**A próxima tarefa da 167 estava incompleta** (dizia nove linhas em cinco telas): faltavam a data do modelo salvo da proposta
(`EditorTemplateProposta.js:741`, achada na Fase 0), a coluna *Data* da lista de Custos de Viagem (a véspera — Fase 2 I1) e o filtro de datas
dos Logs (o gesto seguinte — Fase 0). Corrigido aqui; a 167 dizia "medido por `grep`, não a fundo", e era isso.

**Specs de feature:** nenhuma — as telas desta etapa (Clientes, Usuários, Logs, Custos de Viagem, Solicitações de Compra, o modelo da proposta)
não são features do mapa do Almoxarifado nem têm `specs/<modulo>/<feature>/README.md`; o registro é o mapa (a linha *Última atualização*),
este plano e as novidades. A revisão da proposta (`specs/proposta-editavel/review-proposta.md`) não muda: nenhum arquivo do template ou da
paginação foi tocado.

## Fase 5 — revisão adversarial (três revisores frescos, em paralelo)

- **r1 (a regra):** **0** Critical, **0** Important, **1** Minor — **M1** a `data_viagem` com hora (`'2026-10-20 00:00:00'`, só por um
  cliente de API externo: a coluna é `DATE NOT NULL` e a tela grava pelo `<input type="date">`) sairia como instante UTC, *19/10/2026*
  (antes *20/10/2026*) — reproduzida (`scratchpad/e168/r1/probe1.mjs`); **aceita**: `formatarDataDoBanco(…, '—', { soData: true })` (o prefixo
  vale, como no servidor) e uma linha `V-168H` no teste. Conferidos e certos: os textos (a vírgula, os segundos, os dois algarismos), as
  bordas do dia (02:59:59 e 03:00 UTC), o ISO com `Z` e milissegundos, as oito colunas gravadas só por `CURRENT_TIMESTAMP`/`datetime('now')`,
  o filtro com `limit`/ordem, a reexportação.
- **r2 (autorização):** **0** Critical, **0** Important, **2** Minor **de antes** — `limit=abc` (ou gigante) nos Logs responde **500** com a
  mensagem crua do SQLite (`SQLITE_MISMATCH`), `limit=-1` tira o limite; só administrador alcança; a linha não mudou nesta etapa →
  **C422**. Conferidos: o 403 com a frase literal para um usuário comum de verdade, o 401 sem token, só `?` posicional, as tentativas de
  injeção (`' OR 1=1 --`, listas, 200 KB) sem linha fora do filtro, nenhum `dangerouslySetInnerHTML`, a planilha grava o ilegível como texto.
- **r3 (sabotagem, worktree `CRM-wt-e168-r3`):** **60** sabotagens, **49** mortas pela asserção certa, **11** sobreviventes: **6**
  equivalentes provadas (`String(valor)` em texto; `minute: 'numeric'` — o ICU pt-BR põe dois algarismos com hora, 60/60 iguais; o vazio da
  `data_viagem` inalcançável — `NOT NULL` e a rota recusa vazio; `'-3 hours'`/`'-180 minutes'` fixos — 200.001 instantes iguais, perde só o
  acoplamento ao `FUSO_PADRAO`; o `parseInt` do modificador) e **5 asserções faltando, reais**: S36 o `'—'` das *Minhas Solicitações*
  satisfeito pela coluna *Decisão*; S39 a planilha dos Logs sem log nulo; S41 o editor do modelo lendo `created_at` (a massa tinha os dois
  iguais); S42/S43 a lista de Usuários e o editor ganhando a hora (`toContain` em vez da célula exata). **Todas aceitas** em `e3dca5a6`;
  controle (`scratchpad/e168/sabota-f5.js`): as 5 e a do `soData` caem cada uma pela asserção nova; md5 restaurado. **0** ruído.

## Baterias (os números lidos nos logs, `scratchpad/e168/`)

- **Base, antes de qualquer código (`base-api.log`):** `test:api` **488/488**.
- **Bateria 1 — antes de `4d8df969`…`6e1011f3` (`b1-*.log`):** `test:api` **489/489** arquivos (`filtroDosLogsNoDiaLocal` **7/0**);
  `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **170** suítes / **2153** testes;
  `CI=true build` *Compiled successfully*; revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor
  **39/39**.
- **Bateria 2 — antes de `e3dca5a6` (`b2-*.log`):** `test:api` **489/489** arquivos; `test:almoxarifado` **44/0**; `test:validation`/`safealter`/`sqlite`
  **4/0, 3/0, 16/0**; client **170** suítes / **2153** testes (`horaDeCriacaoNoDiaLocal` **7/7** com as asserções da Fase 5); `CI=true build` *Compiled
  successfully*; proposta **23/23** + editor **39/39**.
- **Bateria 3 — o fechamento (`b3-*.log`; depois dela só documentos):** `test:api` **489/489** arquivos; `test:almoxarifado` **44/0**;
  `test:validation`/`safealter`/`sqlite` **4/0, 3/0, 16/0**; client **170** suítes / **2153** testes; `CI=true build` *Compiled successfully*;
  revisão obrigatória da proposta **23/23** scripts com saída 0 (*"TODOS OS INVARIANTES OK"*) + editor **39/39**. O intermitente conhecido do
  `superPadraoNoBoot` não apareceu em nenhuma das três baterias.

## Fora desta etapa (declarado)

- **C421 (novo)** — as outras telas que ainda leem a data no fuso universal (a varredura da Fase 0, acima).
- **C422 (novo, Fase 5 r2 — de antes)** — o `limit` inválido dos Logs (500 com a mensagem do banco; `-1` sem limite).
- Tudo o que depende do P.O. (a lista do fim do plano da 167 — inclusive a **C420** e a **B1067**).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** — a Fase 5 (cinco asserções e o `soData`; nenhum defeito de comportamento nas onze linhas). As
   tasks ficaram verdes na primeira aplicação do código; o teste de integração precisou de três ajustes **do próprio teste** (a massa e a
   ordem da resposta). **Testes antigos mudados: 0.**
2. **Achados da revisão:** Fase 2 — **0 Critical + 2 Important + 6 Minor**, todos reais (o mais caro: a véspera da coluna *Data* da viagem, que
   nenhuma lista anterior nomeava, e o cenário que não distinguia `'2-digit'` de `'numeric'`). Fase 5 — r1 **1** Minor (teórico, aceito); r2
   **2** Minor de antes (C422); r3 **5** faltas de asserção reais + 6 equivalentes provadas; **0** ruído. **O que mais pesou:** de novo a
   **asserção frouxa** (`toContain` num texto que tinha a resposta certa por outro motivo — a coluna vizinha, o `created_at` igual ao
   `updated_at`) — a sabotagem por linha do condutor não a achava porque revertia a linha inteira.
3. **Paralelismo:** **0** galhos de código em paralelo (T1–T3 pequenas, em sequência); **1** agente de varredura (Explore) em paralelo com a
   Fase 0 e o revisor da Fase 2; **3** revisores em paralelo na Fase 5 (o r3 na worktree própria) — **0** incidente de trava, **0** retrabalho.
4. **Defeito que escapou:** *(preencher na Etapa 169)*.

## Próxima tarefa detalhada — Etapa 169

*(A série desta etapa foi B1069–B1072, C421 e C422 novos; nenhuma A — a 169 começa em **B1073**, **C423**, **A106**; confira com `grep -oE`
antes.)*

**Escolhida: as datas da C421 no Comercial, no Operacional e nas Tarefas** (a metade da C421 em que a data errada pesa numa decisão — a OS
*vencida*, o prazo da tarefa, a hora da aprovação). Medido nesta etapa por um agente Explore (**cada linha a confirmar na Fase 0 da 169**,
inclusive se é roteada e como a coluna é gravada):

- **Comercial:** `Aprovacoes.js:268-310` (`formatDate` — usado em `:484`, `:569`, `:627`, `:636`): lê o `CURRENT_TIMESTAMP` como UTC (certo)
  e **subtrai mais 3 h** à mão (`:297`, `:303`) — 6 h a menos; `aprovacoes.created_at` e `aprovado_em` (`index.js:2898`, `:14309-14310`).
  `OrdensServicoComercial.js:147` (`formatDate`, `:466`, `:476` — `data_abertura`/`data_prevista` só data, véspera; `:359` o
  `data_aprovacao || updated_at` `CURRENT_TIMESTAMP` — dia seguinte à noite) e `:116`, `:188` (a contagem de *vencidas* compara a
  `data_prevista` com `new Date()` — conta a OS um dia antes); `PreviewOSEditavel.js:285`, `:295` (véspera).
- **Operacional / Fábrica:** `operacional/OrdensServico.js:75` (`:190`, `:191`), `OSDetalhesForm.js:502`, `:514` (via `OSFormPage`),
  `operacional/Producao.js:211` (o kanban) — só data, véspera.
- **Tarefas:** `todolist/TodolistBoard.js:43-45` (`formatDate`: o `prazo` só data — véspera, `:323`; o `created_at` — dia seguinte, `:327`),
  `:50` (`formatDateTime`, `:432` — 3 h adiantado; o `data_conclusao` é `toISOString` e está certo).

**Ferramentas prontas:** `utils/dataLocal.js` — `formatarInstanteDoBanco(valor, opcoes, vazio)`, `COM_SEGUNDOS`, `formatarDataDoBanco(valor,
vazio, { soData })`, `lerDataDoBanco`, `hojeLocalISO`. **Pontos de atenção:** (1) a trava de máquina
(`C:/Users/User/AppData/Local/Temp/claude/C--Users-User-projetos-CRM/trava-test-api.d`); (2) **a contagem de vencidas** é regra (o que é
*vencida* hoje) — comparar o `'AAAA-MM-DD'` com `hojeLocalISO()` como texto, e conferir se o servidor tem a mesma contagem (medir antes); (3) a
`Aprovacoes.js` tem um `formatDate` à mão com comentário que explica a conversão dupla — trocar pelo `formatarInstanteDoBanco`, e o teste prova
o texto antigo × o novo; (4) as asserções **exatas** da célula (a lição da r3 desta etapa: `toContain` num texto que acerta por outro motivo
não prende nada); (5) o molde de teste é `horaDeCriacaoNoDiaLocal.test.js`. **Para a 170:** o resto da C421 (o Chat, Compras, o Almoxarifado,
os PDFs de remessa e de posição do cliente) e a **C422** (validar o `limit` dos Logs — técnico).

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
reescrever em massa as cláusulas congeladas (**B1067**); **desta etapa**, nenhuma nova (trocar o formato das datas de cada tela seria
pergunta de produto — a B1069 manteve o de cada uma). Pendem de Postgres: **C98**, **C110**.

**O que já está pronto e não precisa reabrir:** o `diaLocal.js` do servidor e o `dataLocal.js` do navegador (com o `formatarInstanteDoBanco` e o
`COM_SEGUNDOS`); as onze exibições e o filtro dos Logs desta etapa (`4d8df969`, `df13f98a`, `6e1011f3`, `e3dca5a6`).
