# Etapa 26 — Uma lista de categorias só, e ela é do cliente (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** as telas param de ter lista de categorias hardcoded (duplicada em 3 arquivos) e passam
a ler o catálogo do cliente; o catálogo vira cadastro editável; e nenhum material tem a
classificação trocada em silêncio no caminho.

**Architecture:** o `GET` já existe e **já é consumido**; a etapa acrescenta o CRUD (molde
**híbrido, por assunto** — ver C2) e troca a fonte no client. **Com** uma migration: o índice
único de nome que a RN-06 exige (a versão anterior dizia "sem migration" e estava errada).

> **REESCRITO PELA FASE 2** (10 achados, 2 críticos): a varredura do design errou os arquivos
> (são 3, e um deles não estava listado); o molde de famílias é o **errado**; o gate e o teste
> de matriz se contradiziam; a RN-04 descrevia um bug que **não é o que acontece**; e o default
> de criação não tinha dono. Onde o texto diz "ESTAVA ERRADO", vale a versão corrigida.

**Spec:** `docs/superpowers/specs/2026-08-29-almoxarifado-etapa26-categorias-design.md`

## Global Constraints

1. **Use `python3`, nunca `python`** (o alias não existe; heredoc com `python` vira no-op). Ou
   `sed` contando a âncora antes (`grep -cF` = exatamente **1**; se der 2, **aborte**), ou Edit.
2. **COMMITE ANTES DE SABOTAR** — já apagou correção não commitada 4 vezes nesta sessão.
3. **Controle positivo com alvo, lendo QUAL asserção caiu.** `md5sum` antes/depois/restaurado,
   `git diff --stat` vazio.
4. **Vermelho por asserção, não por erro de setup**; cuidado com guarda de setup disparando
   antes da asserção de peso.
5. **Não escreva no banco de desenvolvimento** (`server/data/database.sqlite`) — ele tem os
   dados reais que a letra A vai consultar. Testes usam o harness.
6. **Nunca `git add -A`.** Commit em português, corpo sem acento, `git commit -F` **com nome de
   arquivo único no scratchpad** (ele é compartilhado entre agentes em paralelo).
7. Testes de API em `server/tests/api/*.api.test.js` (runner próprio); harness `testApp.js` com
   `requirePermission` real. Cliente: `CI=true` faz warning virar erro; o fuso é fixado por
   `client/jest.globalSetup.js` — **não** refixe `process.env.TZ` no topo do arquivo.

## Regras de negócio

| RN | Enunciado | Onde é provada |
|---|---|---|
| RN-01 | Uma fonte só: as telas leem `GET /categorias`, nenhum arquivo do client declara a lista | testes de client |
| RN-02 | Cadastro editável; soft delete no molde de **tipos de material** (o já corrigido pela Etapa 23), **não** famílias | `categoriasCrud` |
| RN-03 | Escrever exige **`requirePermission('configurar')`** (gate dos centros de custo, mesmo arquivo) | `categoriasCrud` (matriz de perfis) |
| RN-04 | A tela **mostra** a categoria gravada mesmo fora do catálogo (hoje mostra a 1ª opção e manda outra no payload) | teste de client (**cenário de peso**) |
| RN-05 | Renomear **não** reescreve os materiais — a tela avisa | `categoriasCrud` + tela |
| RN-06 | Duplicada recusada, régua de **setores** — exige `CREATE UNIQUE INDEX` | `categoriasCrud` |
| RN-07 | **Material novo nasce com categoria do catálogo** (campo vazio + `Selecione…`) | teste de client |

## Contratos

**C1 — `GET /api/almoxarifado/categorias`** (existe, `extended.js:148`, gate `auth`)
Devolve as linhas de `categorias_material_almoxarifado` com `ativo = 1`, `ORDER BY nome`.
Já é consumido por `ConfiguracoesAlmoxarifado.js:2884`.
**MUDA em um ponto** (achado A6 — a versão anterior dizia "não muda" e a Task 3 seria impossível):
ganha um parâmetro para trazer as inativas, **no molde dos irmãos** (`?all=1` em setores,
`?ativo=0|all` em famílias, `?todos=1` em centros de custo — escolha um e diga qual). Sem ele a
aba de CRUD não tem como **reativar** o que desativou, e "desativar não apaga" vira promessa
vazia.

**C2 — as rotas novas.** **O molde é híbrido, por assunto** — a versão anterior mandava copiar
famílias, e famílias é o cadastro **errado** (achado A2): tem `parent_id`, validação de pai,
bloqueio de inativação com filhas e código automático, e **não tem unicidade de nome**.

| Assunto | Fonte | Onde |
|---|---|---|
| Gate | `auth` + `requirePermission('configurar')` | centros de custo, `extended.js:169` |
| Unicidade + régua de nome | `nome.trim()`, `UNIQUE`, 400 nomeando o cadastro | **setores**, `almoxarifado.js:2041+` |
| Soft delete | `WHERE id = ? AND ativo = 1`, 404, 200 `ja_inativo` sem auditar | **tipos de material** (versão da Etapa 23) |
| Auditoria | `auditar(db, payload, contexto)` + `autorDe(req)` | `extended.js:71` — o `auditarCadastro` de famílias é closure **não exportada** (A8) |

**A migration:** `CREATE UNIQUE INDEX` sobre `categorias_material_almoxarifado(nome)`. A tabela
não tem índice nenhum hoje, e as 27 sementes não colidem (medido) — aplica sem conflito.

**`auditLabels.js`:** acrescente `categoria: 'Categoria'` a `ROTULOS_ENTIDADE` (A7).

**C3 — o que a tela recebe.** O select de categoria do material passa a receber a lista do
endpoint **mais** o valor atual do material quando ele não estiver nela, marcado como fora de
catálogo. É a RN-04, e é o ponto onde esta etapa pode estragar dado do cliente.

---

### Task 1 (tronco): o catálogo vira cadastro — FEITA (`1bca087`)

> **Entregue.** 11 cenários (`categoriasCrud.api.test.js`), `test:api` 154/154, almoxarifado
> 42/42. Três controles positivos, cada um caindo na asserção certa — o do gate nomeou os
> **21** acessos indevidos (7 perfis × 3 verbos).
> **Contrato para as Tasks 2 e 3:** `GET /categorias[?todos=1]` (o `?todos=1` dos centros de
> custo, não o `?all=1` dos setores — é o GET vizinho no mesmo arquivo); `POST {nome}` → 201;
> `PUT /:id {nome?, ativo?}` → 200, **omitir `ativo` preserva** (reativar é `{nome, ativo:1}`);
> `DELETE /:id` → 200 `{success}` ou `{success, ja_inativo}`. Erros: 400 `'Nome é obrigatório'`,
> 400 `'Já existe uma categoria com este nome'`, 404 `'Categoria não encontrada'`, 403.
> **Três correções que a execução fez neste plano:** (1) a RN-06 só falava de **criar**
> duplicada — sem a mesma régua no **PUT**, renomear para nome ocupado devolvia **500** em vez
> de 400, e a tela diria "erro interno" para erro de preenchimento; (2) o `CREATE UNIQUE INDEX`
> **não** pode ficar solto: este plano dizia "aplica limpo (medido)" e o medido foi o **dev** —
> se a base do cliente tiver dois nomes iguais, a exceção sobe pelo `initSchema` inteiro e
> derruba o módulo por causa de duas linhas de catálogo. Ficou em `try/catch` com log que traz
> o `GROUP BY ... HAVING COUNT(*) > 1` pronto; (3) `tipo_uso` **não existe** nesta tabela — o
> aviso deste plano misturou com `familias_material_almoxarifado`; a armadilha real é só o
> `parent_id`, intocado.

**Files:** Modify `server/routes/almoxarifado/extended.js` (onde o `GET` e os centros de custo
já moram), `server/services/almoxarifado/schema.js` (o índice único) e
`server/services/almoxarifado/auditLabels.js` (o rótulo);
Test `server/tests/api/categoriasCrud.api.test.js`.

- [ ] **Step 0: leia as TRÊS fontes do C2** — o gate e a auditoria em **centros de custo**
  (`extended.js:162+`), a régua de nome em **setores** (`almoxarifado.js:2041+`) e o soft delete
  em **tipos de material**. Anote no relatório o que encontrou em cada uma.
  **NÃO** use famílias como molde: ela tem `parent_id`, validação de pai e código automático que
  categoria não precisa — e **não tem** unicidade de nome, que é justamente o que a RN-06 pede.
- [ ] **Step 1: teste que falha** — RN-02 (criar, renomear, desativar), RN-03 (**matriz de
  perfis, com a asserção negativa**: quem não tem o gate recebe 403), RN-06 (duplicada recusada),
  e **desativar não apaga**: o material que usa a categoria continua com ela, e a categoria some
  do `GET`. Guarda anti-teste-vazio: afirme que o `GET` **trazia** a categoria antes de afirmar
  que ela sumiu.
- [ ] **Step 2: implementar**: as três rotas + o `CREATE UNIQUE INDEX` no `schema.js` + o
  parâmetro de inativas no `GET` (C1) + `categoria: 'Categoria'` no `auditLabels.js`.
  **Com auditoria** — este cadastro nasce instrumentado, não vira o 13º sem rastro.
- [ ] **Step 3: controle positivo** (commitar antes): (a) remova o gate → o cenário da matriz cai
  nomeando o perfil que passou; (b) faça o desativar apagar a linha → o cenário do material cai;
  (c) remova o índice único → o cenário da duplicada cai.
- [ ] **Step 4:** `npm run test:api`; commit.

---

### Task 2 (galho): as telas param de hardcodar

**Files:** Modify **os TRÊS** componentes que declaram a lista (achado A1 — a versão anterior
listava dois e chamava de três):
`MaterialAlmoxarifadoForm.js` (`:13` a lista, `:569` o select, `:70` o default de criação, `:255`
o fallback), `ConferenciaEstoque.js` (`:10` a lista, `:667` o filtro) e
**`MateriaisAlmoxarifado.js`** (`:20` a lista, `:192` o filtro da listagem).
Test: `MaterialAlmoxarifadoForm.test.js`, `ConferenciaEstoque.test.js` e
`MateriaisAlmoxarifado.test.js` — os três **existem** e passam (38 cenários), e **nenhum congela
a lista hardcoded** (verificado pela Fase 2), então nada fica vermelho por tabela.

**Independência:** não depende da Task 1 (o `GET` já existe e já devolve as 27 categorias).

- [ ] **Step 1: teste que falha:**
  - **RN-01:** a lista do select vem do endpoint — **sabote o mock** trocando as categorias e o
    teste tem de acompanhar. Se ele passar com o mock trocado, está lendo constante do front.
  - **RN-04, o cenário de peso — e o vermelho é a metade VISÍVEL** (achado A4, reproduzido):
    material gravado com `CONSUMÍVEL` (fora do catálogo) **aparece selecionado na tela**, marcado
    como fora de catálogo. **Hoje a tela mostra a primeira opção (`Aço carbono`) enquanto o
    payload manda `CONSUMÍVEL`** — o `<select>` é controlado por state e o React não dispara
    `onChange` para valor ausente das opções. A tela mente sobre o que está no banco.
    **A asserção de payload entra como NÃO-REGRESSÃO, não como o vermelho** — ela **já passa
    hoje**, antes de qualquer implementação, e usada como teste-que-falha seria verde vazio.
  - **RN-07:** formulário de **criação** nasce com o campo vazio e uma opção `Selecione…` — hoje
    nasce `CONSUMÍVEL` (`:70`), fora do catálogo. Sem este cenário a etapa continua fabricando
    material que o catálogo não contém (achado A5).
  - Cenário negativo com a metade positiva: "a lista não tem `CONSUMÍVEL`" **e** "tem as do
    catálogo". **A metade positiva é obrigatória aqui por um motivo medido:** os três mocks
    terminam em `Promise.resolve({ data: [] })` como catch-all, então um cenário só-negativo
    passa com a lista **vazia**.
- [ ] **Step 2: implementar.** Um só ponto de busca reaproveitado pelos dois componentes; a
  lista deixa de existir como constante.
- [ ] **Step 3: controle positivo com alvo:** remova a concatenação do valor atual à lista → o
  cenário RN-04 cai **mostrando que a tela exibe `Aço carbono` para um material gravado como
  `CONSUMÍVEL`**. E remova o `Selecione…` → cai o cenário da RN-07.
- [ ] **Step 4:** `CI=true` test e build; commit.

---

### Task 3 (galho): a aba de categorias em Configurações

**Files:** Modify `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js`;
Test: arquivo próprio da aba (a convenção do diretório é **um arquivo por aba** — foi o que a
Etapa 24 estabeleceu ao criar `PerfisAcesso.test.js`).

**Interfaces:** consome C2 (Task 1) — **serialize com a Task 1**, ou construa contra o contrato
que a Task 1 relatar.

- [ ] **Step 1: teste que falha:** listar, criar, renomear, desativar pela aba; erro do servidor
  aparece com a **mensagem do servidor**; e **o aviso da RN-05** ao renomear (os materiais já
  classificados mantêm o nome antigo).
- [ ] **Step 2: implementar**, molde: a aba de famílias.
- [ ] **Step 3: controle positivo com alvo** (remova o aviso da RN-05 → cai o cenário dele).
- [ ] **Step 4:** `CI=true` test e build; commit.

---

### Task 4: integração e fechamento

- [ ] **Step 1:** integração — criar categoria pela rota, ver aparecer no `GET`, classificar um
  material com ela, e **ler pela tela-contrato da auditoria** (`GET /auditoria?entidade=<a que o
  molde usar>`) conferindo que o cadastro deixou rastro. **Não** espere total fixo.
- [ ] **Step 2:** os cinco comandos da suíte + o cliente com `TZ=UTC`, números **lidos**.
- [ ] **Step 3:** skill `fechar-etapa` inteira, **incluindo o Passo 8**.
  - **Letra A — a consulta de produção**, que é o entregável mais importante desta etapa para o
    André: quantos materiais existem por categoria hoje em produção. Escreva o SQL pronto para
    copiar e **o que fazer com cada resultado** (se todos estiverem numa categoria genérica, o
    remapeamento é trivial; se estiverem espalhados, é decisão dele). No banco de desenvolvimento
    são 2 materiais em `CONSUMÍVEL` — **diga que esse número é do dev e não vale para produção**.
  - **Letra B — a B6 é respondida** (vence o catálogo do cliente); e entra a pergunta nova:
    renomear deve propagar para os materiais, ou a coluna deve virar chave estrangeira?
  - **Spec 01:** a pendência "categorias hardcoded no front" sai; diga se a feature muda de cor.

## Próxima tarefa detalhada

Se parar aqui: **Fase 2** — agente fresco com plano + design e três perguntas (os contratos
cobrem os erros? as RN batem com o código? a Task 2 é galho de verdade?). Atenção especial a:
**o molde de famílias é mesmo o certo** (ou há cadastro mais parecido, como tipos de material?);
**quantos arquivos do client declaram a lista** (o design diz 3 — confira, porque foi uma
varredura minha e na Etapa 24 uma varredura minha estava errada); e se algum teste existente
congela a lista hardcoded (se congelar, ele **vai** ficar vermelho e isso precisa estar previsto).
