# Etapa 40 — Fornecedores e Cotações ganham TELA: os quatro caminhos mortos do Compras (design)

**Data:** 2026-09-21 · **Branch:** `desenvolvimento-almoxarifado` · **BASE:** `90597c7` · **Módulo:**
**CORE Compras** (terceira etapa seguida fora do almoxarifado) · **Fatia de spec:**
`specs/modulo-compras/README.md` (as três abas, `:45-56`) e `specs/modulo-almoxarifado/22-integracoes/`
(a fatia "Compras", item *"Tela de criação de cotações e fornecedores — fora do escopo, declarado"*,
`22-integracoes/README.md:211`). **Item de checklist que ela fecha:** esse.

**Medição de base:** `.superpowers/sdd/etapa40-fase0-servidor.md` e `etapa40-fase0-cliente.md` — Fase 0
só leitura, dois subagentes em paralelo, sondas contra o harness e o banco de produção aberto
`OPEN_READONLY`. **Todo fato deste design tem `arquivo:linha`** dessas duas medições, feitas hoje
contra `90597c7`; as linhas citadas em 2026-09-16 (Fase 0 §6 da Etapa 39) **envelheceram ~+48 no
servidor e ~+55 em `Compras.js`** e não valem mais.

> ⚠️ **Onde este design corrige a Fase 0 de 16/09 e o handoff do plano da 39, vale este design** — e
> a correção fica **escrita** (regra 5 do `CLAUDE.md`). São quatro, na seção 11.

> ⚠️ **Modo autônomo.** O `CLAUDE.md` manda não perguntar: toda decisão abaixo é o caminho
> **reversível**, com o descartado escrito, e vai para a letra **B** do documento de novidades no
> fechamento. O André arbitra lendo o documento.

---

## 1. Contexto e problema

A tela de Compras é **uma** (`client/src/components/Compras.js:15`) com três abas decididas pela URL
(`:20-26`). Desde a Etapa 38 a aba **Pedidos** tem formulário (`App.js:357-362`). As outras duas
**não**: o botão único "Novo" (`:492-498`) aponta para `/compras/fornecedores/novo` e
`/compras/cotacoes/nova` (`:468-479`), e os lápis das duas abas apontam para
`/compras/fornecedores/editar/:id` (`:315`) e `/compras/cotacoes/editar/:id` (`:447`). Nenhuma das
quatro rotas existe em `App.js` (grep com `exit=1`, controle positivo `pedidos/novo` em `:357`); as
quatro caem no `path="*"` (`:342-344`), que renderiza `<Compras />`, que lê a aba pela URL por
`includes` e **volta para a lista**. O comprador clica e nada acontece — **quatro caminhos mortos**,
medidos na Fase 0 cliente §2.2.

**O que existe por trás deles, medido (Fase 0 servidor §1):**

| Porta | Estado |
|---|---|
| `POST /api/compras/fornecedores` (`routes/compras.js:535-550`) | existe, **sem Zod** (`if (!razao_social)` → 400), grava 8 colunas com `status='ativo'` fixo, ignora `endereco` |
| `PUT /api/compras/fornecedores/:id` (`:553-577`) | existe, sem Zod, **substituição total** dos 7 campos texto; aceita `endereco`; `grupo_id: null` é **no-op** (`:563`) |
| `GET /api/compras/fornecedores/:id` | **não existe** (sonda: 404 sem JSON) |
| `GET /api/compras/cotacoes` (`:314-340`) | existe, com `fornecedor_nome` por `LEFT JOIN` |
| `POST` / `GET /:id` / `PUT /api/compras/cotacoes` | **não existem** |
| `DELETE /api/compras/:tipo/:id` (`:343-419`) | genérico; 409 só para fornecedor **com pedido** (`:405-416`); cotação não conta |

**E o que está por baixo é mais fino do que a medição de 16/09 dizia:**

- **"Remover do grupo" não remove.** `FornecedoresDoGrupo.js:188-200` manda `grupo_id: null`, e
  `routes/compras.js:563` faz `body.grupo_id != null ? … : undefined` — `null` vira `undefined`, a
  coluna não entra no `UPDATE`, e o botão responde *sucesso* sem mudar nada (sonda executada, Fase 0
  servidor §1.2 semântica 2). Defeito latente, nunca reportado — porque em produção os 10
  fornecedores nasceram **todos** pelo modal daquele grupo e ninguém tentou tirar um.
- **Nenhuma porta escreve `fornecedores.status`.** `POST` grava `'ativo'` fixo (`:546`) e o `PUT`
  não inclui a coluna (`:565`). O filtro *"Inativo"* da aba (`Compras.js:521`), o `?status=` de
  `GET /fornecedores` (`:95-98`) e o `WHERE status = 'ativo'` de `GET /grupos/:id/fornecedores`
  (`:528`) e do aux de recebimentos (`receiptService.js:1613`) são **inertes** — 10/10 `ativo` em
  produção.
- **Já existe um formulário de edição de fornecedor com todos os campos** — em modal, alcançável
  só por *Fornecedores homologados → grupo → lápis* (`FornecedoresDoGrupo.js:348-414`), com
  **quatro** chamadas de escrita (`POST :217`, `PUT :131`, `:167`, `:191`) que mandam `''` nos
  textos e `grupo_id` como **string** (`useParams`). É o contrato que um retrofit de validação
  **não pode recusar**.
- **`cotacoes` é cabeçalho chapado** (`index.js:19244-19256`): `numero UNIQUE`, `fornecedor_id NOT
  NULL` + FK, `valor_total`, `data_cotacao`, `validade`, `status DEFAULT 'em_analise'`,
  `observacoes`. **Zero** `cotacao_itens` em qualquer grafia. E `numeroDoc.js:64` fixa por contrato
  que `cotacoes.numero` é **DIGITADO**.
- **Produção:** 10 fornecedores (todos `ativo`, todos em grupo, nenhum com endereço), **0**
  cotações, **0** pedidos — mas o arquivo não recebe escrita desde 04/set, anterior às Etapas 38/39.

### Os números da Fase 0 que decidem o corte

| Medida | Valor | Consequência |
|---|---|---|
| Testes de `POST`/`PUT` fornecedor | **0** | a T2 começa por **caracterizar** as duas portas antes de tocar |
| Asserções sobre cotação no repositório | **1** (o `DELETE` genérico, `comprasPedidoEditarExcluir:444-451`) | tudo de cotação nasce nesta etapa |
| `cotacoes` no harness `testApp.js` | **não** (DDL local em `comprasPedidoEditarExcluir:93-108`) | promover ao harness é tronco |
| Consumidores de escrita de fornecedor | **4**, todos em `FornecedoresDoGrupo.js` | o schema aceita `''`, string numérica e `null` |
| CSS obrigatório para as telas | **0** (`PedidoCompraForm` importa `../Compras.css` e usa 5 classes que nem estão nele) | sem CSS novo |
| Linhas obrigatórias em `Compras.js` | **0** | opcional: rótulo `"Novo Cotação"` (`:496`) e opções de status por aba (`:519-525`) |

---

## 2. Objetivo e corte

**Objetivo:** ao fim da etapa, os quatro caminhos abrem um formulário, e o formulário grava. Um
comprador **cria e edita fornecedor** (com grupo e status) e **cria e edita cotação** (cabeçalho:
número, fornecedor, datas, valor, status, observações) sem sair do módulo Compras. As portas que
já existiam passam a validar com Zod **sem recusar o que aceitam hoje**, o botão "Remover do grupo"
passa a remover, e excluir fornecedor com cotação é recusado com frase, não com 500.

**Dentro:**

- **A0 — o servidor de fornecedor:** `FornecedorSchema` (retrofit nas duas portas), `GET /:id`,
  `status` no `PUT`, `grupo_id: null` limpa, 409 por cotação no genérico.
- **A1 — o servidor de cotação:** `CotacaoSchema`, `cotacaoService.js`, `POST`, `GET /:id`, `PUT`.
- **A2 — as duas telas:** `FornecedorForm.js`, `CotacaoForm.js`, 4 rotas, 2 exports lazy, rótulo
  *"Nova Cotação"*, opções de status por aba.
- **A3 — a integração** que cruza os galhos pela rota e pelo serviço.

**Fora (seção 8):** itens de cotação, foto do fornecedor na tela nova, `cidade`/`estado`/`cep`,
planilha do fornecedor, perfis no core Compras, `DELETE` próprio, paginação da lista.

---

## 3. Decisões desta etapa — **catorze** (vão para a letra B do doc de novidades)

| # | Decisão | Descartado, e por quê |
|---|---|---|
| **D1** | **Escopo = A0 → A1 → A2 → A3**, os quatro caminhos mortos e o que eles exigem no servidor. | Itens de cotação (`cotacao_itens` não existe; inventar entidade é etapa própria); comparar cotações; converter cotação em pedido. |
| **D2** | **`GET /api/compras/fornecedores/:id` é criada**, com **projeção nomeada** (sem `planilha_dados`/`planilha_nome`/`planilha_atualizado_em`). | O contorno de `ItensFornecedor.js:78-84` (lista + `find`): a lista é `SELECT *` sem `LIMIT` (`:87-100`) e carrega a planilha JSON inteira de cada fornecedor; um form que abre por id não pode depender disso. |
| **D3** | **Retrofit de Zod nas duas portas de fornecedor SEM mudar o contrato:** `looseObject`; `razao_social` `trim().min(1)` com a literal de hoje (`'Razão social é obrigatória'`, `:544`/`:564`, e a tela já tem toast com a mesma frase, `FornecedoresDoGrupo.js:126`); textos `z.string().optional().nullable()` aceitando `''`; `grupo_id` por `z.preprocess` (RN-E03). **Sem validação de formato de e-mail ou CNPJ.** | `z.string().email()` / regex de CNPJ: `FornecedoresDoGrupo` manda `email: ''` nos três `PUT` e a 400 quebraria o modal existente; CNPJ não tem `UNIQUE` na DDL e produção tem 10 linhas com CNPJ livre. Validar formato é regra nova sobre acervo — fica na letra D. |
| **D4** | **`grupo_id: null` no `PUT` passa a LIMPAR a coluna** — conserta "Remover do grupo". `''`, `0` e `NaN` também limpam (é o que `parseInt … \|\| null` já fazia). Ausente → não mexe. | Preservar o no-op: era defeito, não contrato; nenhum consumidor depende de `null` não limpar (os outros dois `PUT` mandam string). Reversível em uma linha. |
| **D5** | **`status` entra no `PUT` de fornecedor** como `z.enum(['ativo','inativo'])` opcional; ausente → não mexe. O `POST` continua `'ativo'` fixo. | `PATCH /:id/status` próprio (o molde da 39): o `PUT` já é substituição total e a tela de edição reenvia tudo — uma porta a mais para um campo que viaja no mesmo form é cerimônia. `assertFornecedor` (`pedidoCompraService.js:255`) **continua não checando status** — um pedido pode citar fornecedor inativo; declarado na letra G, não decidido aqui. |
| **D6** | **`cotacoes.numero` é DIGITADO e obrigatório** (`trim().min(1)`), `UNIQUE` traduzido em **409** *"Já existe uma cotação com o número ⟨numero⟩"*. | Gerar `COT-…` por `inserirComNumeroUnico`: o contrato de `numeroDoc.js:44-64` só o permite se a porta **não aceitar** `numero` — e o número da cotação é o do documento do **fornecedor**, que o comprador precisa citar. |
| **D7** | **Vocabulário de `cotacoes.status`:** `STATUS_COTACAO = ['em_analise','aprovado','rejeitado','cancelado']`, default `'em_analise'` (é o `DEFAULT` da DDL e o fallback da tela, `Compras.js:442`). | `pendente`/`enviado` (são estados de **pedido**); vocabulário próprio em feminino (`aprovada`): `getStatusColor` (`Compras.js:135-148`) e o `<select>` já pintam/filtram as formas masculinas — uma segunda grafia daria filtro inerte. |
| **D8** | **`valor_total` é campo de entrada** (`z.number().min(0)`, opcional, default `0`). | Derivar de itens: não há itens. Deixar sempre `0`: a lista mostra a coluna (`:434`) e ela seria decorativa. |
| **D9** | **Cotação ganha `cotacaoService.js`** (`criarCotacao`, `obterCotacao`, `atualizarCotacao`, com `erro()` e `assertFornecedor` **importados** de `pedidoCompraService`); **fornecedor fica SQL na rota + `validate()`**, como hoje. | `fornecedorService.js`: as duas portas têm 15 linhas de SQL cada e zero cenário; extrair sem régua é refactor sem prova. Duplicar `assertFornecedor`: duas frases *"Fornecedor não encontrado"* divergiriam. |
| **D10** | **409 na exclusão de fornecedor por cotação:** *"Fornecedor possui cotações — não pode ser excluído"*, no mesmo bloco da F5 (`:405-416`), **antes** do `DELETE`; o comentário `:402-403` é **reescrito** dizendo que era verdade até a 40. `DELETE /cotacoes/:id` segue pelo genérico, sem guarda (cotação não tem filhos). | Traduzir a constraint no `catch`: só falaria a frase no ambiente com FK ligada (o harness roda `foreign_keys = 0`), e o teste não a provaria — mesma razão da F5. |
| **D11** | **Erro do servidor em `role="alert"`, sucesso em toast**, como `PedidoCompraForm.js:405-415` — e não toast de erro. Depois de salvar, `navigate` para a aba. | Toast de erro: a suíte da 38 mede erro por `alertas()`, e um form com dois canais de erro confunde quem copia. |
| **D12** | **A tela de fornecedor tem `grupo` (select de `GET /compras/grupos`, opcional) e `status` (só na edição).** Sem foto. | Foto: é multipart com fallback base64 (`FornecedoresDoGrupo.js:18-40`) e continua no modal do grupo; trazê-la dobra a tela por um campo que o modal já resolve. |
| **D13** | **`cotacoes` promovida ao harness** `testApp.js`, ao lado de `fornecedores :64` e `pedidos_compra :100`, **sem FK e com `fornecedor_id` nulável** (a mesma forma da DDL local de `comprasPedidoEditarExcluir:97-108`, que vira no-op). | DDL local em cada suíte nova: é o caminho que a Etapa 37 fechou para `pedidos_compra` depois de sete DDLs divergentes. |
| **D14** | **Quatro galhos em paralelo, em worktrees com junction de `node_modules`** (`mklink /J`): servidor-fornecedor, servidor-cotação, cliente-fornecedor, cliente-cotação. Tronco: só a T1 (schemas + literais + harness). | Fila (a retro nº 3 da Etapa 39 mediu o custo); `npm install` por worktree (o motivo declarado da fila na 39 — a junction o elimina). Se a junction falhar no Windows, cai para **dois** galhos (servidor em worktree, cliente em fila na árvore principal) e registra. |

---

## 4. Regras de negócio — `RN-E01…RN-E16`

Cada RN aparece no nome do teste que a prova e na frase do manual que a descreve.

### A0 — fornecedor (servidor)

| RN | Enunciado | Cenário |
|---|---|---|
| **RN-E01** | `razao_social` é obrigatória nas duas portas; vazia ou só espaços → **400** `Dados inválidos — razao_social: Razão social é obrigatória`. | `POST { razao_social: '  ' }` → 400 com a literal; `PUT` idem. |
| **RN-E02** | O `PUT` é **substituição total** dos sete textos (`razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco`): campo ausente ou `''` grava `''`/`null` como hoje. A tela de edição **reenvia todos**. | `PUT { razao_social: 'X' }` sozinho zera `email`. Caracterizado, não mudado. |
| **RN-E03** | `grupo_id` aceita **número, string numérica, `null`, `''` e ausente**. `'3'` → 3. No `POST`: `null`/`''`/`0`/ausente → `NULL`. No `PUT`: `null`/`''`/`0` → **limpa**; ausente → **não mexe**. Qualquer outra string → 400 `grupo_id: grupo do fornecedor inválido`. | Linha com `grupo_id=7`; `PUT { …, grupo_id: null }` → `grupo_id IS NULL` (o botão "Remover do grupo" passa a remover). `PUT { … }` sem a chave → continua 7. |
| **RN-E04** | `status` no `PUT`: `'ativo'` ou `'inativo'`; outro valor → 400 `status: status do fornecedor inválido (use ativo ou inativo)`; ausente → não mexe. O `POST` grava sempre `'ativo'`, ignorando `status` no corpo. | `PUT { …, status: 'inativo' }` → `GET /:id` devolve `inativo`; `POST { …, status: 'inativo' }` → 201 e `ativo`. |
| **RN-E05** | Fornecedor `inativo` **some** dos seletores do almoxarifado (`GET /almoxarifado/recebimentos-aux/fornecedores`, `WHERE status='ativo'`) e de `GET /grupos/:id/fornecedores`; **continua aceito** por `POST /api/compras/pedidos` (`assertFornecedor` não checa status — declarado). | Inativar → aux não lista; pedido com ele → 201. |
| **RN-E06** | `GET /api/compras/fornecedores/:id` devolve a linha com **projeção nomeada** (sem as três colunas `planilha_*`); id inexistente → **404** `Fornecedor não encontrado`; id não numérico → 404 idem. | `GET /:id` de linha com `planilha_dados` preenchido → corpo **sem** a chave. |
| **RN-E12** | Fornecedor com **cotação** não pode ser excluído: **409** `Fornecedor possui cotações — não pode ser excluído`. Com pedido, a literal da F5 continua (`… pedidos de compra …`); com os dois, vale a de **pedido** (checada primeiro). Cotação é sempre excluível. | Fornecedor + cotação → `DELETE /fornecedores/:id` 409; apaga a cotação → 200. |

### A1 — cotação (servidor)

| RN | Enunciado | Cenário |
|---|---|---|
| **RN-E07** | `numero` é obrigatório, digitado, `trim`; duplicado → **409** `Já existe uma cotação com o número ⟨numero⟩` (no `POST` e no `PUT` para outro id). | Duas cotações `COT-77` → a segunda 409 com o número na frase. |
| **RN-E08** | `fornecedor_id` é inteiro positivo obrigatório: ausente/`'3'`/`0` → 400 `fornecedor_id: fornecedor da cotação é obrigatório`; inexistente → **400** `Fornecedor não encontrado` (a mesma frase de `assertFornecedor`). Inativo é aceito. | `POST { fornecedor_id: 999999 }` → 400. |
| **RN-E09** | `data_cotacao` e `validade`: `''`/ausente/`null` → `NULL`; `AAAA-MM-DD` → grava; outro → 400 `data da cotação inválida (use AAAA-MM-DD)` / `validade da cotação inválida (use AAAA-MM-DD)`. | `POST { validade: '31/12/2026' }` → 400. |
| **RN-E10** | `status` ∈ `STATUS_COTACAO`; ausente → `'em_analise'`; outro → 400 `status: status da cotação inválido (use em_analise, aprovado, rejeitado ou cancelado)`. | `POST { status: 'aprovada' }` → 400. |
| **RN-E11** | `valor_total` é número ≥ 0, opcional, default 0; string ou negativo → 400 `valor_total: valor total da cotação não pode ser negativo`. | `POST { valor_total: '10' }` → 400 (sem coerção, como o pedido). |
| **RN-E13** | `PUT /cotacoes/:id` usa o **mesmo schema** do `POST` (substituição total do cabeçalho); id inexistente → **404** `Cotação não encontrada`; `GET /:id` idem. Resposta do `POST`/`PUT`/`GET` é a linha com `fornecedor_nome`. | `PUT` trocando o fornecedor → `GET` devolve o `fornecedor_nome` novo. |

### A2 — as telas

| RN | Enunciado | Cenário |
|---|---|---|
| **RN-E14** | Os quatro caminhos abrem formulário: `/compras/fornecedores/novo` e `/editar/:id` → `FornecedorForm`; `/compras/cotacoes/nova` e `/editar/:id` → `CotacaoForm`. A edição carrega por `GET /:id`. Salvar: `POST`/`PUT` com **todos** os campos, toast *"Fornecedor salvo"* / *"Cotação salva"*, `navigate` para a aba. Erro do servidor → `role="alert"` com a literal. | Clicar "Novo Fornecedor" → `h1` *"Novo fornecedor"*; lápis → *"Editar fornecedor"* com os campos preenchidos. |
| **RN-E15** | Recusa **local**, sem chamar a API: fornecedor sem razão social → `role="alert"` *"Razão social é obrigatória"*; cotação sem número → *"Número da cotação é obrigatório"*; sem fornecedor → *"Fornecedor da cotação é obrigatório"*. Campos numéricos vão com `Number()`. | Submeter vazio → `api.post` **não** é chamado. |
| **RN-E16** | O rótulo do botão passa a *"Nova Cotação"* (era *"Novo Cotação"*, `Compras.js:496`), e o `<select>` de status mostra **só as opções da aba**: Fornecedores `ativo/inativo`; Pedidos `STATUS_PEDIDO_COMPRA` (as 7 de hoje); Cotações `STATUS_COTACAO`. | Na aba Fornecedores o `<select>` tem 3 `<option>` (Todos, Ativo, Inativo). |

---

## 5. Contratos congelados

### 5.1 `FornecedorSchema` (`server/services/compras/schemas.js`, exportado com as literais)

```js
const RAZAO_SOCIAL_OBRIGATORIA = 'Razão social é obrigatória';            // a literal de hoje, :544/:564
const GRUPO_FORNECEDOR_INVALIDO = 'grupo do fornecedor inválido';
const STATUS_FORNECEDOR = ['ativo', 'inativo'];
const STATUS_FORNECEDOR_INVALIDO = 'status do fornecedor inválido (use ativo ou inativo)';

const textoOpcional = z.preprocess((v) => (v == null ? null : String(v).trim()), z.string().nullable()).optional();
// grupo_id: número | string numérica | null | '' | ausente. Ausente -> undefined (o PUT não mexe);
// null/''/0/NaN -> null (o PUT limpa, o POST grava NULL); string não numérica -> 400.
const grupoIdOpcional = z.preprocess((v) => {
  if (v === undefined) return undefined;
  if (v === null || v === '') return null;
  const n = typeof v === 'number' ? v : (typeof v === 'string' && /^\d+$/.test(v.trim()) ? parseInt(v, 10) : NaN);
  if (Number.isNaN(n)) return 'INVALIDO';
  return n > 0 ? n : null;
}, z.union([z.null(), z.number().int()], { error: GRUPO_FORNECEDOR_INVALIDO })).optional();

const FornecedorSchema = z.looseObject({
  razao_social: z.string({ error: RAZAO_SOCIAL_OBRIGATORIA }).trim().min(1, RAZAO_SOCIAL_OBRIGATORIA),
  nome_fantasia: textoOpcional, cnpj: textoOpcional, contato: textoOpcional,
  email: textoOpcional, telefone: textoOpcional, endereco: textoOpcional,
  grupo_id: grupoIdOpcional,
  status: z.enum(STATUS_FORNECEDOR, { error: STATUS_FORNECEDOR_INVALIDO }).optional(),
});
```

`POST` e `PUT` usam `validate(FornecedorSchema)`. A rota mantém a normalização de hoje
(`nome_fantasia`/`cnpj` → `''`, os outros → `null`), porque a lista mostra `nome_fantasia || ''`.
O `POST` **ignora** `status` (grava `'ativo'`); o `PUT` só inclui `status` e `grupo_id` no `UPDATE`
quando vieram (`!== undefined`).

### 5.2 Rotas de fornecedor (`server/routes/compras.js`, junto de `:534-577`)

| Rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `GET /api/compras/fornecedores/:id` (**nova**, acima do `PUT`) | — | `200` `{ id, razao_social, nome_fantasia, cnpj, contato, email, telefone, endereco, cidade, estado, cep, status, grupo_id, foto, created_at, updated_at }` | `404 { error: 'Fornecedor não encontrado' }` |
| `POST /api/compras/fornecedores` | `FornecedorSchema` | `201 { id, razao_social, nome_fantasia, grupo_id }` (**mantido**) | `400 'Dados inválidos — …'` |
| `PUT /api/compras/fornecedores/:id` | `FornecedorSchema` | `200 { message: 'Fornecedor atualizado' }` (**mantido**) | `400`; `404 'Fornecedor não encontrado'` |
| `DELETE /api/compras/fornecedores/:id` (genérico, `:343`) | — | `200 { message: 'Item excluído com sucesso' }` | `409 'Fornecedor possui pedidos de compra — não pode ser excluído'` (pedido, primeiro); `409 'Fornecedor possui cotações — não pode ser excluído'` (cotação); `404 'Item não encontrado'` |

### 5.3 `CotacaoSchema` e `cotacaoService.js`

```js
const STATUS_COTACAO = ['em_analise', 'aprovado', 'rejeitado', 'cancelado'];
const NUMERO_COTACAO_OBRIGATORIO = 'número da cotação é obrigatório';
const FORNECEDOR_COTACAO_OBRIGATORIO = 'fornecedor da cotação é obrigatório';
const STATUS_COTACAO_INVALIDO = 'status da cotação inválido (use em_analise, aprovado, rejeitado ou cancelado)';
const VALOR_COTACAO_NEGATIVO = 'valor total da cotação não pode ser negativo';
const DATA_COTACAO_INVALIDA = 'data da cotação inválida (use AAAA-MM-DD)';
const VALIDADE_COTACAO_INVALIDA = 'validade da cotação inválida (use AAAA-MM-DD)';

const CotacaoSchema = z.looseObject({
  numero: z.string({ error: NUMERO_COTACAO_OBRIGATORIO }).trim().min(1, NUMERO_COTACAO_OBRIGATORIO),
  fornecedor_id: z.number({ error: FORNECEDOR_COTACAO_OBRIGATORIO }).int(FORNECEDOR_COTACAO_OBRIGATORIO).positive(FORNECEDOR_COTACAO_OBRIGATORIO),
  valor_total: z.number({ error: VALOR_COTACAO_NEGATIVO }).min(0, VALOR_COTACAO_NEGATIVO).optional(),
  data_cotacao: dataIsoOpcional(DATA_COTACAO_INVALIDA),
  validade: dataIsoOpcional(VALIDADE_COTACAO_INVALIDA),
  status: z.enum(STATUS_COTACAO, { error: STATUS_COTACAO_INVALIDO }).optional(),
  observacoes: textoOpcional,
});
```

`server/services/compras/cotacaoService.js` (novo), com `erro` e `assertFornecedor` **exportados**
de `pedidoCompraService.js` (acrescentar os dois ao `module.exports`; `erro` já é o molde dos
serviços do almoxarifado):

```js
criarCotacao(db, dados)           -> linha (obterCotacao)      // 400 fornecedor inexistente; 409 numero duplicado
obterCotacao(db, id)              -> linha | throw erro(404)   // SELECT c.*, f.razao_social AS fornecedor_nome
atualizarCotacao(db, id, dados)   -> linha                     // 404; 400; 409 (numero de OUTRA cotação)
COTACAO_NAO_ENCONTRADA = 'Cotação não encontrada'
numeroDuplicado(numero) = `Já existe uma cotação com o número ${numero}`
```

O 409 do `numero` é checado **antes** do `INSERT`/`UPDATE` (`SELECT id FROM cotacoes WHERE numero = ?
AND id <> ?`) **e** traduzido no `catch` de `SQLITE_CONSTRAINT … cotacoes.numero` — duas guardas
porque a corrida entre o `SELECT` e o `INSERT` existe (o motor de estoque compensa a falta de
transação do mesmo jeito).

### 5.4 Rotas de cotação (`server/routes/compras.js`, junto de `:313-340`)

| Rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `POST /api/compras/cotacoes` | `CotacaoSchema` | `201` linha com `fornecedor_nome` | `400 'Dados inválidos — …'`; `400 'Fornecedor não encontrado'`; `409 'Já existe uma cotação com o número X'` |
| `GET /api/compras/cotacoes/:id` | — | `200` linha com `fornecedor_nome` | `404 'Cotação não encontrada'` |
| `PUT /api/compras/cotacoes/:id` | `CotacaoSchema` | `200` linha | `400`; `404`; `409` |
| `DELETE /api/compras/cotacoes/:id` (genérico) | — | `200` | `404 'Item não encontrado'` — **inalterado** |

A rota traduz `e.status || 500`, como `:171-182`.

### 5.5 Client — rotas e telas

| Rota (`App.js`, bloco `:329-377`) | Componente (`lazyModules.js`, molde de `:61`) |
|---|---|
| `fornecedores/novo`, `fornecedores/editar/:id` | `FornecedorForm` (`components/compras/FornecedorForm.js`) |
| `cotacoes/nova`, `cotacoes/editar/:id` | `CotacaoForm` (`components/compras/CotacaoForm.js`) |

**`FornecedorForm`:** `data-testid` `fornecedor-razao`, `fornecedor-fantasia`, `fornecedor-cnpj`,
`fornecedor-contato`, `fornecedor-email`, `fornecedor-telefone`, `fornecedor-endereco`,
`fornecedor-grupo` (select de `GET /compras/grupos`, opção *"Sem grupo"* = `''`), `fornecedor-status`
(só na edição, `ativo`/`inativo`); form `data-testid="fornecedor-form"`. `h1` *"Novo fornecedor"* /
*"Editar fornecedor"*. Payload do `PUT`: os 7 textos + `grupo_id` (`''` quando sem grupo → o servidor
limpa) + `status`. Payload do `POST`: os 7 textos + `grupo_id`. Telefone com `mascararTelefoneDigitando`
(`utils/telefone.js`). Toast *"Fornecedor salvo"*; `navigate('/compras/fornecedores')`.

**`CotacaoForm`:** `cotacao-numero`, `cotacao-fornecedor` (select de `GET /compras/fornecedores`,
como `PedidoCompraForm.js:160-166`), `cotacao-data`, `cotacao-validade`, `cotacao-valor`,
`cotacao-status`, `cotacao-observacoes`; form `cotacao-form`. `h1` *"Nova cotação"* / *"Editar
cotação"*. `data_cotacao` nasce em `hojeISO()` **local** (cópia de `PedidoCompraForm.js:110-114`).
Payload: `numero`, `fornecedor_id: Number(...)`, `valor_total: Number(...) || 0`, `data_cotacao`,
`validade`, `status`, `observacoes`. Toast *"Cotação salva"*; `navigate('/compras/cotacoes')`.

Ambas: `import '../Compras.css'`, cabeçalho `.page-header` + `<Link className="btn-secondary">Voltar
para …</Link>`, erro em `role="alert"`, `mensagemDeErro` copiada de `PedidoCompraForm.js:119-122`.

---

## 6. Telas — o que o usuário vê, com as literais

- **Compras → Fornecedores → "Novo Fornecedor"** abre *"Novo fornecedor"*: Razão social*, Nome
  fantasia, CNPJ, Contato, E-mail, Telefone, Endereço, Grupo (Sem grupo / lista). **Salvar** →
  *"Fornecedor salvo"* e a lista com a linha nova. Razão social vazia → *"Razão social é
  obrigatória"* na faixa, sem ir ao servidor.
- **Lápis** → *"Editar fornecedor"* com os campos preenchidos e o **Status** (Ativo/Inativo).
  Inativo → a linha fica com o selo *Inativo* na aba; o fornecedor some do seletor do recebimento.
- **Compras → Cotações → "Nova Cotação"** abre *"Nova cotação"*: Número*, Fornecedor*, Data,
  Validade, Valor total, Status, Observações. Número repetido → faixa *"Já existe uma cotação com o
  número ⟨X⟩"*. **Salvar** → *"Cotação salva"* e a lista com Número, Fornecedor, Valor, Data,
  Validade e Status.
- **Lixeira da aba Fornecedores** em fornecedor com cotação → toast *"Fornecedor possui cotações —
  não pode ser excluído"* (o `handleDelete` já mostra a literal do servidor, `Compras.js:165`).
- **Fornecedores homologados → grupo → "Remover do grupo"** → o fornecedor **sai** do grupo (era
  no-op).

---

## 7. Testes — arquivos e cenários

### 7.1 `server/tests/api/comprasFornecedorRotas.api.test.js` (novo) — A0

(1) caracterização do `POST` do modal (4 chaves, `grupo_id` string) → 201 e linha igual à de hoje;
(2) caracterização dos 3 `PUT` de `FornecedoresDoGrupo` (7 textos `''` + `grupo_id` string) → 200;
(3) RN-E01 nas duas portas; (4) RN-E03 `grupo_id: null` **limpa** — controle positivo: sabotar
`!== undefined` de volta para `!= null` derruba **este**; (5) RN-E03 ausente não mexe; `'abc'` → 400
literal; (6) RN-E04 `inativo` no `PUT`, `status` ignorado no `POST`, `'x'` → 400; (7) RN-E02
substituição total caracterizada; (8) RN-E06 `GET /:id` sem `planilha_*`, 404; (9) RN-E12 409 por
cotação, 409 por pedido tem precedência, 200 depois de apagar; (10) chave desconhecida (`cidade`)
continua ignorada (`looseObject`); (11) `Dados inválidos —` é o prefixo de todo 400 de schema.

### 7.2 `server/tests/api/comprasCotacaoRotas.api.test.js` (novo) — A1

(1) `POST` mínimo → 201, `status = 'em_analise'`, `valor_total = 0`, `fornecedor_nome`; (2) RN-E07
duplicado → 409 com o número na frase, no `POST` e no `PUT` para outro id, e o `PUT` do **próprio**
id com o mesmo número → 200; (3) RN-E08 ausente/`'3'`/`0` → 400 literal; inexistente → 400
`Fornecedor não encontrado`; (4) RN-E09 `''` → `NULL`, `31/12/2026` → 400 nas duas datas; (5)
RN-E10; (6) RN-E11 `'10'` e `-1` → 400; (7) RN-E13 `PUT` troca fornecedor → `fornecedor_nome` novo;
404 no `PUT` e no `GET`; (8) `DELETE` genérico continua 200 (o cenário (8) de
`comprasPedidoEditarExcluir` **continua verde** com `cotacoes` no harness — é o controle de que a
promoção ao harness não mudou a forma); (9) `numero` só espaços → 400.

### 7.3 `client/src/components/compras/FornecedorForm.test.js` (novo) — A2

Molde `PedidoCompraForm.test.js:44-112` + `:188-230`, com `patch` no mock e `FornecedorForm` em
`reais`. (a) `/compras/fornecedores/novo` renderiza `h1` e o form; (b) `linkPorTexto('Novo
Fornecedor')` da aba chega ao form (molde (i) `:528-546`); (c) submit vazio → alerta local, `post`
não chamado; (d) `POST` exato: 7 textos + `grupo_id`; (e) edição: `GET /:id` preenche, `PUT` com
**todos** os campos + `status`; (f) 400 do servidor em `role="alert"`; (g) lixeira da aba com 409 de
cotação mostra a literal (molde (h2) `:490-525`); (h) grupo `''` viaja como `''`.

### 7.4 `client/src/components/compras/CotacaoForm.test.js` (novo) — A2

(a) `/compras/cotacoes/nova`; (b) `linkPorTexto('Nova Cotação')` (RN-E16 — e prova que o rótulo
mudou); (c) recusa local de número e fornecedor; (d) `POST` com `Number()` e `hojeISO` local (com o
controle de fuso de `Compras.test.js:197-202`); (e) edição `GET`+`PUT`; (f) 409 do número em
`role="alert"`; (g) o `<select>` de status da aba Cotações tem as 4 opções + Todos, e o da aba
Fornecedores tem 2 + Todos (RN-E16).

### 7.5 `server/tests/api/comprasFornecedorCotacaoIntegracao.api.test.js` (novo) — A3

Pela **rota** e pelo **serviço**: cria fornecedor pelo `POST` (payload da tela nova, com grupo) →
cria cotação para ele pelo `POST` → `DELETE /fornecedores/:id` 409 por cotação → `PUT` inativa o
fornecedor → `GET /almoxarifado/recebimentos-aux/fornecedores` **não** o lista → `POST
/api/compras/pedidos` com ele → 201 (RN-E05 declarado) → `DELETE /cotacoes/:id` 200 → `DELETE
/fornecedores/:id` → 409 por **pedido** → apaga o pedido → 200. E `cotacaoService.criarCotacao`
direto com `fornecedor_id` de fornecedor apagado → `erro` 400.

### 7.6 Suítes que precisam continuar verdes (citar o real no fechamento)

`comprasPedidosRotas` (5), `comprasPedidoEditarExcluir` (**13**, medido na Fase 2 — o (8) e o (12) tocam nas tabelas
desta etapa), `comprasPedidoCriar`, `pedidosCompraSaldoAux`, `recebimentoContraPedidoIntegracao`,
`comprasPedidoAtraso` (11), `comprasPedidoStatus` (7); client `PedidoCompraForm.test.js` (25 — o (i)
depende de `linkPorTexto('Novo Pedido')`, que **não muda**) e `Compras.test.js` (9 — o (g) mede
ausência de checkbox na aba Fornecedores, e a etapa não põe checkbox nenhum). Números de partida:
API **187/187**, client **49 / 753**.

---

## 8. Fora de escopo — o que esta etapa NÃO cobre

- **Itens de cotação** e comparação de cotações entre fornecedores (não há entidade).
- **Converter cotação em pedido** (é o gesto natural seguinte; depende de itens).
- **Foto do fornecedor** na tela nova (fica no modal do grupo).
- **`cidade`/`estado`/`cep`**: colunas sem consumidor; a tela não as expõe.
- **Validação de formato de CNPJ/e-mail e `UNIQUE` de CNPJ** (D3 — regra nova sobre acervo).
- **Perfis no core Compras**: continua uma camada (G30).
- **`DELETE` próprio** de fornecedor/cotação: o genérico serve.
- **Paginação/`LIMIT` da lista de fornecedores** e o `planilha_dados` que ela carrega (`:87`).
- **`assertFornecedor` checando `status`** (D5): pedido com fornecedor inativo continua 201.
- **"Adicionar existente" de `FornecedoresDoGrupo` filtrando inativos** *(Fase 2, I4)*: um inativo
  pode ser vinculado a um grupo com sucesso e não aparecer nele (o `GET` do grupo filtra `ativo`).
  Fica em letra C/G e no guia; o conserto de uma linha espera um cenário, porque o arquivo não tem
  suíte.
- **Prefetch errado** em `lazyModules.js:203` (inócuo).

---

## 9. Letras para o fechamento

- **A:** (i) `SELECT COUNT(*) FROM fornecedores WHERE status IS NULL OR status NOT IN ('ativo','inativo')` *(o `IS NULL` entrou pela Fase 2, M6: `NOT IN` com `NULL` não conta)* — deve dar 0
  antes do deploy (o `PUT` passa a validar o enum, mas só no que a tela manda; um valor estranho no
  banco não quebra, só não é escolhível); (ii) `SELECT numero, COUNT(*) FROM cotacoes GROUP BY numero
  HAVING COUNT(*) > 1` — deve dar 0 (a coluna já é `UNIQUE`; a consulta é confirmação).
- **B:** D1–D14, cada uma com o descartado (seção 3).
- **C:** "Remover do grupo" **não removia** (D4) — quem operava e acreditava ter removido um
  fornecedor de um grupo precisa conferir.
- **D/G:** os itens da seção 8; `assertFornecedor` sem status; lista `SELECT *`.

---

## 10. Riscos, e onde o desenho os fecha

| Risco | Onde fecha |
|---|---|
| O Zod recusa o que `FornecedoresDoGrupo` manda hoje (`''`, string, `null`) | 7.1 (1)(2) são **caracterização antes do retrofit** — escritos e verdes contra o código de hoje, depois mantidos |
| `z.object` faz strip e uma chave some em silêncio | `looseObject` nas duas; 7.1 (10) |
| `grupo_id: null` limpar quebra alguém | 7.1 (2) prova os três `PUT` reais; nenhum manda `null` sem querer limpar |
| A literal do 409 diverge entre harness e produção | guarda **antes** do `DELETE` (D10), como a F5 |
| Corrida no `numero` | duas guardas (5.3) |
| Suíte de client verde medindo stub | as duas telas em `reais` do Proxy; cenário (a) afirma o `h1` |
| Worktrees sem `node_modules` | junction (D14); fallback declarado |

---

## 11. O que a Fase 0 de 16/09 e o handoff da 39 diziam, e este design corrige

1. *"Todas as rotas novas obrigatoriamente **acima** de `DELETE /:tipo/:id`"* — **errado**: o Express
   casa método + caminho; só um `DELETE` próprio precisaria (Fase 0 servidor §1.1, sonda com o
   `PUT :553` abaixo do genérico respondendo 200). Nenhuma rota desta etapa é `DELETE`.
2. *"`GET /fornecedores/:id` — criar, o formulário de edição **precisa** dela"* — forte demais:
   `ItensFornecedor.js:78-84` edita sem ela. Criar é **decisão** (D2), não requisito.
3. *"toast com a literal do servidor"* como molde do form — **errado**: o molde é `role="alert"`
   (`PedidoCompraForm.js:405-415`); toast é só de sucesso e da lixeira (D11).
4. *"padrão de `testApp.js:93-97`"* para DDL local — arquivo errado: o padrão está em
   `comprasPedidoEditarExcluir.api.test.js:93-108`. Irrelevante para a 40 porque `cotacoes` vai ao
   harness (D13).

E dois fatos que **nenhuma** medição anterior tinha: o no-op do `grupo_id: null` e a inércia de
`fornecedores.status` — os dois viram RN (E03, E04) em vez de ficarem em letra G.
