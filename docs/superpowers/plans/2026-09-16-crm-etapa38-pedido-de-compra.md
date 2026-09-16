# Etapa 38 — O pedido de compra ganha criação, e o recebimento contra o pedido deixa de ser inerte: implementação

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` para
> executar este plano task a task. Os passos usam checkbox (`- [ ]`). Antes da primeira task, leia
> `.superpowers/sdd/etapa38-fase0-pedido-de-compra.md` (a Fase 0 medida, com sonda **executada**
> contra o dump de produção) e o design abaixo. **Onde a medição e este plano divergirem, vale a
> medição** — e onde este plano decidiu contra a proposta do controlador, está dito, com o motivo e o
> descartado, na seção "Decisões desta etapa" do design.

**Goal:** fazer o **módulo core Compras conseguir criar um pedido**, para que a Etapa 37 deixe de ser
inerte. Hoje `COUNT(pedidos_compra) = 0` no banco de produção de 161 MB e **não existe código de
aplicação que insira um pedido**: `server/index.js:20002` é `app.get`, não há `app.post`/`app.put`
para `/api/compras/pedidos` em lugar nenhum, o botão "Novo Pedido" (`Compras.js:364`) e o `<Link>`
"Editar" de cada linha (`:277`) caem no `path="*"` de `App.js:333` e **piscam de volta para a lista**,
e o único escritor de produção das duas tabelas é o acumulador da própria 37
(`receiptService.js:1246`), que só sabe **subtrair** de uma linha que ninguém cria. Sete arquivos de
teste de API, duas colunas de migration, três portas com régua de saldo e um `<select>` novo — e
nada disso pode ser exercido por um clique, em nenhum ambiente, incluindo produção. O roteiro de
teste manual da Etapa 37 (`plano:~1806`) começa com *"criar pedido no módulo Compras"* e é
**inexecutável por qualquer pessoa, hoje**.

**Architecture:** primeiro a **extração** de `/api/compras/*` de `server/index.js` para
`server/routes/compras.js` (23 rotas contíguas + 5 helpers, **verbatim e na mesma ordem**, multer por
DI) e o registrador montado no harness — **sem isso nenhuma task desta etapa tem régua**, porque hoje
**zero** testes batem em `/api/compras/*`. Depois um **serviço** (`server/services/compras/
pedidoCompraService.js`) com `criarPedido`/`atualizarPedido`/`obterPedido`/`excluirPedido`/
`importarPedidos`, validado por **Zod** (`z.looseObject`, `validate()` reusado do almoxarifado — o
core tem **0** Zod hoje) e com `numero` **gerado** por `inserirComNumeroUnico(db, 'PC', …)`. A régua
de edição e exclusão **pergunta ao recebimento** (`quantidade_recebida > 0` e recebimento vinculado),
sem escrever uma linha nas tabelas da 37. Nos galhos: a importação XLSX pelo precedente medido
(navegador lê o `.xlsx`, servidor recebe JSON), o formulário em `client/src/components/compras/` com
as rotas **antes** do `path="*"`, e o "Gerar pedido" da Reposição dando o **primeiro consumidor de
client** a `vincularPedidoCompra` desde a Etapa 14.

**Tech Stack:** Express + SQLite (`server/`), Zod **4.4.3** (`z.looseObject` — `z.object`
**descartaria** chave não declarada, e `validate()` substitui `req.body` por `parsed.data`); React CRA
(`client/`), testes com `createRoot` + `act` — ⚠️ `@testing-library/react` **não está instalado**
nesta base; `xlsx` **já está** no client (`ItensFornecedor.js`, `ListaPrecos.js`,
`RelatoriosAlmoxarifado.js`).

> ⚠️ **Este plano foi escrito ENQUANTO o fechamento da Etapa 37 rodava.** Duas consequências, as duas
> com instrução:
> 1. **A numeração das letras do doc de novidades vai mudar debaixo de você.** Medido hoje: B = B88,
>    A = A11, C = C49, F = F12, G = G18. O fechamento da 37 avança **todas**. Na T8, **rode o `grep`
>    de novo** (o comando está na seção de decisões do design) e comece na seguinte. **Não deduza.**
> 2. **Não rode as cinco suítes durante a T1** se o controlador ainda estiver com elas; rode os
>    arquivos um a um (`node tests/api/<arquivo>.api.test.js`) até a T7.

**Spec:** `docs/superpowers/specs/2026-09-16-crm-etapa38-pedido-de-compra-design.md` — leia junto; as
**RN-C01 a RN-C14**, as **12 decisões** (com o descartado), os **11 riscos** e as **11 medições
novas** estão lá.

---

## Global Constraints

- **Este módulo é CORE, e ele tem UMA camada de autorização, não duas.** Medido: todas as 26 rotas
  `/api/compras/*` são `authenticateToken` + `checkModulePermission('compras')` — **nenhum
  `requirePermission`, nenhum `ACAO_PERFIS`**. As portas de escrita novas herdam **o mesmo gate**, e
  isso está declarado em "O que esta etapa NÃO cobre" e vai para a **letra G em destaque**. Não
  invente perfil de Compras nesta etapa: decidir os perfis do módulo inteiro é etapa própria.
- **Nenhuma linha desta etapa escreve em `itens_pedido_compra.quantidade_recebida`, nem em
  `recebimentos_material_*`.** O `POST` deixa a coluna nascer **0 pelo DEFAULT** da Etapa 37 e nunca
  mais a toca; o `PUT` e o `DELETE` só a **leem**. Quem quiser mudar isso mede o efeito no acumulador
  de `darEntradaEstoque` primeiro.
- **`receiptService.js`, `routes/almoxarifado/extended.js` e `services/almoxarifado/schema.js` não são
  tocados.** Se uma task precisar deles, é achado de plano — pare e registre.
- **Almoxarifado é área física, não filial.** Saldo global por material é correto e intencional.
  `saldo` aqui é **saldo do pedido de compra**, nunca saldo por almoxarifado.
- **Testes de servidor só em `server/tests/api/*.api.test.js`** — o runner descobre **apenas** esse
  padrão. Cada arquivo tem **runner próprio** (`test()`, contador `passed`/`failed`, `process.exit`),
  harness `server/tests/helpers/testApp.js`. ⚠️ **O harness do almoxarifado libera a camada 2**
  (`fakeCheckModulePermission = () => (req,res,next) => next()`) e roda `requirePermission` **real** —
  para Compras, que **não tem** camada 3, o único gate exercitável no harness é o **401 sem usuário**
  (`setUser(null)`). Isso está dito para ninguém escrever um cenário de 403 de perfil que não existe.
- **Validação é Zod**, via `validate()` de `services/almoxarifado/validation.js` — **reusado por
  `require`, não copiado** (decisão 7 do design). Os schemas do pedido são `z.looseObject`:
  `z.object` descartaria chave não declarada e `itens` sumiria do `req.body`, exatamente o defeito que
  a Etapa 36 mediu quatro vezes.
- **Português com acento** no código, nos comentários, nas mensagens de tela e nas literais de erro;
  **sem acento no corpo do commit**.
- **O comando de teste do client leva CAMINHO, não `-t`.** `-t` é `--testNamePattern` e devolve
  `N skipped, exit 0`. Use
  `cd client && CI=true npx react-scripts test --watchAll=false src/components/compras/PedidoCompraForm.test.js`.
- **Nunca `git add -A` na raiz** — há artefatos de runtime em `server/data/` e `server/uploads/`. Na
  árvore de abertura desta etapa há também `server/data/database.sqlite.bak`, `server/nodemon.json` e
  `docs/bkp_bancoprod.md` **não versionados**: `git add` só dos caminhos que a task tocou.
- **Um commit por assunto**, em português, explicando **por quê**: qual era o bug, qual a
  consequência, o que foi decidido e o que foi descartado.
- **Nenhum commit com a suíte vermelha.** As rodadas RED existem para **ler o número**, e o commit é
  da task que leva teste + conserto juntos.
- ⚠️ **Harness de sabotagem nesta máquina — regras aprendidas por falha:**
  - **`python3` NÃO existe no Git Bash desta máquina.** É o alias da Microsoft Store, que imprime
    *"Python was not found…"* e **não executa nada** — no-op silencioso. Use **`perl -0pi -e`**
    (`/usr/bin/perl` existe) ou **`sed`**. Se for usar interpretador, `command -v` + uma execução
    trivial (`perl -e 'print 1'`) **antes** da sabotagem.
  - ⚠️ **FIM DE LINHA — a regra corrigida por medição na onda da 37, e ela inverteu a anterior.**
    Os arquivos desta base são **LF, não CRLF**. Escrever `\r\n` num *replacement* de `perl -0pi`
    **sujou 112 linhas** de um arquivo de teste (normalizadas antes do commit). Portanto:
    **`\r?\n` na REGEX de BUSCA é inofensivo e pode ficar; NUNCA insira `\r\n` nos REPLACEMENTS; e se
    um `perl -0pi` não casar, investigue a ÂNCORA, não o fim de linha.**
  - **NUNCA restaure com `git checkout -- <arquivo>`** enquanto houver conserto ainda não commitado
    nesse arquivo: as sabotagens rodam **antes** do commit da task, então o `checkout` descarta a
    sabotagem **e o conserto** juntos — e o `git diff --stat` vazio, que a regra manda exigir, passa a
    ser **erro**, não sucesso. Restaure por **perl inverso** ou por **cópia de segurança no
    scratchpad**, e confira que o `md5sum` volta ao valor **pós-conserto**, não ao de HEAD.
  - Antes de cada sabotagem: `grep -cF '<ancora>' arquivo` **tem de dar exatamente 1**. Se der 0 ou
    mais de 1, **aborte** e escolha outra âncora.
  - ⚠️ **A âncora é contada DEPOIS do conserto, não no HEAD.** Contado com `grep -cF` no HEAD de
    abertura (`13ad237`), e o que cada uma passa a valer: `routes/compras` em `server/index.js` = **0**
    hoje e **1** depois da T1; `INSERT INTO itens_pedido_compra` em `server/services/` = **0** hoje e
    **≥2** depois da T2+T4 (T2 e a importação) — na T2 a âncora é o **bloco ancorado** que a tabela da
    task dá, não o token solto; `inserirComNumeroUnico` em `server/services/compras/` = **0** hoje e
    **1** depois da T2; `já teve recebimento` = **0** hoje e **2** depois da T3 (as duas literais são
    diferentes no sufixo — ver contrato 4); `pedidos/editar/:id` em `client/src/App.js` = **0** hoje e
    **1** depois da T5.
  - `md5sum` **antes**, **depois da sabotagem** e **depois de restaurar**; `git diff --stat` tem de
    voltar com **só** os arquivos da task.
  - **Leia QUAL asserção caiu, não só o placar.** Se a asserção que guarda o achado não caiu, o
    controle **não valeu**: acrescente a sabotagem que a atinge, não troque por outra que funcione.
  - **Sabotagem que não derruba nada é um achado**, não um detalhe — e há dois motivos opostos:
    *falta asserção* (escreva o cenário) ou *o defeito virou inalcançável* (mantenha a forma segura e
    **declare** que a suíte não a protege).
- **Scratchpad com nome único por agente** (`msg-<assunto>.txt`, `bkp-<arquivo>-<task>`): o diretório
  é compartilhado, e na Etapa 25 um executor sobrescreveu a mensagem de commit do outro.

---

## ⚠️ O modo de falha desta etapa: o 201 que não gravou item nenhum

A Etapa 36 tinha o risco do **verde vazio em regra nova**; a 37, o do **contador que soma no lugar
errado**. Esta tem o mais simples e o mais caro: **a porta responde `201 ok` e o pedido está vazio.**
Cinco modos, todos medidos ou nomeados por regra da `fechar-etapa`:

1. **`POST` grava a cabeça e engole os itens.** É o defeito natural de uma rota com dois `INSERT` em
   SQLite sem transação: o primeiro passa, o segundo falha num callback que ninguém lê, e o `res.
   status(201)` já saiu. **Nenhuma asserção sobre o código de status pega isso.** Toda régua desta
   etapa lê `SELECT * FROM itens_pedido_compra WHERE pedido_id = <o id devolvido>` e **conta linhas**,
   e a sabotagem obrigatória da T2 é **remover o `INSERT` dos itens**.
2. **A extração "byte-idêntica" pode reordenar rotas sem ninguém notar.** Medido: `app.delete('/api/
   compras/:tipo/:id')` (`:20060`) **sombreia** `app.delete('/api/compras/grupos/:id')` (`:20136`), e
   apagar um grupo responde hoje `400 "Tipo inválido"`. Um copiar-colar que "organize" as rotas por
   recurso conserta esse defeito **sem querer** — e um conserto acidental numa task que promete "sem
   mudar comportamento" é exatamente a divergência que ninguém audita. A asserção `400 "Tipo
   inválido"` é a **caracterização** que detecta reordenação.
3. **`COUNT` de 0 contra 0 passa.** Se o cenário não **inserir** fornecedor e material de verdade,
   tudo é `undefined`/`0` dos dois lados e a régua passa antes e depois do conserto. Todo cenário
   insere as fixtures e **lê os ids do `INSERT`**.
4. **Régua negativa que nasce verde.** "Recusa com 400" passa se a rota recusar **tudo** (um schema
   Zod escrito errado recusa todo payload). Todo cenário negativo tem a **metade positiva no mesmo
   `test()`** — `valor_unitario: 0` → 201 ao lado de `valor_unitario: -1` → 400; o segundo pedido sem
   recebimento aceitando o `PUT` ao lado do primeiro recusando.
5. **O mock de `api` no client rejeita URL desconhecida por padrão.** As rotas novas
   (`/compras/pedidos/:id`, `/compras/materiais`) **têm de entrar no `mockImplementation`** do
   `beforeEach`, senão o cenário mede o `catch` da tela e não a tela.

### Quatro regras herdadas, e valem para TODAS as tasks

**(i) Metade positiva dentro de cada cenário negativo.** Toda recusa vem acompanhada do caso que
**tem** de passar.

**(ii) Conte as chamadas, não use `toHaveBeenCalledWith` solto.** Ele é satisfeito por 1, 2 ou 10.
Asserção de chamada é `api.post.mock.calls.filter(...)` + `toHaveLength(n)`, e o **payload** é lido de
`api.post.mock.calls[0][1]`.

**(iii) Nenhum id de fixture `1`, nem o primeiro da lista.** No servidor, ids vêm do banco em memória
— **leia do `INSERT`**, nunca escreva `1`; usuários de teste `64`/`65`/`66`, como em
`recebimentoExcedente.api.test.js`. No client, as fixtures desta etapa são fornecedor **`312`**,
material **`907`** e pedido **`418`** (não colidem com os `41`/`58`/`77`/`91`/`312`/`313`/`317` já
usados nas fixtures de recebimento — o `312` aqui é **fornecedor**, em outro arquivo de teste, e está
dito para o próximo leitor não achar que é o mesmo objeto).

**(iv) Sabotagem que derruba a suíte por `TypeError` não é controle positivo.** Se o arquivo quebra no
carregamento, **todos** os cenários caem juntos e nenhum provou nada. Prefira **alterar a literal**,
**inverter o comparador** ou **mover a chamada de lugar**.

---

## Contratos de API congelados

Front e back andam por estes. **Mensagem literal entre aspas é a que vai no código e no manual** — não
aproximar, não reescrever. **Gate de todas:** `authenticateToken` + `checkModulePermission('compras')`
— **nenhum perfil** (medido; o core não tem a camada 3).

### 1. `GET /api/compras/pedidos` — **inalterado**, é a régua da extração

| | |
|---|---|
| **Onde** | `server/index.js:20002` → `server/routes/compras.js` (T1) |
| **Query** | `?search=` (casa `p.numero` **ou** `f.razao_social`, `LIKE %…%`), `?status=` (igualdade exata) |
| **200** | array de `pedidos_compra.*` + `fornecedor_nome` (LEFT JOIN `fornecedores`), `ORDER BY p.created_at DESC` |
| **401** | sem token |
| **Congelado** | **a ordem de registro das 23 rotas.** `DELETE /api/compras/grupos/:id` continua respondendo **`400 { error: 'Tipo inválido' }`** por sombreamento do genérico — caracterização, não conserto |

### 2. `POST /api/compras/pedidos` — **rota NOVA** (RN-C02 a RN-C05, RN-C13)

| | |
|---|---|
| **Payload** | `{ fornecedor_id, data_pedido?, previsao_entrega?, status?, observacoes?, solicitacao_id?, itens: [ { material_id, quantidade, valor_unitario? } ] }` |
| **Ignorado de propósito** | `numero` (gerado pelo servidor) e `valor_total` (derivado da soma) — mandar não quebra, não decide |
| **201** | `{ id, numero, fornecedor_id, fornecedor_nome, valor_total, data_pedido, previsao_entrega, status, observacoes, itens: [...], vinculo_solicitacao? }` |
| **`numero`** | `PC-<carimbo base36 do ms><8 aleatórios>`, por `inserirComNumeroUnico(db, 'PC', fn)` — casa `/^PC-[0-9A-Z]+$/` |
| **400** (Zod) | `'Dados inválidos — fornecedor_id: fornecedor do pedido é obrigatório'` |
| | `'Dados inválidos — itens: inclua ao menos um item no pedido de compra'` |
| | `'Dados inválidos — itens.0.material_id: material do item é obrigatório'` |
| | `'Dados inválidos — itens.0.quantidade: quantidade do item do pedido deve ser um número maior que zero'` |
| | `'Dados inválidos — itens.0.valor_unitario: valor unitário do item não pode ser negativo'` |
| | `'Dados inválidos — status: status do pedido inválido (use pendente, aprovado, rejeitado, em_analise, enviado, recebido ou cancelado)'` |
| **400** (serviço) | `'Fornecedor não encontrado'` · `'Material não encontrado'` (o `material_id` que não existe) |
| **Defaults** | `status = 'pendente'`, `valor_unitario = 0`, `unidade` e `codigo`/`descricao` copiados do material, `quantidade_recebida` pelo **DEFAULT do DDL** (nunca escrita) |
| **`solicitacao_id`** | chama `purchaseService.vincularPedidoCompra` **depois** do INSERT, em `try/catch`; falha → `vinculo_solicitacao: 'falhou'` + `console.warn`, **201 mesmo assim** (decisão 10) |
| **(Fase 2) Tipos** | `fornecedor_id`, `material_id`, `quantidade` e `valor_unitario` são **`number`**, sem coerção no servidor — e por isso **o formulário coage com `Number()` antes do POST** (F2 abaixo) |
| **(Fase 2) `descricao`** | copiada de **`materiais_almoxarifado.nome`** (`NOT NULL`), com fallback para `descricao` — **não** o contrário (F9) |

> ⚠️ **(Fase 2) A literal da quantidade só sai com `error` no construtor do tipo.** Medido por sonda:
> `z.number().gt(0, MSG).safeParse('abc')` devolve **`Invalid input: expected number, received
> string`**, em inglês, e não `MSG` — a asserção do cenário (4) da T2 para `'abc'` seria
> **inexecutável como escrita**. O schema é
> `z.number({ error: QTD_ITEM_PEDIDO_INVALIDA }).gt(0, QTD_ITEM_PEDIDO_INVALIDA)` — **a mesma
> literal nos dois lugares**, uma constante só. Vale igual para `fornecedor_id`, `material_id` e
> `valor_unitario` (`.min(0, …)`).
>
> ⚠️ **(Fase 2) UM defeito por payload nos cenários negativos.** `formatZodError`
> (`validation.js:17-22`) junta as issues com **`'; '`**: um payload sem `fornecedor_id` **e** sem
> `itens` responde `'Dados inválidos — fornecedor_id: …; itens: …'`. Cada caso do cenário (4) manda
> um payload **válido em tudo menos no campo sob teste**, senão a igualdade literal não fecha.

> ⚠️ **A literal da quantidade é PRÓPRIA, e a diferença é de propósito.** O almoxarifado já tem
> `'quantidade do item deve ser um número maior que zero'` (`schemas.js:780`, `QTD_ITEM_INVALIDA`). A
> do pedido diz **`quantidade do item do pedido`** para que `grep` ache **um** dono por frase: são
> dois módulos, dois schemas, e uma frase idêntica em dois arquivos divergiria na primeira edição.

### 3. `GET /api/compras/pedidos/:id` — **rota NOVA** (RN-C06)

| | |
|---|---|
| **200** | cabeçalho + `fornecedor_nome` + `itens: [ { id, material_id, codigo, descricao, quantidade, valor_unitario, unidade, quantidade_recebida } ]`, `ORDER BY id` |
| **404** | `'Pedido de compra não encontrado'` — **a mesma literal** de `extended.js` (rota de itens da E37) e de `purchaseService:62`. Um literal só para o fato |
| **Registro** | **antes** do `DELETE /api/compras/:tipo/:id`? Não se aplica (métodos diferentes), mas fica **junto** das outras de pedido, acima do genérico, por legibilidade |

### 4. `PUT /api/compras/pedidos/:id` e `DELETE /api/compras/pedidos/:id` — **rotas NOVAS** (RN-C07, RN-C08)

| | |
|---|---|
| **PUT payload** | o mesmo do `POST`, menos `solicitacao_id`; `numero` **não muda** (não é editável) |
| **PUT 200** | o pedido relido, com os itens **substituídos** (DELETE + INSERT das linhas) |
| **PUT 400** | `'Pedido de compra <numero> já teve recebimento — não pode mais ser editado'` — quando **algum** item tem `COALESCE(quantidade_recebida,0) > 0` |
| **(Fase 2) PUT 400, 2ª perna** | **a MESMA literal** quando existe `recebimentos_material_almoxarifado WHERE pedido_compra_id = ?` — o `PUT` tem as **duas** pernas do `DELETE`, pelo motivo de F1 abaixo. "Já teve recebimento" inclui o recebimento **criado e não processado** |
| **PUT 404** | `'Pedido de compra não encontrado'` |
| **DELETE 200** | `{ message: 'Pedido de compra excluído com sucesso' }`, **com os itens apagados** |
| **DELETE 409** | `'Pedido de compra <numero> já teve recebimento — não pode ser excluído'` — quando algum item tem `quantidade_recebida > 0` **OU** existe `recebimentos_material_almoxarifado WHERE pedido_compra_id = ?` (a segunda perna cobre o recebimento criado e **não processado**, RN-23 da E37) |
| **DELETE 404** | `'Pedido de compra não encontrado'` |
| ⚠️ **Ordem** | as duas entram **ANTES** de `app.delete('/api/compras/:tipo/:id')` no arquivo. `/api/compras/pedidos/7` tem dois segmentos e o genérico o casa — registrado depois, o 409 **nunca é alcançado** |
| ⚠️ **(Fase 2) Guarda de tabela ausente** | `excluirPedido` consulta `recebimentos_material_almoxarifado`, que é do **almoxarifado**: antes da consulta, o mesmo `SELECT name FROM sqlite_master …` que `listarPedidosCompraAux` faz (`receiptService.js:1475`). Sem ele, um banco sem o módulo devolve **500 em todo DELETE de pedido** |
| ⚠️ **(Fase 2) FK está ON em produção** | `sqliteConcurrency.js:50` roda `PRAGMA foreign_keys = ON` na conexão real; o harness roda com **0** (`planoInspecao.api.test.js:233` **assere** isso). `itens_pedido_compra` tem `FOREIGN KEY (pedido_id)` (`schema.js:1319`) — então em produção o genérico **não** deixa itens órfãos: ele **falha** com `FOREIGN KEY constraint failed` → 500 `'Erro ao excluir item'`. `excluirPedido` apaga os filhos **primeiro** por causa disso, e não só por higiene. O cenário (7) da T3 mede o comportamento **do harness**; está declarado |

### 5. `POST /api/compras/pedidos/importar` — **rota NOVA** (RN-C10, RN-C11)

| | |
|---|---|
| **Payload** | `{ linhas: [ {...} ] }` **ou** `{ rows: [...] }` — o precedente medido (`index.js:20447`), com cabeçalho de planilha em qualquer grafia via `extrairDoRow` |
| **Colunas lidas** | agrupador: `pedido`/`numero`/`oc`/`ordem`; fornecedor: `fornecedor_id` **ou** `cnpj`/`fornecedor`; `codigo`/`código`/`cod`/`sku`; `quantidade`/`qtd`/`qtde`; `valor_unitario`/`preco`/`preço`/`valor`; `previsao`/`previsao_entrega`/`entrega` |
| **201** | `{ pedidos: [ { id, numero, itens } ], itens: N, ignorados: [ { linha, motivo } ] }` |
| **Motivos** (literais) | `'material não encontrado pelo código <cod>'` · `'quantidade inválida'` · `'fornecedor não encontrado'` · `'linha sem código de material'` |
| **400** | `'Envie "linhas" ou "rows" com array de objetos (qualquer formato de planilha)'` — **copiada verbatim do precedente**, `index.js:20451` |
| **Idempotência** | **não há** (decisão 8): `numero` é gerado, o agrupador é da planilha. Reimportar cria pedidos novos; a resposta lista o que criou |

### 6. `GET /api/compras/materiais` — **rota NOVA** (RN-C09)

| | |
|---|---|
| **Query** | `?search=` (casa `codigo` **ou** `descricao`/`nome`, `LIKE %…%`), `LIMIT 50` |
| **200** | `[ { id, codigo, descricao, unidade } ]` — **somente leitura**, `ativo = 1`. **(Fase 2)** `descricao` = `COALESCE(nome, descricao)`: em `materiais_almoxarifado` quem é `NOT NULL` é **`nome`** (`schema.js:298-299`), e o resto do módulo lê `m.nome as material_nome` (`receiptService.js:100`). Selecionar `descricao` crua devolveria opções em branco |
| **Por que existe** | `app.use('/api/almoxarifado', auth, checkModulePermission('almoxarifado'))` (`routes/almoxarifado.js:282-285`) barra o comprador **antes** de `GET /almoxarifado/materiais`. Sem esta porta o formulário de pedido não escolhe material |

### 7. Literais de tela (client, T5 e T6) — **verbatim**

| Onde | Literal |
|---|---|
| título do formulário (novo) | `Novo pedido de compra` |
| título do formulário (edição) | `Editar pedido de compra` |
| submit sem item | `Inclua ao menos um item no pedido de compra` (cópia da literal do servidor, para a tela não inventar uma segunda) |
| total calculado | `Total: R$ 100,00` (formato `Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`, o mesmo de `Compras.js:82-87`) |
| tabela de itens vazia | `Nenhum item adicionado` |
| botão da Reposição (T6) | `Gerar pedido` |
| aviso do número | `O número do pedido é gerado pelo sistema.` |
| **(Fase 2)** erro da lixeira em `Compras.js` | a literal **do servidor**: `error.response?.data?.error \|\| 'Erro ao excluir item'` — ver F4 |
| **(Fase 2)** aviso de preço no formulário | `Sem preço o custo médio do material não é alimentado no recebimento.` — ver F5 |

---

## Estrutura de arquivos

| Arquivo | Responsabilidade | Task |
|---|---|---|
| `server/routes/compras.js` **(criar)** | as **23** rotas contíguas de `index.js:19974-20471` + os **5** helpers de planilha, **verbatim e na mesma ordem**; `module.exports = (app, db, authenticateToken, checkModulePermission, uploads) => {…}` | 1 |
| `server/index.js` **(modificar)** | apagar o bloco `19974-20471` e chamar o registrador **no lugar exato onde ele estava** | 1 |
| `server/tests/helpers/testApp.js` **(modificar)** | montar `require('../../routes/compras')(app, db, fakeAuth, fakeCheckModulePermission, uploadsStub)` ao lado dos dois registradores de `:100-101` | 1 |
| `server/services/compras/pedidoCompraService.js` **(criar)** | `criarPedido`, `obterPedido`, `atualizarPedido`, `excluirPedido`, `importarPedidos` — **a rota não faz SQL** | 2, 3, 4 |
| `server/services/compras/schemas.js` **(criar)** | `PedidoCompraCreateSchema`, `PedidoCompraItemSchema`, `STATUS_PEDIDO_COMPRA` (os 7), as literais | 2 |
| `server/services/almoxarifado/numeroDoc.js` **(modificar — comentário)** | corrigir `:47-58` **dizendo** que "hoje isso é INALCANÇÁVEL" era verdade **até a Etapa 38** (regra 5 do CLAUDE.md) | 2 |
| `server/tests/api/comprasPedidosRotas.api.test.js` **(criar)** | **RN-C01** — a extração, a ordem, os gates | 1 |
| `server/tests/api/comprasPedidoCriar.api.test.js` **(criar)** | **RN-C02 a RN-C05**, **RN-C13** (o vínculo) | 2, 6 |
| `server/tests/api/comprasPedidoEditarExcluir.api.test.js` **(criar)** | **RN-C06, RN-C07, RN-C08** | 3 |
| `server/tests/api/comprasPedidoImportar.api.test.js` **(criar)** | **RN-C09, RN-C10, RN-C11** | 4 |
| `client/src/components/compras/PedidoCompraForm.js` **(criar)** | formulário novo/edição, itens com busca de material, total calculado | 5 |
| `client/src/components/compras/PedidoCompraForm.test.js` **(criar)** | **RN-C12** | 5 |
| `client/src/App.js` **(modificar)** | `pedidos/novo` e `pedidos/editar/:id` — **(Fase 2)** declaradas **junto** das outras rotas de `/compras`; a posição em relação ao `path="*"` de `:333` **não** importa (F3) | 5 |
| `client/src/components/Compras.js` **(modificar — Fase 2)** | `handleDelete` (`:110-120`) passa a mostrar a literal do servidor: hoje o `catch` troca o **409 da RN-C08** por `'Erro ao excluir item'` e o usuário não fica sabendo por que não pôde apagar | 5 |
| `client/src/components/almoxarifado/ReposicaoAlmoxarifado.js` **(modificar)** | botão `Gerar pedido` na aba "Solicitações" | 6 |
| `client/src/components/almoxarifado/ReposicaoAlmoxarifado.test.js` **(modificar)** | cenário do botão | 6 |
| `server/tests/api/comprasPedidoIntegracao.api.test.js` **(criar)** | **RN-C14** — o roteiro inteiro **pela ROTA** e **pelo SERVIÇO** | 7 |
| `specs/modulo-almoxarifado/22-integracoes/README.md`, `specs/modulo-compras/README.md` **(criar)**, `specs/modulo-almoxarifado/README.md`, `docs/almoxarifado-guia-etapas-e-testes.md`, `docs/almoxarifado-novidades-por-etapa.md`, `docs/almoxarifado-manual-do-sistema.md`, este plano **(modificar)** | fechamento, e as **três** correções de doc que a medição achou | 8 |

**Não são tocados, e isso é contrato:** `server/services/almoxarifado/receiptService.js`,
`server/routes/almoxarifado/extended.js`, `server/services/almoxarifado/schema.js`,
`client/src/components/almoxarifado/RecebimentosAlmoxarifado.js`.

---

## Sort topológico

Critério da Fase 3 da skill: **motor, migration, `ACAO_PERFIS` ou regra compartilhada = tronco**;
**tela contra contrato congelado = galho**.

| Task | Tipo | Depende de | Por quê |
|---|---|---|---|
| 1 — extrair `/api/compras/*` e montar no harness | **tronco** | — | **é o pré-requisito escondido da etapa inteira**: hoje zero testes batem em `/api/compras/*` e o harness não monta Compras. Sem ela, nenhuma task tem régua. E mexe no **harness**, que todo arquivo de teste carrega |
| 2 — Zod + serviço + `POST` | **tronco** | 1 | cria o serviço que as tasks 3, 4 e 6 chamam, e congela as literais que a T5 cita. Regra compartilhada |
| 3 — `GET /:id`, `PUT`, `DELETE` | **tronco** | 2 | a régua que **lê as tabelas da Etapa 37** e a ordem de registro antes do genérico — é o ponto mais sensível desta etapa, porque um erro aqui apaga dado de recebimento |
| 4 — busca de material + importação por planilha | galho **A** | 2 | só **consome** o serviço da T2; toca o mesmo arquivo (`routes/compras.js`, `pedidoCompraService.js`) → mesma árvore, sequencial |
| 5 — formulário + rotas no `App.js` | galho **B** | 3, 4 | tela contra contrato congelado. Depende da T4 pela **busca de material** (sem ela o formulário não escolhe material) e da T3 pelo modo edição |
| 6 — "Gerar pedido" na Reposição | galho **C** | 2, 5 | consome o `solicitacao_id` do `POST` (T2) e a rota do formulário (T5). Toca um arquivo do **almoxarifado** que nenhuma outra task desta etapa toca |
| 7 — integração que cruza galhos | sequencial | 2, 3, 4, 5, 6 | o roteiro inteiro pela **rota** e pelo **serviço**, mais os cinco comandos da suíte |
| 8 — fechamento | sequencial | 7 | specs, mapa, guia, manual, novidades, este plano |

### Divergência declarada da skill: os galhos vão SEQUENCIAIS, não em worktrees

A `desenvolver-etapa-almoxarifado` manda rodar galhos paralelos em worktrees isoladas. **Medido e
confirmado desde a Etapa 34:** `node_modules/`, `client/node_modules/` **e `server/node_modules/`**
estão no `.gitignore`, então uma worktree nova **não tem `react-scripts` nem `supertest`** e não roda
nem a suíte de client nem a de API. Isolar exigiria um `npm install` por worktree.

Somando a isso: **os galhos A e B tocam a mesma árvore dos troncos** (o A mexe em `routes/compras.js`
e em `pedidoCompraService.js`, os dois nascidos nos troncos), e o único galho com arquivo próprio é o
**C**, que depende do B. **Decisão: tudo sequencial, um executor por task**, na ordem literal
**1 → 2 → 3 → 4 → 5 → 6 → 7 → 8**. A coluna "Depende de" descreve **acoplamento**, não permissão para
antecipar.

---

### Task 1: extrair `/api/compras/*` e montar o registrador no harness **(tronco)**

**Files:**
- Create: `server/routes/compras.js`
- Modify: `server/index.js` (apagar `19974-20471`, chamar o registrador no mesmo ponto)
- Modify: `server/tests/helpers/testApp.js`
- Create: `server/tests/api/comprasPedidosRotas.api.test.js`

**Interfaces:**
```js
// server/routes/compras.js
module.exports = (app, db, authenticateToken, checkModulePermission, uploads) => { … }
// uploads = { uploadGrupoCompras, uploadFornecedor }  ← DI, decisão 2 do design
```

**O que move, medido rota a rota (23), e nesta ORDEM:** `GET fornecedores` (`:19976`),
`GET pedidos` (`:20002`), `GET cotacoes` (`:20031`), **`DELETE :tipo/:id` (`:20060`)**,
`GET grupos` (`:20098`), `GET grupos/:id`, `POST grupos`, `PUT grupos/:id`, `DELETE grupos/:id`,
`POST grupos/:id/foto`, `POST grupos/:id/foto-base64`, `GET grupos/:grupoId/fornecedores`,
`POST fornecedores`, `PUT fornecedores/:id`, `POST fornecedores/:id/foto`,
`POST fornecedores/:id/foto-base64`, `GET fornecedores/:fornecedorId/itens`,
`POST fornecedores/:fornecedorId/itens`, `PUT fornecedores/:fornecedorId/itens/:id`,
`DELETE fornecedores/:fornecedorId/itens/:id`, `POST fornecedores/:fornecedorId/planilha`,
`GET fornecedores/:fornecedorId/planilha`, `POST fornecedores/:fornecedorId/itens/importar`
(`:20447`) — **mais** os 5 helpers (`normalizarCampo :20399`, `parsePrecoBackend :20403`,
`extrairDoRow :20410`, `extrairPrecoDoRow :20417`, `extrairDescricaoDoRow :20435`), que têm **zero**
chamadores fora do bloco (medido, um a um).

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| reordenar as rotas "por recurso" | `DELETE /api/compras/:tipo/:id` **sombreia** `DELETE /api/compras/grupos/:id` (medição 2), e um conserto acidental numa task que promete "sem mudar comportamento" é divergência que ninguém audita | cenário (4) — o `400 "Tipo inválido"` viraria 200/404 |
| mover as 3 rotas `/api/compras/solicitacoes-compra` (`:18465`, `:18500`, `:18525`) | decisão 1: vivem 1.500 linhas acima, cercadas de rotas de outros módulos, e operam `solicitacoes_compra` (core, **≠** `solicitacoes_compra_almoxarifado`) | nada cai — está **proibido por escrito**, e declarado em "NÃO cobre" |
| mover as instâncias de multer (`index.js:807`, `:826`) | fecham sobre `uploadsGruposComprasDir`/`uploadsFornecedoresDir`, variáveis de módulo do `index.js` — mover mudaria **onde o arquivo é gravado** | nada cai na suíte (as duas rotas de foto não têm teste — **declarado**), e é exatamente por isso que a instrução é escrita |
| aproveitar para "consertar" o `if (!campo) return 400` na mão | esta task é **só mover**. Zod entra na T2, e só no pedido | o `git diff` da T1 deixa de ser movimentação pura |
| "limpar" os 51 `ALTER TABLE` de `index.js` | nota explícita da Etapa 37 (letra G): é core, fora de escopo | — |

- [ ] **Step 1: escrever o teste e ver os quatro cenários vermelhos** (leia **qual** asserção cai)

`server/tests/api/comprasPedidosRotas.api.test.js` — cabeçalho com o achado medido (zero testes batem
em `/api/compras/*`; o harness monta dois registradores e nenhum é Compras), e nesta task **só** os
cenários da extração:

```
(1) GET /api/compras/pedidos responde 200 e traz o pedido inserido
    INSERT em fornecedores (razao_social 'Fornecedor Teste 38') -> fornecedorId do INSERT
    INSERT em pedidos_compra (numero 'PC-FIXTURE-38', fornecedor_id, status 'aprovado')
    GET -> 200, body.length === 1, body[0].numero === 'PC-FIXTURE-38',
           body[0].fornecedor_nome === 'Fornecedor Teste 38'   <- prova o LEFT JOIN
(2) os filtros continuam filtrando
    ?search=FIXTURE -> 1 linha;  ?search=naoexiste -> 0
    ?status=aprovado -> 1 linha;  ?status=pendente -> 0
(3) o gate continua: setUser(null) -> 401 em GET /api/compras/pedidos
    metade positiva: com usuario -> 200  (senao "401 sempre" passaria)
(4) CARACTERIZACAO da ordem de registro (medicao 2):
    DELETE /api/compras/grupos/<id> -> 400 { error: 'Tipo invalido' }   <- com acento no codigo
    metade positiva: DELETE /api/compras/pedidos/<id> -> 200 e a linha some
    (Fase 2) NAO afirme a mensagem 'Item excluido com sucesso' aqui: a T3 registra o
    DELETE especifico ANTES do generico e a mesma chamada passa a responder
    'Pedido de compra excluido com sucesso'. Afirme o STATUS e a linha sumida.
```

> O cenário (4) **congela um defeito**, e isso está dito no cabeçalho do arquivo em duas linhas: o
> genérico `:tipo/:id` foi registrado antes do específico de grupos, `tables['grupos']` não existe, e
> apagar um grupo responde 400. **Não é o que queremos; é o que existe.** Consertar é etapa própria
> (é comportamento de outra aba); o cenário existe para detectar **reordenação** na extração.

- [ ] **Step 2: rodar e LER os números**

```
cd server && node tests/api/comprasPedidosRotas.api.test.js
```

Previsão: **os quatro vermelhos**, todos com **404** (`Cannot GET /api/compras/pedidos`) — o harness
não monta Compras. Se algum vier verde, **pare**: alguém já montou o registrador e o cenário mede
outra coisa. Cole aqui as linhas reais do `✗`.

- [ ] **Step 3: implementar** — criar `server/routes/compras.js` com o cabeçalho explicando **por
      quê** (a régua não existia; o harness não montava; a ordem é contrato), mover o bloco
      **verbatim**, trocar em `index.js` o bloco pela chamada do registrador **no mesmo ponto**, e
      acrescentar a linha no `testApp.js` ao lado de `:100-101` com o stub de upload
      (`multer({ dest: path.join(dataDir, 'uploads', 'compras') })`). **(Fase 2)** `testApp.js`
      **não requer `multer` hoje** (os requires estão em `:6-12`) — acrescente o `require('multer')`
      junto, senão o harness inteiro quebra no carregamento e **todos** os arquivos de teste caem.

- [ ] **Step 4: provar que a movimentação foi movimentação**

```
cd server && node tests/api/comprasPedidosRotas.api.test.js
cd server && node -e "require('./routes/compras')" && echo "carrega"
git diff --stat server/index.js      # so REMOCAO no bloco 19974-20471 + 1 linha de chamada
grep -c "'/api/compras" server/index.js        # 26 -> 3   (so as de solicitacoes-compra)
grep -c "'/api/compras" server/routes/compras.js   # 23
```

> **O `grep -c` é a régua do que moveu, e ele tem um modo de falha conhecido nesta base**
> (`grep -c` combinado com `wc -l` já produziu teste vazio três vezes): os dois números têm de **somar
> 26**, e os **3** que ficam têm de ser **nominalmente** os de `solicitacoes-compra` — confira com
> `grep -n "'/api/compras" server/index.js`, lendo os três, não só contando.

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | mover `app.delete('/api/compras/:tipo/:id'` para **depois** do bloco de grupos | `app.delete('/api/compras/:tipo/:id'` em `routes/compras.js` | o **400 `'Tipo inválido'`** do cenário (4): vira **200** (o específico de grupos passa a vencer). É a prova de que a ordem está sob régua |
| 2 | remover a linha do registrador no `testApp.js` | `require('../../routes/compras')` | **os quatro cenários**, com 404. Prova que a montagem no harness é o que torna a suíte possível — e é o achado que a task inteira existe para pagar |
| 3 | trocar o `LEFT JOIN fornecedores` por `JOIN` na `GET /api/compras/pedidos` | `LEFT JOIN fornecedores f ON p.fornecedor_id = f.id` | **nada cai** se o cenário (1) tiver fornecedor — **e esse é o achado**: acrescente ao (1) um segundo pedido com `fornecedor_id` de fornecedor **inexistente** e afirme que ele **continua aparecendo** com `fornecedor_nome: null`. Só então a sabotagem derruba. (O stub do harness não tem FK — Etapa 37, decisão 8 — então a linha órfã é inserível) |

- [ ] **Step 6: commit** — `git add` só dos quatro caminhos. Mensagem: qual era o furo (as rotas de
      Compras não tinham onde ser testadas: o harness monta dois registradores e nenhum é Compras, e
      zero testes batiam em `/api/compras/*`), o que foi decidido (extrair as 23 contíguas + os 5
      helpers, multer por DI, ordem preservada) e o descartado (mover as 3 de `solicitacoes-compra`;
      mover as instâncias de multer; consertar o sombreamento do `DELETE` de grupo).

---

### Task 2: Zod, o serviço e o `POST` que cria o pedido com itens **(tronco)**

**Files:**
- Create: `server/services/compras/schemas.js`
- Create: `server/services/compras/pedidoCompraService.js`
- Modify: `server/routes/compras.js` (a rota nova, **antes** do `DELETE` genérico)
- Modify: `server/services/almoxarifado/numeroDoc.js` (**só o comentário** — **(Fase 2)** o bloco é
  **`:44-52`**, não `:47-58`; a frase "hoje isso e INALCANCAVEL" está na **linha 47**. E ele cita
  `pedidos_compra.numero` em **`server/index.js:19159`**, que está **errado**: o `CREATE TABLE` é
  `server/index.js:19230`. Corrija as **duas** coisas na mesma passada — regra 5 do CLAUDE.md)
- Create: `server/tests/api/comprasPedidoCriar.api.test.js`

**Interfaces:**
```js
// services/compras/schemas.js
const STATUS_PEDIDO_COMPRA = ['pendente','aprovado','rejeitado','em_analise','enviado','recebido','cancelado'];
const PedidoCompraItemSchema = z.looseObject({ material_id: …, quantidade: …, valor_unitario: … });
const PedidoCompraCreateSchema = z.looseObject({ fornecedor_id: …, status: …, itens: z.array(...).min(1, …) });

// services/compras/pedidoCompraService.js
async function criarPedido(db, dados, user)  // -> { id, numero, …, itens: [...], vinculo_solicitacao? }
```

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| `z.object` no lugar de `z.looseObject` | `validate()` substitui `req.body` por `parsed.data` e `z.object` **descarta chave não declarada** — `itens` sumiria e todo POST válido viraria 400. Quarta encarnação do defeito nesta base (`reserva_id`, `lote_id`, `series`, `nota_fiscal`) | cenário (1), com 400 em payload válido |
| escrever `quantidade_recebida` no `INSERT` dos itens | decisão 5 da Etapa 37: a coluna só se move na entrada física, dentro do claim de `darEntradaEstoque` | cenário (2), que afirma `=== 0` **vindo do DEFAULT** |
| aceitar `numero` do payload | decisão 5 do design: sem campo de número não há escolha de gente a reescrever, e é isso que satisfaz o aviso da Etapa 31 | cenário (3) |
| aceitar `valor_total` do payload | RN-C04: a lista de Compras mostra esse número em destaque e ele deixaria de bater com os itens | cenário (5) |
| aceitar `status` fora do enum | RN-C05 protege a decisão 4 da Etapa 37: `PARCIAL`/`RECEBIDO` são a derivação do almoxarifado e não podem virar valor gravado no core | cenário (6) |
| deixar o `vincularPedidoCompra` derrubar o `POST` | decisão 10 — ⚠️ **(Fase 2) o motivo escrito lá está errado, e o efeito real é o oposto**: `requirePermission('gerenciar_reposicao')` e o módulo `almoxarifado` vivem na **rota** (`extended.js:1743`), não no serviço. Chamando `purchaseService.vincularPedidoCompra(db, …)` (`purchaseService.js:52`) direto, **não há gate nenhum** — o `POST` do Compras escreve em `solicitacoes_compra_almoxarifado` para qualquer usuário do módulo `compras`, inclusive o `PRODUCAO` do fallback. O `try/catch` continua (o serviço lança 404/400 por solicitação inexistente ou terminal), mas **a justificativa muda** e a decisão 10 tem de ser reescrita com o descartado (aplicar `requirePermission` no core = inventar a camada 3 que o módulo não tem). **Letra G, em destaque** | cenário (9) — e um cenário novo: usuário **sem perfil** cria o pedido e a solicitação **fica `VINCULADO`** (é o fato, declarado) |
| **(Fase 2)** deixar o preço nascer 0 em silêncio | `valor_unitario = 0` na linha do pedido desfaz a **U1 da Etapa 37**: `criarRecebimento` herda o preço da linha quando o payload omite (`receiptService.js:398-412`) e `custo_unitario` só viaja quando `> 0` (`:1176`) — com preço 0 o `custo_medio` do material **deixa de ser alimentado** e o rateio da Etapa 8c distribui R$ 0,00. A decisão (preço opcional) **fica**; o que muda é que a tela **avisa** (contrato 7) e a letra **G** registra | nada cai — é fragilidade **declarada**, como a sabotagem 6 |
| apagar em silêncio o comentário de `numeroDoc.js` | regra 5 do CLAUDE.md: a frase "hoje isso é INALCANÇÁVEL" era **verdadeira** e deixa de ser. Apagar faz o próximo confiar de novo | nada cai — está **exigido por escrito**, e a T8 confere |

- [ ] **Step 1: escrever o teste e ver os cenários vermelhos** (leia **qual** asserção cai)

`server/tests/api/comprasPedidoCriar.api.test.js` — fixtures: `fornecedores` e
`materiais_almoxarifado` inseridos no `beforeEach`, **ids lidos do `INSERT`**; usuários `64` (ADMIN),
`65` (ALMOXARIFE), `66` (COMPRAS).

```
(1) POST com fornecedor + DOIS itens -> 201
    body.id, body.numero casa /^PC-[0-9A-Z]+$/
    E O QUE MEDE O DANO:
      SELECT * FROM itens_pedido_compra WHERE pedido_id = body.id  ->  LENGTH === 2
      linha[0].material_id === materialIdA, linha[0].quantidade === 2, linha[0].valor_unitario === 50
      linha[0].codigo === o codigo do material   (copiado, nao inventado)
(2) quantidade_recebida NASCE 0 pelo DEFAULT
    linhas.every(l => l.quantidade_recebida === 0)     <- === 0, nao != null:
    e o que faz `quantidade - COALESCE(quantidade_recebida,0)` nao virar NaN no primeiro pedido
(3) o numero e do SERVIDOR
    POST com { numero: 'EU-ESCOLHI' } -> 201 e body.numero !== 'EU-ESCOLHI', casa /^PC-/
    metade positiva: dois POST seguidos -> dois numeros DIFERENTES
(4) validacao (cada um 400 + COUNT(pedidos_compra) INALTERADO, lido antes e depois):
    sem fornecedor_id / itens ausente / itens: [] / item sem material_id /
    quantidade 0 / quantidade -3 / quantidade 'abc' / valor_unitario -1
    -> as literais exatas do contrato 2
    (Fase 2) UM defeito por payload — `formatZodError` junta as issues com '; '
    (Fase 2) quantidade '4' (STRING) -> 400 tambem, com a MESMA literal.
       E a razao de existir: e o que o <input type="number"> manda se a T5 nao coagir.
       O cenario (c) da T5 afirma `typeof payload.itens[0].quantidade === 'number'`.
    METADE POSITIVA NO MESMO test(): valor_unitario 0 -> 201  (preco opcional e decisao)
(5) valor_total e DERIVADO
    itens 2x50 e 3x10, payload com valor_total: 999 -> SELECT valor_total -> 130
(6) status
    'PARCIAL' -> 400 com a literal do enum;  ausente -> 201 com status === 'pendente'
    metade positiva: os SETE valores do enum -> 201 (laco)
(7) fornecedor inexistente -> 400 'Fornecedor não encontrado', COUNT inalterado
    material inexistente   -> 400 'Material não encontrado',   COUNT inalterado
(8) 401 sem usuario (setUser(null)); metade positiva: com usuario -> 201
(9) solicitacao_id (RN-C13):
    INSERT em solicitacoes_compra_almoxarifado (status PENDENTE) -> id do INSERT
    POST com solicitacao_id -> 201
    SELECT status, pedido_compra_id FROM solicitacoes_compra_almoxarifado WHERE id = ?
      -> 'VINCULADO' e pedido_compra_id === body.id
    E a metade nao-fatal: solicitacao_id de solicitacao INEXISTENTE -> 201 mesmo assim,
      body.vinculo_solicitacao === 'falhou', e COUNT(pedidos_compra) SUBIU
```

> O cenário (9) é o que dá o **primeiro consumidor** a `vincularPedidoCompra` desde a Etapa 14 — e a
> segunda metade dele é a decisão 10 sob régua: sem ela, "não-fatal" seria só uma frase no design.

- [ ] **Step 2: rodar e LER os números**

```
cd server && node tests/api/comprasPedidoCriar.api.test.js
```

Previsão: **todos vermelhos com 404** (`Cannot POST /api/compras/pedidos`). Cole as linhas reais do
`✗`. Se **algum** cenário vier verde, pare: 404 não satisfaz nenhuma asserção deste arquivo, então
verde aqui significa que o cenário não afirma nada.

- [ ] **Step 3: implementar** — `schemas.js` (com o comentário explicando `looseObject` e a literal
      própria da quantidade), `pedidoCompraService.criarPedido` (fornecedor → materiais → `numero` por
      `inserirComNumeroUnico(db, 'PC', …)` → `INSERT` cabeçalho → `INSERT` dos itens → `UPDATE
      valor_total` → vínculo em `try/catch` → reler e devolver), a rota **antes** do `DELETE`
      genérico, e **o comentário de `numeroDoc.js` corrigido dizendo que a afirmação era verdadeira
      até esta etapa**.

- [ ] **Step 4: rodar de novo, e rodar quem toca as mesmas tabelas**

```
cd server && node tests/api/comprasPedidoCriar.api.test.js
cd server && node tests/api/comprasPedidosRotas.api.test.js
cd server && node tests/api/numeroDocumento.api.test.js       # o helper ganhou um quinto chamador
cd server && node tests/api/pedidoSaldoRecebido.api.test.js   # E37: a coluna que nao pode ser escrita
cd server && npm run test:validation
```

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | **apagar o laço de `INSERT` dos itens** (o serviço grava só a cabeça) | o bloco `for (const item of itensResolvidos)` em `pedidoCompraService.js` | `linhas.length === 2` do cenário (1). **É a sabotagem que a base exige** (o CLAUDE.md nomeia o "201 ok" que engole os itens); se ela não derrubar nada, a régua desta etapa inteira é vazia |
| 2 | trocar `z.looseObject(` por `z.object(` no `PedidoCompraCreateSchema` | `const PedidoCompraCreateSchema = z.looseObject({` | o **201** do cenário (1) vira 400 `itens: inclua ao menos um item…` — a quinta encarnação do defeito, agora sob régua |
| 3 | usar o `numero` do payload quando ele vier | `inserirComNumeroUnico(db, 'PC'` | o `body.numero !== 'EU-ESCOLHI'` do cenário (3) |
| 4 | gravar `valor_total` do payload | `SET valor_total = ?` (o UPDATE derivado) | o `=== 130` do cenário (5) |
| 5 | tirar o `try/catch` do vínculo | `vinculo_solicitacao` | a **segunda metade** do (9): o 201 do vínculo falho vira 400/500 |
| 6 | escrever `quantidade_recebida: 0` explicitamente no `INSERT` | o bloco do `INSERT INTO itens_pedido_compra` | **nada cai** — **e esse é o achado**: o valor é o mesmo. Registre como fragilidade (letra G): a suíte **não** distingue "não escreve" de "escreve 0", e a proteção real é a proibição escrita aqui e na T8. **Mantenha o INSERT sem a coluna** |

- [ ] **Step 6: commit** — `git add` só dos cinco caminhos. Mensagem: qual era o furo (o módulo core
      Compras não conseguia criar um pedido, e por isso a Etapa 37 inteira era inalcançável), o que
      foi decidido (Zod reusando `validate()`, serviço separado da rota, `numero` gerado, `valor_total`
      derivado, enum de 7 status, vínculo não-fatal) e o descartado (`numero` digitado + 409;
      `valor_total` do payload; enum de 6; duplicar `validation.js`).

---

### Task 3: `GET /:id`, `PUT` e `DELETE` — a régua que pergunta ao recebimento **(tronco)**

**Files:**
- Modify: `server/services/compras/pedidoCompraService.js` (`obterPedido`, `atualizarPedido`, `excluirPedido`)
- Modify: `server/routes/compras.js` (as três rotas, **antes** do `DELETE` genérico)
- Create: `server/tests/api/comprasPedidoEditarExcluir.api.test.js`

**Restrições medidas, cada uma com o que cai se violada:**

| Não faça | Por quê | Cai em |
|---|---|---|
| registrar `DELETE /api/compras/pedidos/:id` **depois** do genérico | `/api/compras/pedidos/7` tem dois segmentos e o genérico o casa — o 409 **nunca é alcançado** (medição 2) | cenário (5), com 200 no lugar de 409 |
| deixar o `PUT` reinserir itens com recebimento lançado | reinserir **apaga a `quantidade_recebida`** acumulada pela Etapa 37 — perda de dado de estoque, irreversível sem SQL | cenário (3), que afirma o **valor no banco depois do 400** |
| **(Fase 2)** dar ao `PUT` só a PRIMEIRA perna | ⚠️ **é o achado mais caro desta revisão.** O `PUT` **apaga e reinsere** as linhas, e os ids novos **não são os antigos**. Um recebimento **criado e não processado** já guarda `pedido_item_id` (`schema.js:1306`, INTEGER **sem FK** de propósito) com `quantidade_recebida` ainda **0** — passa pela primeira perna. Ao processar, o acumulador da 37 é `UPDATE itens_pedido_compra … WHERE id = ?` (`receiptService.js:1261-1268`): **0 linhas alteradas não é erro**, o `catch` não dispara e **não sai nem `warn`**. O material entra no estoque e o pedido fica `ABERTO` com o saldo **cheio, para sempre**. O `PUT` tem as **duas** pernas do `DELETE` | cenário (4b) |
| medir só `quantidade_recebida > 0` no `DELETE` | RN-23 da E37: o saldo só se move na entrada física; um recebimento **criado e não processado** tem `quantidade_recebida = 0` e apagar o pedido debaixo dele deixa o documento apontando para o vazio | cenário (6) |
| apagar o pedido sem apagar os itens | é o defeito de hoje (R3 da Fase 0), e a partir da 38 há itens de verdade para ficar órfãos | cenário (7) |
| inventar uma segunda literal de "não existe" | já há uma: `'Pedido de compra não encontrado'`, em `extended.js` (E37) e `purchaseService:62` | cenário (2) |

- [ ] **Step 1: escrever o teste e ver os cenários vermelhos**

```
(1) GET /api/compras/pedidos/:id -> 200 com itens
    body.itens.length === 2, body.fornecedor_nome preenchido,
    body.itens[0].quantidade_recebida === 0
(2) GET de id inexistente -> 404 'Pedido de compra não encontrado'
    (mesma literal para PUT e DELETE de id inexistente — tres asseroes, um literal)
(3) PUT enquanto nada foi recebido -> 200
    muda quantidade de 10 para 12 -> SELECT quantidade -> 12
    E a substituicao de itens: mandar UM item onde havia DOIS -> COUNT === 1
(4) PUT depois de recebimento PROCESSADO -> 400
    UPDATE itens_pedido_compra SET quantidade_recebida = 6 WHERE id = <linha>
    PUT com quantidade 99 -> 400 'Pedido de compra <numero> já teve recebimento — não pode mais ser editado'
    E O QUE MEDE O DANO: SELECT quantidade -> continua 12 (nao 99)
      e SELECT quantidade_recebida -> continua 6
    METADE POSITIVA no mesmo test(): um SEGUNDO pedido, sem recebimento, aceita o mesmo PUT -> 200
(4b) (Fase 2) PUT com recebimento CRIADO E NAO PROCESSADO -> 400, a MESMA literal
    INSERT em recebimentos_material_almoxarifado (pedido_compra_id = <pedido>)
      + INSERT em recebimentos_material_itens_almoxarifado com pedido_item_id = <linha>
      e quantidade_recebida da LINHA DO PEDIDO ainda 0  <- passa pela 1a perna
    PUT -> 400   E O QUE MEDE O DANO:
      SELECT id FROM itens_pedido_compra WHERE pedido_id = ?  -> os MESMOS ids de antes
      (se o PUT tivesse passado, os ids seriam novos e o pedido_item_id do recebimento
       apontaria para linha inexistente — o UPDATE do acumulador da 37 alteraria 0 linhas
       SEM ERRO e o pedido ficaria ABERTO com o saldo cheio depois de o material entrar)
    METADE POSITIVA no mesmo test(): pedido SEM recebimento nenhum aceita o PUT -> 200
(5) DELETE de pedido com quantidade_recebida > 0 -> 409 (literal do contrato 4)
    COUNT(pedidos_compra) inalterado; COUNT(itens WHERE pedido_id) inalterado
(6) DELETE de pedido com recebimento CRIADO E NAO PROCESSADO -> 409 com a MESMA literal
    (INSERT em recebimentos_material_almoxarifado com pedido_compra_id, quantidade_recebida ainda 0)
(7) DELETE de pedido limpo -> 200
    COUNT(pedidos_compra WHERE id) === 0  E  COUNT(itens_pedido_compra WHERE pedido_id) === 0
    <- a segunda e a asserção do orfao; sem ela o cenario passa com o comportamento de hoje
(8) o generico continua funcionando para as outras abas:
    DELETE /api/compras/cotacoes/<id> -> 200   (metade positiva da ordem de registro)
```

- [ ] **Step 2: rodar e LER os números** — `cd server && node tests/api/comprasPedidoEditarExcluir.api.test.js`.
      Previsão: (1)(2)(3)(4) **404** (rota não existe); (5)(6) **200** (o genérico responde e apaga!);
      (7) **falha na segunda asserção** (itens órfãos — o comportamento de hoje); (8) **verde**.
      ⚠️ **O (8) nasce verde de propósito** e não é teste vazio: é a metade positiva que a sabotagem 1
      derruba. Cole as linhas reais do `✗`.

- [ ] **Step 3: implementar** — as três funções no serviço, as três rotas **antes** do genérico, com o
      comentário do **por quê** da posição (uma linha citando a medição 2).

- [ ] **Step 4: rodar de novo**

```
cd server && node tests/api/comprasPedidoEditarExcluir.api.test.js
cd server && node tests/api/comprasPedidoCriar.api.test.js
cd server && node tests/api/comprasPedidosRotas.api.test.js
cd server && node tests/api/pedidoSaldoRecebido.api.test.js
cd server && node tests/api/recebimentoContraPedidoIntegracao.api.test.js
```

- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora (`grep -cF` = 1 **pós-conserto**) | Qual asserção tem de cair |
|---|---|---|---|
| 1 | mover as três rotas de pedido para **depois** do `DELETE` genérico | o bloco `// Pedido de compra — leitura, edicao e exclusao` | o **409** do cenário (5) vira 200 **e** o cenário (7) mantém os itens órfãos. Duas asserções, um defeito — é a prova de que a ordem está sob régua |
| 2 | inverter o comparador da régua (`> 0` → `>= 0`) | `COALESCE(quantidade_recebida, 0) > 0` | o **200** do cenário (3): todo pedido passaria a recusar o PUT. ⚠️ **É a metade positiva que cai, não a negativa** — se você esperava a negativa, a previsão está errada, e é o mesmo padrão da sabotagem 2 da T5 da Etapa 37 (comparadores diferem só na igualdade) |
| 3 | tirar a segunda perna do `DELETE` (a consulta a `recebimentos_material_almoxarifado`) | `WHERE pedido_compra_id = ?` em `excluirPedido` | o **409** do cenário (6), e **só** ele — o (5) continua passando pela primeira perna. É o que prova que as duas pernas medem coisas diferentes |
| 4 | apagar o `DELETE FROM itens_pedido_compra` do `excluirPedido` | `DELETE FROM itens_pedido_compra WHERE pedido_id = ?` | a **segunda** asserção do cenário (7) (`COUNT(itens) === 0`) — e só ela: o pedido some do mesmo jeito. É o defeito de hoje, reproduzido sob régua. ⚠️ **(Fase 2)** isso vale **no harness**, que roda `foreign_keys = 0`; em produção (`sqliteConcurrency.js:50` liga a FK) o mesmo código **falharia** com `FOREIGN KEY constraint failed`. Declare no arquivo de teste, em duas linhas |
| **5 (Fase 2)** | tirar a **segunda perna do `PUT`** (a consulta a `recebimentos_material_almoxarifado` em `atualizarPedido`) | `WHERE pedido_compra_id = ?` em `atualizarPedido` | o **400** do cenário (4b), e **só** ele — o (4) continua passando pela primeira perna. É o que prova que as duas pernas medem coisas diferentes **também no `PUT`**, e é o achado F1 sob régua |

- [ ] **Step 6: commit** — qual era o furo (o `DELETE` genérico apagava a cabeça e deixava os itens
      órfãos, e não havia como editar nem ler um pedido só), o decidido (409 com duas pernas; PUT
      barrado por qualquer item recebido; itens apagados junto; rotas antes do genérico) e o
      descartado (medir só `quantidade_recebida`; `ON DELETE CASCADE` no DDL — é tabela core e a
      Etapa 37 deixou `pedido_item_id` sem FK **de propósito**).

---

### Task 4: a busca de material e a importação por planilha **(galho A)**

**Files:**
- Modify: `server/services/compras/pedidoCompraService.js` (`importarPedidos`)
- Modify: `server/routes/compras.js` (`GET /api/compras/materiais`, `POST /api/compras/pedidos/importar`)
- Create: `server/tests/api/comprasPedidoImportar.api.test.js`

**Restrições medidas:**

| Não faça | Por quê | Cai em |
|---|---|---|
| `INSERT` direto na rota de importação | exigência do escopo: a importação usa **o mesmo serviço** da T2 — senão há duas regras de criação de pedido, e a primeira edição as separa | cenário (2), que afirma `numero` no padrão `PC-` e `valor_total` derivado, os dois vindos do serviço |
| gravar linha com `material_id NULL` | `listarPedidosCompraAux` filtra `material_id IS NOT NULL` — o pedido importado errado apareceria no `<select>` do recebimento como `ABERTO` com saldo 0 e **o operador não saberia por quê** | cenário (3) |
| multer / parse de `.xlsx` no servidor | o precedente medido é JSON: o navegador lê com `XLSX.read` e manda `{ linhas }` (`ItensFornecedor.js:208` + `index.js:20447`) | — (é decisão de forma; o cenário manda JSON) |
| chamar `GET /almoxarifado/materiais` do formulário | `app.use('/api/almoxarifado', auth, checkModulePermission('almoxarifado'))` barra o comprador **antes** do handler (medição 8) | cenário (5) |
| **(Fase 2)** ler a **quantidade** com `extrairDoRow` + `parsePrecoBackend` | ⚠️ **os dois helpers são de PREÇO em pt-BR e estragam quantidade fracionária.** `extrairDoRow` (`index.js:20410-20416`) devolve **sempre `String`**, e `parsePrecoBackend` (`:20403-20409`) **apaga todos os pontos** antes do `parseFloat` (`'1.5'` → `15`, medido na leitura). Uma planilha com `1.5` gravaria **15** em `itens_pedido_compra.quantidade` — que é o total que a 37 lê como `quantidade_pedida`. Leia `row[k]` **cru** e só caia no parse pt-BR quando o valor for string **com vírgula** | cenário (6) |
| **(Fase 2)** importar mais de 50 pedidos e prometer que aparecem | `listarPedidosCompraAux` termina em `ORDER BY p.created_at DESC **LIMIT 50**` (`receiptService.js:1518`). A 38 é a **primeira** porta capaz de criar 60 pedidos num clique: os 10 mais antigos somem do `<select>` do recebimento **sem mensagem nenhuma**. E `created_at` é `DEFAULT CURRENT_TIMESTAMP` (resolução de **1 segundo**), então uma importação inteira empata no `ORDER BY`. **Não se conserta aqui** (é porta da 37): declarar na letra G e no guia, e o roteiro manual usa planilha pequena | — (declarado) |

- [ ] **Step 1: escrever o teste e ver os cenários vermelhos**

```
(1) GET /api/compras/materiais?search=<codigo> -> 200, [{ id, codigo, descricao, unidade }]
    metade positiva/negativa: ?search=zzz -> []; material com ativo = 0 nao aparece
(2) POST /api/compras/pedidos/importar com 5 linhas / 2 ordens (OC-A x3, OC-B x2),
    cabecalhos em grafias diferentes ('código', 'qtd', 'preço unitario')
    -> 201, pedidos.length === 2, pedidos[0].itens === 3, pedidos[1].itens === 2
    numeros casam /^PC-/ E SAO DIFERENTES entre si
    observacoes do primeiro CONTEM 'Planilha: OC-A'
    COUNT(itens_pedido_compra) === 5
    valor_total do primeiro === soma das 3 linhas   <- prova que passou pelo servico
(3) linha com codigo inexistente vai para `ignorados`:
    -> 201, ignorados === [{ linha: 3, motivo: 'material não encontrado pelo código XPTO-404' }]
    COUNT(itens_pedido_compra) === 4
    E A ASSERÇAO QUE MEDE O DANO:
      SELECT COUNT(*) FROM itens_pedido_compra WHERE material_id IS NULL -> 0
    metade positiva: as outras 4 entraram e o pedido de OC-B esta completo
(4) quantidade invalida e linha sem codigo -> ignorados com as literais proprias
    corpo sem `linhas` nem `rows` -> 400 com a literal verbatim do precedente
(6) (Fase 2) A QUANTIDADE FRACIONARIA NAO PODE SER MULTIPLICADA POR 10
    linha com quantidade 1.5 (numero) -> SELECT quantidade -> 1.5
    linha com quantidade '1,5' (string pt-BR do xlsx) -> 1.5
    metade negativa: quantidade '1.5' (string com ponto) -> 1.5, NUNCA 15
    <- e o que `parsePrecoBackend` faria se fosse reusado para quantidade
(5) o gate do almoxarifado e o motivo desta porta existir:
    GET /api/almoxarifado/materiais -> 200 no harness (a camada 2 e liberada nele)
    ⚠️ ESTE cenario NAO prova o 403 de producao — o harness stuba checkModulePermission.
    Escreva no arquivo, em duas linhas, que a prova e a LEITURA de routes/almoxarifado.js:282-285,
    e que a suite NAO protege esse gate. (caso 2 da `fechar-etapa`: declarar, nao forjar)
```

- [ ] **Step 2: rodar e LER os números** — previsão: (1) a (4) **404**; (5) **verde** (e declarado).
- [ ] **Step 3: implementar** — `importarPedidos` agrupando pela coluna da planilha e chamando
      `criarPedido` por grupo; os 5 helpers de `routes/compras.js` reusados (eles já estão lá desde a
      T1); a rota de materiais com `LIMIT 50`.
- [ ] **Step 4: rodar de novo** + `node tests/api/comprasPedidoCriar.api.test.js` (o serviço mudou).
- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora | Qual asserção tem de cair |
|---|---|---|---|
| 1 | gravar a linha sem material com `material_id: null` em vez de `ignorados` | `motivo: \`material não encontrado pelo código` | o `WHERE material_id IS NULL -> 0` **e** o `COUNT === 4` do cenário (3). Duas asserções — a segunda sozinha seria satisfeita por "ignorou tudo" |
| 2 | agrupar por `numero` gerado em vez da coluna da planilha | o bloco `const chaveGrupo =` | `pedidos.length === 2` do (2) vira 5 (um pedido por linha) |
| 3 | `INSERT` direto na rota, sem o serviço | `await criarPedido(db,` dentro de `importarPedidos` | `numeros casam /^PC-/` e `valor_total === soma` do (2) |

- [ ] **Step 6: commit** — o furo (o acervo é 0/0 com 10 fornecedores e 3 materiais: ninguém vai
      digitar histórico), o decidido (agrupador da planilha; `ignorados` em vez de `material_id NULL`;
      mesmo serviço; porta de busca de material no core) e o descartado (idempotência por `numero` —
      incompatível com número gerado; alargar a permissão do módulo almoxarifado).

---

### Task 5: o formulário de pedido, e as rotas ANTES do `path="*"` **(galho B)**

**Files:**
- Create: `client/src/components/compras/PedidoCompraForm.js`
- Create: `client/src/components/compras/PedidoCompraForm.test.js`
- Modify: `client/src/App.js`
- **(Fase 2)** Modify: `client/src/components/Compras.js` (`handleDelete`, `:110-120`)
- **(Fase 2)** Modify: `client/src/components/Compras.test.js` **se existir** — senão o cenário (h2)
  entra no `PedidoCompraForm.test.js` renderizando `<Compras />` com o mock de `api.delete`
  rejeitando 409

**Restrições medidas:**

| Não faça | Por quê | Cai em |
|---|---|---|
| ~~declarar as rotas **depois** do `path="*"` de `App.js:333`~~ | ⚠️ **(Fase 2) ESTA RESTRIÇÃO ESTÁ ERRADA E FOI REFUTADA POR MEDIÇÃO.** `react-router-dom` é **6.30.4** (`client/package.json:24`) e o v6 casa por **ranking de especificidade, não por ordem de declaração**. Prova no próprio arquivo: `<Route path="*">` está em `App.js:333` e `<Route path="fornecedores-homologados">` em `:345` — **depois** — e `/compras/fornecedores-homologados` renderiza `<GruposFornecedores/>`, não `<Compras/>`. O `<Link>` de `Compras.js:277` está morto porque **nenhuma rota casa** `/compras/pedidos/editar/:id`, e não porque o `*` "vence". A correção é a mesma (declarar a rota), mas **a frase não pode entrar em spec, guia nem commit** — seria a terceira afirmação errada herdada nesta série | — |
| **(Fase 2)** mandar `quantidade`/`valor_unitario`/`fornecedor_id` como **string** | é o que `<input type="number">` e `<select>` devolvem, e o schema do servidor é `z.number()` **sem coerção** (medido: `'5'` → 400). A régua da T2 manda números e fica verde enquanto **todo submit real** toma 400 | cenário (c), com `typeof` |
| usar `/compras/pedidos/:id` para a edição | o `<Link>` que já existe aponta para `editar/:id` (`Compras.js:277`) e continuaria morto; e `:id` casaria também `/novo` | cenário (e) |
| pôr campo de `numero` na tela | decisão 5: o número é gerado | cenário (c) |
| mandar `valor_total` no payload | RN-C04 | cenário (c) |
| esquecer as URLs novas no `mockImplementation` | o mock de `api` **rejeita** URL desconhecida por padrão: o cenário mediria o `catch` da tela | todos |

- [ ] **Step 1: escrever o teste e ver os cenários vermelhos**

```
(a) renderizar a rota /compras/pedidos/novo mostra 'Novo pedido de compra' no DOM
    e NAO mostra 'Nenhum pedido encontrado' (o texto da lista) <- prova que o `*` nao venceu
(b) a busca de material chama GET /compras/materiais com o termo digitado
    api.get.mock.calls.filter(c => c[0] === '/compras/materiais') -> toHaveLength(1)
    e o params.search === 'CHAPA'
(c) preencher e submeter -> UM POST, com o payload exato:
    api.post.mock.calls.filter(c => c[0] === '/compras/pedidos') -> toHaveLength(1)
    calls[0][1] toEqual { fornecedor_id: 312, data_pedido: '2026-09-16', previsao_entrega: '2026-09-30',
                          status: 'pendente', observacoes: '',
                          itens: [{ material_id: 907, quantidade: 4, valor_unitario: 25 }] }
    SEM chave `numero`, SEM chave `valor_total`  (afirmar com 'numero' in payload === false)
    (Fase 2) E OS TIPOS, que e o que o servidor recusa:
      typeof calls[0][1].fornecedor_id === 'number'
      typeof calls[0][1].itens[0].quantidade === 'number'
      typeof calls[0][1].itens[0].valor_unitario === 'number'
      <- o toEqual acima NAO pega isso sozinho se o valor for '4' vs 4? pega (toEqual
         distingue '4' de 4) — as tres linhas ficam mesmo assim, porque sao o que explica
         POR QUE o formulario coage, e sobrevivem a quem trocar o toEqual por toMatchObject
(d) submeter SEM item nao chama a API e mostra a literal
    api.post.mock.calls -> toHaveLength(0)
    'Inclua ao menos um item no pedido de compra' no DOM
    metade positiva: com um item, o submit passa (o (c))
(e) modo edicao: /compras/pedidos/editar/418 chama GET /compras/pedidos/418,
    renderiza os itens que vieram, e submete por api.put (nao api.post)
(f) o total calculado aparece: com 4 x 25 -> 'Total: R$ 100,00' no DOM
    metade positiva: mudar a quantidade para 5 -> 'Total: R$ 125,00'
(g) o 400 do servidor aparece no DOM com role="alert" e o formulario FICA DE PE
    (os campos preenchidos continuam preenchidos)
(h2) (Fase 2) O 409 DA RN-C08 CHEGA AO USUARIO
    renderizar <Compras /> na aba Pedidos com um pedido na lista
    mock: api.delete rejeita com { response: { status: 409, data: { error:
      'Pedido de compra PC-XXX ja teve recebimento - nao pode ser excluido' } } }   (com acento no codigo)
    clicar na lixeira (window.confirm mockado para true)
    -> toast.error chamado com A LITERAL DO SERVIDOR, nao com 'Erro ao excluir item'
    metade positiva: api.delete resolvendo -> toast.success e loadData chamado 1x
    <- hoje `Compras.js:118` troca QUALQUER erro por 'Erro ao excluir item': o 409 que a
       T3 congela seria indistinguivel de um 500 para quem clica
```

- [ ] **Step 2: rodar e LER os números** —
      `cd client && CI=true npx react-scripts test --watchAll=false src/components/compras/PedidoCompraForm.test.js`.
      ⚠️ **caminho, nunca `-t`** (devolve `N skipped, exit 0`).
- [ ] **Step 3: implementar** — o componente, e as duas `<Route>` em `App.js` **imediatamente antes**
      do `<Route path="*">` de `:333`, com um comentário de uma linha dizendo por que a posição
      importa.
- [ ] **Step 4: rodar de novo** + a suíte de client inteira (`CI=true npx react-scripts test
      --watchAll=false`) + `CI=true npx react-scripts build` (**`CI=true` faz warning virar erro**).
- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora | Qual asserção tem de cair |
|---|---|---|---|
| 1 | ~~mover as duas `<Route>` para **depois** do `path="*"`~~ → **(Fase 2) REMOVER a `<Route path="pedidos/novo">`** (comentar a linha) | `<Route path="pedidos/novo"` em `App.js` | o `'Novo pedido de compra'` do cenário (a) — sem rota que case, o `*` assume e volta a renderizar `<Compras />`. ⚠️ **A sabotagem original (mover) NÃO derrubaria nada**: o v6 casa por ranking, não por ordem (ver a restrição refutada acima). Sabotagem que não derruba nada é achado — este achado foi pago aqui |
| 2 | mandar `valor_total` no payload | `const payload = {` em `PedidoCompraForm.js` | o `toEqual` do (c) (chave a mais) |
| 3 | trocar `editar/:id` por `:id` | `path="pedidos/editar/:id"` | o (e), com `api.get` não chamado (a rota não casa). ⚠️ **(Fase 2) previsão corrigida: o (a) NÃO cai.** No ranking do v6 o segmento **estático** `novo` vence o dinâmico `:id`, então `/compras/pedidos/novo` continua no formulário certo. Cai **um** cenário, e é o (e) |
| 4 | remover a guarda do submit sem item | `if (itens.length === 0)` | o `toHaveLength(0)` do (d) |

- [ ] **Step 6: commit** — o furo (as três abas do Compras não tinham tela de criação e os dois
      `<Link>` da aba Pedidos caíam no `path="*"`), o decidido (`editar/:id` para casar o link
      existente; sem campo de número; total calculado) e o descartado (`/compras/pedidos/:id` do
      escopo; campo de `valor_total`).

---

### Task 6: "Gerar pedido" na aba Solicitações da Reposição **(galho C)**

**Files:**
- Modify: `client/src/components/almoxarifado/ReposicaoAlmoxarifado.js` (`:747-800`, a aba `SOLICITACOES`)
- Modify: `client/src/components/almoxarifado/ReposicaoAlmoxarifado.test.js`

- [ ] **Step 1: escrever o cenário e vê-lo vermelho**

```
(h) a linha PENDENTE tem o botao 'Gerar pedido' ao lado de 'Cancelar'
    clicar navega para '/compras/pedidos/novo?solicitacao=<id>'
    (mock do useNavigate; afirmar navigate.mock.calls[0][0])
    metade positiva/negativa: linha VINCULADO NAO tem o botao
```

> ⚠️ **(Fase 2) DUAS medições que mudam esta task:**
> 1. **O `?solicitacao=<id>` sozinho não pré-preenche nada, e não há porta que resolva.** Não existe
>    `GET` de **uma** solicitação: `extended.js:1743`/`:1752` são POST (vincular/cancelar) e o resto
>    é a listagem da Reposição, **toda** atrás de `checkModulePermission('almoxarifado')` — o
>    comprador (o usuário-alvo do formulário, medição 8) tomaria **403**. E
>    `GET /api/compras/solicitacoes-compra/:id` (`index.js:18500`) é a tabela **`solicitacoes_compra`
>    do core**, outra tabela (decisão 1) — usá-la aqui traria o registro errado, em silêncio.
>    **Decisão:** a Reposição navega com os dados que ela **já tem na linha**
>    (`ReposicaoAlmoxarifado.js:768-772` traz `material_id`, `material_codigo`, `material_nome`,
>    `quantidade`): `/compras/pedidos/novo?solicitacao=<id>&material=<material_id>&quantidade=<qtd>`.
>    O formulário lê os três da query string; `solicitacao_id` vai no `POST`. Descartado: abrir uma
>    `GET /api/compras/solicitacoes-almoxarifado/:id` no core (porta nova só para pré-preencher,
>    lendo tabela de outro módulo).
> 2. **O destino é do módulo `compras`.** `/compras/*` está dentro de
>    `<ProtectedModuleRoute modulo="compras">` (`App.js:324`): um **almoxarife sem o módulo Compras**
>    clica em "Gerar pedido" e bate na barreira. O botão só aparece para quem tem o módulo `compras`
>    (a mesma fonte que o menu usa), **ou** — se isso custar uma porta nova — aparece para todos e o
>    fato vai para a letra **G** e para o guia. Escolha o reversível e **registre**.

- [ ] **Step 2: rodar e LER o número** (caminho, não `-t`).
- [ ] **Step 3: implementar** — o botão, e no `PedidoCompraForm` a leitura de
      `?solicitacao=&material=&quantidade=` para pré-preencher material e quantidade e mandar
      `solicitacao_id` no `POST` (o servidor já aceita desde a T2, cenário (9)).
- [ ] **Step 4: rodar de novo** + `ReposicaoAlmoxarifado.test.js` inteiro + a suíte de client.
- [ ] **Step 5: sabotagens**

| # | Sabotagem | Âncora | Qual asserção tem de cair |
|---|---|---|---|
| 1 | remover a query `?solicitacao=` do `navigate` | `/compras/pedidos/novo?solicitacao=` | `navigate.mock.calls[0][0]` do (h) |
| 2 | mostrar o botão também em `VINCULADO` | `s.status === 'PENDENTE'` na condição do botão | a metade negativa do (h) |
| 3 | não mandar `solicitacao_id` no payload do `POST` | `solicitacao_id:` em `PedidoCompraForm.js` | ⚠️ **previsão: nada cai no client** (o `toEqual` do cenário (c) não tem a chave, porque o (c) é o caminho sem solicitação) — **acrescente um cenário (i)** no `PedidoCompraForm.test.js` que renderiza com `?solicitacao=55` e afirma `calls[0][1].solicitacao_id === 55`. Só então a sabotagem derruba |

- [ ] **Step 6: commit** — o furo (a reposição gerava solicitações desde a Etapa 11 e ninguém as
      convertia em pedido; `vincularPedidoCompra` existia desde a Etapa 14 **sem um único consumidor
      no client**), o decidido (botão que leva ao formulário do Compras pré-preenchido; vínculo
      não-fatal no servidor) e o descartado (criar o pedido direto da Reposição sem tela — o comprador
      precisa escolher fornecedor e preço).

---

### Task 7: a integração que cruza galhos — pela ROTA e pelo SERVIÇO

**Files:** Create `server/tests/api/comprasPedidoIntegracao.api.test.js`

> É o **aceite da etapa**. Quando este arquivo ficar verde, o roteiro de teste manual da **Etapa 37**
> (`plano:~1806`) passa a ser executável por clique pela primeira vez.

- [ ] **Step 1: escrever o roteiro inteiro, em blocos, no mesmo `test()` quando a ordem importar**

```
BLOCO A — o pedido nasce pela porta do Compras
  1. POST /api/compras/pedidos (fornecedor + 1 item de 10) -> 201, numero PC-…
  2. GET /api/compras/pedidos?search=<numero> -> 1 linha, valor_total derivado
  3. GET /api/almoxarifado/recebimentos-aux/pedidos-compra?pendentes=1
     -> o pedido APARECE, com quantidade_pedida 10, quantidade_recebida 0,
        saldo_pendente 10, situacao_recebimento 'ABERTO'
     ⇐ ESTE E O PASSO QUE PROVA QUE A ETAPA 37 DEIXOU DE SER INERTE
  4. GET …/pedidos-compra/:id/itens -> 1 linha com saldo_pendente_material 10

BLOCO B — o recebimento parcial, pela forma da TELA da Etapa 37
  5. POST /api/almoxarifado/recebimentos { pedido_compra_id, itens: [{pedido_item_id, material_id,
     quantidade: 6}] } -> 201     (payload identico ao que RecebimentosAlmoxarifado monta)
  6. processar -> quantidade_recebida 6; aux -> saldo_pendente 4, 'PARCIAL',
     saldo_pendente_material 4

BLOCO C — o excedente, as tres respostas
  7. segundo recebimento de 5, ALMOXARIFE, sem flag -> 400 com a literal do saldo
  8. o mesmo com autorizar_excedente: true, ALMOXARIFE -> 403 nomeando a acao
  9. o mesmo com COMPRAS -> 201 + 1 linha EXCEDENTE_AUTORIZADO na auditoria

BLOCO D — o pedido agora se defende (RN-C07 / RN-C08)
 10. PUT /api/compras/pedidos/:id -> 400 'já teve recebimento — não pode mais ser editado'
     e SELECT quantidade -> inalterada
 11. DELETE /api/compras/pedidos/:id -> 409 'já teve recebimento — não pode ser excluído'
     e COUNT(pedidos_compra WHERE id) === 1

BLOCO D2 — (Fase 2) O RECEBIMENTO ABERTO TAMBEM DEFENDE O PEDIDO
 10b. um SEGUNDO pedido, com UM recebimento CRIADO e NAO PROCESSADO
      PUT /api/compras/pedidos/:id -> 400 (a literal do "ja teve recebimento")
      SELECT id FROM itens_pedido_compra WHERE pedido_id = ? -> os MESMOS ids
      entao PROCESSAR o recebimento -> SELECT quantidade_recebida -> 6, NAO 0
      ⇐ e este ultimo numero que prova a composicao: sem a 2a perna do PUT, o
        acumulador da 37 (receiptService.js:1261) teria alterado 0 linhas SEM ERRO

BLOCO E — pelo SERVICO, sem HTTP
 12. pedidoCompraService.criarPedido(db, {...}) direto -> itens gravados
 13. receiptService.criarRecebimento(db, user, { pedido_compra_id: <o criado>, … }) -> ok
 14. pedidoCompraService.excluirPedido(db, <o criado>) -> lanca com status 409 e a literal
     ⇐ a regra vale nas DUAS entradas, nao so na rota
```

- [ ] **Step 2: rodar e LER os números.** ⚠️ **Previsão: verde de primeira** (T2–T6 entregaram cada
      peça). **Isto é suspeito por regra desta base** (`fechar-etapa`, "desconfie de teste que passa de
      primeira"): rode as **três** sabotagens de composição do Step 3 **antes** de considerar o
      arquivo pronto.
- [ ] **Step 3: sabotagens de composição** (no código de produção, uma de cada vez)

| # | Sabotagem | Qual passo tem de cair |
|---|---|---|
| 1 | no `criarPedido`, não copiar `material_id` do item (gravar `null`) | o **passo 3**: o pedido some do `?pendentes=1` (`listarPedidosCompraAux` filtra `material_id IS NOT NULL`) — é o mesmo dano que a RN-C11 mede na importação, agora pela porta manual |
| 2 | no `excluirPedido`, medir `quantidade_recebida` **antes** de o recebimento processar | o **passo 11** vira 200 e o **passo 3** de um segundo pedido passa a listar um pedido apagado |
| 3 | no `criarPedido`, gravar `status: 'RECEBIDO'` quando o payload mandar | o cenário (6) da T2 — e, se não cair, a RN-C05 não protege a decisão 4 da Etapa 37 e isso é achado |
| **4 (Fase 2)** | no `atualizarPedido`, tirar a **segunda perna** (a consulta a `recebimentos_material_almoxarifado`) | o **passo 10b** (novo, abaixo). É a composição que nenhuma task sozinha vê: o `PUT` passa, os itens ganham ids novos, o recebimento aberto fica órfão e o acumulador da 37 alteraria **0 linhas sem erro** |

- [ ] **Step 4: os cinco comandos da suíte, com os números REAIS colados aqui**

```
cd server && npm run test:api
cd server && npm run test:almoxarifado
cd server && npm run test:validation && npm run test:safealter && npm run test:sqlite
cd client && CI=true npx react-scripts test --watchAll=false
cd client && CI=true npx react-scripts build
```

- [ ] **Step 5: commit** — a integração e os números.

---

### Task 8: fechamento (use a skill `fechar-etapa`)

- [ ] **Step 1: medir as letras ANTES de escrever.** O fechamento da Etapa 37 rodou entre a escrita
      deste plano e agora:
```
grep -o "\*\*A[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
grep -o "\*\*B[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
grep -o "\*\*C[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
grep -o "\*\*G[0-9]\+" docs/almoxarifado-novidades-por-etapa.md | sort -u -V | tail -3
```
      Medido na abertura: A11, **B88**, C49, F12, G18 — **todos avançam**. Comece na seguinte.
      ⚠️ **(Fase 2) Remedido durante a revisão do plano, com o fechamento da 37 já gravado:**
      **A13, B99, C50, F13, G29** — e **`D` não é numerada**, é a seção `### D. Limitações
      declaradas` (`:2529`). O `grep` de `D[0-9]` devolve **vazio**; não invente `D1`. Os valores
      acima ainda podem avançar até a T8 rodar: **meça de novo**, eles estão aqui só para provar
      que os da abertura já estavam velhos.
- [ ] **Step 2: `docs/almoxarifado-novidades-por-etapa.md`** — a seção da Etapa 38 no formato do
      documento de apresentação (o que o usuário vê, Antes → Agora), mais:
      **letra A** = a consulta do acervo (`SELECT COUNT(*) FROM pedidos_compra` / `itens_pedido_compra`
      antes e depois do deploy — é a medida de que a etapa funcionou em produção, e o acervo era 0/0);
      **letra B** = as **12 decisões** do design, cada uma com o descartado; **letra D** = as três
      abas (só Pedidos ganhou tela) e a ausência de perfil no core; **letra G** = o gate de uma camada
      só nas portas de escrita, o sombreamento do `DELETE /grupos/:id`, os 51 `ALTER` de `index.js`, e
      a fragilidade da sabotagem 6 da T2 (a suíte não distingue "não escreve `quantidade_recebida`" de
      "escreve 0"). **(Fase 2) Mais seis, todos medidos nesta revisão:** (i) o vínculo da solicitação
      é chamado **pelo serviço** e por isso **não passa** por `gerenciar_reposicao` nem pelo módulo
      `almoxarifado` — quem tem o módulo `compras` escreve em `solicitacoes_compra_almoxarifado`;
      (ii) **preço 0 não alimenta o custo médio** (a U1 da 37), e preço é opcional por decisão;
      (iii) `?pendentes=1` **não filtra status** — pedido `cancelado`/`rejeitado` continua no
      `<select>` do recebimento; (iv) o `<select>` do recebimento mostra só `numero — fornecedor`, e
      com o número **gerado** dois pedidos do mesmo fornecedor ficam indistinguíveis para o
      almoxarife; (v) `LIMIT 50` no aux vs. importação em massa; (vi) **FK ligada em produção e
      desligada no harness** — a suíte não prova o comportamento de exclusão que produção terá.
- [ ] **Step 3: `specs/modulo-almoxarifado/22-integracoes/README.md`** — ⚠️ **(Fase 2) LEIA O
      ARQUIVO ANTES DE ESCREVER: o fechamento da Etapa 37 já fez as correções 1 e 3.** Medido
      durante a revisão deste plano: o README já traz, em `:9-28`, o bloco *"CORREÇÃO (2026-09-16,
      Fase 0 da Etapa 38): as duas frases seguintes ESTAVAM ERRADAS"*, com *"o gargalo é os outros
      módulos serem usados"* e *"o módulo Compras está maduro"* **riscadas**, e em `:34-45` o
      ponteiro para esta etapa. **Repetir a correção criaria duas versões do mesmo aviso.** O que a
      T8 faz aqui é: (a) **conferir** os três pontos abaixo e escrever só o que faltar (na leitura
      da Fase 2, o que falta é o **"GET-only até a Etapa 38"** explícito na linha da lista de
      rotas); (b) trocar o "**quem fecha isto: a Etapa 38**" por "**fechado pela Etapa 38**" com o
      range de commits; (c) o checklist com os hashes. Os três pontos originais, para conferência:
      1. `:14-19` *"o módulo **Compras está maduro** (pedidos, itens, …)"* — **era falso**: a Fase 0 da
         Etapa 14 mediu o **`receiptService`** e concluiu maturidade do módulo errado. O que estava
         maduro era a **leitura** do pedido pelo almoxarifado; o Compras tinha **0 rotas de escrita de
         pedido, 0 telas de criação nas três abas e 3 `<Link>` mortos por linha de tabela**.
      2. `:25-26` *"Compras: fornecedores + rotas de pedidos/cotações"* — **verdadeiro mas enganoso por
         omissão**: eram rotas de **listagem**. Escrever "GET-only até a Etapa 38".
      3. `:11-12` *"o gargalo é os outros módulos serem usados"* — **diagnóstico errado, e é o que
         custou a Etapa 37**: `pedidos_compra = 0` não era desuso, era **impossibilidade**. A spec
         culpava o operador por uma tela que não existia, e por isso o item ficou parado desde a
         Etapa 14.
      Mais o checklist marcado item por item, cada `[x]` com o hash.
- [ ] **Step 4: `specs/modulo-compras/README.md`** (criar, **mínimo**) — o que existe hoje no módulo
      core Compras (as três abas, o que cada uma faz e **não** faz), o ponteiro para a fatia em
      `22-integracoes/`, e a nota de que fornecedores e cotações **seguem sem tela de criação**.
- [ ] **Step 5: `specs/modulo-almoxarifado/README.md`** — a linha da feature 22 no mapa de status,
      dizendo que a fatia Compras saiu de "entregue na Etapa 14" (que estava errado) para
      "criação de pedido entregue na Etapa 38; cotações e fornecedores seguem sem tela".
- [ ] **Step 6: `docs/almoxarifado-guia-etapas-e-testes.md`** — seção da Etapa 38 em linguagem de
      usuário, tabela **Antes → Agora**, roteiro de teste manual clicável (**e dizer, na primeira
      linha, que a tela é do módulo Compras, não do almoxarifado**), e o que a etapa **não** cobre.
      **E fechar a letra F da Etapa 37**: o roteiro manual dela deixa de precisar do `INSERT` por SQL
      — troque o bloco SQL pelo caminho por clique e diga **por que** ele estava lá.
- [ ] **Step 7: `docs/almoxarifado-manual-do-sistema.md`** — seção nova do **Compras** (criar pedido,
      importar planilha, editar enquanto nada chegou, excluir); e corrigir `:1742`
      (*"Você informa o número do pedido"* — hoje é um `<select>`, e desde a 38 há pedido para
      selecionar) **dizendo que estava desatualizado**.
- [ ] **Step 8: este plano** — tasks marcadas, hashes, divergências do previsto, **retro de 4
      números** e a **próxima tarefa detalhada**.
- [ ] **Step 9: verificação final da `fechar-etapa`** — os cinco comandos, números reais, e o
      `git log --oneline` do range citado nas specs.

---

## Self-review do plano

- **Cobertura RN ↔ task ↔ sabotagem.** RN-C01 → T1 (1)(2)(3)(4) + sabotagens 1, 2 e 3;
  RN-C02 → T2 (1)(3) + sabotagens 1, 2 e 3; RN-C03 → T2 (4)(7) + sabotagem 2;
  RN-C04 → T2 (5) + sabotagem 4; RN-C05 → T2 (2)(6) + sabotagem 6 (a que **não** cai) + T7 sabotagem 3;
  RN-C06 → T3 (1)(2); RN-C07 → T3 (3)(4) + sabotagem 2; RN-C08 → T3 (5)(6)(7)(8) + sabotagens 1, 3 e 4;
  RN-C09 → T4 (1)(5); RN-C10 → T4 (2) + sabotagens 2 e 3; RN-C11 → T4 (3)(4) + sabotagem 1;
  RN-C12 → T5 (a)–(g) + sabotagens 1, 2, 3 e 4; RN-C13 → T2 (9) + T6 (h)(i) + sabotagens 1, 2 e 3;
  RN-C14 → T7, blocos A–E + as três sabotagens de composição.
  **Nenhuma RN sem sabotagem nomeada, e nenhuma sabotagem sem a asserção que ela tem de derrubar.**
- **As três sabotagens previstas como "nada cai", ditas de frente.** T1 nº 3 (`LEFT JOIN` → `JOIN`:
  só cai depois de o cenário ganhar o pedido órfão — **a instrução é acrescentar o cenário**, não
  trocar a sabotagem), T2 nº 6 (`quantidade_recebida: 0` explícito: o valor é o mesmo, a suíte não
  distingue — **manter a forma segura e declarar na letra G**) e T6 nº 3 (o `solicitacao_id` no
  payload do client: exige o cenário (i), que o plano manda escrever). Nos três a instrução é
  **manter a forma segura e declarar**, nunca forjar vermelho — caso 2 da `fechar-etapa`.
- **Os dois cenários que nascem VERDES, e por que não são teste vazio.** T3 (8) (o `DELETE` genérico
  das outras abas) nasce verde **de propósito**: é a metade positiva que a sabotagem 1 derruba. T4 (5)
  (o gate do almoxarifado) nasce verde **e é declarado inútil como prova** — o harness stuba
  `checkModulePermission`, então o arquivo **escreve** que a prova do 403 é a leitura de
  `routes/almoxarifado.js:282-285` e que a suíte **não** protege esse gate. Os dois estão declarados,
  não escondidos.
- **Nenhum cenário negativo sem metade positiva.** T1: com usuário → 200 ao lado do 401; o `DELETE` de
  pedido → 200 ao lado do 400 de grupo. T2: `valor_unitario: 0` → 201 ao lado do `-1` → 400; os sete
  status do enum → 201; o 201 do vínculo falho. T3: o **segundo** pedido aceitando o mesmo `PUT`; o
  `DELETE` limpo → 200; o genérico das outras abas. T4: as 4 linhas que entraram ao lado da ignorada.
  T5: o submit com item ao lado do submit sem item. T6: a linha `VINCULADO` sem o botão. T7: os passos
  1, 2, 3, 5, 6 e 9 são positivos.
- **Nenhum id de fixture `1`.** Servidor: **todos** os ids são lidos do `INSERT`/do `res.body`, e as
  literais que citam número (`Pedido de compra <numero>`) são montadas a partir do banco; usuários
  `64`/`65`/`66`. Client: fornecedor `312`, material `907`, pedido `418` — e está escrito na regra
  (iii) que o `312` aqui é **fornecedor**, em outro arquivo, para ninguém confundir com o pedido `312`
  das fixtures de recebimento da Etapa 37.
- **Mensagens literais congeladas, e em um lugar só.** As literais de Zod vivem em
  `services/compras/schemas.js` como constantes nomeadas; as duas do "já teve recebimento" vivem cada
  uma em **um** ponto de `pedidoCompraService.js` e diferem **só no sufixo** (`não pode mais ser
  editado` × `não pode ser excluído`) — de propósito, porque são dois gestos diferentes do operador;
  `'Pedido de compra não encontrado'` é **reusada**, não reescrita (já existe em `extended.js` e em
  `purchaseService:62`); a literal do 400 da importação é **copiada verbatim do precedente**
  (`index.js:20451`). A literal da quantidade do item é **diferente** da do almoxarifado de propósito
  (`quantidade do item do pedido`), para `grep` achar um dono por frase. **Nenhuma literal é escrita
  duas vezes no código de produção**; os testes as repetem (é o que os torna régua) e o manual as
  copia lidas do código.
- **O harness monta `/api/compras`, e é a T1 que paga.** `testApp.js:100-101` monta hoje **dois**
  registradores, nenhum Compras, e **zero** testes de `server/tests/**` batem em `/api/compras/*`.
  A T1 acrescenta a terceira linha com um stub de upload próprio; a sabotagem 2 dela (remover a linha)
  derruba os quatro cenários, que é a prova executada de que a montagem é o que torna a suíte
  possível. Consequência declarada: as duas rotas de **foto** (`grupos/:id/foto`,
  `fornecedores/:id/foto`) continuam **sem teste nenhum** — está dito aqui para a próxima sessão não
  achar que estão cobertas.
- **Contratos completos:** as sete rotas (uma existente + seis novas) têm método, gate, payload,
  resposta e **todos** os códigos de recusa com a literal; a rota de importação tem os quatro motivos
  de `ignorados`; e está escrito que o core **não tem** `ACAO_PERFIS`, para ninguém escrever cenário
  de 403 de perfil que não existe.
- **Consistência de nomes e tipos:** `quantidade` e `valor_unitario` em `itens_pedido_compra` são
  `REAL`; `quantidade_recebida` é **da Etapa 37** e esta etapa só a **lê**; `numero` é `TEXT UNIQUE` e
  passa a ser **gerado** (`PC-<base36 do ms><8 aleatórios>`, sem `slice` — a regra da Etapa 31);
  `valor_total` é **derivado** e gravado; `situacao_recebimento` continua **derivado na leitura do
  almoxarifado** e **não** é coluna nem valor de `status`. ⚠️ **Não confundir duas palavras "saldo":**
  saldo aqui é **do pedido de compra**; saldo de estoque continua global por material, e nada nesta
  etapa o toca.
- **Sem placeholders:** todo passo que muda produção traz a literal exata ou o contrato. As três
  coisas deixadas para a execução medir estão marcadas e com instrução: as **letras** do doc de
  novidades (a T8 manda medir de novo, porque o fechamento da 37 as avança), a **contagem das
  âncoras** (contada pós-conserto, com os valores previstos na Global Constraint) e o **placar real**
  dos cinco comandos (T7 Step 4).
- **O que este plano NÃO garante, dito de frente:** (1) **nenhuma porta de escrita nova tem segunda
  camada de autorização** — qualquer usuário com o módulo `compras` cria, edita, importa e apaga
  pedido, e isso é o gate que o módulo já tinha para fornecedores e grupos (letra G, em destaque);
  (2) o `POST` **não é transacionado** — SQLite sem transação nesta base, e um erro entre o `INSERT`
  da cabeça e o dos itens deixa pedido sem item (mitigado pela ordem: o `valor_total` é gravado por
  último, então o pedido meio-feito é visível na lista e apagável pelo `DELETE` da RN-C08 — a mesma
  janela que a migração para Postgres fecha, já registrada em B80); (3) o sombreamento do `DELETE
  /api/compras/grupos/:id` é **congelado, não consertado**; (4) reimportar a mesma planilha
  **duplica** (decisão 8); (5) a suíte **não** distingue "não escreve `quantidade_recebida`" de
  "escreve 0" (sabotagem 6 da T2); (6) o 403 do gate do almoxarifado **não é provado por teste** — o
  harness o stuba. **(Fase 2), mais seis:** (7) o vínculo da solicitação **não passa por perfil nem
  por módulo** — é chamada de serviço (F10); (8) **preço 0 não alimenta o custo médio** (F5); (9) o
  `<select>` do recebimento **não filtra status** e corta em **50** (F6, F7); (10) a **FK está ON em
  produção e OFF no harness**, então a suíte não prova o comportamento real de exclusão (F13); (11) a
  suíte de API **não pega** payload com número em string — quem pega é o cenário `typeof` do client
  (F2); (12) com o número **gerado**, dois pedidos do mesmo fornecedor são indistinguíveis no
  `<select>` do recebimento.

---

### Fluxo traçado até o fim (a quarta pergunta da Fase 2)

Para cada RN, o último gesto do usuário, e **onde um gesto posterior recusa o que um anterior
aceitou**. Esta tabela é a régua de aceite da T7.

| RN | Criar/importar | Ver na lista do Compras | `?pendentes=1` do recebimento | Receber (E37) | Editar | Excluir | Onde quebra |
|---|---|---|---|---|---|---|---|
| **RN-C01** extração | — | 200, `fornecedor_nome` do LEFT JOIN | — | — | — | genérico, 200 | reordenar as rotas "conserta" o `DELETE /grupos/:id` sem querer → o 400 congelado é o detector |
| **RN-C02** POST com itens | 201 + N linhas | aparece | **aparece** | — | — | — | o 201 sai antes de o `INSERT` dos itens falhar: **só a contagem de linhas pega** |
| **RN-C03** Zod | 400, `COUNT` inalterado | — | — | — | o `PUT` usa **o mesmo schema** | — | schema errado recusa tudo → a metade positiva (`valor_unitario: 0` → 201) é o que distingue |
| **RN-C04** `valor_total` | derivado | **é este número que a tela mostra** | — | — | recalculado no `PUT` | — | aceitar do payload faz a lista mostrar total que não bate com item nenhum |
| **RN-C05** enum | 400 fora do enum | badge pintado (`Compras.js:96-108`) | `status` core **intacto** ao lado do derivado | a derivação da E37 **não** vira `status` | idem | — | `PARCIAL`/`RECEBIDO` gravados pintariam o badge de **cinza** e quebrariam o filtro — decisão 4 da E37 |
| **RN-C06** GET /:id | — | — | — | — | é o que **carrega** o formulário de edição | — | 404 com literal nova criaria um segundo nome para o mesmo fato |
| **RN-C07** PUT | — | — | o saldo continua o que era | **o recebimento já lançou** | **400 aqui** | — | ⚠️ **este é o gesto posterior que recusa**: sem a régua, o `PUT` reinsere as linhas e **apaga a `quantidade_recebida`** — o pedido volta a dever o que já chegou, e o acumulador da E37 nunca mais o corrige |
| **RN-C08** DELETE | — | some da lista | ⚠️ o `<select>` do recebimento **deixa de oferecer** | recebimento **aberto** aponta para o vazio | — | **409 aqui**, por duas pernas | a segunda perna (recebimento não processado) existe porque a RN-23 da E37 diz que o saldo só se move na entrada física — sem ela, apagar um pedido com documento aberto responde 200 |
| **RN-C09** busca | é o que escolhe o material | — | — | — | idem | — | sem a porta no core, o formulário toma 403 para o comprador sem o módulo almoxarifado |
| **RN-C10** importar | 201 + N pedidos | aparecem | aparecem | — | — | — | agrupar pelo número gerado faria um pedido por linha |
| **RN-C11** `ignorados` | linha fora | — | ⚠️ **aqui é onde o dano apareceria**: `material_id NULL` some do `?pendentes=1` (filtro `IS NOT NULL`) e o pedido vira `ABERTO` com saldo 0 | o operador não consegue receber e **não sabe por quê** | — | — | é o único lugar do fluxo em que o defeito **não** aparece na tela que o causou |
| **RN-C12** formulário | o gesto inicial | volta para a lista | — | — | o `<Link>` de `:277` | — | rota depois do `path="*"` → **pisca e volta à lista**, o defeito da etapa |
| **RN-C13** Gerar pedido | solicitação → `VINCULADO` | — | — | ao processar, o gancho RN-03 do `purchaseService` marca a solicitação **`RECEBIDA`** (medição 9 — **sem código novo**) | — | — | vínculo fatal faria o comprador sem o módulo almoxarifado perder o pedido inteiro |
| **RN-C14** integração | — | — | — | — | — | — | é a tabela inteira, executada |

**Condição de ordem:** a **T1 tem de estar commitada antes da T2**, e o fechamento da Etapa 37 tem de
ter terminado antes da **T7** (ela roda `recebimentoContraPedidoIntegracao.api.test.js` e
`pedidoSaldoRecebido.api.test.js` inteiros). Se a T7 achar divergência nesses dois arquivos, é
**achado bloqueante** — pare e registre; não conserte teste da 37 dentro da 38.

---

### Próxima tarefa detalhada

**Task 1 — extrair `/api/compras/*` para `server/routes/compras.js` e montá-lo no harness.**

- **O que ela consome:** nada de novo. Ela **cria** a possibilidade de todas as outras.
- **Contrato que ela congela:** `module.exports = (app, db, authenticateToken, checkModulePermission,
  uploads)`, com `uploads = { uploadGrupoCompras, uploadFornecedor }` (DI — os dois multer fecham
  sobre variáveis de módulo do `index.js` e **não** podem ser movidos).
- **Pontos de atenção, medidos:**
  1. o bloco é `server/index.js:19974-20471` — **23 rotas + 5 helpers**, contíguos;
  2. as **3** rotas `/api/compras/solicitacoes-compra` (`:18465`, `:18500`, `:18525`) **ficam** onde
     estão e operam `solicitacoes_compra` (core), que **não é** `solicitacoes_compra_almoxarifado`;
  3. a **ordem** é contrato: `app.delete('/api/compras/:tipo/:id')` (`:20060`) sombreia
     `app.delete('/api/compras/grupos/:id')` (`:20136`) e apagar um grupo responde hoje
     `400 "Tipo inválido"` — **congelar, não consertar**;
  4. o harness monta em `testApp.js:100-101`, ao lado de `routes/almoxarifado` e
     `routes/requisicoesMaterial`, e a camada 2 é stubada (`fakeCheckModulePermission`), então o único
     gate exercitável é o **401** com `setUser(null)`;
  5. `grep -c "'/api/compras" server/index.js` tem de cair de **26** para **3**, e o do arquivo novo
     tem de dar **23** — leia os três que ficaram, não confie na soma.
  6. **(Fase 2)** `testApp.js` **não requer `multer`** hoje (`:6-12`): a linha do registrador precisa
     do `require('multer')` junto, senão o harness quebra no carregamento e **toda** a suíte cai.
  7. **(Fase 2)** conferido por leitura: as 23 são `index.js:19976`–`:20447`, o bloco vai do
     comentário `// ========== ROTAS MÓDULO COMPRAS ==========` (`:19974`) até o `});` da importação
     (`:20471`), e a linha seguinte é `// ========== ROTAS MÓDULO FINANCEIRO ==========` (`:20473`).
     O mapa do genérico é `{ fornecedores, pedidos: 'pedidos_compra', cotacoes }` (`:20062-20066`) e
     a literal é `'Tipo inválido'` (`:20081`) — **`grupos` não está no mapa**, que é o sombreamento.

---

## Fase 2 — o que a revisão do plano pegou ANTES de executar

> Revisão **fresca**, só leitura de código, uma sonda de schema Zod no scratchpad. **13 achados:
> 4 travariam a execução, 9 silenciosos, 7 de ruído.** A lente que os produziu é a da 37: *traçar
> cada RN até o último gesto do usuário* **e** *cruzar cada porta nova com o que o almoxarifado
> LÊ dela*. As correções já estão **no lugar**, marcadas `(Fase 2)`; esta seção é o índice.

### A. Travariam a execução (contrato errado — o executor construiria em cima)

| # | Achado | Evidência | Onde foi corrigido |
|---|---|---|---|
| **F1** | **O `PUT` só tem a primeira perna, e isso apaga o elo de um recebimento ABERTO em silêncio.** O `PUT` substitui os itens (DELETE + INSERT ⇒ **ids novos**); `recebimentos_material_itens_almoxarifado.pedido_item_id` é INTEGER **sem FK de propósito**; o acumulador da 37 é `UPDATE itens_pedido_compra … WHERE id = ?` e **0 linhas alteradas não é erro nem `warn`**. Um recebimento criado e não processado (a situação que a RN-C08 recusa no `DELETE`) tem `quantidade_recebida = 0` e **passa** pela régua do `PUT`. Resultado: o material entra no estoque e o pedido fica `ABERTO` com o saldo cheio **para sempre** | `receiptService.js:1261-1268`; `schema.js:1304-1306`; RN-C07 do design | contrato 4 (2ª perna no `PUT`), T3 restrição nova + cenário **(4b)** + sabotagem **5**, T7 bloco **D2** + sabotagem de composição **4**, RN-C07 do design |
| **F2** | **O contrato Zod recusa o que o formulário manda.** Medido por sonda: `z.number().gt(0, MSG).safeParse('5')` → **400**, e `.safeParse('abc')` → **`Invalid input: expected number, received string`**, não a literal do contrato. O `<input type="number">` e o `<select>` da T5 devolvem **string**; a régua da T2 manda número e fica **verde** enquanto todo submit real toma 400. E a asserção do `'abc'` do cenário (4) é **inexecutável como escrita** | sonda contra `zod@4.4.3` + `validation.js:17-22` | contrato 2 (tipos + `z.number({ error: MSG })`), T2 cenário (4), T5 restrição nova + cenário (c) |
| **F3** | **A premissa de ordem das `<Route>` é falsa.** `react-router-dom@6.30.4` casa por **ranking de especificidade**, não por ordem de declaração — prova no próprio arquivo: `path="*"` em `App.js:333` e `fornecedores-homologados` em `:345`, **depois**, renderizando `<GruposFornecedores/>`. A sabotagem 1 da T5 ("mover as `<Route>` para depois do `*`") **não derrubaria nada** — falso controle positivo — e a frase entraria em spec, guia e commit como fato | `client/package.json:24`; `App.js:333` × `:345` | T5 restrição (riscada, com o porquê), sabotagem 1 (trocada por **remover** a rota), sabotagem 3 (previsão corrigida), design (f) |
| **F4** | **O 409 da RN-C08 nunca chega ao usuário.** A lixeira da aba Pedidos é **o** gesto que dispara o 409, e `Compras.js:118` troca qualquer erro por `toast.error('Erro ao excluir item')`. `Compras.js` **não estava** na tabela de arquivos do plano: a literal congelada, documentada no manual, seria invisível no único lugar onde alguém a veria | `Compras.js:110-120` | estrutura de arquivos, contrato 7, T5 (arquivo + cenário **(h2)**) |

### B. Silenciosos (passariam verdes e machucariam depois)

| # | Achado | Evidência | Onde foi corrigido |
|---|---|---|---|
| **F5** | **Preço 0 desfaz a U1 da Etapa 37.** O recebimento herda `itens_pedido_compra.valor_unitario` quando o payload omite o preço, e `custo_unitario` só viaja quando `> 0`. Com preço **opcional com default 0** (R5/decisão), todo pedido criado sem preço volta a **não alimentar o `custo_medio`** — a regressão que a U1 acabou de consertar, agora pela porta nova. A decisão fica; o que muda é avisar e declarar | `receiptService.js:398-412`, `:1176` | T2 restrição nova, contrato 7 (aviso na tela), T8 letra G (ii) |
| **F6** | **`?pendentes=1` não filtra status.** `listarPedidosCompraAux` não tem cláusula de `status`: o pedido `cancelado` ou `rejeitado` que a RN-C05 passa a permitir **continua no `<select>` do recebimento** como `ABERTO`. E a outra metade da pergunta: o pedido `pendente` (default do `POST`) **aparece sim** — não há nada a fazer para ele aparecer | `receiptService.js:1474-1520` | T8 letra G (iii), fluxo abaixo |
| **F7** | **`LIMIT 50` do aux vs. importação em massa.** A 38 é a primeira porta capaz de criar 60 pedidos num clique; o `<select>` corta em 50 **sem mensagem**. E `created_at` é `DEFAULT CURRENT_TIMESTAMP` (1 s), então a importação inteira **empata** no `ORDER BY` | `receiptService.js:1518`; `index.js:19238` | T4 restrição nova, T8 letra G (v) |
| **F8** | **A quantidade da planilha pode virar 10×.** `extrairDoRow` devolve **sempre `String`** e `parsePrecoBackend` **apaga todos os pontos** (pt-BR): `'1.5'` → **15**. Reusar os helpers de preço para quantidade grava 15 onde o operador escreveu 1,5 — e `quantidade` é o total que a 37 lê | `index.js:20403-20416` | T4 restrição nova + cenário **(6)** |
| **F9** | **`descricao` copiada do material é quase sempre nula.** Em `materiais_almoxarifado` quem é `NOT NULL` é **`nome`**; o resto do módulo lê `m.nome as material_nome`. Copiar `descricao` deixa a linha do pedido e o `<select>` de material **em branco** | `schema.js:298-299`; `receiptService.js:100` | contratos 2 e 6 |
| **F10** | **O vínculo da solicitação não passa por gate nenhum, e a decisão 10 diz o contrário.** `requirePermission('gerenciar_reposicao')` e o módulo `almoxarifado` estão **na rota**, não no serviço: chamando `vincularPedidoCompra(db, …)` direto, qualquer usuário do módulo `compras` — inclusive o `PRODUCAO` do fallback — escreve em `solicitacoes_compra_almoxarifado`. O risco que a decisão 10 diz evitar **não existe**; o que existe é o oposto | `extended.js:1743`; `purchaseService.js:52`; `permissions.js:47` | T2 restrição reescrita, decisão 10 do design, T8 letra G (i) |
| **F11** | **O `?solicitacao=<id>` não tem porta que o resolva.** Não existe `GET` de uma solicitação fora do módulo almoxarifado, e `/api/compras/solicitacoes-compra/:id` é **outra tabela** (`solicitacoes_compra` do core) — usá-la traria o registro errado em silêncio. E o destino `/compras/*` exige o módulo `compras`, que o almoxarife pode não ter | `extended.js:1743`,`:1752`; `index.js:18500`; `App.js:324` | T6, bloco novo de duas medições |
| **F12** | **`excluirPedido` lê tabela do almoxarifado sem guarda.** O precedente do módulo é guardar com `sqlite_master` (é o que `listarPedidosCompraAux` faz). Sem isso, um banco sem o módulo devolve **500 em todo DELETE de pedido** | `receiptService.js:1475-1477` | contrato 4 |
| **F13** | **FK está ON em produção e OFF no harness.** Logo a afirmação "o genérico apaga a cabeça e deixa os itens órfãos" (R3 da Fase 0, RN-C08, mensagem de commit) é verdadeira **só no harness**: em produção o `DELETE` **falha** com `FOREIGN KEY constraint failed` → 500. `excluirPedido` apaga os filhos primeiro **por causa da FK**, e a sabotagem 4 da T3 prova a ordem só no harness | `sqliteConcurrency.js:50`; `planoInspecao.api.test.js:231-234`; `schema.js:1319` | contrato 4, T3 sabotagem 4, T8 letra G (vi) |

### C. Confirmados — o plano estava certo, e a medição diz por quê

- **A ordem do `DELETE` genérico e o `400 'Tipo inválido'`**: `:20060` registra `:tipo/:id`, `:20136`
  registra `grupos/:id`, e o mapa (`:20062-20066`) **não tem `grupos`** → o 400 é real e a
  caracterização detecta reordenação. **O `pedidos` ESTÁ no mapa**, então o `DELETE` genérico apaga
  pedido hoje — é por isso que a rota específica antes dele é obrigatória.
- **23 rotas contíguas + 3 de `solicitacoes-compra`**: conferido rota a rota (26 = 23 + 3).
- **Zero testes batem em `/api/compras/*`**: conferido em `server/tests/**`.
- **O harness stuba `pedidos_compra` sem FK e com `fornecedor_id` nulável** (`testApp.js:57-84`) —
  a sabotagem 3 da T1 (pedido com fornecedor inexistente) **é inserível**, como o plano previu.
- **`z.looseObject` existe no zod 4.4.3** e `validate()` troca `req.body` por `parsed.data`:
  conferido por sonda — o payload com chave extra sobrevive.
- **`inserirComNumeroUnico(db, 'PC', …)` é seguro aqui**: `RE_COLISAO_NUMERO` casa
  `pedidos_compra.numero` (UNIQUE de coluna única), `PC-<base36><8>` casa `/^PC-[0-9A-Z]+$/`, e não
  há colisão possível com o `PC-TESTE-37` do roteiro manual da 37.
- **`ReposicaoAlmoxarifado.test.js` já renderiza dentro de `<MemoryRouter>`** (`:222`) — acrescentar
  `useNavigate` ao componente **não** derruba os cenários existentes.
- **`@testing-library/react` realmente não está instalado**; `xlsx` está.

### D. Ruído (corrigido no lugar, não custa execução)

1. **`numeroDoc.js`**: o comentário é **`:44-52`** (a frase "INALCANCAVEL" está na **:47**), não
   `:47-58`; e ele cita `pedidos_compra.numero` em `index.js:19159` quando o DDL é **`:19230`**.
2. **Letras do doc de novidades remedidas**: **A13, B99, C50, F13, G29** (a abertura dizia
   A11/B88/C49/F12/G18) — e **`D` não é numerada**, é a seção `### D.` (`:2529`).
3. **`22-integracoes/README.md` já foi corrigido** pelo fechamento da 37 (`:9-28`): a T8 **confere**
   e completa, não reescreve o aviso.
4. **T1 cenário (4)**: não afirmar `'Item excluído com sucesso'` — a T3 troca quem responde.
5. **`formatZodError` junta issues com `'; '`** → um defeito por payload nos cenários negativos.
6. **`testApp.js` não requer `multer`** hoje.
7. **`Compras.js` oferece só 6 status no filtro** (`:410-419`): `enviado`, `recebido` e `cancelado`
   entram no enum de 7 **sem** filtro que os alcance — é aceitável (o enum serve ao `PUT`), mas tem
   de estar no guia para ninguém chamar de bug depois.

### Fluxo traçado até o fim — por RN, com **o que a 37 lê disto**

> Complementa a tabela da seção anterior: aqui a coluna que faltava é a **leitura do almoxarifado**.
> Onde a coluna diz "nada", a RN é interna ao Compras e não pode quebrar a 37 — e onde diz uma
> coluna, **essa** coluna é o contrato de composição.

| RN | Último gesto do usuário | O que a **Etapa 37** lê disto | O que quebra se o plano errar |
|---|---|---|---|
| **RN-C01** extração | abrir a aba Pedidos | `pedidos_compra.*` por `listarPedidosCompraAux` (`numero`, `valor_total`, `status`, `data_pedido`, `created_at` na ordenação) | reordenar as rotas "conserta" o `DELETE /grupos/:id` sem querer; o 400 congelado é o detector |
| **RN-C02** POST com itens | clicar "Salvar" e ver o pedido na lista | `itens_pedido_compra`: `material_id` (**`IS NOT NULL` filtra**), `quantidade` (vira `quantidade_pedida`), `valor_unitario` (**vira o preço do recebimento, U1**), `codigo`/`descricao` (aparecem na linha do recebimento), `quantidade_recebida` (nasce 0 pelo DEFAULT) | 201 com 0 itens: o pedido aparece no `<select>` como `ABERTO` com saldo **0** e o operador não sabe por quê. Só a contagem de linhas pega |
| **RN-C03** Zod | digitar quantidade no formulário | nada — mas o **tipo** chega ao banco | `z.number()` sem coerção + formulário sem `Number()` = 400 em todo submit real, com a suíte verde (**F2**) |
| **RN-C04** `valor_total` | ler o total na lista do Compras | `p.valor_total` é **ecoado** no `<select>` do recebimento | total do payload = número que não bate com item nenhum, nos **dois** módulos |
| **RN-C05** enum de status | filtrar por status na aba Pedidos | `p.status` é **ecoado ao lado** da derivação (`ABERTO`/`PARCIAL`/`RECEBIDO`), nunca no lugar dela | `PARCIAL`/`RECEBIDO` gravados quebram a decisão 4 da 37. ⚠️ **E o inverso, achado F6:** `cancelado`/`rejeitado` **continuam** no `<select>` — não há filtro de status no aux |
| **RN-C06** GET /:id | abrir "Editar" | nada (porta do Compras) | literal nova de 404 criaria um segundo nome para o mesmo fato |
| **RN-C07** PUT | tentar editar um pedido que já recebeu | **`quantidade_recebida`** (1ª perna) **e `recebimentos_material_almoxarifado.pedido_compra_id`** (2ª perna, **acrescentada na Fase 2**) | **F1**: sem a 2ª perna o `PUT` apaga o elo de um recebimento aberto e o acumulador da 37 vira no-op silencioso |
| **RN-C08** DELETE | clicar na lixeira da lista | as **duas** tabelas da 37, só leitura | **F4**: o 409 existe mas `Compras.js:118` o esconde. **F13**: em produção a FK já recusaria, com 500 ilegível |
| **RN-C09** busca de material | escolher o material no formulário | `materiais_almoxarifado` (`ativo`, `codigo`, **`nome`**) | **F9**: `descricao` crua devolve opções em branco |
| **RN-C10** importar | colar a planilha e clicar "Importar" | os mesmos campos da RN-C02, ×N pedidos | **F7** (`LIMIT 50`) e **F8** (quantidade 1,5 → 15) |
| **RN-C11** `ignorados` | ler o relatório de importação | `material_id IS NOT NULL` — a linha muda **some** do recebimento | é o único lugar do fluxo em que o defeito **não** aparece na tela que o causou |
| **RN-C12** formulário | o primeiro clique em "Novo Pedido" que não pisca | nada | **F3**: o defeito é "nenhuma rota casa", não "o `*` vence por ordem" |
| **RN-C13** Gerar pedido | clicar "Gerar pedido" na Reposição | `solicitacoes_compra_almoxarifado.status`/`pedido_compra_id`, e depois o gancho RN-03 marca `RECEBIDA` | **F10** (vínculo sem gate) e **F11** (não há porta para pré-preencher; o destino exige o módulo `compras`) |
| **RN-C14** integração | o roteiro manual da Etapa 37, por clique | tudo acima, encadeado | é a tabela inteira, executada — com o bloco **D2** novo |
