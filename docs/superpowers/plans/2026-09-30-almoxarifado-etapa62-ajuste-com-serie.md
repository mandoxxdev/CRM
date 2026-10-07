# Etapa 62 — ajuste de material com série diz quais séries entram ou saem (C82)

> Status: **FECHADA** (2026-09-30) — T1 `327703d`, T2 `b242545`, fix-round da Fase 5 `1080491`, documentação no
> commit de fechamento. Fecha o C82 aberto na Etapa 61.

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

> ⚠️ **As RN-01 e RN-03 abaixo estão SUPERADAS pela Fase 2** (seção seguinte): o escopo "com endereço" foi
> **recusado**, a diferença passou a ser **novo − presentes** e a literal mudou. Mantidas à vista para quem ler a
> decisão original.

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
- [x] **T1 (tronco)** — `327703d` — motor + conclusão do inventário. Testes `server/tests/api/ajusteComSerie.api.test.js`:
  sobe com números → físico e presentes batem; desce com séries → BAIXADA; quantidade errada/zero/fracionária;
  com endereço (escopo da linha); sem declarar exigeSerie (chamador interno) = de hoje; inventário devolve
  `series_a_regularizar` e a regularização fecha.
- [x] **T2 (galho, tela)** — `b242545` — RN-03 e o aviso do inventário.
- [x] **T3** — verificação, Fase 5 (fix-round `1080491`), fechamento.

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

## Divergências da execução em relação ao plano

- **T1:** o plano original (RN-01) previa ajuste **com endereço** pelo escopo da linha e a diferença pelo físico —
  derrubado na Fase 2 (acima). A literal virou `o ajuste {sobe|baixa} N serie(s) (fisico novo X, series presentes P) — informe N serie(s) (recebidas n)`.
  A conclusão do inventário ganhou a recusa de contagem fracionária (não estava no plano; veio da Fase 2).
- **T2 (executor):** as séries presentes são buscadas em **duas** chamadas (`?status=EM_ESTOQUE` e `?status=BLOQUEADA` —
  o endpoint aceita um status por vez); confirmar **e o Enter** travados até o contador bater; o aviso do inventário é
  fixo (não toast) com link por material para Lotes e Séries, aba Séries. **Ficou de fora:** o botão de estorno no livro
  continua aparecendo para AJUSTE de material com série (o servidor recusa) — letra D. A primeira versão da tela
  liberava total 0 no ajuste com série — **errado**: o schema da v2 já recusava AJUSTE 0 sem endereço; corrigido no
  fix-round (dica *"Para zerar, use Ajuste negativo com as séries."*).

## Fase 5 — revisão adversarial do código (0 crítico)

| # | Achado | Gravidade | Destino |
|---|---|---|---|
| 1 | **Corrida:** físico gravado como valor absoluto e séries pela diferença — duas abas lendo as mesmas presentes deixavam físico 4, presentes 6 | Importante (quase crítico) | Corrigido: SET condicional (`WHERE (SELECT COUNT presentes) = novo`), senão 409 e o catch desfaz as séries; teste concorrente estável em 2 rodadas |
| 2 | O comentário prometia que o catch amplo compensava — ele desfazia as séries mas não o físico | Importante | Corrigido: o catch restaura o físico (`ajusteSerieFisicoAnterior`) |
| 3 | Link do aviso do inventário com `<a href>` recarregava a página e o aviso sumia | Importante (UX) | Corrigido: nova aba |
| 4 | Número já presente: a recusa vinha do `entradaSeries`, depois da auditoria do ajuste de material de cliente (auditoria órfã) | Menor | Corrigido: recusa na validação; teste conta a auditoria |
| 5 | AJUSTE para −2 respondia "informe 5 serie(s)" | Menor | A 1ª validação do motor já recusa negativo antes; guarda mantida como segunda barreira (declarado) |
| 6 | Presentes todas BLOQUEADA: o ajuste para baixo é impossível | Menor | Declarado (D) |
| 7 | Ramo `AJUSTE_INVENTARIO → BAIXADA` no claim não é alcançado | Menor | Declarado |
| 8 | Estorno recusado inclui AJUSTE antigo | Menor | Aceito (B246) |
| 9 | Tela: sem recarga se as presentes mudarem; busca que falha travava em "Carregando..." | Menor | Corrigido: recarga após erro do servidor e "Tentar de novo" |

Testes que faltavam e entraram: corrida, número já presente (com a auditoria), reuso de série BAIXADA pelo ajuste, a
metade negativa do inventário (material sem divergência fora de `series_a_regularizar`), total 0 e busca que falha na
tela. Sabotagens do fix-round: SET incondicional (corrida vermelha nas 2 rodadas), sem o pré-check de duplicado
(auditoria órfã vermelha), mais as 4 da tela.

**Números medidos no fechamento:** `ajusteComSerie.api.test.js` 11/11; api 239/239, almoxarifado 42/42, validation 4/4,
safealter 3/3, sqlite 5/5; cliente 1002/1002; build limpo (números do fix-round, medidos antes do commit `1080491`).

## Retro (4 números)

- **Rodadas de correção até verde:** 1 fix-round (servidor e tela).
- **Achados:** Fase 2 — 10 (2 críticos) que mudaram o desenho (estorno recusado; por endereço recusado; novo −
  presentes). Fase 5 — 1 quase-crítico + 3 importantes + 4 menores corrigidos ou declarados, **0 ruído**.
- **Paralelismo:** a tela rodou depois do tronco commitado; T1 e T2 no mesmo push (a tela atual passaria a receber 400).
- **Defeito que escapou da Etapa 61:** nenhum conhecido. Lição desta: um teste que **passa por coincidência** (a
  literal do pré-check e a do `entradaSeries` eram iguais) só se separa por um efeito colateral — aqui, a auditoria.

## Próxima tarefa detalhada — Etapa 63: a substituição de lote com registro (feature 05)

**Por que esta.** No "falta para 🟢" da 05 sobram: lista de separação como entidade, rota de picking, **substituição de
lote com registro**, kits (exigem estender `TIPOS_LOCALIZACAO`) e a tela de fila. A substituição é a menor e a que
aproveita o que as Etapas 58–61 deixaram: a separação registra a **origem planejada** (endereço + lote, Etapa 59) e a
entrega pode sair de **outro** par — hoje isso acontece **calado** (o payload vence a planejada, B235), sem registro de
que o lote separado não foi o entregue.

**Fase 0 da 63 — medir antes de prometer:**
1. Quando a entrega sai de um par (endereço, lote) **diferente** da planejada, o que fica gravado? (`movimentacoes` tem o
   lote da saída; o item tem `origem_separacao_id`/`lote_separacao_id` — some depois da entrega total, RN-04 da 59.) Há
   hoje algum registro de "substituição"?
2. O que a spec 05 entende por "substituição de lote com registro": trocar o lote **na separação** (outra rodada com
   outro lote → hoje vira planejada nula, "mista") ou **na entrega** (sair de outro lote)? Provavelmente os dois; decidir
   e registrar na letra B.
3. Motivo: obrigatório ou opcional? (A Etapa 60 escolheu **opcional** para a divergência — B238.) Série: trocar a série
   escolhida conta como substituição?
4. Quem lê: o detalhe da requisição, a auditoria, o relatório de rastreabilidade do lote (feature 10).
5. **Contratos que não se reabrem:** `checarOrigemItem` (58/59), a planejada e `origem_automatica` (59), o registro de
   divergência (60), as séries na entrega (61).

**Pontos de atenção.** Não recusar o que hoje passa (trocar de lote na entrega é legítimo — o lote planejado pode ter
vencido ou sido bloqueado); o registro é aditivo. Testar a metade positiva: sair do lote planejado **não** gera
substituição.
