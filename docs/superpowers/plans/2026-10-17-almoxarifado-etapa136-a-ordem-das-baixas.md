# Etapa 136 (spec 05 + núcleo): a ordem das baixas da entrega (D (135)) e quatro pequenas do cadastro de usuários (C285, C287, C288, C289) — plano

> Origem: "Próxima tarefa detalhada — Etapa 136" do plano da 135. Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-17-almoxarifado-etapa136-a-ordem-das-baixas-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-17): última B **B876**, último C
> **C289**, última A **A83**. Esta etapa: **B877+**, **C290+**, **A84+**. Worktree `CRM-wt-e136`, branch `etapa-e136` (a partir da main
> `f064fbde`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) por um agente fresco **antes** de qualquer código de produção.
>
> **Fase 2 (um revisor fresco, sondas `scratchpad/e136/rev2-baixas.js` e `rev2-nucleo.js` no `testApp` e no `index.js` reais): 0 Critical, 3
> Important, 5 Minor — todos aceitos, antes de qualquer código de produção.** A afirmação de que a ordem não muda o disponível e de que a
> leitura fresca antes da primeira baixa nunca recusa o que a prévia aceitou conferida sem contraexemplo; com as três passadas nenhuma recusa
> sobra depois da primeira baixa. **I1** o V4 esperava A 1, B 3 — o automático prefere o padrão: **A 0, B 4**. **I2** com
> `permite_saldo_negativo` o motor não usa o claim do lote (grava a linha negativa) e o V7b dá 200 com as passadas — a RN-03 só soma os
> estritos no só lote quando o material **não** permite negativo (cenário N1, 200). **I3** o `PUT` com senha número **não derruba** o
> servidor (o `installProcessGuards` segura a exceção): a requisição **nunca responde** (C290) — o teste usa `AbortSignal.timeout`. **M1**
> C285 reproduzida 10/10 nas duas rotas; `finishUpdate` e o callback do `PATCH` viram `function` (`this.changes`), sem sincronizar
> perfis nem derrubar sockets quando nada gravou; a guarda só quando rebaixa/desativa; `changes = 0` com o alvo apagado no meio vira 403 (D).
> **M2** a RN-09 não quebra chamador. **M3** o `null` no `PUT` também contava como desativar — tratado como o `""` (RN-08). **M4** o
> teste da RN-05 é de fixação (passa no código de antes). **M5** o residual das séries é inalcançável (séries distintas `EM_ESTOQUE` do lote
> limitam o pedido) — declarado assim; o pedaço com o lote das séries sem endereço é só lote (passada 1), o excedente dele automático (2).
>
> **Trava de máquina:** `scratchpad/e136-lock.sh` (o mesmo diretório `maquina-testes.lock`). Um arquivo de teste de servidor por vez,
> inclusive os revisores; nunca `test:api` junto com o jest nem dois `test:api`.

## Regras de negócio

Termos: **pedaço** = uma chamada do motor na entrega (`pedacos` em `entregarSemTrava`). **Estrito** = pedaço com endereço (a origem
planejada, `origem_separacao_id`, ou a escolhida no payload — `origemEstrita`). **Só lote** = pedaço com lote e sem endereço (o lote
escolhido no payload ou o das séries, sem origem). **Automático** = sem endereço e sem lote (o motor escolhe: padrão, depois o de mais
saldo), ou o excedente acima da caixa de um item planejado, ou o pedido com `origem_automatica: true`. Literal estrita do motor (inalterada):
**E-END** = `⟨mat⟩: O saldo em ⟨cod⟩ (⟨s⟩) não cobre a quantidade (⟨q⟩) — a saída tiraria de outros endereços`.

- **RN-01 — os estritos de todos os itens saem antes de qualquer automático.** `entregarSemTrava` executa os pedaços em três passadas,
  cada uma na ordem do laço de hoje (os itens da requisição): **(0)** estritos, **(1)** só lote, **(2)** automáticos. Dentro de um item a
  ordem relativa dos pedaços não muda. Cenários (Fase 0), todos com `PUT /entregar` → **200** e o endereço planejado dando o planejado
  (a saída do item planejado com `localizacao_origem_id` = A no livro): **V1** (A 3, B 2, reservados 2 + 2, item 1 separado sem origem,
  item 2 de A; 2 + 2 → *ENTREGUE*, A 1, B 0, físico 1); **V1b** (o mesmo sem reserva); **V3** (item 1 na segunda rodada sem origem, item 2
  de A → *ENTREGUE*); **V4** (A padrão 3, B 5 → A 0, B 4 — Fase 2 I1); **V6** (B 1,5 e A 4; item 1 com 0,5 na caixa planejada em B e
  entrega de 3 — 0,5 de B e 2,5 automáticos —, item 2 de A 2 → passada 0: B 1, A 2; passada 2: o automático tira A 2 e B 0,5 → A 0, B 0,5,
  físico 0,5, *Parcialmente Atendida* — 3,5 de 4).
- **RN-02 — o só lote sai depois dos estritos.** **V7** (lote L em A 3 e B 2; item 1 `lote_id` L sem endereço 2, item 2 planejado em
  (A, L) 2) → 200; A dá 2 ao item 2.
- **RN-03 — a prévia conta, no só lote, o que os estritos do mesmo lote levam.** Antes do `checarOrigemItem` de cada só lote, o
  `pedidoPorOrigem` da chave `⟨m⟩|null|⟨L⟩` recebe a soma dos estritos `⟨m⟩|⟨endereço⟩|⟨L⟩` da mesma entrega (os só lote rodam numa
  segunda varredura, depois de todos os estritos validados) — **só em material sem `permite_saldo_negativo`** (Fase 2 I2: com a flag o
  motor grava a linha do lote negativa e não recusa; cenário N1 → 200). **V7b** (L só em A 2, mais 5 sem lote sem endereço; item 1 só lote L 2,
  item 2 (A, L) 2) → **400** `⟨mat⟩: Saldo insuficiente no lote ⟨L⟩. Disponível: 0 PC` **e nada mudou** (físico 7, nenhuma saída, entregue
  0 e 0). Metade positiva: com L em A 4 → 200.
- **RN-04 — o que já funcionava não muda.** **V2** (o planejado é o item 1) e **V8** (dois automáticos) → 200 com os mesmos saldos por
  endereço de antes; as suítes de origem (`substituicaoOrigem`, `separacaoOrigemPorItem`, `trocaSeparacao`, `entregavelDeIrmaos`) verdes
  sem mudar asserção.
- **RN-05 — a falha numa passada posterior deixa o que saiu registrado.** O registro da substituição (Etapa 63) e a limpeza da origem
  planejada (Etapa 59 RN-04) saem num `finally` **depois das três passadas**, para todo item que teve baixa. Cenário: item 1 planejado em A
  e entregue de B (substituição), item 2 automático; o motor falha (gancho no teste) na baixa do item 2 → 400, a saída do item 1 está no
  livro, **a substituição está registrada** e a origem planejada do item 1 foi limpa (todo o separado entregue).
- **RN-06 — integração pela rota e pelo serviço.** Separar (rota, com origem num e sem no outro) → entregar (rota) → livro (`localizacao_origem_id`
  da saída estrita = A, a automática sem endereço) → saldos por endereço → status; e o V6 pelo **serviço**
  (`requisitionService.entregarRequisicao`) → as mesmas baixas.

**Núcleo (o `index.js` real, molde `usuarioPelaApi.api.test.js`):**

- **RN-07 — senha que não é texto é recusada (C289).** `POST /api/usuarios` (depois do e-mail não texto, antes dos 6 caracteres): `senha`
  presente e `typeof senha !== 'string'` → **400** `Senha inválida: envie a senha como texto`, nada gravado (`1234567`, `[]`, `{}`,
  `true`). `PUT /api/usuarios/:id` (antes dos 6 caracteres): `senha` verdadeira (o falso continua "não muda a senha") e não texto → o mesmo
  400, a senha antiga continua entrando. **Medido (Fase 2 I3):** o `PUT` de hoje com
  `senha: 1234567` (ou `{}`, `true`) **nunca responde** — o `hashSync` lança no callback do `db.get` e o `installProcessGuards` segura a
  exceção: o processo fica de pé, nada gravado, o cliente espera até o tempo limite (**C290**, anterior, do núcleo); o `[]` cai no 400 dos 6
  caracteres. O teste prende o 400 com tempo limite no `fetch`.
- **RN-08 — `ativo` vazio ou nulo no `PUT` é ausente (C288; o nulo, Fase 2 M3).** `PUT` com `ativo: ""` ou `null` → mantém o que havia (1 continua 1, entra). Não conta como
  "desativar" (nem para a recusa do próprio usuário, nem para a trava do último super).
- **RN-09 — `ativo` na criação pela régua de sim/não (C287).** `POST`: ausente, `null`, `""` → 1 (a 135); `1`, `true`, `"1"`, `"true"` → 1;
  `0`, `false`, `"0"`, `"false"` → 0; qualquer outro (`2`, `"sim"`, `[]`, `{}`) → **400** `Ativo inválido: envie 1 (ativo) ou 0 (inativo)`,
  nada gravado. A resposta diz o número gravado. O `PUT` não muda (a tela devolve o que leu — um legado com `2` editado pela tela
  recusaria; D (136)).
- **RN-10 — a trava do último super conta no próprio comando que grava (C285).** O `UPDATE` do `PUT` (rebaixando ou desativando) e o do
  `PATCH /status` (desativando) levam a guarda `NOT (COALESCE(is_superadmin,0) = 1 AND ativo = 1) OR EXISTS (outro super com ativo = 1)`;
  nada gravado (`changes = 0`) → **403** com a literal de hoje da rota (`PUT`: *"Não é possível remover ou desativar o último Super
  Administrador ativo do sistema"*; `PATCH`: *"Não é possível desativar o último Super Administrador ativo do sistema"*). A conferência
  de antes continua (a mensagem cedo). Cenário: dois supers (o semente e S), cada um rebaixa o outro **ao mesmo tempo**
  (`Promise.all`, 10 rodadas, um par novo por rodada) → em toda rodada **um 200 e um 403**, e sobra exatamente um super ativo; o mesmo
  com o `PATCH` desativando. O `DELETE` não muda (D (136): a exclusão roda numa transação montada em texto; só um super exclui).

## Contrato congelado

- `PUT /api/almoxarifado/requisicoes/:id/entregar`: payload, sucesso e literais **iguais**; muda a **ordem** das baixas (estritos →
  só lote → automáticos) e a E-END não sai mais depois da primeira baixa; a recusa do só lote (`Saldo insuficiente no lote …`) passa a
  contar os estritos do mesmo lote.
- `POST /api/usuarios`: novos 400 `Senha inválida: envie a senha como texto` e `Ativo inválido: envie 1 (ativo) ou 0 (inativo)`; `ativo`
  `"true"`/`"1"`/`true` → 1, `"false"`/`"0"`/`false` → 0. `PUT /api/usuarios/:id`: o 400 da senha; `ativo` `""` = ausente; o 403 do
  último super também quando perde a corrida. `PATCH /api/usuarios/:id/status`: o 403 quando perde a corrida.

## Tasks (sort topológico)

- [x] **T1 — tronco (servidor do almoxarifado)** — `requisitionService.js`: as três passadas (RN-01, RN-02, RN-05) e a segunda varredura
  do só lote (RN-03). Teste `tests/api/entregaOrdemDasBaixas.api.test.js` (RN-01..RN-06; rota **e** serviço), escrito e rodado **vermelho**
  antes do código.
- [x] **T2 — núcleo** — `index.js` (RN-07..RN-10). Teste `tests/api/usuarioSenhaAtivoCorrida.api.test.js` (o `index.js` real, pasta vazia),
  vermelho antes.
- [x] **T3 — fechamento** — novidades (B877+, C290 se reproduzir, C285/C287/C288/C289 resolvidas, D (135) do endereço marcada, D (136),
  F (136), a seção da etapa, cabeçalho), spec 05, spec 23 (núcleo), mapa, guia, manual, este plano (retro, "Próxima tarefa detalhada —
  Etapa 137"), o "defeito que escapou" da retro da 135.

**Ordem:** T1 → T2, em série, eu mesmo. **Galhos em paralelo: 0** (o "um teste de servidor por vez" serializa; T2 é independente de T1
mas não paga uma worktree).

**Trava:** as passadas rodam **dentro** das travas de hoje (por requisição → por material, `comTravaDaRequisicao`); nenhuma porta nova
põe saldo no disponível — o CLAUDE.md **não** muda.

**Boot:** T2 mexe no `index.js` (rotas, não o boot) → o teste sobe o `index.js` real em pasta vazia. **Migração:** nenhuma.

**Controles positivos previstos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia): as passadas de volta a uma só
(RN-01/RN-02 caem); a passada 1 junto da 0 na ordem do item (V7 cai, V1 não); a segunda varredura do só lote sem somar os estritos (RN-03
cai pelo "nada mudou"); o `finally` só do item (RN-05 cai pela substituição); a guarda da senha fora (RN-07); o `""` cru no `PUT` (RN-08);
`ativo` cru na criação (RN-09); a guarda do `UPDATE` fora (RN-10 cai — conferir que o vermelho vem da corrida, não do cedo).

## Execução — o que aconteceu

- **Fase 0** — medida por mim: `scratchpad/e136/sonda-f0.js` (`testApp` real, rota) com dez estados (V1–V8, V7b): reproduzida a D (135) —
  e ela estava errada (a recusa era a estrita do motor, não *"a origem da separação não serve mais"*, e já na primeira rodada). O núcleo lido
  no código (`index.js`, `systemPermissions.js`).
- **Fase 2 antes do código de produção:** 0 Critical + 3 Important + 5 Minor, todos aceitos (ver o topo). Os dois testes novos foram escritos
  e rodados **vermelhos** antes do código: `entregaOrdemDasBaixas` 10/13 vermelhos (os 3 verdes prendem o que já valia — V2/V8, o outro lote,
  a RN-05 de fixação — e caem por sabotagem), `usuarioSenhaAtivoCorrida` 6/6 (a C285 reproduzida: `200/200` e zero super; o `PUT` com senha
  número sem resposta). Design e plano `739583d6`.
- **Commits:** T1 `d4f19bfa`; T2 `2797fd71`; Fase 5 `ddded5a2`; fechamento — o commit de documentação (ver `git log`).
- **Divergências do plano:** (1) o V6 termina *Parcialmente Atendida* (3,5 de 4), não *Entregue* — o plano errava a conta; (2) a corrida do
  último super não sai sempre `200/403`: o perdedor que passa da autenticação depois do vencedor já não é super e o campo some (`200` sem
  rebaixar), ou cai (`401`, desativado) — o teste prende a invariante (sobra um super ativo) e, desde a Fase 5, que todo `200` gravou; (3) o
  `chatSocketInativoNoServidor` ancorava no texto do `UPDATE` do `PATCH` e no `finishUpdate` em arrow — os dois cenários estáticos foram
  reancorados (no commit da T2); (4) o próprio super editando a si sem `is_superadmin` é tratado como rebaixamento (C291) — o cenário da RN-08
  manda o campo.
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia, `scratchpad/e136/bateria.js`): **14** antes
  da Fase 5 (S1–S6 do serviço, N1–N6 e N3b do núcleo — todas caem pelo cenário certo); e as **11** sobreviventes da Fase 5 (A10–A12, A17–A19,
  B4, B6, B7, B10, B12), rodadas de novo na worktree do r3 com os testes novos — todas caem.
- **Boot:** a T2 mexe em rotas do `index.js`, não no boot; o teste sobe o `index.js` real em pasta vazia. **Migração:** nenhuma.
- **CLAUDE.md:** a seção da trava **não mudou** — as passadas rodam dentro das travas de hoje (por requisição → por material) e nenhuma porta
  nova põe saldo no disponível.
- **Suíte antes dos commits de código (`d4f19bfa`, `2797fd71`):** `test:api` **452/452** (a primeira rodada deu 451/452 — o
  `chatSocketInativoNoServidor`, ver a divergência 3; reancorado e rodado de novo, 452/452); `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **133** suítes / **1780** testes; `CI=true build` *Compiled
  successfully*.
- **Fase 5** — três revisores frescos em paralelo sob a trava de máquina; o de sabotagem na worktree própria `CRM-wt-e136-r3` (removida com
  as junções desfeitas antes). As re-sabotagens das sobreviventes foram na worktree do r3 (o de regra fuzzava a minha).
  - **Regra (r1): 0 desta etapa.** Fuzz diferencial (`r1-fuzz-end.js`/`r1-fuzz-end2.js`, **3.169** entregas, código novo × `f064fbde` pelo
    mesmo caminho): nenhum 400 novo que mexa no estado (o antigo, 49), nenhum 200 que virou 400, totais iguais em todos os 200; **48** de 48
    baixas pela metade de antes viraram 200; os endereços diferem só no automático (agora depois dos estritos). Minor: quando duas recusas
    cabem, a de endereço sai antes da do só lote (registrado na B877); 8 casos da B204 (o automático sem lote negativa a linha sem lote)
    agora chegam ao fim (D (136)). Anterior: o `PUT` com `ativo` "true" grava cru (C293).
  - **Permissão (r2): 0 desta etapa.** Anteriores, reproduzidos: a **exclusão** em corrida zera os supers (6/6, **C292**) — a frase deste
    plano "o `DELETE` não muda (só um super exclui)" sugeria que bastava, e **estava errada**; o inativar com "true" desativa (C293).
  - **Sabotagem (r3): 47** sabotagens novas, **31** caíram, **16** sobreviveram: **9** por falta de cenário (viraram cenários em `ddded5a2` e
    caem), **5** equivalentes provadas (A2/A4/A7 — o automático sem lote não disputa linha de lote; A14 e A16 — chaves inalcançáveis; B14) e
    **2** quase equivalentes (B21 — o alvo com `ativo` nulo não entra; B17 — a ordem `ativo` × e-mail reservado no `POST`, não contratada).
- **Suíte final (depois da Fase 5, antes da documentação):** `test:api` **452/452**; `test:almoxarifado` **44/0**; `test:validation` 4/0,
  `test:safealter` 3/0, `test:sqlite` 10/0; client **133** suítes / **1780** testes; `CI=true build` *Compiled successfully*.
- **T3 — fechamento** (o commit de documentação): novidades (cabeçalho, B877–B883, C285/C287/C288/C289 resolvidas, C290 (resolvida),
  C291–C293, a D (135) do endereço resolvida e corrigida, D (136), F (136), a seção da etapa, "Onde estamos"), spec 05 (o bloco da Etapa 136
  com a correção da D (135)), spec 23 (a seção da Etapa 136 e o item da 135 marcado), mapa (linhas 05 e 23, a última atualização), guia
  (cabeçalho, seção, roteiro), manual (7.5 — a ordem das baixas no lugar da frase "baixados um a um", o só lote; 5.2e, 5.2g e 5.2h — a senha,
  o `ativo`, o último super), este plano, o "defeito que escapou" da retro da 135.

## Tasks — estado

- [x] **T1** `d4f19bfa` (Fase 5 `ddded5a2`) · [x] **T2** `2797fd71` (Fase 5 `ddded5a2`) · [x] **T3** — o commit de documentação.

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5: só cenários novos — nenhuma correção de código de produção). Testes antigos mudados:
   **1** arquivo — `chatSocketInativoNoServidor` (dois cenários estáticos reancorados no texto novo).
2. **Achados da revisão:** Fase 2 — **3 Important + 5 Minor, todos reais** (I2 e I3 reproduzidos por sonda). Fase 5 — r1 **0** desta etapa
   (2 Minor de documentação), **1** anterior (C293); r2 **0** desta etapa, **2** anteriores reproduzidos (C292, C293); r3 **9** sobreviventes
   reais (viraram cenários) + **7** equivalentes ou quase, provadas; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo (o "um teste de servidor por vez" serializa), **0** retrabalho; **1** revisor na Fase 2, **3**
   em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou:** *(preencher na Etapa 137)*.

## Próxima tarefa detalhada — Etapa 137

*(A série desta etapa foi B877–B883, C290–C293, nenhuma A — a 137 começa em **B884**, **C294**, **A84**; confira com `grep -oE` antes.)*

**Medido o mapa (`specs/modulo-almoxarifado/README.md`) para o almoxarifado:** o que falta para 🟢 nas features 🟡 é de produto ou do P.O.
(05: lista de separação, rota de picking, troca de série, kits, C198; 06: B11 e Engenharia; 21: valorização por cliente, previsto ×
realizado; 22: B13, B101/G30, G38; 01: a tabela de conversões e o grupo acima de família; 00 e 23: os itens com B aberta). A única
limitação livre que sobrou da 05 é a **D (136)** do automático com série — inalcançável pela revisão. **As candidatas livres do almoxarifado
acabaram**; as livres são do núcleo, todas reproduzidas nesta etapa.

**Escolhida: a exclusão do último super em corrida (C292, núcleo, principal).** `DELETE /api/usuarios/:id` confere "o último super"
(`wouldRemoveLastSuperAdmin`) e só apaga muitos `await` depois, numa transação montada em texto (`db.exec` com `BEGIN IMMEDIATE` … `DELETE
FROM usuarios WHERE id = ${targetId}` … `COMMIT`). Reproduzido pelo r2 (`scratchpad/e136/r2-nucleo2.js`): A apaga B × B apaga A → zero
supers 6/6; A apaga B × B rebaixa A pelo `PUT` → 6/6; **um super sozinho** apagando o outro e se rebaixando em duas abas → 6/6. **Caminhos
(decisão B reversível):** (a) um **gatilho** `BEFORE DELETE` (e `BEFORE UPDATE OF is_superadmin, ativo`) em `usuarios` com `RAISE(ABORT,
'ULTIMO_SUPER')` quando não sobraria super com `ativo = 1` — fecha as três portas no banco; **mas** é migração (prova de banco novo e
antigo, boot em pasta vazia), e os testes que zeram supers **de propósito** no arquivo (`superPadraoNoBoot` RN-01d e a recuperação do boot,
`promoverSuperPadraoSemSuperAtivo`) precisam continuar podendo — medir antes; (b) a guarda no próprio `DELETE` da transação
(`DELETE … WHERE id = X AND <GUARDA_ULTIMO_SUPER_SQL>`) seguida de uma conferência **dentro** da transação que aborte quando a linha não
saiu — o `db.exec` não devolve `changes`, então isso exige quebrar o `exec` em comandos sob a fila de escrita (`wrapDatabase`,
`enqueueWrite`) sem deixar outra escrita entrar no meio. Molde do teste: `usuarioSenhaAtivoCorrida.api.test.js` (`rodadaCruzada`).

**Junto, pequenas do núcleo (livres, reproduzidas nesta etapa):** **C291** (o super editando outro super sem `is_superadmin` o rebaixa:
`sanitizeSuperAdminPayload` grava 0 quando o campo falta — só normalizar quando ele vier; cuidado: o `POST` usa o 0 como padrão, e
`superPadraoNoBoot`/`usuarioPelaApi` editam sem o campo); **C293** (a régua de sim ou não no `PATCH /status` e no `ativo` do `PUT` — a tela
devolve o que leu: um legado com 2 editado pela tela não pode virar 400; decisão B).

**Dependem do P.O. — NÃO implemente:** **B853**/**C279**, **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**,
**C219**, **C230**, o reparo da **C246** (e a **C247**), a tabela de conversões e o grupo acima de família, a **régua do tempo de
recebimento (E2)**, a **C268**, a **C269**, **C275**, **C276**, **C277**; na 05, os itens de produto e a **C198**; na 06, a **B11** e a
Engenharia; na 21, a valorização por cliente e previsto × realizado; na 22, **B13**, **B101**/G30, **G38**; no Compras, D-35, D-37, D-78,
D-90, G9/G30, G4, G15, B63.

**O que já está pronto e não precisa reabrir:** a ordem das baixas da entrega (três passadas, `entregarSemTrava`) e a conferência do só lote;
a guarda do último super no `UPDATE` do `PUT` e do `PATCH` (`GUARDA_ULTIMO_SUPER_SQL` em `index.js` — reutilizável no `DELETE`); a régua
`ativoDaCriacao`; as literais `LITERAL_SENHA_NAO_TEXTO` e `LITERAL_ATIVO_INVALIDO`.
