# Módulo Compras (core) — índice mínimo

> **Status:** este módulo **não tem spec própria**, e a ausência é decisão, não esquecimento
> (decisão 11 do design da Etapa 38 / **B105**, reversível). A fatia dele que foi especificada e
> entregue — **a criação do pedido de compra** — vive em
> [`specs/modulo-almoxarifado/22-integracoes/README.md`](../modulo-almoxarifado/22-integracoes/README.md)
> como **"fatia Compras"**, porque foi ali que o elo quebrado apareceu (a reposição gerava
> solicitações que ninguém convertia em pedido, e o recebimento contra pedido da Etapa 37 era
> inerte).
> **Última atualização:** 2026-09-22 — **Etapa 40** (`7ccfc85..03cd048`): as abas **Fornecedores**
> e **Cotações** ganharam **tela de criação e edição** — os **4 caminhos mortos** medidos desde a 38
> (`/compras/fornecedores/novo`, `/compras/cotacoes/nova` e os dois lápis) abrem formulário e gravam.
> No servidor: `GET /api/compras/fornecedores/:id` (não existia), Zod nas duas portas de fornecedor
> **sem recusar o que o modal do grupo já mandava**, `status` e `grupo_id: null` passando a ser
> **escritos** (nenhuma porta escrevia `status`; "Remover do grupo" era **no-op**), `POST`/`GET
> /:id`/`PUT` de cotação com `cotacaoService.js`, e o 409 da lixeira do fornecedor contando as
> **três** FKs (cotação e `itens_fornecedor` — a terceira ficou fora de todo mundo até a onda de
> correção). A spec da fatia continua na feature 22 do almoxarifado · antes: 2026-09-17 — **Etapa
> 39** (`39ea9d2..19ebf7d`): a aba Pedidos passou a **mostrar, filtrar e exportar o atraso**, ganhou
> a rota `PATCH …/status`, e as datas das três abas pararam de aparecer um dia antes · antes:
> 2026-09-16 — criado no fechamento da **Etapa 38** (`be71754..0a7e5c6`).

**Descartado ao criar este arquivo:** montar `specs/modulo-compras/` completo (estrutura nova sem
dono, dentro de uma etapa) e escrever a tela de Compras como feature do almoxarifado sem dizer
(mentira estrutural — o erro que o `CLAUDE.md` nomeia como o mais caro). **Reversível:** quando
Compras ganhar spec própria, a fatia migra para cá e este arquivo vira o índice dela.

## Onde o código mora

- **Rotas:** `server/routes/compras.js` — **34 rotas** `/api/compras/*` medidas em 2026-09-22
  (`grep -cE "^app\.(get|post|put|patch|delete)\('/api/compras"`; eram 30 na 39): as **23** extraídas de
  `server/index.js` na Etapa 38 (`be71754`) e montadas no harness
  (`server/tests/helpers/testApp.js`), as **6** portas novas de pedido da própria 38, o
  **`PATCH /api/compras/pedidos/:id/status`** da Etapa 39 (`19ebf7d`), e as **4** da Etapa 40:
  **`GET /api/compras/fornecedores/:id`** (`6795b39`) e **`POST` / `GET /:id` / `PUT
  /api/compras/cotacoes`** (`29dd6a8`). As duas portas de fornecedor que já existiam (`POST`, `PUT`)
  ganharam `validate(FornecedorSchema)` na mesma etapa, sem mudar a resposta.
  Antes da 38 **nenhum teste batia em `/api/compras`**.
  ⚠️ **Três rotas ficaram em `index.js` de propósito:** `/api/compras/solicitacoes-compra`
  (`:18465`, `:18500`, `:18525`). Elas operam `solicitacoes_compra`, tabela do **core**, que **não
  é** `solicitacoes_compra_almoxarifado` — juntá-las confundiria dois fluxos diferentes.
- **Serviços e schemas:** `server/services/compras/pedidoCompraService.js`,
  `server/services/compras/cotacaoService.js` (**Etapa 40**, `29dd6a8` — `criarCotacao`,
  `obterCotacao`, `atualizarCotacao`, importando `erro`/`assertFornecedor` do serviço de pedido),
  `server/services/compras/schemas.js` (os **primeiros Zod do módulo core**; desde a 40 também
  `FornecedorSchema` e `CotacaoSchema`, `008a041`) e `server/services/compras/planilhaCompras.js`.
  **Fornecedor continua SQL na rota + `validate()`** — não ganhou serviço, por decisão (D9 da 40).
- **Telas:** `client/src/components/Compras.js` (as três abas),
  `client/src/components/compras/PedidoCompraForm.js` (lazy, rotas `/compras/pedidos/novo` e
  `/compras/pedidos/editar/:id`), e desde a **Etapa 40**
  `client/src/components/compras/FornecedorForm.js` (`23b86f3`, rotas `/compras/fornecedores/novo` e
  `/compras/fornecedores/editar/:id`) e `client/src/components/compras/CotacaoForm.js` (`b692413`,
  rotas `/compras/cotacoes/nova` e `/compras/cotacoes/editar/:id`). O modal de edição de fornecedor
  que já existia em `client/src/components/FornecedoresDoGrupo.js` (Fornecedores homologados → grupo)
  **continua**, e é o consumidor que o retrofit de Zod não podia recusar.
  ⚠️ **Este caminho estava ERRADO aqui** (dizia `client/src/components/PedidoCompraForm.js`, sem o
  diretório `compras/`): o arquivo não existe nesse lugar, e quem seguisse a linha concluiria que a
  tela sumiu. Medido em 2026-09-17.
- **Tabelas:** `pedidos_compra`, `cotacoes`, `fornecedores` e afins são do core; mas
  **`itens_pedido_compra` NÃO é** — o `CREATE TABLE` está em
  `server/services/almoxarifado/schema.js:1311` (o design da Etapa 37 dizia o contrário, e
  **estava errado**).

## As três abas — o que cada uma faz, e o que NÃO faz

| Aba | Lista | Cria / edita | Apaga |
|---|---|---|---|
| **Pedidos** | ✅ `GET /api/compras/pedidos` — **desde a Etapa 39 com `atrasado`/`dias_atraso` derivados, badge vermelho `Atrasado há N dias`, checkbox `Só atrasados` (`?atrasados=1`) e as colunas `Atrasado`/`Dias de atraso` no Excel** | ✅ **desde a Etapa 38**: formulário + importação por planilha, `PUT` enquanto nenhum recebimento tocou o pedido; **desde a Etapa 39**, pedido que já teve recebimento abre em modo "só status" e salva por `PATCH /api/compras/pedidos/:id/status` | ✅ rota própria, 409 se já houve recebimento, e **libera** a solicitação da reposição |
| **Fornecedores** | ✅ — desde a **Etapa 40** o filtro *Inativo* deixou de ser inerte (antes nenhuma porta escrevia `status`) e o `<select>` mostra só `Ativo`/`Inativo` (`b692413`) | ✅ **desde a Etapa 40**: `FornecedorForm` em `/compras/fornecedores/novo` e `/editar/:id` (`23b86f3`) — 7 textos + grupo (opcional) + **status só na edição**; erro do servidor em `role="alert"`, toast *"Fornecedor salvo"*. Servidor: `GET /:id` novo com projeção nomeada (sem `planilha_*`), `POST`/`PUT` com `FornecedorSchema` (`6795b39`, `008a041`). O `PUT` é **substituição total** dos 7 textos (caracterizado, não mudado) | ⚠️ genérico, **409** com pedido (`59abaea`, Etapa 38), com **cotação** (`6795b39`, RN-E12) e com **itens cadastrados** (`bdaadd8`, F1 da onda — a terceira FK); precedência pedido → cotação → itens |
| **Cotações** | ✅ — `<select>` de status com `em_analise/aprovado/rejeitado/cancelado` e o botão passou a dizer **"Nova Cotação"** (era "Novo Cotação", `b692413`) | ✅ **desde a Etapa 40**: `CotacaoForm` em `/compras/cotacoes/nova` e `/editar/:id` (`b692413`) — **cabeçalho só**: número **digitado** (o do documento do fornecedor, `UNIQUE` → 409 com o número na frase), fornecedor, data (nasce hoje **local**), validade, valor total (campo de entrada, não derivado), status, observações. Servidor: `POST`/`GET /:id`/`PUT` por `cotacaoService.js` (`29dd6a8`) | ⚠️ genérico, sem guarda (cotação não tem filhos) |

**A Etapa 38 consertou UMA das três abas, a Etapa 39 aprofundou a MESMA aba, e a Etapa 40 fechou
as outras DUAS.** ~~Cotações e fornecedores seguem sem tela de criação — são **4 caminhos mortos**
medidos (`/compras/fornecedores/novo`, `/compras/cotacoes/nova` e os dois lápis de edição em
`Compras.js`), e continuam sendo o **próximo candidato declarado** ("tema B")~~ — **era verdade até
a 39**; a Etapa 40 (`7ccfc85..03cd048`) abriu os quatro caminhos com `FornecedorForm` e
`CotacaoForm`, e o "tema B" deixou de existir como candidato. O que ainda **não** existe em Compras
está na seção seguinte.

## O que a Etapa 40 mudou nas abas Fornecedores e Cotações (`7ccfc85..03cd048`)

Range: design `7ccfc85`, plano `43b24c1`, Fase 2 `84ace0b`, T1 `008a041`, T2 `6795b39`, T3
`29dd6a8`, T4 `23b86f3`, T5 `b692413`, T6 `d64ede0`, onda F2 `55a3214`, F4 `01732dd`, F3-cliente
`795e47d`, F1 `bdaadd8`, F3-servidor `8cde2ee`, F5 `03cd048`. Contratos completos (schemas,
literais, rotas) na feature 22 do almoxarifado, seção *"Contratos da fatia Compras — fornecedores
e cotações"*.

**O que a etapa descobriu e nenhuma spec dizia** (medido na Fase 0 de 2026-09-21 contra `90597c7`,
`.superpowers/sdd/etapa40-fase0-servidor.md` / `-cliente.md`):

- **`GET /api/compras/fornecedores/:id` não existia.** A lista era `SELECT *` sem `LIMIT`, carregando
  o JSON inteiro de `planilha_dados` de cada fornecedor, e `ItensFornecedor.js` editava por
  "lista + `find`". A 40 criou a porta com **projeção nomeada** (sem as três colunas `planilha_*`) —
  a lista continua `SELECT *`, declarado.
- **Nenhuma porta escrevia `fornecedores.status`.** O `POST` gravava `'ativo'` fixo e o `PUT` não
  incluía a coluna; o filtro *"Inativo"* da aba, o `?status=` de `GET /fornecedores` e os `WHERE
  status = 'ativo'` do grupo e do seletor do recebimento eram **inertes** (10/10 `ativo` em
  produção). Desde `6795b39` o `PUT` aceita `status: 'ativo' | 'inativo'` (ausente → não mexe); o
  `POST` continua gravando `'ativo'` e **ignora** a chave.
- **"Remover do grupo" era no-op.** `FornecedoresDoGrupo.js` mandava `grupo_id: null` e a rota fazia
  `body.grupo_id != null ? … : undefined` — `null` virava "ausente", a coluna não entrava no `UPDATE`,
  e o botão respondia *sucesso* sem mudar nada. Nunca reportado porque os 10 fornecedores de produção
  nasceram todos pelo modal do grupo e ninguém tentou tirar um. Desde `6795b39`, `null`/`''`/`0`
  **limpam**; ausente não mexe.
- **`fornecedores` tem TRÊS FKs, não duas.** O comentário do genérico e o design da 40 (D10/RN-E12)
  enumeravam `pedidos_compra` e `cotacoes`; **`itens_fornecedor`** (`index.js:19285-19296`, a lista
  de preços do fornecedor) ficou fora — fornecedor com itens e sem pedido/cotação passava pelas duas
  contagens e a lixeira respondia **500** em produção, exatamente o defeito que a F5 da 38 dizia ter
  fechado. Achado da revisão final (lente RN, I1), consertado em `bdaadd8` com terceira contagem
  (409 *"Fornecedor possui itens cadastrados — não pode ser excluído"*) e o stub de `itens_fornecedor`
  no harness. **Descartado:** cascatear `DELETE FROM itens_fornecedor` (irreversível, apagaria lista
  importada sem avisar).
- **`GET /grupos/:id/fornecedores` filtrava `status = 'ativo'`** — inofensivo enquanto `inativo` era
  inalcançável; com a tela nova, um fornecedor inativado dentro de um grupo **sumia** do grupo (sem
  selo, sem "Remover") e não entrava no "Vincular". Desde `8cde2ee` a rota devolve todos os status
  (ativos primeiro, `NULL` legado junto dos ativos) e `795e47d` pinta o selo *Inativo* e tira inativos
  do "Vincular". `listarFornecedoresAux` (seletor do recebimento) **continua** só com ativos, de
  propósito.
- **`cotacoes` é cabeçalho chapado** (`numero UNIQUE`, `fornecedor_id NOT NULL` + FK, `valor_total`,
  duas datas, `status DEFAULT 'em_analise'`, `observacoes`) e **zero `cotacao_itens`** em qualquer
  grafia. Por isso a cotação da 40 é só cabeçalho e `valor_total` é digitado (D1/D8).

**O que ainda NÃO existe em Compras depois da 40** (todos por decisão, declarados): itens de cotação
e "converter cotação em pedido" (o próximo alcançável — ver o plano da 40, "Próxima tarefa
detalhada"); foto do fornecedor na tela nova (segue no modal do grupo); `cidade`/`estado`/`cep` na
tela; validação de formato de CNPJ/e-mail e `UNIQUE` de CNPJ; `assertFornecedor` checando `status`
(pedido e cotação aceitam fornecedor inativo); perfis no core (G30); paginação da lista de
fornecedores; suíte para `FornecedoresDoGrupo.js` (o arquivo não tem teste — o F3-cliente foi
verificado só por build e suíte inteira).

## O que a Etapa 39 mudou nesta aba (`39ea9d2..19ebf7d`)

- **Atraso derivado na leitura** (`437aed2`): a régua única é `derivarAtraso` em
  `server/services/compras/pedidoCompraService.js`, consumida pela rota **e** pelo alerta do
  almoxarifado. Nenhuma coluna nova, nenhuma migration. Contrato completo na feature 22.
- **`PATCH /api/compras/pedidos/:id/status`** (`19ebf7d`): a única porta que muda o status de um
  pedido que já teve recebimento — o `PUT` continua recusando com 400, e isso é deliberado (ele faz
  `DELETE` + `INSERT` das linhas e zeraria `quantidade_recebida`). `GET /:id` ganhou
  `teve_recebimento: 0|1` para a tela decidir o modo **antes** de montar o formulário.
- **⚠️ O defeito escapado da Etapa 38, corrigido aqui** (`235c067`): `formatDate` desta tela era
  `new Date(str).toLocaleDateString('pt-BR')`, e `new Date('2026-09-16')` é **meia-noite UTC** — em
  `America/Sao_Paulo` a aba mostrava **`15/09/2026`** em `Data Pedido`, `Previsão Entrega`,
  `Cadastrado em` e `Data`/`Validade`, **e no Excel exportado**. Como a importação lê `DD/MM/AAAA`,
  **exportar e reimportar o próprio Excel do CRM movia as duas datas um dia para trás a cada volta**.
  Agora a formatação é por `split('-')` da string, sem `new Date`, e vale para exibição e export; o
  `hojeISO` do formulário passou a ser local (era UTC: entre 21h e 0h o pedido nascia com a data de
  amanhã). **Regra desta base, escrita porque custou uma etapa: data não passa por `new Date(str)`.**
- **Ainda não tratado nesta aba** (Minor da revisão final, declarado): a exportação faz **1 `GET
  /compras/pedidos/:id` por pedido** (N+1, sem teto), e com `Só atrasados` ligado e nenhum resultado
  a tela diz *"Nenhum pedido encontrado"* sem mencionar o filtro.

## Autorização — UMA camada, e isso é declarado

Todas as rotas têm `authenticateToken` + `checkModulePermission('compras')` e **nenhum
`requirePermission`**, inclusive as portas de **escrita** criadas na Etapa 38, o
**`PATCH …/pedidos/:id/status`** da Etapa 39 e as **quatro rotas da Etapa 40** (`GET
/fornecedores/:id`, `POST`/`GET /:id`/`PUT /cotacoes` — a revisão final sondou as quatro com
`setUser(null)` → 401): quem tem o módulo `compras` cria, edita, importa, muda status e apaga
pedido, fornecedor e cotação. Acrescentar `ACAO_PERFIS` ao core exige decidir os
perfis do módulo inteiro e é **etapa própria** (B101).
⚠️ **Consequência declarada do `PATCH`:** ele aceita **qualquer** dos 7 status, inclusive em pedido
já recebido. Não existe máquina de estados no módulo — o `status` é campo livre dentro do enum desde
a Etapa 38, e a porta nova herdou isso em vez de inventar uma régua que só ela conheceria.

**A única exceção, e ela é condicional:** `POST /api/compras/pedidos` com `solicitacao_id` exige
`can(user, 'gerenciar_reposicao')` **antes de qualquer escrita** (`3e43069`), porque a escrita em
`solicitacoes_compra_almoxarifado` é a mesma que o almoxarifado gateia — e o furo era alcançável
por clique.

## Defeito pré-existente conhecido, medido e CONGELADO

`app.delete('/api/compras/:tipo/:id')` está registrado **antes** de
`app.delete('/api/compras/grupos/:id')` e o **sombreia**: `grupos` não está no mapa de tabelas do
genérico, então apagar um grupo responde **`400 'Tipo inválido'`**. Medido na Fase 0 da Etapa 38 e
**caracterizado por teste** (não consertado) — o cenário existe para **detectar reordenação** das
rotas, que é o que quebraria o `PUT`/`DELETE` de pedido. Consertá-lo é escopo de quem for cuidar da
aba Grupos.
