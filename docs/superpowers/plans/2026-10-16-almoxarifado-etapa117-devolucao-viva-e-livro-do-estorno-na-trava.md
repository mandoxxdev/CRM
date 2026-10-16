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

- [x] **T1 — tronco (C236, serviço)** `00bfee8b` — `devolucaoViva.js`; RN-01..RN-04 em `returnService.js` e `requisitionService.js`;
  `server/tests/api/devolucaoViva.api.test.js`. Controle positivo: cada uma das quatro contas sem a régua (a da validação, a do
  INSERT, a da lista, a da exclusão por saída); a régua sem o `tipo = 'ENTRADA_DEVOLUCAO'`.
- [x] **T2 — tronco (C237, motor)** `00bfee8b` (no mesmo commit da T1 — mesmo arquivo de teste, mesma régua) — RN-05 em `stockService.js`, no mesmo arquivo de teste. Controle positivo: sem a guarda
  prévia (o claim ainda recusa? → então a asserção "nada tocado" distingue); sem a condição no claim; guarda também na
  compensação.
- [x] **T3 — tronco (C235, motor)** `6aa8fc7f` — RN-06 em `stockService.js`; `server/tests/api/estornoLivroNaTrava.api.test.js`. Controle
  positivo: o `INSERT` de volta para fora da seção (físico −2); o desfazer fora da seção; o desfazer duplicado (de dentro e de
  fora: físico 1); `serieEstornoLedgerFalha` continua verde.
- [x] **T4** `3aa601b7` **— integração (cruza Devoluções, Movimentações, Requisições)** — `server/tests/api/devolucaoVivaIntegracao.api.test.js`:
  (i) a tela lista a saída → devolve → estorna a entrada pelo livro → a lista volta a oferecer 2 → devolve pela lista → o estorno
  da saída é recusado com a E3 da 116 (a devolução nova está viva); (ii) pela requisição: entrega 2 → devolução para SUCATA → E1
  → estorna a sucata → estorna a entrada → excluir a requisição → físico da entrada inicial (10); (iii) *(reescrita na Fase 2,
  R5)* Entrada 5 → Saída 2 → estorno da Saída com o `INSERT` do livro falhando 150 ms depois e, nesse instante, `POST
  /devolucoes` de 2 citando a saída (fora da seção) → estorno 500; devolução **400** *"A saída ⟨id⟩ foi cancelada (estornada) —
  o estorno já devolveu o material"* (falsa nessa janela — declarado, **C240**), nenhuma linha de devolução nem
  `ENTRADA_DEVOLUCAO`, físico 3, `cancelado = 0`; depois devolver 2 → 201, físico 5; estorno da saída → E3.
- [x] **T5 — fechamento** — o commit de documentação desta etapa (ver `git log`) (skill `fechar-etapa`).

Sem galho: as três tasks mexem em regra compartilhada (motor/serviço). Não há tela nesta etapa (o front lê `saldo_devolvivel`, que
muda só no valor).

## Execução — o que aconteceu

- **Fase 0** (sondas `e117fase0.js`, `e117fase0b.js`, não versionadas): C236 reproduzido nas quatro contas (a exclusão: 3 em vez de 5)
  e C235 (físico −2); de passagem, a C237 (sucata 8 → 6) e a C238 (bloqueio e ajuste sem desfazer).
- **Fase 2** — revisor fresco, 7 achados medidos (ver o bloco no topo); todos entraram antes do primeiro commit de código.
- **T1 + T2** `00bfee8b` — `devolucaoViva.js` e as cinco contas; a E1 da sucata; as séries de volta a *Entregue* (RN-07); 27
  cenários (`devolucaoViva.api.test.js`). Controle positivo: 14 sabotagens, 12 vermelhas na asserção certa; a identidade sem o
  material e a guarda prévia da E1 são equivalentes (o claim cobre a segunda).
- **T3** `6aa8fc7f` — o livro e o desfazer sob a trava; 9 cenários (`estornoLivroNaTrava.api.test.js`). Controle positivo: 4
  sabotagens; "sem o desfazer de dentro" só caiu depois do cenário do **desfazer lento** — sem atraso, a ordem das escritas no
  SQLite escondia (a lição: corrida que depende de sorte precisa de um atraso que tire a sorte).
- **T4** `3aa601b7` — 3 jornadas (`devolucaoVivaIntegracao.api.test.js`); a (iii) só passou a provar algo com o controle (tirar
  a recusa de saída cancelada da validação e do `INSERT` → vermelho).
- **Design e plano** `436a4e3a`; **CLAUDE.md** `a87a1783` (a regra da trava: quem desfaz subtraindo desfaz sob a trava).
- **Fase 5** `0b2d72f5` — três revisores frescos em paralelo, cada um na sua worktree (removidas). **Regra e fluxo:** 2
  Important (série errada ligada à entrega pelo estorno — regressão desta etapa; entrega de requisição excluída devolvível —
  anterior, 5 → 7), 2 Minor (a identidade contornável com a entrada digitada antes — corrigido reservando a referência; o
  `movimentacao_entrada_id` que não volta — declarado, C242). **Concorrência:** sem deadlock, corridas 0/30 em todas as
  variantes; 1 baixa corrigida (desfazer refeito em dobro quando um passo falha), 1 anterior declarada (C243), 1 residual (falha
  dupla, linha de estorno a mais — na C238). **Sabotagem:** 48, 26 vermelhas, 15 equivalentes, **7 sem prova** → 5 cenários
  (P1, P2, P6, P7, P8) em `devolucaoVivaFase5.api.test.js`; P9 anterior declarada (C245). Controle das correções: 8
  sabotagens, 7 vermelhas, 1 equivalente (a condição de requisição excluída no `INSERT`, atrás da validação).
- **Suíte final (medida, depois de `0b2d72f5`):** `test:api` **388/388** arquivos; `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **115** suítes / **1629** testes; `CI=true build`
  *Compiled successfully*.
- **Divergências do plano:** (1) a Fase 2 trouxe RN-07, RN-08 e RN-09 (com série, identidade, só o estorno concluído); (2) a
  Fase 5 trouxe três regras que o plano não tinha (a série da devolução tem de ter saído na entrega; a referência `DEV-<n>`
  reservada — revendo o "descartado" da B764; a entrega de requisição excluída); (3) T1 e T2 saíram num commit só (mesmo arquivo
  de teste, mesma régua).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** de redesenho antes do código (Fase 2: RN-07..RN-09) e **1** no código (Fase 5). Nenhum
   teste antigo mudou de comportamento esperado; um mudou de montagem (o [R2] monta a entrada digitada no banco, porque a v2 passou
   a recusar).
2. **Achados da revisão:** Fase 2 — **7 reais** de 7 (2 Critical); Fase 5 — **4 de produção** corrigidos (2 Important, 1 Minor,
   1 baixa), **3** declarados (C242, C243, C245; dois anteriores à etapa), **7** sabotagens sem prova → 5 cenários, **0** ruído.
3. **Paralelismo:** **0** galhos (as três tasks mexem em regra compartilhada do motor); revisores em paralelo na Fase 5 (três de
   uma vez, cada um na sua worktree), sem retrabalho. As suítes de cada commit rodaram isoladas (o resto da árvore guardado em
   `git stash`/scratchpad), uma por commit de código.
4. **Defeito que escapou:** *(preenchido na Etapa 118)* **nenhum defeito introduzido pela 117** apareceu na 118 (a Fase 0, a revisão do plano e os três revisores da Fase 5 mediram o estorno inteiro). **Uma afirmação errada**: o checklist da spec 03 dizia que o ramo de entrada podia ficar fora da trava ("desfaz somando, só aumenta o livre") — as séries dele trocavam fora (a C243, que a própria 117 declarou); corrigido à vista na spec 03. E a jornada (iii) da T4 prendia a literal falsa da C240 de propósito (declarada) — trocada na 118. Da Etapa 116: **dois** — a régua da devolução viva da 116 aceitava a
   `ENTRADA_DEVOLUCAO` digitada com a referência (o estorno da saída devolvida passava: 10 → 12, C241) e lia o claim provisório
   do estorno da entrada; os dois achados pela revisão do plano desta etapa.

## Próxima tarefa detalhada — Etapa 118

*(A série desta etapa foi B759–B768, C237–C245, A65 — a 118 começa em **B769**, **C246**, **A66**; confira com `grep -oE`
antes.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-16):** as features 🟡
continuam 00, 01, 05, 06, 21, 22 e 23. Candidatos:

1. **C238 — o estorno de BLOQUEIO, DESBLOQUEIO, AJUSTE e TRANSFERÊNCIA não desfaz o efeito se o livro falhar** (feature 03).
   **Medido nesta etapa** (sonda `e117fase0b.js`, recriar em `server/tests/sonda/`): `INSERT` da linha `ESTORNO` forçado a
   falhar → 500, `cancelado = 0`, mas BLOQUEIO: bloqueado 2 → 0; AJUSTE (sem localização): físico 7 → 5. O estorno seguinte
   aplicaria de novo (no BLOQUEIO a guarda do claim recusa; no AJUSTE sem localização é um SET absoluto, idempotente; o AJUSTE
   **com** localização e a TRANSFERÊNCIA são deltas — **medir**). **Não depende do P.O.** Só com falha de banco.
2. **C240** — a mensagem falsa da devolução durante um estorno de saída que falha. Pequeno, raro, sem P.O.
3. **C239 / B761** — a devolução para quarentena desfeita pela entrada deixa o bloqueio — **depende do P.O.** (estornar as
   duas pernas, recusar, ou deixar). **B755**, **C224**, **C225-resto**, **C228**, **C219**, **C230** — **dependem do P.O.**
   **C234** — raro, exige gesto do Administrador. **C231** — pequeno, sem P.O.

   **C243** (Fase 5 desta etapa, anterior a ela) — o gêmeo da C235 no **ramo de entrada**: no estorno de ENTRADA_DEVOLUCAO com
   série, a troca das séries e o livro rodam fora da trava, e `desfazerReverterEntrada` grava `WHERE id = ?` sem conferir o
   status (apaga o que uma devolução concorrente fez) — medido pelo revisor 2 (`e117r2-a.js`, A2): físico 3 com 2 séries
   presentes. **C245** (anterior) — `reverterSaida` que falha na 2ª série deixa a 1ª *Em estoque* (o `afetadas` não chega ao
   chamador). Os dois são da mesma família da C238 (falha de banco no meio do estorno). **C242** — a entrada original das séries
   que não estorna depois de desfazer a devolução (o `movimentacao_entrada_id` não volta) — pequeno, sem P.O.

**Escolhida: C238 + C243 + C245 (o estorno que falha no meio desfaz tudo, em todos os ramos) — + C240 se couber.**

**Contrato candidato (decisão — letra B, caminho reversível):**
- **C238:** cada ramo ganha o seu rastreador em `desfazerEfeitosDoEstorno` (a função idempotente desta etapa, em
  `cancelarMovimentacao`): BLOQUEIO → devolver `quantidade_bloqueada + q`; DESBLOQUEIO → `quantidade_bloqueada − q`; AJUSTE sem
  localização → voltar o físico ao lido antes do SET (+ `syncSaldoLocalizacaoPadrao`); AJUSTE com localização → a linha `+ delta`
  e `syncMaterialTotals`; TRANSFERÊNCIA → as duas linhas de volta. **Onde roda o desfazer:** o que **subtrai** do disponível
  (BLOQUEIO desfeito = bloquear de novo; AJUSTE que tinha subido o total, desfeito = subtrair; TRANSFERÊNCIA = mexe só em linha)
  tem de rodar sob a trava — os ramos de AJUSTE e DESBLOQUEIO já têm seção (`naTravaDoMaterial`); o de BLOQUEIO e o de
  TRANSFERÊNCIA não (medir se precisam). Regra do CLAUDE.md (seção da trava, Etapa 117): desfazer subtraindo = sob a trava.
- **Alternativa a pesar:** gravar o livro **antes** do efeito nesses ramos (o `INSERT` do `ESTORNO` primeiro, apagado se o
  efeito recusar) — inverte a ordem de toda a função, mais arriscado.

- **C243:** no ramo de entrada, as séries (`reverterEntrada`) e o livro entram na seção da trava (a mesma do claim do débito,
  alargada), e `desfazerReverterEntrada` ganha `AND status = <o que reverterEntrada gravou>`. **C245:** `reverterSaida` devolve
  o parcial ao chamador (ou se desfaz sozinho) antes de lançar.

**Pontos de atenção:** a trava não é reentrante (nenhuma escrita do desfazer pega a trava); o `catch` de fora roda fora da seção;
o `movimento_estorno_id` continua sendo a última escrita (a régua da devolução viva depende disso — `devolucaoViva.js`);
`serieEstornoLedgerFalha.api.test.js` e `estornoLivroNaTrava.api.test.js` são o molde (gancho no `db.run`, Saída do meio
disparada **fora** do contexto da seção por `AsyncResource.bind`, e o desfazer atrasado para tirar a sorte da ordem do SQLite).

**O que já está pronto e não precisa reabrir:** a régua da devolução viva nas cinco contas (C236), a entrada da devolução para
sucata (C237), as séries da devolução desfeita voltando a *Entregue* (B763), o livro e o desfazer do estorno de saída sob a trava
(C235).
