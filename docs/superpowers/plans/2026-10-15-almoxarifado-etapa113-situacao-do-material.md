# Almoxarifado — Etapa 113: inativar material com saldo é recusado, e reativar confere a família (plano)

> Origem: "Próxima tarefa detalhada — Etapa 113" do plano da 112 (**C217 + C227**, com a **C220**; **C219 fora**, decisão do
> P.O.). Design com a Fase 0 medida: `docs/superpowers/specs/2026-10-15-almoxarifado-etapa113-situacao-do-material-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B732**,
> último C **C227**, última A **A59**. Esta etapa: **B733+**, **C228+**, **A60+**. Worktree `CRM-wt-e113`, branch
> `etapa-e113` (a partir da main `b1c25822`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a revisão fresca do plano achou 8 pontos (2 que travam). **R1/R5** — inativar
> material **sem** saldo deixa presos os fluxos que trariam saldo depois (conferência de inventário aberta que conta o
> material: o concluir recusa a conferência inteira; nota de pedido aberto: o processar recusa a nota inteira) e os
> inativos com saldo que já existem ficam invisíveis — nenhuma tela reativa. Escolhido: a lista ganha o filtro **Inativos**
> e o botão **Reativar** (RN-08, protegido pela RN-05); descartado: recusar inativar com inventário/nota/requisição aberta
> (uma regra por porta, e o material continuaria sem saída se a porta não for conferida). **R2** — o PUT grava `ativo`
> do `current` mesmo com a chave omitida: um salvar lido antes de o material e a família serem inativados reativava o
> material (C220 por corrida) → RN-04 (c). **R3/R4/R7** — o ⟨caminho⟩ do E1 errava com físico negativo, com físico 0 e só
> retenção, e mandava a Engenharia (sem `movimentar`) dar Saída → variantes no contrato. **R6** — "ativo" é
> `!!current.ativo` (NULL é inativo, como no motor); `{ ativo: false }` também inativa. **R8** — detalhes da T3 conferidos.

## Regras de negócio

- **RN-01 — inativar com saldo é recusado, para todos.** `DELETE /api/almoxarifado/materiais/:id` **e** `PUT
  /api/almoxarifado/materiais/:id` com `ativo` passando de ativo para 0, num material em que o físico ou qualquer retenção
  (reservado, bloqueado, em inspeção, em terceiros), arredondado a 6 casas, é ≠ 0 → **400** literal **E1**, nada gravado
  (nenhum campo), sem auditoria. Vale para Almoxarife, Engenharia, Administrador e superadmin. *Cenários:* os quatro perfis
  com saldo 5 (DELETE); PUT `{ ativo: 0 }` com saldo 5; saldo −2 (negativo também prende); ruído 0,1 + 0,2 → "0.3"; físico 5
  com 2 reservado e 1 em terceiros → a parte das retenções; material de cliente → o caminho do cliente; usuário sem perfil →
  403 do `editar_material`.
- **RN-02 — sem saldo, inativar é livre.** Físico e retenções arredondam a 0 (|x| < 5e-7) → 200 e audita `DESATIVACAO` (como
  hoje). Livro com movimentos, requisição pendente sem reserva e pedido de compra aberto **não** contam (B734). *Cenários:*
  saldo 0 com livro; resíduo 4e-7 → 200; requisição pendente → 200.
- **RN-03 — o que já está inativo continua como está.** `DELETE` de material já inativo (com ou sem saldo) → 200
  `{ success: true }` sem auditoria e sem escrita; `DELETE` de id inexistente → 200 `{ success: true }` (contrato da Etapa
  19, inalterado). `PUT` que edita outro campo de material inativo com saldo (ativo omitido ou 0) → 200.
- **RN-04 — a conferência vai no `UPDATE`.** O `UPDATE` que inativa (DELETE e PUT) leva `AND <tudo zero>` (as cinco colunas,
  `ROUND(COALESCE(c,0),6) = 0`); o do DELETE leva também `AND ativo = 1`. Não gravou → relê: DELETE — sumiu ou já inativo →
  200 sem auditoria; com saldo → **E1 com os números relidos**; senão → 409 **E2**. PUT — dono mudou → 409 da 108;
  inativação → **E1 relido**; controle → E1 da 112; família → 400 de hoje; senão → 409 E4 da 110. *Cenários injetados:* Entrada
  de 4 cai entre a leitura e o `UPDATE` do DELETE → 400 E1 "o saldo físico é 4", `ativo` continua 1; o mesmo pelo PUT; outra
  aba inativa na janela do DELETE → 200 e **uma** auditoria só.
  **(c)** O `UPDATE` do PUT leva **sempre** `AND ativo IS ⟨o lido⟩` (R2): um salvar que leu "ativo" antes de outra aba
  inativar não regrava o 1 — não gravou e nada mais explica → 409 **E4** da 110. *Cenários:* `PUT { nome }` com o material e a
  família inativados na janela → 409 E4, continua inativo; `PUT { ativo: 0 }` com outra aba inativando na janela → 409 E4
  (uma DESATIVACAO só).
  **(d)** O `UPDATE` que inativa (DELETE e PUT) roda sob `trava.naTravaDoMaterial` — o motor lê `ativo` e credita dentro
  da mesma trava desde a Etapa 97, então uma Entrada que leu "ativo" termina antes (e o saldo dela recusa o inativar) ou
  começa depois (e recusa material inativo). *Cenários:* segurar a trava do material → o DELETE e o PUT esperam, e veem o
  saldo que a "Entrada" deixou (E1 "4"); 12 rodadas de Entrada e DELETE disparados juntos → nunca inativo com saldo.
  *(Acrescentado na execução: o design declarava essa corrida como furo — **estava errado**, ver o design.)*
- **RN-05 — reativar confere a família.** `PUT` com `ativo` de 0 para 1, com `familia_id` (gravado ou do corpo) → as réguas de
  `validateFamiliaAtiva` e, se houver subfamília, `validateSubfamilia`, com as literais de hoje (**400**); e
  `condicaoFamiliaSql` no `UPDATE` com a releitura da 110. Sem família → livre. *Cenários:* família inativa (com e sem
  `familia_id` no corpo) → 400 *"Família inativa — não é possível vincular novos itens"*, `ativo` continua 0; subfamília
  inativa → 400 *"Subfamília inválida para a família selecionada"*; família ativa → 200; sem família → 200; a família é
  inativada na janela → 400 da família (releitura); legado com a sub no `familia_id` → 400 `FAMILIA_E_SUBFAMILIA`.
- **RN-06 — ordem das recusas no PUT.** 404 → troca de dono (403 da 108) → **E1 (inativar)** → E1 da 112 (controle) →
  família / subfamília / localização (400). *Cenários:* inativar + trocar dono pelo Almoxarife → 403 da 108; inativar com
  saldo + ligar lote → E1 de inativar.
- **RN-08 — a lista mostra os inativos e reativa (R1/R5).** `GET /api/almoxarifado/materiais?status=inativo` devolve só
  os inativos (`m.ativo IS NULL OR m.ativo <> 1`); sem `status` ou com os outros valores, só os ativos (como hoje). Na tela,
  o filtro de status ganha **Inativos**; a linha de material inativo mostra o selo **Inativo** e o botão **Reativar** (gate
  `editar_material`; confirma `Reativar o material "⟨nome⟩"?`; `PUT { ativo: 1 }`; sucesso → *"Material reativado"*;
  recusa → a mensagem do servidor, ou *"Erro ao reativar material"*), e esconde Requisitar, Entrada/Saída rápida e Inativar.
- **RN-09 — o estorno de movimento de material inativo é recusado (Fase 5).** `POST /movimentacoes/:id/cancelar` (e o
  `cancelarMovimentacao` chamado por dentro, fora a compensação interna) de material inativo → 400 *"Material inativo não pode
  ser movimentado"*, nada muda; o crédito do estorno de Saída leva `AND ativo = 1` (o material inativado na janela não
  recebe o saldo). *Cenários:* estornar a Saída que zerou um material inativado; estornar o Ajuste 5 → 2 de um material
  zerado e inativado; reativado, o estorno passa; inativado na janela entre a leitura e o crédito. *(Acrescentada na Fase 5:
  a revisão reproduziu o estorno devolvendo saldo a material inativo — o plano não tinha olhado essa porta.)*
- **RN-07 — a tela mostra a recusa.** O "Inativar" da lista de Materiais mostra no toast a mensagem do servidor
  (`err.response.data.error`); sem mensagem, *"Erro ao inativar material"* como hoje.

## Contrato congelado

`DELETE /api/almoxarifado/materiais/:id` — 200 `{ success: true }` inalterado. `PUT /api/almoxarifado/materiais/:id` — corpo e
200 inalterados. Recusas novas:

**E1 — 400** `{ "error": E1 }` (DELETE e PUT):

```
Não é possível inativar o material ⟨código⟩: o saldo físico é ⟨físico⟩⟨retidos⟩. Material inativo não pode ser movimentado, então esse saldo ficaria preso. ⟨caminho⟩
```

- ⟨físico⟩: arredondado a 6 casas, `String(Number)` (`5`, `-2`, `0.3`).
- ⟨retidos⟩: vazio se nenhuma retenção ≠ 0; senão ` (` + as ≠ 0, na ordem, separadas por `, ` + `)`: `reservado ⟨q⟩`,
  `bloqueado ⟨q⟩`, `em inspeção ⟨q⟩`, `em terceiros ⟨q⟩`.
- ⟨zerar⟩: físico < 0 → `zere o saldo com uma Entrada ou um Ajuste.`; senão, material de cliente → `devolva o saldo ao
  cliente ("Devolver ao cliente", em Materiais de Clientes).`; senão → `zere o saldo com uma Saída ou um Ajuste.`
- ⟨caminho⟩: com retenção e físico ≠ 0 → `Libere primeiro o que está retido e, depois, ⟨zerar⟩`; com retenção e físico 0 →
  `Libere o que está retido antes de inativar.`; sem retenção → `Antes de inativar, ⟨zerar⟩`.
- ⟨perfil⟩: vazio para quem tem `movimentar`; senão ` Seu perfil (⟨perfil⟩) não movimenta estoque: peça isso ao
  almoxarifado.` (a Engenharia — R4).

**E2 — 409** (DELETE, praticamente inalcançável): `O material ⟨código⟩ mudou enquanto era inativado — nada foi gravado.
Recarregue a lista e tente de novo.`

Funções novas em `services/almoxarifado/materialService.js`: `saldoQuePrendeInativacao(row)` → `null` ou `{ fisico, retidos:
[[rotulo, q]], cliente }` (lê de uma linha com as cinco colunas e o dono); `mensagemInativarComSaldo(codigo, preso)`;
`SEM_SALDO_SQL` (a condição do `UPDATE`). Assinatura final: `mensagemInativarComSaldo(codigo, preso, { podeMovimentar,
perfil })`.

## Tasks (sort topológico)

- [x] **T1 — tronco** — `082c210a`. — funções + guarda no DELETE e no PUT (inativar) + reativar confere a família + condições no `UPDATE` +
  releitura. `server/tests/api/situacaoMaterial.api.test.js` (RN-01..RN-06). Controle positivo: sabotagens (sem guarda prévia;
  sem condição no UPDATE; releitura sem E1; só o físico, sem retenções; sem arredondar; libera o Administrador; PUT sem a
  guarda; reativar sem família; reativar sem condição no UPDATE; DELETE audita sem `changes`).
- [x] **T2 — galho (tela)** — `e6671ce8`. — `MateriaisAlmoxarifado.js`: o toast do "Inativar" usa a mensagem do servidor (RN-07); filtro
  Inativos e Reativar (RN-08; o `status=inativo` do GET entra na T1). Teste em
  `MateriaisAlmoxarifado.test.js` com controle positivo (voltar ao toast fixo derruba).
- [x] **T3 — integração** — `9abef080`. **(v)** acrescentada na execução: a conferência aberta que conta um material
  inativado não conclui; reativar destrava (C228). — (cruza o DELETE com o motor, a devolução ao cliente e o PUT de família)** —
  `server/tests/api/situacaoMaterialIntegracao.api.test.js`: (i) Almoxarife: inativar com 5 → E1 → Saída de 5 → inativar 200 →
  Saída recusada "inativo"; (ii) material de cliente: E1 com o caminho do cliente → `POST /materiais-cliente/devolucoes` →
  inativar 200; (iii) reativar: família inativa → 400 → reativar a família (`PUT /familias/:id`) → reativar o material 200 →
  Entrada passa; (iv) reserva: requisição aprovada com reserva → E1 com "reservado" → cancelar → Saída → inativar 200.
- [x] **T4 — fechamento** — o commit de documentação desta etapa (ver `git log`) (skill `fechar-etapa`): novidades (seção 113 + B733+, C217/C220/C227 resolvidos, C228+, A60), spec
  01 e 13, mapa, guia, manual (§ cadastro e materiais de clientes), plano + retro.

Galho: só a T2 (tela contra o contrato congelado; mock só na fronteira HTTP). Executada em sequência pelo mesmo executor —
uma etapa só, suíte num SQLite.

## Execução — o que aconteceu

- **Design e plano:** `508eb6c4` (já com a correção da Fase 2).
- **T1** `082c210a` — 43 cenários; 20 sabotagens, todas derrubando a asserção certa. Uma não derrubava nada e foi dita no
  commit: o atalho "já inativo" do DELETE é redundante com o `ativo = 1` do `UPDATE` + a releitura (mantido por clareza).
  A guarda prévia do DELETE foi **retirada** (a condição do `UPDATE` e a releitura são a guarda; a prévia repetiria a mesma
  mensagem e nenhuma sabotagem a provaria). As duas sabotagens da trava só caem pelo cenário que segura a trava — a corrida
  real (12 rodadas) não acerta a janela sem ela.
- **T2** `e6671ce8` — 8 cenários de tela (mock só na fronteira HTTP); 8 sabotagens, todas vermelhas.
- **T3** `9abef080` — 5 jornadas; controle positivo (sem a condição de saldo caem 3; sem conferir a família, 1; só o físico, 1).
- **Testes antigos que mudaram de propósito:** `auditoriaAtosEGate` (RN-07 de material) e `permissoesRotas` (DELETE pelo
  Almoxarife) inativavam material com saldo 5 e 100 — o material do cenário passou a nascer zerado (B733).
- **Fase 5** `6ed479a6` — três revisores frescos em paralelo. **Regra (RN e fluxo):** 0 Critical/Important, 3 Minor sobre dados que o sistema não grava — o double exato 5e-7 é julgado diferente pelo JS (Math.round: 1e-6, recusa) e pelo SQL (ROUND: 0, livre), o meio-passo negativo (-1,5e-6) sai "-0.000001" na mensagem, e `ativo = 2` daria 409 E2 em loop e Reativar escondido na tela; **declarados, não corrigidos** (o schema só aceita 0/1/boolean e as quantidades já são gravadas a 6 casas). **Autorização e concorrência:** 1 Important reproduzido — o **estorno** de uma Saída devolvia saldo a material inativado (25/25) → **RN-09**, corrigido no motor; perfis e trava sem achado (40 rodadas Entrada × Inativar com atraso: nunca inativo com saldo); a compensação de `thirdPartyService.js:787` (aumenta `quantidade_em_terceiros` sem trava e sem conferir `ativo`) não reproduzida — fica anotada. **Sabotagem** (worktree própria, removida): 41 sabotagens novas, 20 derrubaram, 7 inalcançáveis (provadas), 14 sem prova → 14 cenários novos; 1 defeito Minor real (P2: a recusa do PUT que inativa e liga o lote saía como a do lote com uma Entrada na janela) → corrigido.
- **Suíte final (medida):** `test:api` **373/373** arquivos; `test:almoxarifado` **44/0**; `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **115** suítes / **1623** testes; `CI=true build` *Compiled successfully*.
- **Divergências do plano:** (1) a Fase 2 (topo) trouxe o Reativar e a condição `ativo IS` para dentro; (2) **RN-04 (d)**:
  o design declarava a corrida "Entrada × Inativar" como furo, dizendo que o motor não pega a trava do material — **estava
  errado** (o motor roda em `naTravaDoMaterial` desde a Etapa 97; a G87 já avisava que o CLAUDE.md estava desatualizado);
  o `UPDATE` que inativa passou a rodar sob a mesma trava e não sobrou furo de corrida; (3) a C228 ficou sendo o documento
  aberto (não a corrida, como o design previa).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** no código (os dois testes antigos que inativavam material com saldo); **1** de
   redesenho antes do commit, pela revisão do plano (Reativar e `ativo IS`).
2. **Achados da revisão:** Fase 2 — **8 reais** de 8 (R1–R8; R8 era conferência das rotas da T3), 2 que travavam;
   Fase 5 — **16 reais** (1 Important de produção: o estorno; 1 Minor de produção: P2; 14 cenários sem prova), 3 Minor declarados sem correção, **0** ruído.
3. **Paralelismo:** **0** galhos rodando em paralelo de fato (a T2 é galho pelo critério, executada em sequência pelo mesmo
   executor); revisores em paralelo na Fase 5, sem retrabalho.
4. **Defeito que escapou:** *(preencher na Etapa 114)*. Da Etapa 112: nenhum defeito descoberto depois do fechamento dela
   nesta etapa (a premissa errada do design desta etapa é da 113, não escape da 112).

## Próxima tarefa detalhada — Etapa 114

*(A série desta etapa foi B733–B739, C228–C229, A60 — a 114 começa em **B740**, **C230**, **A61**; confira com `grep -oE`
antes.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-15):** as features 🟡
continuam 00, 01, 05, 06, 21, 22 e 23. Candidatos:

1. **C229 — a requisição pendente de material inativado é aprovada sem reservar** (features 04/07, com a 01). **Medido**
   (sonda `server/tests/sonda/e113f0.js`, não versionada): requisição criada com o material ativo, material inativado
   (saldo 0 → 200), saldo de volta a 5, `PUT /requisicoes/:id/aprovar` pelo Administrador → **200 `APROVADO`,
   `reservas: []`**. O mecanismo: `requisitionService.js` (laço de reserva da aprovação, ~:333–356) chama
   `stockService.criarReserva`, que recusa material inativo; o `catch` só faz `console.warn` e marca `algumFaltou` —
   a recusa some. Depois a separação/entrega recusam material inativo. **Não depende do P.O.** (é recusar ou avisar com a
   mensagem certa).
2. **C228 — documento aberto de material inativado** (conferência e nota travam inteiras; a saída é o Reativar). Melhoria
   de mensagem/aviso — **depende do P.O.** se a resposta for recusar inativar com documento aberto (inverte a B734).
3. **C221** (outras escritas de família conferem e gravam em passos separados) — **medido nesta etapa** (sonda
   `server/tests/sonda/e113c221.js`): criar subfamília × inativar a raiz, 0 de 30 nas duas ordens; reativar subfamília ×
   inativar a raiz, **1 de 30**. Baixo valor (corrida rara, por tela de Configurações).
4. **C219** (Entrada manual sem documento de cliente) — **depende do P.O.** (muda a Etapa 8). **C216** (dono inexistente pela
   API), **C224** (aviso ao Administrador que liga controle — **depende do P.O.**: aviso ou recusa), **C225** (desligar a
   série).

**Escolhida: C229.** Consequência medida, por tela (o aprovador aprova e a requisição não anda), sem decisão de P.O.

**Contrato candidato (decisão — letra B, caminho reversível):**
- **(a)** `/aprovar`, `/aprovar-valor` e a aprovação automática **recusam** requisição com material inativo: 400
  *"A requisição ⟨número⟩ tem material inativo: ⟨códigos⟩. Reative o material (Materiais → Inativos) ou cancele a
  requisição."* — antes de qualquer reserva (as três portas pegam a trava da requisição, `comTravaDaRequisicao`).
- **(b)** aprovar e **avisar** (a resposta ganha `avisos`), deixando a requisição sem reserva — mais fraco: o aprovador
  não vê o aviso na tela de hoje (conferir).
- Medir antes: o que a separação, a entrega e a reserva de chegada (75) fazem com o item de material inativo; se a
  aprovação automática (sem usuário) pode recusar (para onde vai a requisição?); a tela de Aprovações (onde a recusa
  aparece).

**Pontos de atenção:** a trava da requisição e a trava por material (CLAUDE.md — a aprovação é uma das seis portas; a
recusa nova tem de vir **antes** de pegar a trava dos materiais ou dentro da seção sem reentrar); o `catch` do laço de
reserva também engole outras recusas legítimas (falta de saldo é o caso normal — não transformar em recusa).

**O que já está pronto e não precisa reabrir:** inativar com saldo e o Reativar (esta etapa); a guarda de ligar lote/série
com saldo (112); a corrida da família (110).
