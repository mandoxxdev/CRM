# Almoxarifado — Etapa 120: o lançamento que já valeu e a série que já voltou (plano)

> Origem: "Próxima tarefa detalhada — Etapa 120" do plano da 119 (**C250**, **C234**). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa120-o-lancamento-que-valeu-e-a-serie-que-voltou-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B777**,
> último C **C250**, última A **A67**. Esta etapa: **B778+**, **C251+**, **A68+**. Worktree `CRM-wt-e120`, branch `etapa-e120`
> (a partir da main `68557ed4`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a revisão fresca do plano (um agente, com sondas `e120r-c234.js`, `e120r-c234b.js`,
> `e120r-c250.js`, `e120r-exclusao.js`, não versionadas) achou 1 Critical, 1 Important e 4 Minor, os três primeiros
> reproduzidos. **Critical** — a T3 (ii)/(iii) era teste vazio: a Saída da entrega leva `requisicao_id`, e o estorno dela pelo livro
> recusa antes de qualquer guarda de série (*"Movimentação vinculada a requisição — use os fluxos da requisição
> (exclusão/encerramento)"*) — o 400 esperado já saía hoje. E a porta que **dobra de verdade** era outra: a **exclusão da
> requisição** cuja entrega teve as séries de volta por uma Entrada credita a quantidade sem série (200, físico 4 com 2 séries
> presentes) — com a série **ligada** (anterior à etapa) e desligada → **C251** nova, **B780**, task **T3** nova (RN-12..RN-14), e
> a integração refeita (agora **T4**). **Important** — a RN-08 dizia "não regride o que já passava": a regra nova recusa a saída
> quando a Entrada que trouxe as séries (avulsa ou da devolução) foi estornada com a série desligada (a C225 deixa as séries *Em
> estoque* com o físico 0; antes da etapa o estorno da saída passava e o estado voltava a bater por acaso). Filtrar "linhas de
> entrada não estornada" abriria o falso negativo (S → E2 → estorno de E2 ligada → E3 reativa → desliga → estorno de S dobraria) →
> a regra fica e o caso vira **RN-08b, declarado** (recusa; o caminho é um Ajuste). **Minor** — (1) a tela de Auditoria perde o
> lançamento inteiro, não só o ip/user_agent (`GET /auditoria?entidade=movimentacao` → `total: 0`) → o guia e o manual dizem;
> (2) a gravação da linha da reativação é não-fatal (119) → se falhar, a recusa não vê (declarado, D (120)); (3) a devolução
> QUARENTENA medida no design não tinha RN → **RN-05b**; (4) o cabeçalho de `origemMovimentacao.api.test.js` chamava a auditoria
> fatal de "semântica congelada" → corrigido dizendo que estava errado.

## Regras de negócio

"Auditoria falhando" = o `INSERT INTO auditoria_log_almoxarifado` com `entidade = 'movimentacao'` e a ação citada forçado a falhar
uma vez (gancho no `db.run`). "Desligar a série" = `PUT /materiais/:id` com `controle_serie: false` pelo Administrador (200).

**C250 — o lançamento que já está no livro responde sucesso mesmo com a auditoria falhando (B778).**

- **RN-01 — pela rota.** Entrada de 5 pela v2 com a auditoria `ENTRADA` falhando → **201** com o corpo de sempre
  (`{ id, saldo_anterior: 0, saldo_posterior: 5 }`), físico 5, **uma** linha no livro, nenhuma linha de auditoria dela; e o que
  vem depois roda (com `notificar_movimentacoes = '1'` e `notificacoes_dest_entradas` preenchido, o aviso da Entrada fica
  `PENDENTE` na fila).
- **RN-02 — pelo motor.** `registrarMovimentacao` com a auditoria `SAIDA` falhando resolve com `{ id, ... }` (não lança).
- **RN-03 — a falha ANTES do livro continua erro, sem nada gravado.** O `INSERT INTO movimentacoes_almoxarifado` da Entrada
  forçado a falhar → **500**, físico 0, livro vazio (o `try` novo não cobre o livro); e a recusa de negócio continua 400 com a
  literal de hoje (Saída de 9 com 5: *"Saldo insuficiente. Disponível: 5 PC"* — conferir a literal no teste).
- **RN-04 — a entrega de requisição não baixa duas vezes.** Requisição *Em separação* com 4 separados de 10; `PUT
  /requisicoes/:id/entregar` com a auditoria `SAIDA` falhando → **200** `status: 'ENTREGUE'`, físico 6, **uma** Saída,
  `quantidade_entregue` 4.
- **RN-05 — a devolução não fica "parcial" à toa.** `POST /devolucoes` ESTOQUE (2) com a auditoria `ENTRADA_DEVOLUCAO` falhando →
  **201**, físico +2, a devolução de pé, **nenhuma** auditoria `ESTADO_PARCIAL`.
- **RN-06 — o retalho não fica órfão.** `POST /sobras/gerar-retalho` (baixa 30 de 100, retalho 1) com a auditoria `ENTRADA_RETALHO`
  falhando → **201**, origem 70 (a baixa **não** estornada), retalho 1, **uma** sobra cadastrada.
- **RN-05b — a devolução em duas pernas (*Fase 2, Minor 3*).** `POST /devolucoes` QUARENTENA (2) com a auditoria do `BLOQUEIO`
  (a 2ª perna) falhando → **201**, físico 4, bloqueado 2, nenhuma `ESTADO_PARCIAL`.

**C234 — a saída cujas séries voltaram por uma Entrada não estorna com a série desligada (B779).**

- **RN-07 — todas voltaram.** Entrada 2 (V1, V2) → Saída 2 → Entrada avulsa V1, V2 → desliga a série → estorno da Saída →
  **400** *"estorno de saida recusado: series desta saida ja reentraram no estoque — a devolucao ja repos o material"*, físico 2,
  V1 e V2 *Em estoque*, a Saída não cancelada.
- **RN-08 — não regride o que já recusava ou passava.** (a) só V1 voltou → a mesma literal (a da 116, R3); (b) a Saída **sem**
  série feita depois de desligar → 200; (c) a Saída com as séries ainda fora → a E2 da 116 (religar).
- **RN-08b — declarado (*Fase 2, Important*).** Entrada 2 → Saída 2 → Entrada avulsa V1, V2 → desliga → estorno da Entrada avulsa
  (200, físico 0, as séries *Em estoque* — a C225) → estorno da Saída → **400** com a literal da RN-07. Antes da etapa passava (e o
  estado voltava a bater por acaso); agora recusa — recusar nunca conta em dobro. Caminho: um Ajuste.
- **RN-09 — a devolução desfeita não confunde.** Entrada 2 → Saída 2 → Devolução citando a saída com V1, V2 → estorno da
  `ENTRADA_DEVOLUCAO` (as séries voltam a *Entregue* nessa saída) → desliga → estorno da Saída → **400 E2** (religar), não a
  literal da RN-07 (físico 0: a devolução desfeita tirou de novo o que voltou); religa → estorno **200**, físico **2**, V1 e V2
  *Em estoque*. (A linha da reativação da devolução continua na tabela com `saida_anterior_id` = a saída; a série voltou a ela,
  então não pode contar como "reentrou".)
- **RN-10 — a guarda sob a trava também vê.** O desligar cai entre a leitura do estorno (fora da trava, série ligada) e o ramo de
  saída (molde: `estornoSemSerie.api.test.js` RN-08) com as séries já reentradas → **400** com a literal da RN-07, físico 2.
- **RN-11 — legado (sem a coluna).** A linha da reativação com `saida_anterior_id` `NULL` (simulado: `UPDATE … SET
  saida_anterior_id = NULL`) → o estorno passa como antes (200, físico 4) — premissa da **A68**, que acha a saída.

## Contrato congelado

Nenhum corpo nem literal muda. **C250:** as portas que lançam pelo motor respondem o sucesso de sempre quando só a auditoria do
lançamento falha; o log registra `[almoxarifado] auditoria do lancamento falhou (movimentacao ⟨id⟩): ⟨msg⟩`. **C234:** o estorno
da Saída de material com a série desligada recusa com `MSG_SERIES_REENTRARAM` também quando **todas** as séries dela voltaram por
uma Entrada. Schema: `series_entrada_anterior_almoxarifado.saida_anterior_id INTEGER` (no `CREATE` e por `safeAlter` para o banco
que já tem a tabela), gravada no mesmo `INSERT OR IGNORE` da 119 com `a.anterior.movimentacao_saida_id`.

**C251 — a exclusão da requisição cuja entrega teve as séries de volta por uma Entrada (*Fase 2, Critical*; B780).**

- **RN-12 — série ligada.** Requisição *Entregue* cuja Saída levou V1, V2; Entrada avulsa V1, V2; `DELETE /requisicoes/:id` →
  **400** *"⟨material⟩: as séries desta entrega já voltaram ao estoque por uma Entrada — excluir a requisição devolveria o saldo de
  novo. Encerre a requisição em vez de excluir."*, físico 2, 2 presentes, a requisição continua.
- **RN-13 — série desligada depois.** O mesmo com `controle_serie = 0` → **400** com a mesma literal, físico 2.
- **RN-14 — não regride.** As séries ainda fora → excluir **200**, físico 2, V1 e V2 de volta.

## Tasks (sort topológico)

- [ ] **T1 — tronco (C250, motor)** — `try/catch` com `console.warn` em volta do `registrarAuditoria` do fim de
  `registrarMovimentacaoSemTrava`; reescrever o comentário da Etapa 25 que declarava a semântica fatal (e dizer que mudou, B778).
  Testes `server/tests/api/lancamentoQueValeu.api.test.js` (RN-01..RN-06, RN-05b).
- [ ] **T2 — tronco (C234, schema + motor + estorno)** — a coluna, a gravação, `recusaDoEstornoDeSaidaSemSerie` olhando a
  coluna quando `baixadas === 0`. RN-07..RN-11 em `server/tests/api/serieQueVoltou.api.test.js`.
- [ ] **T3 — tronco (C251, exclusão da requisição; Fase 2)** — `requisitionService.excluirSemTrava`: sem série vinculada à Saída
  (ligada) ou sem série fora (desligada), lê a coluna da B779 e recusa antes da primeira ENTRADA. Testes
  `server/tests/api/exclusaoSerieQueVoltou.api.test.js` (RN-12..RN-14). Depende da coluna (T2).
- [ ] **T4 — integração (cruza Cadastro, Requisições, Devoluções, Movimentações, Estorno, Séries; refeita na Fase 2)** —
  `server/tests/api/lancamentoQueValeuIntegracao.api.test.js`: (i) **pela rota**: o cadastro com Saldo Inicial 5 e a auditoria
  `ENTRADA` falhando → 201, o material existe, físico 5, uma Entrada (antes: o material era **apagado** e a Entrada ficava órfã);
  (ii) **pela rota**: a entrega com a auditoria `SAIDA` falhando → 200 → a devolução dela (201) → o estorno da devolução (200),
  uma Saída só; (iii) **pela rota e pelo serviço**: a Entrada que traz as séries de volta com a auditoria falhando → 201 (C250) →
  uma Saída avulsa delas e a volta → desliga → o estorno da Saída avulsa recusa pela rota **e** pelo
  `stockService.cancelarMovimentacao` (C234) → a exclusão da requisição cuja entrega elas eram recusa (C251).
- [ ] **T5 — fechamento** (skill `fechar-etapa`).

Sem galho: T1 e T2 mexem no motor; a T3 depende da coluna da T2 (arquivo disjunto, mas a regra é a mesma — pela Fase 3, tronco);
a T4 só testa e depende das três. Sem tela. Testes de cada task num arquivo próprio (um commit por assunto com a suíte verde).
