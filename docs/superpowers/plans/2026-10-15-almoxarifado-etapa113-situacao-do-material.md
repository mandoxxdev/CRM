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

- [ ] **T1 — tronco** — funções + guarda no DELETE e no PUT (inativar) + reativar confere a família + condições no `UPDATE` +
  releitura. `server/tests/api/situacaoMaterial.api.test.js` (RN-01..RN-06). Controle positivo: sabotagens (sem guarda prévia;
  sem condição no UPDATE; releitura sem E1; só o físico, sem retenções; sem arredondar; libera o Administrador; PUT sem a
  guarda; reativar sem família; reativar sem condição no UPDATE; DELETE audita sem `changes`).
- [ ] **T2 — galho (tela)** — `MateriaisAlmoxarifado.js`: o toast do "Inativar" usa a mensagem do servidor (RN-07); filtro
  Inativos e Reativar (RN-08; o `status=inativo` do GET entra na T1). Teste em
  `MateriaisAlmoxarifado.test.js` com controle positivo (voltar ao toast fixo derruba).
- [ ] **T3 — integração (cruza o DELETE com o motor, a devolução ao cliente e o PUT de família)** —
  `server/tests/api/situacaoMaterialIntegracao.api.test.js`: (i) Almoxarife: inativar com 5 → E1 → Saída de 5 → inativar 200 →
  Saída recusada "inativo"; (ii) material de cliente: E1 com o caminho do cliente → `POST /materiais-cliente/devolucoes` →
  inativar 200; (iii) reativar: família inativa → 400 → reativar a família (`PUT /familias/:id`) → reativar o material 200 →
  Entrada passa; (iv) reserva: requisição aprovada com reserva → E1 com "reservado" → cancelar → Saída → inativar 200.
- [ ] **T4 — fechamento** (skill `fechar-etapa`): novidades (seção 113 + B733+, C217/C220/C227 resolvidos, C228+, A60), spec
  01 e 13, mapa, guia, manual (§ cadastro e materiais de clientes), plano + retro.

Galho: só a T2 (tela contra o contrato congelado; mock só na fronteira HTTP). Executada em sequência pelo mesmo executor —
uma etapa só, suíte num SQLite.
