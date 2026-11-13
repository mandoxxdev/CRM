# Etapa 214 (Compras) — histórico de preços por fornecedor no material

> Pedido da compradora (12/11/2026, `specs/modulo-almoxarifado/01-cadastros-materiais/pedido-2026-11-12/`, img2, recurso 4:
> "histórico de preços cotados e comprados por fornecedor"). Estimativa
> `docs/estimativas/2026-11/estimativa_2026-11-12_cadastro-de-material-fornecedores.md`, item 4 (2h30). Fila do Compras, linha 6.

## Medido antes (Fase 0)

- O preço **cotado** mora em `itens_cotacao.valor_unitario` (cabeçalho `cotacoes`: `fornecedor_id`, `numero`, `data_cotacao`,
  `status`); o **comprado** em `itens_pedido_compra.valor_unitario` (cabeçalho `pedidos_compra`: `fornecedor_id`, `numero`,
  `data_pedido`, `status`). As duas linhas têm `material_id`.
- O preço do vínculo (`itens_fornecedor.preco`, Etapa 212) guarda só o último, digitado à mão.
- Status que não são preço praticado: cotação `cancelado` (a exclusão marca antes de apagar); pedido `cancelado` e `rejeitado`.

## Decisão de desenho (letra B)

**Escolhido:** o histórico é **leitura** das linhas de cotação e de pedido do material, sem tabela nova — é o preço que de fato foi
cotado e comprado, com o número do documento. **Descartado:** gravar cada mudança do preço do vínculo (seria preço digitado, não
cotado nem comprado, e não traria o que já existe). Cotação rejeitada **entra** (foi preço cotado), com o status à vista.

## Regras de negócio

- **RN-214.01** — `GET /api/compras/materiais/cadastro/:id/historico-precos` (porta `portaCompras.leitura`, a mesma da seção) devolve
  as linhas do material, da mais recente para a mais antiga (data do documento, depois id), no máximo 100:
  `[{ origem: 'cotacao'|'pedido', documento_id, numero, data, status, fornecedor_id, fornecedor_nome, quantidade, unidade,
  valor_unitario }]`. Material inexistente: 404 `Material não encontrado`.
- **RN-214.02** — Fica de fora: cotação `cancelado`; pedido `cancelado` ou `rejeitado`.
- **RN-214.03** — Na seção Fornecedores deste material, abaixo da lista, o quadro **Histórico de preços**: Data, Fornecedor,
  Origem (Cotação/Pedido + número), Quantidade, Preço unitário; filtro por fornecedor. Sem linhas:
  *"Nenhum preço cotado ou comprado para este material ainda."*

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | Serviço `historicoDePrecos` + rota; teste `historicoDePrecos.api.test.js` com controle positivo | tronco | — |
| T2 | Tela: quadro no `FornecedoresDoMaterial`; teste | galho | — |
| T3 | Integração: cotar → gerar pedido → o histórico tem as duas linhas (no teste da T1) | integração | — |
| T4 | Fechamento | — | — |

## Próxima tarefa detalhada

Retomar a Etapa 211 (famílias no Compras) do branch `etapa-211-familias-no-compras-wip`.
