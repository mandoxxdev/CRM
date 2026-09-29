# Plano — Etapa 45: a devolução ao fornecedor, e o encaminhamento com status

> **Design:** `docs/superpowers/specs/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor-design.md`
> **Paga:** o **último** item de "falta para 🟢" da feature 09, o item desmarcado da feature 12, e
> o corte declarado da Etapa 44 (**B174**).
> **Fase 0:** medida em 2026-09-28 (F0-1..F0-6, commit `d187cf7`).
> **Fase 2:** revisor fresco, **13 achados, 5 CRITICAL** — este plano é a versão **corrigida** por
> eles; o que mudou está na seção final.
>
> **Linha de base:** `test:api` **208/208 arquivos** · almoxarifado **42/0** · validation **4/0** ·
> safealter **3/0** · sqlite **5/0** · cliente **52 suítes / 817 testes** · build compilado.

---

## Regras de negócio

Enunciados completos na seção 3 do design, e a **precedência de 10 níveis** é contrato — sem ela,
mais de um caso casa duas regras com mensagens diferentes.

`RN-01` estado de execução · `RN-02` gesto posterior · `RN-03` `DEVOLVER` baixa do bloqueado ·
`RN-04` as outras três não movem · `RN-05` idempotência em **dois** níveis (inspeção + NC) ·
`RN-06` **só NC automática de inspeção baixa saldo** · `RN-07` só NC decidida ·
`RN-08` o cartão exclui o executado **opt-in** · `RN-09` rastro no livro · `RN-10` não estornável ·
`RN-11` três estados conhecidos registram sem mover · `RN-12` lote resolvido · `RN-13` série recusa.

## Sort topológico

| Task | O quê | Tipo |
|---|---|---|
| **T1** | `DEVOLUCAO_FORNECEDOR` no motor: tipo **dedicado**, guarda, claim e compensação | **tronco** |
| **T2** | Ação, colunas de execução (NC **e inspeção**) e `registrarExecucao` | **tronco** |
| **T3** | Rota `POST /:id/executar` + projeção e filtro da listagem | **galho** |
| **T4** | A tela: coluna, filtro e botão | **galho** |
| **T5** | O cartão de reprovados exclui o devolvido — **opt-in** | **galho** |
| **T6** | Integração ponta a ponta | **tronco** |

T1 é tronco sozinho e primeiro (mexe no motor). T2 depende dele. Despachar galhos em lote de no
máximo dois.

---

## T1 — tronco: o tipo de movimento

**Arquivos:** `schema.js` (`TIPOS_MOVIMENTO` **e `TIPOS_DEDICADOS`**), `schemas.js`
(`CAMINHO_TIPO_DEDICADO`), `movementTypes.js` (`TIPOS_SAIDA`), `ownerRules.js`, `stockService.js`,
`movementRules.js`, `server/tests/api/devolucaoFornecedorMotor.api.test.js` (novo).

1. `DEVOLUCAO_FORNECEDOR` em `TIPOS_MOVIMENTO`, **ao lado de `DEVOLUCAO_CLIENTE`**, com o
   comentário dizendo que são irmãs e que as duas são **direção oposta** à devolução da Etapa 7 —
   o código já chama isso de *"a confusão mais provável de quem ler este código depois"*.
2. **`TIPOS_DEDICADOS` (`schema.js:126-135`) — é ISTO que o tira da rota genérica.** ⚠️ A versão
   anterior deste plano mandava deixá-lo *"fora de `TIPOS_MOVIMENTO_ROTA`"*, que é **derivada por
   `filter`** (`schemas.js:58`): não há lista a editar, e o tipo entraria **aberto por default**.
3. Entrada em **`CAMINHO_TIPO_DEDICADO`** (`schemas.js:71`) apontando a tela de Não Conformidades.
   Sem ela a recusa manda o operador para *"as telas de Reservas e Inspeções"* — e `schemas.js:69`
   avisa que **o manual cita estas mensagens literalmente**.
4. `movementTypes.TIPOS_SAIDA` (`:56`) — *"quem criar um tipo novo acrescenta **AQUI, e só aqui**"*.
   ⚠️ **E decidir, por escrito, o efeito derivado:** `clienteEstoqueService.TIPOS_CONSUMO` (`:43`)
   é `TIPOS_SAIDA` menos `DEVOLUCAO_CLIENTE`, então material **de cliente** devolvido ao fornecedor
   passaria a contar como *consumido* na posição dele. **Registrar na letra B.**
5. `ownerRules.js:75-82` — o arquivo **avisa em maiúsculas** que quem cria tipo de saída tem de
   decidir se ele entra em `TIPOS_SAIDA_COM_DONO` ou em `TIPOS_ISENTOS_DONO`. **Decisão: isento**,
   com a razão escrita — o material reprovado volta para quem o entregou; não é aplicá-lo em
   trabalho de ninguém. Omitir seria cair fora por acidente.
6. Flag `baixandoBloqueado`, espelhando `baixandoTerceiro` (`stockService.js:598`).
7. Claim atômico com as **duas** condições no `WHERE` (`quantidade_bloqueada >= ?` **e**
   `quantidade_atual >= ?`), molde de `PERDA_TERCEIRO`. A recusa **diz o número** (lição da Etapa 7,
   escrita na literal do `RETORNO_TERCEIRO`).
8. **Compensação: ramo novo em `reverterFisicoDaSaida` (`stockService.js:999`)**, espelho do de
   `baixandoTerceiro` (`:1085`). ⚠️ **`retencaoAplicada` fica `null` para este tipo** — a versão
   anterior deste plano pedia os dois, e eles são **mutuamente exclusivos**: juntos compensam **em
   dobro** (bloqueada volta a 6 para uma reprovação de 3).
9. `movementRules`: `{ vinculo: 'nenhum', justificativa: true }`.
10. Recusa de estorno em `cancelarMovimentacao`, casando por **`tipo`** — mais forte que casar por
    motivo, como a RN-12 da 44 teve de fazer por o tipo dela não ser dedicado.
11. `tiposDescarte` (`stockService.js:775`): entra, senão lote **vencido** trava a devolução do
    próprio lote vencido — beco que a Etapa 7 já pagou. **Mas continua sujeito à guarda de status
    do lote.**

**Cenários:** baixa tira dos dois lugares · bloqueado insuficiente recusa **com o número** ·
físico insuficiente recusa · a guarda *"Material bloqueado não pode ser utilizado"* **não** barra
este tipo **e continua barrando `SAIDA_PRODUCAO`** (metade positiva) · **a v2 recusa o tipo e a
mensagem nomeia a tela de Não Conformidades** · estorno recusado · **falha depois do claim: o
estado volta ao ANTERIOR, com igualdade exata** (`atual === 100 && bloqueada === 3`, nunca `>=` —
senão a compensação dupla passa verde) · material de cliente não vira "consumido".

## T2 — tronco: o estado de execução

**Arquivos:** `permissions.js`, `schema.js`, `nonConformityService.js`, `auditLabels.js`,
`server/tests/api/encaminhamentoExecucao.api.test.js` (novo).

1. Ação `executar_encaminhamento: [ADMINISTRADOR, QUALIDADE, COMPRAS]`, com o comentário dizendo
   que **a concessão a COMPRAS é condicionada à RN-06** — sem ela, `registrar_nao_conformidade` +
   esta ação dariam a Compras meia porta para apagar estoque.
2. Colunas na NC: `execucao_estado`, `execucao_em`, `execucao_por_id`, `execucao_por_nome`,
   `execucao_observacoes`, `execucao_movimentacao_id`.
3. **Coluna na INSPEÇÃO: `devolucao_fornecedor_em`** (molde de `liberacao_nc_em`) — é a trava que
   impede duas NCs da mesma inspeção baixarem o mesmo material duas vezes. ⚠️ A versão anterior
   punha a trava só na NC, contra o que a spec 09 **já tinha escrito com a razão**.
4. Backfill do `execucao_estado` nas NCs já decididas (`PENDENTE` quando a decisão pedir), com
   comentário explicando por que é o **oposto** do backfill da 44 — senão parece incoerência.
5. `registrarExecucao` com a precedência de 10 níveis e a ordem da seção 4 do design da 44:
   resolver e calcular → claim da inspeção → motor → rollback do claim se o motor falhar.
6. Rótulo `NC_EXECUTADA` em `auditLabels.js` — sem ele `auditLabels.api.test.js` **derruba a suíte**.

**Cenários:** os sete efeitos da tabela · 409 na segunda execução · 400 em NC aberta e cancelada ·
400 na decisão de aceitação · **RN-06: NC manual e NC de origem RECEBIMENTO não baixam saldo** ·
**RN-05: duas NCs de tipos diferentes da MESMA inspeção — a segunda não move saldo** · os três
estados da RN-11 · RN-12 (lote resolvido; e sem lote resolvível recusa) · RN-13 (série recusa) ·
rollback quando o motor falha · trilha com o verbo novo · a movimentação com número e motivo.

## T3 — galho: a rota e a fila

`POST /:id/executar`; `execucao_estado`/`execucao_em` na projeção; filtro `?execucao=PENDENTE`.

**Cenários:** matriz de perfis **inteira** — ⚠️ **a linha que importa é COMPRAS PODE**, porque é
ela que distingue esta ação de `decidir_nao_conformidade`; sem ela o teste passaria com a ação
pendurada na outra · **COMPRAS executando NC manual recebe 200 com `NENHUMA` e o saldo não se
move** (é a linha que prova que a B169 continua valendo) · 403 não move saldo · o filtro traz o
pendente **e não traz** o executado, **nem NC `ABERTA`, nem `CANCELADA`**.

## T4 — galho: a tela

Coluna **Execução**, filtro *Pendentes de execução*, botão **Registrar execução**.

⚠️ **ARMADILHA NOMEADA:** o cenário `(21)` (`NaoConformidadesAlmoxarifado.test.js:536-537`) tem
duas asserções **negativas** que a Etapa 44 deixou para o C57 não voltar. A redação natural do
texto novo (*"o material continua bloqueado até a execução"*) **derruba** a asserção. **Mantenha as
duas negativas e escreva sem essas palavras** (*"segue retido até a execução ser registrada"*).
Apagar a negativa para o teste passar desfaz a proteção da etapa anterior.

## T5 — galho: o cartão de reprovados

⚠️ **Esta task foi REESCRITA — a premissa dela era falsa.** O cartão **não** cobra para sempre
(janela de 7 dias) e o e-mail **já saiu** no instante da reprovação (dedupe por inspeção). Ver F0-4.

1. Flag **`excluirComExecucao` opt-in** em `listarReprovados`, ligada **só** no `listar` da entrada
   do cartão — **nunca** no modo `{ inspecaoId }`, que é o **gancho do ato**. Excluir por dentro
   calaria o gancho a partir da segunda escrita: erro **medido** na Etapa 43
   (`alertRegistry.js:415-425`).
2. A régua casa **só** NC com `execucao_estado = 'EXECUTADA'` **e** `decisao = 'DEVOLVER'`.

**Cenários:** o devolvido sai **e o pendente continua** · **o gancho do ato continua avisando no
modo `{inspecaoId}`** · **execução de `SUBSTITUICAO` NÃO silencia o cartão** (ela não devolve nada).

## T6 — tronco: integração

Receber crítico → reprovar com `DEVOLVER` → a NC nasce → decidir → **conferir que o material NÃO
saiu** (é a RN-02, e é o que distingue esta etapa da 44) → registrar execução com **COMPRAS real**
→ o material sai do físico **e** do bloqueado, a linha do **lote** é debitada e a de lote `NULL`
não fica negativa → o cartão para de cobrar → o pedido de compra **continua Recebido** (corte
declarado, fixado por teste).

---

## Fase 5 — o que a revisão adversarial tem de atacar

1. A flag `baixandoBloqueado` desliga duas guardas — algum outro caminho a alcança?
2. A precedência de 10 níveis: algum caso casa duas regras, ou nenhuma?
3. "Este teste passaria com a feature quebrada?" — em especial os cenários da RN-05, RN-06 e T5.
4. O backfill oposto ao da 44 cria fila retroativa **zerável**?

---

## O que a Fase 2 mudou neste plano

| # | O que eu tinha escrito | Por que estava errado |
|---|---|---|
| 1 | *"fora de `TIPOS_MOVIMENTO_ROTA`"* | a lista é **derivada**; o opt-out é `TIPOS_DEDICADOS`, e o default é **aberto** |
| 2 | `retencaoAplicada` **e** claim no `try` | **mutuamente exclusivos** — juntos compensam em dobro |
| 3 | trava de idempotência na NC | a spec 09 **já escrevera** que tem de ser na inspeção, com a razão |
| 4 | (nada) | faltava a irmã da RN-09 da 44 — NC manual baixaria **patrimônio** |
| 5 | *"o cartão cobra para sempre"* | **falso**: janela de 7 dias, e-mail já saiu, e a exclusão calaria o gancho do ato |
| 6 | (nada) | lote e série não eram citados uma vez — saldo de lote `NULL` negativo e invariante de série quebrado |
| 7 | 3 arquivos | faltavam `movementTypes`, `ownerRules` e `schemas`, e um efeito derivado em material de cliente |
| 8 | 4 literais | faltavam as de origem `RECEBIMENTO` (o caso **mais comum**) e de físico insuficiente |

---

## Estado

- [ ] T1 — tronco (motor)
- [ ] T2 — tronco (estado de execução)
- [ ] T3 / T4 / T5 — galhos
- [ ] T6 — integração
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa`
