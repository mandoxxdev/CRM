# Etapa 218 — o lote escolhido à mão ("Sai de") deixa de fora a peça bloqueada (C513)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa217-entrega-nao-tira-peca-bloqueada.md` (`:383-404`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-lote-escolhido.txt` (**4h30**, `f5759b99`). Números de linha medidos hoje
> sobre `f5759b99`.

## Objetivo (em linguagem simples)

Desde a Etapa 217 a entrega **automática** não tira do lote a peça que está em quarentena, reprovada na inspeção ou com um terceiro.
Mas quem escolhe o lote **à mão** — o "Sai de" da separação e da entrega — ainda só confere quantas peças há naquele endereço e lote:
com 4 peças no L1 e 1 delas em quarentena, dá para separar as 4 e a quarentena sai junto. Depois desta etapa a separação e a entrega
com lote escolhido conferem o lote inteiro: só sai o que não está bloqueado, nem em inspeção, nem já separado para outra requisição; a
recusa diz quantas podem sair e por quê. Na janela, o "Sai de" mostra ao lado do lote quantas podem sair dele.

## Fase 0 — medido em 2026-11-13 (sobre `f5759b99`)

1. **Quem escolhe lote à mão.** Uma porta só: `requisitionService.checarOrigemItem` (`requisitionService.js:1354-1403`), chamada pela
   separação (`:1635`, com a parte guardada das outras no par, C1) e pela entrega (`validarOrigemDaEntrega` `:2342-2357` — planejada (a),
   mesmo par (b), outro par (c, adiado, E1 `:2463-2491`) e "só lote" `:2497-2515`). Confere `SUM(estoque_saldo)` do **par** (endereço,
   lote) — ou do lote inteiro, sem endereço — menos o já pedido na chamada (`pedidoPorOrigem`). **Nenhuma desconta inspeção nem o
   retido do lote** (o Achado 4 da 217, confirmado).
2. **A régua da divergência** (`regua.saldoOrigem`, `:1613-1627`) lê o mesmo físico do par: se a aceitação passar a limitar pelo lote e a
   régua não, separar o máximo aceito sai "divergente".
3. **O retido já existe** (`retidoDoLote.lotesComRetidoSql`, 217): por lote `fis = MAX(0, saldo − inspeção)` e `ret ≤ fis`. Falta só ler
   o saldo cru e a inspeção do lote na mesma consulta (para a literal).
4. **A parte guardada no lote.** `parteGuardadaDeOutras` é por **par**. Peças do lote guardadas por outras caixas em **outro** endereço do
   mesmo lote também estão na prateleira e não podem sair: com o lote 4 (B01 2 + P01 2), 1 em quarentena e outra requisição com 2
   guardadas em P01, tirar 2 de B01 leva a peça da quarentena (o físico de B01 cobre, o lote não).
5. **Quem lê o "Sai de"**: `GET /estoque/:materialId/saldos` (`routes/almoxarifado/extended.js:845-860`, `separado_outras`/`sobra` da 201)
   → `RequisicoesList.js` `rotuloOrigem` (`:157-168`), `maxSeparavelNaTela` (`:311-324`) e a pré-seleção (`valorSugeridoNaSeparacao`
   `:260-272`). O extrato (`/materiais/:id/extrato`) usa a mesma função de serviço e **não** muda.
6. **Testes que escolhem lote na separação/entrega:** 46 arquivos com `lote_id:` e separar/entregar; 9 deles também montam inspeção.
   Com o gatilho (B1443) só muda o número onde o lote escolhido tem peça presa — a suíte inteira mede.

## Caminhos

- **(escolhido) Uma conferência do LOTE inteiro, depois das de hoje, só quando o lote tem peça presa.** Com lote escolhido, além do par:
  `pode sair = MAX(0, saldo_L − inspeção_L − retido_L) − guardado_L − já pedido_L ≥ q`. Lote sem peça presa (retido + inspeção = 0):
  nenhuma conta nova roda — byte a byte o de hoje. Reverter = tirar a chamada nos dois pontos.
- **(descartado) Descontar o retido no físico do PAR.** O retido é do lote — não se sabe em que endereço a peça está (B1439 da 217); por
  par descontaria em todo endereço do lote (recusa a mais).
- **(descartado) Conferir o lote sempre, com ou sem peça presa.** Mudaria recusas de hoje em dado legado sobrecomprometido (B1338) sem
  peça bloqueada nenhuma — fora do C513.

## Decisões (letra B — reversíveis; livres depois de **B1442**, **C516**, **A114**, conferido por `grep` em `docs` e `specs`)

- **B1443 — o caminho e o gatilho.** A conferência do lote roda só para material com `controle_lote = 1`, **sem** controle de série, e
  lote com `retido + inspeção > folga`. Fora disso, nada muda.
- **B1444 — a conta.** `livre_L = MAX(0, saldo_L − inspeção_L − retido_L)` (o `fis − ret` de `lotesComRetidoSql`, a mesma régua do
  automático e da 205). `guardado_L` = a parte guardada (`PARTE_ORIGEM_SQL`) das caixas vivas de **outras** requisições com
  `lote_separacao_id = L`, em **qualquer** endereço; na entrega soma também a guarda que **fica** das peças desta requisição no lote
  (`guardaQueConta` com `parteQueFicaPorItem`, a régua da 206/208). `já pedido_L` = o que esta chamada já pede do lote antes da entrada —
  na separação inclui a guarda das peças desta requisição no lote (a semeadura de hoje, `pedidoSeparacao`). `pode sair = MAX(0, livre_L −
  guardado_L − já pedido_L)`.
- **B1445 — série fica fora.** Material com controle de série: a série escolhida é a peça (status `EM_ESTOQUE` já conferido); como a C486
  da 206.
- **B1446 — a entrega pela origem planejada também confere.** Separação aceita antes do deploy (ou peça bloqueada no lote depois da
  separação, sem entrar físico) e que agora não cabe: a recusa vem pelo **"não serve mais"** de hoje (*"a origem da separação (B01) não
  serve mais (…) — entregue escolhendo de onde sai"*), o caminho da B1389 (lote planejado impedido). Saída: "Qualquer endereço
  (automático)", que já não tira a peça presa. **Descartado:** isentar a planejada — deixaria sair justamente a peça bloqueada.
- **B1447 — precedência.** As recusas de hoje primeiro (físico do par, C1/E1, "só lote"); a do lote por último. Na entrega, conferida numa
  passada depois de todas as origens, na ordem: planejada/mesmo par → escolhidos à mão (caso c) → só lote (a ordem da 208: a recusa cai
  em quem escolheu à mão).
- **B1448 — a régua da divergência também limita pelo lote** (só no gatilho): `saldoOrigem = min(par, livre_L − guardado_L − já pedido_L)`.
- **B1449 — a fatia visível.** `GET /estoque/:materialId/saldos` ganha por linha `lote_livre`, `lote_bloqueado`, `lote_inspecao` (números
  quando a linha é de lote no gatilho; `null` nas outras). `lote_livre = MAX(0, livre_L − guardado das outras no lote)` (o
  `requisicao_id` da 201 tira a própria). Na tela, o rótulo do "Sai de" ganha *" — do lote podem sair 3 (1 bloqueada, 2 em inspeção)"* e o
  máximo da tela na separação (`maxSeparavelNaTela`) fica limitado por `lote_livre` (a pré-seleção deixa de sugerir o par que o lote não
  cobre). O extrato não muda.
- **B1450 — sem trava nova.** A separação e a entrega já leem sob as duas travas (requisição → material); a janela lê sem trava
  (informação, como a 201).
- **B1451 — a literal** (contrato abaixo): o lote, quanto há, quanto pode sair e cada parcela que tira.

### Fora (C novos)

- **C517** — a sugestão de coleta da fila (`sugestaoDeColeta`) não desconta a peça presa do lote ao escolher o par sugerido; a tela já
  não pré-seleciona (o teto da tela, B1449), mas a fila pode sugerir o par.
- **C518** — o entregável do detalhe e da fila não sabe que a planejada deixou de servir (B1446): mostra o número e a entrega recusa com o
  "não serve mais".

### A (rodar em produção, antes do deploy)

- **A115** — caixas vivas com origem guardada em lote com peça presa (as que passam a tomar o "não serve mais" num clique):
  `SELECT r.numero, ir.id, lt.codigo FROM itens_requisicao_almoxarifado ir JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
  JOIN lotes_almoxarifado lt ON lt.id = ir.lote_separacao_id WHERE ir.quantidade_separada > ir.quantidade_entregue AND ir.lote_separacao_id
  IS NOT NULL AND r.status NOT IN ('CANCELADA','ATENDIDA','ENCERRADA');` cruzado com `GET /materiais/:id/bloqueado-por-lote` dos materiais
  listados. Zero: nada muda no deploy.

## Regras de negócio

Montagem padrão: material com controle de lote, sem série, unidade `un`, B01 e P01, entradas v2.

- **RN-218.01 — quarentena no lote escolhido (separação).** L1 4 em B01, 1 delas devolvida para Quarentena (L1 continua 4, retido 1);
  L2 5 em P01. Requisição de 4 aprovada. Separar 4 de (B01, L1) → **400** com a literal (há 4, podem sair 3, 1 bloqueada); separar 3 →
  200, divergência **não** marcada (B1448).
- **RN-218.02 — reprovação da inspeção.** L1 5 (3 aprovadas, 2 reprovadas — o lote segue ATIVO). Separar 4 de (P01, L1) → 400 (podem
  sair 3, 2 bloqueadas); 3 → 200.
- **RN-218.03 — terceiros.** L1 5 com remessa de 2 enviada (o saldo do lote continua 5) → podem sair 3. Remessa criada e **não** enviada
  → 5 (sem gatilho).
- **RN-218.04 — em inspeção no lote.** Item de recebimento do L1 com 2 em inspeção (L1 5) → separar 4 → 400 com *"2 un em inspeção"*.
- **RN-218.05 — guardado por outras requisições em outro endereço do lote.** L1 B01 2 + P01 2, 1 em quarentena no L1 (L1 5, retido 1);
  R1 separou 2 de (P01, L1). R2 separa 2 de (B01, L1) → 400 (*"2 un já separadas dele para outras requisições"*, podem sair 2... ver a
  conta no teste); 1 a menos → 200.
- **RN-218.06 — só lote (sem endereço).** Separar 4 com só `lote_id` L1 (RN-218.01) → 400 com a mesma literal.
- **RN-218.07 — dois itens do mesmo material no mesmo lote somam.** Livre 3: item A 2 de (B01, L1) e item B 2 de (P01, L1) na mesma
  separação → 400 no B com *"2 un já pedidas nesta separação"*.
- **RN-218.08 — entrega escolhendo o lote à mão (caso c).** Separado no automático (sem origem), entregar 4 escolhendo (B01, L1) com
  L1 4 e 1 em quarentena → 400 com a literal da entrega + *"Escolha outro lote ou deixe "Qualquer endereço (automático)""*; nada baixado.
  Entregar 3 → 200, sai L1 3.
- **RN-218.09 — entrega pela origem planejada que deixou de servir (B1446).** A caixa guardada em (B01, L1) 4 (montada direto, como antes
  do deploy) com 1 em quarentena no L1 → entrega num clique → 400 *"… a origem da separação (B01) não serve mais (no lote L1 há 4 un …) —
  entregue escolhendo de onde sai"*; com `origem_automatica: true` → 200, e o L1 fica com a peça presa.
- **RN-218.10 — a planejada que cabe passa.** Separado 3 de (B01, L1) com L1 4 e 1 em quarentena → a entrega num clique sai L1 3 (a
  guarda própria não conta duas vezes).
- **RN-218.11 — nada muda sem peça presa (B1443).** (a) lote escolhido sem retido nem inspeção, com outro lote do material em
  quarentena: separar e entregar o físico inteiro do par → 200 (como hoje); (b) material com controle de série: nada muda (B1445);
  (c) as suítes 58/59/65/136/196-217 verdes sem edição.
- **RN-218.12 — a janela (B1449).** `GET /estoque/:id/saldos?requisicao_id=R2`: a linha (B01, L1) com `lote_livre` 3, `lote_bloqueado` 1,
  `lote_inspecao` 0; a linha (P01, L2) com os três `null`; com R1 guardando 1 do L1 em outro endereço, `lote_livre` 2 para R2 e 3 para R1.
  O rótulo e o teto da tela (teste do cliente).
- **RN-218.13 — integração (rota e serviço).** (a) **Rota:** entradas L1 (B01) e L2 → R1 aprovada, separada, entregue (L1) → `POST
  /devolucoes` Quarentena (volta 1 ao L1) → R2 aprovada → `GET /estoque/:id/saldos` (`lote_livre`) → `PUT /separacao` acima do livre → 400
  → no livre → 200 → `PUT /entregar` num clique → sai L1, sobra no L1 a peça presa. (b) **Serviço:** a mesma montagem por
  `registrarDevolucao`, `separarRequisicao`, `entregarRequisicao`.
- **RN-218.14 — a mesma régua do automático.** No cenário da RN-218.01, `lote_livre` da janela = o `saldo` do L1 em `lotesParaOAutomatico`
  (lote sem guarda).

## Contrato (congelado)

### `retidoDoLote.js` — novo

```js
async situacaoDosLotes(db, materialId) // -> Map<lote_id, { saldo, inspecao, retido, livre }> — UMA consulta (lotesComRetidoSql + saldo e
                                       //    inspeção crus); livre = MAX(0, fis − ret); todos os lotes do material
```

### `requisitionService.js`

```js
fraseLivreDoLote({ gesto /* 'separacao'|'entrega' */, lote, saldo, podeSair, retido, inspecao, guardado, jaPedido, qty, unidade })
async guardadoNoLoteDeOutras(db, materialId, loteId, requisicaoId) // -> q (caixas vivas de OUTRAS requisicoes, qualquer endereco)
```

Exportadas. A conferência entra em `separarSemTrava` (por entrada, depois de `checarOrigemItem`) e em `entregarSemTrava` (passada depois
do "só lote"). `checarOrigemItem` não muda de assinatura nem de literal.

### Literal (B1451)

`fraseLivreDoLote` (números por `r6`; `${un}` = a unidade do item, omitida se vazia; cada parcela só se > 1e-9, na ordem abaixo, juntas
por `"; "`):

```
no lote ${lote} há ${saldo} ${un}, mas só ${podeSair} podem sair ${gesto === 'entrega' ? 'nesta entrega' : 'nesta separação'}: ${parcelas};
não cobre a quantidade (${qty})
```

- retido: `${r} ${un} ${r === 1 ? 'está bloqueada' : 'estão bloqueadas'} nele (quarentena, reprovação na inspeção ou com terceiro)`
- inspeção: `${i} ${un} em inspeção`
- guardado: `${g} ${un} já ${g === 1 ? 'separada' : 'separadas'} dele para ${gesto === 'entrega' ? 'outras requisições ou outras peças desta' : 'outras requisições'}`
- já pedido: `${j} ${un} já ${j === 1 ? 'pedida' : 'pedidas'} ${gesto === 'entrega' ? 'nesta entrega' : 'nesta separação'}`

Recusas (400):

- separação: `${material_nome}: ${frase}. Escolha outro lote ou separe menos`
- entrega (à mão, mesmo par, só lote): `${material_nome}: ${frase}. Escolha outro lote ou deixe "Qualquer endereço (automático)"`
- entrega pela planejada: `${material_nome}: a origem da separação (${codigo}) não serve mais (${frase}) — entregue escolhendo de onde sai`
  (o envelope de hoje, `:2350`)

### `GET /api/almoxarifado/estoque/:materialId/saldos` (aditivo)

Cada linha ganha `lote_livre`, `lote_bloqueado`, `lote_inspecao` (número ou `null`, B1449). Nada mais muda.

## Tasks

| T | Tipo | O quê | Depende |
|---|---|---|---|
| T0 | tronco | Testes vermelhos `server/tests/api/loteEscolhidoPecaPresa.api.test.js` (RN-218.01-.14), vermelho por número/literal | — |
| T1 | tronco | `situacaoDosLotes` + `fraseLivreDoLote` + `guardadoNoLoteDeOutras` | T0 |
| T2 | tronco | a conferência na separação (aceitação + régua da divergência) | T1 |
| T3 | tronco | a passada na entrega (planejada, à mão, só lote) | T1 |
| T4 | galho | a rota `/saldos` (B1449) | T1 |
| T5 | galho | o cliente: rótulo + teto (`RequisicoesLoteLivre.test.js`) | contrato |
| T6 | tronco | integração RN-218.13 (rota e serviço) + regressão das suítes 58/59/65/136/196-217 | T2-T4 |

Galhos T4/T5 pequenos — executados em série na árvore principal (nada concorrente para a sabotagem contaminar).

### Controles positivos (um por vez; cópia no scratchpad, Edit/`perl`, restauro por cópia e `cmp`)

1. separação sem a conferência do lote → RN-218.01/.02/.03/.04/.06 vermelhas.
2. sem o `guardado` das outras → RN-218.05.
3. sem o `já pedido` do lote → RN-218.07.
4. sem o gatilho (conferir sempre) → RN-218.11 a (só se algum cenário tem lote sobrecomprometido) — senão registrar que o gatilho não é
   observável.
5. entrega sem a passada → RN-218.08/.09.
6. entrega sem a guarda própria descontada (a planejada contada duas vezes) → RN-218.10.
7. régua da divergência sem o limite do lote → RN-218.01 (divergência).
8. rota sem os campos → RN-218.12; cliente sem o teto → o teste do cliente.

## Pontos de atenção

- `pedidoPorOrigem` da entrega recebe a semeadura do "só lote" (`m|null|L` += estritos, `:2508`): o `já pedido_L` da entrega **não** sai
  dele — sai de uma lista própria das origens conferidas (contaria em dobro).
- A guarda própria na entrega só é conhecida depois do laço (`parteQueFicaPorItem`): por isso uma passada depois, não dentro de
  `checarOrigemItem`.
- Teste de corrida: nenhuma porta nova (só leitura sob as travas que já existem).

## Fase 2 — correções do revisor fresco (2026-11-13) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `8f9affd2`: **1 trava, 7 importantes, 6 menores**. Confirmado no código: a devolução para Quarentena **entra** físico no
endereço escolhido (`ENTRADA_DEVOLUCAO` + `BLOQUEIO` com o lote, `returnService.js:324-340`) e a inspeção mora nas linhas de saldo (a nota
entra e a `QUARENTENA` só sobe `quantidade_em_inspecao`). Provado: a entrega num clique da planejada aceita o que a separação nova aceitou
(semeadura da separação = guarda que fica da entrega, termo a termo).

1. **[TRAVA] RN-218.05 com números incoerentes.** Corrigido para: L1 B01 2 + P01 3, 1 em quarentena em P01 (L1 5, retido 1, livre 4); R1
   guardou 3 em (P01, L1) → R2 separa 2 de (B01, L1) → 400 "só 1 pode sair"; 1 → 200 (o teste já foi escrito assim).
2. **[IMP] "já pedida nesta separação" mentia sobre rodadas anteriores.** A semeadura (guarda desta requisição de rodadas anteriores) vira
   parcela própria: *"⟨p⟩ un já separada(s) dele por esta requisição"* (`propria` no contrato, só na separação, entre `guardado` e
   `jaPedido`). O `jaPedido` passa a ser só o desta chamada.
3. **[IMP] Concordância e espaço:** singular quando `0 < x < 2` ("1 pode", "0,5 kg está bloqueada"), plural no resto (inclusive 0);
   `${un}` leva o próprio espaço; o limiar das parcelas é `Q.QTD_FOLGA` (o mesmo do `retidoPorLote`).
4. **[IMP] Saldo negativo permitido não isenta** (B1391 da 206): a conferência física do par já vale com ele; a do lote também. Registrado
   na B1443.
5. **[IMP] RN-218.02/.03/.04 e o automático da .09 precisam do L2** (a reprovação, o terceiro e a inspeção já baixam o disponível do
   material — sem L2 a recusa seria o teto "Máximo: 3"). Os testes têm L2 5; na .09 o automático sai L1 3 + L2 1.
6. **[IMP] A guarda própria que fica, na entrega, vem do banco** — todas as peças da requisição com `lote_separacao_id = L`, por
   `guardaQueConta` (como `guardaDosIrmaosNoPar`): a peça que não está nesta entrega conta a parte inteira; a desta entrega, o que fica.
   (`parteQueFicaPorItem()` sozinho perderia o irmão fora da entrega.) B1444 fica assim.
7. **[IMP] B1446 vale também depois do deploy:** remessa enviada, bloqueio avulso ou reprovação **depois** da separação sobem o retido sem
   baixar o lote; duas caixas guardadas no lote e 1 peça a terceiro → as duas planejadas tomam "não serve mais" (falta 1). Mesmo caminho
   da RN-205.10 → RN-206.06 (lote bloqueado depois da aprovação). Saída: "Qualquer endereço (automático)". Registrado no C518.
8. **[IMP] O teto da tela (T5)** subtrai também a guarda desta requisição no lote (Σ `pendentePlanejado` das peças do material com
   `lote_separacao_id = L`, qualquer endereço) — `lote_livre` só tira a das outras. Os irmãos escolhendo o mesmo lote no mesmo modal não
   entram (a tela pode prometer mais, nunca menos; a porta recusa com a literal) — **D (218)**. RN-218.12: `lote_livre` 4 para R1 é o
   número da rota (as outras); a tela de R1 mostra 3 de teto.
9. **[MENOR]** RN-218.14 vale para lote sem guarda e sem linha inutilizável (o automático tira guarda por linha e pula endereço bloqueado;
   a conta do lote só pode recusar mais, nunca aceitar o que o automático não tiraria). A115 com `caixaVivaSql`. Ordem da recusa: a ordem
   das entradas (separação) / das origens conferidas (entrega). `guardadoNoLoteDeOutras(…, null)` = todas.

## Execução

- [x] Fase 0 + Fase 1 — este plano — `8f9affd2`.
- [x] Fase 2 — revisor fresco: 1 trava, 7 importantes, 6 menores; aceitos (bloco acima). Testes novos por causa dela: RN-218.15 (a guarda
  de rodada anterior, parcela própria), RN-218.16 (o irmão fora da entrega), RN-218.11 b (série) e RN-218.11 c (o gatilho — o controle 4
  não caía sem ele: conferir sempre não mudava nenhum cenário com peça presa).
- [x] T0 — `server/tests/api/loteEscolhidoPecaPresa.api.test.js`: 14/16 vermelhos por número/literal antes do código (as RN-218.10 e .11 a
  verdes de propósito: são as guardas de regressão).
- [x] T1 — `retidoDoLote.situacaoDosLotes`, `fraseLivreDoLote`, `guardadoNoLoteDeOutras`, `memoLotesComPecaPresa` — `97ba728c`.
- [x] T2 — a separação (aceitação + régua da divergência) — `97ba728c`.
- [x] T3 — a passada da entrega (planejada no envelope "não serve mais") — `97ba728c`.
- [x] T4 — a rota `/saldos` (`lote_livre`, `lote_bloqueado`, `lote_inspecao`) — `97ba728c`.
- [x] T5 — o cliente (`sufixoDoLote`, `propriaNoLote`, `maxSeparavelNaTela` com `itensDaReq`) + `RequisicoesLoteLivre.test.js` 5/5 (8/8 depois da Fase 5) — `97ba728c`.
- [x] T6 — integração RN-218.13 pela rota e pelo serviço (no arquivo do T0) — `97ba728c`.

### Controles positivos executados (script `e218-sabotagem.js` no scratchpad: cópia, âncora = 1, restauro por cópia, md5 igual)

| # | Sabotagem | Caiu |
|---|---|---|
| 1 | separação sem a conferência do lote | RN-218.01-.07, .13 a/b, .15 |
| 2 | sem o guardado das outras | RN-218.05 |
| 3 | sem o já pedido do lote | RN-218.07 |
| 4 | sem o gatilho (conferir sempre) | RN-218.11 c |
| 5 | entrega sem a passada | RN-218.08, .09, .16 |
| 6 | guarda própria contada inteira (dupla contagem) | RN-218.09, .10, .13 a/b, .16 |
| 7 | guarda própria só dos itens desta entrega (perde o irmão fora) | RN-218.16 |
| 8 | régua da divergência sem o limite do lote | RN-218.01 |
| 9 | rota sem os campos | RN-218.12, .13 a, .14 |
| 10 | série dentro do gatilho | RN-218.11 b |
| 11 | sem a parcela "por esta requisição" | RN-218.15 |
| 12 | retido zerado em `situacaoDosLotes` | 14 cenários |
| 13 | livre sem descontar a inspeção | RN-218.04 |
| 14 | singular só com 1 exato | [B1451] |
| C1 | cliente sem o teto do lote | B1449, Fase 2 item 8 |
| C2 | cliente sem a guarda própria no lote | Fase 2 item 8 |
| C3 | cliente sem o sufixo | os dois rótulos |

## Fase 5 — revisão adversarial (3 revisores frescos em paralelo: regra, travas/concorrência, "o teste passaria com a feature quebrada?")

Rodaram com a árvore em uso pela suíte, **proibidos de editar o repositório** (sondas só no scratchpad, `e218-rev-*.js`).

1. **[TRAVAS, MÉDIO, reproduzido — F1] Cancelar/encerrar remessa soltava o retido de todos os lotes por um instante.** O motor baixava
   `quantidade_em_terceiros` sob a trava e o item só era liquidado (`quantidade_retornada = quantidade`) **depois**, fora dela: no meio, a
   soma da família "terceiros" passava do total, a família deixava de caber (B1436) e **todo** lote soltava o retido — separar 5 do L1 com 2
   dele em outro terceiro **passava** (sonda `e218-rev-trava-remessa.js`). Defeito anterior à 218 (já valia para o automático da 217), mas a
   218 pôs um segundo leitor confiando nele. **Conserto (B1452):** motor + liquidação do item numa seção só (`naTravaDoMaterial`, o molde da
   B1442) no cancelamento, no encerramento e no retorno (o desfazer do claim do retorno também — F3, lido, não reproduzido). Teste
   **RN-218.22** (`loteEscolhidoTravas.api.test.js`, gancho só sinaliza; a separação disparada do contexto do teste): a separação espera e
   recusa "só 3". Controle 20: sem a trava → vermelho pela asserção "a separação não esperou".
2. **[TRAVAS, MÉDIO, reproduzido — F2] Devolução ao fornecedor e sucateamento do reprovado carimbavam a inspeção antes do motor, fora da
   trava.** O carimbo tira a reprovação do retido; o motor (que espera a trava) só baixa o lote depois — uma separação que já segurava a
   trava via as reprovadas como livres (sonda minha `e218-nc-probe.js`: sem a trava "SEPAROU 5" durante o portão; com ela "ESPERANDO" e
   depois a recusa física). **Conserto (B1452):** `executarDevolucao` e `baixarReprovado` inteiros sob `naTravaDoMaterial` (aninha no motor;
   dentro de outra seção ativa só executa — o molde da liberação, Etapa 91). Teste **RN-218.23**; controle 21.
3. **[REGRA, MÉDIO, reproduzido] Falsa recusa pela guarda que fica do PRÓPRIO item.** Caixa de 3 do L1, depois 2 do L1 a terceiro: entregar 1
   num clique (2 livres no lote) recusava "só 0 … 2 un já separadas dele para outras requisições ou outras peças desta" — o "2" era a caixa
   dele mesmo. **Conserto:** a guarda própria que fica não entra na conta do próprio item (`AND ir.id <> ?`); a próxima entrega dele confere
   de novo (B1446). Teste **RN-218.17**; controle 15.
4. **[REGRA, registrado] Material sem Controle por lote que tem lotes** (o lote entrou como etiqueta): a escolha à mão continua levando a peça
   presa. Mantida a exclusão (B1443), por coerência com a B1371 (a aprovação, a separação e o automático também ignoram lote nesse
   material) — **D (218)**.
5. **[TESTE] 9 mutações sem teste**, todas cobertas: o `jaPedido` da entrega (RN-218.18), a ordem B1447 (RN-218.19), o "só lote" na entrega
   (RN-218.20), o guardado das outras na entrega e a régua `caixaViva`/`PARTE` (RN-218.21), a régua da divergência com guardado e própria
   (asserções em RN-218.05 e .15), a janela com só inspeção (RN-218.04 b) e, no cliente, `itensDaReq` com irmão, a sugestão da fila e o
   singular/plural no formato com sobra (3 testes novos). Controles 16-19 e C4-C6.

Sem achado: deadlock/reentrância (só leitura; as portas novas sob a trava aninham no motor), a ordem requisição → material, a janela sem
trava (informação), frações (2,500001 contra 2,5 → 400; 2,5 → 200), item repetido no payload, planejada + à mão + só lote juntos.

### Controles positivos da Fase 5

| # | Sabotagem | Caiu |
|---|---|---|
| 15 | guarda própria do item de volta na conta | RN-218.17 |
| 16 | entrega sem o já pedido do lote | RN-218.18, .19 |
| 17 | entrega sem o guardado das outras | RN-218.21 |
| 18 | entrega "só lote" fora da passada | RN-218.20, .21 |
| 19 | guardado sem o filtro de caixa viva | RN-218.21 |
| 20 | cancelar remessa sem a trava | RN-218.22 |
| 21 | devolução ao fornecedor sem a trava | RN-218.23 |
| C4 | cliente ignorando a guarda dos irmãos (`itensDaReq`) | Fase 5, irmão |
| C5 | sugestão da fila sem o teto do lote | Fase 5, sugestão |
| C6 | rótulo sempre "podem" | Fase 5, rótulo |

Não sabotados (mesmo molde, sem teste de corrida próprio): o encerramento e o retorno da remessa e o sucateamento do reprovado — **D (218)**.

## Fechamento

- [x] Fase 5 — 3 revisores; 3 defeitos reais reproduzidos (2 de trava anteriores à 218, 1 de regra da 218) e 9 lacunas de teste, todos
  corrigidos — regra e testes em `97ba728c`, travas em `e4490a2f` (B1452).
- [x] Fechamento (`fechar-etapa`) — novidades (A115, B1443–B1452, C517–C518, D (218), F (218), seção e "onde estamos"), specs 05 e 10, mapa,
  guia, manual, este plano, a estimativa.
- **Verificação final (medida, serial, sobre a árvore de `e4490a2f`):** `test:api` **612/613 arquivos OK** — a falha era o
  `saldosSobraDeOutras` (**RN-201.05**: "a rota devolve os campos da função mais os dois"), que a B1449 muda de propósito (três campos
  aditivos); a asserção foi **ampliada** (não apagada: o extrato continua sem os campos) e o arquivo rodado de novo sozinho: **16/0**.
  `test:almoxarifado` **44 passou, 0 falhou**; validation **4/0**, safealter **3/0**, sqlite **16/0**; cliente **224/224 suítes, 3007/3007
  testes**; `build` **Compiled successfully**. `loteEscolhidoPecaPresa` **26/26**, `loteEscolhidoTravas` **2/2**, `RequisicoesLoteLivre` **8/8**.
  (Uma 1ª rodada do `test:api` foi interrompida de propósito em 400/612 — 0 falhas — para aplicar os consertos da Fase 5; refeita do zero.)

### Divergências do plano

- **RN-218.05** tinha números incoerentes (Fase 2, trava) — corrigida antes do código.
- **A parcela "por esta requisição"** não existia no contrato (Fase 2 item 2): a literal ganhou `propria`.
- **A guarda que fica do próprio item** contava na conta dele (o plano dizia "a guarda que fica das peças desta requisição") — estava errado,
  dava falsa recusa; o próprio item saiu da soma (Fase 5).
- **B1450 ("sem trava nova")** continua valendo para a leitura, mas a Fase 5 pôs sob a trava cinco escritores do retido que gravavam fora
  dela (B1452) — o plano não previa mexer em remessa, NC e sucateamento.
- **RN-201.05** (Etapa 201) mudou: a rota devolve 5 campos além dos da função, não 2.
- **RN-218.15 a .23** não existiam no plano (Fase 2 e Fase 5).

### Retro (4 números)

- **Rodadas até verde na Fase 5:** 1 (e 1 de premissa nos testes novos: RN-218.18/.19 montados errado, refeitos).
- **Achados reais:** Fase 2: 1 trava + 7 importantes + 6 menores (todos aceitos). Fase 5: **3 defeitos reproduzidos** (F1 remessa, F2
  carimbo da NC, falsa recusa da guarda própria) + 1 limitação registrada (material sem controle de lote) + 9 lacunas de teste. **0 ruído.**
- **Paralelismo:** nenhum galho de código (tudo em série na árvore principal); 3 revisores em paralelo na Fase 5, rodando enquanto a suíte
  rodava, proibidos de editar o repositório — nenhuma contaminação.
- **Defeito que escapou da 217:** os dois de trava (F1, F2) eram anteriores e afetavam também o automático da 217 — a revisão da 217 não os
  viu (olhou o envio, não o cancelamento/encerramento nem os carimbos da NC).

## Próxima tarefa detalhada

*(Escolhida pela ordem do CLAUDE.md: a 218 fecha o C513; o que ela nomeou como "falta para 🟢" na spec 05 é C478, C486, C491, C495, C497,
C498, C517, C518. Entre os vizinhos baratos, o de mais valor é o **C478** — a requisição fica *Totalmente Reservada* com peça que não pode
sair, e a fila promete separar o que a separação recusa. Os outros são de mensagem (C495, C497), de borda (C491, C498) ou já têm saída na tela
(C517, C518). **Sem estimativa** — começa pela Fase 0.5.)*

**As três portas que distribuem para quem espera não reservam saldo de lote impedido (C478).**

- **Onde:** `server/services/almoxarifado/reservaChegadaService.js`, `distribuirSemLock` (~`:363-380`): o teto é
  `min(teto da porta, disponivel)` com `disponivel = disponivelSql()` do material — **sem** o desconto do lote impedido. Quem chama: a chegada
  da nota (`reservarChegadaParaQuemEspera`, `:205`), a liberação da inspeção/NC (`reservarLiberacaoParaQuemEspera`, `:544`) e a OS
  encerrada (`distribuirParaOs`, `:463`). As três já rodam sob a trava do material (Etapa 91).
- **O que está pronto e não reabre:** `loteImpedido.loteImpedidoSql('ma')` (205 + 217: lote bloqueado/reprovado/vencido, com o retido do
  lote — a régua da aprovação); o molde é `requisitionStateMachine.calcularStatusPosAprovacao` (`:279`):
  `Q.qtdSql(\`${disponivelSql('ma')} - ${loteImpedidoSql('ma')}\`)`.
- **A decisão a tomar (letra B, reversível):** trocar o `disponivel` de `distribuirSemLock` por `disponivel − lote_impedido` (o mesmo número
  que a aprovação reserva). Cenário: material não crítico, nota que entra 4 num lote **BLOQUEADO** (sem certificado) com uma requisição
  esperando 4 → hoje reserva 4 (*Totalmente Reservada*); depois, 0 (continua *Aguardando*), e ao liberar o lote a próxima porta distribui.
  Conferir o **recálculo de status** (`recalcularStatusDeReserva`, B1377 da 205 — já herda a conta) e o aviso da 75 (`faltaDoItem`).
- **Pontos de atenção:** a OS encerrada também cria a **reserva da OS** com o que sobra (`reservarParaOsSobTrava`) — decidir se a sobra
  reservada para a OS também desconta (mesma régua, para não reservar peça de lote bloqueado para a OS); o teste de corrida não muda (já
  sob a trava); a A-consulta de produção: reservas ativas cobertas só por lote impedido (as que a C515 já lista em parte).
- **Vizinhos baratos que seguem abertos:** C514, C515, C516, C517, C518, C486, C491, C495, C497, C498, C500.
