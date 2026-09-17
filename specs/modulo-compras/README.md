# Módulo Compras (core) — índice mínimo

> **Status:** este módulo **não tem spec própria**, e a ausência é decisão, não esquecimento
> (decisão 11 do design da Etapa 38 / **B105**, reversível). A fatia dele que foi especificada e
> entregue — **a criação do pedido de compra** — vive em
> [`specs/modulo-almoxarifado/22-integracoes/README.md`](../modulo-almoxarifado/22-integracoes/README.md)
> como **"fatia Compras"**, porque foi ali que o elo quebrado apareceu (a reposição gerava
> solicitações que ninguém convertia em pedido, e o recebimento contra pedido da Etapa 37 era
> inerte).
> **Última atualização:** 2026-09-16 — criado no fechamento da **Etapa 38** (`be71754..0a7e5c6`).

**Descartado ao criar este arquivo:** montar `specs/modulo-compras/` completo (estrutura nova sem
dono, dentro de uma etapa) e escrever a tela de Compras como feature do almoxarifado sem dizer
(mentira estrutural — o erro que o `CLAUDE.md` nomeia como o mais caro). **Reversível:** quando
Compras ganhar spec própria, a fatia migra para cá e este arquivo vira o índice dela.

## Onde o código mora

- **Rotas:** `server/routes/compras.js` — **23 rotas** `/api/compras/*`, extraídas de
  `server/index.js` na Etapa 38 (`be71754`) e montadas no harness (`server/tests/helpers/testApp.js`).
  Antes disso **nenhum teste batia em `/api/compras`**.
  ⚠️ **Três rotas ficaram em `index.js` de propósito:** `/api/compras/solicitacoes-compra`
  (`:18465`, `:18500`, `:18525`). Elas operam `solicitacoes_compra`, tabela do **core**, que **não
  é** `solicitacoes_compra_almoxarifado` — juntá-las confundiria dois fluxos diferentes.
- **Serviço e schemas do pedido:** `server/services/compras/pedidoCompraService.js`,
  `server/services/compras/schemas.js` (os **primeiros Zod do módulo core**) e
  `server/services/compras/planilhaCompras.js`.
- **Telas:** `client/src/components/Compras.js` (as três abas) e
  `client/src/components/PedidoCompraForm.js` (lazy, rotas `/compras/pedidos/novo` e
  `/compras/pedidos/editar/:id`).
- **Tabelas:** `pedidos_compra`, `cotacoes`, `fornecedores` e afins são do core; mas
  **`itens_pedido_compra` NÃO é** — o `CREATE TABLE` está em
  `server/services/almoxarifado/schema.js:1311` (o design da Etapa 37 dizia o contrário, e
  **estava errado**).

## As três abas — o que cada uma faz, e o que NÃO faz

| Aba | Lista | Cria / edita | Apaga |
|---|---|---|---|
| **Pedidos** | ✅ `GET /api/compras/pedidos` | ✅ **desde a Etapa 38**: formulário + importação por planilha, `PUT` enquanto nenhum recebimento tocou o pedido | ✅ rota própria, 409 se já houve recebimento, e **libera** a solicitação da reposição |
| **Fornecedores** | ✅ | ❌ **sem tela de criação** — `/compras/fornecedores/novo` cai no `path="*"` e volta para a lista (as rotas de API existem) | ⚠️ genérico, **409** quando o fornecedor tem pedido (`59abaea`) |
| **Cotações** | ✅ | ❌ **sem tela de criação** — `/compras/cotacoes/nova` cai no `path="*"` | ⚠️ genérico |

**A Etapa 38 consertou UMA das três abas.** Cotações e fornecedores seguem sem tela de criação, e
isso é corte declarado de escopo, não pendência esquecida.

## Autorização — UMA camada, e isso é declarado

Todas as 23 rotas têm `authenticateToken` + `checkModulePermission('compras')` e **nenhum
`requirePermission`**, inclusive as portas de **escrita** criadas na Etapa 38: quem tem o módulo
`compras` cria, edita, importa e apaga pedido, fornecedor e cotação. Acrescentar `ACAO_PERFIS` ao
core exige decidir os perfis do módulo inteiro e é **etapa própria** (B101).

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
