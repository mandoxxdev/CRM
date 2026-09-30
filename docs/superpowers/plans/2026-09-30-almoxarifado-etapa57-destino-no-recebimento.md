# Etapa 57 — o destino (endereço) escolhido ao processar o recebimento

> Status: **Fase 0-1** (design + plano). Feature 08 (Recebimento); fecha o D (53) "a tela de
> recebimento não tem campo de endereço".

## Fase 0 — medido (2026-09-30)

- `POST /recebimentos/:id/processar` já aceita `localizacao_id` (um destino para a nota inteira), mas
  a tela manda `{}` (`RecebimentosAlmoxarifado.js:481`, `window.confirm` + POST). Resultado: todo item
  cai na **padrão** do material — ou em "sem localização atribuída" se não houver padrão.
- O caminho `POST /recebimentos/:id/workflow` com `acao: 'processar'` chama `processarNota` **sem
  opções** (`receiptService.js:897`).
- `darEntradaEstoque` pré-valida a nota inteira (nada entra se um item falha), depois reclama item a
  item (`entrada_estoque_em`) e chama o motor com `localizacao_destino_id: localizacao_id` (o da nota).
- Uma nota tem vários materiais, cada um com seu endereço: um destino por nota não serve para a
  nota comum. A sugestão da Etapa 53 (`GET /materiais/:id/sugestao-localizacao`) existe por material.

## Regras de negócio

- **RN-01** — `processarNota(db, user, id, { localizacao_id, destinos })`: `destinos` é uma lista
  `[{ item_id, localizacao_id }]`. Destino **efetivo** de um item = o do item em `destinos` → senão o
  `localizacao_id` da nota → senão a padrão do material (hoje). Sem mudança para quem não manda nada.
- **RN-02** — a pré-checagem (nada entra se um item falha) usa o destino efetivo **de cada item**:
  existência e ativo (`validarEnderecoExplicito`, quando explícito) e a regra do endereço
  (`validarLocalizacaoParaMovimento`); cada recusa entra na lista com o código do material:
  400 `Nao foi possivel dar entrada no estoque: {MAT}: {motivo}; {MAT2}: {motivo}`.
- **RN-03** — `destinos` malformado: não-lista → 400 `Destinos inválidos`; `item_id` que não é desta
  nota → 400 `Item {item_id} não pertence a este recebimento`; `localizacao_id` não inteiro positivo →
  400 `Destino inválido para o item {item_id}`; item repetido → 400 `Item {item_id} repetido nos destinos`.
- **RN-04** — o workflow (`acao: 'processar'`) repassa `localizacao_id` e `destinos` do body.
- **RN-05 (tela)** — "Processar nota" abre um modal com os itens que ainda vão entrar (quantidade > 0
  e sem `entrada_estoque_em`): por item, um seletor de destino com "Padrão do material" como
  primeira opção e as localizações ativas; aviso por item quando a padrão é recusada ou inativa ou
  não existe (lido de `sugestao-localizacao`). Confirmar manda `destinos` só dos itens com destino
  escolhido. Erro do servidor aparece no modal.

## Tasks

- **T1 (tronco)** — serviço e rotas (RN-01..04). Testes
  `server/tests/api/recebimentoDestinoPorItem.api.test.js`: dois itens em dois destinos; item sem
  destino cai na padrão; destino da nota como default; um item com destino inativo recusa a nota
  inteira (nada entra) com a lista; validações da RN-03; workflow repassa; reprocessamento depois de
  falha não duplica.
- **T2 (galho, tela)** — modal de processamento (RN-05) com testes.
- **T3** — verificação, Fase 5, fechamento.

## Fase 2 — revisão do plano: 3 críticos, 4 importantes, 3 menores → contrato congelado

- **CRÍTICO 1** — o destino efetivo é calculado UMA vez por item e usado na pré-checagem, na chamada
  do motor (`localizacao_destino_id`) e, por consequência, nas séries. Teste lê o saldo por endereço e
  `series_almoxarifado.localizacao_id`.
- **CRÍTICO 2** — o destino **da nota** continua checado uma vez, com a mensagem da Etapa 54
  (`Nao foi possivel dar entrada no estoque: <motivo>`, preso por `localizacaoInativaMotor`); a lista
  "`{MAT}: motivo`" vale só para destinos por item.
- **CRÍTICO 3** — `POST /recebimentos/:id/aprovar` também chama `darEntradaEstoque` com o body cru:
  a validação da RN-03 mora em `darEntradaEstoque` (ponto comum).
- **IMPORTANTE** — a tela usa a mesma quantidade do servidor (`quantidade_recebida || quantidade_esperada`);
  destino de item que não vai entrar (quantidade 0 ou `entrada_estoque_em`) é **ignorado, sem validar**
  (o item fica onde entrou); `item_id` em texto é convertido; `destinos: []` = nenhum.
- **IMPORTANTE** — a lista de destinos da tela exclui bloqueadas e "pais" com filho ativo (o motor
  recusa bloqueada; o pai é aceito mas o Mapa esconde). Almoxarifado inativo: fica no D.
- **IMPORTANTE (regressão que esta etapa CRIARIA)** — a devolução ao fornecedor (Etapa 45) não informa
  origem; sem lote, `claimSaldoSemLote` drena a padrão primeiro. Até aqui tudo entrava na padrão, então
  estava certo; com destino por item, a peça reprovada fica no endereço X e sai da padrão. → **RN-06**:
  a execução da devolução usa como origem preferida o `localizacao_destino_id` da `ENTRADA_COMPRA` daquele
  recebimento/material/lote (não estornada), quando ele existe, está ativo e não bloqueado; senão, o de hoje.
- Menores: quarentena não tem endereço (contador do material) — escolher uma área "Quarentena" como
  destino exige transferir à mão depois de liberar (guia); material inativo no modal = sem aviso;
  `avancarWorkflow` ganha o parâmetro de opções.
