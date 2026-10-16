# Almoxarifado — Etapa 119: o que já valeu não se perde nem responde erro (plano)

> Origem: "Próxima tarefa detalhada — Etapa 119" do plano da 118 (**C249**, **C248**, **C242**). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa119-o-que-ja-valeu-nao-se-perde-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B774**,
> último C **C249**, última A **A66**. Esta etapa: **B775+**, **C250+**, **A67+**. Worktree `CRM-wt-e119`, branch `etapa-e119`
> (a partir da main `2490c67a`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a revisão fresca do plano (um agente, com sondas `e119r-revisao.js`, `e119r-notif.js`,
> `e119r-req.js`) achou 4 Important e 2 Minor, todos reproduzidos. **I-1** — a coluna única na série (`movimentacao_entrada_anterior_id`)
> só resolve **uma** devolução: E1 → S1 → D1 → S2 → D2 e os estornos ED2 → S2 → ED1 → S1 → E1 deixavam a série na entrada da D1 (a
> reativação da D2 sobrescrevia a coluna) e o estorno de E1 recusava → o desenho troca a coluna por uma **tabela** chaveada por
> (série, entrada que a reativou) — **RN-05b** nova, B776 reescrita. **I-2** — a RN-07 pulava o estorno da saída e passava sem desenho
> nenhum → passa a ser ED → S1 → E1, conferindo a série *Em estoque* com a entrada da devolução. **I-3** — a RN-04 só com
> `notificar_movimentacoes` não enfileira (fila vazia, teste vazio) → também `notificacoes_dest_entradas` (o teste já fazia). **I-4** — a
> T4 (i) dizia "o lote volta inteiro aos dois endereços": o estorno de saída com lote devolve tudo na linha da chave (spec 10) → a
> asserção é a soma do lote, não os endereços. **Minor 1** — a RN-02 passa antes do conserto (é guarda contra o crédito em dobro; a
> prova é a sabotagem). **Minor 2** — a T3 poderia ser galho (arquivos disjuntos); mantida sequencial: o arquivo de teste é um só e a
> etapa é pequena. E a T4 (iii) cabe: a entrega de requisição com lote pela rota `PUT /requisicoes/:id/entregar` reproduz a C249
> (`e119r-req.js`: 500, físico 6, A 0, B 3) — entra.

## Regras de negócio

"Débito falhando" = o N-ésimo `UPDATE estoque_saldo_almoxarifado … RETURNING id` forçado a falhar (gancho no `db.get`).
"Auditoria falhando" = o `INSERT INTO auditoria_log_almoxarifado` com a ação citada forçado a falhar uma vez (gancho no `db.run`).

- **RN-01 — a saída com lote que falha no 2º endereço devolve o 1º (C249).** Lote L1 em A (3) e B (3), Saída de 5 do lote com o
  2º débito falhando → **500**, físico **6**, A **3**, B **3**; de novo sem falha → **201**, físico 1, soma das linhas 1. Pela
  rota v2 e pelo motor (`registrarMovimentacao`).
- **RN-02 — a recusa por saldo do lote não devolve em dobro (C249).** L1 em A (1) e B (2), L2 em C (5) (físico 8), Saída de 4 do
  L1 → **400** *"Saldo insuficiente no lote L1. Disponível: 3 PC"*, A 1, B 2, C 5, físico 8.
- **RN-03 — a recusa cujo desfazer falha no meio também termina inteira (C249).** O cenário da RN-02 com o 2º crédito de volta
  (`UPDATE estoque_saldo_almoxarifado SET quantidade = … quantidade + ?`) falhando → **500**, A 1, B 2, físico 8.
- **RN-04 — o estorno concluído responde 200 mesmo com a auditoria de cancelamento falhando (C248).** Entrada 5 → estorno com a
  auditoria `CANCELAMENTO` falhando → **200** `{ success: true, estorno_id }`, `cancelado = 1`, físico 0, e o que vem depois roda
  (a notificação pendente da entrada vira `FALHA`, com `notificar_movimentacoes = '1'`); de novo → 400 *"Movimentação já
  cancelada"*.
- **RN-05 — desfeita a devolução e estornada a saída, a entrada original estorna (C242).** Entrada 2 (V1, V2) → Saída 2 →
  Devolução citando a saída com V1, V2 → estorno da `ENTRADA_DEVOLUCAO` → estorno da Saída → estorno da Entrada original →
  **200**, físico 0, V1 e V2 *Estornada*.
- **RN-05b — com duas devoluções encadeadas também (*Fase 2, I-1*).** Entrada 2 (V1, V2) → Saída S1 → Devolução D1 citando S1 →
  Saída S2 → Devolução D2 citando S2 → estornos ED2, S2, ED1, S1, E1 → todos **200**, físico 0, V1 e V2 *Estornada*.
- **RN-06 — o estorno da devolução que falha no meio deixa a série na entrada da devolução (C242).** O estorno da
  `ENTRADA_DEVOLUCAO` com o livro falhando → 500, V1 e V2 *Em estoque* com `movimentacao_entrada_id` = a da devolução; de novo
  → 200 e a cadeia da RN-05 segue até o fim.
- **RN-07 — a série reativada antes desta etapa fica como era (C242, legado).** Sem a linha da tabela (simulado: apagada), estorno
  da `ENTRADA_DEVOLUCAO` → estorno da Saída (V1, V2 *Em estoque* com a entrada **da devolução**) → estorno da Entrada original
  **400** com a literal de hoje — a **A67** acha.
- **RN-08 — a entrega de requisição com lote que falha no 2º endereço devolve o 1º (C249, outra porta).** Lote L1 em A (3) e B (3),
  requisição em separação com o item separado (5), `PUT /requisicoes/:id/entregar` com `lote_id` e o 2º débito falhando → 500,
  físico 6, A 3, B 3.
- **RN-09 — a série que nasceu sem entrada volta a sem entrada (*Fase 5, r1*).** Série com `movimentacao_entrada_id` `NULL`
  (regularização) → Saída → Devolução citando-a → estorno da `ENTRADA_DEVOLUCAO` → *Entregue* com a entrada `NULL` (não a da devolução).
- **RN-10 — o desfazer local do claim de série devolve cada endereço uma vez (*Fase 5, r1 e r2*).** Lote L1 em A (1, K1) e B (1, K2),
  L2 em C (1, K3); Saída de 2 do L1 com K1 e K3 → 400 (série de outro lote), tudo intacto; o mesmo com o 2º crédito de volta falhando
  → 500, físico 3, A 1, B 1, C 1, as três *Em estoque*.
- **RN-11 — a gravação da entrada anterior falhando não derruba a devolução (*Fase 5, r3*).** → 201, a série na entrada da devolução;
  desfeita a devolução e estornada a saída, a entrada original recusa como no legado (RN-07).

## Contrato congelado

Nenhum corpo nem literal muda. **C248:** `POST /movimentacoes/:id/cancelar` passa a responder 200 (o corpo de sempre) quando só a
auditoria `CANCELAMENTO` falha; o log registra `[almoxarifado] auditoria do cancelamento falhou (movimentacao ⟨id⟩): ⟨msg⟩`.
Interno: `claimSaldoDoLote(db, materialId, loteId, locPreferida, quantidade, { aplicados })`. Schema (Fase 2, I-1): tabela nova
`series_entrada_anterior_almoxarifado (id, serie_id, movimentacao_entrada_id, entrada_anterior_id, created_at, UNIQUE(serie_id,
movimentacao_entrada_id))` — gravada no vínculo série → entrada depois do livro (não-fatal), para cada série **reativada**; lida
por `reverterEntrada` com `saidaId`.

## Tasks (sort topológico)

- [x] **T1 — tronco (C249, motor)** `df037855` — `claimSaldoDoLote` com o acumulador do chamador, o desfazer do `ok: false` que consome;
  `server/tests/api/oQueJaValeuNaoSePerde.api.test.js` (RN-01..RN-03).
- [x] **T2 — tronco (C248, motor)** `5c661a56` — a auditoria `CANCELAMENTO` não-fatal; RN-04 no mesmo arquivo.
- [x] **T3 — tronco (C242, schema + séries)** `c098535c` — a tabela, o registro no vínculo do motor, `reverterEntrada` com `saidaId`,
  `desfazerReverterEntrada`; RN-05..RN-07 no mesmo arquivo.
- [x] **T4 — integração (cruza Movimentações, Estorno, Devoluções, Séries)** `86a6ace2` — `server/tests/api/oQueJaValeuIntegracao.api.test.js`:
  (i) pelas rotas: a saída com lote falha no 2º endereço → a mesma saída de novo passa → o estorno dela com a auditoria falhando
  → 200 → o lote volta inteiro ~~aos dois endereços~~ (a soma do lote — Fase 2, I-4) → uma saída de 6 do lote passa; (ii) pelas rotas, com séries: devolução pela
  lista de elegíveis → estorno da entrada da devolução → a saída de novo na lista → estorno da saída → estorno da entrada
  original 200 → nova Entrada com V1, V2 (reativa) → 201; (iii) pelo serviço: a entrega de requisição... **só se a montagem
  couber** (ver a Fase 2) — senão o cenário do motor da RN-01 cobre o serviço. *(Coube: entrou como RN-08 no arquivo da T1, pela
  rota `PUT /requisicoes/:id/entregar`; a (ii) faz duas voltas de devolução da mesma saída.)*
- [x] **T5 — fechamento** (skill `fechar-etapa`) — o commit de documentação desta etapa (ver `git log`).

Sem galho: T1, T2 e T3 mexem no motor/séries; a T4 só testa e depende das três. Sem tela.

## Execução — o que aconteceu

- **Fase 0** (sondas `e119fase0.js`, `e119fase0b.js`, não versionadas): C249 (500, físico 6, A 0 e B 3), C248 (500 com `cancelado = 1`;
  de novo *"Movimentação já cancelada"*) e C242 (o estorno da Entrada original 400) reproduzidos; o gêmeo da C248 no lançamento
  comum medido (500 com a Entrada no livro, físico 5) → **C250**, declarado.
- **Fase 2** — um revisor fresco, com sondas: 4 Important e 2 Minor, todos reproduzidos, tudo antes do primeiro commit de código
  (ver a divergência no topo). Design e plano `080fe87c`.
- **TDD:** os dois arquivos de teste escritos antes do código; 9 de 10 vermelhos (a RN-02 é a guarda contra o crédito em dobro),
  as 2 jornadas da T4 vermelhas. Para um commit por assunto com a suíte verde em cada um, os cenários da T2/T3 saíram do arquivo
  no commit da T1 e voltaram nos commits delas; a T4 ficou fora de `tests/api` até o seu commit.
- **T1** `df037855` — controle: o desfazer que não consome derruba RN-02 e RN-03; o motor sem o acumulador derruba RN-01 (as duas),
  RN-03 e RN-08.
- **T2** `5c661a56` — controle: 500 antes do conserto; o `catch` que sai cedo derruba a asserção do aviso (o que vem depois).
- **T3** `c098535c` — controle: o desfazer sem a entrada derruba RN-06; a chave só pela série (a coluna da Fase 2) derruba RN-05b;
  o motor sem gravar a linha derruba RN-05, RN-05b, RN-06 e a premissa da RN-07.
- **T4** `86a6ace2` — controle: vermelhas antes dos consertos; o motor sem gravar a linha derruba a (ii).
- **Cada commit de código teve a sua rodada completa:** T1 `test:api` 391/391, T2 391/391, T3 391/391, T4 392/392;
  `test:almoxarifado` 44/0, `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0, client 115 suítes / 1629 testes e
  `CI=true build` *Compiled successfully* nas quatro.
- **Fase 5** `f37cef55` — três revisores frescos em paralelo, cada um na sua worktree (removidas). **Regra e fluxo (r1):** nenhum
  Critical/Important; 2 Minor — (a) o `COALESCE` do estorno da devolução tratava "linha com entrada anterior NULL" (série nascida
  pela regularização) igual a "sem linha": a série ficava na entrada da devolução estornada → `CASE WHEN EXISTS` (**RN-09**); (b) o
  desfazer **local** do claim de série creditava as linhas num `for` e só zerava o rastreador no fim — com o 2º crédito falhando,
  o catch amplo creditava de novo (anterior à etapa; a forma da C249 um nível acima). Cadeias conferidas e corretas: quarentena,
  devolução parcial, Entrada avulsa com série *Entregue*, devolução para outro endereço, devolução sem citar a saída, reserva,
  origem estrita. **Concorrência e falha (r2):** o mesmo (b) como **Important** — **uma** falha de banco só, depois de uma recusa de
  negócio; com lote (A com 3 a mais) e **sem lote** (A 6, B 2 com físico 5) → o laço local consome o rastreador (**RN-10**); 1 Minor de
  falha **dupla** (o catch amplo que falha no meio do próprio desfazer não devolve o físico — anterior, declarado D (119)); a C248 nos
  nove tipos de estorno (200, o pedido reabre); corridas: 0/30 (duas saídas do mesmo lote) e 150/150 (cinco portas no meio do
  estorno da devolução). **Sabotagem (r3):** 34 sabotagens, 24 vermelhas, 9 equivalentes (motivo escrito por ele), **1 sem prova** —
  o `INSERT` da tabela nova é não-fatal mas nada o provava → **RN-11** (controle: o catch que relança a derruba); e o `linhas` do
  retorno de `claimSaldoDoLote`, sem leitor, removido. Controle das correções: RN-09 e RN-10 vermelhas antes (medido); as sondas dos
  revisores rodadas contra a árvore corrigida — só a falha dupla continua (declarada).
- **Fechamento** — a A67 conferida numa sonda (`e119a67.js`: acha os 2 legados, não acha os 2 novos); a C234 medida para a próxima
  (`e119c234.js`).
- **Suíte final (medida, depois de `f37cef55`):** `test:api` **392/392** arquivos; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 10/0; client **115** suítes / **1629** testes; `CI=true build` *Compiled successfully*.
- **Divergências do plano:** (1) a Fase 2 trocou a coluna pela tabela e trouxe a RN-05b e a RN-08; (2) a T4 (iii) entrou como RN-08
  pela rota de entrega (não pelo serviço); (3) a T3 podia ser galho (Fase 2, Minor 2) — ficou sequencial.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** de redesenho antes do código (Fase 2: a coluna → a tabela) e **1** no código (Fase 5). Nenhum teste antigo mudou de comportamento esperado.
2. **Achados da revisão:** Fase 2 — **4 Important + 2 Minor, todos reais** (reproduzidos). Fase 5 — **3 de produção** corrigidos (1 Important anterior à etapa — o desfazer local —, 1 Minor da etapa —
   a entrada anterior NULL —, e a remoção do `linhas` morto), **1** sabotagem sem prova → RN-11, **1** declarado (a falha dupla no catch
   amplo, D (119)), **9** sabotagens equivalentes, **0** ruído.
3. **Paralelismo:** **0** galhos (a T3 podia ser — Fase 2, Minor 2 — e ficou sequencial: um arquivo de teste e a etapa pequena);
   revisores em paralelo na Fase 5 (três, cada um na sua worktree).
4. **Defeito que escapou:** *(preenchido na Etapa 120)* **nenhum introduzido por esta etapa.** Dois erros de **medição** da "próxima tarefa" abaixo, achados pela 120: (a) "25 chamadas fora do motor" — o `grep` cobriu só `server/services`; com `server/routes` são **30** (não mudou a decisão); (b) a C234 foi descrita só pelo estorno da Saída, e a porta que dobrava **de verdade** era a exclusão da requisição (também com a série ligada, anterior a esta etapa — C251, achada pela Fase 2 da 120). Lição: medir o furo em **todas** as portas que leem o mesmo vínculo (`grep -n "movimentacao_saida_id"`), não só na que o achado nomeou. **Da Etapa 118:** **nenhum introduzido por ela.** Um anterior a ela, na **mesma forma** que ela corrigiu em
   `claimSaldoSemLote` (I-3) e declarou em `claimSaldoDoLote` (C249), escapou da revisão dela: o desfazer local do claim de série na
   saída, que zerava o rastreador só no fim (achado na Fase 5 desta etapa, r1 e r2; corrigido em `f37cef55`). Lição: quando um padrão
   de rastreador é corrigido num lugar, varrer **todos** os laços de compensação do mesmo motor (`grep -n "for (const l of"`).

## Próxima tarefa detalhada — Etapa 120

*(A série desta etapa foi B775–B777, C250, A67 — a 120 começa em **B778**, **C251**, **A68**; confira com `grep -oE` antes.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-16):** as features 🟡 continuam
00, 01, 05, 06, 21, 22 e 23; o motor (03) está 🟢. Candidatos:

1. **C250 — o lançamento gravado que falha na auditoria responde erro** (feature 03). **Medido nesta etapa** (`e119fase0b.js`, não
   versionada — recriar: Entrada de 5 pela rota v2 com o `INSERT INTO auditoria_log_almoxarifado` da ação `ENTRADA` falhando → 500,
   a linha no livro, físico 5). Quem repete lança duas vezes. Correção candidata (letra B, reversível): a auditoria depois do
   `INSERT` do livro em `registrarMovimentacaoSemTrava` não-fatal, como a B775 fez no estorno. **Ponto de atenção:** o comentário
   do motor declara a semântica "auditoria que falha derruba a resposta" congelada — e há chamadores que dependem do `throw` do
   motor para compensar o que fizeram antes (entrega de requisição por item, devolução em duas pernas, remessa, NC): medir cada um
   com a auditoria falhando antes de mudar (`grep -rn "registrarMovimentacao\w*(" server/services` → 25 chamadas fora do motor). **Não
   depende do P.O.**, mas é decisão registrada (B).
2. **C234 — a saída cujas séries voltaram por uma Entrada, estornada depois de desligar a série, devolve a quantidade em dobro**
   (feature 03/10). **Medido nesta etapa** (`e119c234.js`): Entrada 2 (V1, V2) → Saída 2 → Entrada avulsa com V1, V2 → com a série
   ligada o estorno da saída recusa (*"estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o
   material"*); desligada a série (`PUT /materiais/:id` com `controle_serie: 0`, 200), o estorno passa → **200, físico 4** (eram 2
   peças). Correção candidata: a conferência de "séries que reentraram" vale com a série desligada (as linhas das séries continuam
   lá); a tabela `series_entrada_anterior_almoxarifado` da 119 registra a reativação, mas não a saída de onde a série saiu — conferir
   se o vínculo `movimentacao_saida_id` apagado na reativação precisa ser guardado também. **Não depende do P.O.**
3. **C231** (a mensagem da aprovação que manda reativar o material quando a família está inativa) — pequeno, de texto.
4. **C246/C247** — só com transação de verdade (Postgres) ou um reparo no boot; o reparo automático do claim preso **depende do
   P.O.** (mexe no livro sem pedido de ninguém).
5. **Dependem do P.O.:** **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246**.

**Escolhida: C250 + C234 (o que já valeu não responde erro, no lançamento comum; e a saída cujas séries voltaram não estorna em
dobro com a série desligada).**

**Contrato candidato:** C250 — o lançamento gravado responde 201 com o corpo de sempre mesmo se a auditoria falhar (o log
registra); C234 — o estorno da saída cujas séries reentraram recusa com a literal de hoje (`MSG_SERIES_REENTRARAM`) também com a
série desligada. Nenhum corpo novo.

**Pontos de atenção:** a trava não é reentrante; molde de teste: `oQueJaValeuNaoSePerde.api.test.js` (ganchos no `db.run`/`db.get`);
para a C250, medir antes os chamadores que compensam por `catch` do motor (uma auditoria não-fatal faz o motor devolver sucesso, e o
chamador segue — conferir que nenhum deles conta com a exceção para desfazer algo que o motor já gravou de verdade).

**O que já está pronto e não precisa reabrir:** o rastreador de `claimSaldoDoLote`; a auditoria do cancelamento não-fatal; a tabela da
entrada anterior e o estorno da devolução que a lê; tudo da 118 (seção única do estorno, rastreadores, guardas de série dentro da
seção).
