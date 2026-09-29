# Plano — Etapa 45: a devolução ao fornecedor, e o encaminhamento com status

> **Design:** `docs/superpowers/specs/2026-09-28-almoxarifado-etapa45-devolucao-ao-fornecedor-design.md`
> **Paga:** o **último** item de "falta para 🟢" da feature 09, o item desmarcado da feature 12, e
> o corte declarado da Etapa 44 (**B174**).
> **Fase 0:** medida em 2026-09-28 (F0-1..F0-5 do design, commit `d187cf7`).
>
> **Linha de base medida antes de tocar em código:** `test:api` **208/208 arquivos** ·
> almoxarifado **42/0** · validation **4/0** · safealter **3/0** · sqlite **5/0** ·
> cliente **52 suítes / 817 testes** · build compilado.

---

## Regras de negócio

Enunciados completos na seção 3 do design. `RN-01` estado de execução · `RN-02` gesto próprio e
posterior · `RN-03` `DEVOLVER` baixa do bloqueado · `RN-04` as outras três não movem estoque ·
`RN-05` idempotente por claim · `RN-06` fatal, **exceto** nos estados conhecidos ·
`RN-07` só NC decidida · `RN-08` o alerta para de cobrar · `RN-09` rastro no livro ·
`RN-10` não estornável.

## Sort topológico

| Task | O quê | Tipo |
|---|---|---|
| **T1** | `DEVOLUCAO_FORNECEDOR` no motor: tipo, guarda e claim atômico | **tronco** |
| **T2** | Ação `executar_encaminhamento` + colunas de execução + `registrarExecucao` | **tronco** |
| **T3** | Rota `POST /:id/executar` + a projeção e o filtro da listagem | **galho** |
| **T4** | A tela: coluna, filtro e botão | **galho** |
| **T5** | O alerta para de cobrar o executado | **galho** |
| **T6** | Integração: reprovar → decidir devolver → executar → o material sai | **tronco** |

T1 é tronco **sozinho e primeiro**: mexe no motor de estoque, que todo o resto usa. T2 depende de
T1. T3, T4 e T5 consomem contratos congelados na seção 5 do design e são independentes entre si —
**despachar em lote de no máximo dois**, regra que vem valendo.

---

## T1 — tronco: o tipo de movimento

**Arquivos:** `server/services/almoxarifado/schema.js` (`TIPOS_MOVIMENTO`),
`server/services/almoxarifado/stockService.js`, `server/services/almoxarifado/movementRules.js`,
`server/tests/api/devolucaoFornecedorMotor.api.test.js` (novo).

1. `DEVOLUCAO_FORNECEDOR` em `TIPOS_MOVIMENTO`, com o comentário **ao lado de `DEVOLUCAO_CLIENTE`**
   dizendo que são irmãs e que as duas são **direção oposta** à devolução da Etapa 7 — o próprio
   código já chama isso de *"a confusão mais provável de quem ler este código depois"*.
2. Entra em `tiposSaida` e ganha a flag `baixandoBloqueado`, espelhando `baixandoTerceiro`
   (`stockService.js:598`): desliga a guarda do disponível **e** a de material bloqueado, porque a
   quantidade que ela baixa está justamente no bloqueado.
3. Claim atômico com as **duas** condições no `WHERE`, molde de `PERDA_TERCEIRO`:
   `quantidade_bloqueada >= ?` **e** `quantidade_atual >= ?`. Recusa com literal própria — e a
   mensagem **diz o número**, como a do `RETORNO_TERCEIRO` (*"lição da Etapa 7"*, escrita lá).
4. `movementRules`: `{ vinculo: 'nenhum', justificativa: true }`.
5. **Fora de `TIPOS_MOVIMENTO_ROTA`**, como os tipos de retenção: a rota genérica `/movimentacoes/v2`
   não pode criar devolução ao fornecedor por fora do documento — é o mesmo furo que a Etapa 5
   fechou (*"o gate das rotas específicas não é decorativo"*).
6. **Não estornável** (RN-10): entra na lista de recusa de `cancelarMovimentacao`.
7. `retencaoAplicada` também nele — a compensação que a Etapa 44 acrescentou ao motor.

**Cenários:** baixa de bloqueado tira dos dois lugares · bloqueado insuficiente recusa com o número
· físico insuficiente recusa · a guarda de "material bloqueado não pode ser utilizado" **não**
barra este tipo (e **continua barrando** `SAIDA_PRODUCAO`, a metade positiva) · v2 recusa o tipo ·
estorno recusado · falha depois do claim devolve as duas colunas.

## T2 — tronco: o estado de execução

**Arquivos:** `permissions.js`, `schema.js`, `nonConformityService.js`,
`server/tests/api/encaminhamentoExecucao.api.test.js` (novo).

1. Ação `executar_encaminhamento: [ADMINISTRADOR, QUALIDADE, COMPRAS]` — com o comentário
   explicando por que Compras **entra** aqui e continua fora de `decidir_nao_conformidade`.
2. Colunas em `nao_conformidades_almoxarifado`: `execucao_estado TEXT`, `execucao_em DATETIME`,
   `execucao_por_id`, `execucao_por_nome`, `execucao_observacoes`, `execucao_movimentacao_id`.
3. `decidirNaoConformidade` passa a gravar `execucao_estado` pela RN-01.
   ⚠️ **Backfill das NCs já decididas:** elas nascem `PENDENTE` se a decisão pedir execução —
   **o oposto do backfill da 44**, e de propósito (seção 7 do design). O comentário tem de dizer
   isso, senão parece incoerência com a etapa anterior.
4. `registrarExecucao(db, user, ncId, dados)` com a ordem da seção 4 do design da 44, já revisada
   duas vezes: resolver e calcular efeito → **claim de `execucao_em`** → motor → rollback do claim
   se o motor falhar.
5. Rótulo `NC_EXECUTADA` em `auditLabels.js` — a guarda de `auditLabels.api.test.js` **derruba a
   suíte** sem ele.

**Cenários:** os quatro efeitos · 409 na segunda execução · 400 em NC aberta e em cancelada · 400
na decisão de aceitação · os dois estados conhecidos da RN-06 · rollback quando o motor falha ·
trilha com o verbo novo · a movimentação com `documento_vinculado` e o motivo.

## T3 — galho: a rota e a fila

`POST /:id/executar` com o gate novo; `execucao_estado`/`execucao_em` na projeção da listagem e
filtro `?execucao=PENDENTE`. Cenários de rota: a matriz de perfis **inteira** (Compras **pode**, e
essa é a linha que distingue esta ação de `decidir_nao_conformidade` — sem ela o teste passaria com
a ação pendurada na outra), 403 não move saldo, e o filtro trazendo o que tem **e não trazendo** o
que não tem.

## T4 — galho: a tela

Coluna **Execução**, filtro *Pendentes de execução*, botão **Registrar execução**. ⚠️ **O parágrafo
do modal de decisão muda** — o cenário `(21)` o prende, e mudá-lo sem atualizar o cenário quebra a
suíte **de propósito**.

## T5 — galho: o alerta para de cobrar

O cartão que hoje mostra *"Encaminhamento: DEVOLVER"* para sempre passa a excluir o que tem
execução registrada. **Cenário obrigatório com a metade positiva:** o executado sai **e** o
pendente continua — a Etapa 43 mediu que uma exclusão mal desenhada **silencia** o aviso inteiro.

## T6 — tronco: integração

Fluxo pela rota: receber crítico → reprovar com encaminhamento `DEVOLVER` → a NC nasce → decidir
`DEVOLVER` → **conferir que o material NÃO saiu** (é a RN-02, e é o que distingue esta etapa da 44)
→ registrar a execução com um usuário **COMPRAS real** → o material sai do físico e do bloqueado →
o cartão para de cobrar.

---

## Fase 2 — o que o revisor fresco tem de atacar

1. **A flag `baixandoBloqueado` desliga DUAS guardas.** Ela abre buraco para algum outro tipo, ou
   para este tipo em algum caminho que não seja o documento?
2. **A RN-02 (não executar na decisão) sobrevive a todos os gestos?** Existe caminho em que decidir
   já mexe no saldo por outra porta?
3. **Cada RN traçada até o último gesto:** depois de `DEVOLUCAO_FORNECEDOR`, o item de recebimento
   continua coerente? O pedido de compra fecha? A conta a pagar? O lote?
4. **A ação nova é defensável**, ou Compras ganha por ela um caminho para mexer em saldo que a
   B169 pretendia negar?
5. **O backfill oposto ao da 44** é a escolha certa, ou cria uma fila retroativa impossível de
   zerar?

---

## Estado

- [ ] T1 — tronco (motor)
- [ ] T2 — tronco (estado de execução)
- [ ] T3 / T4 / T5 — galhos
- [ ] T6 — integração
- [ ] Fase 5 — revisão adversarial
- [ ] Fase 6 — `fechar-etapa`
