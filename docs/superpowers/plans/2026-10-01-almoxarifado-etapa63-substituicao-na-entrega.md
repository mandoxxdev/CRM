# Etapa 63 — a substituição da origem separada fica registrada na entrega

> Status: **FECHADA** (2026-10-01) — T1 `3e022eb`, T2 `e7f3afa`, fix-round da Fase 5 `4f008f2`. Feature 05, item "substituição de lote com registro" (PARCIAL — ver a spec 05).

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
- [x] **T1 (tronco)** — serviço + detalhe — `3e022eb` (fix-round `4f008f2`). Testes `server/tests/api/substituicaoOrigem.api.test.js` 7/7.
- [x] **T2 (galho, tela)** — RN-03 — `e7f3afa` (fix-round `4f008f2`). `client/.../RequisicoesSubstituicaoOrigem.test.js` 16/16.
- [x] **T3** — verificação, Fase 5, fechamento — `4f008f2` e o commit de documentação.

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

## Divergências do plano na execução

- **A RN-02 dizia "o registro é aditivo: nunca recusa o que hoje passa" — estava errado.** A divisão da baixa (Fase 2,
  crítico 1) torna a parte separada **estrita** acima do pendente: se a origem separada já não tem o separado, a entrega
  que antes saía toda automática agora é recusada. O commit `3e022eb` repetiu a frase; corrigido à vista na **B251** e no
  **C84**, e a dica da tela avisa.
- **A RN-02 dizia "gravado na auditoria (`acao: 'SUBSTITUICAO_ORIGEM'`) — sem tabela nova"** — superada na Fase 2 (crítico
  2): tabela própria `substituicoes_origem_requisicao` (**B249**).
- **T2:** o comentário da tela que descrevia a planejada acima do pendente ("aplica até o pendente e completa automático
  acima") estava errado até esta etapa — corrigido à vista no código. A dica do pendente ganhou o lote e, na Fase 5, o
  aviso de recusa.

## Fase 5 — revisão adversarial do código (um revisor, só leitura)

| Achado | Classe | Como ficou |
|---|---|---|
| Na baixa dividida, o pedaço AUTOMÁTICO de item com série saía sem o lote das séries (saldo por lote x lote das séries se separavam — o defeito que a Fase 2 da Etapa 61 fechou) | **Crítico** (regressão desta etapa) | Corrigido: o pedaço sem origem leva o lote das séries; teste série+lote acima do pendente (sabotagem vermelha) — `4f008f2` |
| "Nada que hoje passa é recusado" (commit T1) é falso: acima do pendente a parte separada é estrita | Importante | Letra B (**B251**) + **C84** + dica na tela — `4f008f2` |
| Falha no meio das baixas de um item deixava a troca sem registro | Importante | Registro num `finally` — `4f008f2` |
| Faltava teste da divisão cruzando a reserva e com série | Importante | Dois cenários novos — `4f008f2` |
| Tela compara o lote da opção, servidor o lote derivado das séries | Menor | Declarado (**D (63)**) |
| Lote de saída nulo quando o automático sai de vários lotes; registro não acompanha estorno/exclusão; automático explícito sempre é troca | Menor | Declarados (**D (63)**, **B250**) |
| Guarda `!planejada` na detecção redundante (sabotagem verde) | Menor | Segunda barreira, declarada (**D (63)**) |

Sabotagens: servidor 7 (6 vermelhas, 1 verde pela guarda redundante); tela 9 vermelhas.

## Retro (4 números)

1. **Rodadas de correção até verde:** 1 fix-round.
2. **Achados:** Fase 2 — 9 (2 críticos), todos reais, mudaram o desenho (divisão da baixa; tabela própria). Fase 5 —
   1 crítico (regressão da própria etapa) + 3 importantes corrigidos, 5 declarados, 0 ruído.
3. **Paralelismo:** a tela (galho) depois do tronco commitado; sem retrabalho.
4. **Defeito que escapou da Etapa 62:** nenhum conhecido.

**Lição:** dividir a baixa (mudança no laço de baixas da entrega) reabriu a regra do lote das séries da Etapa 61 —
**toda mudança no laço de baixas exige rerodar os cenários de série+lote**, não só os da feature nova.

## Próxima tarefa detalhada — Etapa 64: a fila de separação do almoxarife (feature 05)

**Por que esta.** No "falta para 🟢" da 05 sobram: lista de separação como entidade, rota de picking, a troca registrada
na separação, localização de kit, kits e a **tela de fila**. A fila é a de maior valor por esforço: hoje o almoxarife
trabalha na lista geral de requisições (`RequisicoesList.js` em `warehouseMode`), sem uma visão "o que eu preciso
separar agora, em que ordem". As Etapas 58–63 deixaram por item a origem, o separado pendente, a divergência e a troca —
é o que a fila precisa mostrar.

**Fase 0 da 64 — medir antes de prometer:**
1. O que a lista em `warehouseMode` já filtra e ordena (status `PODE_SEPARAR` em `requisitionStateMachine.js:71`,
   urgência NORMAL/URGENTE/CRITICO da Etapa 48, `data_necessidade`) — não refazer o que existe; medir pelo nome do
   contrato (`GET /almoxarifado/requisicoes` e seus filtros), não pelo nome imaginado.
2. Qual é a ordem de trabalho certa: urgência, depois data de necessidade, depois aprovação? Existe regra na spec 04/05?
   Decidir (letra B, reversível).
3. O que cada linha precisa: itens a separar (pendente de separação), disponível, origem planejada/sugerida (a
   sugestão de endereço da Etapa 53 serve para saída?), conferência obrigatória (material crítico, Etapa 28).
4. Quem vê: perfil `separar_emitir`; a fila "minha" (`?minha=1` já existe — medir o que faz).
5. **Contratos que não se reabrem:** a separação (tudo-ou-nada, rodada, origem por item, divergência), a entrega
   (origem estrita, séries, divisão da baixa, registro de troca).

**Pontos de atenção.** Fila é leitura: não pode mudar regra de separação/entrega. Requisição em `AGUARDANDO_ESTOQUE` com
saldo que chegou deve subir? (medir `reservarItensAprovacao`/reposição). Teste com a metade positiva: requisição fora de
`PODE_SEPARAR` não aparece.
