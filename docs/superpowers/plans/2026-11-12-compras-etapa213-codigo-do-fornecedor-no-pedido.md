# Etapa 213 (Compras) — o código do fornecedor na cotação e no pedido de compra

> Pedido da compradora (12/11/2026, `specs/modulo-almoxarifado/01-cadastros-materiais/pedido-2026-11-12/`, img1 e img5).
> Estimativa `docs/estimativas/2026-11/estimativa_2026-11-12_cadastro-de-material-fornecedores.md`, item 3 (3h). Fila do Compras,
> linha 5. Consome o vínculo da Etapa 212 (`itens_fornecedor.material_id`).

## Medido antes (Fase 0)

- `itens_pedido_compra` e `itens_cotacao` (`services/almoxarifado/schema.js:2097` e `:2150`) já têm `material_id`; o fornecedor
  é do cabeçalho (`pedidos_compra.fornecedor_id`, `cotacoes.fornecedor_id`). Nenhuma das duas guarda o código do fornecedor.
- As duas gravam pelas linhas resolvidas em `pedidoCompraService.resolverItens` (a cotação importa a mesma função). O pedido
  gerado da cotação passa por `criarPedido`, que resolve de novo.
- O impresso monta a linha em `pedidoDocumentoHtml.linhaItem` (coluna "Material" = código GMP).
- As telas (`PedidoCompraForm.js`, `CotacaoForm.js`) mostram o código GMP na coluna "Código". A leitura do catálogo do fornecedor
  (`GET /api/compras/fornecedores/:id/itens`, porta do módulo Compras, já traz `material_id`) serve à tela sem rota nova.

## Decisão de desenho (letra B)

**Escolhido:** coluna `codigo_fornecedor` nas duas tabelas de linha, preenchida pelo servidor ao salvar, a partir do vínculo
(material, fornecedor do cabeçalho). É **foto** do momento em que a linha foi salva: o pedido impresso continua dizendo o código
com que foi emitido, mesmo se o vínculo mudar depois; editar e salvar o pedido refaz a foto. **Descartado:** ler o vínculo ao
vivo na leitura do pedido — um pedido antigo mudaria de código sozinho; e campo digitável por linha — o código já é cadastrado
no material, digitar de novo abriria divergência (fica para quando a compradora pedir).

## Regras de negócio

- **RN-213.01** — Ao salvar cotação ou pedido, cada linha cujo material tem vínculo com o fornecedor do cabeçalho grava
  `codigo_fornecedor` = o código do vínculo; sem vínculo (ou vínculo sem código), `NULL`. Trocar o fornecedor e salvar refaz.
- **RN-213.02** — A leitura do pedido e da cotação devolve `codigo_fornecedor` por linha; o pedido gerado da cotação resolve
  de novo (mesmo fornecedor, mesmo resultado).
- **RN-213.03** — O impresso do pedido mostra, na coluna Material, abaixo do código GMP, `Cód. fornecedor: <código>` quando há.
  O código GMP continua o principal.
- **RN-213.04** — As telas de pedido e cotação mostram, na coluna Código, abaixo do código GMP, `Forn.: <código>` (lido do
  catálogo do fornecedor escolhido; muda ao trocar o fornecedor).

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T1 | Servidor: colunas, `resolverItens(db, itens, fornecedorId)`, INSERTs e leituras; impresso; teste `codigoFornecedorNoPedido.api.test.js` com controle positivo | tronco | feita `86ab0eb4` (4/4; 4 sabotagens vermelhas; o teste de colunas da 37 passa a contar 16 e o banco só-core do teste de FK ganha a coluna e o catálogo) |
| T2 | Telas: coluna Código com `Forn.:` no pedido e na cotação; testes | galho | feita `7a8e6f5b` (`codigosDoFornecedor` 3/3; 2 sabotagens vermelhas, 1 inalcançável — abaixo) |
| T3 | Integração: vincular no material → cotação → gerar pedido → impresso traz o código (cenário pela rota, no teste da T1) | integração | feita em `86ab0eb4` (cenário [RN-213.02/03 integracao]) |
| T4 | Fechamento | — | feito (este commit) |

## Execução (2026-11-12)

- **Fase 2 não despachada:** etapa pequena (duas colunas e uma célula), sobre contrato que a 212 acabou de revisar; o risco que
  ela pegaria (o comprador comum não alcança a porta do cadastro) foi resolvido no desenho: a tela lê o catálogo do fornecedor, porta
  do módulo Compras. Registrado como divergência do processo.
- **Controle positivo:** servidor — ignorar o fornecedor, impresso sem o código, cotação sem gravar e leitura ao vivo no lugar da foto:
  4 vermelhos no cenário certo. Tela — ignorar o catálogo e não refazer ao trocar o fornecedor: 2 vermelhos. A guarda "código em branco
  não vira linha" **não derruba nada porque é inalcançável** (o `trim` já faz o código virar `''`, que a célula ignora); mantida.
- **A ligação da célula nos dois formulários** (`PedidoCompraForm`, `CotacaoForm`) não tem teste próprio: os testes dos formulários
  (79 com o novo) passam e o build compila; a prova visual fica no roteiro manual.
- **Verificação (medida, em `7a8e6f5b`):** `test:api` 606/606 arquivos, `test:almoxarifado` 44/0, validation 4/0, safealter 3/0,
  sqlite 16/0, build OK. Da tela rodaram só as suítes tocadas (`codigosDoFornecedor`, `CotacaoForm`, `PedidoCompraForm`: 79/79); a
  suíte inteira da tela não rodou (falta de memória na rodada anterior) — fica pendente, junto com a da 212.

## Retro (4 números)

- Rodadas de correção até verde: 1 (dois testes antigos que contavam colunas / montavam o banco à mão).
- Achados: sem revisão adversarial (etapa pequena); 0.
- Paralelismo: nenhum.
- Defeito que escapou da 212: nenhum achado até aqui.

## Próxima tarefa detalhada

Fila do Compras, linha 6: **histórico de preços por fornecedor** (estimativa de 12/11, item 4, 2h30). O preço atual mora na linha
do vínculo (`itens_fornecedor.preco`, Etapa 212) e só guarda o último. Medir antes: onde nasce o preço cotado (`itens_cotacao.valor_unitario`)
e o comprado (`itens_pedido_compra.valor_unitario`, com `pedidos_compra.fornecedor_id` e `data_pedido`) — o histórico pode ser
**leitura** dessas linhas por (material, fornecedor), sem tabela nova; mostrar na seção Fornecedores deste material (porta
`portaCompras.leitura`). Ponto de atenção: o pedido cancelado não conta como comprado.
