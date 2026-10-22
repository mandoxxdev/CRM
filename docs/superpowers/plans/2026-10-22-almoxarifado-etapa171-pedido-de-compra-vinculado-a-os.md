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
