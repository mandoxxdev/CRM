# Almoxarifado — Etapa 124: a família que o formulário leu, e a reativação que a recusa pede (plano)

> Origem: "Próxima tarefa detalhada — Etapa 124" do plano da 123 (**D (123)** e **C231**).
> Design com a Fase 0 medida: `docs/superpowers/specs/2026-10-16-almoxarifado-etapa124-a-familia-que-o-formulario-leu-e-a-reativacao-que-a-recusa-pede-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B799**,
> último C **C258**, última A **A74**. Esta etapa: **B800+**, **C259+**, **A75+**. Worktree `CRM-wt-e124`, branch `etapa-e124`
> (a partir da main `3f4c2fde`).
>
> **Ordem da skill:** este plano foi revisado (Fase 2) **antes** de qualquer código de produção (só o arquivo de teste da T1 foi
> escrito antes, vermelho 10/18).
>
> **Fase 2 (um revisor fresco, sonda `e124r-trilha.js`, não versionada): 1 Critical, 3 Important, 3 Minor, todos aceitos.**
> **C1 (reproduzido)** — a frase nova da C231 mandaria a um gesto que **não existe**: a aba Famílias carrega só as ativas (`GET
> /familias` sem filtro) e não tem Reativar; o Editar não manda `ativo` (200 e continua inativa). Ninguém reativa família pela
> tela — a premissa da C231 ("o Administrador reativa em Configurações") **estava errada** → **T6 nova** (a aba lista as inativas e
> ganha o Reativar), RN-16..RN-19. **I1 (reproduzido)** — `PUT /familias {ativo: 1}` sem `nome` → 400 *"Nome é obrigatório"* →
> RN-15 com `{nome, ativo: 1}` e o 403 do Almoxarife. **I2 (reproduzido)** — material legado com a subfamília no `familia_id`: o
> Reativar recusa (*"A família escolhida é uma subfamília — …"*) mesmo depois de reativar a "família" → fica fora do grupo (a
> família só conta se `parent_id IS NULL`), literal de hoje, D (124) e **A75**. **I3** — o Reativar da tela manda só `{ativo: 1}`
> → a T4 reativa assim. **M1** — `erroAprovar` continua com `materiais: string[]`. **M2** — a mudança entre a leitura do `current`
> e o `UPDATE` continua com o 409 genérico da B798 (não E1f/E1s), declarado. **M3** — a RN-13 monta o estado por escrita direta.
>
> **Fora (depende do P.O.):** B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da C246/C247.

## Regras de negócio

**D (123) — o formulário grava a família que mostra só se ninguém a mudou (B800).** Testes:
`server/tests/api/materialFamiliaLida.api.test.js`. "Outra pessoa" = escrita direta no banco depois da "abertura" (o formulário
mandaria o par que leu). Almoxarife, salvo dito.

- **RN-01 — subfamília mudada por outro** (material F1/S1 → S2): o salvar `{nome, familia_id: F1, subfamilia_id: S1,
  familia_lida: {familia_id: F1, subfamilia_id: S1}}` → **409** *E1s* (abaixo), **nada gravado** (nome, par), **sem** Auditoria.
  Vale para Almoxarife, Administrador (perfil) e superadmin — não é guarda de perfil.
- **RN-01b — família mudada por outro** (F1/S1 → F2/null): o mesmo salvar → **409** *E1f*. **RN-01c** — família **e** subfamília
  mudadas (F1/S1 → F2/S3) → *E1f* (a família vence).
- **RN-01d — subfamília tirada** (S1 → null) e o salvar manda S1 → *E1s*; **posta** (null → S2) e o salvar manda null (lida null)
  → *E1s*.
- **RN-02 — lido ≠ gravado, mas o salvar grava o gravado** (o usuário escolheu S2 de novo) → **200**; as chaves `familia_id`/
  `subfamilia_id` omitidas no corpo (com `familia_lida`) → **200**, par gravado intacto.
- **RN-03 — sem `familia_lida`** → o de hoje (200, o par do corpo gravado — o comportamento que a Fase 0 mediu; é o das outras
  portas: Sobras, Remessas, API). **Chave parcial:** `familia_lida: {familia_id: F1}` só (subfamília mudada por outro) → 200 (só a
  família é comparada; a subfamília lida ausente não é comparada). `familia_lida` com `subfamilia_id: ''` → tratada como ausente
  (o `numFromForm` colapsa `''`).
- **RN-04 — lido = gravado, o usuário troca a subfamília** (S1 → S2, ativa) → **200**, S2 gravada, Auditoria `EDICAO` com o de/para
  (a edição normal continua).
- **RN-05 — ordem.** (a) controles **e** família mudados por outro → o **409 da C233** (*"O controle por …"*), não o da família;
  (b) família mudada por outro **e** troca de dono proibida (Almoxarife, material com movimento) → **409** *E1f*, não o 403;
  (c) família mudada **e** inativar com saldo → *E1f*, não o 400 do saldo.
- **RN-06 — não é autorização:** um `familia_lida` falso só pode recusar — com lido = gravado nada muda; o Almoxarife que manda um
  lido diferente para "forçar" algo recebe o 409 e nada é gravado. (Prova: o próprio RN-01 + RN-02.)
- **RN-07 — a tela** (`client/src/components/almoxarifado/MaterialAlmoxarifadoForm.test.js`): o `PUT` leva `familia_lida` =
  `{familia_id: <número|null>, subfamilia_id: <número|null>}` do material **carregado**, mesmo depois de o usuário trocar a
  subfamília no select; ao trocar de material sem desmontar a tela, leva o par do **novo**; o `POST` (cadastro) **não** leva a
  chave; o 409 aparece no toast com a literal e a tela fica.

**C231 — a recusa manda reativar a família antes do material (B801).** Testes:
`server/tests/api/requisicaoFamiliaInativa.api.test.js`. Requisição com um item pendente de material inativo (o estado da 114).

- **RN-10 — `/aprovar`**, material inativo com a **família** inativa → **400** *E1-F* com `a família de ⟨cód⟩`; com só a
  **subfamília** inativa (raiz ativa) → `a subfamília de ⟨cód⟩`; com as **duas** → `a família e a subfamília de ⟨cód⟩`. Continua
  PENDENTE, nada reservado (o de hoje).
- **RN-10b — misto:** M1 (família inativa) + M2 (só o material inativo) → `material inativo: M1, M2. Reative a família de M1 em …
  e depois o material em …` (os códigos de cada grupo na ordem dos itens; os grupos na ordem família, subfamília, as duas).
- **RN-11 — `/aprovar-valor`** (requisição na fila de valor, o material e a família inativados depois) → a variante *"… ou reprove
  a liberação por valor."* com a parte da família.
- **RN-12 — envio do rascunho** → *E2-F* (*"O rascunho … ou cancele o rascunho e faça outro sem ele."*) com a parte da família.
- **RN-13 — separação** (requisição aprovada, material e família inativados depois) → *E3-F* com `a família do material` (ou
  `a subfamília do material`, `a família e a subfamília do material`).
- **RN-14 — guardas:** família ativa → as literais de hoje **byte a byte** (os arquivos `requisicaoMaterialInativo*.api.test.js`
  continuam verdes sem mudança); material **ativo** em família inativa não entra (não é material inativo); material inativo cujo
  `familia_id` aponta para uma família que **não existe** → literal de hoje. **RN-14b (Fase 2, I2)** — material **legado** com a
  subfamília gravada no `familia_id` (inativa) → literal de hoje (a família só conta se for raiz: `parent_id IS NULL`); o
  `erroAprovar` continua com `materiais` = os códigos (string[], M1).
- **RN-15 — o último gesto (a trilha):** seguir a mensagem funciona — o Almoxarife que tenta reativar a família ouve **403**
  *"Acesso restrito — administrador do Almoxarifado ou Super Administrador"*; o Administrador do almoxarifado reativa a família
  pelo corpo do Reativar da aba (`PUT /familias/:id {nome, ativo: 1}`, 200 — Fase 2, I1), o Almoxarife reativa o material pelo
  corpo do Reativar da tela (`PUT /materiais/:id {ativo: 1}`, 200),
  e o `/aprovar` aprova (200). Com a subfamília inativa: reativa a subfamília (200), o material (200), aprova. Sem reativar a
  família primeiro, o Reativar do material continua recusando (*"Família inativa — não é possível vincular novos itens"*) — é a
  ordem que a frase diz.

**Integração (T4).** `server/tests/api/familiaLidaIntegracao.api.test.js`: (i) **pela rota** — cria família, subfamílias e
material pela rota; a "aba A" lê o material (`GET`) e guarda o par; a "aba B" muda a subfamília pelo `PUT` (200); a aba A salva com o
par lido → 409 *E1s*; recarrega (`GET`) e salva → 200. Depois: requisição do material, o material e a família inativados pela rota
(`DELETE` do material zerado, `PUT /familias {ativo: 0}` com a subfamília inativada antes), `/aprovar` → 400 com a parte da família;
segue a frase (RN-15) até aprovar 200, com os corpos que a tela manda (`{nome, ativo: 1}` na família, `{ativo: 1}` no material —
Fase 2, I3). (ii) **pelo serviço** —
`materialService.familiaDesfeita` e `requisicaoMaterialInativo.mensagemAprovar/mensagemSeparar` com as variantes.

**A aba Famílias reativa (T6, Fase 2 C1, B802).** Testes: `client/src/components/almoxarifado/Familias.test.js`.

- **RN-16** — a aba carrega `GET /almoxarifado/familias?ativo=all` (a rota já aceita) e mostra as inativas — raiz e subfamília —
  com o selo **"Inativa"**.
- **RN-17** — o botão **Reativar** (só nas inativas) manda `PUT /almoxarifado/familias/:id` com `{nome, ativo: 1}` → toast
  *"Família reativada"* / *"Subfamília reativada"* e recarrega; recusa → a literal do servidor no toast (ex.: *"Não é possível
  reativar: a família principal desta subfamília está inativa — reative a família principal antes"*), a lista fica.
- **RN-18** — a inativa **não** oferece *Adicionar item*, *Nova subfamília* (na raiz) nem *Inativar*; oferece *Editar* e
  *Reativar*. O Editar continua sem `ativo` (não reativa calado).
- **RN-19** — as ativas continuam como hoje (sem Reativar); a subfamília **ativa** sob raiz inativa (só por escrita fora das rotas)
  continua no bloco *"Subfamílias sem família ativa"*, não dentro do cartão.

## Contrato congelado

- `PUT /api/almoxarifado/materiais/:id`: chave nova **`familia_lida`** (opcional) — `{ familia_id?: inteiro positivo | null,
  subfamilia_id?: inteiro positivo | null }` (declarada no `MaterialUpdateSchema`; não entra no `UPDATE`). Novo **409**, depois
  do 409 da C233 e antes do 403 da troca de dono:
  - *E1f*: *"A família do material ⟨código gravado⟩ foi mudada por outra pessoa depois que você abriu o cadastro — salvar desfaria
    essa mudança, e nada foi gravado. Recarregue o material e salve de novo."*
  - *E1s*: *"A subfamília do material ⟨código gravado⟩ foi mudada por outra pessoa depois que você abriu o cadastro — salvar
    desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo."*
- `POST /api/almoxarifado/materiais`: inalterado (a chave é inerte, não declarada no `MaterialSchema`).
- Recusas da 114 (`requisicaoMaterialInativo`): quando algum material inativo pendente tem a família/subfamília inativa, o trecho
  *"Reative o material em Materiais → Inativos (Administrador, Almoxarife ou Engenharia)"* vira *"Reative ⟨quais⟩ em
  Configurações → Famílias (Administrador do almoxarifado) e depois o material em Materiais → Inativos (Administrador, Almoxarife
  ou Engenharia)"*, com ⟨quais⟩ = os grupos `a família de ⟨cód, cód⟩`, `a subfamília de ⟨cód⟩`, `a família e a subfamília de
  ⟨cód⟩` unidos por `" e "` (na separação: `a família do material` etc.). O resto de cada literal (`A requisição … tem material
  inativo: …`, `… ou rejeite a requisição.`, `… ou reprove a liberação por valor.`, `… ou cancele o rascunho e faça outro sem
  ele.`, `… ou separe os outros itens com 0 neste.`) igual.
- A aba Famílias (T6): `GET /almoxarifado/familias?ativo=all` e `PUT /almoxarifado/familias/:id {nome, ativo: 1}` — os dois já
  existem; nenhuma rota nova.
- **Schema:** nenhuma coluna, nenhuma migração. **A75** (consulta, somente leitura): os materiais legados inativos com a subfamília
  gravada no `familia_id`.
- **M2 (declarado):** a mudança do par **entre** a leitura do `current` e o `UPDATE` continua respondendo o 409 genérico da B798
  (*"O cadastro do material ⟨código⟩ mudou enquanto era salvo — …"*), não E1f/E1s.

## Tasks (sort topológico)

- [ ] **T1 — tronco (D (123))** — `services/almoxarifado/schemas.js` (`familia_lida`), `services/almoxarifado/materialService.js`
  (`familiaDesfeita`, `mensagemFamiliaMudadaPorOutro`), `routes/almoxarifado.js` (`PUT /materiais/:id`, logo depois do 409 da
  C233). RN-01..RN-06.
- [ ] **T2 — galho (C231)** — `services/almoxarifado/requisicaoMaterialInativo.js` (a coluna em SQL, os grupos, as literais),
  `services/almoxarifado/requisitionService.js` (`carregarItensRequisicao`, `reservarItensAprovacao`, `validarFormaDaSeparacao`),
  `services/almoxarifado/requisitionValueApprovalService.js` (a chamada de `erroAprovar`), `routes/almoxarifado.js` (a consulta do
  envio). RN-10..RN-15. Regra disjunta da T1 (requisição × cadastro); no `routes/almoxarifado.js`, trecho disjunto (envio, ~3970).
  Worktree própria, só depois da suíte inteira passar na branch com ele.
- [ ] **T3 — galho (tela)** — `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js` (+ teste). RN-07. Contra o
  contrato congelado (mock HTTP).
- [ ] **T6 — galho (tela, Fase 2 C1)** — `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js` (`TabFamilias`) +
  `Familias.test.js`. RN-16..RN-19. Contra rotas que já existem.
- [ ] **T4 — integração** — `server/tests/api/familiaLidaIntegracao.api.test.js` (acima).
- [ ] **T5 — fechamento** (skill `fechar-etapa`).

A suíte inteira roda **uma por vez**, sempre na branch; galho e revisores rodam só os próprios arquivos e nunca junto com a suíte.
