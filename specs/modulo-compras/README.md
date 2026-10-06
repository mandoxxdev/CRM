# Módulo Compras (core) — índice da linha `main`

> **Status:** este módulo não tem spec própria por feature. Este arquivo é o **índice** do que foi
> especificado e entregue em `main`, etapa a etapa, com o ponteiro para o design e o plano de cada
> uma. Criado em 2026-10-06 no lote de outubro.
>
> ⚠️ A branch `desenvolvimento-almoxarifado` tem um `specs/modulo-compras/README.md` **diferente**,
> que descreve as Etapas 38–41 de lá (outro pedido de compra, fornecedor e cotação com tela). No merge
> os dois índices precisam virar um — ver B1 em `docs/compras-novidades-por-etapa.md`.

## Onde o código mora (em `main`)

- **Rotas:** `server/routes/compras/pedidos.js` (Etapa 32) e, desde a Etapa 34,
  `server/routes/compras/fornecedores.js`; o resto de `/api/compras/*` continua inline em
  `server/index.js` (fornecedores lista/foto/itens/planilha ~`:20333-20800`, grupos, cotações lista,
  solicitações de compra, e o `DELETE /:tipo/:id` genérico `:20395`).
- **Serviços:** `server/services/compras/{db,opcoesPedido,pedidoLeitura,pedidoTotais}.js`.
- **Telas:** `client/src/components/Compras.js` (abas Fornecedores/Pedidos/Cotações por sub-rota),
  `client/src/components/compras/PedidoCompraForm.js` (+`.css`), e desde a Etapa 34
  `client/src/components/compras/FornecedorForm.js` (+`.css`); `FornecedoresDoGrupo.js`,
  `GruposFornecedores.js`, `ItensFornecedor.js` (homologados).
- **Tabelas core (`index.js`):** `fornecedores`, `pedidos_compra`, `cotacoes`, `grupos_compras`,
  `itens_fornecedor`, `solicitacoes_compra`. `itens_pedido_compra` é criada em
  `server/services/almoxarifado/schema.js` (não é core).

## Mapa de etapas

| Etapa | Tema | Status | Design / plano |
|---|---|---|---|
| 32 | Pedido de compra: modelo, cálculo, rotas, formulário, lote | 🟢 (`e5f8087f..98f6fc9d`) | `docs/superpowers/specs/2026-09-11-compras-etapa32-pedido-de-compra-design.md` · plano `…plans/2026-09-11-compras-etapa32-pedido-de-compra.md` |
| 33 | A entrega é do pedido, não do item | 🟢 2026-10-06 (`75f378b4`, `9a7f9776`, `bc8da840`; merge `ca8a1364`) — `data_entrega` por item sai da tela, do `INSERT`, da leitura e do recebimento; a coluna fica no banco sem leitor | design do lote §3 · `…plans/2026-10-06-crm-etapa33-entrega-do-pedido.md` |
| 34 | Ficha do fornecedor: tela própria, 2 telefones, CNPJ/CEP, CSS | 🟢 2026-10-06 (`d151751c` rotas+coluna, `a294c3d4` CEP, `977c6022` tela, `25397815`; merge `891c960a`) — `server/routes/compras/fornecedores.js`, `server/routes/cep.js`, `FornecedorForm.js`, `utils/cnpj.js`; o "Remover do grupo" passou a remover | design do lote §4 · `…plans/2026-10-06-crm-etapa34-ficha-do-fornecedor.md` |
| 35 | Cadastro de material: unidades e classe ABC (tela do almoxarifado) | 🟢 2026-10-06 (`0e7c0a36`, `fba88f1d`) — só client + manual; candidato a cherry-pick para a branch do almoxarifado (B4) | design do lote §5 · `…plans/2026-10-06-crm-etapa35-material-unidades-e-abc.md` |
| 36 | Configurações com uma aba por módulo (`/configuracoes`; almoxarifado e produção embutidos; `Tabs` reutilizável) | 🟢 2026-10-07 (`724cbbdd` Tabs, `74c30cd4` Configuracoes, `127425bc` embedded; merges `2bec1eb9`, `a84d2121`) — zero linhas de servidor | design do lote §6 · `…plans/2026-10-06-crm-etapa36-configuracoes-por-modulo.md` |
| 37 | Categorias por família (árvore cadastrável em Configurações → Almoxarifado) | 🔴 espera a decisão **D-36a** (o modelo atual é família → categoria, o inverso do pedido) | design do lote §6 (original) |

Design do lote: `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`.
Documento de apresentação: `docs/compras-novidades-por-etapa.md`.

## O que ainda NÃO existe em Compras (`main`)

Tela de cotação (`/compras/cotacoes/nova` e `/editar/:id` são caminhos mortos — os de fornecedor
deixaram de ser na Etapa 34); itens de cotação;
conversão cotação → pedido; perfis de ação no core (só `checkModulePermission('compras')`);
paginação; projeção nomeada na lista de fornecedores (`SELECT *` carrega `planilha_dados`, G2).
