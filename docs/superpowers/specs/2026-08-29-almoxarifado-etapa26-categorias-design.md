# Almoxarifado — Etapa 26: uma lista de categorias só, e ela é do cliente (design)

Data: 2026-08-29 · Branch: `desenvolvimento-almoxarifado`
Origem: a pendência "categorias hardcoded no front" da feature 01, aberta desde a Etapa 2 e
encostada (sem resolver) pela Etapa 8c — e a **B6**, que pergunta qual lista vale.

## Decisão de escopo (Fase 0 — medida em 2026-08-29)

**A B6 pergunta "qual das duas listas de categorias vale?". A medição mostrou que a pergunta
está incompleta: as duas listas não têm UMA categoria em comum, e a que foi desenhada para a
GMP está morta no banco.**

- **A lista das telas** — 11 itens em MAIÚSCULAS, **hardcoded e duplicados em 3 arquivos**:
  `MaterialAlmoxarifadoForm.js:13` (o `<select>` do cadastro, `:569`),
  `ConferenciaEstoque.js:10` (o filtro da nova conferência, `:667`) e
  **`MateriaisAlmoxarifado.js:20`** (o filtro da listagem, `:192`).
  `CONSUMÍVEL`, `FERRAMENTA`, `EPI`, `ELÉTRICO`, `HIDRÁULICO`… É genérica, serve para qualquer
  empresa.

  > **CORREÇÃO (achado A1 da Fase 2) — a primeira versão deste documento errou a varredura, e
  > errou tendo a resposta certa dentro do repositório.** Eu escrevi "3 arquivos" e nomeei
  > **dois**: contei `:70` e `:255` como se fossem outro arquivo, quando são o mesmo
  > `MaterialAlmoxarifadoForm.js`. O terceiro de verdade, `MateriaisAlmoxarifado.js`, ficou de
  > fora — e executar o plano assim **violaria a própria RN-01** ("nenhum arquivo do client volta
  > a declarar a lista"), deixando a pendência da spec 01 impossível de marcar como fechada.
  >
  > **O agravante é que a `specs/modulo-almoxarifado/01-cadastros-materiais/README.md:52` já
  > nomeava os três, e diz "mexe em três telas".** A Fase 0 da skill manda ler a spec da feature
  > **antes** de qualquer coisa; eu fui direto medir e errei uma medição que estava pronta. É a
  > segunda etapa seguida em que uma varredura minha sobre "o que existe no client" falha (na 24
  > foi a tela de perfis, que existia).
- **A lista do servidor** — 27 itens em `CATEGORIAS_SEED` (`services/almoxarifado/schema.js:7`),
  semeados na tabela `categorias_material_almoxarifado`: `Aço carbono`, `Aço inox`, `Chapas`,
  `Tubos`, `Perfis estruturais`, `Componentes usinados`, `Rolamentos`, `Elementos de fixação`,
  `Solda e consumíveis`… É a taxonomia de **uma metalúrgica**, que é o que a GMP é.

**Medido no banco:**

```
materiais por categoria:  CONSUMÍVEL → 2      (nenhuma outra)
linhas em categorias_material_almoxarifado:  27   (nenhuma em uso)
```

Ou seja: **a GMP classifica material com a lista genérica enquanto a tabela desenhada para ela
está intacta e sem uso.** E a tabela tem `GET /api/almoxarifado/categorias` (`extended.js:148`)
que **já é consumido** por `ConfiguracoesAlmoxarifado.js:2884` — o carregamento existe; o que
não existe é tela para **editar**, e nenhum formulário de material lê dali.

> **A distinção "o carregamento existe, a tela de editar não" está escrita de propósito.** Foi
> exatamente ela que faltou na Etapa 24, onde eu afirmei que uma tela não existia porque procurei
> pelo nome errado e desenhei a etapa inteira sobre a premissa falsa. Aqui: `GET` existe, é
> consumido por uma tela, e **não há POST/PUT/DELETE** — conferido rota a rota.

## As decisões, e o que foi descartado

**1. Vence a lista do cliente (a tabela), e ela deixa de ser semente morta.** A taxonomia de
metalúrgica é a que serve para quem vai usar o sistema; a genérica serve para ninguém em
particular. **Descartado** manter as duas (é o estado de hoje, e é o problema) e **descartado**
fundir as listas: `EPI`/`EPIs`, `FERRAMENTA`/`Ferramentas`, `ELÉTRICO`/`Elétrica` são pares
conceituais com grafias diferentes, e fundir criaria uma terceira lista que ninguém pediu.

**2. NÃO migrar categoria de material automaticamente.** Trocar a categoria de um cadastro é
mexer em dado do cliente sem ele pedir, e o banco de desenvolvimento não é o de produção — aqui
são 2 materiais, lá podem ser centenas com distribuição desconhecida. **A consulta vai para a
letra A**, para o André rodar em produção **antes** do deploy e decidir com número na mão.
**Descartado** um `UPDATE` de mapeamento no deploy: irreversível sobre dado do cliente, e
baseado numa medição que eu não tenho.

**3. O material com categoria fora do catálogo continua válido, e a tela mostra isso.**

**CORREÇÃO (achado A4, REPRODUZIDO): eu descrevi o bug errado — e o real é pior.** Eu escrevi
que "salvar trocaria a categoria em silêncio". Não troca: o `<select>` é **controlado por
state** (`MaterialAlmoxarifadoForm.js:568`), e o React **não dispara `onChange`** quando o valor
do state não está entre as opções. Medido:

```
DOM select.value  = "Chapas"        <- o que o usuário VÊ
state (payload)   = "CONSUMÍVEL"    <- o que vai para o banco
```

Ou seja: a tela mostra a **primeira opção** enquanto o payload manda o valor gravado. O usuário
acredita ter salvo `Chapas` e salvou `CONSUMÍVEL` — **a tela mente sobre o que está no banco**,
que é mais insidioso que a troca, porque não deixa rastro de erro.

A correção é a mesma (o select inclui o valor atual quando ele não está no catálogo, marcado
como fora de catálogo), mas **o teste muda de alvo**: o vermelho é a metade **visível** (o valor
gravado aparece selecionado), não a asserção de payload — essa **já passa hoje**, antes de
qualquer implementação, e como vermelho seria verde vazio.

**Descartado** bloquear o save (impediria editar o preço de um material só porque a categoria
dele é antiga).

## Regras de negócio (RN)

- **RN-01 — Uma fonte só.** As telas param de ter lista hardcoded e passam a ler
  `GET /api/almoxarifado/categorias`. Nenhum arquivo do client volta a declarar a lista.
- **RN-02 — Categoria é cadastro editável**: criar, renomear, desativar. Desativar **não**
  apaga: some do select e continua valendo nos materiais que já a usam.
  **CORREÇÃO (achado A2): o molde NÃO é famílias.** Famílias tem `parent_id`, validação de pai,
  bloqueio de inativação com filhas e geração automática de código — complexidade que categoria
  não precisa (e a tabela **tem** `parent_id`, o que torna o erro fácil de cometer sem perceber).
  O molde é **híbrido, por assunto**:
  **soft delete → tipos de material** (`UPDATE ... SET ativo = 0 WHERE id = ? AND ativo = 1`,
  404 para inexistente, 200 `ja_inativo` idempotente sem auditar — é a versão **já corrigida pela
  Etapa 23**, que famílias não tem).
- **RN-03 — Escrever categoria exige `requirePermission('configurar')`**, o gate dos centros de
  custo (`extended.js:169`), que ficam no **mesmo arquivo** onde as rotas novas vão.
  **CORREÇÃO (achado A3): a versão anterior mandava usar "o gate das famílias" E pedia teste de
  matriz de PERFIS — as duas coisas não cabem juntas.** `denyUnlessAlmoxAdmin` (famílias) é a
  camada de **módulo**: não olha `ACAO_PERFIS` nem `getPerfilFromUser`, então um
  `perfil_almoxarifado = 'ADMINISTRADOR'` sem admin de módulo toma 403 e um `is_superadmin` sem
  perfil nenhum passa. Matriz de perfis é a régua de `requirePermission`. Escolhido
  `requirePermission('configurar')` porque é o gate do vizinho no mesmo arquivo, é a camada que
  a RN quer descrever, e mantém a etapa coerente com as duas camadas do módulo.
- **RN-04 — Categoria fora do catálogo não some e não troca sozinha.** Ao abrir um material cuja
  categoria não está na lista ativa, o select inclui o valor atual, identificado como fora de
  catálogo. Salvar sem tocar no campo **mantém** o valor.
- **RN-07 — Material novo nasce com categoria do catálogo** (achado A5, que não tinha dono).
  `MaterialAlmoxarifadoForm.js:70` inicia o formulário com `categoria: 'CONSUMÍVEL'` e `:255` usa
  o mesmo como fallback ao carregar. Se só as listas mudarem, **todo material novo continuaria
  nascendo fora do catálogo** — a etapa entregaria uma tela que lê do catálogo e segue
  produzindo dado que ele não contém, sem teste que denuncie. O campo passa a nascer **vazio**,
  com uma opção `Selecione…`, tornando a classificação uma escolha consciente.
  **Descartado** usar a primeira do catálogo (classificaria material como `Aço carbono` por
  acidente de ordenação alfabética).
- **RN-05 — Renomear categoria não reescreve os materiais.** A coluna `materiais.categoria` é
  texto; renomear a linha do catálogo **não** propaga. Isso fica **declarado na tela** (ao
  renomear, avisa que os materiais já classificados mantêm o nome antigo) — e vai para a letra B
  como a pergunta que o André decide: propagar ou virar chave estrangeira é outra etapa.
- **RN-06 — Categoria duplicada é recusada**, com a régua de **setores** — o **único** cadastro
  do módulo com unicidade de **nome** (`nome TEXT UNIQUE NOT NULL`, `nome.trim()`, 400 com
  mensagem nomeando o cadastro). **CORREÇÃO (achado A2): a versão anterior mandava "conferir se
  famílias usa UNIQUE" — famílias NÃO tem unicidade de nome** (o `UNIQUE` dela é no `codigo`),
  então não havia régua para copiar e o executor teria inventado uma.
  **E isto muda a arquitetura:** `categorias_material_almoxarifado` **não tem índice nenhum**
  (medido), então a RN-06 **exige um `CREATE UNIQUE INDEX`** — o design dizia "sem migration de
  schema" e **estava errado**. As 27 sementes não colidem entre si (medido), então o índice
  aplica sem conflito.

## Arquitetura

- **`routes/almoxarifado/extended.js`** — POST, PUT e DELETE de categorias, ao lado do `GET` que
  já mora lá e dos **centros de custo**, cujo gate e cujo helper de auditoria (`auditar(db,
  payload, contexto)`, `:71`) são os alcançáveis deste arquivo. **Achado A8:** o
  `auditarCadastro` de famílias é uma **closure não exportada** de `routes/almoxarifado.js:261` —
  "copiar a auditoria de famílias" dentro do `extended.js` é literalmente impossível.
- **Uma migration** (`CREATE UNIQUE INDEX` no nome) — o design dizia "sem migration" e estava
  errado (RN-06).
- **`auditLabels.js`** — `categoria: 'Categoria'` em `ROTULOS_ENTIDADE` (achado A7): sem isso a
  entidade nova aparece como `categoria` cru no filtro da tela de auditoria, no meio de
  "Família", "Setor" e "Centro de custo".
- **`client/src/components/almoxarifado/`** — um hook ou serviço único que busca as categorias,
  consumido pelo formulário de material e pela conferência; a aba de Configurações ganha o CRUD
  (molde: a aba de famílias).

## Testes

- `categoriasCrud.api.test.js`: RN-02 (criar/renomear/desativar), RN-03 (gate — **matriz de
  perfis**, com a asserção negativa), RN-06 (duplicada recusada), e **desativar não apaga**
  (o material que a usa continua com ela).
- `MaterialAlmoxarifadoForm` / `ConferenciaEstoque` (client): RN-01 (a lista vem do endpoint —
  sabote o mock e o teste tem de acompanhar) e **RN-04, o cenário de peso**: material com
  categoria fora do catálogo abre com o valor preservado e **salva sem trocá-lo**.
- Integração: criar categoria pela rota, ver aparecer no `GET`, classificar material com ela.
- Controle positivo com alvo em cada um, **lendo qual asserção caiu**.

## O que muda em cada camada

| Camada | Mudança |
|---|---|
| `routes/.../extended.js` | POST/PUT/DELETE de categorias, com auditoria |
| `client/.../MaterialAlmoxarifadoForm.js`, `ConferenciaEstoque.js` | param de hardcodar; leem do endpoint |
| `client/.../ConfiguracoesAlmoxarifado.js` | aba de categorias com CRUD |
| `specs/01` | a pendência "categorias hardcoded" sai; a B6 é respondida |

## Fica FORA, declarado

- **Migrar os materiais existentes** (decisão 2) — letra A, com a consulta pronta.
- **Categoria virar chave estrangeira** (hoje é texto livre na coluna `materiais.categoria`) —
  é a mudança que tornaria a RN-05 desnecessária, e é migração de schema com risco próprio.
- **A lista genérica sumir do histórico** — materiais antigos seguem com o valor que têm até
  alguém editá-los.
