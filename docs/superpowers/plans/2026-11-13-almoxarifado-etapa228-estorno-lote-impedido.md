# Etapa 228 — estornar a entrada boa não deixa a reserva coberta só por lote impedido (C521)

> Usando a skill `desenvolver-etapa`. Ponto de partida: a "Próxima tarefa detalhada" de
> `docs/superpowers/plans/2026-11-13-almoxarifado-etapa227-saldo-por-lote-vencido.md` (`:205-228`). Estimativa já commitada:
> `docs/estimativas/2026-11/estimativa_2026-11-13_almoxarifado-estorno-lote-impedido.txt` (**4h**, `ffe7b233`). Números de linha medidos
> hoje sobre `7aacca26`.

## Objetivo (em linguagem simples)

Uma nota traz 3 peças num lote bom (reservadas para a requisição R1, que esperava) e 4 num lote **bloqueado** (sem certificado). Alguém
estorna a entrada do lote bom. Hoje o estorno não solta a reserva de R1: ele confere se "o disponível" do material (4, todo no lote
bloqueado) cobre os 3 que saem, e cobre. R1 fica *Parcialmente Reservada* com nada que possa sair, e a entrega recusa (Etapa 206). Depois
desta etapa o estorno conta só o que **pode sair** para uso: a reserva que ficaria sem cobertura é solta, R1 volta a esperar, e a tela
**Reservas** diz por quê no motivo da liberação.

## Fase 0 — medido em 2026-11-13 (sobre `7aacca26`)

1. **Onde.** `reservaChegadaService.liberarParaEstorno` (`reservaChegadaService.js:757-811`): (a) solta a reserva da OS deste recebimento
   (`liberarReservaDaOsParaEstorno`, `:762`, sempre `min(reserva, estornado)` — não muda); (b) lê `disponivelSql()` do material (`:763`);
   (c) `if (disp >= qtd - EPS) return` (`:765`); (d) se nem soltando tudo o que pode o motor aceitaria (`disp + total < qtd`, `:783`), não
   toca em nada; (e) solta da última na prioridade para a primeira até `falta = qtd - disp` (`:786`).
2. **A régua pronta.** `loteImpedido.loteImpedidoSql(m, hoje)` (o desconto do material, com o retido por lote da 217) e
   `predicadoLoteImpedidoSql(l, hoje)` (o lote). `hoje` = `diaLocal.hojeLocalISO()` (Brasília). Material sem `controle_lote`: 0.
3. **O lote da entrada.** `mov.lote_id` (a pré-checagem do lote no motor já o usa, `stockService.js:3054-3062`). A nota mista grava uma
   `ENTRADA_COMPRA` por item, cada uma com o seu lote.
4. **Quem chama.** `stockService.cancelarMovimentacao` (`:3064`), só para `ENTRADA_COMPRA` com `recebimento_id`, **fora** da trava do
   material (soltar sem distribuir não pega — B441). Depois do estorno o motor recalcula o status das requisições soltas (`:3742` e
   vizinhos); se o estorno falhar, `recriarAposEstornoRecusado` (`:869`) recria com `criarReserva(..., { sistema: true, requisicao_id })`,
   que compara com `disponivelSql()` sem o desconto do lote (só a reserva **manual** desconta, B1469) — a recriação continua cabendo.
5. **O recálculo já herda.** `recalcularStatusDeReserva` → `calcularStatusPosAprovacao`, que desconta o lote impedido (B1377): R1 sem
   reserva e sem nada que saia vai para o status de espera.
6. **O motivo aparece na tela.** `ReservasAlmoxarifado.js:472-474`: a reserva LIBERADA mostra *"Motivo: ⟨motivo_liberacao⟩"*.

## A conta (B1504)

```
livre = disp − imp      se o lote da entrada NÃO está impedido (ou a entrada não tem lote)
livre = disp            se o lote da entrada está impedido (a régua de hoje)
falta = qtd − livre     (sem teto no estornado — B1505)
```

- **Lote bom:** depois do estorno o que pode sair é `(disp − qtd) − imp`; soltar `x` soma `x`. Soltar `falta` leva o que pode sair a
  exatamente 0 — nunca solta de mais.
- **Lote impedido:** as peças estornadas já estão dentro de `imp` e saem com o estorno: o que pode sair antes e depois é o mesmo
  (`(disp − qtd) − (imp − qtd)`). Descontar de novo soltaria reserva coberta pelo lote bom (a RN-228.04). Fica a régua de hoje, que só
  garante que o motor aceite o estorno.
- O `if (disp + total < qtd)` (a recusa do motor) **não muda**: se nem soltando tudo o estorno cabe, nada é tocado.

## Caminhos

- **(escolhido)** A conta acima dentro de `liberarParaEstorno`, com o motivo próprio quando o lote impedido pesou (B1507). Reverter = tirar
  um termo e uma literal.
- **(descartado)** Descontar `imp` sempre (sem olhar o lote da entrada): na RN-228.04 soltaria a reserva de R1 coberta pelo lote bom.
- **(descartado)** Simular o `imp` depois do estorno (refazer a conta de `loteImpedidoSql` sem as peças): a conta tem `max(0, …)` e o retido
  por lote; a simplificação "o lote da entrada impedido não mexe no que sai" dá o mesmo resultado sem duplicar a régua.

## Decisões (letra B — reversíveis; livres depois de **B1503**, **C533**, **A116**, conferido por `grep` em `docs` e `specs`)

- **B1504 — a conta.** Acima. `imp` e o predicado do lote lidos numa consulta só, com o mesmo `hoje` de Brasília. Descartado: descontar
  sempre (RN-228.04), simular o impedido depois (acima).
- **B1505 — sem teto no estornado.** Se outro lote **desta mesma nota** foi bloqueado depois da chegada, `livre` pode estar abaixo de zero
  e `falta` passa de `qtd`: o estorno solta também a reserva da nota que o lote bloqueado cobriria (RN-228.07). Só reservas **desta nota e
  deste material** (o filtro de hoje), de quem espera e não separou. Descartado: limitar a `qtd` ("só o que o estorno tira") — deixaria R1
  reservada sobre o lote bloqueado, o próprio C521.
- **B1506 — fora da trava, como hoje.** Soltar sem distribuir não pega a trava (B441). O lote pode mudar entre a leitura e a liberação
  (bloqueado ou liberado no meio): no pior caso solta de menos (R1 fica como hoje até alguém liberar à mão) ou de mais (R1 volta a esperar,
  e a liberação do lote — Etapa 220 — ou a próxima nota a atende de novo). Nenhum erro de estoque. Descartado: pegar a trava do material
  aqui — o motor pega a seção do efeito depois (`cancelarMovimentacao`), e a trava não é reentrante. **C534.**
- **B1507 — a fatia visível: o motivo da liberação.** Quando o lote impedido pesou (`falta` maior que a de hoje, `qtd − disp`), a reserva
  solta neste estorno ganha o motivo
  `Estorno da entrada do recebimento ⟨numero⟩ — o que sobra do material está em lote bloqueado, reprovado ou vencido`, que a tela
  **Reservas** mostra. Sem o lote impedido pesando, o motivo de hoje byte a byte. A linha do livro (`Liberação por estorno da entrada`) não
  muda. Descartado: frase nova na resposta do estorno (as chaves da resposta são contrato da 71, testadas).

### Fora (C novo)

- **C534** — o lote bloqueado ou liberado no exato instante do estorno pode fazer o estorno soltar de menos ou de mais (B1506).

## Regras de negócio

Montagem padrão (molde da RN-219.02): material **não crítico**, `controle_lote = 1`, `controle_certificado = 0`, unidade `PC`; 1 PC entra
manual em L1 e L1 é bloqueado pelo `PUT /lotes/:id/status` **antes** de R1 ser aprovada; a nota (`/recebimentos/:id/processar`) traz 3 em
L2 (ATIVO) e 4 em L1 (BLOQUEADO). O estorno é `POST /movimentacoes/:id/cancelar` da `ENTRADA_COMPRA` do item.

- **RN-228.01 — lote bom estornado, o resto só em lote bloqueado: solta.** R1 espera 6 → reserva 3 (`PARCIALMENTE_RESERVADA`). Estornar a
  entrada de L2 → **200**; a reserva de 3 de R1 vai a `LIBERADA` com o motivo da B1507; R1 no status de espera
  (`AGUARDANDO_ESTOQUE`/`AGUARDANDO_COMPRA`); físico 5, reservado 0. (Antes: reserva de 3 ATIVA, R1 `PARCIALMENTE_RESERVADA`.)
- **RN-228.02 — solta só o que o livre não cobre.** Como a .01, mais 1 PC manual em L0 (ATIVO, sem distribuir) **depois** da chegada. Estornar
  L2 → solta **2** dos 3 de R1 (fica 1, coberta pelo L0); motivo da B1507.
- **RN-228.03 — o resto em lote bom: não solta (como hoje).** Material com L1 **ATIVO** (sem o bloqueio); R1 espera 3 → reserva 3. Estornar
  L2 → 200, a reserva de 3 continua ATIVA, R1 `TOTALMENTE_RESERVADA`.
- **RN-228.04 — a entrada do próprio lote bloqueado: a régua de hoje.** Na montagem da .01, estornar a entrada de **L1** (4) → 200, a reserva
  de 3 de R1 (coberta por L2) continua ATIVA, R1 `PARCIALMENTE_RESERVADA`.
- **RN-228.05 — vencido conta; vencimento liberado não.** L1 ATIVO com validade ontem (Brasília) no lugar do bloqueio → como a .01 (solta);
  com `vencimento_liberado_em` preenchido → como a .03 (não solta).
- **RN-228.06 — sem controle de lote nada muda.** `controle_lote = 0`, a mesma nota (o lote L1 nasce/fica BLOQUEADO, mas o material não
  controla lote — B1371) → estornar L2 não solta.
- **RN-228.07 — o outro lote da mesma nota bloqueado depois (B1505).** Nota com 3 em L2 e 3 em L3 (ATIVOS); R1 espera 6 → reserva 6. L3 é
  bloqueado depois. Estornar L2 (3) → solta **6** (R1 sem reserva; nada sai). Controle: com L3 ATIVO, `disp = 0` e `imp = 0` → solta 3
  (a régua de hoje, para o motor aceitar) e R1 fica com 3, cobertas por L3.
- **RN-228.08 — o estorno que falha depois de soltar recria.** Na montagem da .01, o livro do `ESTORNO` forçado a falhar (gatilho
  `BEFORE INSERT … WHEN NEW.tipo = 'ESTORNO'`, molde da Fase 5 da 74) → a resposta é a falha original; a reserva de 3 de R1 é recriada
  (ATIVA, mesma requisição/item/quantidade/recebimento), R1 volta a `PARCIALMENTE_RESERVADA`, físico 8, a movimentação não cancelada.
- **RN-228.09 — integração: depois do estorno, liberar o lote atende R1.** Depois da .01, `PUT` L1 → ATIVO → a liberação do lote
  (Etapa 220) reserva para R1 o que pode (4 → R1 com 4 de 6, `PARCIALMENTE_RESERVADA`); a entrega/separação não é exercida aqui.
- **RN-228.10 — regressão.** Sem lote impedido nada muda: `recebimentoReservaChegadaEstorno`, `estornoQueFalha*`, `chegadaLoteImpedido`,
  `liberarLote*` e as suítes de lote impedido verdes **sem edição**.

## Contrato (congelado)

Sem rota nova, sem campo novo na resposta, sem migration. Muda por dentro:

- `reservaChegadaService.liberarParaEstorno(db, user, mov)` — mesma assinatura e mesmo retorno (a lista do que soltou). A conta da B1504.
- `motivo_liberacao` da reserva solta: literal da B1507 quando `falta > max(0, qtd − disp) + EPS`; senão
  `Estorno da entrada do recebimento ⟨numero⟩` (hoje). `motivoMovimentacao` sempre `Liberação por estorno da entrada`.
- As recusas do estorno **não mudam** (`Não é possível estornar: saldo disponível insuficiente (material já consumido)`,
  `Não é possível estornar: o material está reservado para requisições (…) — libere as reservas antes de estornar`, a do lote).
- A resposta do estorno continua `{ success, estorno_id, pedido_compra }`.

## Tasks

| T | Tipo | O quê | Depende |
|---|---|---|---|
| T0 | tronco | Testes vermelhos `server/tests/api/estornoLoteImpedido.api.test.js` (RN-228.01–.09) | — |
| T1 | tronco | a conta (B1504/B1505) e o motivo (B1507) em `liberarParaEstorno` | T0 |
| T2 | tronco | integração pela rota (.01 → .09 → .08) e regressão (.10) | T1 |

Sem galhos: um serviço só, em série na árvore principal. A tela não muda (o motivo já é mostrado).

### Controles positivos (um por vez; script no scratchpad: cópia, Edit, restauro por cópia e `cmp`)

1. sem o desconto (`livre = disp`) → .01, .02, .05, .07 vermelhas.
2. desconto sempre (sem olhar o lote da entrada) → .04 vermelha.
3. teto em `qtd` → .07 vermelha.
4. motivo de hoje sempre → .01/.02 (literal) vermelhas.
5. `hoje` fixo errado / sem o vencido → .05 vermelha.

## Pontos de atenção

- O `disp` é lido **depois** de soltar a reserva da OS (como hoje).
- `imp` e o lote numa consulta só (`FROM materiais_almoxarifado lim_me LEFT JOIN lotes_almoxarifado lim_le ON lim_le.id = ?`), o apelido
  próprio (o `loteImpedidoSql` usa subconsultas com apelidos `lim_*`; conferir que não colide).
- `mov.lote_id` nulo → o lote não está impedido (o sem-lote sai).
- A ordem das travas não muda: nada novo é pego aqui.

## Fase 2 — correções do revisor fresco (2026-11-13) — **MANDAM sobre o texto acima onde divergem**

Revisor fresco sobre `297c5bc5` (só leitura): **0 trava, 2 importantes, 4 menores**; números das RN-228.01/.02/.04/.07 conferidos à mão e
certos; a chegada faz **uma reserva por item da requisição** (o teto somado por material); a nota grava uma `ENTRADA_COMPRA` por item, com o
lote; a recriação por `criarReserva(sistema)` continua cabendo; nenhuma trava nova, nenhuma ordem violada.

1. **[IMP] A OS aberta (B1455).** A fila da OS reserva **sem** o desconto, de propósito, e essas reservas têm `recebimento_id`: nota com OS,
   3 em L2 + 4 em L1 bloqueado, requisição da OS com 2 e a reserva da OS com 5 → estornar L2 solta 3 da reserva da OS (`min`) e a conta nova
   tiraria os 2 da requisição da OS, deixando a reserva genérica da OS no bloqueado (prioridade invertida). **Decisão B1508:** nota com OS
   (do pedido ou da própria nota, aberta ou já fechada — `reservaDaOs.osDoRecebimento`) fica na régua de hoje. Teste **RN-228.11**.
2. **[IMP] RN-228.03, .05 b e .06 não montavam** (o 1 PC em L1 bom antes da aprovação fazia a aprovação reservar 1). A montagem passou a
   aprovar R1 **antes** do 1 PC manual (a entrada manual não distribui). Os números da .06 ficam "como hoje" (não solta).
3. **[MENOR] O `LEFT JOIN` do lote sem `IS NOT NULL`** daria a entrada sem lote como impedida — o código já tem `lim_le.id IS NOT NULL`.
   Teste novo **RN-228.12** (entrada sem lote: a nota exige o lote em material com controle, então a sem lote é a legada — o controle ligado
   depois da nota).
4. **[MENOR] RN-228.09: R1 fica com 5 de 6** (L1 tem 1 manual + 4 da nota), não 4. O teste já dizia 5.
5. **[MENOR] A conta é exata só sem os `max(0, …)` do `loteImpedidoSql` ativos.** Com peça em quarentena no lote bom estornado, ou o resto
   do material (bloqueada + terceiros − retido) cortando, o impedido cai menos (ou mais) do que `qtd` e o estorno solta um pouco de mais ou de
   menos. Raro; **D (228)**, ao lado do C534.
6. **[MENOR] B1505 e B1507.** Sem teto solta só reserva **desta nota** de quem espera: a reserva antiga da aprovação sobre o lote bloqueado
   depois continua (C522/B1456, anterior). O motivo é **por estorno**, não por reserva: quando o lote impedido pesou, até a parte que a régua
   de hoje também soltaria leva o texto novo. Registrado na B1507.

Literal da recusa do lote (contrato, não muda): `mensagemLoteNaoComportaEstorno(mov, saldo)` em `stockService.js`.

- **B1508 — nota com OS: a régua de hoje.** Acima. Descartado: descontar também na OS (inverte a prioridade); olhar só a OS **aberta**
  (`osAbertaDoRecebimento`): a OS fechada depois da chegada deixaria a requisição da OS perder a reserva no estorno.

## Execução

- [x] Fase 0.5 — estimativa `ffe7b233` (**4h**).
- [x] Fase 1 — este plano — `297c5bc5`. Fase 2 — bloco acima.
- [x] T0 — `server/tests/api/estornoLoteImpedido.api.test.js`: 6/11 vermelhos por número antes do código (os 5 verdes são as guardas: lote
  bom, o próprio lote impedido, vencimento liberado, sem controle de lote, o controle da .07). Com os testes da Fase 2: 13 cenários.
- [x] T1 — a conta (B1504/B1505), a OS (B1508) e o motivo (B1507) em `liberarParaEstorno`.
- [x] T2 — integração pela rota no mesmo arquivo (.01 → .09: estorno → liberar o lote → reserva de novo; .08: estorno que falha → recria).

### Controles positivos (script `e228-sabotagem.js` no scratchpad: cópia, âncora = 1, restauro por cópia, md5 igual)

| # | Sabotagem | Caiu |
|---|---|---|
| 1 | `livre = disp` (sem o desconto) | .01, .09, .02, .05 a, .07, .08, .12 |
| 2 | desconto sempre (sem olhar o lote da entrada) | .04 |
| 3 | teto no estornado | .07 |
| 4 | motivo de hoje sempre | .01, .09, .02, .05 a, .07, .12 |
| 5 | sem `lim_le.id IS NOT NULL` | .12 |
| 6 | sem a regra da OS | .11 |
| 7 | "hoje" errado | .05 a |
