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
