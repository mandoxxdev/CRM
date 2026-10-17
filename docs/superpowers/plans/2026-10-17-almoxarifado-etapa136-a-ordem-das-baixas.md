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

- [ ] **T1 — tronco (servidor do almoxarifado)** — `requisitionService.js`: as três passadas (RN-01, RN-02, RN-05) e a segunda varredura
  do só lote (RN-03). Teste `tests/api/entregaOrdemDasBaixas.api.test.js` (RN-01..RN-06; rota **e** serviço), escrito e rodado **vermelho**
  antes do código.
- [ ] **T2 — núcleo** — `index.js` (RN-07..RN-10). Teste `tests/api/usuarioSenhaAtivoCorrida.api.test.js` (o `index.js` real, pasta vazia),
  vermelho antes.
- [ ] **T3 — fechamento** — novidades (B877+, C290 se reproduzir, C285/C287/C288/C289 resolvidas, D (135) do endereço marcada, D (136),
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
