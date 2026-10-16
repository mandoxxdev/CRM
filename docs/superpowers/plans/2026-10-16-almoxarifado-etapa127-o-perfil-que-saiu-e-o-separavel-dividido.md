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
- **RN-13 — a ordem é a do pedido** (**B821**): o item **sem** reserva primeiro (o segundo reservado, montado no banco) com o livre 2 → a fila
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

- [ ] **T1 — tronco (núcleo, cliente)** — `systemPermissions.js` (as duas linhas) + `AuthContext.js` (o cache no `refreshUser`) + os dois
  testes (já escritos, vermelhos; a RN-08b nova). RN-01..RN-09.
- [ ] **T2 — tronco (servidor)** — `dividirSeparavel` + `listarFilaSeparacao` (ordem e divisão) + `normalizarItem` (`saldo_separavel_reserva`) +
  `separavelDividido.api.test.js`. RN-10..RN-16. **Muda** (Fase 2, I2): `separacaoTetoFisicoIntegracao.api.test.js` I3 (*"cada item mostra o
  seu teto (nao dividido na linha)"* → `[4, 0]`) e o comentário de `listarFilaSeparacao` — a afirmação da 95 corrigida à vista.
- [ ] **T3 — galho (tela)** — `RequisicoesList.js` (`maxSeparavelNaTela`, `separandoOutrosDoMaterial`, `quantidadesIniciaisSeparacao`,
  `separavelAgoraPorItem`) + `RequisicoesSeparavelDividido.test.js`, contra o contrato (mock HTTP). RN-17, RN-18. Independente da T1 (outra
  regra, outro arquivo); depende só do contrato da T2.
- [ ] **T4 — integração** — `separavelDivididoIntegracao.api.test.js` (rota **e** serviço). RN-19.
- [ ] **T5 — fechamento** — novidades (B818+, C265, D (127), a D (95) corrigida), specs 05, 23 (C264) e 21 (o furo do checklist), mapa, guia,
  manual, plano (retro e "Próxima tarefa detalhada — Etapa 128"), o "defeito que escapou" da retro da 126. CLAUDE.md só se a trava mudar
  (não deve: nada aqui põe saldo no disponível nem reserva).

A suíte inteira roda **uma por vez**; revisores rodam só os próprios arquivos e nunca junto com a suíte (nem dois arquivos de servidor ao
mesmo tempo, nem jest junto).

## Execução — o que aconteceu

*(preenchido durante a execução)*
