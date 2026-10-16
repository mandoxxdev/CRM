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

- [x] **T1 — tronco** — `8072b497`. — RN-01..RN-07 em `routes/almoxarifado.js` (PUT) + `materialService.js`;
  `server/tests/api/controleSobATrava.api.test.js`. Os três cenários antigos de `controleComSaldo.api.test.js` que
  preparavam o estado "séries órfãs" com o **Almoxarife** desligando a série (`:119`, `:146`, `:281`) passam a desligar com
  o **Administrador** — o estado de partida que eles testam (religar) continua o mesmo; registrado no commit. Controle
  positivo: sabotagens (sem a trava no PUT; trava só para inativar; trava pega também no salvar sem controle — prova de que
  o renomear não espera; sem a guarda do desligar; guarda contando só `EM_ESTOQUE`; guarda para o Administrador também; sem
  a condição no `UPDATE`; releitura sem a E1; ordem E1 antes da 112).
- [x] **T2 — integração (cruza Materiais, Movimentações e Séries)** — `server/tests/api/controleSobATravaIntegracao.api.test.js`:
  (i) a mensagem da E1 → o Administrador desliga 200 → Saída 2 sem série 201 (as séries ficam — o declarado) → o
  Administrador religa → **Regularizar séries** baixa as 2 → o físico e as séries batem; (ii) o caminho do Almoxarife sem
  pedir a ninguém: Saída das 2 séries **com** série → presentes 0 → desliga 200; (iii) legado: controle ligado, físico 0,
  2 presentes → E1 → Administrador regulariza (baixa 2) → o Almoxarife desliga 200; (iv) pelo motor real: Entrada v2 sem
  lote com o PUT do Almoxarife disparado no meio dela → Entrada 201, PUT 403 da 112; o Administrador no mesmo cenário →
  200 e a Entrada **seguinte** sem lote → 400 "exige lote".
- [x] **T3 — fechamento** — o commit de documentação desta etapa (ver `git log`) (skill `fechar-etapa`): novidades (seção 115 + B745+, C225/C226 atualizados), spec 01, mapa,
  guia, manual (§ cadastro de material — controle por lote/série), plano + retro.

Galhos: nenhum (não há tela — o formulário já mostra a mensagem do servidor). Uma etapa só, suíte num SQLite.

## Execução — o que aconteceu

- **Design e plano:** `e60e34e1` (já com a correção da Fase 2).
- **T1** `8072b497` — 32 cenários (`controleSobATrava.api.test.js`) com a R1, a R2 e a R4 da Fase 2 dentro; 14 sabotagens,
  todas derrubando a asserção certa. Três cenários antigos de `controleComSaldo` (o Almoxarife desligava a série para preparar
  séries órfãs) passaram a desligar com o Administrador; o cenário de corrida de `entregaSeriePorItem` mudou de `[200, 409]`
  para `[200, 400]` (a regularização serializada pela trava — a segunda aba é recusada pela validação, com a conta; o limite
  é o mesmo).
- **T2** `0324037d` — 7 jornadas (`controleSobATravaIntegracao.api.test.js`), incluindo 3 rodadas da Entrada real pela v2 com
  o PUT disparado no meio dela e a asserção de que ele ficou **pendente** (R5); controle positivo junto com o da T1 (sem a
  trava derruba as 4 jornadas (iv)).
- **Fase 5** `385d938f` — três revisores frescos em paralelo, em worktrees próprias (removidas). **Concorrência** (corridas
  reais de 30 rodadas): as corridas da etapa 0/30 (controle positivo sem a trava: 5, 17 e 19 de 30 ruins); **2 Important**
  reproduzidos e corrigidos — o estorno de Saída com série cruzando o desligar recriava a C225 (26/30; o estorno lia o
  controle fora da trava → relê sob ela) e o renomear do Administrador religava calado o lote desligado por outra aba (16/30
  → a condição dos dois controles vale para todos, **B750**). **Regra e fluxo:** 1 Minor corrigido (a guarda prévia do
  desligar não relia o saldo de inativar — RN-07 invertida numa corrida); 1 Important **declarado** (**C233** — o formulário
  aberto há minutos desfaz o controle mudado por outra pessoa; a alegação da R4 estava larga demais). **Sabotagem:** 32
  novas, 18 derrubaram, 4 equivalentes/inalcançáveis, 10 sem prova → 11 cenários (`controleSobATravaSabotagem.api.test.js`);
  mais 4 de `controleSobATravaFase5.api.test.js`. Controle positivo das correções: 3 sabotagens + 2 do revisor, todas
  vermelhas.
- **Suíte final (medida, depois de `385d938f`):** `test:api` **380/380** arquivos; `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **115** suítes / **1623** testes; `CI=true build`
  *Compiled successfully*. *(A primeira rodada do `test:api`, antes do commit da T1, deu **377/378** — o cenário de corrida de
  `entregaSeriePorItem` esperava o 409; corrigido como descrito na T1.)*
- **Divergências do plano:** (1) a Fase 2 trouxe as variantes da E1, a RN-08 (regularização sob a trava) e a R4; (2) a **R4**
  dizia que o renomear ficava protegido contra o ligar de outra aba — **estava largo demais**: só dentro do próprio salvar
  (C233); (3) o plano não tinha o **estorno de Saída** como porta que cria séries (a R3 o declarou só pelo lado "não volta") —
  a Fase 5 mediu o lado pior e corrigiu; (4) o "Administrador não leva a condição" da 112 foi revisto para os controles lidos
  (B750); (5) uma sabotagem minha do controle positivo da Fase 5 foi aplicada por `perl` sem contar a âncora e caiu no bloco
  errado (três linhas iguais na guarda de ligar) — o "passou" era vazio; refeita pelo harness com âncora contada.

- [x] **T1** `8072b497` · [x] **T2** `0324037d` · [x] **Fase 5** `385d938f` · [x] **T3** — o commit de documentação desta etapa
  (ver `git log`).

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** no código (Fase 5: estorno, B750, releitura); **1** de redesenho antes do commit,
   pela revisão do plano (R1, R2, R4). Testes antigos que mudaram: 3 de preparo (`controleComSaldo`), 1 de corrida
   (`entregaSeriePorItem`, 409 → 400) e 1 da 112 invertido de propósito (B750).
2. **Achados da revisão:** Fase 2 — **6 reais** de 6 (R1–R6), nenhum que travava; Fase 5 — **3 de produção** (2 Important, 1
   Minor), **1 Important declarado** (C233), **10** sabotagens sem prova → 11 cenários, **0** ruído.
3. **Paralelismo:** **0** galhos (não há tela); revisores em paralelo (Fase 2 durante a escrita dos testes; Fase 5 três de uma
   vez), cada um na sua worktree, sem retrabalho.
4. **Defeito que escapou:** *(preenchido na Etapa 116)* nenhum de código; de documento, a C232 nomeava duas portas (estorno e devolução) e havia uma terceira — excluir a requisição — achada na Fase 5 da 116. E a revisão do plano da 116 achou, medindo, um defeito anterior às duas etapas: estornar a saída já devolvida contava em dobro (B756). Da Etapa 114: nenhum de código apareceu nesta etapa; de documento,
   nenhum — a Fase 0 confirmou as duas medições da próxima tarefa (4 ms aqui contra 3 ms lá, mesma conclusão).

## Próxima tarefa detalhada — Etapa 116

*(A série desta etapa foi B745–B751, C232–C233, A62 — a 116 começa em **B752**, **C234**, **A63**; confira com `grep -oE`
antes.)*

**Como foi escolhida (mapa `specs/modulo-almoxarifado/README.md` e os C abertos, medidos em 2026-10-15):** as features 🟡
continuam 00, 01, 05, 06, 21, 22 e 23. Candidatos:

1. **C233 — o formulário de material aberto há muito tempo desfaz o controle mudado por outra pessoa** (feature 01).
   **Medido na Fase 5** (revisor 1, rotas reais, sem gancho): material sem controle; o Administrador liga a série (200); o
   Almoxarife salva o formulário que abriu antes, `{ nome: 'Renomeado', controle_lote: false, controle_serie: false }` → **200**,
   série desligada calada; com 2 séries já entradas → **403 E1** (*"… Peça ao Administrador do almoxarifado para desligar o
   controle."*), que engana. O mesmo com o lote → 200, lote desligado. **Não depende do P.O.**
2. **C232 — estornar/devolver Saída com série depois de desligar não volta as séries** (feature 01/6b). Lido no código e
   confirmado pelo revisor 2: `cancelarMovimentacao` só chama `reverterSaida` com o controle ligado (agora relido sob a trava);
   a devolução não lista séries de material sem controle. **Não depende do P.O.** se a escolha for recusar o estorno de Saída
   com séries *Entregue* de material com a série desligada (caminho reversível; a alternativa — devolver as séries mesmo
   desligada — recria órfãs).
3. **C224** (aviso ao Administrador que liga com saldo), **C225-resto** (Administrador desliga com séries — a **B746** (c)),
   **C228**, **C219**, **C230** — **dependem do P.O.** **C221** (corrida rara de família) — baixo valor. **C231** (família inativa
   na mensagem do material inativo) — candidato pequeno, sem P.O.

**Escolhida: C233 + C232.**

**Contrato candidato (decisão — letra B, caminho reversível):**
- **C233:** o formulário de material passa a mandar, ao editar, `controles_lidos: { controle_lote, controle_serie }` — os
  valores de quando carregou o material. O `PUT /materiais/:id` compara **esses** valores (não o `current` da leitura dele) no
  `WHERE` dos dois controles; diferente do gravado → **409** com a literal nova *"O controle por lote ou por série do material
  ⟨código⟩ foi mudado por outra pessoa depois que você abriu o cadastro — nada foi gravado. Recarregue o material e salve de
  novo."* (ou reaproveitar a E4 — decidir medindo o toast). Sem `controles_lidos` (integração, cliente antigo) → o comportamento
  de hoje. **Descartado** de saída: `updated_at` como versão — o motor regrava `updated_at` a cada movimentação, e o formulário
  aberto recusaria por qualquer Entrada.
- **C232:** `cancelarMovimentacao` de Saída com séries vinculadas (`movimentacao_saida_id`) num material com a série
  **desligada** → 400 *"… religue o controle por número de série antes de estornar esta saída …"* (dentro da trava, onde o
  controle já é relido desde `385d938f`); a devolução fica como está (declarar).

**Pontos de atenção:** a trava não é reentrante — a recusa da C232 sai de dentro da seção que já existe no estorno (não pegar
outra); `controles_lidos` vem do body (forjável) — é proteção de concorrência, não de autorização (a guarda de perfil continua
lendo o gravado); o teste de tela do formulário (`MaterialAlmoxarifadoForm`) precisa provar que o payload leva os valores **de
quando abriu**, não os do state atual; a B750 já põe os dois controles no `WHERE` para todos — a 116 só troca a **fonte** do
valor esperado.

**O que já está pronto e não precisa reabrir:** o salvar sob a trava, a recusa do desligar com as três variantes, a
regularização e o estorno sob a trava (esta etapa); a guarda de ligar com saldo (112); inativar e reativar (113).
