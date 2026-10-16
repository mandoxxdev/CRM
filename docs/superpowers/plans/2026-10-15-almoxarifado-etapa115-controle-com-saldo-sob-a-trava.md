# Almoxarifado — Etapa 115: ligar e desligar o controle com saldo, sob a trava do material (plano)

> Origem: "Próxima tarefa detalhada — Etapa 115" do plano da 114 (**C226**, **C225**). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-15-almoxarifado-etapa115-controle-com-saldo-sob-a-trava-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-15): última B **B744**,
> último C **C231**, última A **A61**. Esta etapa: **B745+**, **C232+**, **A62+**. Worktree `CRM-wt-e115`, branch
> `etapa-e115` (a partir da main `21302298`); nenhuma outra etapa em paralelo.

> **Divergência registrada (Fase 2):** a revisão fresca do plano achou 6 pontos, nenhum que trava. **R1** (importante) — a
> E1 mandava pedir ao Administrador o gesto que **cria** o estado da C225, e no legado (físico 0 com séries presentes) o
> caminho certo é outro: o Administrador **baixa** as séries em *Regularizar séries* e o próprio Almoxarife desliga → a E1
> ganhou duas variantes (**E1b**, **E1c**) com o caminho, e o guia/manual dizem que, depois de desligar, nenhuma tela mostra
> as séries órfãs. **R2** (importante) — a regularização de séries lê `controle_serie` no começo e cadastra depois, fora da
> trava: um desligar no meio deixava séries *Em estoque* num material sem controle, por fora da E1 → `regularizarSeries`
> roda sob `naTravaDoMaterial` (**RN-08**, nova). **R3** (menor) — estornar (ou devolver) uma Saída com série depois de
> desligar não volta as séries, e o estorno lê o controle fora da trava → declarado (**C232**), fora do escopo. **R4**
> (menor) — o `UPDATE` só prendia a coluna de controle que ficava **ligada**: um renomear lido com a série desligada, gravado
> depois de outra aba ligar a série, apagava o ligar calado → para quem não regulariza, as duas colunas vão no `WHERE`,
> ligadas ou não (**RN-06**, 409 E4). **R5** (menor) — o cenário pelo motor real tinha de provar que o PUT ficou
> **pendente** no meio da Entrada → asserção `feitoNoMeio`. **R6** — confirmou os três testes antigos a mudar.

## Regras de negócio

"Muda o controle" = `controle_lote` ou `controle_serie` gravado (lido como 0/1) diferente do que o PUT grava (depois do
`bool01`). "Séries presentes" = séries do material com status `EM_ESTOQUE` ou `BLOQUEADA` (a régua da 112/61).
"Quem regulariza" = `can(user, 'ajustar_estoque')` (Administrador por perfil, Gestor e superadmin; o Gestor não edita
material, então na prática é o Administrador).

- **RN-01 — o salvar que muda o controle espera a trava do material (C226).** `PUT /materiais/:id` que liga ou desliga
  `controle_lote`/`controle_serie` grava o `UPDATE` dentro de `trava.naTravaDoMaterial(material)`. Com a trava segura por
  outro, a resposta só sai depois de ela ser solta. O salvar que **não** muda controle (nem inativa) continua fora da trava.
  *Cenários:* trava segura → o PUT que liga não responde enquanto ela está presa; trava segura → o PUT que só renomeia
  responde (200) com ela presa; trava segura → o PUT que desliga a série espera.
- **RN-02 — a Entrada que segurava a trava é vista (C226).** Quem não pode regularizar e liga o lote enquanto uma Entrada
  sem lote de 5 está gravando: o PUT espera, o `UPDATE` (régua da 112) vê o saldo e não grava → **403 da 112** (*"… há 5
  sem lote atribuído …"*), controle 0. Mesmo para a série (*"o físico é 2 e há 0 série(s) em estoque"*). O Administrador:
  200 depois da Entrada; o saldo dela fica sem lote (estado da C224). A Entrada que começa **depois** do ligar exige lote
  (*"O material ⟨código⟩ exige lote nesta movimentacao (controle por lote ligado)"*, 400 — a regra de hoje). *Cenários:*
  com a trava segura e a "Entrada" simulada dentro da seção (saldo gravado antes de soltar) → 403 E112; pelo motor real
  (Entrada v2 com o PUT disparado no meio dela, gancho na leitura do material pelo motor) → Entrada 201 e PUT 403, e nunca
  "PUT 200 + saldo sem lote com o lote ligado" para o Almoxarife.
- **RN-03 — desligar a série com séries presentes exige `ajustar_estoque` (C225).** `PUT /materiais/:id` que desliga
  `controle_serie` (1 → 0) de material com ≥ 1 série presente, por quem não regulariza → **403 E1**; nada gravado, sem
  auditoria. *Cenários:* Almoxarife e Engenharia com 2 *EM_ESTOQUE* → E1 "há 2"; 1 *EM_ESTOQUE* + 1 *BLOQUEADA* → E1 "há 2";
  só séries *ENTREGUE*/*BAIXADA* → livre; físico 0 com 2 presentes (órfãs de legado, controle ainda ligado) → **E1b**
  *(R1)*; físico −1 com 1 → E1b; físico 1 com 3 → **E1c** "baixar as 2"; físico 0,5 com 1 (nenhuma inteira a baixar) → E1a.
- **RN-04 — o Administrador desliga (C225, B728 invertida).** Quem regulariza desliga com séries presentes → 200; as
  séries ficam como estão (declarado). *Cenários:* Administrador por perfil e superadmin → 200, séries continuam
  *EM_ESTOQUE*.
- **RN-05 — sem série presente, desligar é livre.** Controle ligado com 0 séries presentes (físico > 0 de legado sem série,
  ou zerado) → qualquer perfil que edita desliga (200). Desligar o **lote** continua livre com saldo (B731). *Cenários:*
  físico 5 sem série → Almoxarife desliga 200; lote ligado com saldo em lote → Almoxarife desliga 200.
- **RN-06 — a conferência vai no `UPDATE` (corrida).** Para quem não regulariza e desliga a série, o `UPDATE` só grava se
  as séries presentes continuam 0 (`PRESENTES_SQL = 0` na condição) — junto com as condições de hoje (dono, família,
  controle da 112, `ativo IS ?`). Não gravou → relê na ordem de hoje e, depois do controle que liga, a E1 desta RN (se as
  presentes não são mais 0); senão o 409 E4 de hoje. *Cenário:* séries cadastradas na janela entre a guarda e o `UPDATE`
  (gancho na leitura da guarda) → 403 E1, controle continua 1. *(R4)* Para quem não regulariza, as **duas** colunas de
  controle vão no `WHERE` com o valor lido, ligadas ou não (a 112 só prendia a que ficava ligada): outra aba liga a série
  (ou o lote) na janela de um renomear → 409 E4 e o ligar dela fica.
- **RN-08 — a regularização de séries espera a trava *(R2, nova)*.** `POST /materiais/:id/series/regularizar` roda sob
  `naTravaDoMaterial`. *Cenários:* trava segura → não responde; o Almoxarife desliga no meio de uma regularização que
  cadastra 2 → o desligar espera e recusa E1 "há 2".
- **RN-07 — a ordem das recusas do PUT.** 404 → 403 troca de dono → 400 inativar com saldo → 403 ligar controle (112) →
  **403 E1 (desligar a série)** → 400 família/subfamília → localização. Ligar o lote com saldo sem lote **e** desligar a série
  com séries presentes no mesmo salvar → a 403 da 112 (só uma mensagem). *Cenários:* os dois juntos → a da 112; desligar
  a série com séries presentes **e** família inativa → E1.

## Contrato congelado

Corpos 200 inalterados. Nenhuma mensagem nova para a C226. Recusa nova, `{ "error": <literal> }`:

**E1 — 403** (`PUT /materiais/:id`, desliga a série com séries presentes, sem `ajustar_estoque`). Três textos *(R1)*,
pela conta ⟨k⟩ = `min(n, floor(n − físico))` — as que a regularização deixa baixar. **E1a** (k = 0):
```
Desligar o controle por número de série no material ⟨código⟩ exige a permissão "ajustar_estoque" (seu perfil: ⟨perfil⟩): há ⟨n⟩ série(s) em estoque. Depois de desligar, a saída não baixa essas séries, e elas continuam "Em estoque" depois que o material sai. Peça ao Administrador do almoxarifado para desligar o controle.
```
**E1b** (k = n — físico ≤ 0):
```
Desligar o controle por número de série no material ⟨código⟩ exige a permissão "ajustar_estoque" (seu perfil: ⟨perfil⟩): há ⟨n⟩ série(s) em estoque e o físico é ⟨f⟩. Peça ao Administrador do almoxarifado para baixá-las em Lotes e Séries → Séries → Regularizar séries; sem série em estoque, o controle pode ser desligado.
```
**E1c** (0 < k < n):
```
Desligar o controle por número de série no material ⟨código⟩ exige a permissão "ajustar_estoque" (seu perfil: ⟨perfil⟩): há ⟨n⟩ série(s) em estoque e o físico é ⟨f⟩. Peça ao Administrador do almoxarifado para baixar as ⟨k⟩ que não estão mais no estoque (Lotes e Séries → Séries → Regularizar séries) e para desligar o controle.
```
- ⟨perfil⟩: `getPerfilFromUser(req.user)` (a mesma da 112: `ALMOXARIFE`, `ENGENHARIA`). ⟨n⟩: séries presentes
  (`EM_ESTOQUE` + `BLOQUEADA`), inteiro. ⟨f⟩: o físico arredondado a 6 casas.

`materialService`: `desligaSerie(gravado, merged)` → boolean; `seriesPresentes(db, materialId)` → `{ presentes, fisico }`;
`mensagemDesligarSerieSemPermissao(codigo, { presentes, fisico }, perfil)`; `SEM_SERIE_PRESENTE_SQL` (condição do `UPDATE`, tabela sem
apelido); `mudaControle(gravado, merged)` → boolean (lote ou série, ligando ou desligando).

## Tasks (sort topológico)

- [ ] **T1 — tronco** — RN-01..RN-07 em `routes/almoxarifado.js` (PUT) + `materialService.js`;
  `server/tests/api/controleSobATrava.api.test.js`. Os três cenários antigos de `controleComSaldo.api.test.js` que
  preparavam o estado "séries órfãs" com o **Almoxarife** desligando a série (`:119`, `:146`, `:281`) passam a desligar com
  o **Administrador** — o estado de partida que eles testam (religar) continua o mesmo; registrado no commit. Controle
  positivo: sabotagens (sem a trava no PUT; trava só para inativar; trava pega também no salvar sem controle — prova de que
  o renomear não espera; sem a guarda do desligar; guarda contando só `EM_ESTOQUE`; guarda para o Administrador também; sem
  a condição no `UPDATE`; releitura sem a E1; ordem E1 antes da 112).
- [ ] **T2 — integração (cruza Materiais, Movimentações e Séries)** — `server/tests/api/controleSobATravaIntegracao.api.test.js`:
  (i) a mensagem da E1 → o Administrador desliga 200 → Saída 2 sem série 201 (as séries ficam — o declarado) → o
  Administrador religa → **Regularizar séries** baixa as 2 → o físico e as séries batem; (ii) o caminho do Almoxarife sem
  pedir a ninguém: Saída das 2 séries **com** série → presentes 0 → desliga 200; (iii) legado: controle ligado, físico 0,
  2 presentes → E1 → Administrador regulariza (baixa 2) → o Almoxarife desliga 200; (iv) pelo motor real: Entrada v2 sem
  lote com o PUT do Almoxarife disparado no meio dela → Entrada 201, PUT 403 da 112; o Administrador no mesmo cenário →
  200 e a Entrada **seguinte** sem lote → 400 "exige lote".
- [ ] **T3 — fechamento** (skill `fechar-etapa`): novidades (seção 115 + B745+, C225/C226 atualizados), spec 01, mapa,
  guia, manual (§ cadastro de material — controle por lote/série), plano + retro.

Galhos: nenhum (não há tela — o formulário já mostra a mensagem do servidor). Uma etapa só, suíte num SQLite.
