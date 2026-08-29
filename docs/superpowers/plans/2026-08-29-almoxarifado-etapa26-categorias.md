# Etapa 26 — Uma lista de categorias só, e ela é do cliente (plano)

> **For agentic workers:** REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`.

**Goal:** as telas param de ter lista de categorias hardcoded (duplicada em 3 arquivos) e passam
a ler o catálogo do cliente; o catálogo vira cadastro editável; e nenhum material tem a
classificação trocada em silêncio no caminho.

**Architecture:** o `GET` já existe e **já é consumido**; a etapa acrescenta o CRUD (molde:
famílias, que já o têm completo) e troca a fonte no client. Sem migration de schema.

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
| RN-02 | Categoria é cadastro editável (criar/renomear/desativar), molde das famílias | `categoriasCrud` |
| RN-03 | Escrever categoria exige perfil — **o mesmo gate das famílias**, não um novo | `categoriasCrud` (matriz) |
| RN-04 | Categoria fora do catálogo **não some e não troca sozinha** ao salvar | teste de client (**cenário de peso**) |
| RN-05 | Renomear **não** reescreve os materiais — a tela avisa | `categoriasCrud` + tela |
| RN-06 | Duplicada é recusada, com a régua de nome dos cadastros irmãos | `categoriasCrud` |

## Contratos

**C1 — `GET /api/almoxarifado/categorias`** (existe, `extended.js:148`, gate `auth`)
Devolve as linhas de `categorias_material_almoxarifado` com `ativo = 1`, `ORDER BY nome`.
**Não muda.** Já é consumido por `ConfiguracoesAlmoxarifado.js:2884`.

**C2 — as rotas novas.** **Antes de escrever, leia o CRUD de famílias**
(`routes/almoxarifado.js:2288` POST, `:2337` PUT, `:2413` DELETE) e **copie a forma**: mesmo
gate, mesmo formato de erro, mesma régua de nome, mesma auditoria. **Não invente contrato** —
o valor desta etapa está em o cadastro novo ser indistinguível dos 12 que a Etapa 19
instrumentou, e o plano **não** congela literais aqui de propósito: quem executa **lê do molde**
e registra no relatório qual gate, qual mensagem e qual régua encontrou.

**C3 — o que a tela recebe.** O select de categoria do material passa a receber a lista do
endpoint **mais** o valor atual do material quando ele não estiver nela, marcado como fora de
catálogo. É a RN-04, e é o ponto onde esta etapa pode estragar dado do cliente.

---

### Task 1 (tronco): o catálogo vira cadastro

**Files:** Modify `server/routes/almoxarifado/extended.js` (ou o arquivo das famílias, o que for
coerente com o molde); Test `server/tests/api/categoriasCrud.api.test.js`.

- [ ] **Step 0: leia o molde antes de escrever** — o CRUD de famílias, ponta a ponta, incluindo
  o gate, a auditoria e a régua de nome. Anote no relatório o que encontrou.
- [ ] **Step 1: teste que falha** — RN-02 (criar, renomear, desativar), RN-03 (**matriz de
  perfis, com a asserção negativa**: quem não tem o gate recebe 403), RN-06 (duplicada recusada),
  e **desativar não apaga**: o material que usa a categoria continua com ela, e a categoria some
  do `GET`. Guarda anti-teste-vazio: afirme que o `GET` **trazia** a categoria antes de afirmar
  que ela sumiu.
- [ ] **Step 2: implementar**, copiando o molde. **Com auditoria** — a Etapa 19 instrumentou os
  12 cadastros; este nasce instrumentado, não vira o 13º sem rastro.
- [ ] **Step 3: controle positivo** (commitar antes): (a) remova o gate → o cenário da matriz cai
  nomeando o perfil que passou; (b) faça o desativar apagar a linha → o cenário do material cai.
- [ ] **Step 4:** `npm run test:api`; commit.

---

### Task 2 (galho): as telas param de hardcodar

**Files:** Modify `client/src/components/almoxarifado/MaterialAlmoxarifadoForm.js` (`:14`, `:70`,
`:255`) e `ConferenciaEstoque.js` (`:11`); Test — os arquivos de teste existentes desses
componentes (**confira quais existem** antes de criar novo).

**Independência:** não depende da Task 1 (o `GET` já existe e já devolve as 27 categorias).

- [ ] **Step 1: teste que falha:**
  - **RN-01:** a lista do select vem do endpoint — **sabote o mock** trocando as categorias e o
    teste tem de acompanhar. Se ele passar com o mock trocado, está lendo constante do front.
  - **RN-04, o cenário de peso:** material gravado com `CONSUMÍVEL` (que **não** está no
    catálogo) abre com o valor **preservado e visível**, e **salvar sem tocar no campo mantém
    `CONSUMÍVEL`**. Afirme o payload do `PUT`, não só o que aparece na tela — o estrago é o que
    vai para o banco.
  - Cenário negativo com a metade positiva: "a lista não tem `CONSUMÍVEL`" **e** "tem as do
    catálogo".
- [ ] **Step 2: implementar.** Um só ponto de busca reaproveitado pelos dois componentes; a
  lista deixa de existir como constante.
- [ ] **Step 3: controle positivo com alvo:** faça o select cair na primeira opção quando o valor
  não está na lista → o cenário RN-04 cai **mostrando a categoria trocada no payload**.
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
