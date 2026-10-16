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

## Contrato congelado

Corpos 200/201 e as literais de hoje inalterados. Nova recusa, `{ "error": <literal> }`:

**E1 — 400** (`POST /devolucoes` com `movimentacao_saida_id`, RN-09; `validarSaidaOriginal`):
```
A saída ⟨id⟩ está sendo estornada neste instante — nada foi gravado. Tente de novo em instantes: se o estorno concluir, a saída deixa de aceitar devolução.
```

Interno: `seriesService.reverterSaida(db, user, movId, { afetadas })` e `reverterEntrada(db, user, movId, { saidaId, afetadas })`
— `afetadas` opcional (sem ele, o array local de hoje); devolvem o array como hoje. `desfazerReverterSaida`/`desfazerReverterEntrada`
consomem a lista recebida (esvaziam à medida que desfazem).

## Tasks (sort topológico)

- [ ] **T1 — tronco (C238 + C243 + C245, motor)** — `stockService.cancelarMovimentacao` (seção única, rastreadores) e
  `seriesService` (acumulador, desfazer que consome); `server/tests/api/estornoQueFalhaDesfaz.api.test.js` (RN-01..RN-08).
  Controle positivo: cada rastreador desligado (um por ramo); a seção única de volta só em volta do débito da entrada (RN-07);
  o ramo de BLOQUEIO fora da seção (RN-06a); o acumulador desligado (RN-08a/b); o desfazer de série que não consome (RN-08c).
- [ ] **T2 — tronco (C240, serviço)** — `returnService.validarSaidaOriginal`; a jornada (iii) de
  `devolucaoVivaIntegracao.api.test.js` passa a esperar a E1 (era a literal falsa, declarada na C240); cenário da saída
  estornada de verdade no mesmo arquivo de teste da T1. Controle: a condição sem `movimento_estorno_id` (volta a falsa).
- [ ] **T3 — integração (cruza Movimentações, Devoluções, Séries)** — `server/tests/api/estornoQueFalhaIntegracao.api.test.js`:
  (i) pelas rotas: devolução com séries → estorno da entrada dela com o livro falhando e a devolução avulsa pela rota no meio →
  depois o estorno de novo passa → a lista de saídas elegíveis volta a oferecer as 2 → devolve pela lista com as séries → 201,
  físico 2; (ii) bloqueio → estorno com o livro falhando e uma Saída **pela rota** v2 no meio → recusada → estorno de novo →
  200 → a Saída de 5 passa; (iii) estorno da saída com o livro falhando e a devolução no meio → E1 → devolver → 201 → o estorno
  da saída recusa com a E3 da 116 (devolvida).
- [ ] **T4 — fechamento** (skill `fechar-etapa`).

Sem galho: T1 e T2 mexem em regra compartilhada (motor, serviço); a T2 é pequena e vai depois da T1 no mesmo arquivo de teste.
Sem tela (a E1 aparece pela mensagem que a tela de Devoluções já mostra).
