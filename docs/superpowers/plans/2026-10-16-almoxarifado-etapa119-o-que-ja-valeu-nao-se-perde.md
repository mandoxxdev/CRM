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

## Contrato congelado

Nenhum corpo nem literal muda. **C248:** `POST /movimentacoes/:id/cancelar` passa a responder 200 (o corpo de sempre) quando só a
auditoria `CANCELAMENTO` falha; o log registra `[almoxarifado] auditoria do cancelamento falhou (movimentacao ⟨id⟩): ⟨msg⟩`.
Interno: `claimSaldoDoLote(db, materialId, loteId, locPreferida, quantidade, { aplicados })`. Schema (Fase 2, I-1): tabela nova
`series_entrada_anterior_almoxarifado (id, serie_id, movimentacao_entrada_id, entrada_anterior_id, created_at, UNIQUE(serie_id,
movimentacao_entrada_id))` — gravada no vínculo série → entrada depois do livro (não-fatal), para cada série **reativada**; lida
por `reverterEntrada` com `saidaId`.

## Tasks (sort topológico)

- [ ] **T1 — tronco (C249, motor)** — `claimSaldoDoLote` com o acumulador do chamador, o desfazer do `ok: false` que consome;
  `server/tests/api/oQueJaValeuNaoSePerde.api.test.js` (RN-01..RN-03).
- [ ] **T2 — tronco (C248, motor)** — a auditoria `CANCELAMENTO` não-fatal; RN-04 no mesmo arquivo.
- [ ] **T3 — tronco (C242, schema + séries)** — a tabela, o registro no vínculo do motor, `reverterEntrada` com `saidaId`,
  `desfazerReverterEntrada`; RN-05..RN-07 no mesmo arquivo.
- [ ] **T4 — integração (cruza Movimentações, Estorno, Devoluções, Séries)** — `server/tests/api/oQueJaValeuIntegracao.api.test.js`:
  (i) pelas rotas: a saída com lote falha no 2º endereço → a mesma saída de novo passa → o estorno dela com a auditoria falhando
  → 200 → o lote volta inteiro aos dois endereços → uma saída de 6 do lote passa; (ii) pelas rotas, com séries: devolução pela
  lista de elegíveis → estorno da entrada da devolução → a saída de novo na lista → estorno da saída → estorno da entrada
  original 200 → nova Entrada com V1, V2 (reativa) → 201; (iii) pelo serviço: a entrega de requisição... **só se a montagem
  couber** (ver a Fase 2) — senão o cenário do motor da RN-01 cobre o serviço.
- [ ] **T5 — fechamento** (skill `fechar-etapa`).

Sem galho: T1, T2 e T3 mexem no motor/séries; a T4 só testa e depende das três. Sem tela.
