# Almoxarifado — Etapa 122: a aprovação que falha não prende material, e o estado não mora na Auditoria (plano)

> Origem: "Próxima tarefa detalhada — Etapa 122" do plano da 121 (**C254**, **C255**, o excedente da conferência — **D (121)**).
> Design com a Fase 0 medida: `docs/superpowers/specs/2026-10-16-almoxarifado-etapa122-a-aprovacao-que-falha-e-o-estado-fora-da-auditoria-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B787**,
> último C **C255**, última A **A69**. Esta etapa: **B788+**, **C256+**, **A70+**. Worktree `CRM-wt-e122`, branch `etapa-e122`
> (a partir da main `a0edfb70`).
>
> **Ordem da skill:** este plano foi revisado (Fase 2) **antes** de qualquer código (na 121 a T1 veio antes — divergência
> corrigida).
>
> **Fase 2 (um revisor fresco, sondas `e122r-d2.js`, `e122r-almoxtest.js`, não versionadas): 0 Critical, 3 Important, 6 Minor,
> todos aceitos.** **I1 (reproduzido)** — `tests/almoxarifado.test.js` cria o próprio `pedidos_compra` depois do `initSchema`,
> sem a coluna: o fechamento automático daria `no such column` e o espião de avisos da suíte reprova → o DDL dele ganha a coluna,
> na T2. **I2** — a C256/A70 do design não tinham RN nem task, e o design dizia `CANCELADA` (o status é `CANCELADO`) → RN-15 e a
> A70 na T6, com controle positivo, `CANCELADO` e `ativo = 0`. **I3 (reproduzido)** — a D2 cobria só o `UPDATE`: no
> `/aprovar-valor` o `prepararPosAprovacao` que lança (leitura do saldo), o 409 `TRAVA_INCOMPLETA` e a releitura também rodam
> com o APROVADO já gravado e davam 500 (repetir: 400) → o bloco inteiro depois do serviço fica num `try`, RN-02c. **M1** — sem
> saldo o log dizia "com a reserva" → log neutro, RN-02b. **M2** — a RN-04 citava arquivos inexistentes → corrigido. **M3** — os
> testes de backfill apagam o ledger antes da chamada direta (o `initSchema` em fundo do harness já o gravou). **M4** — tabela do
> Compras ausente no `initSchema` (banco novo) grava o ledger (sem legado). **M5** — trilha só com `changes === 1`, casada pela
> posição do payload; os comentários da 121 que diziam "fica fatal" são reescritos. **M6** — o `GET` do recebimento (`SELECT *`)
> também passa a trazer a coluna (aditivo).

## Regras de negócio

"Falhando" = o comando citado forçado a falhar **uma vez** (gancho no `db.run`, molde `auditoriaDoAtoRequisicao.api.test.js`).
Requisição de 3 de material com saldo 10, salvo dito.

**C254 — a aprovação que falha ao gravar o status (B789, B790).** Testes: `server/tests/api/aprovacaoQueFalhaAoGravar.api.test.js`.

- **RN-01 — `/aprovar`, o `UPDATE` do status lança.** → **500** `{ error: <msg do banco> }` (a de hoje), status **PENDENTE**,
  **0** reservas ATIVA (a desta chamada `LIBERADA`), `quantidade_reservada` do material de volta a 0. Repetir → 200
  TOTALMENTE_RESERVADA, **1** reserva ATIVA.
- **RN-01b — e rejeitar depois.** O mesmo 500 → rejeitar → 200 REJEITADO com **0** reservas ATIVA (hoje: 1 — cenário 3 do design).
- **RN-02 — `/aprovar-valor`, o `UPDATE` do status lança.** → **200** `{ success: true, status: 'APROVADO', reservas: [1] }`,
  status gravado **APROVADO**, **1** reserva ATIVA de 3; o log tem *"[almoxarifado-aprovar-valor] A requisição ⟨id⟩ foi liberada
  por valor e fica APROVADO; o status pós-aprovação não foi gravado: ⟨msg⟩"*; a Auditoria `APROVACAO_VALOR` grava
  `status: 'APROVADO'`.
- **RN-02b — sem saldo** (material com 0): o `UPDATE` (para AGUARDANDO_ESTOQUE) lança → 200 `status: 'APROVADO'`, `reservas: []`,
  0 reservas, o mesmo log (Fase 2, M1).
- **RN-02c — o pós-aprovação lança** (a leitura `reservado_para_item` falhando uma vez, dentro de `prepararPosAprovacao`) → 200
  `status: 'APROVADO'`, `reservas: []`, 0 reservas ATIVA, o mesmo log. (Hoje: 500, e repetir dá 400 — Fase 2, I3.)
- **RN-03 — guarda: a aprovação automática** (configuração `aprovacao_automatica = '1'`, `POST /requisicoes`) com o `UPDATE`
  falhando → 201, PENDENTE, 0 reservas ATIVA (já é assim desde a 73; o teste prende).
- **RN-04 — guarda: quem perde o `UPDATE`** (0 linhas, não lança) segue como hoje (400 *"Transição inválida: …"*, reservas
  desfeitas) — coberto pela suíte existente (`aprovarPerdedorReservaJaSolta`, `requisicaoGestosConcorrentes`,
  `requisicaoReservaAutomatica`, `regrasAprovacao`), sem teste novo. *(Citava `aprovacaoRegras*` e `requisicaoAprovar*`, que
  não existem — Fase 2, M2.)*
- **RN-15 — C256, o legado (A70):** a consulta acha a reserva ATIVA de requisição PENDENTE/REJEITADO/CANCELADO ou `ativo = 0`;
  controle positivo: o cenário 3 da Fase 0 rodado no código de antes gera a linha REJEITADO, e a consulta a acha (na T6, no banco
  de uma sonda).

**C255a — o fechamento automático do pedido numa coluna (B788).** Testes: `server/tests/api/pedidoFechadoSemTrilha.api.test.js`.
Pedido `enviado` de 2 pela porta real, nota de 2 processada contra ele (fecha `recebido`), estorno da entrada pela rota
`POST /movimentacoes/:id/cancelar`.

- **RN-05 — a trilha do fechamento falhando** (`pedido_compra`/`STATUS_AUTOMATICO_RECEBIDO`) → processar 200, pedido `recebido`,
  `fechado_automaticamente_de = 'enviado'`; o estorno → pedido **`enviado`**, coluna **NULL**. (Hoje: continua `recebido`.)
- **RN-06 — a trilha da reabertura falhando** (`STATUS_AUTOMATICO_REABERTO`) → o estorno reabre (`enviado`), coluna NULL; nova
  nota de 2 → `recebido` com a coluna `enviado` de novo; segundo estorno reabre outra vez.
- **RN-07 — o comprador fecha à mão, as duas trilhas manuais falhando:** fechamento automático → `PATCH /api/compras/pedidos/:id/status`
  `aprovado` (trilha falhando) → `PATCH` `recebido` (trilha falhando) → estorno → pedido **continua `recebido`** (o fechamento é do
  comprador, RN-E03 da 71). (Hoje: reabria, porque a última trilha era a automática.)
- **RN-07b — o PATCH que reescreve o mesmo status** (`recebido` → `recebido`) não limpa: o estorno reabre (`enviado`).
- **RN-07c — sem trilha nenhuma e sem coluna** (pedido `recebido` gravado direto) → o estorno não reabre (o de hoje, Fase 5 da 71).
- **RN-08 — destino ilegível:** coluna com `'qualquer'` → reabre para `pendente`.
- **RN-09 — o legado (`schema.migrateBackfillPedidoFechadoAutomaticamente`, chamada direta):** três pedidos `recebido` com a coluna
  NULL — (a) última trilha `STATUS_AUTOMATICO_RECEBIDO` com `dados_anteriores {"status":"aprovado"}` → coluna `aprovado`; (b)
  última trilha `STATUS_MANUAL_ALTERADO` (depois de uma automática) → NULL; (c) trilha automática com `dados_anteriores` ilegível →
  `pendente`; e (d) um pedido `enviado` com trilha automática → NULL (não está `recebido`). Segunda chamada com o ledger → não
  toca (a coluna do (a) posta à mão a NULL continua NULL). O teste apaga o ledger antes da 1ª chamada (o `initSchema` em fundo do
  harness já o gravou — Fase 2, M3). Tabela `pedidos_compra` ausente → grava o ledger e sai (banco novo, sem legado — M4).
- **RN-09b — primeiro boot num banco novo** (prova manual, `CRM_DATA_DIR` em pasta vazia + `node index.js`): a coluna existe em
  `pedidos_compra` e em `recebimentos_material_almoxarifado`, e os dois ledgers estão gravados (ou o de pedido ausente, se a
  tabela do Compras ainda não existia no `initSchema` — e então a coluna veio do `index.js`).

**C255b — a conferência finalizada numa coluna (B788, a parte do módulo).** Testes: `server/tests/api/conferidoSemTrilha.api.test.js`.

- **RN-10 — a trilha `FINALIZAR_CONFERENCIA` falhando** → workflow 200 CONFERIDO_ALMOX, `conferencia_finalizada_em` preenchida;
  `GET /relatorios/qualidade-fornecedores` dá `itens_conferidos: 1`. (Hoje: 0.)
- **RN-11 — guarda:** o `/conferir` com `status: 'CONFERIDO_ALMOX'` (sem o gesto) não preenche a coluna → `itens_conferidos: 0`;
  e o gesto finalizar com a trilha gravando → 1 (a régua de sempre).
- **RN-12 — o legado (`schema.migrateBackfillConferenciaFinalizadaEm`, chamada direta, ledger apagado antes):** recebimento com
  a trilha `FINALIZAR_CONFERENCIA` e a coluna NULL → a coluna com o `MIN(created_at)` da trilha; sem trilha → NULL.

**D (121) — o excedente da conferência (B791).** Testes: `server/tests/api/excedenteDaConferenciaDepoisDoAto.api.test.js` e o
`[RN-14]` de `auditoriaDoAtoRecebimento.api.test.js` reescrito.

- **RN-13 — `/conferir`, dois itens acima do esperado, autorizado, a trilha do 2º falhando** → **200**, os dois itens gravados (5
  e 6), a trilha do 1º gravada, a do 2º não, o log do helper (*"[almoxarifado] auditoria do ato falhou (recebimento_item ⟨id⟩,
  EXCEDENTE_AUTORIZADO)"*). (Hoje: 500, nada gravado, a trilha do 1º gravada.)
- **RN-13b — o `UPDATE` do 2º item lança** → 500, o 1º gravado **com** a trilha, o 2º **sem** item nem trilha (a trilha nunca sem o
  ato). A trilha só com `changes === 1`, casada pela posição do item no payload (Fase 2, M5).
- **RN-13c — `/fiscal`** (`PUT /recebimentos/:id/fiscal`), um item acima, autorizado, a trilha falhando → 200, item gravado.
- **RN-13d — guarda: as recusas continuam antes de qualquer escrita** — sem a caixa → 400 (a literal de sempre), nada gravado,
  nenhuma trilha; ALMOXARIFE sem `autorizar_excedente` → 403 (a literal de sempre), nada gravado.
- **RN-14 (121) reescrita:** *"a Auditoria do excedente na CONFERÊNCIA falhando → 200 e o item gravado"* (era 500 e nada
  gravado — **estava certa para o código da 121 e deixa de valer aqui**, com o motivo no teste).

## Contrato congelado

- `/aprovar`: nenhum corpo novo (500 de sempre). `/aprovar-valor`: qualquer falha **depois** de `aprovarValor` gravar o APROVADO
  (pós-aprovação, trava, `UPDATE`, releitura) → **200** com o corpo de sempre (`status` relido, ou `APROVADO`; `reservas` que
  ficaram ATIVA) em vez de 500. Log novo: *"[almoxarifado-aprovar-valor] A requisição ⟨id⟩ foi liberada por valor e fica APROVADO;
  o status pós-aprovação não foi gravado: ⟨msg⟩"*. As recusas do próprio `aprovarValor` (403/400/404) não mudam.
- `/conferir` e `/fiscal`: com a trilha do excedente falhando, 200 (antes 500). Recusas iguais.
- Nenhuma literal de tela nova. **Schema:** `pedidos_compra.fechado_automaticamente_de TEXT` (core, por `ALTERS_PEDIDOS_COMPRA` +
  `safeAlter`), `recebimentos_material_almoxarifado.conferencia_finalizada_em DATETIME` (`safeAlter`); ledgers
  `backfill_pedido_fechado_automaticamente` e `backfill_conferencia_finalizada_em`. Ambas as colunas exportadas nos serviços só
  internamente; o `GET /api/compras/pedidos/:id` e o `GET` do recebimento fazem `SELECT *` e passam a trazê-las — aditivo
  (Fase 2, M6).

## Tasks (sort topológico)

- [ ] **T1 — galho (C254)** — `routes/almoxarifado.js` (`/aprovar`, `/aprovar-valor`). RN-01..RN-03 (com RN-02b, RN-02c). Worktree própria
  (`CRM-wt-e122-g1`), cherry-pick. Não depende de nada desta etapa.
- [ ] **T2 — tronco (C255a, schema + pedido)** — `index.js` (`ALTERS_PEDIDOS_COMPRA`), `tests/helpers/testApp.js` (stub),
  `tests/almoxarifado.test.js` (o DDL próprio de `pedidos_compra` — Fase 2, I1),
  `services/almoxarifado/schema.js` (`safeAlter` + `migrateBackfillPedidoFechadoAutomaticamente`, exportada),
  `receiptService` (`fecharPedidosCompletos`, `destinoDaReabertura`, `estornarEntradaNoPedido`), `services/compras/pedidoCompraService.js`
  (`alterarStatusPedido`). RN-05..RN-09.
- [ ] **T3 — tronco (C255b)** — `schema.js` (`safeAlter` + `migrateBackfillConferenciaFinalizadaEm`), `receiptService.avancarWorkflow`,
  `reportService`. RN-10..RN-12. Depois da T2 (mesmo `schema.js`).
- [ ] **T4 — tronco (excedente)** — `receiptService` (`assertExcedentePermitido`, `conferirRecebimento`, `salvarDadosFiscal`), o
  `[RN-14]` da 121. RN-13..RN-13d. Depois da T3 (mesmo arquivo).
- [ ] **T5 — integração** — `server/tests/api/estadoForaDaAuditoriaIntegracao.api.test.js`, cruza Compras, Recebimento,
  Movimentações, Relatórios e Requisições: (i) **pela rota**: pedido `enviado` de 2 → recebimento contra o pedido → iniciar
  conferência → `/conferir` 3 com autorização e a trilha do excedente falhando (200) → finalizar com a trilha falhando (200) →
  fiscal → processar com a trilha do fechamento falhando (pedido `recebido`) → o relatório conta o item conferido → estorno da
  entrada → pedido `enviado`; e uma requisição de 3 do mesmo material criada depois da nota, `/aprovar` com o `UPDATE` falhando →
  500, 0 reservas, reaprovar 200; (ii) **pelo serviço**: `stockService.cancelarMovimentacao` reabre e
  `reportService.relatorioQualidadeFornecedores` conta, sem a trilha.
- [ ] **T6 — fechamento** (skill `fechar-etapa`), com a **A70** (RN-15) medida no banco de uma sonda.

Galho: só a T1 (arquivo e regra disjuntos — a aprovação de requisição não toca pedido, recebimento nem relatório). T2..T4 mexem
no mesmo `receiptService`/`schema.js` e são feitas em sequência, na branch. A suíte inteira roda **uma por vez** (lição da 121): o
galho roda só os próprios arquivos.

## Execução — o que aconteceu

*(preencher)*

## Retro (4 números)

*(preencher)*

## Próxima tarefa detalhada — Etapa 123

*(preencher)*
