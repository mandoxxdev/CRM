# Almoxarifado — Etapa 118: o estorno que falha no meio desfaz tudo, em todos os ramos (design)

> Origem: "Próxima tarefa detalhada — Etapa 118" do plano da 117 (**C238**, **C243**, **C245**; **C240** se couber). Fora
> (dependem do P.O.): **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**.

## Fase 0 — medido no código (2026-10-16, main `7fcad73d`, sondas `server/tests/sonda/e118fase0.js` e `e118fase0b.js`, não versionadas)

**C238 — reproduzido nos cinco ramos sem desfazer.** `INSERT` da linha `ESTORNO` forçado a falhar uma vez, depois o estorno de
novo:

| Ramo | Antes | Estorno com o livro falhando (500) | Estorno de novo |
|---|---|---|---|
| BLOQUEIO (2 de 5) | bloqueado 2 | bloqueado **0**, `cancelado = 0` | **400** *"o bloqueio já foi desfeito (quantidade bloqueada: 0)"* — preso: o livro diz bloqueio de pé e não há bloqueio |
| DESBLOQUEIO (2) | bloqueado 0 | bloqueado **2** | **200**, bloqueado **4** (em dobro) |
| AJUSTE sem localização (5 → 7) | físico 7 | físico **5** | 200, físico 5 (SET absoluto: idempotente) |
| AJUSTE com localização (5 → 7) | físico 7, linha 7 | físico **5**, linha 5 | **200**, físico **3** (delta em dobro) |
| TRANSFERÊNCIA (3 de A para B) | A 2, B 3 | A **5**, B **0** | **400** *"o destino não tem mais o saldo transferido"* — preso |

A previsão do plano da 117 ("no AJUSTE sem localização é idempotente; com localização e na transferência são deltas — medir")
se confirma: com localização dobra; a transferência não dobra porque a guarda do destino recusa — fica presa.

**C245 — reproduzido.** Saída de 2 séries; no estorno, a auditoria da **2ª** série falha (o `UPDATE` da série já foi): 500,
físico **0** (o desfazer do crédito rodou), as **duas** séries *Em estoque* (o `afetadas` de `reverterSaida` nunca chega ao
chamador — a exceção sai antes do `return`); o estorno de novo recusa (*"series desta saida ja reentraram no estoque"*). Séries e
estoque sem bater, sem caminho de volta.

**C243 — reproduzido, 3/3 rodadas.** Entrada 2 (V1, V2) → Saída 2 → devolução citando a saída com V1, V2 → estorno da
`ENTRADA_DEVOLUCAO` com o livro falhando 150 ms depois e, nesse instante, uma devolução **avulsa** de V1, V2 (fora do contexto
da seção) → a devolução do meio **201**, o estorno 500, físico **4** com 2 séries presentes. Causa: no ramo de entrada só o
débito está sob a trava; as linhas de saldo, as séries (`reverterEntrada`), o livro e o desfazer rodam fora — a devolução do
meio (que entra pelo motor, sob a trava) cabe entre a troca das séries e o desfazer.

**C240 — confirmada por leitura** (a jornada (iii) da T4 da 117 já a prende como "falsa nessa janela"): `validarSaidaOriginal`
recusa com *"foi cancelada (estornada) — o estorno já devolveu o material"* olhando só `cancelado`, que o claim do estorno grava
**antes** do efeito e desfaz se falhar. O estorno concluído é o que tem `movimento_estorno_id` (`devolucaoViva.estornoConcluidoSql`,
Etapa 117). O único escritor de `cancelado = 1` em todo o servidor é esse claim (`grep "cancelado = 1"`).

## O desenho

1. **Uma seção só para o efeito e o livro, em todos os ramos.** Em `cancelarMovimentacao`, o `if`-chain inteiro (entrada,
   saída, AJUSTE, AJUSTE_INVENTARIO, TRANSFERÊNCIA, BLOQUEIO, DESBLOQUEIO) e o `gravarLivroDoEstorno` rodam dentro de **uma**
   `trava.naTravaDoMaterial(mov.material_id, …)` com `try/catch` que chama `desfazerEfeitosDoEstorno` antes de soltar. É a forma
   que a 117 deu ao ramo de saída, estendida aos outros. As seções internas de hoje (débito da entrada, ramo de saída, AJUSTE,
   claim do DESBLOQUEIO) saem — viram a de fora. O `catch` de fora continua: desfaz o claim e recria as reservas da chegada
   (`recriarReservasDoEstorno` → recálculo pega a trava: **fora** da seção, como hoje).
2. **Um rastreador por efeito novo** em `desfazerEfeitosDoEstorno` (idempotente, cada um zerado depois do seu passo):
   - `compensarBloqueada` — BLOQUEIO: `+q`; DESBLOQUEIO: `−q`;
   - AJUSTE sem localização: `compensarQuantidadeMaterial = lido antes do SET − saldo_anterior` e `compensarSyncLocalizacaoPadrao`
     (a ordem de hoje: o total volta antes do sync da linha padrão);
   - AJUSTE com localização: `compensarLinha` (`+delta` na linha) e `compensarSyncTotais` (o total pela soma, por último). A
     devolução manual da linha na recusa *"o saldo já foi consumido"* sai — o `catch` da seção faz;
   - TRANSFERÊNCIA: `compensarLinhasPorId` (destino `+q`, origem `−q`).
3. **C245: as séries acumulam no rastreador do chamador.** `reverterSaida`/`reverterEntrada` recebem `{ afetadas }` e empurram
   cada série logo depois do `UPDATE` dela — a que já mudou fica no rastreador mesmo que a auditoria (ou a série seguinte) falhe.
   `desfazerReverterSaida`/`desfazerReverterEntrada` consomem a lista à medida que desfazem (o refazer de fora faz só o que falta,
   sem auditoria `COMPENSACAO` em dobro).
4. **C243: a seção única resolve.** As séries e o livro do ramo de entrada passam a rodar sob a trava; a devolução do meio espera
   e vê as séries de volta.
5. **C240: a recusa diz a verdade.** `validarSaidaOriginal`: `cancelado = 1` **sem** `movimento_estorno_id` → literal nova
   (400): *"A saída ⟨id⟩ está sendo estornada neste instante — nada foi gravado. Tente de novo em instantes: se o estorno
   concluir, a saída deixa de aceitar devolução."* Com `movimento_estorno_id`, a de sempre.

## Decisões (letra B)

- **B769 — o estorno de bloqueio, desbloqueio, ajuste e transferência que falha no meio desfaz o que já fez, sob a trava (C238).**
  Escolhido: a seção única e os rastreadores. Descartado: gravar o livro **antes** do efeito (inverte a ordem da função inteira;
  a régua da devolução viva depende do `movimento_estorno_id` ser a última escrita); só a guarda no estorno de novo (o efeito
  aplicado continuaria preso). **Reversível.**
- **B770 — a trava cobre o estorno do efeito ao livro em todos os ramos (C243).** Revê o *descartado* da **B762** só no que
  importa: a B762 descartou "a trava em volta do estorno **inteiro**" porque o recálculo das requisições pega a mesma trava; a
  seção nova vai do efeito ao livro e o recálculo continua fora. Descartado: conferir o status no desfazer das séries (ver B771).
  **Reversível.**
- **B771 — o desfazer das séries não confere o status (descartado o que o plano da 117 propunha).** Com a seção única, toda
  porta que mexe em série **com** estoque (as devoluções, a Entrada, a Saída) espera a trava. Sobra só o bloquear/desbloquear
  série, que não pega a trava e só muda *Em estoque* ↔ *Bloqueada*: com a conferência, uma série bloqueada no meio de um
  estorno de saída que falha ficaria *Bloqueada* (contada como presente) com o estoque desfeito — o contrário do que se quer. Sem
  ela, volta a *Entregue* na saída (a peça está fora; o bloqueio de uma peça que não está aqui não tem objeto). **Reversível.**
  *(Fase 2, achado 1: a premissa "só o bloquear série fica fora da trava, e não atrapalha" estava **errada** no caminho de ida
  — bloquear a 2ª série no meio do estorno de entrada fazia o estorno pular a série e responder 200 com o invariante quebrado.
  Corrigido pondo o bloquear/desbloquear série sob a trava do material (RN-10); com isso a premissa passa a valer.)*
- **B772 — a devolução no meio de um estorno de saída recebe a recusa nova, 400 (C240).** Descartado: 409 (as outras recusas
  dessa validação são 400 e a tela mostra o `error`); esperar o estorno terminar (a devolução teria de pegar a trava da saída
  — porta nova na trava por uma mensagem). **Reversível.**
