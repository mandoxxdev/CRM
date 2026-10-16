# Almoxarifado — Etapa 125: o cadastro que o formulário leu, inteiro (design)

> Origem: "Próxima tarefa detalhada — Etapa 125" do plano da 124 (**D (124)** — os outros campos do cadastro de material no
> "último que salva vence"; o *Reativar* da aba Famílias manda o nome da lista; **C259** se couber). Worktree `CRM-wt-e125`, branch
> `etapa-e125` (a partir da main `1fca4712`). Numeração conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md`
> (2026-10-16): última B **B804**, último C **C260**, última A **A75** → esta etapa **B805+**, **C261+**, **A76+**.

## Fase 0 — medido (sonda `server/tests/sonda/e125fase0.js`, não versionada; um arquivo por vez)

| # | Cenário | Hoje (medido) |
|---|---|---|
| F1 | Duas abas no mesmo material. A aba A troca a Unidade (`PC` → `KG`, 200). A aba B, aberta antes, só renomeia, mandando o que mostrava | **200** e **200**; gravado `nome: "Renomeada", unidade: "PC"` — a unidade da aba A desfeita calada |
| F2 | Formulário aberto; o custo unitário muda por fora (o que o recebimento faz — `receiptService` → `movimentar` com `custo_unitario`, `stockService.js:1969-1979`); o formulário salva só renomeando | **200**, `custo_unitario` volta ao valor que o formulário mostrava (10, não 37,5) |
| F3 | Família inativa "Nome velho"; outro Administrador renomeia para "Nome novo" (com descrição e tipo de uso); o *Reativar* da aba manda `{nome: "Nome velho", ativo: 1}` | **200**, nome **"Nome velho"** de volta (descrição e tipo de uso ficam — B803) |
| F4 | `PUT /familias/:id {ativo: 1}` sem nome | **400** *"Nome é obrigatório"* |
| F5 | Usuário `role: 'admin'` sem perfil, sem administrador do módulo: `PUT /familias/:id` / `GET /familias?ativo=all` | **403** *"Acesso restrito — administrador do Almoxarifado ou Super Administrador"* / **200** |

**Medido por um agente de leitura (C259, a matriz inteira):** o descompasso não é só da aba Famílias. Para o administrador do
sistema sem perfil, `getPerfilFromUser` devolve **ADMINISTRADOR** (`permissions.js:268`) — então `requirePermission('configurar')`
passa (Categorias, Motivos, Almoxarifados, Perfis de acesso, Auditoria) —, mas `denyUnlessAlmoxAdmin` (`canConfigureAlmox` do
servidor, sem `isSystemAdmin`) recusa: Tipos, **Famílias**, Estoques mínimos, Setores, Localizações e Liberação por valor
**leem e não gravam**; Alertas, Regras de aprovação e Configurações gerais **falham ao abrir**. *Materiais por setor* passa
(`isSystemAdmin || canConfigureAlmox`). A tela inteira abre porque o `canConfigureModule` do cliente aceita `isSystemAdmin`.

**Achado de trilha (a C259 estava errada no "o que fazer"):** a C259 manda *"dê a essa pessoa o perfil Administrador do
almoxarifado"*. **Não dá:** `PUT /perfis-usuario/:id` de um administrador do sistema responde **409** *"Este usuário já é
administrador (superadmin, admin de sistema ou admin do módulo) e tem acesso total ao almoxarifado. …"* (`extended.js:660`), e o
cadastro de usuários desabilita o *Administrador do módulo* para quem é administrador do sistema (`UsuarioForm.js:531`, selo
*"Acesso total (Admin / Super Admin)"*). O caminho que existe: o Super Administrador (marcar como Super Administrador) — ou trocar o
perfil do sistema para usuário e marcar *Administrador do módulo* Almoxarifado.

**Cruzado com a spec e com o código:** `MATERIAL_UPDATE_COLUMNS` (`routes/almoxarifado.js:580`) não tem as quantidades que o
motor grava (`quantidade_atual`, `_reservada`, `_bloqueada`, `_em_inspecao`, `_em_terceiros`) — o formulário manda
`quantidade_atual`, e ela é inerte no `PUT`. **Mas tem `custo_unitario`**, que o motor grava (o último custo de compra, na entrada
com custo). Os outros escritores de colunas do `PUT`: a aba Estoques mínimos (`quantidade_minima`, `quantidade_maxima`) — gesto de
pessoa. O `GET /materiais/:id` devolve as colunas cruas (`SELECT m.*` + `enrichMaterialRow`, que só mexe na foto).

## Decisões

- **D1 — `campos_lidos`, uma terceira chave ao lado das duas (B805).** O formulário manda os valores **crus** (como o `GET`
  devolveu) das 37 colunas que ele mostra e que o `PUT` grava, fora as que já têm chave própria (os controles de lote e série —
  116 — e a família e a subfamília — 124). Para cada coluna presente: lido ≠ gravado **e** o que o salvar grava ≠ gravado → **409**,
  com os rótulos da tela. Comparação **normalizada dos dois lados** (texto: `null`/`''` iguais; número: `''`/`null` iguais, o resto
  por `Number`; id: `0`/`''`/`null` iguais; caixa: 0/1) — o lido vem cru do servidor, então só difere do gravado quando alguém
  mudou; a normalização protege o "gravaria" (o formulário manda `''` para texto vazio, números como texto, `'UN'` para unidade
  vazia). Ordem: 404 → 409 dos controles → 409 da família → **409 dos campos** → 403 do dono → … Sem a chave (Sobras, Remessas,
  API), o de hoje.
  - **Descartado:** (a) **uma chave só** que absorve `controles_lidos` e `familia_lida` (mudaria dois contratos congelados e as
    duas literais que eles têm); (b) **mesclar** o campo que o usuário não mexeu (gravar o do outro, sem recusa) — é uma segunda
    semântica ao lado da 116/124, que recusam; o usuário que renomeia veria a unidade mudar sem saber; (c) um carimbo
    `updated_at` (o motor grava a cada movimento — B800 (a)).
- **D2 — o custo unitário entra (B806).** O recebimento grava o custo da última compra no cadastro; o formulário aberto durante um
  recebimento regravava o custo antigo calado (F2). Com a coluna na lista, o salvar recusa nomeando *"Custo Unitário"*.
  **Descartado:** (a) deixá-lo de fora como as quantidades (o defeito F2 continua); (b) a regra de mesclar só para ele (D1 (b)).
  Custo: um 409 a mais quando um recebimento com custo cai com o formulário aberto — raro, e o recarregar resolve.
- **D3 — a literal nomeia os campos com os rótulos da tela.** *"O campo "Nome do Material" do material ⟨código⟩ foi mudado por
  outra pessoa depois que você abriu o cadastro — salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de
  novo."*; vários: *"Os campos "A", "B" e "C" do material ⟨código⟩ foram mudados … — salvar desfaria essas mudanças, …"*, na ordem
  da tela, sem repetir rótulo (a unidade de compra e a quantidade por compra são o mesmo *"Como é comprado"*). Descartado: a frase
  genérica "o cadastro foi mudado" (manda procurar o que mudou).
- **D4 — o *Reativar* da aba Famílias não manda o nome (B807).** O `PUT /familias/:id` passa a aceitar `nome` **omitido** — preserva
  o gravado, no próprio comando (o molde da B803 para descrição e tipo de uso); informado vazio continua 400 *"Nome é
  obrigatório"*. A tela manda `{ativo: 1}`. **Descartado:** (a) `nome_lido` com 409 (reativar não precisa do nome; recusar faria
  recarregar sem motivo); (b) a tela reler a família antes (a corrida continua, menor).
- **D5 — C259: a aba Famílias fica somente leitura para quem o servidor recusa (B808).** Um teste do cliente nomeia a regra do
  servidor (`podeGravarConfigAlmox` = Super Administrador, administrador do módulo ou perfil Administrador — o `canConfigureAlmox`
  do servidor, sem o administrador do sistema); para os outros, a aba mostra a árvore sem *Nova família*, *Nova subfamília*,
  *Editar*, *Inativar* e *Reativar*, com uma frase que diz de quem é. **Não amplia nem estreita permissão nenhuma no servidor.**
  **Descartado:** (a) **alargar o servidor** (`canConfigureAlmox` aceitar o administrador do sistema — o que o 409 dos perfis e o
  cadastro de usuários já dizem, "acesso total"): amplia quem grava em ~30 rotas de configuração, e um teste da base prende o 403
  de propósito (`auditoriaConfiguracaoJornada`: *"um role:'admin' sem is_superadmin mudou a regra — canConfigureAlmox afrouxou"*) —
  é decisão de modelo de acesso, fica para vocês (letra B); (b) **fechar a tela inteira** para ele (perderia Categorias, Motivos,
  Almoxarifados, Perfis e Materiais por setor, que funcionam); (c) as outras abas no mesmo passo — o mesmo molde, mas oito abas e
  três que falham ao abrir: vira **C** nova e candidata da 126.
- **D6 — sem migração, sem coluna, sem A nova.** O 409 só nasce de um salvar novo; o *Reativar* e a aba só mudam o gesto.
