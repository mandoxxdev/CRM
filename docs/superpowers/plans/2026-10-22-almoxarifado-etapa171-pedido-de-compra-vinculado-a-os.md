# Etapa 171 — Pedido de compra vinculado a uma OS

> **Status:** 🟡 em execução (2026-10-22). Plano escrito na Fase 1 da skill `desenvolver-etapa-almoxarifado`.
> **Origem:** pergunta da usuária de Compras ao André (2026-10-22): *"Quando um material for adquirido
> para atender a uma Ordem de Serviço (OS), qual será o procedimento para cadastrar ou vincular essa OS
> ao sistema, permitindo que todos os itens comprados sejam devidamente associados e controlados por ela?"*
> **Medido na Fase 0:** `pedidos_compra`, `itens_pedido_compra` e `solicitacoes_compra` **não têm** `os_id`
> (o pedido nasceu no commit inicial e as Etapas 38–41 nunca receberam esse pedido); a entrada
> `ENTRADA_COMPRA` (`receiptService.darEntradaEstoque` :1655) não grava `os_id`; a reserva na chegada só
> serve requisições que esperam; o `PUT` da OS (`index.js:20665`) é um `UPDATE` cru sem gancho; a lista
> de OS para select (`/api/almoxarifado/aux/ordens-servico`) exige o módulo do almoxarifado.

## Decisões do André (2026-10-22) — são regra, não sugestão

1. **Um pedido = uma OS, ou estoque.** Nada de itens de OS diferentes no mesmo pedido. "Se ela reclamar
   mudamos depois." → a OS mora no **cabeçalho** do pedido.
2. **OS cancelada com material já recebido:** o material vira estoque normal, **mas fica marcado** que
   era de uma OS antiga (histórico).
3. **Quem vincula/troca a OS:** usuário com permissão de Compras e administradores.

## Regras de negócio

| ID | Regra | Cenário |
|---|---|---|
| RN-171.01 | O pedido de compra tem `os_id` **opcional no cabeçalho**. Vazio = compra para estoque. | `POST` sem `os_id` → pedido de estoque, igual a hoje |
| RN-171.02 | A OS informada tem de existir. | `os_id: 999999` → 400 `OS #999999 não encontrada` |
| RN-171.03 | OS **cancelada ou concluída** não recebe compra **nova** (status em `cancelado, cancelada, concluido, concluida, encerrada`, comparado sem caixa e sem espaço). Manter no `PUT` a mesma OS que já estava (`os_id` igual ao gravado) **não** é recusado. | OS com status `cancelado` → 400 `A OS 2024-015 está cancelado — não aceita compra nova` |
| RN-171.04 | Colocar, trocar ou tirar a OS é pelo `PUT` do pedido, com a **mesma** guarda de hoje: módulo `compras` (admin passa pelo `bypassModuleRestrictions`) e pedido **sem recebimento** (o `PUT` já responde 400 depois de recebimento — a OS não ganha exceção). `os_id: null` no `PUT` tira a OS; ausente não mexe. | usuário sem módulo `compras` → 403 do portão; pedido já recebido → 400 atual |
| RN-171.05 | Lista e detalhe mostram a OS: `os_id`, `os_numero` (e `os_status` no detalhe), por `LEFT JOIN` vivo. A lista aceita `?os_id=N`. O documento/PDF do pedido mostra `OS: <numero_os>` quando houver. | lista filtrada por OS devolve só os pedidos dela |
| RN-171.06 | `GET /api/compras/aux/ordens-servico` (módulo `compras`) lista as OS **abertas** (fora do conjunto da RN-171.03) para o select; `?incluir=<id>` devolve também essa OS mesmo fechada (o pedido que já a tem precisa mostrá-la). | OS cancelada não aparece, a não ser pelo `incluir` |
| RN-171.07 | **Recebimento de pedido com OS:** a movimentação `ENTRADA_COMPRA` grava `os_id` do pedido (a marca permanente de origem — o "histórico" da decisão 2). | entrada de PC com OS 7 → `movimentacoes_almoxarifado.os_id = 7` |
| RN-171.08 | **O que entrou livre de um pedido com OS fica reservado para a OS**, ANTES da fila das requisições que esperam: uma reserva `ATIVA` com `os_id`, `recebimento_id`, motivo `Compra para a OS <numero_os>`, quantidade `min(entrou livre desta nota do material, disponível do material agora)`. Vale nas **duas** portas que distribuem: a nota (`reservarChegadaParaQuemEspera`) e a inspeção que aprova (`reservarLiberacaoParaQuemEspera`). Roda **sob a trava por material** que essas portas já seguram (CLAUDE.md). O que sobrar segue para a fila como hoje. OS que ficou cancelada/concluída **entre** o pedido e a chegada: não reserva (o material entra livre, com a marca da RN-171.07). | PC de 10 com OS → nota processada → reserva ATIVA de 10 para a OS; requisição que esperava não leva nada |
| RN-171.09 | **OS cancelada** (o `PUT` da OS muda o status de fora para dentro de `cancelado/cancelada`): as reservas `ATIVA` com `os_id` dela **e** `recebimento_id` preenchido (as que a RN-171.08 criou) são liberadas — `statusFinal: 'LIBERADA'`, motivo `OS <numero_os> cancelada — material volta ao estoque`. A movimentação de entrada e a reserva liberada **continuam** com o `os_id` (decisão 2). A resposta do `PUT` ganha `reservas_liberadas: n` (aditivo). Liberar sem distribuir **não** pega a trava (CLAUDE.md, B441). | OS cancelada → reserva LIBERADA, disponível sobe 10, `mov.os_id` continua 7 |
| RN-171.10 | **Excluir uma OS com pedido de compra vinculado** é recusado: 409 `A OS <numero_os> tem pedido de compra vinculado (<PC-…>) — cancele a OS em vez de excluir`. Sem pedido, exclui como hoje. | protege o histórico da decisão 2 |
| RN-171.11 | **Estorno da entrada** de um recebimento de pedido com OS: a reserva da OS daquele recebimento/material é liberada o quanto o estorno precisar (como `liberarParaEstorno` já faz com as de requisição), para o estorno não ser recusado por falta de disponível que a própria reserva da OS prende. | entrada de 10 reservada para OS → estorno da entrada → 200, reserva liberada, físico volta |

## Contratos congelados

- `POST /api/compras/pedidos` e `PUT /api/compras/pedidos/:id` — corpo ganha `os_id`: inteiro positivo,
  `null` ou ausente. Zod em `PedidoCompraCreateSchema` (`services/compras/schemas.js:178`): inteiro
  positivo ou nulo, senão 400 `OS inválida`. Recusas literais: RN-171.02, RN-171.03. Resposta: o pedido
  como hoje + `os_id`, `os_numero`.
- `GET /api/compras/pedidos` — cada linha + `os_id`, `os_numero`; filtro `?os_id=N` (inteiro; inválido é ignorado como os outros filtros da lista).
- `GET /api/compras/pedidos/:id` — + `os_id`, `os_numero`, `os_status`.
- `GET /api/compras/aux/ordens-servico[?incluir=id]` — `authenticateToken, checkModulePermission('compras')`;
  resposta `[{ id, numero_os, status, cliente_nome }]`, `ORDER BY id DESC LIMIT 300`.
- `PUT /api/operacional/ordens-servico/:id` — resposta atual + `reservas_liberadas` (número; 0 quando não cancelou).
- `DELETE /api/operacional/ordens-servico/:id` — novo 409 da RN-171.10.
- Recebimento, inspeção e estorno: sem mudança de contrato HTTP; efeitos das RN-171.07/08/11.
- Front (`client/src/components/compras/PedidoCompraForm.js`): `<select data-testid="pedido-os">` com
  opção `Estoque (sem OS)` (valor vazio → `os_id: null`), carregado de `/compras/aux/ordens-servico`
  (com `incluir` na edição). Lista de pedidos: coluna **OS** (`os_numero` ou `-`).

## Tasks

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Coluna `pedidos_compra.os_id` (safeAlter, onde o harness enxerga — conferir se `pedidos_compra` vem de `index.js` com stub no `testApp.js`), Zod, `criarPedido`/`atualizarPedido` com RN-171.01–04, leitura RN-171.05 (lista, filtro, detalhe, documento do pedido), rota aux RN-171.06. Teste `comprasPedidoOs.api.test.js`. | **tronco** | — |
| T2 | Recebimento: RN-171.07 (os_id na entrada), RN-171.08 (reserva para a OS nas duas portas, sob a trava, antes da fila), RN-171.11 (estorno). Teste `recebimentoPedidoOs.api.test.js` com controle positivo. | **tronco** (mexe no motor/distribuição) | T1 |
| T3 | OS: RN-171.09 (cancelar libera) e RN-171.10 (excluir com pedido → 409) nas rotas de `index.js`. Teste `osCanceladaLiberaCompra.api.test.js`. | galho | T2 (consome a reserva criada) |
| T4 | Front: select de OS no `PedidoCompraForm`, coluna OS na lista de pedidos, testes Jest com mock na fronteira HTTP. | galho (worktree) | contrato T1 |
| T5 | **Integração cruzando galhos**: criar OS → pedido com OS (pela rota) → recebimento processado → reserva da OS → requisição que esperava não leva → cancelar OS (pela rota) → disponível volta, `mov.os_id` e reserva LIBERADA com `os_id`. E o mesmo começo entrando **pelo serviço** (`criarPedido` direto). | integração | T1–T3 |

## Fora do escopo (declarado, letra D)

- Proteger a reserva de uma OS de ser consumida por saída de **outra** OS (hoje reserva `MANUAL` não confere a OS — medido, `stockService.js:1216`).
- Cotação → "Gerar pedido" e Reposição → pedido não repassam OS; o comprador coloca pelo `PUT` antes de receber.
- Tela da OS listando seus pedidos (o filtro `?os_id` da RN-171.05 já serve de base).

## Próxima tarefa detalhada

*(preencher no fechamento)*

---

## Revisão da Fase 2 (2026-10-22) — 2 críticos, 7 importantes, 4 menores; o plano acima vale COM estas emendas

As emendas **prevalecem** sobre a tabela de RN acima quando discordarem.

- **C1 (crítico) — a requisição da própria OS não conseguia usar a reserva da OS.** A requisição só conta a reserva
  dela (`saldoDisponivelParaItem`, `requisitionService.js:333`, `origem='REQUISICAO'`); a reserva `MANUAL` da OS
  descontava do disponível de todo mundo, inclusive da produção da OS → material preso para sempre. **Nova
  RN-171.12:** (a) na chegada (nota/inspeção/NC), dentro da mesma seção da trava, as requisições da fila com
  `r.os_id = pedido.os_id` são servidas **primeiro** (reserva `REQUISICAO` normal, pelo `distribuirSemLock` com filtro
  de OS); o que sobrar vira a reserva da OS; a fila geral não leva nada desse material desta nota. (b) Na **aprovação**
  (`requisitionService` :415–440, o laço que chama `criarReserva`) de requisição com `os_id`, antes de calcular o
  disponível do item, as reservas da OS do mesmo material (o predicado abaixo) são liberadas até `falta` — sob a trava
  que a aprovação já segura — e a reserva da requisição é criada do jeito de hoje. Teste até a **entrega**.
- **Predicado congelado da "reserva da OS"** (T2 cria, T3 e a aprovação consomem): `status='ATIVA' AND origem='MANUAL'
  AND os_id = ? AND recebimento_id IS NOT NULL`.
- **C2 — OS concluída também solta.** RN-171.09 vale para o status entrar em **qualquer** valor do conjunto da
  RN-171.03 (cancelado, cancelada, concluido, concluida, encerrada). Motivo: `OS <numero_os> <status> — material volta
  ao estoque`.
- **I1 — teto pela régua da reserva manual:** `min(entrou livre desta nota, livre de caixa)` (`criarReservaSemTrava`
  confere `livreDeCaixaSql`, `stockService.js:3665`), e o livre que a OS tomou sai do que vai para a fila.
- **I2 — a reserva da OS não expira:** opção `semExpiracao` em `criarReservaSemTrava` (sem `expira_em` mesmo com
  `reserva_dias_validade`), com teste.
- **I3 — idempotente:** quantidade da reserva da OS = livre da nota − Σ reservas (qualquer status) com esse
  `recebimento_id` + material + `os_id`. Retomar/reprocessar a nota não reserva de novo.
- **I4 — a NC é a terceira porta** (`nonConformityService.js:1010` → `aposLiberacaoSemFalhar`). Entra na RN-171.08 e no teste.
- **I5 — estorno:** `liberarParaEstorno` passa a liberar também a reserva da OS daquele recebimento/material (antes das
  de requisição), sempre `min(reserva, quantidade estornada)` — o estorno tira da OS o que a nota deu a ela, mesmo com
  disponível sobrando. `recriarAposEstornoRecusado` recria a da OS com `os_id`, motivo e `semExpiracao`; quem lê
  `requisicao_id` dessas liberadas tem de tolerar `null`.
- **I6 — `os_id: null` no `PUT` TIRA a OS** (não entra em `COLUNAS_CABECALHO`, que trata `null` como "não mexe"). Zod:
  ausente = não mexe; `null` e `''` = sem OS; inteiro positivo (número ou string só de dígitos, como o `<select>`
  manda) = OS; `0`, `-1`, `1.5`, `true`, `"abc"` → 400 `OS inválida`. RN-171.02/03 checadas **no serviço** (cotação,
  reposição e importação chamam `criarPedido` direto). A importação de planilha **ignora** coluna de OS (letra D).
- **I7 — soltou, redistribui:** depois de liberar (RN-171.09), fora de qualquer trava, distribuir o liberado para a
  fila que espera (molde `reservarLiberacaoParaQuemEspera`/`aposLiberacaoSemFalhar`, sem `sobTrava`). O `PUT` da OS lê
  o status **anterior** antes do `UPDATE` (ele grava `status || 'pendente'`).
- **M1 — testes de OS:** o harness não tem `ordens_servico` nem monta `index.js`. Extrair
  `services/almoxarifado/osEncerradaService.js` (`liberarReservasDaOs(db, user, osId, statusNovo)` e
  `pedidosDaOs(db, osId)`), testável no harness com `ordens_servico` criada pelo teste; a fiação no `index.js` provada
  por `spawn` (molde `familiasListaOsPortao.api.test.js:72`), que também confere a cadeia de middleware do PUT/DELETE.
- **M2 — OS apagada/renumerada:** lista/detalhe/PDF por `LEFT JOIN`; sem OS encontrada e com `os_id` gravado, o texto
  é `OS #<id>`. Snapshot do número **descartado** (B): OS renumerada é raro e a RN-171.10 já impede apagar com pedido.
- **M3** — coberto por I6.
- **M4 — trocar o destino da reserva da OS** (`reservationService.js:97`) fica permitido e vai para a letra D.

### Tasks revistas

| # | Task | Tipo | Depende |
|---|---|---|---|
| T1 | Pedido com OS (RN-01..06, I6, M2) | tronco | — |
| T2 | Chegada e aprovação (RN-07, 08, 11, 12; I1–I5) | tronco | T1 |
| T3 | OS encerrada/excluída (RN-09, 10; C2, I7, M1) contra o predicado congelado, semeando com `criarReserva` | galho (worktree) | T1 |
| T4 | Front | galho (worktree) | contrato T1 |
| T5 | Integração ponta a ponta até a entrega, pela rota e pelo serviço | integração | T1–T4 |

## Execução

### T1 — pedido com OS (RN-171.01 a 06, I6, M2) — ✅ feita (`c0c4746b`)

- **Coluna:** `pedidos_compra.os_id INTEGER` em `ALTERS_PEDIDOS_COMPRA` (`index.js`, no callback do CREATE) e no stub do
  harness (`tests/helpers/testApp.js`). Sem FK (a RN-171.10 da T3 protege a exclusão). Primeiro boot provado:
  `CRM_DATA_DIR` em pasta vazia, duas subidas, 0 `no such table`/`no column named`, `pragma_table_info` mostra `os_id INTEGER`.
- **Zod** (`schemas.js`, `os_id` no `PedidoCompraCreateSchema`): ausente = não mexe; `null`/`''` = sem OS; inteiro positivo
  como número ou string só de dígitos = OS; `0`, `-1`, `1.5`, `true`, `"abc"` → 400 `Dados inválidos — os_id: OS inválida`.
  A mesma normalização (`normalizarOsIdBruto` + `OS_INVALIDA`) é reusada no serviço: chamador direto com lixo → 400 `OS inválida`.
- **Serviço** (`pedidoCompraService.js`): `os_id` fora de `COLUNAS_CABECALHO`; `criarPedido` grava só quando há OS;
  `atualizarPedido` grava quando a chave veio (`null` tira). Guardas no serviço, antes de qualquer escrita:
  `OS #<id> não encontrada` e `A OS <numero_os> está <status> — não aceita compra nova` (status com `trim`, como gravado).
  No `PUT`, a guarda da OS roda **depois** da de recebimento (que continua sem exceção). Exportados para a T2/T3:
  `STATUS_OS_FECHADA`, `osFechada`, `numerosDasOs`.
- **Leitura:** detalhe (`relerPedido`, logo também a resposta do POST/PUT e o documento) + `os_id`, `os_numero`, `os_status`;
  lista + `os_id`, `os_numero` e `?os_id=N` (inválido ignorado); documento/PDF com `OS: <numero_os>`, `OS #<id>` com a OS
  sumida, sem linha no pedido de estoque.
- **Rota** `GET /api/compras/aux/ordens-servico[?incluir=id]` (`routes/compras.js`, antes do POST de pedidos; GET de 3
  segmentos não é sombreado pelo `DELETE /api/compras/:tipo/:id`).
- **Teste** `server/tests/api/comprasPedidoOs.api.test.js`: 26 cenários, inclusive o portão **real** de módulo
  (`criarPortoesDeModulo` num app próprio — o harness libera essa camada): sem `compras` → 403 no POST/PUT/aux; com
  `compras` e admin passam. Controle positivo: 13 sabotagens (guarda de fechada, de inexistente, `null` que não tira,
  exceção da mesma OS, Zod sem `os_id`, serviço sem normalizar, aux sem filtro, aux sem `incluir`, lista sem `os_numero`,
  lista sem filtro, documento sem OS, documento sem `OS #id`, detalhe sem OS) — todas deixaram o teste certo vermelho;
  restauradas por cópia e conferidas com `cmp`. Suíte: `test:api` 491/491 arquivos OK; `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 16/16. Além disso, o primeiro rodar pegou um defeito real (regex `\d` perdido
  no filtro e no `incluir`).

**Divergências do previsto (letra B):**
1. **"LEFT JOIN vivo" virou consulta viva separada** (`lerOsDoPedido`/`numerosDasOs`), só quando o pedido tem `os_id`.
   Motivo: `ordens_servico` é tabela core que o harness não tem e 13 arquivos de teste a criam com DDL própria; um JOIN
   incondicional no `SQL_PEDIDO`/lista derrubaria com `no such table` todo teste de Compras, e pôr a tabela no stub mudaria
   "quem cria primeiro vence" para esses 13. Efeito para o usuário é o mesmo (lido na hora, OS sumida → `null`).
   Descartado: stub de `ordens_servico` no harness.
2. **Manter a mesma OS no `PUT` dispensa as DUAS guardas**, não só a de fechada: se a OS sumiu depois do vínculo, o
   pedido continua editável (o `<select>` manda a OS atual em todo `PUT`). Descartado: recusar `OS #<id> não encontrada`
   ao editar um pedido cuja OS foi apagada — travaria o pedido sem gesto de saída além de tirar a OS.
3. **A aux traz o `incluir` por consulta à parte** (acrescentado se não veio), não por `OR id = ?` dentro do `LIMIT 300`:
   com mais de 300 OS abertas uma OS antiga do `incluir` ficaria de fora.
4. `lerPedidoParaRecebimento` (projeção do almoxarife) **não** ganhou a OS — fica para a T2 se ela precisar.

### T2 — chegada e aprovação (RN-171.07, 08, 11, 12; I1–I5) — ✅ feita (`4dc8433d`)

- **Módulo novo** `services/almoxarifado/reservaDaOs.js` (sem ciclo: `db`, `stockService`, `caixaSql`, `quantidade`; o
  `pedidoCompraService` lazy, só pelo `osFechada`). Exporta `PREDICADO_RESERVA_DA_OS_SQL` (o congelado), `motivoReservaDaOs`,
  `chaveDaOs`/`requisicaoEhDaOs`, `osIdDoPedido`, `osAbertaDoRecebimento`, `jaReservadoDaNotaParaOs`,
  `reservarParaOsSobTrava`, `reservasDaOsParaRequisicao`, `recriarReservaDaOs`.
- **RN-171.07:** `darEntradaEstoque` lê `pedidos_compra.os_id` uma vez e passa `os_id` ao motor na `ENTRADA_COMPRA` — mesmo
  com a OS fechada (é a marca). Base sem a coluna (DDL própria de teste) → `null`, calado.
- **RN-171.08 + 12(a), I1, I4:** nas três portas (`reservarChegadaParaQuemEspera` e `reservarLiberacaoParaQuemEspera`, que
  serve inspeção e NC), com OS **aberta** lida **dentro** da seção: `distribuirParaOs` = `distribuirSemLock` com
  `filtro` (só requisições da OS) e o resto em `reservarParaOsSobTrava` (`criarReservaSemTrava`, teto
  `min(resto, livre de caixa)`, `semExpiracao`, `recebimento_id` da nota, `os_referencia` = número, observação e motivo
  `Compra para a OS <numero_os>`). A fila geral não é chamada para esse material. `distribuirSemLock` passou a devolver o
  quanto reservou (os chamadores antigos ignoram).
- **I2:** `criarReservaSemTrava` ganhou `opcoes.semExpiracao` (ignora `expira_em` e `reserva_dias_validade`); exportada.
- **I3:** só na porta da nota — teto = livre da nota − `jaReservadoDaNotaParaOs` (reservas de qualquer status com o
  `recebimento_id` + material, origem REQUISICAO ou MANUAL da OS, pela quantidade **original** da movimentação `RESERVA`).
- **RN-171.12(b):** `reservarItensAprovacao` (o laço das **três** portas de aprovação: `/aprovar`, `/aprovar-valor` e a
  automática, todas por `prepararPosAprovacao` sob `comTravaDaRequisicao`) — requisição da OS libera as reservas da OS do
  material (mais antigas primeiro) até a `falta`, relê o saldo e reserva como hoje. Só converte se o livre de hoje
  (`disponivel − jaReservado − caixa dos outros`) não for negativo (senão o liberado iria para a caixa alheia: sobra solta).
  Falhou a reserva, `aReservar ≤ 0` ou excesso de arredondamento → o pedaço volta como reserva da OS. A entrada de `reservas`
  ganha `os_convertida` (aditivo, só quando converteu) e o `desfazerReservas` (aprovação que perde o `UPDATE`) a recria
  depois de soltar a da requisição.
- **RN-171.11 + I5:** `liberarParaEstorno` solta **primeiro** a reserva da OS do recebimento/material (mais novas primeiro,
  `min(reserva, estornado)`, mesmo com disponível sobrando) e só depois as de requisição; as da OS voltam na lista com
  `reserva_da_os: true, requisicao_id: null`. `recriarAposEstornoRecusado` recria essas pela `recriarReservaDaOs` (os_id,
  motivo, sem expiração). O motor filtra `null` em `requisicoesDoEstorno`.
- **Teste** `server/tests/api/recebimentoPedidoOs.api.test.js`: 16 cenários (pelas rotas; I3 pelo serviço), inclusive a
  ponta a ponta até a **entrega** e a corrida (gancho em `reservaDaOs.reservarParaOsSobTrava` só sinaliza e segura; o
  `/aprovar` sai do contexto do teste e tem de esperar 250 ms sem terminar). Controle positivo: 14 sabotagens, todas
  vermelhas, restauradas por cópia e conferidas com `cmp` — S1 sem `os_id` na entrada; S2 `semExpiracao` ignorado; S3 fila
  sem filtro de OS; S4 nota sem modo OS; S5 sem o desconto da I3; S6 sem teto de caixa; S7 sem `osFechada`; S8 inspeção/NC
  sem modo OS; S9 aprovação sem conversão; S10 estorno sem soltar a da OS; S11 recriação sem o ramo da OS; S12
  `comTravaDaRequisicao` sem trava (só a corrida cai); S13 `chaveDaOs` sem tirar o prefixo; S14 conversão liberando além
  da falta.
- Suítes: `test:api` 492/492 arquivos OK; `test:almoxarifado` 44/44; `test:validation` 4/4, `test:safealter` 3/3, `test:sqlite` 16/16.

**Divergências do previsto (letra B):**
1. **A requisição não tem `os_id`** — a Revisão da Fase 2 (C1) escreveu `r.os_id = pedido.os_id`, e
   `requisicoes_almoxarifado` só tem `os_referencia` (texto livre, obrigatório no envio — `exigirOS`). O `reqRow.os_id` que
   `reservarItensAprovacao` já passava ao `criarReserva` é sempre `undefined`. **Escolhido:** "requisição da OS" =
   `os_referencia` igual ao `numero_os` pela `chaveDaOs` (sem caixa, espaços das pontas, espaços internos colapsados, prefixo
   `OS`/`OS-`/`OS#`/`OS:` ignorado). **Descartado:** coluna `requisicoes.os_id` + select de OS na requisição (contrato novo
   de API e tela, fora do escopo da T2) — é a evolução natural se o texto livre errar demais. Corrigido aqui o que a emenda
   C1 afirmava.
2. **I3 só na porta da nota.** Na inspeção e na NC a decisão é reivindicada uma vez (não há retomada), e a NC que aceita
   depois de uma inspeção do mesmo recebimento/material libera quantidade **nova** — descontar o Σ do recebimento a zeraria.
3. **Conversão prefere a reserva da OS ao livre:** com livre de outra origem sobrando, a requisição da OS consome primeiro
   o que foi comprado para ela (o livre fica para os outros). Descartado: usar o livre primeiro (prenderia o comprado e
   gastaria o estoque comum).
4. **`liberarParaEstorno` solta a da OS das mais novas para as mais antigas** (a recriação após estorno recusado cria uma
   linha nova; a mais nova é a mais provável de ser a que esta nota deixou).
5. **OS que sumiu** (`ordens_servico` sem a linha) com o pedido apontando para ela: não reserva (fila geral, como pedido de estoque); a entrada guarda o `os_id` mesmo assim. A RN-171.10 da T3 impede apagar a OS com pedido.

**Portas que reservam e NÃO herdam a conversão (letra D):** separação/entrega de requisição da OS **sem** reserva
(APROVADO sem hold — ex.: barrada por valor/dono na chegada e liberada depois) não converte a reserva da OS; reserva
manual (`POST /reservas`) e a troca de destino da reserva (`reservationService`, M4) não olham a OS. A requisição da OS
que já estava aprovada e esperando e foi pulada na chegada (valor/dono) também não reconverte depois — só uma nova
aprovação converte.

### T3 — OS encerrada/excluída (RN-171.09, 10; C2, I7, M1) — ✅ feita (`07d6a8c8`, merge `5bb6946c`)

- **Serviço** `services/almoxarifado/osEncerradaService.js`: `liberarReservasDaOs(db, user, osId, statusNovo)` solta as
  reservas do predicado congelado com `statusFinal: 'LIBERADA'` e motivo `OS <numero_os> <status> — material volta ao
  estoque` (reserva e movimentação; `os_id` preservado nas duas). Liberar não pega a trava (B441). Depois, **fora** de
  qualquer trava, redistribui por material + nota de origem chamando `reservaChegadaService.reservarLiberacaoParaQuemEspera`
  **sem** `sobTrava`, com `origem: 'OS_ENCERRADA'` (I7). `pedidosDaOs` e `recusaExclusaoComPedido` para a RN-171.10.
- **Rotas** (`index.js`): o `PUT` da OS lê o status anterior antes do `UPDATE`, só a transição de fora para dentro do
  conjunto fechado solta (`entrouNoFechado`) e a resposta ganha `reservas_liberadas`; o `DELETE` com pedido → 409.
- **Testes:** `osEncerradaLiberaCompra.api.test.js` (serviço, no harness) e `osEncerradaRotas.api.test.js` (fiação no
  `index.js` por spawn, 8/8).

### Correção do rótulo da redistribuição da OS encerrada — ✅ feita (`0ac039db`)

- **Defeito:** `reservaChegadaService.rotulosDaLiberacao` só conhecia `NAO_CONFORMIDADE`; a origem `OS_ENCERRADA` da T3 caía
  no ramo da inspeção — a reserva redistribuída dizia `Reserva na liberação da inspeção — recebimento X` sem inspeção
  nenhuma. **Agora:** ramo próprio `rotulosDaOsEncerrada`: motivo `Reserva na liberação da OS <numero_os> encerrada —
  recebimento <REC>` e observação `… — requisição <REQ>` (número vem em `documento_numero`, que o `osEncerradaService` já
  passava; sem ele, `#<id>`). "encerrada" é genérico de propósito: cobre cancelada/concluída (C2).
- **Teste:** novo cenário RN-171.09/I7 em `osEncerradaLiberaCompra.api.test.js` (observação da reserva + motivo da
  movimentação `RESERVA`), 18/18. Controle positivo: ramo desligado → só ele vermelho (17/18); restaurado e conferido com `cmp`.

### T5 — integração ponta a ponta (T1+T2+T3) — ✅ feita (`86a956bb`)

- **Teste** `server/tests/api/pedidoOsPontaAPonta.api.test.js`, 3 roteiros, 3/3:
  1. **Pela rota:** OS aberta → `POST /api/compras/pedidos` com `os_id` → `GET` detalhe com `os_numero` → nota processada
     pela rota → `ENTRADA_COMPRA.os_id` e reserva da OS de 10 → a requisição sem OS que esperava fica com 0 → a requisição da
     OS (`os_referencia = numero_os`) aprovada converte 6 → separa e **entrega** 6 → físico 4, reservado 4 (os 4 da OS).
  2. **Pelo serviço** (`criarPedido` direto) até a reserva da OS → OS cancelada (`UPDATE` + `liberarReservasDaOs`, como o
     `PUT` do `index.js` faz — a rota não está no harness, a fiação é o `osEncerradaRotas`) → reserva `LIBERADA` com `os_id` e
     motivo, `mov.os_id` preservado, a requisição sem OS recebe 6 com o rótulo novo e fica `TOTALMENTE_RESERVADA`, 4 livres;
     `PUT` de um pedido de estoque trocando para a OS cancelada → 400 `A OS <n> está cancelado — não aceita compra nova`;
     `PUT` do pedido já recebido → 400 da guarda de recebimento (OS mantida).
  3. Pedido de 10 com OS recebido em 4 + 6 → duas reservas da OS (4 e 6, cada uma com o seu `recebimento_id`) → estorno da
     segunda entrada → 200, só a dela `LIBERADA` (motivo do estorno), físico 4, reservado 4.
- **Controle positivo** (restaurado por cópia, conferido com `cmp`): S-T1 `criarPedido` sem gravar `os_id` → 3/3 vermelhos;
  S-T2 `reservarParaOsSobTrava` sem criar → 3/3 vermelhos; S-T3 `liberarReservasDaOs` sem liberar → só o Roteiro 2 vermelho.
- Suítes: `test:api` 495/495 arquivos OK; `test:almoxarifado` 44/44.
- **Defeito achado pelo roteiro:** nenhum além do rótulo acima (que já era conhecido ao abrir a T5). O roteiro confirmou
  que o `PUT` do pedido exige o corpo completo (Zod) — não é defeito, é o contrato de hoje.
