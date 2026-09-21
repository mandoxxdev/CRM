# Módulo Compras (core) — índice mínimo

> **Status:** este módulo **não tem spec própria**, e a ausência é decisão, não esquecimento
> (decisão 11 do design da Etapa 38 / **B105**, reversível). A fatia dele que foi especificada e
> entregue — **a criação do pedido de compra** — vive em
> [`specs/modulo-almoxarifado/22-integracoes/README.md`](../modulo-almoxarifado/22-integracoes/README.md)
> como **"fatia Compras"**, porque foi ali que o elo quebrado apareceu (a reposição gerava
> solicitações que ninguém convertia em pedido, e o recebimento contra pedido da Etapa 37 era
> inerte).
> **Última atualização:** 2026-09-17 — **Etapa 39** (`39ea9d2..19ebf7d`): a aba Pedidos passou a
> **mostrar, filtrar e exportar o atraso**, ganhou a rota `PATCH …/status`, e as datas das três abas
> pararam de aparecer um dia antes. A spec da fatia continua na feature 22 do almoxarifado · antes:
> 2026-09-16 — criado no fechamento da **Etapa 38** (`be71754..0a7e5c6`).

**Descartado ao criar este arquivo:** montar `specs/modulo-compras/` completo (estrutura nova sem
dono, dentro de uma etapa) e escrever a tela de Compras como feature do almoxarifado sem dizer
(mentira estrutural — o erro que o `CLAUDE.md` nomeia como o mais caro). **Reversível:** quando
Compras ganhar spec própria, a fatia migra para cá e este arquivo vira o índice dela.

## Onde o código mora

- **Rotas:** `server/routes/compras.js` — **30 rotas** `/api/compras/*` medidas hoje
  (`grep -cE "^app\.(get|post|put|patch|delete)\('/api/compras"`): as **23** extraídas de
  `server/index.js` na Etapa 38 (`be71754`) e montadas no harness
  (`server/tests/helpers/testApp.js`), as **6** portas novas de pedido da própria 38, e o
  **`PATCH /api/compras/pedidos/:id/status`** da Etapa 39 (`19ebf7d`).
  Antes da 38 **nenhum teste batia em `/api/compras`**.
  ⚠️ **Três rotas ficaram em `index.js` de propósito:** `/api/compras/solicitacoes-compra`
  (`:18465`, `:18500`, `:18525`). Elas operam `solicitacoes_compra`, tabela do **core**, que **não
  é** `solicitacoes_compra_almoxarifado` — juntá-las confundiria dois fluxos diferentes.
- **Serviço e schemas do pedido:** `server/services/compras/pedidoCompraService.js`,
  `server/services/compras/schemas.js` (os **primeiros Zod do módulo core**) e
  `server/services/compras/planilhaCompras.js`.
- **Telas:** `client/src/components/Compras.js` (as três abas) e
  `client/src/components/compras/PedidoCompraForm.js` (lazy, rotas `/compras/pedidos/novo` e
  `/compras/pedidos/editar/:id`).
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
| **Fornecedores** | ✅ | ❌ **sem tela de criação** — `/compras/fornecedores/novo` cai no `path="*"` e volta para a lista (as rotas de API existem) | ⚠️ genérico, **409** quando o fornecedor tem pedido (`59abaea`) |
| **Cotações** | ✅ | ❌ **sem tela de criação** — `/compras/cotacoes/nova` cai no `path="*"` | ⚠️ genérico |

**A Etapa 38 consertou UMA das três abas, e a Etapa 39 aprofundou a MESMA aba.** Cotações e
fornecedores seguem sem tela de criação — são **4 caminhos mortos** medidos (`/compras/fornecedores/
novo`, `/compras/cotacoes/nova` e os dois lápis de edição em `Compras.js`), e continuam sendo o
**próximo candidato declarado** ("tema B"), não pendência esquecida.

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
`requirePermission`**, inclusive as portas de **escrita** criadas na Etapa 38 e o
**`PATCH …/pedidos/:id/status`** da Etapa 39: quem tem o módulo `compras` cria, edita, importa,
muda status e apaga pedido, fornecedor e cotação. Acrescentar `ACAO_PERFIS` ao core exige decidir os
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
