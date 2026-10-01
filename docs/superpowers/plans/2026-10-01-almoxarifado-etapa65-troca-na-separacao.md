# Etapa 65 — a troca de origem NA SEPARAÇÃO fica registrada

> Status: **Fase 0-1** (design + plano). Feature 05, item "troca registrada também na separação" (falta para 🟢).

## Fase 0 — medido (2026-10-01)

1. **Onde a rodada apaga a planejada** — `separarRequisicao` (`requisitionService.js` ~650): `planejada =
   pendenteAntes > 0 && !mesmoPar ? {null, null} : {origemId, origemId ? loteId : null}`. `pendenteAntes` e `mesmoPar`
   são calculados sobre o item **em memória** — já mutado pela entrada anterior do mesmo item no payload. Logo:
   - rodada 1 de A (planejada A), rodada 2 de B → planejada some, calada (B237);
   - rodada 2 em **automático** (sem "Sai de") sobre planejada A → `mesmoPar` falso → some, calada (D (59));
   - a mesma origem → mantém; sem planejada antes → a rodada vira a planejada (não é troca).
   - Dentro de uma rodada, o mesmo item duas vezes (A e depois B) também zera — mas ali **não havia** planejada gravada.
   Nenhum par novo substitui a planejada: o resultado com troca é **sempre nulo**.
2. **`substituicoes_origem_requisicao`** (schema.js ~2299): `movimentacao_ids TEXT` e `localizacao_saida_id` anuláveis;
   não há coluna que diga separação × entrega. → `safeAlter` `momento TEXT` (NULL = legado = entrega) e
   `separacao_id INTEGER` (a rodada).
3. **Detalhe** — `listarSubstituicoes` (~431) alimenta o bloco "Substituições" (`RequisicoesList.js` ~1449), texto
   "`COD: Q — separado de A · saiu de B|automático · motivo`".
4. **Janela de separação** — o item já traz `origem_separacao_codigo`/`lote_separacao_codigo` e `quantidade_separada`/
   `quantidade_entregue`; o "Sai de" por item é `origensSeparacao[i.id]` (vazio = automático). Dá para avisar antes.

## Regras de negócio

- **RN-01 (registro)** — numa rodada de separação, para cada item que **antes da rodada** (estado gravado) tinha origem
  planejada com separado pendente (separado − entregue > 0) e que **termina a rodada sem ela** (planejada nula), grava-se
  UMA linha em `substituicoes_origem_requisicao` com `momento = 'SEPARACAO'`, `separacao_id` = a rodada,
  `quantidade` = o pendente planejado antes da rodada, planejada = o par antigo, saída = o par da rodada (se o item usou
  um par só na rodada; vários pares → saída nula, `automatica = 0`), `automatica = 1` se nenhuma entrada do item na rodada
  trouxe origem/lote, `movimentacao_ids` NULL (separação não move estoque), motivo opcional (`motivo_substituicao` na
  entrada, ≤ 500, trim; vazio = NULL).
  Metade positiva / negativa: mesma origem → nada; sem planejada antes → nada; planejada sem pendente → nada.
- **RN-02 (não muda a regra)** — a planejada continua sendo **apagada** (B237 inalterada): a entrega de um clique do que
  sobrou sai automática, como hoje. Só registro, aditivo; a rodada não recusa nada novo. Decisão reversível (letra B):
  descartado "substituir pela nova" (a caixa é mista; dizer "veio tudo de B" seria falso) e "planejada por parcela"
  (entidade nova — escopo da lista como entidade).
- **RN-03 (detalhe)** — `listarSubstituicoes` devolve `momento`; o bloco "Substituições" diz, para `SEPARACAO`:
  "`COD: Q — separado de A[ — lote L] · nova separação de B|sem origem (na separação) — a origem anterior deixou de
  valer[ · motivo]`"; para entrega, o texto de hoje.
- **RN-04 (janela de separação)** — item com planejada e separado pendente cuja quantidade a separar > 0 e cujo "Sai de"
  difere da planejada (inclusive vazio/automático): aviso no item "`A origem da separação anterior (A[ — lote L]) deixa
  de valer: o que já está separado passa a sair automático na entrega.`" e um campo opcional "Motivo da troca" que vai
  como `motivo_substituicao`. Sem planejada, ou mesmo par: nada.

## Contrato

`PUT /api/almoxarifado/requisicoes/:id/separacao` — entrada ganha `motivo_substituicao?: string` (opcional; ignorado
quando não há troca). Resposta inalterada. `GET /api/almoxarifado/requisicoes/:id` — `substituicoes[]` ganha
`momento: 'SEPARACAO' | 'ENTREGA'` (legado NULL → `'ENTREGA'`). Nenhuma recusa nova.

## Tasks
- **T1 (tronco)** — schema (`safeAlter` momento/separacao_id), registro na rodada, `listarSubstituicoes` com momento.
  Testes `server/tests/api/trocaSeparacao.api.test.js`: troca A→B, A→automático, mesma origem (nada), sem planejada
  (nada), mistura dentro da mesma rodada sem planejada (nada), motivo, quantidade = pendente antes (com entrega parcial
  no meio), pela rota (PUT) e pelo detalhe (GET mostra momento), a entrega de depois não registra outra troca.
- **T2 (galho, tela)** — RN-03 e RN-04 em `RequisicoesList.js` + testes.
- **T3** — verificação, Fase 5, fechamento.

## Fase 2 — revisão do plano: 2 críticos, 6 importantes, 5 menores → plano revisto

- **CRÍTICO 1** — "estado gravado" sem dizer onde: o `item` é mutado no laço; usar o `pendenteAntes` em memória grava
  troca falsa no "A e depois B sem planejada". → **retrato antes da passada 1** (no laço que semeia `pedidoSeparacao`).
- **CRÍTICO 2** — a janela de separação abre com "Sai de" automático e a quantidade sugerida: a rodada 2 de um clique
  apaga a planejada e grava troca automática em **todo** item. → T2 **pré-seleciona a planejada** no "Sai de" da
  rodada quando o item tem planejada com separado pendente (fecha também a D (59)).
- **IMPORTANTE** — detectar na passada 1, **gravar depois** do INSERT da rodada (`separacao_id`); rodada recusada na
  passada 1 não registra nada (teste). INSERT da troca falha → best-effort com `console.warn` (como a auditoria da
  rodada; a rodada já está gravada) — letra B.
- **IMPORTANTE** — planejada **sem lote** (A, —) e rodada (A, L1): a entrega (Etapa 63) diz "sem lote vale qualquer
  lote"; a separação apagava. → alinhar: mesmo endereço com planejada sem lote **é o mesmo par** — a planejada fica
  (A, —), não estreita para L1, e não há troca. Lote planejado diferente → troca registrada (como hoje apaga).
- **IMPORTANTE** — vários pares na rodada: texto próprio "de mais de uma origem"; só entradas com quantidade > 0 contam
  (a regua da divergência já faz isso — `origens`). Motivo: o primeiro não vazio; não-texto ignorado; > 500 cortado.
- **IMPORTANTE** — o texto da linha não pode dizer "saiu de" (nada saiu do estoque na separação): T1 e T2 sobem juntas.
  `trocaDaPlanejada` da tela usa a régua da entrega; o aviso da RN-04 segue a régua da separação acima.
- Menores: `momento TEXT NOT NULL DEFAULT 'ENTREGA'` (o legado vira ENTREGA, sem NULL eterno); entrada só de lote
  (sem endereço) → "do lote L"; a quantidade do texto é o **já separado** de A ("5 já separados de A"), não "5 trocados";
  rastreabilidade por lote futura filtra `momento` (lote_saida_id numa linha SEPARACAO é o lote separado); o item
  "Substituição de lote com registro" da spec 05 **continua [ ]** (a troca de série segue fora — D (63)).
