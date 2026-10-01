# Etapa 63 — a substituição da origem separada fica registrada na entrega

> Status: **Fase 0-1** (design + plano). Feature 05, item "substituição de lote com registro".

## Fase 0 — medido (2026-10-01)

- A separação grava a **origem planejada** do item (`origem_separacao_id`, `lote_separacao_id`, Etapa 59). A entrega
  usa a planejada quando o payload não traz origem; **origem no payload vence** (B235), e `origem_automatica: true`
  ignora a planejada. Em nenhum dos dois casos fica registro de que **o que saiu não foi o que foi separado**.
- Depois da entrega total, a planejada é **limpa** (RN-04 da 59) — o rastro de "o separado era o lote L1" some.
- O livro (`movimentacoes_almoxarifado`) guarda o lote e o endereço **de onde saiu**; nada guarda o par separado.
- A auditoria `SEPARACAO` guarda a rodada (com origem/lote por entrada, Etapa 59), mas não é cruzada com a entrega.

## Regras de negócio

- **RN-01** — na entrega, um item com origem planejada que sai de **outro par** (endereço ou lote diferente — por
  origem no payload, ou por `origem_automatica`) gera **registro de substituição**: requisição, item, material,
  quantidade, par planejado, par que saiu (o do payload; `null` = automático), quem, quando e o **motivo**
  (`motivo_substituicao`, opcional, trim, até 500 — B238). Sair do próprio par planejado **não** gera registro.
- **RN-02** — o registro é **aditivo**: nunca recusa o que hoje passa (trocar de lote é legítimo: o planejado pode ter
  vencido, bloqueado, acabado). Gravado na auditoria da requisição (`acao: 'SUBSTITUICAO_ORIGEM'`, entidade
  `requisicao`) — sem tabela nova.
- **RN-03** — o detalhe da requisição traz `substituicoes: [{ item_id, material_codigo, quantidade, planejada:
  { codigo, lote }, saiu: { codigo, lote } | null, motivo, usuario_nome, em }]`; a tela mostra no detalhe e, no modal
  de entrega, quando o "Sai de" escolhido difere da planejada, o campo "Motivo da troca (opcional)".
- Fora: substituição **na separação** (uma rodada com outra origem já vira "mista" — Etapa 59); troca de **série**.

## Tasks
- **T1 (tronco)** — serviço + detalhe. Testes `server/tests/api/substituicaoOrigem.api.test.js`.
- **T2 (galho, tela)** — RN-03.
- **T3** — verificação, Fase 5, fechamento.

## Fase 2 — revisão do plano: 2 críticos, 4 importantes, 3 menores → o que mudou

- **CRÍTICO 1** — uma substituição real escapava: a planejada só valia se a entrega coubesse no separado pendente;
  acima disso TUDO saía automático, inclusive o que estava na caixa tirado de A (5 separados de A, 2 entregues,
  entrega de 8: os 3 de A podiam sair de B, e o livro dizia B — a "mentira" que a B236 recusa). → **a baixa se
  divide**: o pendente sai da planejada (estrita), o excedente automático. Nenhum registro de substituição nesse caso.
- **CRÍTICO 2** — a auditoria não serve de armazenamento: é best-effort (Etapa 19), ler é restrito a `configurar`
  (Etapa 18), e a rastreabilidade do lote vai consultar por lote. → **tabela append-only**
  `substituicoes_origem_requisicao` (planejada e saída com endereço e lote, ids das movimentações, motivo, autor),
  lida pelo detalhe (`listarSubstituicoes`, molde de `listarSeparacoes`).
- **IMPORTANTE** — planejada sem lote vale "qualquer lote" (só o endereço conta), comparada depois do lote vindo das
  séries; o lote que saiu no automático vem do livro; um registro por item por entrega, quantidade
  `min(entrega, pendente)`; gravado depois das baixas do item (sem transação: se um item seguinte falhar, este fica
  baixado E registrado — declarado).
- Menores: o item da spec 05 é da "separação" e esta etapa o paga na entrega (letra B, citando a B237 — a rodada
  "mista" apaga a planejada sem registro); quando a tela marca o automático sozinha, o motivo também aparece.
