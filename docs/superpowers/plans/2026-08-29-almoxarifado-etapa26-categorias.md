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

- [x] **Step 0: leia as TRÊS fontes do C2** (`1bca087`) — o gate e a auditoria em **centros de custo**
  (`extended.js:162+`), a régua de nome em **setores** (`almoxarifado.js:2041+`) e o soft delete
  em **tipos de material**. Anote no relatório o que encontrou em cada uma.
  **NÃO** use famílias como molde: ela tem `parent_id`, validação de pai e código automático que
  categoria não precisa — e **não tem** unicidade de nome, que é justamente o que a RN-06 pede.
- [x] **Step 1: teste que falha** (`1bca087`) — RN-02 (criar, renomear, desativar), RN-03 (**matriz de
  perfis, com a asserção negativa**: quem não tem o gate recebe 403), RN-06 (duplicada recusada),
  e **desativar não apaga**: o material que usa a categoria continua com ela, e a categoria some
  do `GET`. Guarda anti-teste-vazio: afirme que o `GET` **trazia** a categoria antes de afirmar
  que ela sumiu.
- [x] **Step 2: implementar** (`1bca087`): as três rotas + o `CREATE UNIQUE INDEX` no `schema.js` + o
  parâmetro de inativas no `GET` (C1) + `categoria: 'Categoria'` no `auditLabels.js`.
  **Com auditoria** — este cadastro nasce instrumentado, não vira o 13º sem rastro.
- [x] **Step 3: controle positivo** (`1bca087`): (a) remova o gate → o cenário da matriz cai
  nomeando o perfil que passou; (b) faça o desativar apagar a linha → o cenário do material cai;
  (c) remova o índice único → o cenário da duplicada cai.
- [x] **Step 4:** `npm run test:api` **154/154**; commit `1bca087`.

---

### Task 2 (galho): as telas param de hardcodar — FEITA (`f047948`)

> **Entregue.** 15 cenários novos (53 nos três arquivos, era 38); suíte do client **572/572** em
> 38 arquivos; `CI=true build` limpo. Três controles positivos com alvo, cada um derrubando só
> o cenário certo.
>
> **O ponto único de busca é o hook `client/src/hooks/useCategoriasMaterial.js`** (molde:
> `useAlmoxPermissoes`, o hook vizinho), que devolve os **nomes** — é nome que
> `materiais.categoria` guarda. **Sem cache de módulo, de propósito**, ao contrário de
> `useAlmoxPermissoes`: a Task 3 torna o catálogo editável, e com cache a categoria recém-criada
> não apareceria no formulário de material até um reload completo — o usuário cadastraria a
> categoria e não a acharia no select, que é o mesmo "a tela mente" que esta etapa corrige. As
> três telas nunca ficam montadas juntas; uma requisição por montagem é barata perto disso.
>
> **UMA CORREÇÃO A ESTE PLANO, medida:** a RN-07 **não se resolve** só fazendo o campo nascer
> vazio. `createMaterial` (`server/services/almoxarifado/materialService.js:179`) faz
> `categoria: categoria || 'OUTROS'` — mandar vazio apenas trocaria "nasce `CONSUMÍVEL`" por
> "nasce `OUTROS`": as duas fora do catálogo, e a segunda escolhida pelo **servidor**, sem
> sequer aparecer na tela. Nem este plano nem o design tinham visto o fallback. Por isso o
> submit **barra o vazio antes do POST** ("Selecione a categoria do material"), com cenário
> próprio. A trava é **só do vazio**: categoria fora de catálogo continua salvando, como a
> decisão 3 do design mandava.
>
> **Divergência menor no controle positivo:** removida só a concatenação do valor atual, o
> select cai para `""` (a opção `Selecione…`), não para `Aço carbono` como este plano previa.
> `Aço carbono` aparece quando as **duas** sabotagens são aplicadas juntas — feito, e a
> mensagem foi exatamente `Expected: "CONSUMÍVEL" / Received: "Aço carbono"`. As duas correções
> se sustentam mutuamente, e o plano descrevia o mundo sem o `Selecione…`.

**Files:** Modify **os TRÊS** componentes que declaram a lista (achado A1 — a versão anterior
listava dois e chamava de três):
`MaterialAlmoxarifadoForm.js` (`:13` a lista, `:569` o select, `:70` o default de criação, `:255`
o fallback), `ConferenciaEstoque.js` (`:10` a lista, `:667` o filtro) e
**`MateriaisAlmoxarifado.js`** (`:20` a lista, `:192` o filtro da listagem).
Test: `MaterialAlmoxarifadoForm.test.js`, `ConferenciaEstoque.test.js` e
`MateriaisAlmoxarifado.test.js` — os três **existem** e passam (38 cenários), e **nenhum congela
a lista hardcoded** (verificado pela Fase 2), então nada fica vermelho por tabela.

**Independência:** não depende da Task 1 (o `GET` já existe e já devolve as 27 categorias).

- [x] **Step 1: teste que falha** — `f047948`. 15 cenários, **14 vermelhos** antes da
  implementação (o 15º é o de não-regressão do payload, verde de propósito).
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
- [x] **Step 2: implementar** — `f047948`. Ponto único: `hooks/useCategoriasMaterial.js`,
  reaproveitado pelos **três** componentes; nenhuma das três constantes existe mais.
- [x] **Step 3: controle positivo com alvo** — `md5sum` antes/depois/restaurado, `git diff
  --stat` vazio nas três vezes:
  - (a) removida a concatenação do valor atual → caem **só** os 2 cenários da RN-04
    (`Expected: "CONSUMÍVEL" / Received: ""`, `Expected: "MATERIAL DE SOLDA" / Received: ""`);
    14 passam.
  - (b) removido o `Selecione…` → cai **só** o cenário da RN-07
    (`Expected: "" / Received: "Aço carbono"` — o material nasceria classificado como
    `Aço carbono` por acidente de ordenação); 15 passam.
  - (a)+(b) juntas → a mentira que o plano descreve, verbatim:
    `Expected: "CONSUMÍVEL" / Received: "Aço carbono"`.
  - (c) devolvida a constante hardcoded a `MateriaisAlmoxarifado.js` → caem **só** os 3
    cenários da RN-01 **daquele** arquivo; os outros dois arquivos seguem verdes (50/53).
- [x] **Step 4:** `CI=true` test **572/572** (38 suítes) e build `Compiled successfully`;
  commit `f047948`.

---

### Task 3 (galho): a aba de categorias em Configurações — FEITA (`c87fe92`)

**Files:** Modify `client/src/components/almoxarifado/ConfiguracoesAlmoxarifado.js`;
Test: arquivo próprio da aba (a convenção do diretório é **um arquivo por aba** — foi o que a
Etapa 24 estabeleceu ao criar `PerfisAcesso.test.js`).

**Interfaces:** consome C2 (Task 1) — **serialize com a Task 1**, ou construa contra o contrato
que a Task 1 relatar.

- [x] **Step 1: teste que falha** (`c87fe92`): listar, criar, renomear, desativar **e REATIVAR**
  pela aba; erro do servidor aparece com a **mensagem do servidor**; e **o aviso da RN-05** ao
  renomear (os materiais já classificados mantêm o nome antigo).
  **CORREÇÃO — este step OMITIA "reativar", e a omissão contradizia o C1 deste mesmo plano**,
  que justifica a mudança de contrato dizendo que o parâmetro de inativas existe "para a aba ter
  como reativar o que desativou". Executado ao pé da letra, entregaria a aba **sem o único uso
  que justifica a mudança da Task 1**, e sem teste que denunciasse.
- [x] **Step 2: implementar** (`c87fe92`) — molde: a aba de famílias, mas SEM `parent_id`/código automático/hierarquia (a tabela tem `parent_id` herdado e sem uso; a lista é plana).
- [x] **Step 3: controle positivo com alvo** (`c87fe92`) — removido o aviso da RN-05, caiu o cenário dele.
- [x] **Step 4:** `CI=true` test **582/582** em 39 suítes e build limpo; commit `c87fe92`.

---

### Task 4: integração e fechamento — FEITA (`9d86a84`)

> **Entregue.** `server/tests/api/categoriaIntegracao.api.test.js`, **4 cenários**, `test:api`
> **155/155 arquivos**. Três controles positivos com alvo (md5 antes/depois/restaurado,
> `git diff --stat` vazio nas três vezes), cada um caindo na asserção certa:
> (a) removido `categoria: 'Categoria'` do `auditLabels` → cai **só** o cenário (3), na linha do
> `entidade_rotulo` (`"categoria"` cru);
> (b) auditado com `entidade: 'categoria_material'` → cai o (3) **na guarda anti-teste-vazio**
> (*"a trilha de `entidade=categoria` voltou VAZIA"*) e o (4) nomeando o que o filtro passou a
> oferecer (`["categoria_material","familia","material"]`) — **é o controle que prova que a guarda
> é carregada, não decorativa**;
> (c) `categoria: categoria || 'OUTROS'` trocado por `'OUTROS'` fixo → cai **só** o (2), com
> *"o material foi gravado com "OUTROS" e nao com a categoria escolhida"*.
>
> **Divergência do plano, deliberada:** o Step 1 dizia `GET /auditoria?entidade=<a que o molde
> usar>`. O cenário (10) da Task 1 **já lê a trilha filtrando por `entidade` + `entidade_id`**, e
> repetir aquilo aqui não acrescentaria nada. A integração filtra **só por `entidade`** — que é
> como a tela é usada de verdade ("o que aconteceu com categorias") — e acrescenta um quarto
> cenário que o plano não previa: **`/auditoria/opcoes` passa a OFERECER `categoria`** no filtro.
> Sem ele, o rastro poderia existir no banco e não ter como ser filtrado pela tela, que na prática
> é o mesmo que não existir.

- [x] **Step 1:** integração (`9d86a84`) — criar categoria pela rota, ver aparecer no `GET`,
  classificar um material com ela, e ler pela tela-contrato da auditoria. **Sem total fixo**: o
  banco de teste é compartilhado com as sementes e com os outros arquivos, então um número fixo
  quebraria por motivo alheio e esconderia o achado atrás de um vermelho de contagem — o que se
  afirma é a **composição** (os atos DESTA categoria, com estas ações, este rótulo e este autor).
  **Guarda anti-teste-vazio em dois degraus**, porque `[].every(...)` é verdadeiro: primeiro "a
  leitura trouxe alguma coisa" e "o ato desta categoria foi encontrado", só depois qualquer
  asserção sobre conteúdo.
- [x] **Step 2:** verificação final — números lidos, na seção abaixo.
- [x] **Step 3:** skill `fechar-etapa` inteira, incluindo o Passo 8.
  - **Letra A:** entraram **duas** consultas, não uma. A **A6** (materiais por categoria em
    produção, com o que fazer em cada cenário e o aviso explícito de que os 2 materiais do dev
    **não valem** para produção) e a **A7**, que o plano não previa: a Task 1 pôs o
    `CREATE UNIQUE INDEX` em `try/catch`, então **se houver nome duplicado em produção o índice
    não é criado e a RN-06 não vale** — sem nada quebrar visivelmente. A consulta é o
    `GROUP BY ... HAVING COUNT(*) > 1` que já está no log do `schema.js`.
  - **Letra B:** a **B6 foi respondida** (vence o catálogo do cliente) e entrou a **B58**
    (renomear propaga, vira chave estrangeira, ou fica como está?), com as três opções, o custo de
    cada uma e a recomendação escrita.
  - **Letra C:** entrou o furo **C33** — o filtro de categoria da listagem passa a oferecer as 27
    do catálogo e **devolve zero** enquanto o acervo não for remapeado. Consequência direta da
    decisão 2 (não migrar), e o usuário precisa saber antes de estranhar.
  - **Spec 01:** a pendência da linha `:52` saiu, **e ficou escrito no lugar dela que a Fase 0
    desta etapa errou a varredura tendo a resposta ali mesmo** — aquela linha nomeava os três
    arquivos corretamente e dizia "mexe em três telas". **A feature 01 continua 🟡** (fecha um item
    do checklist de Frontend; sobram tabela de conversões, grupo acima de família,
    motivos/transportadoras/tipos de documento, `almoxarifadoApi.js` e anexos na tela).

## Verificação final — números LIDOS (2026-08-29)

| Comando | Resultado |
|---|---|
| `cd server && npm run test:api` | **155/155 arquivos** |
| `cd server && npm run test:almoxarifado` | **42/42** |
| `cd server && npm run test:validation` | **4/4** |
| `cd server && npm run test:safealter` | **3/3** |
| `cd server && npm run test:sqlite` | **5/5** |
| `cd client && CI=true npx react-scripts test --watchAll=false` | **582/582 em 39 suítes** |
| `cd client && TZ=UTC CI=true npx react-scripts test --watchAll=false` | **582/582 em 39 suítes** |
| `cd client && CI=true npx react-scripts build` | `Compiled successfully` |

## Retro — os quatro números desta etapa

| Número | O quê |
|---|---|
| **10 achados, 2 críticos** | A **Fase 2** revisou o plano antes de qualquer código. Os dois críticos: (1) **a varredura do design errou os arquivos** — dizia "3" e nomeava **dois**, deixando `MateriaisAlmoxarifado.js` de fora, com a resposta certa escrita em `01-cadastros-materiais/README.md:52`; executado assim, o plano violaria a própria RN-01; (2) **o molde era o errado** — mandava copiar famílias, que tem `parent_id`, validação de pai e código automático e **não tem unicidade de nome**, justamente o que a RN-06 pedia. |
| **3 de 3 tasks corrigiram o plano** | Nenhuma executou o plano como estava escrito, e as três correções foram medidas, não opinião. |
| **2 defeitos de produto achados ao medir** | O `<select>` controlado exibindo a primeira opção enquanto o payload mandava outra (**a tela mentia sobre o banco**), e `categoria \|\| 'OUTROS'` no `materialService`. Nenhum dos dois estava no design. |
| **3 controles positivos na Task 4, 3 acertando a asserção certa** | Incluindo o (b), que derruba a **guarda anti-teste-vazio** — a prova de que ela não é decorativa. |

**O que cada task corrigiu no plano:**

1. **Task 1** — a **RN-06 estava incompleta**: só falava de **criar** duplicada. Sem a mesma régua
   no `PUT`, renomear para nome ocupado devolvia **500**, e a tela (que mostra o `error` cru do
   servidor) diria "erro interno" para erro de preenchimento. E **protegeu o `initSchema`**: o
   plano dizia que o `CREATE UNIQUE INDEX` "aplica limpo (medido)" — o medido foi o **dev**; numa
   base de cliente com duplicatas, a exceção subiria pelo `initSchema` inteiro e derrubaria o
   módulo por causa de duas linhas de catálogo.
2. **Task 2** — **"nascer vazio" não bastava**, e nem o plano nem o design tinham visto:
   `createMaterial` faz `categoria: categoria || 'OUTROS'`, então o campo vazio apenas trocaria
   "nasce `CONSUMÍVEL`" por "nasce `OUTROS`" — as duas fora do catálogo, e a segunda escolhida
   pelo **servidor**, sem sequer aparecer na tela.
3. **Task 3** — o **Step 1 omitia "reativar", contradizendo o próprio C1** deste plano, que
   justifica a mudança de contrato da Task 1 dizendo que o parâmetro de inativas existe "para a
   aba ter como reativar o que desativou". Executado ao pé da letra, entregaria a aba **sem o
   único uso que justifica a mudança da Task 1**, e sem teste que denunciasse.

**A lição que sai desta etapa e vale para a próxima:** a Fase 0 mediu o código **sem ler a spec da
feature antes**, e errou uma medição que estava pronta no repositório. É a **segunda etapa
seguida** (a 24 foi a primeira, com a tela de perfis que existia) em que uma varredura minha sobre
"o que existe no client" falha. **Ler a spec da feature ANTES de medir** virou passo obrigatório
da Fase 0.

## Próxima tarefa detalhada

**Etapa 27 — feature 08 (tipos de entrada de material).** Escolhida entre as candidatas do mapa
(05 picking, 06 motor de regras de aprovação, 08 tipos de entrada, 09 plano de inspeção com
medidas) pela Fase 0 medida em 2026-08-29 — **ver a medição completa no relatório do fechamento**.
O que a próxima sessão precisa saber antes de abrir código:

- **Meça pelo nome do CONTRATO, não pelo nome que você imagina.** Foi assim que a Etapa 24 errou
  (procurou `perfil_almoxarifado`; a rota era `perfis-usuario`) e como esta errou a contagem de
  arquivos do client.
- **Leia `specs/modulo-almoxarifado/<feature>/README.md` ANTES de medir o código.** A regra nova,
  e ela existe por causa do erro desta etapa.
- **O molde de cadastro simples do módulo já está resolvido e escrito**: gate
  `requirePermission('configurar')` + `auditar(db, payload, contexto)`/`autorDe(req)` dos centros
  de custo em `routes/almoxarifado/extended.js`; régua de nome/unicidade dos setores; soft delete
  dos tipos de material (versão da Etapa 23: `AND ativo = 1`, 404, 200 `ja_inativo` sem auditar);
  `?todos=1` no GET; rótulo em `auditLabels.ROTULOS_ENTIDADE`. **Famílias não é molde de nada.**
- **O molde de aba de Configurações também**: `TabCategorias` em `ConfiguracoesAlmoxarifado.js`
  (Etapa 26) é o exemplo mais novo e mais simples — GET sempre com `?todos=1`, `PUT` de rename
  **omitindo** `ativo`, `PUT` de reativação com `ativo: 1` explícito, e a mensagem do servidor
  exibida crua.
