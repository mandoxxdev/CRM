# Almoxarifado — Etapa 117: a devolução estornada deixa de contar, e o livro do estorno entra na trava (plano)

> Origem: "Próxima tarefa detalhada — Etapa 117" do plano da 116 (**C236**, **C235**). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa117-devolucao-viva-e-livro-do-estorno-na-trava-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B758**,
> último C **C236**, última A **A64**. Esta etapa: **B759+**, **C237+**, **A65+**. Worktree `CRM-wt-e117`, branch
> `etapa-e117` (a partir da main `a562ec39`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a revisão fresca do plano achou 7 pontos — 2 Critical, 2 Important, 3 Minor, todos
> medidos por sonda. **R1** (Critical) — com série, o estorno da entrada da devolução marcava as séries *Estornada* sem vínculo:
> com a devolução "morta" (RN-01), a lista oferecia 2 sem séries (a tela trava em *"Nenhuma série em aberto"*), **excluir a
> requisição entrava sem série** (invariante quebrado para sempre — regressão que esta etapa teria criado) e o estorno da saída
> recusava dizendo que as séries reentraram → **RN-07** nova: as séries voltam a *Entregue* na saída citada. **R2** (Critical) —
> a Entrada v2 aceita `ENTRADA_DEVOLUCAO` com referência livre: uma entrada digitada com `DEV-<id>` e estornada matava a
> devolução (o furo já existia no estorno da saída desde a 116: físico 12 com 10 de verdade) → **RN-08**: identidade = a
> primeira `ENTRADA_DEVOLUCAO` da referência, do mesmo material. **R3** (Important) — a régua lia o claim provisório
> (`cancelado = 1` volta a 0 se o estorno falha): o estorno da saída no meio de um estorno da entrada que falhava passava (físico
> 7, 5/5) → **RN-09**: só o estorno concluído (`movimento_estorno_id` gravado) mata; o mesmo na perna SUCATA da RN-05. **R4**
> (Important) — a RN-06 tem de cobrir qualquer falha depois do crédito (linha de saldo, séries), não só o livro, e o vínculo que
> falha depois do `INSERT` deixava uma linha `ESTORNO` órfã → coberto na T3 (o `try` cobre a seção inteira; a linha sai de novo).
> **R5** (Minor) — a T4 (iii) estava mal definida → reescrita com a literal. **R6** (Minor) — a RN-01 torna a C239 repetível
> (cada volta devolver para QUARENTENA → estornar a entrada acumula bloqueio) → declarado na C239 e preso por teste. **R7**
> (Minor) — a E1 com série (a guarda de série de sempre vem antes) e a devolução para SUCATA parcial (sem a perna: a entrada
> estorna) → dois cenários. Nenhuma porta que conta devoluções ficou de fora (as sete consultas da tabela; o custo por projeto
> soma o livro e já é "vivo" por construção).

## Regras de negócio

"Devolução viva" = a linha de `devolucoes_material_almoxarifado` cuja `ENTRADA_DEVOLUCAO` — a **primeira** com a referência
`DEV-<id>`, do mesmo material (RN-08) — **não** teve o estorno **concluído** (`cancelado = 1` e `movimento_estorno_id` gravado,
RN-09). A legada (sem a referência) e a de RETRABALHO (sem entrada) são sempre vivas.

- **RN-01 — a validação da devolução conta só a viva (C236).** `POST /devolucoes` com `movimentacao_saida_id`: o "restante" é
  `quantidade da saída − SUM(devoluções vivas)`. *Cenários:* Entrada 5 → Saída 2 → devolução 2 → estorno da entrada (físico 3) →
  devolver 2 de novo → **201**, físico 5; devolver 3 → 400 *"Devolução acima do entregue: a saída ⟨id⟩ entregou 2, já foram
  devolvidos 0 e restam 2"*; com duas devoluções de 1, uma estornada → restam 1.
- **RN-02 — a gravação confere a mesma conta (C236).** O `INSERT … WHERE EXISTS` soma só as vivas — senão a validação
  passaria e a gravação recusaria (*"A saída ⟨id⟩ mudou enquanto a devolução era gravada"*). *Cenário:* o de RN-01 pela rota
  (o 201 só sai se as duas concordam); duas devoluções simultâneas de 2 depois do estorno da entrada → uma passa (físico 5).
- **RN-03 — a tela oferece o mesmo número (C236).** `GET /devolucoes/saidas-elegiveis`: `quantidade_devolvida` soma só as
  vivas; `saldo_devolvivel` = quantidade − isso. *Cenário:* depois do estorno da entrada → `saldo_devolvivel` 2, e devolver
  esse número passa (o teste lê o número da lista e o manda para a rota).
- **RN-04 — excluir a requisição conta só a viva (C236).** `DELETE /requisicoes/:id` (`excluirSemTrava`): o líquido por saída e
  o do ramo legado descontam só as vivas. *Cenário:* entrega 2 → devolução 2 → estorno da entrada (físico 3) → excluir →
  **200**, físico **5** (era 3); sem o estorno da entrada → excluir não credita nada (físico 5, como hoje).
- **RN-05 — a entrada de devolução para sucata não se estorna com a sucata de pé (C237).** `POST /movimentacoes/:id/cancelar`
  de `ENTRADA_DEVOLUCAO` cuja `referencia` `DEV-<id>` tem uma `SUCATA` não estornada → **400 E1**, nada tocado (antes do claim, e
  a condição também no claim). A compensação interna não passa. *Cenários:* Entrada 10 → Saída 2 → devolução 2 para SUCATA
  (físico 8) → estornar a entrada → 400 E1, físico 8; estornar a sucata → 200, físico 10; estornar a entrada → 200, físico 8;
  devolver 2 de novo → 201 (a devolução morreu); a entrada de devolução para ESTOQUE continua estornável.
- **RN-06 — o livro e o desfazer do estorno de Saída rodam sob a trava (C235).** No ramo de saída de `cancelarMovimentacao`, o
  `INSERT` da linha `ESTORNO` e o `movimento_estorno_id` rodam dentro da seção do material; se falharem, o desfazer (séries,
  linha, físico) roda também ali, antes de soltar. *Cenário:* Entrada 5 → Saída 2 → estorno com o `INSERT` do livro falhando e
  uma Saída de 5 disparada nesse instante (fora do contexto da seção) → estorno **500**, a Saída do meio **recusada** (saldo
  insuficiente: espera a trava e vê 3), físico **3** (era −2), `cancelado = 0`; o estorno de novo → 200, físico 5. Com séries:
  as séries voltam a *Entregue* e o invariante fecha. *(Fase 2, R4)* Qualquer falha depois do crédito dentro da seção (a linha
  de saldo, as séries) desfaz ali dentro; o `movimento_estorno_id` que falha depois do `INSERT` tira a linha `ESTORNO` de novo.
- **RN-07 — com série, o estorno da entrada da devolução devolve as séries à saída (*Fase 2, R1*).** Estorno de
  `ENTRADA_DEVOLUCAO` de uma devolução que citou uma saída: as séries da entrada voltam a *Entregue* com o vínculo àquela saída
  (não *Estornada*). Devolução avulsa: *Estornada*, como sempre. O desfazer (se o estorno falha) devolve o vínculo anterior.
  *Cenários:* Saída de V1,V2 → devolução com V1,V2 → estorno da entrada → V1,V2 *Entregue* na saída, a lista as oferece, devolver
  de novo com elas → 201, físico 2; o estorno da saída passa (séries de volta); pela requisição, excluir devolve as séries.
- **RN-08 — a entrada da devolução é uma só (*Fase 2, R2*).** A régua e a guarda da RN-05 olham a **primeira**
  `ENTRADA_DEVOLUCAO` com a referência `DEV-<id>` do material da devolução (e a primeira `SUCATA`). *Cenário:* uma Entrada v2
  digitada como `ENTRADA_DEVOLUCAO` com `DEV-<id>` e estornada não mata a devolução: lista 0, devolver recusa, estorno da saída
  E3, físico 10.
- **RN-09 — só o estorno concluído mata a devolução (*Fase 2, R3*).** A devolução está morta quando a entrada tem `cancelado = 1`
  **e** `movimento_estorno_id` gravado. *Cenários:* o estorno da entrada que falha (livro) com o estorno da saída no meio → a
  saída recusa (E3), físico 5; com uma devolução de novo no meio → *"… restam 0"*; o estorno da perna SUCATA que falha com o
  estorno da entrada no meio → E1, físico 8.

## Contrato congelado

Corpos 200/201 inalterados. As literais de hoje mudam só no número (*"já foram devolvidos ⟨d⟩ e restam ⟨r⟩"* passa a contar as
vivas). Nova recusa, `{ "error": <literal> }`:

**E1 — 400** (`POST /movimentacoes/:id/cancelar`, RN-05):
```
Não é possível estornar: esta entrada é da devolução ⟨DEV-id⟩, que foi para a sucata — estornar só a entrada tiraria do estoque de novo o que já saiu pela sucata. Estorne primeiro a sucata desta devolução e depois esta entrada.
```

Módulo novo `services/almoxarifado/devolucaoViva.js`: `DEVOLUCAO_VIVA_SQL` (a mesma string de hoje, apelido `d`). `stockService`
passa a importá-lo; `returnService` e `requisitionService` também.

## Tasks (sort topológico)

- [ ] **T1 — tronco (C236, serviço)** — `devolucaoViva.js`; RN-01..RN-04 em `returnService.js` e `requisitionService.js`;
  `server/tests/api/devolucaoViva.api.test.js`. Controle positivo: cada uma das quatro contas sem a régua (a da validação, a do
  INSERT, a da lista, a da exclusão por saída); a régua sem o `tipo = 'ENTRADA_DEVOLUCAO'`.
- [ ] **T2 — tronco (C237, motor)** — RN-05 em `stockService.js`, no mesmo arquivo de teste. Controle positivo: sem a guarda
  prévia (o claim ainda recusa? → então a asserção "nada tocado" distingue); sem a condição no claim; guarda também na
  compensação.
- [ ] **T3 — tronco (C235, motor)** — RN-06 em `stockService.js`; `server/tests/api/estornoLivroNaTrava.api.test.js`. Controle
  positivo: o `INSERT` de volta para fora da seção (físico −2); o desfazer fora da seção; o desfazer duplicado (de dentro e de
  fora: físico 1); `serieEstornoLedgerFalha` continua verde.
- [ ] **T4 — integração (cruza Devoluções, Movimentações, Requisições)** — `server/tests/api/devolucaoVivaIntegracao.api.test.js`:
  (i) a tela lista a saída → devolve → estorna a entrada pelo livro → a lista volta a oferecer 2 → devolve pela lista → o estorno
  da saída é recusado com a E3 da 116 (a devolução nova está viva); (ii) pela requisição: entrega 2 → devolução para SUCATA → E1
  → estorna a sucata → estorna a entrada → excluir a requisição → físico da entrada inicial (10); (iii) *(reescrita na Fase 2,
  R5)* Entrada 5 → Saída 2 → estorno da Saída com o `INSERT` do livro falhando 150 ms depois e, nesse instante, `POST
  /devolucoes` de 2 citando a saída (fora da seção) → estorno 500; devolução **400** *"A saída ⟨id⟩ foi cancelada (estornada) —
  o estorno já devolveu o material"* (falsa nessa janela — declarado, **C240**), nenhuma linha de devolução nem
  `ENTRADA_DEVOLUCAO`, físico 3, `cancelado = 0`; depois devolver 2 → 201, físico 5; estorno da saída → E3.
- [ ] **T5 — fechamento** — skill `fechar-etapa`.

Sem galho: as três tasks mexem em regra compartilhada (motor/serviço). Não há tela nesta etapa (o front lê `saldo_devolvivel`, que
muda só no valor).
