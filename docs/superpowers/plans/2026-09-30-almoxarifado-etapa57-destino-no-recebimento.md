# Etapa 57 — o destino (endereço) escolhido ao processar o recebimento

> Status: **FECHADA (2026-09-30)** — `aaf09cb` (T1), `86ee1c1` (T2), fix-round `18c67a8`. Feature 08 (Recebimento); fecha o D (53) "a tela de
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

- [x] **T1 (tronco)** — `aaf09cb` — serviço e rotas (RN-01..04). Testes
  `server/tests/api/recebimentoDestinoPorItem.api.test.js`: dois itens em dois destinos; item sem
  destino cai na padrão; destino da nota como default; um item com destino inativo recusa a nota
  inteira (nada entra) com a lista; validações da RN-03; workflow repassa; reprocessamento depois de
  falha não duplica.
- [x] **T2 (galho, tela)** — `86ee1c1` — modal de processamento (RN-05) com testes.
- [x] **T3** — verificação, Fase 5 (fix-round `18c67a8`), fechamento.

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

## Execução — divergências do plano

- **T1 (Fase 3, controle positivo):** 1 das 11 sabotagens ficou **verde** de início — tirar a checagem "não é lista"
  não derrubava nada, porque o cenário usava a string `'x'`, que é iterada caractere a caractere e cai na checagem
  seguinte **com a mesma literal**. O cenário ganhou `destinos: {}` (não iterável: sem a checagem vira `TypeError`,
  500) e a sabotagem ficou vermelha.
- **T2 (executor da tela):** além do contrato, a lista de destinos também exclui **inativas** (o servidor recusaria a
  nota inteira); quando o `GET /localizacoes` falha, a janela avisa *"Não foi possível carregar as localizações — os
  itens entram na padrão do material."* e processa; o erro do servidor saiu do toast e ficou na janela (**B228**). Os
  testes da tela foram para arquivo próprio (`RecebimentosProcessarDestino.test.js`) para não mexer nas contagens da
  suíte antiga.

## Fase 5 — revisão adversarial do código (1 revisor, 0 CRITICAL)

| # | Achado | Tipo | Destino |
|---|---|---|---|
| I-1 | Mesmo material **duas vezes** na nota (X e Y): a devolução ao fornecedor achava o endereço pelo livro, que não guarda o item, e escolhia o do outro item | Importante | **Corrigido**: coluna `recebimentos_material_itens_almoxarifado.localizacao_entrada_id` gravada na entrada (rastro: falha ao gravar só avisa no log); a devolução usa a do item da inspeção; gravada mas inativa/bloqueada = sem origem; legado sem gravação = busca pelo livro |
| I-2 | Fallback (endereço de entrada bloqueado depois) sem teste — tirar o filtro passava verde | Importante (teste) | **Corrigido**: cenário novo, a devolução continua passando e drena o padrão |
| M-1 | `normalizarDestinos` frouxo: `parseInt` aceitava `"12abc"`; `Number(true)` virava a localização 1 | Menor | **Corrigido** (e item REAL de outra nota testado — o 999999 não provava a regra) |
| M-2 | Tela: sem cenário de corrida (fechar/reabrir com resposta atrasada); fixture de recusa com texto inventado | Menor (teste) | **Corrigido** (literal real do servidor) |
| M-3 | Padrão **bloqueado**: a devolução, antes recusada, pode passar e o claim sem lote pode drenar a linha dele | Menor | **Declarado — C78** |
| M-4 | O livro grava `localizacao_origem_id = X` mesmo quando parte saiu de outro; a falta em material com negativo vai para X | Menor | **Declarado — C79** |
| M-5 | A tela oferece endereço de almoxarifado inativo | Menor | **Declarado — D (57)** |
| M-6 | Quarentena não tem endereço | Menor | **Declarado — D (57)** (guia) |

Sabotagens do fix-round: 5 no servidor (só-livro, sem filtro no item, não gravar, `parseInt`, booleano) e 1 na tela
(tirar a checagem de sequência) — **todas vermelhas no cenário certo**. Totais: servidor 11/11 com 16 sabotagens;
tela 9/9 com 12.

**Lição de processo (registrar):** o `perl` do **conserto** inseriu a coluna nova na lista da tabela **errada** — a
âncora `'quantidade_em_inspecao REAL DEFAULT 0'` aparece **duas** vezes em `schema.js` (materiais e itens do
recebimento) e a substituição pegou a primeira. O teste pegou (`no such column: ri.localizacao_entrada_id`), e a
correção usou âncora contada. **A regra "conte a âncora antes" vale para o perl de CONSERTO, não só para a sabotagem.**

## Retro — 4 números

1. **Rodadas de correção até verde:** 1 (o fix-round da Fase 5).
2. **Achados:** Fase 2 — 10 (3 CRITICAL) + 1 regressão que a própria etapa criaria na devolução ao fornecedor,
   evitada antes do código; Fase 5 — 2 IMPORTANT + 3 MINOR corrigidos, 4 declarados, **0 ruído**.
3. **Paralelismo:** 1 galho (tela) em paralelo com o tronco (backend) contra o contrato congelado — sem retrabalho.
   Um segundo agente de tela no fix-round (corrida + literal), também sem conflito.
4. **Defeito que escapou da Etapa 56:** nenhum conhecido.

## Próxima tarefa detalhada — Etapa 58: a separação registra de onde cada item sai (endereço e lote) — feature 05

**Por que esta.** No mapa, a 05 (Separação e picking) é 🟡 e o "falta para 🟢" dela começa por **registro por item
(localização/lote)**. As Etapas 51–57 deixaram o saldo **por endereço** confiável (saída que drena endereços, recusa de
endereço inválido, confirmação por leitura, destino no recebimento) — mas a **entrega de requisição**, que é a saída
mais frequente do galpão, **não diz de onde sai**. Medido no fechamento da 57:
- `entregarRequisicao` (`requisitionService.js:520`) chama o motor com `tipo: 'SAIDA'` **sem**
  `localizacao_origem_id` e **sem** `lote_id` (`:633`) — o motor drena os endereços pelo `claimSaldoSemLote` (padrão
  primeiro) e o material **com lote** não baixa de lote nenhum (**B204**, **C72**).
- A rodada de separação (`separacoes_requisicao_almoxarifado`, Etapa 28) guarda `itens_json` e autor, **sem** endereço
  e **sem** lote por item.

**Fase 0 da 58 — medir antes de prometer:**
1. O fluxo inteiro **separar → conferir (2ª conferência, Etapa 28) → entregar** e qual gesto é o certo para dizer
   "tirei de A": a **separação** (quem pega na prateleira) ou a **entrega**. O que `separarRequisicao` (`:366`) e
   `conferirSeparacao` (`:256`) gravam hoje, e o que a tela de separação mostra.
2. **Material com lote**: a entrega sem lote é hoje permitida para material com `controle_lote`? (`exigeLote` não é
   declarado na entrega — ver a docstring de `exigeLote` no motor.) Registrar o lote por item muda isso — decisão B.
3. Reserva: a entrega baixa reserva (`reserva_id`); endereço/lote por item tem de compor com a baixa de reserva
   (`baixas` com e sem `reserva_id`, `:103-118`).
4. Confirmação por leitura (Etapa 56): a origem por item pode aceitar `codigo_lido_origem` — e aí vale a regra da
   **B224** (origem informada + saldo nela) e a checagem pós-claim.
5. Contratos que **não** se reabrem: `claimSaldoSemLote`/`claimSaldoDoLote` (motor), `validarEnderecoExplicito`,
   a confirmação por leitura, a separação com autor da Etapa 28.

**Pontos de atenção.** O material sem lote que sai de um endereço **declarado** pode ainda drenar outros se o
declarado não cobrir (a mesma armadilha da B224) — decidir se a separação por endereço recusa ou completa. E o teste de
integração tem de cruzar **separar → entregar → saldo por endereço**, não só a rota nova.
