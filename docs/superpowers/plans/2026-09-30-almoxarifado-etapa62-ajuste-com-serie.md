# Etapa 62 — ajuste de material com série diz quais séries entram ou saem (C82)

> Status: **Fase 0-1** (design + plano). Fecha o C82 aberto na Etapa 61.

## Fase 0 — medido com sonda (2026-09-30)

Material com `controle_serie`, entrada de 3 séries (S1–S3) num endereço. Pela rota v2:
- `AJUSTE` sem localização para **5** → **201**, físico 5, séries presentes **3** (quebra);
- `AJUSTE` com localização para **1** → **201**, físico 3 (o total recalculado), presentes 3 — o endereço
  ficou com 1 e as 3 séries continuam "lá";
- `AJUSTE_POSITIVO`, `AJUSTE_NEGATIVO`, `PERDA` → **400** "informe N serie(s)..." — esses **já** exigem.
- O buraco é o **AJUSTE de valor absoluto** (`AJUSTE`, `AJUSTE_INVENTARIO`): `serieObrigatoria` no motor
  só cobre `TIPOS_ENTRADA`/`TIPOS_SAIDA`.
- O fechamento do inventário (`PUT /conferencias/:id/concluir`, `routes/almoxarifado.js` ~1585) aplica
  `AJUSTE_INVENTARIO` sem `exigeSerie` — e não tem como saber QUAIS séries foram contadas.

## Regras de negócio

- **RN-01 (motor)** — `AJUSTE`/`AJUSTE_INVENTARIO` de material com série, quando o chamador declara
  `exigeSerie` (a v2 declara): diferença = novo − atual **no escopo do ajuste** (sem endereço: o físico do
  material; com endereço: a linha endereço+lote). Diferença > 0 → `series` (números novos, N = diferença,
  entram como a entrada: `entradaSeries` com o lote e o endereço); < 0 → `serie_ids` (presentes, N = −diferença,
  saem como **BAIXADA**); não inteira → recusa; zero → nada. Validado antes de qualquer efeito.
  Literal: `material com controle de serie: o ajuste {sobe|baixa} {d} unidade(s) — informe {d} serie(s) (recebidas {n})`.
- **RN-02 (inventário)** — o fechamento continua aplicando `AJUSTE_INVENTARIO` sem séries (não há como
  saber quais foram contadas), e **devolve** `series_a_regularizar: [{ material_id, codigo, fisico, presentes }]`
  dos materiais com série cuja contagem mudou; a tela mostra o aviso apontando para **Regularizar séries**
  (Etapa 61), cujos limites são exatamente a diferença. Decisão reversível (letra B).
- **RN-03 (tela de Movimentações)** — AJUSTE de material com série: mostra o valor atual do escopo e, pela
  diferença, pede os números (subir) ou as séries a baixar (descer).

## Tasks
- **T1 (tronco)** — motor + conclusão do inventário. Testes `server/tests/api/ajusteComSerie.api.test.js`:
  sobe com números → físico e presentes batem; desce com séries → BAIXADA; quantidade errada/zero/fracionária;
  com endereço (escopo da linha); sem declarar exigeSerie (chamador interno) = de hoje; inventário devolve
  `series_a_regularizar` e a regularização fecha.
- **T2 (galho, tela)** — RN-03 e o aviso do inventário.
- **T3** — verificação, Fase 5, fechamento.

## Fase 2 — revisão do plano: 2 críticos, 5 importantes, 3 menores → o desenho mudou

- **CRÍTICO 1** — o estorno do AJUSTE revertia só o físico: com séries, as criadas ficavam presentes e as
  baixadas ficavam BAIXADA. O livro não guarda com segurança QUAIS desfazer (uma entrada posterior reativa a
  BAIXADA e zera o vínculo). → **estorno de AJUSTE de material com série é recusado**; o caminho é um novo ajuste
  (letra B). Literal: `estorno de ajuste de material com serie recusado — faca um novo ajuste (ele pede as series)`.
- **CRÍTICO 2** — com endereço, a "diferença da linha" não é o que o físico do material muda (absorção dos
  negativos, legado). → **AJUSTE por endereço de material com série é recusado**:
  `material com controle de serie: ajuste por endereco nao e suportado — ajuste o total do material (sem endereco)`.
- **IMPORTANTE** — a conta é `novo − presentes` (não `novo − físico`): fecha o legado divergente e o
  fracionário (a B243 mandava "acertar o físico pelo ajuste" e a regra antiga recusava 0,5); o novo total tem
  de ser inteiro.
- **IMPORTANTE** — BAIXADA vira destino do claim para AJUSTE; série BLOQUEADA não é baixada pelo ajuste
  (desbloqueie antes — declarado).
- **IMPORTANTE** — inventário: contagem fracionária de material com série recusada na pré-validação
  (`{codigo}: material com controle de serie exige contagem inteira`); `series_a_regularizar` pelo critério
  `presentes ≠ físico depois do ajuste`.
- **IMPORTANTE** — T1 e T2 no mesmo push (a tela atual e o modal da v1 passam a receber 400).
- Menores: lote (as séries novas herdam o lote informado; a descida sem lote aceita qualquer lote); literal
  para "diferença zero com séries informadas"; a validação roda antes de `assertAjustePermitido` (que audita).
