# Almoxarifado — Etapa 117: a devolução estornada deixa de contar, e o livro do estorno entra na trava (design)

> Origem: "Próxima tarefa detalhada — Etapa 117" do plano da 116 (**C236**, **C235**). Fora (dependem do P.O.): **B755**,
> **C224**, o resto da **C225**, **C228**, **C219**, **C230**.

## Fase 0 — medido no código (2026-10-16, main `a562ec39`, sonda `server/tests/sonda/e117fase0.js`, não versionada)

**C236 — reproduzido pelas rotas.** Entrada 10 → Saída 2 → devolução 2 → estorno da `ENTRADA_DEVOLUCAO`:

| Destino | Depois do estorno da entrada | Devolver de novo 2 | Saldo devolvível na tela |
|---|---|---|---|
| ESTOQUE | físico 8 (certo) | **400** *"… já foram devolvidos 2 e restam 0"* | **0** (o certo é 2) |
| QUARENTENA | físico 8, bloqueado **2** (o bloqueio da quarentena fica) | **400** | **0** |
| SUCATA | físico **6** (o certo é 8: a entrada estornada tira de novo o que já saiu pela sucata) | **400** | **0** |
| RETRABALHO | não há entrada (a devolução grava só `RETRABALHO`, neutro ao saldo) | — | 0 |

- As **três** contas do "restante" somam toda devolução: `returnService.validarSaidaOriginal` (`:31`), o `INSERT … WHERE
  EXISTS` de `registrarDevolucao` (`:164`) e `listarSaidasElegiveis` (`:389`). A régua "viva" existe só no estorno da saída
  (`stockService.DEVOLUCAO_VIVA_SQL`, interna, desde `00783173`).
- **Excluir a requisição** (`requisitionService.excluirSemTrava`) também soma toda devolução — por saída (`:1816`) e no ramo
  legado (`:1866`). Medido: entrega 2 → devolução 2 → estorno da entrada (físico 3) → excluir → físico **3** (o certo é 5).
- **Achado novo (vira C237):** estornar só a `ENTRADA_DEVOLUCAO` de uma devolução para **SUCATA** tira o material duas vezes
  (8 → 6). Estornar a perna `SUCATA` primeiro (físico 10: a devolução vira "para o estoque") e depois a entrada (8) dá o certo.
- QUARENTENA: o bloqueio da devolução (`BLOQUEIO`, `referencia = DEV-<id>`) fica de pé quando só a entrada é estornada — o
  físico está certo, o disponível fica 2 a menos até alguém estornar o bloqueio. Não corrompe o físico.

**C235 — reproduzido.** Entrada 5 → Saída 2 (físico 3) → estorno da Saída com o `INSERT` do livro forçado a falhar e uma Saída
de 5 do mesmo material disparada nesse instante (fora do contexto da seção) → a Saída de 5 passa (5 → 0), o desfazer subtrai 2
sem guarda → físico **−2**. Causa: no ramo de saída de `cancelarMovimentacao`, a seção `naTravaDoMaterial` (`:2937`) cobre o
crédito e as séries; o `INSERT` do livro (`:3107`), o `movimento_estorno_id` e o `catch` (`:3122`) rodam depois de soltar.

**Medido de passagem (vira C238, declarado):** o mesmo `INSERT` falhando no estorno de `BLOQUEIO` e de `AJUSTE` deixa o efeito
aplicado (bloqueado 2 → 0; físico 7 → 5) com `cancelado = 0` — esses ramos não têm desfazer nenhum. Só com falha de banco; não é
corrida (não depende da trava).

## Decisões (letra B)

- **B759 — C236: a devolução cuja entrada foi estornada deixa de contar no "restante", nas quatro contas.** A régua é a do
  estorno da saída (`DEVOLUCAO_VIVA_SQL`), movida para um módulo próprio (`services/almoxarifado/devolucaoViva.js`, sem
  `require` do app) e usada por `validarSaidaOriginal`, pelo `INSERT … WHERE EXISTS`, por `listarSaidasElegiveis` e pelas
  duas somas de `excluirSemTrava`. Devolução legada (sem `DEV-<id>`) e a de RETRABALHO continuam contando (conservador — não há
  entrada para estornar). **Descartado:** (a) recusar o estorno da `ENTRADA_DEVOLUCAO` pelo livro, como a
  `DEVOLUCAO_FORNECEDOR` (coerente com a linha de devolução que nunca some, mas tira a correção que existe hoje — quem
  registrou a devolução errada não teria como desfazê-la); (b) apagar ou marcar a linha da devolução no estorno da entrada (o
  estorno pelo livro passaria a escrever em tabela de outro serviço, e a lista de Devoluções perderia o histórico).
- **B760 — C237: a entrada de uma devolução para sucata não se estorna sozinha.** Estorno de `ENTRADA_DEVOLUCAO` com
  `referencia = DEV-<id>` cuja perna `SUCATA` (mesma referência) não foi estornada → **400 E1**, antes do claim; a condição
  também no claim (conferência e gravação num comando). Estornada a sucata, a entrada estorna. **Descartado:** estornar as duas
  pernas juntas (o estorno passaria a desfazer duas movimentações — motor novo, e a perna SUCATA tem regras próprias, como a
  do material reprovado); só avisar (o físico fica errado).
- **B761 — QUARENTENA fica como está.** Estornar só a entrada de uma devolução para quarentena deixa o bloqueio dela de pé (o
  físico certo, o disponível 2 a menos). Exigir o bloqueio estornado antes travaria a entrada para sempre quando a quarentena
  já foi liberada (o estorno do bloqueio recusa *"o bloqueio já foi desfeito"*). **Declarado (C239)**, com o que fazer.
- **B762 — C235: no estorno de Saída, o livro e o desfazer rodam dentro da seção da trava.** O `INSERT` da linha `ESTORNO` e
  o `movimento_estorno_id` passam para dentro da seção do ramo de saída; se falharem, o desfazer de séries, linha e físico roda
  ali dentro, antes de soltar (o `catch` de fora só desfaz o claim e recria as reservas, como hoje). São escritas simples —
  nenhuma pega a trava. **Descartado:** (a) só guardar a compensação (`quantidade_atual - ? WHERE … >= ?`): o desfazer que não
  cabe deixaria o crédito aplicado com o claim desfeito (o estado da 6b, fix round 1 — o segundo estorno credita de novo);
  (b) a trava em volta do estorno inteiro (trava em `recalcularStatusSobTrava`, que pega a mesma trava — não é reentrante).
  Os ramos de entrada já desfazem creditando (só aumenta o livre — a regra do CLAUDE.md, B441); ficam como estão.

### Acrescentadas pela revisão do plano (Fase 2 — ver o plano)

- **B763 — (R1) com série, o estorno da entrada da devolução devolve as séries à saída.** As séries da `ENTRADA_DEVOLUCAO` de
  uma devolução que citou a saída voltam a *Entregue* com o vínculo àquela saída (o material não voltou), e não a *Estornada*
  soltas. Sem isto a B759 criava uma regressão: excluir a requisição entrava sem série (invariante quebrado para sempre).
  **Descartado:** aplicar a régua viva só a material sem série e recusar a exclusão com série (deixava a C236 de pé para
  serializados).
- **B764 — (R2) a entrada da devolução é a primeira `ENTRADA_DEVOLUCAO` da referência, do mesmo material.** A Entrada v2 aceita o
  tipo com referência livre. **Descartado:** a v2 recusar referência `DEV-…` (muda contrato de rota usado por integração).
- **B765 — (R3) só o estorno concluído (`movimento_estorno_id`) mata a devolução, e só ele derruba a perna SUCATA da B760.** O
  claim `cancelado = 1` é provisório. **Descartado:** pôr o estorno da entrada inteiro sob a trava (a validação da devolução
  roda fora dela e leria o mesmo claim).

## Fora (declarado)

- **C238** — o estorno de BLOQUEIO, DESBLOQUEIO, AJUSTE e TRANSFERÊNCIA não desfaz o efeito se o livro falhar (medido para os
  dois primeiros tipos). Pré-existente, só com falha de banco, não é corrida. Candidata da próxima etapa.
- A lista de Devoluções não marca a devolução cuja entrada foi estornada (a linha continua lá, como histórico) — **D (117)**.
- RETRABALHO: a devolução para retrabalho não tem entrada; o estorno do `RETRABALHO` (neutro) não reabre o restante — **D (117)**.
- B755, C224, o resto da C225, C228, C219, C230 (dependem do P.O.).
