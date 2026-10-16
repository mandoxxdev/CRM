# Almoxarifado — Etapa 127: o perfil que saiu, e o separável dividido entre itens do mesmo material (plano)

> Origem: "Próxima tarefa detalhada — Etapa 127" do plano da 126 (**C264** + a Fase 0 do mapa). Design com a Fase 0 medida:
> `docs/superpowers/specs/2026-10-16-almoxarifado-etapa127-o-perfil-que-saiu-e-o-separavel-dividido-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B817**, último C
> **C264**, última A **A75**. Esta etapa: **B818+**, **C265+**, **A76+**. Worktree `CRM-wt-e127`, branch `etapa-e127` (a partir da main
> `2289b7d2`).
>
> **Ordem da skill:** este plano é revisado (Fase 2) **antes** de qualquer código de produção (os dois arquivos de teste da T1 foram
> escritos e rodados **vermelhos** antes — 6/10 —, sem tocar produção).
>
> **Fase 2 (um revisor fresco, sondas `e127r-fase2-*.js`, não versionadas, rodadas uma por vez, sozinho): 1 Critical, 2 Important,
> 4 Minor, todos aceitos.** A fórmula da RN-16 **não tem contraexemplo** contra a porta (seis estados medidos: rodada anterior nos dois
> irmãos, entrega parcial que consumiu reserva, frações, três irmãos com outro material no meio, reserva só no segundo, caixa maior que a
> reserva — o valor aceito em ordem inversa no payload e +0,01 recusado em cada um); "o livre é o mesmo para os irmãos" é verdadeiro
> (`disp - csrTotal`). **C1 (Critical)** — as duas linhas do contrato não bastam: o `refreshUser` não invalida nem regrava o cache de
> permissões (o boot semeou `ADMINISTRADOR` por 5 min para o administrador do sistema), e o `getEffectiveUser` com a regra nova faz o
> cache vencer — a RN-08 do `refreshUser` continuava vermelha (medido: 4/5); e o inverso, regressão nova: quem **ganha** o perfil e passa
> pelo `refreshUser` teria o perfil apagado pelo cache velho com `null` → o `refreshUser` passa a `invalidatePermissionsCache` +
> `seedPermissionsFromAuthUser`, como o `login` e o `applyFreshUser` (RN-08b nova). **I1** — material inativo com reserva: `teto` 0 e
> `propria` 4 dariam 4 → a RN-16 limita `propria` ao teto (`livre = max(0, teto - propria)`), e o inativo e o `!podeSep` entram com 0.
> **I2** — `separacaoTetoFisicoIntegracao.api.test.js:355` (I3 da 95) prende *"cada item mostra o seu teto (nao dividido na linha)"* →
> muda na T2, e a afirmação da 95 é corrigida à vista. **M1** — a RN-18 testava um estado que o servidor não produz (aviso "chegou" só em
> *Aguard. Estoque/Compra*, onde a parte própria é 0) → vira controle. **M2** — a fórmula exata do modal (`propria + max(0, livre - X)`).
> **M3** — as literais da RN-13 e da RN-19. **M4** — a RN-13 já dá 2 e 4 na fila hoje: é controle na fila.
>
> **Fora (depende do P.O.):** B808, B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da C246/C247, a tabela de
> conversões e o grupo acima de família; na 05, os itens de produto e a C198; na 06, a B11 e a Engenharia; na 21, a valorização por
> cliente; na 22, B13, B101/G30, G38.

## Regras de negócio

**C264 — o perfil retirado (núcleo, `client/src/utils/systemPermissions.js`).** Testes: `client/src/utils/mergeUserPermissions.test.js`
(RN-01..RN-05) e `client/src/context/AuthContextPerfilRetirado.test.js` (RN-06..RN-09, com o `AuthProvider`, o `permissionsCache` e a tela
de Configurações **reais**; só o HTTP mockado).

- **RN-01** — `mergeUserPermissions(base com 'ADMINISTRADOR', { perfil_almoxarifado: null, ... })` → `null`; `podeGravarConfigAlmox` falso. O
  outro perfil, presente, fica.
- **RN-02** — o mesmo para `perfil_frota: null` (`hasFrotaAdminPerfil` falso).
- **RN-03** — chave **ausente** (`{}`) ou `undefined` preserva os dois perfis (o boot sem servidor, `applyFreshUser`, `seedPermissionsFromAuthUser`).
- **RN-04** — perfil trocado por outro vale (o de antes; continua).
- **RN-05** — sem valor em nenhum lado → `null` (nunca `undefined`); perfil dado depois vale.
- **RN-06** — sessão aberta do administrador do sistema com `ADMINISTRADOR` guardado; o `/auth/me` diz `null` → ao recarregar, Configurações →
  Famílias mostra a árvore com a frase *"Somente leitura — cadastrar, editar, inativar e reativar famílias é do Administrador do almoxarifado
  ou do Super Administrador; peça a um deles."* e **sem** *Nova Família*; o `localStorage` guarda `null`.
- **RN-07** — controle: o `/auth/me` ainda diz `ADMINISTRADOR` → *Nova Família* lá, sem a frase.
- **RN-08** — usuário comum que perdeu o perfil → ao recarregar, *"Acesso restrito — administrador do Almoxarifado"*; e o `refreshUser` na
  sessão aberta (Minha Conta, cadastro de usuário) também tira (metade positiva: antes dele, *Nova Família* lá) — **Fase 2, C1:** o
  `refreshUser` invalida e regrava o cache de permissões.
- **RN-08b (Fase 2, C1)** — o inverso: usuário comum com o cache de `/usuarios/:id/grupos` dizendo `null` **ganha** o perfil e passa pelo
  `refreshUser` → `getEffectiveUser` devolve `ADMINISTRADOR` (o cache velho não apaga o perfil novo).
- **RN-09** — o cache de `/usuarios/:id/grupos` com perfis `null` → `getEffectiveUser` devolve os dois `null` (sem cache, o logado).

**Feature 05 — o separável dividido.** Testes: `server/tests/api/separavelDividido.api.test.js` (RN-10..RN-16),
`server/tests/api/separavelDivididoIntegracao.api.test.js` (RN-19) e `client/src/components/almoxarifado/RequisicoesSeparavelDividido.test.js`
(RN-17, RN-18). "Irmãos" = itens da **mesma** requisição com o **mesmo** material. `propria` = `max(0, r - c)` (a reserva ativa do item que
ainda não está na caixa); `livre` = `teto - propria`.

- **RN-10 — sem reserva** (C1 da sonda): material sem saldo, requisição com dois itens de 4, aprovada, depois **4** de entrada solta → a fila
  diz `separavel` **4** e **0**; as etapas `["SEPARAR", "AGUARDANDO_SALDO"]` (**B820**); a porta aceita **4 + 0** e recusa **4 + 4** com a
  literal de hoje (*"⟨material⟩: não é possível separar 4 PC. Máximo: 0 (pendente: 4, disponível: 0)"*).
- **RN-11 — reservados** (C2): 8 físicos, dois itens de 4, aprovada (reserva 4 + 4) → a fila diz **4** e **4** (como hoje — controle), só
  `["SEPARAR"]`; o detalhe dá `saldo_separavel` 4 e 4, `saldo_separavel_reserva` **4** e **4**; a porta aceita 4 + 4.
- **RN-12 — reserva parcial** (C3): 4 físicos, dois itens de 4, aprovada (reserva 4 no primeiro, 0 no segundo), +2 de entrada solta → a fila
  **4** e **2**; o detalhe `saldo_separavel` 6 e 2, `saldo_separavel_reserva` **4** e **0**; a porta aceita 4 + 2.
- **RN-13 — o item sem reserva primeiro** (**B821**; Fase 5 r3: este estado dá o mesmo em qualquer ordem — a ordem é presa pela RN-10 e pela RN-14): o item **sem** reserva primeiro (o segundo reservado, montado no banco) com o livre 2 → a fila
  **2** e **4** (**controle** na fila — Fase 2, M4: já dava isso; muda só o modal); a porta aceita 2 + 4 e recusa 3 + 4 com *"⟨material⟩:
  não é possível separar 3 PC. Máximo: 2 (pendente: 4, disponível: 2)"*.
- **RN-14 — o que não divide:** materiais diferentes (cada um o seu teto, como hoje); o item já todo separado (pendente 0) → 0 e não consome
  nada do pote; a caixa já separada de um irmão (rodada anterior) já está no teto de hoje (`caixa_outros`) — não conta duas vezes.
- **RN-15 — o detalhe:** `saldo_separavel_reserva` = `max(0, r - c)` arredondado (`Q.qtd`), só quando `saldo_separavel` vem (o mesmo
  `temCaixa`); `0` no material inativo (como o `saldo_separavel`). `saldo_separavel` e `quantidade_separavel` **não mudam** (são do item
  sozinho).
- **RN-16 — a função pura** `dividirSeparavel(itens)` (exportada de `requisitionService.js`): entrada `[{ id, material_id, pendente, teto,
  propria }]` na ordem do pedido; saída `Map(id → separavel)`; `propria = min(teto, propria)` (Fase 2, I1), `separavel = Q.qtd(min(pendente,
  propria + max(0, (teto - propria) - consumido)))`, `consumido += max(0, separavel - propria)`, por material. O material inativo e o
  status fora de `PODE_SEPARAR` entram com `teto` 0 (dão 0 e não consomem). Casos de unidade C1, C2, C3, a ordem inversa, a fração (0,3 +
  0,3 com livre 0,5 → 0,3 e 0,2) e o inativo reservado (teto 0, própria 4 → 0).
- **RN-17 — o modal** (`RequisicoesList.js`): o pré-preenchimento (`quantidadesIniciaisSeparacao`) dá, para C2, **4 e 4**; C3, **4 e 2**; C1,
  **4 e 0** (como hoje); o máximo de cada item, que decide o *"Motivo da divergência (opcional)"*, desconta dos irmãos só o que passa da
  parte própria deles (`separandoOutrosDoMaterial`); sem `saldo_separavel_reserva` (servidor antigo) a parte própria é 0 — a conta de hoje.
- **RN-18 — o aviso "chegou"** (`separavelAgoraPorItem`): a mesma conta, **sem efeito visível hoje** (Fase 2, M1: o aviso só aparece em
  *Aguard. Estoque/Compra*, onde a parte própria é 0) — o teste é controle (sem reserva, 4 livres, dois itens: só *"4 PC de …"*).
- **RN-19 — integração (rota e serviço):** para C1, C2 e C3, o que a fila diz (`GET /fila-separacao` **e** `listarFilaSeparacao` chamado direto)
  é exatamente o que a porta (`PUT /separacao`, a da tela) aceita na mesma ordem — e um centésimo a mais no segundo item recusa com
  *"⟨material⟩: não é possível separar ⟨q⟩ PC. Máximo: ⟨separável⟩ (pendente: 4, disponível: ⟨separável⟩)"* (C1: 0.01 / 0; C2: 4.01 / 4; C3:
  2.01 / 2); e o detalhe (`saldo_separavel`,
  `saldo_separavel_reserva`) reproduz a mesma divisão pela conta da RN-16.

## Contrato congelado

**Núcleo (cliente):** `mergeUserPermissions(authUser, extra)` — `perfil_almoxarifado`/`perfil_frota`: `extra.x !== undefined ? extra.x :
(base.x ?? null)`. E (Fase 2, C1) `AuthContext.refreshUser` passa a `invalidatePermissionsCache(fresh.id)` + `seedPermissionsFromAuthUser(fresh)`
depois de `setUser`, como o `login` e o `applyFreshUser`.

**`GET /api/almoxarifado/fila-separacao`** — forma inalterada. `itens[].separavel` passa a ser o **dividido** (RN-16) na ordem do pedido (a
consulta dos itens ganha `ORDER BY ir.requisicao_id, ir.id`); `etapas` calculadas com ele (B820). Nada mais.

**`GET /api/almoxarifado/requisicoes/:id`** — cada item que hoje traz `saldo_separavel` ganha `saldo_separavel_reserva` (número ≥ 0). Nenhum
campo muda de valor. Nenhuma recusa nova; nenhuma rota de escrita muda. **A porta (`PUT /separar`) não muda.**

## Tasks (sort topológico)

- [x] **T1 — tronco (núcleo, cliente)** `1f8910e5` — `systemPermissions.js` (as duas linhas) + `AuthContext.js` (o cache no `refreshUser`) + os dois
  testes (já escritos, vermelhos; a RN-08b nova). RN-01..RN-09.
- [x] **T2 — tronco (servidor)** `77385aaa` (com a T4) — `dividirSeparavel` + `listarFilaSeparacao` (ordem e divisão) + `normalizarItem` (`saldo_separavel_reserva`) +
  `separavelDividido.api.test.js`. RN-10..RN-16. **Muda** (Fase 2, I2): `separacaoTetoFisicoIntegracao.api.test.js` I3 (*"cada item mostra o
  seu teto (nao dividido na linha)"* → `[4, 0]`) e o comentário de `listarFilaSeparacao` — a afirmação da 95 corrigida à vista.
- [x] **T3 — galho (tela)** `e5e7938f` — `RequisicoesList.js` (`maxSeparavelNaTela`, `separandoOutrosDoMaterial`, `quantidadesIniciaisSeparacao`,
  `separavelAgoraPorItem`) + `RequisicoesSeparavelDividido.test.js`, contra o contrato (mock HTTP). RN-17, RN-18. Independente da T1 (outra
  regra, outro arquivo); depende só do contrato da T2.
- [x] **T4 — integração** `77385aaa` — `separavelDivididoIntegracao.api.test.js` (rota **e** serviço). RN-19.
- [x] **T5 — fechamento** (o commit de documentação desta etapa — ver `git log`) — novidades (B818+, C265, D (127), a D (95) corrigida), specs 05, 23 (C264) e 21 (o furo do checklist), mapa, guia,
  manual, plano (retro e "Próxima tarefa detalhada — Etapa 128"), o "defeito que escapou" da retro da 126. CLAUDE.md só se a trava mudar
  (não deve: nada aqui põe saldo no disponível nem reserva).

A suíte inteira roda **uma por vez**; revisores rodam só os próprios arquivos e nunca junto com a suíte (nem dois arquivos de servidor ao
mesmo tempo, nem jest junto).

## Execução — o que aconteceu

- **Fase 0** — dois agentes de leitura (05; 21 e 22) cruzados com as specs, e a sonda `e127fase0.js` (não versionada, rodada uma vez,
  sozinha): C1/C2/C3 no design. A C264 reproduzida em teste antes do código (**6/10** vermelhos).
- **Fase 2 antes do código de produção** (só os testes escritos antes): 1 Critical, 2 Important, 4 Minor, todos aceitos (topo). Design e
  plano `e245fd83`.
- **TDD:** T1 vermelho **6/10** antes do código (a RN-08b, escrita depois da Fase 2, passa no código antigo — ela prende a regressão que a
  correção só do merge criaria; a prova é a sabotagem 2). **Divergência:** os testes da T2, T3 e T4 foram escritos antes do código, mas só
  **rodaram depois** dele (passaram de primeira) — a prova são os controles positivos abaixo, todos pela asserção certa.
- **Controles positivos** (âncora contada = 1, md5 antes/sabotado/restaurado, restauro por cópia; `e127-sabota.js` no scratchpad): **11**.
  T1: (1) `perfil_almoxarifado` de volta ao `??` → 5 caem (RN-01, RN-06, RN-08…); (2) sem o invalidate/seed no `refreshUser` → RN-08 do
  refresh e RN-08b; (3) `perfil_frota` de volta ao `??` → RN-02 e RN-09. T2: (4) consumir a quantidade inteira → RN-16 C3, RN-12,
  RN-19 C3; (5) sem o limite da própria ao teto → RN-16 (teto 1/própria 3 e o inativo reservado); (6) a fila sem dividir → RN-10, RN-14,
  RN-19 C1; (7) `saldo_separavel_reserva` 0 → RN-11, RN-12, RN-13, RN-19 C2/C3; (8) sem o ramo inativo → RN-15. T3: (9) o irmão tira
  tudo → RN-17 C3 e o do motivo; (10) o máximo do modal sem a própria → **sobreviveu** (pediu o cenário do irmão acima do pote, Fase 2 M2
  — escrito, e agora cai); (11) `separandoOutrosDoMaterial` antigo → o do motivo. **Declarado, sem teste que derrube:** o `ORDER BY` da
  fila (o SQLite devolve na ordem do id sem ele; a forma fica, como na Etapa 27) e o ramo `separa ? … : 0` da própria na fila (o limite ao
  teto 0 já zera — dupla proteção).
- **Testes antigos que mudaram** (a afirmação da 95 corrigida, Fase 2 I2): `separacaoTetoFisicoIntegracao` **I3** (`[4, 4]` → `[4, 0]`) e
  **I4** (o M4 item 2: a fila 0, o detalhe 4; a recusa com o irmão na rodada).
- **Migração:** nenhuma (sem coluna, sem ledger) — a prova de primeiro boot não se aplica.
- **Suíte (medida depois do código, antes dos commits de código):** `test:api` **428/428**; `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **122** suítes / **1710** testes; `CI=true build` *Compiled
  successfully*.
- **CLAUDE.md:** a seção da trava **não mudou** (nada põe saldo no disponível nem reserva; a fila e o detalhe só leem). **Compras:** nada.
- **Fase 5** — três revisores frescos em paralelo sob a **trava de máquina** (`e127-lock.sh` no scratchpad: `mkdir` atômico em volta de
  cada execução de teste, sonda ou jest); o de sabotagem numa worktree própria (`CRM-wt-e127-r3`, removida com as junções desfeitas
  antes). Eu rodei só sob a mesma trava enquanto eles trabalhavam.
  - **Regra (r1):** fila, porta, detalhe e etapas resistiram (F1..F5: três irmãos, caixa acima da reserva, entrega parcial, frações —
    o número da fila aceito e +0,01 recusado). **1 Important, reproduzido:** a régua da **divergência** que a porta **grava**
    (`itens_json` da rodada) ainda tirava dos irmãos a quantidade inteira — reservados 4 + 4 separados 4 e 3, o modal pedia o motivo
    (máximo 4) e o servidor gravava `maximo: 0, divergente: false` (e o painel de quem confere, que só mostra as divergentes, sumia com a
    falta justificada). Antes da 127 os dois erravam juntos. **Corrigido:** a régua usa a mesma conta (`tiraDoLivre` por material, a
    própria lida no retrato do início da rodada) — 2 cenários novos (com o controle "só o item 2" que já acusava). A sabotagem "a base
    sem a própria" **sobrevive, equivalente**: a porta só aceita a rodada quando a soma dos excessos cabe no livre, então `outros ≤ livre`
    e as duas formas coincidem.
  - **Permissão (r2):** nenhum usuário passa a perder perfil que tem nem a ganhar um que não tem (todos os chamadores listados; o seed com
    `permissoes: []` só vale para quem já ignora as restrições de módulo; o servidor não mudou nesta parte). **2 Minor, reproduzidos:**
    (1) sem recarregar, para usuário comum, os botões **somem e voltam** — somem quando o cache de `/usuarios/:id/grupos` é relido, voltam
    quando ele expira (5 min) e o `getEffectiveUser` cai no usuário velho do contexto → **declarado** (D (127)); a correção (regravar o
    usuário do contexto quando o cache do próprio usuário chega) é do núcleo, candidata; (2) **regressão nova**: uma busca de permissões
    **em voo** no instante do `refreshUser` gravava o `null` velho depois do invalidate e apagava o perfil recém-dado → **corrigido** com a
    **geração** do cache (`permissionsCache.js`: invalidar incrementa; a busca de antes não grava) + RN-08c (a sabotagem do guarda a derruba).
  - **Sabotagem (r3):** **48** sabotagens (fora as 11 minhas), **27** sobreviveram: **14** buracos reais (cada um com sonda que passa
    limpa e cai com a sabotagem) → **13** cenários novos (9 no servidor, 4 na tela; o caso de fração 0,5/0,3 era **vazio** — `0.5 - 0.3 ===
    0.2` em JS — trocado por 0,3/0,1); **13** equivalentes ou inalcançáveis, provados (o seed sem o invalidate, `max(0)` de valores que
    nunca são negativos, `String()` de id inteiro, o `ORDER BY` no SQLite, o aviso "chegou" que só aparece sem reserva). Eu re-rodei 7 das
    14 contra os **meus** cenários (não só contra as sondas dele): todas caem pela asserção certa. E: a RN-13 **não** depende da ordem (o
    estado dá o mesmo nos dois sentidos) — quem prende a ordem é a RN-10 e a RN-14 (o `ORDER BY … DESC` as derruba); o título foi corrigido.
- **Fase 5, commits:** `0fe7a111` (a régua da divergência + os 9 cenários do servidor), `30ef3acb` (a geração do cache + RN-08c + os 4
  cenários da tela).
- **Suíte final (medida depois da Fase 5, antes da documentação):** `test:api` **428/428**; `test:almoxarifado` **44/0**;
  `test:validation` 4/0, `test:safealter` 3/0, `test:sqlite` 10/0; client **122** suítes / **1715** testes; `CI=true build` *Compiled
  successfully*. (Antes da Fase 5: 428/428, 44/0, 4/0, 3/0, 10/0, 122/1710, build ok.)

## Retro (4 números)

1. **Rodadas de correção até verde:** **1** (Fase 5: a régua da divergência, a geração do cache e 16 cenários). Testes antigos que mudaram
   de comportamento: o I3 e o I4 da 95 (a afirmação errada, à vista).
2. **Achados da revisão:** Fase 2 — **1 Critical + 2 Important + 4 Minor, todos reais**. Fase 5 — r1 **1** Important real (corrigido); r2
   **2** Minor reais (1 corrigido, 1 declarado); r3 **27** sobreviventes — 14 viraram cenários, 13 equivalentes provados; **0** ruído.
3. **Paralelismo:** **0** galhos em paralelo de fato (a T3 é galho por regra, mas a regra "um teste por vez" a serializa), **0** retrabalho;
   **2** agentes de leitura em paralelo na Fase 0 e **3** revisores em paralelo na Fase 5 sob a trava.
4. **Defeito que escapou:** **nenhum encontrado** (preenchido na Etapa 128): a 128 apoiou o ouvinte novo do cache na **geração** que a 127 criou (o cenário *"a busca de geração velha não chama"* passou com ela) e exercitou o `refreshUser` que invalida e regrava num lote com a busca em voo; o que achou no núcleo (o `localStorage` escrito no updater do `setUser`) é da própria 128. Ver o plano da 128.

**O "defeito que escapou" da 126** (preenchido aqui): **nenhum encontrado**. A 127 exercitou o que a 126 entregou — a aba Famílias somente
leitura pelo `podeGravarConfigAlmox(getEffectiveUser(user))`, agora com o `AuthProvider` e o `permissionsCache` reais
(`AuthContextPerfilRetirado.test.js`) — e ele se comportou como o contrato da 126. O que a 127 achou no caminho (o cache que o
`refreshUser` não renovava, a busca em voo) é **anterior** à 126, do núcleo.

## Próxima tarefa detalhada — Etapa 128

*(A série desta etapa foi B818–B822, C265, nenhuma A — a 128 começa em **B823**, **C266**, **A76**; confira com `grep -oE` antes.)*

**Medido em 2026-10-16 (Fase 0 desta etapa, design):** sem o P.O., sobram duas candidatas pequenas, e cabem juntas.

1. **Tempo médio de recebimento (feature 21) — a principal.** **Medido:** não existe (o único tempo médio do almoxarifado é o de
   atendimento de requisição, `reportService.js` ~752-760). Datas: `recebimentos…data_recebimento` (cabeçalho, `DEFAULT CURRENT_TIMESTAMP`,
   ninguém reescreve), `entrada_estoque_em` **por item** (marcada antes de mover o saldo, `receiptService.js` ~1391; volta a NULL só
   quando nada entrou, ~1596-1603; o estorno **não** a limpa), `conferencia_finalizada_em`, `compras_data` (ISO com `T`/`Z` — formato
   diferente; `julianday` aceita, mas teste), `faturamento_data`. **Contrato candidato:** um bloco novo no `GET
   /api/almoxarifado/relatorios/indicadores` (sem chave nova no registro): `tempo_recebimento: { media_horas, mediana_horas, considerados,
   incompletos }` — início `data_recebimento`, fim o **maior** `entrada_estoque_em` do recebimento; entram só os recebimentos completos
   (nenhum item com quantidade > 0 e `entrada_estoque_em` NULL; os outros contam em `incompletos`); a janela (`janela_dias`) vale pelo
   fim, como os outros blocos; reaproveitar `mediana()`; a nota do `indicadores` em `reportRegistry.js` ganha a régua; cartão opcional no
   `AlmoxarifadoDashboard`. **Depende do P.O.?** A **régua** é deduzida (nenhuma spec a define) → fazer **reversível** e registrar na
   **letra E** (a pergunta: "é da chegada à entrada no estoque, ou do pedido à chegada?"); a quarentena (vem depois da entrada) e o estorno
   (não tira da média) ficam declarados. **Pontos de atenção:** itens anteriores à Etapa 6 com NULL ficam fora; agregar por recebimento
   (MAX); o teste de molde é `relatoriosIndicadoresSpec27.api.test.js` (as suítes atuais percorrem as chaves **dentro** de cada bloco, não o
   conjunto de blocos).
2. **C209 (feature 05/17) — se couber.** A contagem por endereço abaixo do **reservado** não avisa (o `aviso_caixa` só olha a caixa sem
   reserva, `stockService.js` ~2442-2446). O desenho está no fim da próxima tarefa do plano da 104 (`aviso_retencao` no mesmo ponto do
   `aviso_caixa` quando o disponível fica negativo, reaproveitando as partes de `motivoRecusaAjustePorRetencao`, toast na tela de
   Movimentações). Aditivo; não toca a B704. **Não depende do P.O.** (a B711 só adiou).
3. **Candidata do núcleo, baixa:** o perfil que **pisca** sem recarregar (D (127), r2) — regravar o usuário do contexto quando o cache do
   próprio usuário chega. Mudança no `AuthContext`/`permissionsCache` (núcleo); só se sobrar.
4. **Dependem do P.O.:** **B808**, **B755**, **B761**/**C239**, **C224**, o resto da **C225**, **C228**, **C219**, **C230**, o reparo da **C246**
   (e a **C247**), a tabela de conversões e o grupo acima de família; na 05, os itens de produto (lista de separação, rota de picking,
   kits, troca de série) e a **C198** (B505 (ii)); na 06, a **B11** e a Engenharia; na 21, a valorização por cliente; na 22, **B13**,
   **B101**/G30, **G38**.

**Escolhida: o tempo médio de recebimento (1)**, com a C209 (2) se couber com qualidade.

**O que já está pronto e não precisa reabrir:** a divisão do separável na fila, no detalhe, na janela e na régua da divergência
(`dividirSeparavel`, `saldo_separavel_reserva`, B819–B821); o perfil retirado ao recarregar e o cache renovado no `refreshUser` (B818).
