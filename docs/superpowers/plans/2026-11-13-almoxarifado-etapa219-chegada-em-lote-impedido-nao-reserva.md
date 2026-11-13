# Etapa 219 — o que chega em lote bloqueado não fica reservado para quem espera (C478)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa218-lote-escolhido-desconta-peca-presa.md` (`:360-383`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-chegada-lote-bloqueado.txt` (**4h**, `d365771e`). Números de linha medidos
> hoje sobre `5b3ae457`.

## Objetivo (em linguagem simples)

Quando a nota dá entrada num lote **bloqueado** (o material não crítico com controle de certificado entra no lote *Bloqueado* até o
certificado ser anexado), o sistema reservava essas peças para a requisição que esperava o material: ela ficava *Totalmente Reservada*
com peça que não pode sair, e o solicitante recebia *"Chegou material da sua requisição"*. O mesmo valia para a liberação da inspeção ou da
não conformidade e para a OS encerrada que solta a compra dela. Depois desta etapa as três portas reservam só o que **pode sair** — a mesma
conta da aprovação desde a Etapa 205: a requisição continua *Aguard. Estoque*, ninguém é avisado de que chegou o que não pode sair, e o
aviso da entrada da nota diz que aquele item entrou em lote bloqueado.

## Fase 0 — medido em 2026-11-13 (sobre `5b3ae457`)

1. **Um miolo só.** As três portas passam por `reservaChegadaService.distribuirSemLock` (`:363-457`): a nota
   (`reservarChegadaParaQuemEspera` `:205`, teto = o que entrou livre da nota), a inspeção e a NC (`reservarLiberacaoParaQuemEspera` `:544`,
   teto = `min(quantidade, disponivel)` `:551-556`), a OS encerrada (`osEncerradaService.js:89-97` chama a mesma
   `reservarLiberacaoParaQuemEspera` com `origem: 'OS_ENCERRADA'`; a OS já fechou, então `osAbertaDoRecebimento` devolve `null` e cai na fila
   geral). O miolo limita por `disponivelSql()` do material (`:365-367`) — **sem** `loteImpedidoSql`.
2. **A régua pronta.** `loteImpedido.loteImpedidoSql('ma')` (205 + 217): lote BLOQUEADO/REPROVADO/vencido, com o retido no lote; o molde é
   `requisitionStateMachine.calcularStatusPosAprovacao` (`:279`), `Q.qtdSql(disponivel − impedido)`. A aprovação (`reservarItensAprovacao`,
   `requisitionService.js:705`) lê `disponivel_liberado` (a mesma conta, por item).
3. **O recálculo do status já herda.** `recalcularStatusDeReserva` (`:131`) — item sem hold → `calcularStatusPosAprovacao`, que já desconta
   (B1377). Uma requisição que não ganha reserva não é tocada (`acc.tocadas`), e continua no status de antes.
4. **A OS aberta tem regra própria.** Nota/liberação de pedido com OS ABERTA → `distribuirParaOs` (`:463`): primeiro a fila da OS pelo miolo
   (com `filtro`), o resto vira a **reserva da OS** (`reservaDaOs.reservarParaOsSobTrava`, teto pelo livre de caixa `:188-190`). A aprovação
   da requisição da OS converte a reserva da OS **sobre o lote impedido** de propósito (B1381, `osNoImpedido`, `requisitionService.js:708-763`).
5. **Os avisos.** `receiptNotificationService.avisarEntradaConfirmada` (`:248`): a linha do item da nota diz *"— disponível"* ou *"— retido para
   inspeção"* (`montarAvisoNota` `:135-137`); o solicitante recebe a linha do material se ganhou reserva **ou** se o disponível do material é
   > 0 (`:363-385`, `disponivelSql`). `avisarLiberacao` (`:438`) avisa se ganhou reserva ou `haLivre` (`disponivelSql`, `:444`, `:485`).
6. **A trava.** As três portas já distribuem sob a trava do material (Etapa 91: `comLockDosMateriais` na nota, `comLockDoMaterial` na
   liberação, `sobTrava` nas chamadas de dentro). A conta nova é leitura dentro da seção que já existe.
7. **Como um lote nasce bloqueado na nota:** `receiptService.js:1754-1774` — material com `controle_certificado = 1` e item com `lote` →
   `status: 'BLOQUEADO'`, motivo *"Certificado do fornecedor nao anexado"*; não crítico → sem inspeção, o saldo entra livre no disponível.

## Caminhos

- **(escolhido) O teto do miolo desconta o lote impedido** (`disponivel − loteImpedido`, a conta da aprovação), e a nota não conta como
  "entrou livre" o item cujo lote está impedido. A OS aberta fica como está. Reverter = trocar uma expressão e tirar um filtro.
- **(descartado) Só o teto do material, sem olhar o lote do item da nota.** Com 4 de ajuste livres e alguém esperando, a nota de 4 num lote
  bloqueado distribuiria os 4 do ajuste — o que a D4 da 74 proíbe (a nota só distribui o que ela trouxe).
- **(descartado) Descontar também na OS aberta.** Ver B1455.

## Decisões (letra B — reversíveis; livres depois de **B1452**, **C518**, **A115**, conferido por `grep` em `docs` e `specs`)

- **B1453 — o teto do miolo.** `distribuirSemLock` passa a limitar por `Q.qtd(disponivel − loteImpedido)` do material (a mesma régua da
  aprovação, `calcularStatusPosAprovacao`). Vale para a nota, a inspeção, a NC e a OS encerrada (todas passam por ele). Material sem
  `controle_lote`: `loteImpedidoSql` dá 0 — nada muda (B1371).
- **B1454 — a nota não distribui o que ela pôs em lote impedido.** O "entrou livre desta nota" (`livrePorMaterial`) deixa de fora o item
  cujo lote está impedido **agora** (lido dentro da seção, pelo `predicadoLoteImpedidoSql`). Molde: a D4 da 74 (a nota não distribui saldo
  que veio de ajuste/devolução). Descartado: só o B1453 (reservaria o ajuste no lugar).
- **B1455 — a OS aberta não muda.** A fila da OS e a reserva da OS continuam com o teto e o "entrou livre" de hoje: a peça foi comprada para
  a OS, a reserva da OS existe para guardar a posse (sem validade) e a aprovação da requisição da OS converte sobre o impedido (B1381). Com o
  desconto, a requisição da OS que já esperava ficaria sem reserva e com a peça presa na reserva da OS, que ela não converte depois de
  aprovada (liberar o lote não distribui, C480) — pior do que hoje. **Limitação declarada:** a requisição da OS pode ficar *Reservada* com
  peça de lote bloqueado (o C478 continua só para ela — **D (219)**).
- **B1456 — a reserva antiga em lote impedido conta contra o liberado.** Reserva feita antes do bloqueio (B1372) faz `disponivel − impedido`
  ficar abaixo de zero; a nota boa seguinte só distribui acima dela. É a conta da aprovação: a requisição antiga vai entregar pelo
  automático, que sai do lote bom (Etapa 206). Descartado: separar a reserva por lote (a reserva não sabe o lote).
- **B1457 — os avisos (a fatia visível).** (a) Na entrada da nota, o item que entrou em lote impedido diz
  *"— em lote bloqueado, reprovado ou vencido (não sai até o lote ser liberado)"* no lugar de *"— disponível"*. (b) O solicitante só recebe a
  linha do material se ganhou reserva desta nota **ou** se entrou desta nota algo fora de lote impedido **e** o liberado do material
  (`disponivel − impedido`) é > 0. (c) `avisarLiberacao`: `haLivre` passa a ser o liberado. O "entrou N" do aviso continua o que entrou.
- **B1458 — a liberação (inspeção/NC) não olha o lote do item liberado**, só o teto do material (B1453). Inspeção aprovando peça de lote que
  continua bloqueado com saldo de ajuste livre no material: distribui o ajuste (o caso do B1454, na outra porta). **C519.**
- **B1459 — sem trava nova, sem migration, sem recálculo novo.** Leitura dentro das seções que já existem; o status herda (B1377).

### Fora (C novos)

- **C519** — a liberação da inspeção ou da NC não sabe o lote do item liberado (B1458).
- **C520** — a requisição da OS aberta ainda fica *Reservada* com peça de lote bloqueado (B1455).

### A (rodar em produção, antes do deploy)

- **A116** — reservas da chegada/liberação ainda ATIVAS em material com lote impedido (as que nasceram pelo C478):
  `SELECT r.numero, rs.id, rs.quantidade - COALESCE(rs.quantidade_utilizada,0) AS saldo, m.codigo FROM reservas_material_almoxarifado rs
  JOIN requisicoes_almoxarifado r ON r.id = rs.requisicao_id JOIN materiais_almoxarifado m ON m.id = rs.material_id
  WHERE rs.status = 'ATIVA' AND rs.origem = 'REQUISICAO' AND rs.recebimento_id IS NOT NULL AND m.controle_lote = 1
  AND EXISTS (SELECT 1 FROM lotes_almoxarifado lt WHERE lt.material_id = m.id AND lt.status <> 'ATIVO');` — o deploy não as solta (B1372);
  a entrega delas recusa enquanto o lote estiver impedido (RN-206.06). **Somente leitura.**

## Regras de negócio

Montagem padrão: material **não crítico**, `controle_lote = 1`, `controle_certificado = 1`, unidade `PC`; a nota pelas seis portas do
recebimento com o código do lote no item → o lote nasce **BLOQUEADO** (sem certificado).

- **RN-219.01 — nota toda em lote bloqueado.** R1 aprovada esperando 4 (sem saldo). Nota de 4 no lote L1 (BLOQUEADO) → **nenhuma** reserva
  para R1; R1 continua no status de espera (`AGUARDANDO_ESTOQUE`/`AGUARDANDO_COMPRA`); o disponível do material é 4. (Antes: reserva de 4,
  `TOTALMENTE_RESERVADA`.)
- **RN-219.02 — nota mista.** Material com `controle_certificado = 0` para L-bom e lote bloqueado à mão. Montagem: nota com 3 em L2 (ATIVO) e
  4 em L1 que já existe BLOQUEADO; R1 esperando 6 → reserva **3**, `PARCIALMENTE_RESERVADA`.
- **RN-219.03 — a nota não distribui o ajuste no lugar do bloqueado (B1454).** R1 aprovada esperando 4; depois 4 entram por ajuste em L0
  (ATIVO, sem distribuir — D4 da 74); nota de 4 em L1 BLOQUEADO → **nenhuma** reserva (com só o B1453 seriam 4).
- **RN-219.04 — inspeção.** Material **crítico** com controle de lote e certificado: a nota entra 4 retidas em L1 BLOQUEADO; R1 esperando 4;
  a inspeção aprova 4 → nenhuma reserva para R1, status de espera. Controle: o mesmo com o lote ATIVO (sem certificado exigido) → reserva 4.
- **RN-219.05 — OS encerrada (pelo serviço).** `reservarLiberacaoParaQuemEspera` com `origem: 'OS_ENCERRADA'` e quantidade 4, com o
  material todo em L1 BLOQUEADO → nenhuma reserva; com L1 ATIVO → 4.
- **RN-219.06 — liberar o lote: a separação enxerga.** Depois da RN-219.01, o lote volta a ATIVO (`PUT` do status do lote, ou anexar o
  certificado) → separar 4 de R1 → 200 (o C480 continua: nada é reservado sozinho).
- **RN-219.07 — OS aberta não muda (B1455).** NF com a OS ABERTA (sem pedido, `os_id`), 4 em L1 BLOQUEADO, requisição da OS esperando 4 → a
  reserva de 4 para ela como hoje.
- **RN-219.08 — os avisos (B1457).** (a) Aviso da entrada da nota (chave `notificar_recebimento_entrada = 1`): a linha do item diz
  *"— em lote bloqueado, reprovado ou vencido (não sai até o lote ser liberado)"*; o item da mesma nota em lote ATIVO diz *"— disponível"*.
  (b) Na RN-219.01, o solicitante de R1 **não** recebe aviso (nenhuma linha avisável). (c) Na RN-219.02, recebe com
  *"reservado para a sua requisição: 3"*. (d) Na RN-219.04, nenhum aviso de liberação.
- **RN-219.09 — sem lote impedido nada muda.** As suítes 74/75/171/176/205 verdes sem edição (`recebimentoReservaChegada*`,
  `inspecaoReservaLiberacao*`, `ncReservaLiberacao`, `reservaChegadaBase`, `reservaLiberacaoBase`, `osEncerrada*`, `recebimentoComOs`,
  `loteImpedido*`).
- **RN-219.10 — a reserva antiga conta (B1456).** R1 reservou 4 de L1 ATIVO; L1 vai a BLOQUEADO; R2 esperando 4; nota de 4 em L2 ATIVO →
  **nenhuma** reserva para R2 (liberado 0 = 8 − 4 reservado − 4 impedido); a aprovação de uma R3 também não reservaria (mesma régua).

## Contrato (congelado)

Sem rota nova, sem campo novo, sem mudança de assinatura. Mudam por dentro:

- `reservaChegadaService.distribuirSemLock(db, user, materialId, teto, rotulos, acc, filaOpcoes)` — `filaOpcoes.semDescontoDoLote` (bool,
  default `false`): `distribuirParaOs` passa `true` (B1455). O resto como hoje.
- `reservaChegadaService.reservarChegadaParaQuemEspera` — `livrePorMaterial` separado em `livre` (todos os itens, para a OS) e
  `livreForaDeImpedido` (B1454, para a fila geral), o lote lido dentro da seção.
- `receiptNotificationService.montarAvisoNota` — item ganha `em_lote_impedido` (bool). Literal:
  `— em lote bloqueado, reprovado ou vencido (não sai até o lote ser liberado)` (precede o "retido": item retido para inspeção diz *"retido
  para inspeção"*, como hoje).

## Tasks

| T | Tipo | O quê | Depende |
|---|---|---|---|
| T0 | tronco | Testes vermelhos `server/tests/api/chegadaLoteImpedido.api.test.js` (RN-219.01-.08, .10) | — |
| T1 | tronco | o teto do miolo (B1453) + o filtro da nota (B1454) + a OS sem desconto (B1455) | T0 |
| T2 | tronco | os avisos (B1457) | T1 |
| T3 | tronco | integração: RN-219.01 → .06 → .08 pela rota (nota, aviso, liberar lote, separar), e a RN-219.05 pelo serviço; regressão RN-219.09 | T1-T2 |

Sem galhos: tudo no mesmo serviço, em série na árvore principal.

### Controles positivos (um por vez; cópia no scratchpad, Edit, restauro por cópia e `cmp`)

1. miolo sem o desconto → RN-219.01, .02, .04, .05, .10 vermelhas.
2. nota sem o filtro do item → RN-219.03.
3. OS com o desconto → RN-219.07.
4. aviso sem a frase → RN-219.08 a; solicitante pelo `disponivel` de hoje → RN-219.08 b; `haLivre` de hoje → RN-219.08 d.

## Pontos de atenção

- `distribuirSemLock` lê `SELECT *, disponivel` do material; o desconto entra na mesma consulta (`loteImpedidoSql('materiais_almoxarifado')`
  não serve: o apelido é a tabela — usar `FROM materiais_almoxarifado ma`).
- O `livre − ja` da OS na retomada (I3 da 171) continua sobre o `livre` inteiro.
- O teto da liberação (`:556`) continua `min(quantidade, disponivel)`: o desconto mora no miolo (que a OS aberta pula).
- Teste de corrida: nenhuma porta nova (leitura sob a trava que já existe).
