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

## Fase 2 — correções do revisor fresco (2026-11-13) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `b069fc5d` (só leitura): **1 trava, 5 importantes, 3 menores**; os números das RN-219.01/.02/.03/.04/.05/.10 conferidos à
mão e certos; sem desconto duplo (o físico livre do lote já tira a inspeção do lote; a reserva sobre peça impedida conta contra o bom, como na
aprovação — B1456 coerente).

1. **[TRAVA] O desvio do `distribuirParaOs` era ambíguo.** Ele chama o miolo duas vezes: a fila da OS (`:465`) e a fila geral quando a OS
   fechou no meio (`solta_os_fechada`, `:473`). **O `semDescontoDoLote: true` vai só no `:465`**; o `:473` é fila geral e desconta. Teste
   novo **RN-219.11** (a OS que fecha no meio, por monkeypatch de `reservaDaOs.reservarParaOsSobTrava` devolvendo `solta_os_fechada`).
   O teto do `:473` (`r.quantidade`) pode incluir a peça bloqueada; com o B1453 ele nunca passa do liberado, mas, com saldo de ajuste livre,
   distribui o ajuste no lugar (o caso do B1454 nesta borda) — **D (219)**.
2. **[IMP] B1454 e a frase do aviso só com `controle_lote = 1`.** A nota cria lote BLOQUEADO para qualquer item com código de lote
   (`receiptService.js:1754`), mas a aprovação e a separação ignoram lote em material sem controle (B1371). Sem a condição, o filtro deixaria
   de reservar o que a próxima aprovação reserva. Teste novo **RN-219.12** (sem controle de lote: reserva como hoje e o aviso diz
   *"disponível"*).
3. **[IMP] Precedência do aviso.** Item retido para inspeção diz *"retido para inspeção"* mesmo em lote impedido (retido vem primeiro); a frase
   nova só para o item livre em lote impedido. Asserção nova na RN-219.04 (a linha do aviso da nota).
4. **[IMP] O apelido `ma`** também nos dois avisos (`:366`, `:444`), não só no miolo.
5. **[IMP] O estorno da entrada boa deixa a reserva coberta só por lote impedido** (anterior à 219; `liberarParaEstorno` `:635-637` olha o
   disponível sem o desconto): na RN-219.02, estornar a nota boa (3 em L2) não solta a reserva de 3 (disponível 4 ≥ 3) e R1 fica
   *Parcialmente Reservada* com nada que saia; a entrega recusa (RN-206.06). **Fora — C521.**
6. **[IMP] "A conta da aprovação" era exagero.** A aprovação também tira a caixa sem reserva dos outros itens (`requisitionService.js:765`); o
   miolo nunca tirou (C173, Etapa 95). O B1453 iguala só a parte do **lote impedido**.
7. **[MENOR]** A RN-219.04 precisa de `inspecao_material_critico = 1` (o teste liga). A RN-219.02 fica: 1 PC entra em L1 e L1 é bloqueado pelo
   `PUT` **antes** de R1 ser aprovada (R1 espera: liberado 0), depois a nota (3 em L2 + 4 em L1) → liberado 3. O "entrou 7" do aviso ao
   solicitante com 3 reservados é o número que entrou (B1457).

C novo: **C521** (acima). O **C520** continua (OS aberta). Os testes da Fase 2 entram no T0.

## Execução

- [x] Passo 0 (pedido do André) — `test:api` sobre `5b3ae457`, antes de qualquer código: **613/613 arquivos OK** (a 218 fechou com 612/613
  e a asserção ampliada da RN-201.05 nunca tinha sido rodada na suíte inteira — agora rodada, verde).
- [x] Fase 0.5 — estimativa `d365771e` (**4h**).
- [x] Fase 1 — este plano — `b069fc5d`. Fase 2 — `3ac80e47` (bloco acima).
- [x] T0 — `server/tests/api/chegadaLoteImpedido.api.test.js`: 10/15 vermelhos por número/literal antes do código (os 5 verdes são as
  guardas: os controles com lote ativo, a OS aberta e o material sem controle de lote).
- [x] T1 — o teto do miolo (B1453), o filtro da nota (`livreForaDeLoteImpedido`, B1454), a fila da OS aberta sem desconto (B1455) —
  `2ec31628`.
- [x] T2 — os avisos (B1457) — `2ec31628`.
- [x] T3 — integração pela rota (nota → aviso → lote liberado → separar) e pelo serviço (OS encerrada) no mesmo arquivo; as 29 suítes de
  chegada/liberação/OS/lote impedido verdes **sem edição** (rodadas numa worktree com o código antes de copiá-lo para a árvore principal,
  para não mexer em produção enquanto o passo 0 rodava) — `2ec31628`.

### Controles positivos (script `e219-sabotagem.js` no scratchpad: cópia, âncora = 1, restauro por cópia, md5 igual)

| # | Sabotagem | Caiu |
|---|---|---|
| 1 | miolo sem o desconto | RN-219.04, .05, .10, .11, .14 (as .01/.02 são guardadas também pelo filtro — ver 12) |
| 2 | nota sem o filtro do item | RN-219.03 |
| 3 | fila da OS aberta com desconto | RN-219.07 |
| 4 | desvio da OS fechada sem desconto | RN-219.11 |
| 5 | filtro sem a condição de controle de lote | RN-219.12 |
| 6 | aviso sem a frase | RN-219.08 a/b, .02 |
| 7 | frase sem a condição de controle de lote | RN-219.12 |
| 8 | solicitante sem o "livre que sai" da nota | RN-219.03 |
| 9 | solicitante pelo disponível de hoje | RN-219.10 |
| 10 | o aviso de antes (8 + 9) | RN-219.08 b, .03, .10 |
| 11 | `haLivre` da liberação de hoje | RN-219.04 |
| 12 | 1 + 2 (as duas guardas) | RN-219.01, .02, .03, .04, .05, .06, .08 b, .10, .11 |
| 13 | filtro da nota só por status (sem o vencido) | RN-219.13 |
| 14 | frase só por status (sem o vencido) | RN-219.13 |

## Fase 5 — revisão adversarial (3 revisores frescos em paralelo: regra, travas/concorrência, "o teste passaria com a feature quebrada?")

Rodaram sobre a worktree com o código ainda não copiado, proibidos de editar o repositório (sondas `e219-rev-*.js` no scratchpad; o de
testes mutou a worktree uma mutação por vez, com cópia e md5).

1. **[TESTE, real] Lote vencido sem teste.** Trocar a régua por `status <> 'ATIVO'` (sem o vencido) no filtro e na frase sobrevivia — todo
   cenário usava BLOQUEADO. **RN-219.13** (vencido sem e com a liberação do vencimento); controles 13 e 14 — `a6323899`. As outras 5
   mutações sobreviventes eram equivalentes (`Number(null)`, `Math.max` antes de `<= EPS`, `Q.qtd` sobre dois termos já arredondados) ou
   inalcançáveis sem gancho de corrida (a leitura do lote fora da seção — ver item 3).
2. **[REGRA, médio, reproduzido] A reserva da OS sobre o lote bloqueado conta duas vezes.** A B1455 guarda na reserva da OS peças de lote
   bloqueado; a nota comum seguinte num lote bom não reserva para a requisição comum que esperava (antes da 219 reservava). A aprovação faz a
   mesma conta (R3 também espera). **Mantido (B1460)**, registrado como **C522**; **RN-219.14** fixa a decisão — `a6323899`. Descartado:
   abater a reserva da OS do impedido (com a reserva da OS em lote bom, a peça bloqueada voltaria a ser reservada).
3. **[TESTE/TRAVAS, lido] O comentário prometia mais que a seção.** "O lote é lido agora, dentro da seção" — certo, mas mudar o **status** do
   lote (`lotService.mudarStatusLote`, o anexo do certificado, a liberação do vencimento) não pega a trava do material; a seção serializa só
   com a correção de validade. Comentário corrigido (`2ec31628`) e **D (219)** item 3; o mesmo vale para a aprovação desde a 205.
4. **[TRAVAS, reproduzido, ANTERIOR] Bloquear o lote no meio da reserva não a impede.** Sonda `e219-rev-trava-1.js` (gancho em
   `criarReserva` que só sinaliza; o `PUT /lotes/:id/status BLOQUEADO` disparado do contexto do teste): com a trava do material segura, o
   bloqueio passa (200) e a reserva sai — pela nota **e** pela aprovação (`/aprovar`), igual. O resultado é o mesmo de bloquear logo depois de
   reservar (B1372), que já acontece sem corrida. Nenhum escritor do status do lote pega a trava (`mudarStatusLote`,
   `liberarBloqueioPorCertificado`, `liberarVencimento`; só `corrigirValidadeDoLote`). **Não é da 219** (não abre nem alarga) — **C523**,
   e o conserto vai junto com a próxima etapa.

Sem achado: as leituras novas estão dentro da seção que já existe (o gancho viu `travado: true`); sem aninhamento novo (só `SELECT`); as duas
leituras do lote (filtro e teto) só podem baixar o teto entre si; o `lote_id` do item da nota é lido antes da trava, mas não muda depois da
entrada. Os avisos leem depois de soltar, como já liam o disponível.

## Fechamento

- [x] Fase 5 — 3 revisores; **1 lacuna de teste real** (vencido) corrigida, **1 achado de regra** reproduzido e mantido por decisão (B1460,
  C522, teste que a fixa), **1 corrida anterior** reproduzida e registrada (C523); 0 ruído — `a6323899`.
- [x] Fechamento (`fechar-etapa`, sem o Passo 7½ e o 8, por pedido do André) — novidades (A116, B1453–B1460, C519–C523, D (219), F (219),
  seção, topo e "onde estamos"; o C478 marcado resolvido), specs 07 e 05, mapa, guia (seção, cabeçalho e o título da Etapa 217 que tinha
  sumido no fechamento da 218), manual (9.3b, 9.3c, 9.3e, 21c.1), este plano e a estimativa.
- **Verificação final (medida, serial):** ver o bloco "Verificação" abaixo.

### Divergências do plano

- **A OS que fecha no meio** (Fase 2, trava): o contrato dizia só "`distribuirParaOs` passa `true`"; o desvio para a fila comum desconta.
- **O filtro e a frase só com controle de lote** (Fase 2): o plano não tinha a condição.
- **"A conta da aprovação"** era exagero: o B1453 iguala só a parte do lote impedido (a aprovação tira também a caixa, C173).
- **RN-219.11 a .14** não existiam no plano (Fase 2 e Fase 5). **B1460**, **C521** (Fase 2), **C522** e **C523** (Fase 5) também não.
- **A fatia visível** ficou nos avisos (e-mail) e no status da requisição — nenhuma tela mudou.

### Retro (4 números)

- **Rodadas até verde na Fase 5:** 1 (os testes novos passaram na primeira, com controle positivo cada um).
- **Achados reais:** Fase 2: 1 trava + 5 importantes + 3 menores (todos aceitos). Fase 5: 1 lacuna de teste real (vencido), 1 regra
  reproduzida (mantida por decisão), 1 corrida anterior reproduzida; 0 ruído.
- **Paralelismo:** sem galhos de código; o código foi verificado numa worktree enquanto o passo 0 (suíte inteira) rodava na árvore
  principal, e os 3 revisores rodaram em paralelo na worktree — nenhuma contaminação (md5 conferido depois de cada mutação).
- **Defeito que escapou da 218:** nenhum achado nesta etapa. O título da Etapa 217 no guia tinha sumido no fechamento da 218 (restaurado).

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 219 fecha o C478; a vizinha imediata é o **C480** — com a 219, a requisição que esperava fica
*Aguard. Estoque* quando a nota entra em lote bloqueado, e anexar o certificado não a reserva: quem chegar primeiro na aprovação leva. É o
fim natural do C478, e junta o conserto da corrida **C523**. **Sem estimativa** — começa pela Fase 0.5.)*

**Liberar o lote reserva para quem ficou esperando (C480), e quem muda o status do lote pega a trava do material (C523).**

- **Onde liberam:** `lotService.liberarBloqueioPorCertificado` (`lotService.js:331`, chamado no anexo do certificado,
  `routes/almoxarifado.js:1331`), `lotService.mudarStatusLote` (`:289`, `PUT /api/almoxarifado/lotes/:id/status` em
  `routes/almoxarifado/extended.js:1366`) quando vai para `ATIVO`, e `lotService.liberarVencimento` (`:367`, `PUT /lotes/:id/liberar-vencimento`,
  `extended.js:1315`). Nenhum pega a trava hoje; só `corrigirValidadeDoLote` (`:491`) pega.
- **O que está pronto e não reabre:** o miolo `reservaChegadaService.distribuirSemLock` com o teto que pode sair (B1453) e a porta
  `reservarLiberacaoParaQuemEspera` (com `opcoes.sobTrava` + `pendencia`, o recálculo da 76 e o aviso da 75 depois de soltar —
  `concluirPendencia`). A liberação do lote pode entrar como uma 4ª origem (`ctx.origem = 'LOTE_LIBERADO'`), com `quantidade` = o físico
  livre do lote (`retidoDoLote.situacaoDosLotes` dá `livre` por lote) e rótulos próprios (a observação da reserva e o motivo).
- **A decisão a tomar (letra B, reversível):** (1) os três escritores do status pegam `naTravaDoMaterial` do material do lote (C523) — e o
  bloqueio também (não só a liberação), para a corrida sumir; (2) depois de soltar, a liberação distribui pela porta da 75 (sem nota: a
  reserva **sem** `recebimento_id`, então o estorno de nota não a solta — conferir `liberarParaEstorno`); (3) o aviso de liberação ganha a
  origem nova (frase *"O lote ⟨L⟩ do material que a sua requisição aguardava foi liberado …"*) ou fica sem aviso (mais barato).
- **Pontos de atenção:** a trava **não é reentrante** — `mudarStatusLote` chamado de dentro de outra seção do mesmo material (procure quem o
  chama além da rota) não pode pegar de novo; use o molde de `naTravaDoMaterial` (aninha no motor, só executa dentro de seção ativa). O
  recálculo e o aviso vão para depois de soltar (`concluirPendencia`). Teste de corrida pelo molde do CLAUDE.md (gancho só sinaliza; o gesto
  concorrente do contexto do teste) — a sonda `e219-rev-trava-1.js` da revisão da 219 é o vermelho pronto. A tela **Lotes e Séries** pode
  mostrar *"⟨n⟩ reservado(s) para quem esperava"* na resposta (a fatia visível).
- **Vizinhos baratos que seguem abertos:** C479 (reserva manual conta lote impedido), C519, C521, C514–C518, C486, C491, C495, C497, C498.

### Verificação (medida, serial, sobre a árvore de `f15ed607` — o código é o de `a6323899`)

`test:api` **614/614 arquivos OK** (613 de antes + `chegadaLoteImpedido`); `test:almoxarifado` **44 passou, 0 falhou**; `test:validation`
**4/0**; `test:safealter` **3/0**; `test:sqlite` **16/0**; cliente (`CI=true npx react-scripts test --watchAll=false --maxWorkers=2`, a tela
não mudou) **224/224 suítes, 3007/3007 testes**; `build` **Compiled successfully**. `chegadaLoteImpedido` **18/18**.
