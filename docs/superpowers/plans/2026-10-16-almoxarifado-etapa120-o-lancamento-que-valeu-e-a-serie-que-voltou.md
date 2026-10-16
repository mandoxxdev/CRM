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

- [x] **T1 — tronco (C250, motor)** `2e05c2ee` — `try/catch` com `console.warn` em volta do `registrarAuditoria` do fim de
  `registrarMovimentacaoSemTrava`; reescrever o comentário da Etapa 25 que declarava a semântica fatal (e dizer que mudou, B778).
  Testes `server/tests/api/lancamentoQueValeu.api.test.js` (RN-01..RN-06, RN-05b).
- [x] **T2 — tronco (C234, schema + motor + estorno)** `aa0b83e2` — a coluna, a gravação, `recusaDoEstornoDeSaidaSemSerie` olhando a
  coluna quando `baixadas === 0`. RN-07..RN-11 em `server/tests/api/serieQueVoltou.api.test.js`.
- [x] **T3 — tronco (C251, exclusão da requisição; Fase 2)** `051094a3` — `requisitionService.excluirSemTrava`: sem série vinculada à Saída
  (ligada) ou sem série fora (desligada), lê a coluna da B779 e recusa antes da primeira ENTRADA. Testes
  `server/tests/api/exclusaoSerieQueVoltou.api.test.js` (RN-12..RN-14). Depende da coluna (T2).
- [x] **T4 — integração** `54fb26a3` — (cruza Cadastro, Requisições, Devoluções, Movimentações, Estorno, Séries; refeita na Fase 2)** —
  `server/tests/api/lancamentoQueValeuIntegracao.api.test.js`: (i) **pela rota**: o cadastro com Saldo Inicial 5 e a auditoria
  `ENTRADA` falhando → 201, o material existe, físico 5, uma Entrada (antes: o material era **apagado** e a Entrada ficava órfã);
  (ii) **pela rota**: a entrega com a auditoria `SAIDA` falhando → 200 → a devolução dela (201) → o estorno da devolução (200),
  uma Saída só; (iii) **pela rota e pelo serviço**: a Entrada que traz as séries de volta com a auditoria falhando → 201 (C250) →
  uma Saída avulsa delas e a volta → desliga → o estorno da Saída avulsa recusa pela rota **e** pelo
  `stockService.cancelarMovimentacao` (C234) → a exclusão da requisição cuja entrega elas eram recusa (C251).
- [x] **T5 — fechamento** (skill `fechar-etapa`) — o commit de documentação desta etapa (ver `git log`).

Sem galho: T1 e T2 mexem no motor; a T3 depende da coluna da T2 (arquivo disjunto, mas a regra é a mesma — pela Fase 3, tronco);
a T4 só testa e depende das três. Sem tela. Testes de cada task num arquivo próprio (um commit por assunto com a suíte verde).

## Execução — o que aconteceu

- **Fase 0** (sonda `e120fase0.js`, não versionada): C250 reproduzida em cinco portas (v2: 500 e repetida → físico 10; entrega:
  500, entregue 0, a segunda → **duas Saídas**, físico 2; devolução ESTOQUE: 500 + `ESTADO_PARCIAL`; QUARENTENA: 500 com as duas
  pernas; retalho: 500, a baixa estornada e a entrada do retalho órfã); os 30 chamadores lidos (a 119 contou 25 — só `services/`);
  C234 reproduzida (200, físico 4). Conclusão: a C250 muda.
- **Fase 2** — um revisor fresco, com sondas: 1 Critical, 1 Important, 4 Minor (ver a divergência no topo). Design e plano `c8584af6`.
- **TDD:** os testes antes do código; RN-01, 02, 04, 05, 05b, 06 vermelhos (a RN-03 é guarda — passou antes, de propósito: a falha
  **antes** do livro); RN-07, 09, 10, 11 vermelhos (a RN-08 é não-regressão); RN-12 e RN-13 vermelhos (a RN-14 é não-regressão); as
  três jornadas da T4 vermelhas com o serviço de antes. Um arquivo de teste por task — cada commit com a suíte verde.
- **T1** `2e05c2ee` — controle: o catch que relança derruba RN-01, 02, 04, 05, 05b, 06; o que sai cedo derruba só a asserção do aviso.
- **T2** `aa0b83e2` — controle: a recusa sem a coluna derruba RN-07 e RN-10; só a guarda de dentro da trava derruba RN-10; o motor
  gravando NULL derruba RN-07 e RN-09; olhar a coluna antes das séries vinculadas derruba RN-09. Boot em pasta nova, duas vezes:
  0 *no such table / no column named / ALTER falhou*.
- **T3** `051094a3` — controle: o ramo ligado sem a conferência derruba RN-12; o desligado, RN-13.
- **T4** `54fb26a3` — controle: as três vermelhas com o serviço de antes; a recusa sem a coluna e a exclusão sem a conferência
  derrubam a (iii) nos pontos certos.
- **Cada commit de código teve a sua rodada completa:** `test:api` T1 393/393, T2 394/394, T3 395/395, T4 396/396; `test:almoxarifado`
  44/0, `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0, client 115 suítes / 1629 testes e `CI=true build`
  *Compiled successfully* nas quatro.
- **Fase 5** `969914b0` + CLAUDE.md `7b42108c` — três revisores frescos em paralelo, cada um na sua worktree (removidas).
  **Concorrência (r2):** 1 Important reproduzido — a exclusão validava as séries fora da trava do material (8/200 com físico 4; a
  forma anterior, desde a 116, 7/100) → a exclusão sob `comTravaDaRequisicao` (**B781**, **RN-15**; controle: sem a trava, físico 4);
  as falhas forçadas nas leituras novas e no `INSERT` da linha não deixaram estado errado (o `INSERT` falhando = o legado, declarado).
  O (d4) de `requisicaoGestosConcorrentes` (93) mudou de propósito: o `/aprovar-valor` disparado no meio agora espera (o
  `armarAguardando` de dentro do gancho travava — o gesto tem de partir do contexto do teste; virou regra no CLAUDE.md).
  **Regra e fluxo (r1):** 2 Important, ambos declarados — a Devolução citando a saída cujas séries voltaram, com a série desligada,
  credita em dobro (anterior; **C253**); e a RN-08b também na exclusão (**RN-14b**). **Sabotagem (r3):** 28 sabotagens, 23
  vermelhas, 1 equivalente (a coluna só pelo `safeAlter`), **4 sem prova** → RN-07 conta o claim (recusa antes dele), **RN-07b**
  (o `safeAlter` no banco da 119 — sem ele a C234 não valeria em produção), **RN-16** e **RN-16b** (a devolução desfeita na
  exclusão, ligada e desligada); e duas asserções reforçadas (o físico da RN-08 b; a literal da exclusão na integração). Controle
  das quatro: cada sabotagem do r3 derruba o teste novo pela asserção certa (medido).
- **Fechamento** — a A68 conferida numa sonda (`e120a68.js`: acha a saída cujas séries voltaram; não acha a de séries fora nem a de
  material sem série); a C252 medida (`e120c252.js`: o retalho com a Auditoria do evento falhando → 500 com a sobra gravada;
  repetido → duas sobras, origem 40).
- **Suíte final (medida, depois de `969914b0`):** `test:api` **396/396** arquivos; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 10/0; client **115** suítes / **1629** testes; `CI=true build` *Compiled successfully*.
- **Divergências do plano:** (1) a Fase 2 trouxe a T3 (exclusão, C251) e refez a integração (a do plano era vazia); (2) a Fase 5
  trouxe a B781 (a exclusão sob a trava) e mudou um teste da 93 de propósito; (3) a RN-08 "não regride o que já passava" estava
  errada — a RN-08b declara o caso que regride.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** de redesenho antes do código (Fase 2: a T3 e a integração refeita) e **1** no código
   (Fase 5). Um teste antigo mudou de comportamento esperado, de propósito: o (d4) da Etapa 93.
2. **Achados da revisão:** Fase 2 — **1 Critical + 1 Important + 4 Minor, todos reais** (os três primeiros reproduzidos). Fase 5 —
   **1** de produção corrigido (a exclusão fora da trava, r2), **2** declarados (r1: C253 e RN-14b), **4** sabotagens sem prova →
   teste, **1** sabotagem equivalente, **0** ruído.
3. **Paralelismo:** **0** galhos (as quatro tasks são do mesmo motor ou dependem da coluna); revisores em paralelo na Fase 5 (três,
   cada um na sua worktree).
4. **Defeito que escapou:** *(preencher na Etapa 121)*. **Da Etapa 119:** **nenhum introduzido por ela.** Um erro de **medição**
   dela: a "próxima tarefa" contou **25** chamadores do motor (`grep` só em `server/services`) — são **30** com `server/routes`;
   não mudou a decisão, mas é a forma de erro que a skill já descreve (medir sem cruzar). E a próxima tarefa dela apontava a
   integração da C234 pela Saída da entrega — que nem se estorna pelo livro (o teste vazio que a Fase 2 da 120 pegou).

## Próxima tarefa detalhada — Etapa 121

*(A série desta etapa foi B778–B782, C251–C253, A68 — a 121 começa em **B783**, **C254**, **A69**; confira com `grep -oE` antes.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-16):** as features 🟡
continuam 00, 01, 05, 06, 21, 22 e 23; o motor (03) está 🟢. Candidatos:

1. **C253 — a Devolução que cita a saída cujas séries voltaram por uma Entrada, com a série desligada, credita em dobro** (feature
   12/03). **Medido** pelo revisor r1 da 120 (sonda `e120r1-a.js`, não versionada — recriar: Entrada 2 (V1, V2) → Saída S → Entrada
   avulsa V1, V2 → `PUT /materiais/:id` com `controle_serie: false` → `POST /devolucoes` ESTOQUE de 2 com
   `movimentacao_saida_id = S` → **201, físico 4**; `GET /devolucoes/saidas-elegiveis` oferece S com `saldo_devolvivel: 2`, ligada
   ou desligada). Correção candidata (letra B, reversível): descontar do devolvível de S as séries que voltaram por uma Entrada
   **que não é a da devolução** (`series_entrada_anterior_almoxarifado` com `saida_anterior_id = S` e a entrada de tipo ≠
   `ENTRADA_DEVOLUCAO`), nas duas pontas (`validarSaidaOriginal` e `listarSaidasElegiveis`) **e** no `INSERT … WHERE EXISTS` da
   devolução (a conferência no comando, Etapa 116). **Pontos de atenção:** (a) a régua "viva" é uma só para as cinco contas do que já
   voltou de uma saída (`devolucaoViva.js`) — decidir se "voltou por Entrada" entra nela (o estorno e a exclusão já recusam por
   outra via) ou fica só na devolução; (b) o falso negativo medido na Fase 2 da 120: S → E2 (volta) → estorno de E2 com a série
   ligada (séries *Estornada*) → E3 reativa (a linha de E3 tem `saida_anterior_id` NULL, porque a série estava *Estornada*) — a linha
   de E2 é a única que cita S, e a E2 está estornada; não filtrar por "entrada estornada" sem medir isso; (c) a Entrada de volta
   estornada com a série desligada (RN-08b) — a C225 deixa as séries *Em estoque* com o físico 0. **Não depende do P.O.**
2. **C252 — as outras Auditorias fatais depois do fato** (fora do motor). **Medido** no retalho (`e120c252.js`: 500 com a sobra
   gravada; repetido → duas sobras, origem 40). `grep -rn "await registrarAuditoria\|audit.registrarAuditoria" server/services/almoxarifado
   server/routes` → **115** chamadas; a etapa que a pegar mede quais vêm **depois** de o ato estar gravado e quais o chamador usa para
   desfazer (o mesmo método da Fase 0 da 120). **Não depende do P.O.**
3. **C231** (a mensagem da aprovação que manda reativar o material quando a família está inativa) — pequeno, de texto.
4. **C246/C247** — só com transação de verdade (Postgres) ou um reparo no boot; o reparo automático do claim preso **depende do P.O.**
5. **Dependem do P.O.:** **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246**.

**Escolhida: C253 (a devolução não devolve de novo o que já voltou por uma Entrada) + a medição da C252 com a correção das que
o chamador lê como "nada aconteceu".**

**Contrato candidato:** C253 — `POST /devolucoes` citando S recusa com a literal de hoje *"Devolução acima do entregue: a saída
⟨S⟩ entregou ⟨q⟩, já foram devolvidos ⟨d⟩ e restam ⟨r⟩"* com o `restante` já descontado do que voltou por Entrada (ou uma literal
nova, a decidir na Fase 1 — registrar na B); `saldo_devolvivel` da lista de elegíveis com a mesma conta. C252 — as portas medidas
respondem o sucesso de sempre com a Auditoria do ato falhando (o log registra). Nenhum corpo novo.

**Pontos de atenção:** a trava não é reentrante; a exclusão da requisição agora segura a trava do material (B781) — gesto concorrente
em teste parte do contexto do teste, não de dentro do gancho (CLAUDE.md); molde de teste: `serieQueVoltou.api.test.js` (o desligar
pela rota) e `lancamentoQueValeu.api.test.js` (o gancho da Auditoria por `entidade`/`acao` — o gancho genérico por ação pega a
Auditoria de série antes do livro, achado do r2 da 120).

**O que já está pronto e não precisa reabrir:** a Auditoria do lançamento não-fatal; a coluna `saida_anterior_id` (gravada, migrada
por `safeAlter`, lida pelo estorno com a série desligada e pela exclusão); a exclusão sob a trava do material; tudo da 119.
