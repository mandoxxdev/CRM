# Almoxarifado — Etapa 125: o cadastro que o formulário leu, inteiro (plano)

> Origem: "Próxima tarefa detalhada — Etapa 125" do plano da 124 (**D (124)** itens 1 e 2, **C259** se couber).
> Design com a Fase 0 medida: `docs/superpowers/specs/2026-10-16-almoxarifado-etapa125-o-cadastro-que-o-formulario-leu-inteiro-design.md`.
>
> **Numeração** (conferida com `grep -oE` em `docs/almoxarifado-novidades-por-etapa.md` em 2026-10-16): última B **B804**,
> último C **C260**, última A **A75**. Esta etapa: **B805+**, **C261+**, **A76+**. Worktree `CRM-wt-e125`, branch `etapa-e125`
> (a partir da main `1fca4712`).
>
> **Ordem da skill:** este plano foi revisado (Fase 2) **antes** de qualquer código de produção (só o arquivo de teste da T1 foi
> escrito antes, sem rodar).
>
> **Fase 2 (um revisor fresco, sonda `e125r-1.js`, não versionada, rodada uma vez, sozinha): 0 Critical, 1 Important, 7 Minor, todos
> aceitos.** Sem falso 409 (12 materiais de legado esquisito, três salvares cada — a aba sozinha, depois de outra aba salvar sem
> mudar nada, e o recarregar-e-salvar: nenhum campo recusado) e sem 409 que falte; a lista bate com `MATERIAL_UPDATE_COLUMNS` menos as
> 11 declaradas. **I1** — a aba somente leitura escondia *Cadastrar primeiro item* (criar material, que o administrador do sistema
> **pode** — `criar_material` inclui o perfil ADMINISTRADOR que ele recebe) → a RN-16 esconde só os gestos de **família**. **M1** — o
> tipo de cada chave congelado num só `string | number | boolean | null` (tipar pela coluna daria 400 no lido cru); `campos_lidos`
> `null` ou array → 400 do validador. **M2** — o lido não numérico (`NaN`) compara como texto. **M3** — singular/plural depois de
> juntar os rótulos repetidos. **M4** — o recebimento que cai **entre** a leitura e o `UPDATE`: com `custo_unitario` em
> `campos_lidos`, o `WHERE` leva `custo_unitario IS ⟨lido do current⟩` → o 409 geral da B798. **M5** — o *Editar* da aba Famílias
> continua no "último que salva vence": declarado (D (125)). **M6** — a frase da aba diz o que fazer (*"peça a um deles"*). **M7** —
> no cliente, chave ausente no material carregado vai `null` (`?? null`).
>
> **Fora (depende do P.O.):** B755, B761/C239, C224, o resto da C225, C228, C219, C230, o reparo da C246/C247, a tabela de
> conversões e o grupo acima de família.

## Regras de negócio

**D (124) item 1 — o formulário grava os outros campos só se ninguém os mudou (B805, B806).** Testes:
`server/tests/api/materialCamposLidos.api.test.js`. "Outra pessoa" = escrita direta no banco depois da "abertura" (o formulário
mandaria o que leu). Almoxarife, salvo dito. A lista congelada (`CAMPOS_LIDOS`, abaixo) é a mesma no servidor e no cliente.

- **RN-01 — um campo mudado por outro** (Nome `"Peca 1"` → `"Peca outro"`): o salvar com `campos_lidos` do que leu e `nome:
  "Peca 1 renomeada"` → **409** *E1* (singular) com `"Nome do Material"`, **nada gravado**, **sem** Auditoria. Vale para Almoxarife,
  Administrador (perfil) e superadmin.
- **RN-01b — vários** (Unidade e Estoque Mínimo mudados por outro) → *E1* plural, `"Unidade de Medida" e "Estoque Mínimo"`, na
  ordem da lista; três → `"A", "B" e "C"`; a unidade de compra **e** a quantidade por compra mudadas → um rótulo só, `"Como é
  comprado"`, e a frase no **singular** (a escolha singular/plural vem depois de juntar os rótulos — Fase 2, M3).
- **RN-01c — cada tipo de coluna:** texto (`marca`), número (`quantidade_minima`, mandado como texto `"5"` pelo formulário), caixa
  (`material_critico`, `true` no corpo), id (`localizacao_padrao_id`, `proprietario_cliente_id` → `"Proprietário"`), `classe_abc`
  (`''` no estado → `null` no corpo) e `custo_unitario` (o que o recebimento grava — RN-01d).
- **RN-01d — o custo do recebimento** (`custo_unitario` 10 → 37,5 pelo motor: `stockService.movimentar` com `custo_unitario`) com
  o formulário aberto → 409 `"Custo Unitário"`, o 37,5 fica. **RN-01e (Fase 2, M4)** — o custo mudado **entre** a leitura e o
  `UPDATE` (com `custo_unitario` em `campos_lidos`) → o 409 geral *"O cadastro do material ⟨código⟩ mudou enquanto era salvo — …"*.
- **RN-02 — lido ≠ gravado, mas o salvar grava o gravado** (o usuário digitou o mesmo que o outro) → **200**; a chave omitida no
  corpo (preserve-when-omitted) → **200**, gravado intacto.
- **RN-03 — sem `campos_lidos`** → o de hoje (200, o corpo gravado). **Chave parcial:** só as colunas presentes são comparadas;
  chave fora da lista (`quantidade_atual`, `familia_id`, `controle_lote`, `nome_qualquer`) é descartada pelo schema e não é
  comparada.
- **RN-04 — lido = gravado, o usuário muda** (nome, unidade) → **200**, gravado, Auditoria `EDICAO` com o de/para.
- **RN-05 — o falso 409 não existe:** o payload **real** do formulário (o `handleSubmit`: texto `''` para `null`, números como
  texto, `unidade: 'UN'` para unidade `null`, `classe_abc: null`, `fator_conversao_compra: null` sem unidade de compra, caixas
  `true/false`) de um material que ninguém mudou → **200**, para um material com todas as colunas preenchidas **e** para um com
  todas `null`.
- **RN-06 — ordem.** (a) controles **e** campos mudados por outro → o **409 da C233**; (b) família **e** campos → **E1f** (124);
  (c) campos mudados **e** troca de dono proibida (Almoxarife, material com movimento) → **409** *E1*, não o 403; (d) o
  Proprietário mudado por outro (o Administrador trocou o dono) e o Almoxarife salva com o lido → **409** `"Proprietário"`, não
  o 403; (e) campos **e** inativar com saldo → *E1*, não o 400.
- **RN-07 — não é autorização:** um `campos_lidos` falso só pode recusar (com lido = gravado nada muda; prova: RN-01 + RN-02).
- **RN-08 — a tela** (`client/src/components/almoxarifado/MaterialAlmoxarifadoForm.test.js`): o `PUT` leva `campos_lidos` com as
  37 chaves de `CAMPOS_LIDOS`, os valores **crus** do material carregado (`null` fica `null`, número fica número, chave ausente vai `null` —
  Fase 2, M7), mesmo depois de
  o usuário editar; ao trocar de material sem desmontar a tela, leva os do **novo**; o `POST` não leva a chave; o 409 aparece no
  toast com a literal e a tela fica. A lista do cliente é igual à do contrato (o teste a escreve por extenso).

**D (124) item 2 — o *Reativar* da aba Famílias não regrava o nome (B807).** Testes:
`server/tests/api/familiaReativarSemNome.api.test.js` e `client/src/components/almoxarifado/Familias.test.js`.

- **RN-10** — `PUT /familias/:id` com `nome` **omitido** preserva o nome gravado: `{ativo: 1}` numa inativa → **200**, nome,
  descrição e tipo de uso como estavam; renomeada por outro antes → o nome **novo** fica. Auditoria `EDICAO` com `ativo` 0 → 1.
- **RN-11** — `nome` **informado** vazio, só espaços ou `null` → **400** *"Nome é obrigatório"* (o de hoje); informado → grava
  (o *Editar* continua igual). As recusas da reativação continuam (a subfamília de família principal inativa → *"Não é possível
  reativar: a família principal desta subfamília está inativa — reative a família principal antes"*); o Almoxarife → **403**.
- **RN-12** — a tela: o *Reativar* manda **`{ativo: 1}`** (sem `nome`), toast e recarga como na 124.

**C259 — a aba Famílias somente leitura para quem o servidor recusa (B808).** Testes: `Familias.test.js` e
`client/src/utils/systemPermissions.test.js` (ou o arquivo de teste que já cobre `systemPermissions`).

- **RN-15** — `podeGravarConfigAlmox(user)` (cliente) = Super Administrador **ou** administrador do módulo Almoxarifado **ou**
  perfil `ADMINISTRADOR` — a regra do `canConfigureAlmox` do servidor; o administrador do sistema (`role: 'admin'`) sem nenhum dos
  três → **false** (e `canConfigureAlmox` do cliente continua **true** para ele: a tela abre).
- **RN-16** — com `podeGravarConfigAlmox` falso, a aba Famílias mostra a árvore (ativas e inativas, os itens ao expandir) **sem**
  *Nova Família*, *Nova subfamília*, *Editar* (da família), *Inativar* nem *Reativar*, e mostra a frase *"Somente leitura —
  cadastrar, editar, inativar e reativar famílias é do Administrador do almoxarifado ou do Super Administrador; peça a um deles."*
  **Fase 2, I1:** os gestos de **material** ficam — *Adicionar item*, *Cadastrar primeiro item* e o editar do item (o servidor
  deixa: `criar_material` e `editar_material` incluem o perfil ADMINISTRADOR que o administrador do sistema recebe).
- **RN-17** — com `podeGravarConfigAlmox` verdadeiro, a aba como na 124 (sem a frase). As outras abas não mudam (C nova).

**Integração (T6).** `server/tests/api/camposLidosIntegracao.api.test.js`: (i) **pela rota** — material cadastrado pela rota; a aba
A e a aba B leem (`GET`) e montam o payload do formulário (o `handleSubmit`); a aba B troca a Unidade e o Estoque Mínimo (200); a
aba A renomeia → 409 *E1* plural, nada gravado; recarrega e salva → 200 com a unidade da B; uma **Entrada com custo pelo serviço**
(`stockService.movimentar`) com a aba aberta → o salvar → 409 `"Custo Unitário"`; recarrega → 200 com o custo do recebimento.
Depois a família: inativada pela rota, renomeada por outro Administrador pela rota, reativada com o corpo da tela (`{ativo: 1}`)
→ 200 com o nome novo. (ii) **pelo serviço** — `materialService.camposDesfeitos` e `mensagemCamposMudadosPorOutro`.

## Contrato congelado

- **`CAMPOS_LIDOS`** (ordem = ordem da tela; rótulo da tela sem unidade entre parênteses):
  `codigo` "Código", `nome` "Nome do Material", `descricao` "Descrição", `descricao_tecnica` "Descrição Técnica", `categoria`
  "Categoria", `tipo_material` "Tipo de Material", `material_critico` "Material crítico", `proprietario_cliente_id` "Proprietário",
  `fabricante` "Fabricante", `codigo_fabricante` "Código no Fabricante", `marca` "Marca", `modelo` "Modelo", `norma` "Norma
  Técnica", `material_construtivo` "Material Construtivo", `peso_unitario` "Peso Unitário", `dimensoes` "Dimensões", `ncm` "NCM",
  `aplicacao` "Aplicação", `especificacoes` "Especificações Técnicas", `observacoes` "Observações Gerais", `unidade` "Unidade de
  Medida", `quantidade_minima` "Estoque Mínimo", `quantidade_maxima` "Estoque Máximo", `ponto_reposicao` "Ponto de Reposição",
  `lote_economico` "Lote Econômico", `localizacao_padrao_id` "Localização no estoque", `controle_validade` "Controle de validade",
  `controle_corrida` "Controle de corrida", `controle_certificado` "Requer certificado", `requer_inspecao` "Requer inspeção",
  `requer_foto` "Requer foto", `classe_abc` "Classe ABC", `custo_unitario` "Custo Unitário", `unidade_compra` "Como é comprado",
  `fator_conversao_compra` "Como é comprado", `fornecedor_principal` "Fornecedor Principal", `codigo_fornecedor` "Código no
  Fornecedor". **37 colunas.** Tipos: `material_critico`, `controle_validade`, `controle_corrida`, `controle_certificado`,
  `requer_inspecao`, `requer_foto` = caixa; `proprietario_cliente_id`, `localizacao_padrao_id` = id; `peso_unitario`,
  `quantidade_minima`, `quantidade_maxima`, `ponto_reposicao`, `lote_economico`, `custo_unitario`, `fator_conversao_compra` =
  número; o resto = texto.
  **Fora, de propósito:** `controle_lote`/`controle_serie` (`controles_lidos`, 116), `familia_id`/`subfamilia_id` (`familia_lida`,
  124), as quantidades que o motor grava (não estão no `PUT`), `ativo`, `categoria_id`, `subcategoria_id`, `fornecedor_id`,
  `unidade_consumo`, `fator_conversao_consumo` (a tela não manda — preserve-when-omitted).
- `PUT /api/almoxarifado/materiais/:id`: chave nova **`campos_lidos`** (opcional) — objeto com as chaves de `CAMPOS_LIDOS`, cada
  uma `string | number | boolean | null` — **um tipo só para todas** (Fase 2, M1; declarada no `MaterialUpdateSchema`; outras chaves
  descartadas; `campos_lidos` `null`, array ou valor-objeto → 400 do validador; não entra no `UPDATE`).
  Novo **409**, depois do da família (124) e antes do 403 do dono:
  - *E1* singular: *"O campo "⟨rótulo⟩" do material ⟨código gravado⟩ foi mudado por outra pessoa depois que você abriu o cadastro —
    salvar desfaria essa mudança, e nada foi gravado. Recarregue o material e salve de novo."*
  - *E1* plural: *"Os campos "⟨r1⟩", "⟨r2⟩" e "⟨r3⟩" do material ⟨código gravado⟩ foram mudados por outra pessoa depois que você
    abriu o cadastro — salvar desfaria essas mudanças, e nada foi gravado. Recarregue o material e salve de novo."* (`", "` entre
    os do meio, `" e "` antes do último).
  - Normalização: texto `null`/`undefined`/`''` → `''`, senão `String(v)`; número `null`/`undefined`/`''` → `null`, senão
    `Number(v)`; id `null`/`undefined`/`''`/`0` → `null`, senão `Number(v)`; caixa → 0/1 (`bool01`). Número que dá `NaN` compara como texto
    (Fase 2, M2). Singular/plural depois de juntar os rótulos repetidos.
  - **Declarado (o M2 da 124):** a mudança que cai **entre** a leitura do `current` e o `UPDATE` (milissegundos) continua no
    "último que salva vence" para estas colunas (o `WHERE` só leva o dono, a família, os controles e o `ativo`) — **menos o custo
    unitário** (Fase 2, M4: quem o grava é o recebimento): com `custo_unitario` em `campos_lidos`, o `WHERE` leva
    `custo_unitario IS ⟨current⟩` e, não gravando, o 409 geral da B798.
- `POST /api/almoxarifado/materiais`: inalterado (a chave não está no `MaterialSchema` — descartada).
- `PUT /api/almoxarifado/familias/:id`: `nome` omitido (`undefined`) preserva o gravado (`nome = CASE WHEN ? THEN nome ELSE ? END`);
  `nome` informado e vazio/só espaços/`null` → 400 *"Nome é obrigatório"*. O resto, igual.
- Cliente: `podeGravarConfigAlmox(user)` em `client/src/utils/systemPermissions.js`; a frase de RN-16 literal.
- **Schema:** nenhuma coluna, nenhuma migração, nenhuma A.

## Tasks (sort topológico)

- [ ] **T1 — tronco (D (124) item 1)** — `services/almoxarifado/camposLidos.js` (a lista), `services/almoxarifado/schemas.js`
  (`campos_lidos`), `services/almoxarifado/materialService.js` (`camposDesfeitos`, `mensagemCamposMudadosPorOutro`),
  `routes/almoxarifado.js` (`PUT /materiais/:id`, logo depois do 409 da família). RN-01..RN-07.
- [ ] **T2 — galho (D (124) item 2)** — `routes/almoxarifado.js` (`PUT /familias/:id`, trecho disjunto ~2911). RN-10, RN-11. Regra
  disjunta da T1 (família × material).
- [ ] **T3 — galho (tela)** — `MaterialAlmoxarifadoForm.js` (+ teste). RN-08. Contra o contrato congelado (mock HTTP).
- [ ] **T4 — galho (tela)** — `ConfiguracoesAlmoxarifado.js` (`TabFamilias`: o *Reativar* `{ativo: 1}` — RN-12; somente leitura —
  RN-16/17) + `utils/systemPermissions.js` (`podeGravarConfigAlmox` — RN-15) + testes.
- [ ] **T6 — integração** — `server/tests/api/camposLidosIntegracao.api.test.js` (acima).
- [ ] **T5 — fechamento** — novidades (B805–B809, C261+, D (125)), specs 01 e 23, mapa, guia, manual, plano; CLAUDE.md só se a
  trava mudar (não deve: o 409 novo sai antes do `UPDATE`).

A suíte inteira roda **uma por vez**, sempre na branch; galho e revisores rodam só os próprios arquivos e nunca junto com a suíte
(nem dois arquivos de servidor ao mesmo tempo, nem jest junto).
