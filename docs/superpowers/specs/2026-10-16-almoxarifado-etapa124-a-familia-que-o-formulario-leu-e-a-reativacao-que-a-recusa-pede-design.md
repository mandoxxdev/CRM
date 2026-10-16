# Almoxarifado — Etapa 124: a família que o formulário leu, e a reativação que a recusa pede (design)

> Origem: "Próxima tarefa detalhada — Etapa 124" do plano da 123 (**D (123)** — o formulário de material aberto há minutos grava a
> família que mostra — e **C231**). Worktree `CRM-wt-e124`, branch `etapa-e124` (a partir da main `3f4c2fde`). Numeração conferida
> com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` (2026-10-16): última B **B799**, último C **C258**, última A **A74** →
> esta etapa **B800+**, **C259+**, **A75+**.

## Fase 0 — medido (sonda `server/tests/sonda/e124fase0.js`, não versionada)

| # | Cenário | Hoje (medido) |
|---|---|---|
| F1 | Material F1/S1. Outra pessoa muda a subfamília para S2 (direto no banco, depois de o formulário abrir). O formulário salva `{nome, familia_id: F1, subfamilia_id: S1}` (o que mostrava) | **200**, gravado **F1/S1** — a mudança do outro desfeita calada (a troca é validada como troca de subfamília e passa) |
| F2 | Material F1/S1, outra pessoa move para F2/sem subfamília. O formulário salva F1/S1 | **200**, gravado **F1/S1** |
| R1 | Requisição com material inativo cuja família (e subfamílias) também foi inativada → `/aprovar` (Administrador) | **400** *"A requisição ⟨n⟩ tem material inativo: ⟨cód⟩. Reative o material em Materiais → Inativos (Administrador, Almoxarife ou Engenharia) ou rejeite a requisição."* |
| R2 | Seguindo a recusa: o Almoxarife reativa o material (`PUT {ativo: 1}`) | **400** *"Família inativa — não é possível vincular novos itens"* — a recusa manda fazer o que o sistema recusa |
| R3 | Quem reativa família: `PUT /familias/:id` por usuário sem perfil | **403** *"Acesso restrito — administrador do Almoxarifado ou Super Administrador"* (a rota de família tem o seu portão; a aba Famílias só aparece para quem configura o módulo) |

**Cruzado com a spec:** a `specs/modulo-almoxarifado/01-cadastros-materiais/README.md` e a D (123) do doc de novidades dizem que o
`PUT` só protege o que muda **dentro** do salvar (B798) — confirmado (F1/F2). A **C231** (Etapa 114) diz "reativar a família é só
do Administrador (Configurações)" — confirmado (R3): o portão é `canConfigureAlmox` (administrador do sistema, administrador do
módulo ou perfil Administrador do almoxarifado).

**Achado de trilha (o último gesto):** o Reativar do material confere **também a subfamília** (`validateSubfamilia` exige
`ativo = 1`, *"Subfamília inválida para a família selecionada"*). A C231 só fala da família; com a subfamília inativa (raiz ativa),
o mesmo beco. A correção cobre os dois.

## Decisões

- **D1 — D (123): o molde da C233 (Etapa 116).** O formulário manda `familia_lida: {familia_id, subfamilia_id}` — o par **de quando
  o material foi carregado** (ref, não state). No `PUT`, para cada coluna presente em `familia_lida`: lido ≠ gravado **e** o que
  o salvar grava ≠ gravado → **409** com literal nova. Sem a chave (API, Sobras, Remessas), o comportamento de hoje. A família vence
  a subfamília na literal ("A família…" quando a família seria desfeita; "A subfamília…" quando só ela).
  - **Ordem:** 404 → 409 dos controles (C233, inalterado) → **409 da família lida** → 403 da troca de dono → … É proteção de
    concorrência, não de autorização: a chave vem do corpo e só pode **recusar**; todas as guardas depois continuam lendo o gravado.
  - **Descartado:** (a) um carimbo `updated_at` lido (recusaria qualquer salvar depois de qualquer mudança — inclusive das colunas
    que o motor de estoque grava a cada movimento, `quantidade_atual` etc. —, ou seja, quase todo salvar de material em uso); (b)
    pôr o par dentro de `controles_lidos` (mudaria o contrato congelado da 116 e o nome diria uma coisa e levaria outra); (c) a
    tela recarregar sozinha no 409 (apagaria o que o usuário digitou; a 116 também não recarrega).
- **D2 — C231: a recusa nomeia a reativação da família (ou da subfamília) antes da do material.** As três leituras de itens
  (aprovar/separar — `carregarItensRequisicao`; `/aprovar-valor` — `lerCodigosInativosPendentes`; envio do rascunho — a consulta da
  rota) ganham a coluna `material_familia_inativa` (1 = família inativa, 2 = subfamília inativa, 3 = as duas; só família **que
  existe** e está inativa). A frase passa de *"Reative o material em Materiais → Inativos (…)"* para *"Reative a família de ⟨cód⟩
  em Configurações → Famílias (Administrador do almoxarifado) e depois o material em Materiais → Inativos (…)"* quando algum
  material inativo pendente tem a família/subfamília inativa. Sem família inativa, a literal de hoje, byte a byte.
  - **Descartado:** (a) reativar a família junto ao reativar o material (o Almoxarife reativaria família, que é do Administrador);
    (b) o Reativar do material desligar a subfamília inativa (mudaria a classificação calado); (c) uma literal só, genérica ("a
    família ou a subfamília pode estar inativa") — manda a pessoa procurar em vez de dizer o que fazer.
- **D3 — sem migração, sem coluna, sem A nova.** Nada a medir em produção: o 409 só nasce de um salvar novo, e a recusa só muda o
  texto.
