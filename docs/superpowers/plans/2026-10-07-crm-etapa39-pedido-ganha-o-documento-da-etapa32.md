# Etapa 39 (`main`) — o pedido de compra ganha o documento da Etapa 32

> Origem: no merge de 2026-10-07 (B18) o pedido de compra da branch (Etapas 38–41) venceu o da
> Etapa 32 da `main` — mas a 32 nasceu de requisito real: o PDF do ERP atual
> (`Matheus - TECNOPAR 28433`, form `TF_PEDCOMPRA`), **o documento que a GMP emite e o fornecedor
> recebe**. O que ela tinha e sumiu do código: 23 colunas de cabeçalho em `pedidos_compra`
> (condições comerciais, 5 totais, 9 de snapshot do fornecedor), 5 colunas por item (`item_numero`,
> `ncm`, `peso_unitario`, `ipi_percentual`, `observacao` — `data_entrega` por item NÃO volta,
> decisão da Etapa 33), a calculadora `pedidoTotais.js` (22 testes), as opções que aprendem com o
> uso (`opcoesPedido.js`), o snapshot fiscal (RN-06) e o painel do pedido no recebimento. A
> impressão do documento **nunca existiu** (task G2 da 32 ficou "a fazer") — não entra aqui, vira
> a Etapa 40.
> Fonte: design e plano da 32 (`docs/superpowers/{specs,plans}/2026-09-11-compras-etapa32-*`),
> código em `b3abc723:` (último commit da `main` antes do merge). Medição completa em
> `.superpowers`-like no scratchpad desta sessão; o resumo está na seção "Fase 0" abaixo.
> Baseline (`07f4d2b6`): `test:api` 294/294; client 84 suítes / 1309 testes; build limpo.

## Fase 0 — o que o pedido atual tem e o que a 32 tinha (medido)

| | Pedido atual (`pedidoCompraService.js`, `routes/compras.js`, `PedidoCompraForm.js`) | Etapa 32 (`b3abc723`) |
|---|---|---|
| Cabeçalho | `fornecedor_id, data_pedido, previsao_entrega, status, observacoes`; número **gerado** `PC-…` | + 9 complementares (`condicao_pagamento, frete_modalidade, transportadora, transportadora_telefone, via_transporte, tabela_preco, contato, local_entrega, local_cobranca`), 5 totais, 9 `snap_fornecedor_*`; número **digitado** |
| Item | `material_id, quantidade, valor_unitario` (+ `codigo/descricao/unidade` copiados do material) | + `item_numero, ncm, peso_unitario, ipi_percentual, observacao` (+ `data_entrega`, descartada) |
| Conta | `valor_total = Σ qtd × unit`, sem arredondar, sem IPI | `pedidoTotais.js`: `valor_linha = arred2(qtd×unit)`, `ipi_linha = arred2(valor_linha×ipi/100)`, `total_geral = produtos + ipi + icms_st + frete − desconto`; `valor_total` espelha `total_geral` (RN-10) |
| Fornecedor | `fornecedor_nome` via JOIN vivo | snapshot de 9 colunas gravado no POST (RN-06); leitura resolve snapshot × vivo |
| Opções | — | `GET /pedidos-aux/opcoes`: listas fixas (6 modalidades de frete SEFAZ, 14 condições, 5 vias, 14 unidades, IPI sugerido) **unidas** ao `DISTINCT` do que já foi usado (o que você digita em "Outro" vira botão) + dados da empresa |
| Prévia | total local no form | `POST /pedidos/calcular` (RN-14: o navegador não refaz a conta) |
| Recebimento | lista de pedidos + itens com saldo pendente (**sem preço**, Etapa 42, de propósito) | painel com fornecedor fiscal, condições, itens com NCM/preço, 6 totais e a nota "a baixa lança sem IPI" (RN-11) |
| Regras que FICAM do atual | número gerado; enum de 7 status; status automático pelo recebimento (`recebido`/reabre); PUT bloqueado após recebimento; DELETE bloqueado por recebimento e libera solicitação/cotação; `solicitacao_id` e `gerar-pedido` da cotação; importação por planilha | (as da 32 nesses pontos — número digitado, 4 status, 409 por `finalizado` — **não** voltam: B19) |

## Decisões (reversíveis; B19–B22 no doc de novidades)

- **B19** As regras de ciclo de vida são as do pedido atual (número gerado, status, bloqueios).
  O que volta da 32 é o **conteúdo do documento** e a **conta**. Descartado: número digitado
  (o recebimento, a cotação e a importação já geram `PC-…`).
- **B20** As colunas voltam **com os mesmos nomes** da 32 (produção já as tem fisicamente): em
  `pedidos_compra`, `ALTERS` no callback do `CREATE` (padrão G6); em `itens_pedido_compra`, `safeAlter`
  em `schema.js` (chega ao harness sem stub). `data_entrega` por item **não** volta (Etapa 33).
- **B21** Snapshot do fornecedor: gravado no POST **e reescrito no PUT quando `fornecedor_id`
  muda** (a 32 nunca reescrevia — um pedido editado para outro fornecedor imprimiria o fiscal do
  antigo). `celular` entra no snapshot (`snap_fornecedor_celular`, coluna nova).
- **B22** O painel do recebimento mostra **condições e fornecedor**, **não preços nem totais** —
  mantém a decisão da Etapa 42 (preço não aparece para quem recebe). A nota RN-11 ("a baixa é por
  quantidade, sem IPI") fica no manual, não na tela.
- `pedidoTotais.js` volta **igual**, com os 22 testes (é a conta do documento real, provada).
- `opcoesPedido.js` volta como `GET /api/compras/pedidos-aux/opcoes` dentro de `routes/compras.js`
  (sem `proximo_numero`, que era do número digitado).

## Regras (`grep RN-39`)

- **RN-39.01** `POST`/`PUT /api/compras/pedidos` aceitam no cabeçalho os 9 complementares e os 3
  encargos (`total_icms_st`, `valor_frete`, `total_desconto`), todos opcionais; e por item
  `ipi_percentual` (0 por padrão), `ncm` e `peso_unitario` (`''`/`null`/ausente → **os do
  material**; só valor preenchido sobrescreve), `observacao`. `item_numero` é a posição (1..n),
  **atribuída pelo servidor** — nunca aceita do payload.
- **RN-39.02** A conta é a de `pedidoTotais.js` (RN-03/04/05 da 32): `valor_linha`, `ipi_linha`
  arredondados por linha; `total_produtos`, `total_ipi`, encargos arredondados; `total_geral`;
  **`valor_total` = `total_geral`** (RN-10). ⚠️ Revisão do plano: os leitores reais de
  `valor_total` são **só** `Compras.js` (lista `:421` e export `:246`) — o alerta de atraso projeta
  colunas nomeadas, o aux do recebimento não traz valor, a cotação não relê. Pedido criado pela
  cotação ou pela importação entra com IPI 0 e encargos 0 → `valor_total` **igual até o centavo**
  ao de hoje (hoje é soma crua; o novo arredonda por linha — muda só além da 2ª casa, ex.
  `49 × 0.1063`); o teste de não-regressão usa tolerância `< 0.005` **e** um caso de 4 casas como
  controle positivo (com inteiros ele não sabe falhar). **A cotação passa a usar a mesma conta:**
  `cotacaoService.somaItens` → `calcularTotaisPedido(resolvidos).totais.total_produtos` (hoje
  arredonda a soma; com preço de 4 casas cotação e pedido gerado divergiam em centavos e nenhum
  teste cruzava os dois — teste novo compara `cotacoes.valor_total` com o `valor_total` do pedido
  gerado usando `1 × 1.005` × 2).
- **RN-39.03** `GET /api/compras/pedidos/:id` devolve, além do que já devolve (**`fornecedor_nome`
  e `teve_recebimento` continuam** — são contrato afirmado em `comprasPedidoEditarExcluir:194`,
  `comprasPedidoStatus:171-202` e lidos por `PedidoCompraForm.js:200`; as 10 colunas cruas
  `snap_fornecedor_*` **não** saem na resposta): `itens[].{item_numero,
  ncm, peso_unitario, ipi_percentual, observacao, valor_linha, ipi_linha}`, `totais{total_produtos,
  total_ipi, total_icms_st, total_desconto, valor_frete, total_geral}` e `fornecedor{nome, cnpj,
  ie, endereco, municipio, uf, cep, telefone, celular, email, origem:'snapshot'|'cadastro'}`.
- **RN-39.04** Snapshot (B21): 10 colunas `snap_fornecedor_*` gravadas **no serviço** (`criarPedido`
  — assim cotação e importação também ganham snapshot; a 32 gravava na rota) a partir de
  `fornecedores`; no PUT (`atualizarPedido` passa a ler o `fornecedor_id` atual), reescritas se
  `fornecedor_id` mudou **ou se o snapshot está nulo** (pedido legado editado deixa de ficar
  `cadastro` para sempre); renomear o fornecedor não altera o pedido; pedido anterior à etapa não
  editado cai no cadastro vivo com `origem:'cadastro'`. Fornecedor inativo entra (D5 da 40) e o
  snapshot é exatamente o que preserva o fiscal dele.
- **RN-39.05** `POST /api/compras/pedidos/calcular` (corpo `{itens, total_icms_st, valor_frete,
  total_desconto}`) devolve `{itens, totais}` sem gravar; lista vazia devolve zeros. **É calculadora,
  não porta de gravação:** schema **tolerante** próprio (`quantidade ≥ 0`, `material_id` opcional,
  números inválidos viram 0) — só `ipi_percentual` fora de 0–100 recusa. (A 32 deixou sem validação
  de propósito; com o Zod de gravação, limpar o campo quantidade para digitar outro número daria 400
  a cada tecla no debounce do form.)
- **RN-39.06** `GET /api/compras/pedidos-aux/opcoes` devolve `frete_modalidades`,
  `condicoes_pagamento`, `vias_transporte`, `unidades`, `ipi_sugerido`, `transportadoras`,
  `tabelas_preco`, `empresa` — fixas ∪ `DISTINCT` do uso (LIMIT 40).
- **RN-39.07** Form do pedido: seção **"3. Condições"** (chips com "Outro" para condição,
  frete, via; transportadora + telefone; tabela de preço; contato; entregar em; cobrar em), na
  linha do item **IPI %** (chips `ipi_sugerido` + "Outro"), NCM e peso preenchidos do material e
  editáveis, observação do item; bloco **"Total"** com frete, desconto, ICMS-ST e os 6 totais vindos
  de `/calcular` (debounce 300 ms; o navegador não soma). Edição mostra o que está gravado.
- **RN-39.08** Painel do recebimento contra pedido (`RecebimentosAlmoxarifado.js`) mostra o bloco
  **Fornecedor** (nome, CNPJ, IE, telefone, e-mail, endereço) e **Condições** (pagamento, frete,
  transportadora, via, contato, local de entrega) — **sem preço, sem totais e sem `observacoes`**
  (B22/B23: as rotas `-aux` têm o gate do módulo, que alcança PRODUCAO/CONSULTA — a Etapa 42 tirou
  o preço daí por isso, e `alertRegistry.js:751-760` classifica `observacoes` do pedido como
  negociação com fornecedor, mesma classe). Fonte: `GET /recebimentos-aux/pedidos-compra/:id`
  (**feita na T1**, em `extended.js`, registrada depois de `/:id/itens`, mesmo gate das outras
  `-aux`; projeção vem de `pedidoCompraService.lerPedidoParaRecebimento(db, id)` — implementador
  único da resolução snapshot × cadastro). No client, o GET entra sob o mesmo `pedidoSeqRef` de
  `selecionarPedido` (`:644-646`) e falha **sem** derrubar o recebimento.
- **RN-39.09** O recebimento continua por quantidade; custo médio continua pelo `valor_unitario`
  (sem IPI) — RN-11 da 32 vale e é afirmada em teste.

## Contratos (congelados — detalhes de shape na seção RN)

| Rota | Corpo / resposta | Erros |
|---|---|---|
| `POST`/`PUT /api/compras/pedidos` | cabeçalho + encargos + `itens[]` ampliados (Zod: `PedidoCompraCreateSchema` ganha as chaves, todas opcionais; `ipi_percentual` 0–100, `peso_unitario` ≥ 0, `ncm` string ≤ 10) | os de hoje; IPI fora de 0–100 → 400 "ipi_percentual deve estar entre 0 e 100" |
| `GET /api/compras/pedidos/:id` | + `itens[]` derivados, `totais`, `fornecedor` | — |
| `GET /api/compras/pedidos` (lista) | + `total_geral` (= `valor_total`), `total_itens` | — |
| `POST /api/compras/pedidos/calcular` | `{itens, total_icms_st?, valor_frete?, total_desconto?}` → `{itens, totais}` | 400 Zod |
| `GET /api/compras/pedidos-aux/opcoes` | objeto RN-39.06 | — |
| `GET /api/almoxarifado/recebimentos-aux/pedidos-compra/:id` | `{id, numero, status, data_pedido, previsao_entrega, fornecedor{…}, condicoes{…}, observacoes}` — **sem** itens/valores | 404 literal existente |

## Tasks

**T1 — tronco (servidor):** schema (ALTERs `pedidos_compra` no callback do CREATE + `safeAlter` de
5 colunas em `itens_pedido_compra` + stub do harness), `services/compras/pedidoTotais.js` restaurado
de `b3abc723` **com** `server/tests/pedidoTotais.test.js` (22 casos, verdes de primeira = esperado,
é código provado; controle positivo: sabotar `arred2`), `opcoesPedido.js` restaurado sem
`proximo_numero`, `pedidoCompraService` (RN-39.01/02/04: `resolverItens` com NCM/peso do material,
`criarPedido`/`atualizarPedido` gravando colunas + snapshot + totais, `relerPedido` com derivados/
totais/fornecedor), `schemas.js` (Zod), `routes/compras.js` (`/calcular`, `/pedidos-aux/opcoes`).
Testes: `comprasPedidoDocumento.api.test.js` (novo, portando os cenários **[P]** da 32: seis
totais, complementares, derivados por item, RN-10, snapshot/renomear/legado, `calcular` ×3 +
invariante de 40 pedidos, RN-11 com o recebimento real) e não-regressão: `comprasPedidoCriar`,
`comprasCotacaoGerarPedido`, `comprasPedidoImportar`, `recebimentoContraPedidoIntegracao`,
`comprasPedidoAtraso` continuam verdes (o `valor_total` de pedido sem IPI/encargos é o mesmo).
**T1 (continuação):** a rota `GET /almoxarifado/recebimentos-aux/pedidos-compra/:id` e
`lerPedidoParaRecebimento` também são da T1 (revisão: T3 não pode criar colunas nem um segundo
resolvedor de snapshot). Cenário de teste: PRODUCAO vê condições e fornecedor, **não** vê
`valor_unitario`, `totais` nem `observacoes`. `/opcoes.empresa`: o harness não cria a tabela
`configuracoes` core — o teste cria a tabela localmente ou afirma o fallback, senão prova nada.
**T2 — galho (client, form):** RN-39.07 em `PedidoCompraForm.js` + `PedidoCompraForm.test.js`
(cenários: opções carregadas em chips; "Outro" vira valor; IPI por item; NCM/peso do material;
`/calcular` chamado com debounce e totais exibidos; POST com as chaves novas; edição carrega;
importação por planilha continua). Mock do `api` na fronteira.
**T3 — galho (client puro, almoxarifado):** RN-39.08 — painel em `RecebimentosAlmoxarifado.js` +
teste, contra o contrato da rota (mock do `api` por URL — o mock de `:275` faz fall-through, então
precisa do ramo novo; sem ele `res.data` lança e o painel tem de falhar sem derrubar a tela).
**T4 — integração/fechamento:** suíte inteira; `docs/compras-novidades-por-etapa.md` (seção 39 +
B19–B22); `specs/modulo-compras/README.md`; manual (seção do pedido: o que o documento tem, RN-11);
retro. **Próxima (Etapa 40):** `GET /pedidos/:id/impressao` — o documento em PDF/HTML no formato do
ERP (a task que a 32 deixou "a fazer").

## Pontos de atenção
- `valor_total`: leitores reais só `Compras.js` (lista/export). ~~alertRegistry, cotacaoService,
  pedidoCompraSaldoSql~~ — a primeira versão deste plano estava errada (corrigida pela revisão).
  Export (`Compras.js:246`): "Valor Total" passa a incluir IPI/frete, repetido em cada linha de
  item, e a reimportação ignora a coluna → declarar no guia (G13); coluna "IPI %" no export fica
  para depois.
- Ordem de registro: não há `GET /api/compras/:x/:y` genérico em HEAD; registrar `/calcular` e
  `/pedidos-aux/opcoes` no bloco de pedido acima do `DELETE /:tipo/:id` (`routes/compras.js:394`)
  só para honrar o comentário de `:189-197`.
- `resolverItens` é reusada pela **cotação** (`cotacaoService.js:~1079`): os campos novos têm de
  ser opcionais e o default (NCM/peso do material, IPI 0) não pode quebrar `itens_cotacao` (que
  não tem essas colunas — o INSERT da cotação lista colunas explicitamente; conferir).
- Importação por planilha (`planilhaCompras.js`): pode ganhar colunas `ipi`, `ncm` opcionais —
  **não** nesta etapa (declarar).
- Harness: `testApp.js` stuba `pedidos_compra` com as 10 colunas do DDL — ganhar as 24 (23 + celular).
- `recebimentos-aux/pedidos-compra/:id` **não** existe hoje (a 32 tinha; sumiu) — nome livre, mas
  manter o padrão `-aux` e o gate `checkModulePermission('almoxarifado')`.
- Ordem das linhas: hoje `ORDER BY id`; com `item_numero` gravado, `ORDER BY item_numero, id`.

## Retro (preencher no fechamento)
- Rodadas de correção até verde: _preencher_
- Achados da revisão: _preencher_ (reais vs. ruído)
- Paralelismo: _preencher_
- Defeito escapado: preencher na etapa seguinte.
