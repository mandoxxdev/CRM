# Almoxarifado — Etapa 118: o estorno que falha no meio desfaz tudo, em todos os ramos (plano)

> Origem: "Próxima tarefa detalhada — Etapa 118" do plano da 117 (**C238**, **C243**, **C245**, e a **C240**). Design com a
> Fase 0 medida: `docs/superpowers/specs/2026-10-16-almoxarifado-etapa118-estorno-que-falha-desfaz-tudo-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B768**,
> último C **C245**, última A **A65**. Esta etapa: **B769+**, **C246+**, **A66+**. Worktree `CRM-wt-e118`, branch
> `etapa-e118` (a partir da main `7fcad73d`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a revisão fresca do plano (um agente, com sonda) achou 4 pontos — 1 Important, 3 Minor.
> **Achado 1** (Important, medido: `e118r-bloqueio-serie.js`) — a B771 dizia que o bloquear/desbloquear série era a única porta
> fora da trava e que, por isso, não conferir o status no desfazer bastava; mas no **caminho de ida** do estorno de entrada,
> bloquear a 2ª série entre o claim e o `UPDATE` dela fazia `reverterEntrada` pular a série em silêncio — estorno **200**, físico
> 0, a série *Bloqueada* contada como presente (anterior à etapa) → **RN-10** nova: o bloquear série roda sob a trava do
> material. **Achado 2** (Minor) — no AJUSTE com localização, re-sincronizar o total pela soma no desfazer mudaria o físico de um
> material cujo total já não batia com as linhas → o total volta por **delta** (lido antes do sync). **Achado 3** (Minor) — o
> AJUSTE sem localização restaura as linhas exatas só se elas batiam com o total; material sem linha nenhuma sai do desfazer com
> a linha padrão criada → declarado (sem linha negativa, coerente). **Achado 4** (Minor) — (a) o desfazer das séries tira a
> série da lista logo depois do `UPDATE`, antes da auditoria; (b) o chamador passa o próprio rastreador; (c) o claim desfeito
> também de dentro da seção; (d) se o próprio desfazer lança, o erro original se perde (já era assim desde a 117) → declarado.
> Deadlock: nenhum chamador de `cancelarMovimentacao` roda dentro de seção; nada no if-chain pega trava de outro material.

## Regras de negócio

"Livro falhando" = o `INSERT` da linha `ESTORNO` forçado a falhar uma vez (gancho no `db.run`, como em
`estornoLivroNaTrava.api.test.js`). "No meio" = disparado de dentro do gancho, **fora** do contexto da seção
(`AsyncResource.bind`), com a falha atrasada até ele terminar ou 150 ms.

- **RN-01 — o estorno de BLOQUEIO que falha devolve o bloqueio (C238).** Entrada 5 → Bloqueio 2 → estorno com o livro falhando
  → **500**, bloqueado **2**, `cancelado = 0`, nenhuma linha `ESTORNO`; o estorno de novo → **200**, bloqueado 0.
- **RN-02 — o de DESBLOQUEIO devolve o desbloqueio (C238).** Entrada 5 → Bloqueio 2 → Desbloqueio 2 → estorno com o livro
  falhando → 500, bloqueado **0**; de novo → 200, bloqueado **2** (era 4).
- **RN-03 — o de AJUSTE sem localização volta o físico (C238).** Entrada 5 → Ajuste para 7 → estorno com o livro falhando → 500,
  físico **7**, soma das linhas 7; de novo → 200, físico 5.
- **RN-04 — o de AJUSTE com localização volta a linha e o total (C238).** Entrada 5 em L → Ajuste em L para 7 → estorno com o
  livro falhando → 500, físico 7, linha L 7; de novo → 200, físico **5** (era 3).
- **RN-05 — o de TRANSFERÊNCIA volta as duas linhas (C238).** Entrada 5 em A → Transferência 3 de A para B → estorno com o livro
  falhando → 500, A 2 e B 3; de novo → 200, A 5 e B 0.
- **RN-06 — o desfazer desses ramos roda sob a trava (C238).** (a) Entrada 5 → Bloqueio 2 → estorno com o livro falhando e uma
  Saída de 5 no meio → estorno 500, a Saída **espera** (não termina antes da falha) e é **recusada** (disponível 3), físico 5,
  bloqueado 2. (b) Entrada 7 → Ajuste para 5 → estorno (sobe para 7) com o livro falhando e uma Saída de 7 no meio → a Saída
  espera e é recusada, físico 5 (sem a trava: a Saída leva 7 e o desfazer vai a −2).
- **RN-07 — no estorno de entrada, as séries e o livro rodam sob a trava (C243).** Entrada 2 (V1, V2) → Saída 2 → devolução
  citando a saída com V1, V2 → estorno da `ENTRADA_DEVOLUCAO` com o livro falhando e uma devolução **avulsa** de V1, V2 no meio
  → estorno 500, a devolução do meio espera e é **recusada** (as séries já estão em estoque), físico **2**, as 2 séries *Em
  estoque*, a `ENTRADA_DEVOLUCAO` com `cancelado = 0`. Sem série: o estorno de entrada com o livro falhando e uma Saída de 5 no
  meio → a Saída espera (físico 5 depois do desfazer: a Saída passa depois, físico 0 — nunca no meio).
- **RN-08 — a série que já mudou entra no desfazer mesmo se a seguinte falhar (C245).** (a) Saída de 2 séries → estorno com a
  auditoria da 2ª série falhando → 500, físico 0, as **duas** séries *Entregue* na saída, `cancelado = 0`; de novo → 200,
  físico 2, *Em estoque*. (b) Entrada de 2 séries → estorno com a auditoria da 2ª série falhando → 500, físico 2, as duas *Em
  estoque*; de novo → 200, físico 0, *Estornada*. (c) O refazer de fora não duplica: uma auditoria `COMPENSACAO` por série.
- **RN-09 — a devolução no meio de um estorno de saída não diz que o estorno aconteceu (C240).** Entrada 5 → Saída 2 → estorno
  da Saída com o livro falhando e, no meio, `POST /devolucoes` de 2 citando a saída → estorno 500, devolução **400** com a E1
  abaixo, nada gravado; depois, devolver 2 → 201. A saída estornada de verdade continua recusando com a literal de sempre.

- **RN-10 — bloquear ou desbloquear uma série espera o estorno do material (*Fase 2, achado 1*).** `PUT /series/:id/status` roda
  sob a trava do material da série. *Cenários:* Entrada de 2 séries → estorno da entrada com o bloqueio da 2ª pela rota no meio
  (depois de a 1ª mudar) → o bloqueio espera e recusa *"transicao invalida: ESTORNADA -> BLOQUEADA"*, estorno **200**, as duas
  *Estornada*, físico 0; fora de estorno, bloquear e desbloquear como antes (404 para série inexistente). Dois bloqueios
  simultâneos da mesma série: um vence, o outro **400** *"transicao invalida: BLOQUEADA -> BLOQUEADA"* (era 409 *"status da
  serie mudou durante a operacao — recarregue"* — a fila da trava troca a corrida pela leitura do estado novo).

- **RN-11 — o estorno de entrada confere as séries de novo sob a trava (*Fase 5, revisores 1 e 2; B773*).** O bloqueio da 2ª série
  entre a guarda de fora e a seção → **400** *"estorno de entrada recusado: ha series desta entrada ja movimentadas — estorne as
  saidas primeiro"*, nada tocado (físico 2, 2 presentes).
- **RN-12 — o de saída também (*Fase 5, revisor 1, I-2*).** Uma Entrada com o número de uma série da saída entre a guarda e a
  seção → **400** *"estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material"*,
  nada creditado.
- **RN-13 — a linha já debitada no estorno de entrada sem lote entra no desfazer (*Fase 5, revisor 1, I-3*).** Entradas de 5 em A e
  em B, Saída de 3 de A, estorno da entrada de A com o débito de B falhando → 500, A 2, B 5, físico 7; de novo → 200, A 0, B 2.
- **RN-14 — o claim é desfeito uma vez (*Fase 5, revisor 2 — regressão do achado 4c da Fase 2*).** Um 2º estorno que grava o claim
  entre o desfazer de dentro e o catch de fora conclui de verdade (`cancelado = 1`, físico 10); o 3º recusa.

## Contrato congelado

Corpos 200/201 e as literais de hoje inalterados. Nova recusa, `{ "error": <literal> }`:

**E1 — 400** (`POST /devolucoes` com `movimentacao_saida_id`, RN-09; `validarSaidaOriginal`):
```
A saída ⟨id⟩ tem um estorno em andamento que ainda não concluiu — nada foi gravado. Tente de novo em instantes; se a recusa continuar, o estorno foi interrompido: avise o administrador do almoxarifado.
```
*(Fase 5: a primeira versão dizia "está sendo estornada neste instante — … Tente de novo em instantes: se o estorno concluir, a
saída deixa de aceitar devolução." — trocada porque o estorno interrompido (C246) a deixava de pé para sempre.)*

Interno: `seriesService.reverterSaida(db, user, movId, { afetadas })` e `reverterEntrada(db, user, movId, { saidaId, afetadas })`
— `afetadas` opcional (sem ele, o array local de hoje); devolvem o array como hoje. `desfazerReverterSaida`/`desfazerReverterEntrada`
consomem a lista recebida (esvaziam à medida que desfazem).

## Tasks (sort topológico)

- [x] **T1 — tronco (C238 + C243 + C245, motor)** `ad75feda` (+ `05cba92c`, CLAUDE.md) — `stockService.cancelarMovimentacao` (seção única, rastreadores) e
  `seriesService` (acumulador, desfazer que consome); `server/tests/api/estornoQueFalhaDesfaz.api.test.js` (RN-01..RN-08).
  Controle positivo: cada rastreador desligado (um por ramo); a seção única de volta só em volta do débito da entrada (RN-07);
  o ramo de BLOQUEIO fora da seção (RN-06a); o acumulador desligado (RN-08a/b); o desfazer de série que não consome (RN-08c).
- [x] **T2 — tronco (C240, serviço)** `771a4aa1` — `returnService.validarSaidaOriginal`; a jornada (iii) de
  `devolucaoVivaIntegracao.api.test.js` passa a esperar a E1 (era a literal falsa, declarada na C240); cenário da saída
  estornada de verdade no mesmo arquivo de teste da T1. Controle: a condição sem `movimento_estorno_id` (volta a falsa).
- [x] **T3 — integração (cruza Movimentações, Devoluções, Séries)** `4a415949` — `server/tests/api/estornoQueFalhaIntegracao.api.test.js`:
  (i) pelas rotas: devolução com séries → estorno da entrada dela com o livro falhando e a devolução avulsa pela rota no meio →
  depois o estorno de novo passa → a lista de saídas elegíveis volta a oferecer as 2 → devolve pela lista com as séries → 201,
  físico 2; (ii) bloqueio → estorno com o livro falhando e uma Saída **pela rota** v2 no meio → recusada → estorno de novo →
  200 → a Saída de 5 passa; (iii) estorno da saída com o livro falhando e a devolução no meio → E1 → devolver → 201 → o estorno
  da saída recusa com a E3 da 116 (devolvida).
- [x] **T4 — fechamento** (skill `fechar-etapa`) — o commit de documentação desta etapa (ver `git log`).

Sem galho: T1 e T2 mexem em regra compartilhada (motor, serviço); a T2 é pequena e vai depois da T1 no mesmo arquivo de teste.
Sem tela (a E1 aparece pela mensagem que a tela de Devoluções já mostra).

## Execução — o que aconteceu

- **Fase 0** (sondas `e118fase0.js`, `e118fase0b.js`, não versionadas): C238 nos cinco ramos — com dois "em dobro" que o plano da 117
  não tinha medido (DESBLOQUEIO 2 → 4; AJUSTE com localização 7 → 5 → 3) e dois presos (BLOQUEIO, TRANSFERÊNCIA); C245 (físico 0
  com 2 séries *Em estoque*); C243 (3/3: físico 4 com 2 séries). A C240 por leitura (a jornada (iii) da 117 a prendia).
- **Fase 2** — um revisor fresco, com sonda: 1 Important (o bloquear série no caminho de ida → **RN-10**) e 3 Minor (o total do
  AJUSTE com localização por delta; o AJUSTE sem localização declarado; o claim desfeito de dentro da seção). Tudo antes do
  primeiro commit de código. Design e plano `12d6c764`.
- **T1** `ad75feda` — a seção única, os rastreadores, o acumulador das séries, `mudarStatusSerie` sob a trava;
  `estornoQueFalhaDesfaz.api.test.js` (15 na T1). Controle: 13 sabotagens, 12 vermelhas na asserção certa; a S13 (o claim
  desfeito de dentro) não derrubou nada — declarada. A suíte pegou o efeito colateral da RN-10 (`serieRotas`: a corrida dava 409,
  passou a 400) — ajustado no mesmo commit, com controle (sem a trava → 409, vermelho). **CLAUDE.md** `05cba92c`.
- **T2** `771a4aa1` — a recusa nova; 2 cenários e a jornada (iii) da 117 trocada. Controle: sem a condição → vermelho.
- **T3** `4a415949` — 4 jornadas (`estornoQueFalhaIntegracao.api.test.js`). Controle: 5 sabotagens, 5 vermelhas.
- **Fase 5** `50aeb457` — três revisores frescos em paralelo, cada um na sua worktree (removidas). **Regra e fluxo (r1):** 3 Important
  anteriores à etapa que contradiziam o "desfaz tudo" — as guardas de série fora da trava na entrada (I-1, 3/3, e com a trava
  ocupada) e na saída (I-2, 3/3), e a linha já debitada pelo `claimSaldoSemLote` perdida (I-3: físico 7 com as linhas em 5, para
  sempre); 4 Minor — a literal da C240 de pé para sempre num estorno interrompido (corrigida: *"… tem um estorno em andamento que
  ainda não concluiu …"*), a falha dupla (C247), a auditoria pós-estorno (C248), a mudança 409 → 400 (declarada na B771).
  **Concorrência (r2):** 1 Important **regressão desta etapa** — o claim desfeito duas vezes apagava o claim de um 2º estorno
  (30/30 com atraso, 0/160 sem) — e o mesmo I-1 (4–6/30 só com o instante de chegada); 48 combinações ramo × porta no meio, 0/30;
  sem deadlock; custo ~30 ms para quem chega no meio de um estorno de 200 séries. **Sabotagem (r3):** 42 sabotagens, 30
  vermelhas, 3 equivalentes, a S01 (o claim desfeito de dentro) equivalente em produção — a janela existe (sonda P1), mas nenhuma
  porta real cai nela (P10 verde com e sem a sabotagem): **a justificativa da Fase 2 para o achado 4c ("um estorno de novo nessa
  janela ouvia 'já cancelada'") não se reproduz — a linha é defensiva** (D (118)). 9 sem prova → 7 cenários (P2, P3, P4, P5, P6, P8,
  P9) no arquivo da T1. Correções: as guardas de série de novo dentro da seção (B773), o acumulador em `claimSaldoSemLote` (os dois
  chamadores), `claimDesfeito`, a literal. Controle das correções: S14–S18 (as guardas, o acumulador, a marca do claim, o
  desfazer da entrada que não consome), todas vermelhas na asserção certa; as sondas dos revisores rodadas contra a árvore
  corrigida: 0/30 nas duas de r2, as de r1 limpas.
- **Fechamento** — medidas a C249 (saída com lote, dois endereços, o 2º débito falhando: físico 6, endereços 0 e 3) e a C248 (500
  com o estorno concluído; de novo, *"Movimentação já cancelada"*); a A66 conferida numa sonda (`e118a66.js`).
- **Suíte final (medida, depois de `50aeb457`):** `test:api` **390/390** arquivos; `test:almoxarifado` **44/0**; `test:validation` 4/0, `test:safealter` 3/0,
  `test:sqlite` 10/0; client **115** suítes / **1629** testes; `CI=true build` *Compiled successfully*. (Cada commit de código teve a
  sua rodada completa: T1 389/389, T2 389/389, T3 390/390, Fase 5 390/390 — os mesmos números nas outras quatro suítes.)
- **Divergências do plano:** (1) a Fase 2 trouxe a RN-10 (o bloquear série sob a trava) e o total do AJUSTE com localização por
  delta; (2) a Fase 5 trouxe as guardas de série dentro da seção (RN-11, RN-12), o acumulador das linhas sem lote (RN-13) e a marca
  do claim (RN-14, regressão do achado 4c da Fase 2), e trocou a literal da E1; (3) a B771 dizia que, com a RN-10, a premissa
  "ninguém muda a série no meio" passava a valer — **só passou a valer com a B773** (a guarda fora da trava era outra janela).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** de redesenho antes do código (Fase 2) e **1** no código (Fase 5). Um teste antigo mudou
   de comportamento esperado, de propósito (`serieRotas`, 409 → 400 — B771).
2. **Achados da revisão:** Fase 2 — **4 reais** de 4 (1 Important). Fase 5 — **5 de produção** corrigidos (4 Important — um deles
   regressão desta etapa — e 1 Minor, a literal), **3** declarados (C247, C248; a 409 → 400 na B771), **9** sabotagens sem prova → 7
   cenários (2 equivalentes de fato), **0** ruído.
3. **Paralelismo:** **0** galhos (T1 e T2 mexem em regra compartilhada; a T3 só testa); revisores em paralelo na Fase 5 (três, cada
   um na sua worktree), sem retrabalho. Um retrabalho de processo: a primeira rodada da suíte da T1 foi interrompida porque o
   arquivo da T3 (que depende da T2) já estava em `tests/api` — o runner o pegaria; tirado e rodado de novo.
4. **Defeito que escapou:** *(preencher na Etapa 119)*. Da Etapa 117: **nenhum** introduzido por ela; uma afirmação errada na spec
   03 (o ramo de entrada fora da trava), corrigida à vista.

## Próxima tarefa detalhada — Etapa 119

*(A série desta etapa foi B769–B774, C246–C249, A66 — a 119 começa em **B775**, **C250**, **A67**; confira com `grep -oE` antes.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-16):** as features 🟡
continuam 00, 01, 05, 06, 21, 22 e 23; o motor (03) está 🟢 com quatro furos de falha de banco declarados. Candidatos:

1. **C249 — a saída com lote que debita mais de um endereço e falha no meio deixa um endereço debitado** (feature 03). **Medido
   no fechamento da 118** (sonda `server/tests/sonda/e118c249.js`, não versionada — recriar): lote L1 em A (3) e B (3), Saída de 5
   com o 2º `UPDATE … RETURNING id` do lote falhando → 500, físico 6, endereços 0 e 3. Causa: `claimSaldoDoLote` acumula num array
   local e só devolve no `return` (a forma da C245/I-3). Correção: `{ aplicados }` do chamador, **com cuidado**: o ramo
   `ok: false` desfaz sozinho e devolve — o acumulador tem de ser esvaziado ali (senão o `catch` do chamador desfaz em dobro).
   Chamadores: `registrarMovimentacaoSemTrava` (`saldoLinhasSaidaParaReverter = claim.linhas`) — conferir os outros com
   `grep -n "claimSaldoDoLote(" server/services`. **Não depende do P.O.**
2. **C248 — a auditoria `CANCELAMENTO` que falha depois do estorno concluído responde erro** e pula o desconto do pedido de compra,
   o recálculo, o alerta e a supressão do aviso. **Medido no fechamento** (mesma sonda): 500, `cancelado = 1` com o vínculo; de
   novo, *"Movimentação já cancelada"*. Correção candidata (letra B, reversível): a auditoria do cancelamento não-fatal (`try` +
   `console.warn`), como a de `auditarEstornoDeAjuste` logo abaixo. **Não depende do P.O.** Pequeno.
3. **C242** — a entrada original das séries que não estorna depois de desfazer a devolução — pequeno, sem P.O. **C231**, **C234** —
   como no plano da 117.
4. **C246/C247** — só com transação de verdade (Postgres) ou um "reparo" no boot; **C246** tem a A66 para o legado. Um reparo
   automático do claim preso (desmarcar no boot o que tem `cancelado = 1` sem `movimento_estorno_id`) **depende do P.O.** (mexe no
   livro sem pedido de ninguém) — registrar como B se for proposto.
5. **Dependem do P.O.:** **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**.

**Escolhida: C249 + C248 (o motor que falha no meio não perde endereço nem responde erro do que já valeu) — + C242 se couber.**

**Contrato candidato:** nenhum contrato de API muda (corpos e literais de hoje). C249: interno (`claimSaldoDoLote(db, …, { aplicados })`).
C248: o estorno concluído responde 200 mesmo com a auditoria `CANCELAMENTO` falhando (o log registra).

**Pontos de atenção:** a trava não é reentrante (o motor já roda sob `naTravaDoMaterial`); o molde de teste é
`estornoQueFalhaDesfaz.api.test.js` (gancho no `db.get` para os `UPDATE … RETURNING`, no `db.run` para os `INSERT`); a saída com
lote passa por `registrarMovimentacao` — conferir a entrega de requisição (`requisitionService`) e a devolução, que também debitam
por lote. Medir antes de prometer: a entrega de requisição com lote em dois endereços e o 2º débito falhando.

**O que já está pronto e não precisa reabrir:** a seção única do estorno, os rastreadores de todos os ramos, as guardas de série
dentro da seção, os acumuladores de `reverterSaida`/`reverterEntrada`/`claimSaldoSemLote`, o claim desfeito uma vez, o bloquear
série sob a trava, a recusa da devolução no meio do estorno.
