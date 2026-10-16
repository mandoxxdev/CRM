# Almoxarifado — Etapa 119: o que já valeu não se perde nem responde erro (design)

> Origem: "Próxima tarefa detalhada — Etapa 119" do plano da 118 (**C249**, **C248**, e a **C242** se couber).
> Worktree `CRM-wt-e119`, branch `etapa-e119` (a partir da main `2490c67a`).

## Fase 0 — medido (sondas `server/tests/sonda/e119fase0.js`, `e119fase0b.js`, não versionadas)

- **C249 (3/3 do que o plano da 118 dizia):** lote L1 em A (3) e B (3), Saída de 5 pela rota v2 com o 2º
  `UPDATE estoque_saldo_almoxarifado … RETURNING id` falhando → **500**, físico **6**, linhas A **0** e B **3** (soma 3). Causa,
  lida: `claimSaldoDoLote` acumula num array local e o perde quando a exceção sai do laço (a forma da C245/I-3). É o **único**
  chamador: `registrarMovimentacaoSemTrava` (`grep -n "claimSaldoDoLote(" server/services` → 1). A entrega de requisição com
  lote passa pelo mesmo motor (`requisitionService` chama `registrarMovimentacao` com `lote_id` da origem ou das séries) —
  corrigir a função corrige as duas portas.
- **C248:** estorno de uma Entrada com a auditoria `CANCELAMENTO` falhando → **500**, `cancelado = 1`, `movimento_estorno_id`
  gravado, físico 0; de novo → **400** *"Movimentação já cancelada"*. O que vem depois da auditoria (pedido de compra,
  recálculo das requisições, alerta, supressão do aviso) não roda.
- **C242:** Entrada 2 (V1, V2) → Saída 2 → Devolução citando a saída com V1, V2 → estorno da `ENTRADA_DEVOLUCAO` (200; séries
  *Entregue*, saída de volta, **entrada = a da devolução**) → estorno da Saída (200; *Em estoque*, entrada ainda a da devolução)
  → estorno da Entrada original **400** *"estorno de entrada recusado: ha series desta entrada ja movimentadas — estorne as
  saidas primeiro"*. Causa: a reativação da série na devolução troca `movimentacao_entrada_id` e ninguém guarda o anterior.
- **Gêmeo da C248, novo (C250):** Entrada pela rota v2 com a auditoria `ENTRADA` falhando → **500**, a linha **no livro** e o
  físico **5**. Quem tenta de novo lança outra Entrada. É a "semântica congelada" que o comentário do motor declara
  ("auditoria que falha derruba a resposta com 500 — e esta etapa nao decidiu isso"): mexer nela é decisão da etapa que a
  pegar — **declarado** aqui, candidata da 120.

## Desenho

1. **C249** — `claimSaldoDoLote(db, …, { aplicados = [] } = {})`: cada linha entra no rastreador do chamador logo depois do
   seu débito. No `ok: false` a função desfaz **consumindo** o rastreador (cada linha sai dele logo depois do seu crédito de
   volta) — se o desfazer falhar no meio, o `catch` amplo do motor credita só o que falta; se não falhar, o rastreador volta
   vazio e o `catch` amplo não credita em dobro. O motor passa `saldoLinhasSaidaParaReverter` (já `[]`) como acumulador.
2. **C248** — a auditoria `CANCELAMENTO` vira não-fatal (`try` + `console.warn`), como `auditarEstornoDeAjuste` logo abaixo.
   O estorno concluído responde 200 e o resto (pedido, recálculo, alerta, aviso) roda.
3. **C242** — coluna nova `series_almoxarifado.movimentacao_entrada_anterior_id` (`safeAlter`). `entradaSeries` grava nela o
   `movimentacao_entrada_id` que a série tinha ao ser **reativada** (`NULL` na criação); o estorno da entrada de uma devolução
   que citou a saída (`reverterEntrada` com `saidaId`) devolve a série à entrada anterior
   (`COALESCE(movimentacao_entrada_anterior_id, movimentacao_entrada_id)`); os dois desfazeres (`desfazerEntrada`,
   `desfazerReverterEntrada`) restauram as duas colunas. Série reativada antes da etapa (coluna `NULL`) fica como hoje — a
   consulta **A67** as acha.

Descartados (B775, B776): ver o plano.
