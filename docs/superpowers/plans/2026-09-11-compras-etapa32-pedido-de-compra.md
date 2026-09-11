# Etapa 32 — Pedido de Compra

> Design: [2026-09-11-compras-etapa32-pedido-de-compra-design.md](../specs/2026-09-11-compras-etapa32-pedido-de-compra-design.md)
> Estado: **em execução** (iniciada 2026-09-11)
> **Revisado na Fase 2 — 16 achados, 6 bloqueantes.** Este plano é a v2, já corrigida. O que a
> revisão pegou está no fim, em "O que a Fase 2 evitou".

## Regras de negócio

**RN-01 — O número do pedido é digitado e é único. Vale para POST e PUT.**
Vazio → 400 `"Informe o número do pedido"`. Repetido → 400
`"Já existe um pedido de compra com este número"`. Detecção por `SELECT` prévio
(`WHERE numero = ? AND id != ?`), **não** por captura de `UNIQUE constraint`.
Sem geração automática (D1) — `numeroDoc.js:44-52` proíbe embrulhar este número.
*Cenário:* POST `28433` → 201; POST `28433` de novo → 400 literal; PUT do pedido A com o número
do pedido B → 400 literal; PUT do pedido A com o próprio número → 200.

**RN-02 — Pedido exige fornecedor e ao menos um item.**
Sem fornecedor → 400 `"Selecione o fornecedor"`. Sem itens → 400
`"Adicione ao menos um item ao pedido"`.

**RN-09 — Todo item de pedido aponta para um material cadastrado.**
`material_id` é **obrigatório**. Ausente → 400 `"Item sem material: selecione o material do cadastro"`.
*Por quê:* `receiptService.js:85` faz `.filter((i) => i.material_id)` — item sem material some da
carga do recebimento e o fluxo morre em `"Inclua ao menos um item"` (`receiptService.js:126`),
longe daqui e sem explicação.
*Cenário:* POST com item sem `material_id` → 400 literal; com material → 201 e
`carregarItensPedidoCompra` devolve o item.

**RN-03 — O valor de cada linha é derivado, nunca recebido.**
`valor_linha = arred2(quantidade × valor_unitario)`. Campo enviado pelo cliente é ignorado.

**RN-04 — O IPI da linha sai do percentual.**
`ipi_linha = arred2(valor_linha × ipi_percentual / 100)`.

**RN-05 — Fórmula congelada dos totais (ordem de arredondamento é normativa).**
```
arred2(x)       = Math.round(x * 100) / 100
valor_linha_i   = arred2(quantidade_i * valor_unitario_i)
ipi_linha_i     = arred2(valor_linha_i * ipi_percentual_i / 100)
total_produtos  = arred2(Σ valor_linha_i)        // soma das linhas JÁ arredondadas
total_ipi       = arred2(Σ ipi_linha_i)
total_geral     = arred2(total_produtos + total_ipi + total_icms_st + valor_frete - total_desconto)
```
**Σ das linhas já arredondadas**, não arredondamento da soma bruta — é o que reproduz o documento
real.

**RN-12 — O preço unitário guarda 4 casas; o documento imprime 3.**
Medido contra o pedido 28433: com os unitários de **3 casas** que o PDF imprime, **6 das 24
linhas divergem do próprio ERP, e para os dois lados** — o que exclui truncamento. A linha 13
prova: `49 × 0,106 = 5,194`, mas o ERP imprimiu `5,21`; `5,21 ÷ 49 = 0,10633`. Reconstruindo com
4 casas (`0,1063`), fecha — e o mesmo vale para as outras cinco (`0,7985`, `0,2824`, `0,0453`,
`0,0381`, `1,1905`).
Portanto: `valor_unitario` é gravado com a precisão que o comprador digitar (mínimo 4 casas), a
**exibição** arredonda para 3, e a linha é calculada do valor **gravado**, nunca do exibido.
A tela **não pode** arredondar o unitário ao salvar — seria centavo de diferença em todo pedido,
contra a nota fiscal do fornecedor.
*Cenário:* item `49 × 0,1063` → linha `5,21` (igual ao ERP). Item `49 × 0,106` → linha `5,19`
(correto para o dado informado — a divergência é do dado, não da fórmula).

**Alvo de aceitação corrigido:** não é "reproduzir 368,27 a partir do PDF" — isso é impossível
por construção, porque o PDF perdeu a 4ª casa. É: (a) a fórmula bate linha a linha quando recebe
a precisão real; (b) os invariantes da RN-05 valem para qualquer entrada.
**Um só implementador:** `services/compras/pedidoTotais.js`. A lista, o GET `:id`, a impressão e a
tela **consomem** essa função. A tela pode recalcular ao vivo **com a mesma função** (o arquivo é
importável pelo client) — nunca com fórmula própria.

**RN-06 — Dados fiscais do fornecedor congelados na criação, com prefixo `snap_`.**
Colunas `snap_fornecedor_nome`, `snap_fornecedor_cnpj`, `snap_fornecedor_ie`,
`snap_fornecedor_endereco`, `snap_fornecedor_municipio`, `snap_fornecedor_uf`,
`snap_fornecedor_cep`, `snap_fornecedor_telefone`, `snap_fornecedor_email`.
**O prefixo é obrigatório:** `receiptService.js:90-91,94-95,802-803` faz
`SELECT p.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj`; colunas com esses
nomes em `pedidos_compra` seriam sobrescritas pelo alias do JOIN na mesma linha, em silêncio.
Snapshot nulo (pedido antigo, D4) → **o GET `:id` resolve o fallback para o JOIN vivo**, não a
impressão. G2 recebe o bloco `fornecedor` já pronto e não decide nada.
*Cenário:* criar pedido; renomear o fornecedor; GET `:id` → nome antigo. E **cenário de fronteira
declarado:** criar recebimento a partir do pedido → o recebimento carimba o nome **NOVO** (JOIN
vivo, comportamento atual, ver RN-11).

**RN-07 — Status: enum fechado; finalizado/cancelado não aceita alteração.**
Enum congelado, minúsculo: `pendente` (default), `aprovado`, `finalizado`, `cancelado`.
Comparação case-insensitive na leitura (a base grava `'ABERTO'` em outro caminho,
`tests/api/reposicaoJornada.api.test.js:61`), gravação sempre minúscula.
PUT em pedido `finalizado`/`cancelado` → 409 `"Pedido finalizado não pode ser alterado"`.
**A transição é de T3**, via `PUT /:id/status`; G1 só oferece o botão.
Os quatro valores entram no filtro de `Compras.js`.

**RN-08 — Pedido com recebimento vinculado não pode ser excluído.**
Vínculo por **duas** colunas — `recebimentos_material_almoxarifado.pedido_compra_id`
(`schema.js:1094`) **ou** `pedido_compra_numero` (`schema.js:1231`), porque a segunda é gravada
mesmo com a primeira nula (`receiptService.js:139`, quando `tipo_recebimento = 'NOTA_FISCAL'`).
`WHERE pedido_compra_id = ? OR pedido_compra_numero = ?` → 409
`"Pedido já tem recebimento lançado e não pode ser excluído"`.
**Solicitação vinculada:** `solicitacoes_compra_almoxarifado.pedido_compra_id` (`schema.js:1744`)
apontando para o pedido também **bloqueia** (mesmo 409) — senão a solicitação fica `VINCULADO`
para sempre, já que `fecharSolicitacoesDoPedido` (`receiptService.js:709`) nunca mais roda.
*Cenário:* pedido com itens e sem vínculo → 200 **e os itens somem**; com recebimento → 409; com
solicitação vinculada → 409.

**RN-10 — `valor_total` continua sendo escrito, como espelho de `total_geral`.**
A coluna é lida por três consumidores fora desta etapa: `Compras.js:264` (lista),
`Compras.js:149` (Excel) e `receiptService.js:765` (`listarPedidosCompraAux`, tela do
almoxarifado). POST e PUT gravam `valor_total = total_geral`.
*Cenário:* criar pedido de 392,21 → `SELECT valor_total` devolve 392,21.

**RN-11 — O recebimento ignora o IPI do pedido, de propósito.**
`carregarItensPedidoCompra` (`receiptService.js:121`) monta
`valor_total: quantidade × valor_unitario`, sem IPI, embora o item de recebimento tenha
`valor_ipi` (`receiptService.js:158`). **Nesta etapa isso não muda** — mexer ali é alterar o
comportamento de um fluxo em produção que não foi pedido.
Consequência declarada: pedido 392,21 → recebimento gerado 368,27. T4 **afirma** essa diferença
em vez de tropeçar nela.

## Contratos congelados

**Literal reusado:** 404 é `"Pedido de compra não encontrado"` — já fixado em
`purchaseService.js:62-65` e `receiptService.js:112`, com comentário mandando não inventar um segundo.

### Shape do item (escrita e leitura)
Escrita: `{ material_id*, codigo?, descricao?, observacao?, ncm?, peso_unitario?, data_entrega?, quantidade*, unidade?, valor_unitario*, ipi_percentual? }`
Leitura: acrescenta `id`, `item_numero`, `valor_linha`, `ipi_linha` (derivados, RN-03/04).

### Bloco `fornecedor` (leitura, resolvido por T3)
`{ id, nome, cnpj, inscricao_estadual, endereco, municipio, uf, cep, telefone, celular, email, origem: 'snapshot' | 'cadastro' }`
`origem` existe para a impressão e os testes saberem qual caminho da RN-06 rodou.

### `GET /api/compras/pedidos`
Existente, **sem quebrar o consumidor atual**: mantém todas as colunas de hoje e acrescenta
`total_itens` e `total_geral`. Query: `search`, `status`.

### `GET /api/compras/pedidos/:id`
`200` → `{ ...pedido, fornecedor: {…}, itens: [ {…} ], totais: { total_produtos, total_ipi, total_icms_st, total_desconto, valor_frete, total_geral } }` · `404` literal acima.

### `POST /api/compras/pedidos` → `201`, shape do GET `:id`
Body: `{ numero*, fornecedor_id*, data_pedido, previsao_entrega, status?, condicao_pagamento?, frete_modalidade?, transportadora?, transportadora_telefone?, via_transporte?, tabela_preco?, contato?, observacoes?, local_entrega?, local_cobranca?, total_icms_st?, total_desconto?, valor_frete?, itens*: [item] }`
Erros: RN-01, RN-02 (×2), RN-09.

### `PUT /api/compras/pedidos/:id`
Mesmo body; substitui os itens por completo, em transação. Erros: RN-01, RN-02, RN-09, RN-07 (409), 404.

### `PUT /api/compras/pedidos/:id/status`
Body `{ status }` do enum da RN-07. `400` fora do enum: `"Status inválido"`. `404`.

### `DELETE /api/compras/pedidos/:id`
`200` → `{ message: "Pedido excluído" }` · `409` da RN-08 · `404`.
**Registro obrigatório ANTES de `index.js:20361`** e **remoção de `'pedidos'` do mapa `tables` da
rota genérica** (`index.js:20365`) — senão a rota nova é código morto, como já é hoje a de grupos
(`index.js:20437`). Apaga `itens_pedido_compra` do pedido **antes** do cabeçalho, em transação:
produção roda com `PRAGMA foreign_keys = ON` (`sqliteConcurrency.js:50`) e o harness com OFF
(`testApp.js:18`) — sem isso o teste fica verde e a produção dá 500.

### `GET /api/compras/pedidos/:id/impressao?token=<jwt>`
`200 text/html`, aberto em aba nova. `authenticateToken` aceita `?token=` (`index.js:2915-2917`).

## Tasks

| # | Task | Tipo | Estado |
|---|---|---|---|
| T0 | Extrair rotas de pedido para `server/routes/compras/pedidos.js` (registrador montável) e montá-lo no `testApp.js` | **tronco** | ⬜ |
| T1a | Migration **core** (`index.js`, padrão `db.run`+cb que ignora duplicate): colunas de `pedidos_compra` e `fornecedores` | **tronco** | ⬜ |
| T1b | Migration **almoxarifado** (`schema.js`, `safeAlter`): colunas de `itens_pedido_compra` | **tronco** | ⬜ |
| T2 | `services/compras/pedidoTotais.js` — RN-03/04/05, função pura + testes com os 24 itens reais | **tronco** | ⬜ |
| T3 | Rotas CRUD + status + RN-01/02/06/07/08/09/10 | **tronco** | ⬜ |
| G1 | Tela: formulário (cabeçalho + grade + totais via `pedidoTotais`) | galho | ⬜ |
| G2 | Impressão HTML no layout do ERP | galho | ⬜ |
| G3 | Backend do cadastro de fornecedor aceita `endereco/cidade/estado/cep/inscricao_estadual/celular` no POST e PUT | galho | ⬜ |
| G4 | Pedido inteiro dentro do "Novo Recebimento" (quem dá baixa confere sem sair da tela) | galho | ✅ |
| T4 | Integração **pela rota**: criar → GET → status → receber → conferir vínculo, RN-11 e RN-06 | **tronco** | ⬜ |

### Colunas (enumeradas — T3/G1/G2 dependem desta lista)
`pedidos_compra` **(T1a, core)**: `condicao_pagamento TEXT`, `frete_modalidade TEXT`,
`transportadora TEXT`, `transportadora_telefone TEXT`, `via_transporte TEXT`, `tabela_preco TEXT`,
`contato TEXT`, `local_entrega TEXT`, `local_cobranca TEXT`, `total_produtos REAL DEFAULT 0`,
`total_ipi REAL DEFAULT 0`, `total_icms_st REAL DEFAULT 0`, `total_desconto REAL DEFAULT 0`,
`valor_frete REAL DEFAULT 0`, mais as nove `snap_fornecedor_*` da RN-06.

`fornecedores` **(T1a, core)**: `inscricao_estadual TEXT`, `celular TEXT`.

`itens_pedido_compra` **(T1b, `safeAlter`)**: `item_numero INTEGER`, `ncm TEXT`,
`peso_unitario REAL DEFAULT 0`, `data_entrega DATE`, `ipi_percentual REAL DEFAULT 0`,
`observacao TEXT`.

### Cenários nomeados para os galhos (P4 da revisão: G1 não tinha nenhum)
- **G1** — `client/src/components/__tests__/PedidoCompraForm.test.js`: adicionar dois itens, mudar
  quantidade do primeiro, conferir que o rodapé mostra `total_geral` igual ao de `pedidoTotais`
  com os mesmos números; e que salvar sem material bloqueia antes do POST.
- **G2** — cenário de impressão: pedido com snapshot → sai o nome congelado e `origem: 'snapshot'`;
  pedido sem snapshot → sai o do cadastro. Confere os seis totais no HTML.

## O que a Fase 2 evitou (registro)

6 bloqueantes: (1) `DELETE` seria código morto sob a rota genérica `:tipo/:id`; (2) `DELETE`
estouraria FK em produção passando verde no harness; (3) item sem `material_id` quebraria o
recebimento a jusante — virou **RN-09**; (4) T4 dizia "entra pela rota" e `testApp` não monta
`/api/compras/*` — virou **T0**; (5) T1 juntava dois regimes de migração incompatíveis
(`safeAlter` relança tudo que não seja *duplicate column*) — virou T1a/T1b com colunas
enumeradas; (6) o snapshot da RN-06 colidiria por nome com os aliases do `receiptService` — virou
prefixo `snap_`.

Importantes: `valor_total` órfão quebrando três consumidores (**RN-10**); RN-08 precisava de duas
colunas + solicitação vinculada; enum de status não existia em lugar nenhum (**RN-07**); PUT sem o
400 de número repetido (**RN-01** agora vale nos dois); IPI perdido na fronteira (**RN-11**,
declarada em vez de corrigida); campos fiscais do fornecedor sem escritor (**G3**); arredondamento
ambíguo com três implementadores previstos (**RN-05** com fórmula e implementador único).

Menores: 404 reusa o literal existente; impressão via `?token=`; a frase "duas camadas" sai do
design — **compras tem uma camada só** (`requirePermission` aparece 0× em `index.js`), e criar a
segunda arrastaria cadastro de perfil, que não é escopo desta etapa.

## Registro de execução

### Tronco — FECHADO e medido (2026-09-11)

| # | Task | Estado | Onde |
|---|---|---|---|
| T0 | Rotas montáveis pelo harness | ✅ | `routes/compras/pedidos.js` + `testApp.js` |
| T1a | Migration core | ✅ | `index.js` — `pedidos_compra` foi de 10 → **33 colunas**; `fornecedores` ganhou IE e celular |
| T1b | Migration almoxarifado | ✅ | `schema.js` — 6 colunas em `itens_pedido_compra` |
| T2 | `pedidoTotais.js` | ✅ | 22 checagens, com invariantes e controle positivo |
| T3 | CRUD + status | ✅ | 6 rotas no módulo |
| T4 | Integração pela rota | ✅ | `tests/api/pedidoCompra.api.test.js` — 24 checagens |

**Descoberta da execução — RN-12 (precisão do unitário).** Medindo a fórmula contra os 24 itens
reais do 28433, **6 linhas divergiram do ERP e para os dois lados**, o que exclui truncamento. A
linha 13 deu o diagnóstico: `49 × 0,106 = 5,194` mas o ERP imprimiu `5,21`, e `5,21 ÷ 49 =
0,10633`. **O ERP guarda 4 casas no unitário e imprime 3.** A fórmula estava certa; o dado do PDF
é que é lossy. Virou a RN-12 e um cenário de teste. Sem essa medição, a tela arredondaria o
unitário para 3 casas ao salvar e **todo pedido nasceria com centavos de diferença contra a nota
fiscal do fornecedor**.

**Achado de ambiente (não é defeito do código):** `test:api` acusava 165/166 nesta máquina porque
`auditLabels.api.test.js` usa `grep -P` e a locale está vazia (`grep: -P supports only unibyte and
UTF-8 locales`). Com `LC_ALL=C.UTF-8` são **166/166**. O teste tem guarda própria que distingue
"grep falhou" de "vocabulário vazio" — foi ela que deixou isso legível.

**Também descoberto:** `supertest` estava declarado em `devDependencies` mas **não instalado** —
a suíte `test:api` inteira nunca havia rodado nesta máquina. Resolvido com `npm install --include=dev`.

**Números do tronco:** `test:api` **166/166** (165 → 166, `pedidoCompra` 24) · `test:almoxarifado`
exit 0 · `test:validation` 4/0 · `test:safealter` 3/0 · `test:sqlite` 5/0 · `test:permissions`
exit 0 · `pedidoTotais` 22/0 · servidor sobe e loga o registro das rotas · colunas conferidas no
banco real.

### G4 — o pedido dentro do "Novo Recebimento" ✅

Pedido do P.O., literal: *"todas as informações do Pedido de compra tem que aparecer aqui para
quando o pessoal for receber já conseguir dar baixa"*. Antes disto o almoxarife escolhia o pedido
**no escuro**: o `<select>` mostrava só `número — fornecedor`, e `listarPedidosCompraAux` nem
carregava itens.

**O bloqueio que decidiu o desenho.** A rota que já devolvia tudo — `GET /api/compras/pedidos/:id`
— é guardada por `checkModulePermission('compras')`, e **o almoxarife não tem o módulo compras**:
a tela levaria **403 no meio do lançamento**. Solução pela família que já existe para este exato
caso, `/api/almoxarifado/recebimentos-aux/*`, guardada só por `auth`.

| Arquivo | O que mudou |
|---|---|
| `server/services/compras/pedidoLeitura.js` | **novo** — implementador ÚNICO da leitura (cabeçalho + fornecedor resolvido por RN-06 + itens com derivados + totais) |
| `server/routes/compras/pedidos.js` | `carregarPedido` local (86 linhas) deletado; delega ao serviço |
| `server/services/almoxarifado/receiptService.js` | `getPedidoCompraParaRecebimento` — delega ao mesmo serviço e acrescenta `recebivel` / `itens_sem_material` |
| `server/routes/almoxarifado/extended.js` | `GET /api/almoxarifado/recebimentos-aux/pedidos-compra/:id`, guardada só por `auth` |
| `client/.../RecebimentosAlmoxarifado.js` | `selecionarPedido` busca o detalhe; painel somente-leitura no modal |
| `client/.../Almoxarifado.css` | classes `.ped-rec-*` |

**Por que a leitura virou serviço.** Dois consumidores em módulos diferentes lendo o mesmo
documento. Duas cópias divergiriam, e a divergência apareceria como *"o comprador vê um total e
quem recebe vê outro"* — a mesma classe de falha que `pedidoTotais` existe para matar. O
invariante do teste (40 pedidos aleatórios, `deepStrictEqual` entre as duas rotas) é o que trava.

**Dois defeitos achados na conferência visual, não no teste:**

1. `formatDate` do componente passa pelo `new Date(...)`, que lê `'2025-12-16'` como **UTC** e,
   no fuso de Brasília, imprime **15/12**. As datas do pedido são `DATE` puro. Virou
   `formatDateOnly`, que fatia a string sem fuso nenhum.
2. A coluna **Vl. unit.** saiu como `R$ 2,19` com o valor guardado em `2,191` — exatamente a
   **RN-12**. Quem confere contra a nota do fornecedor leria divergência onde não há. Virou
   `formatMoneyUnit` (2 a 4 casas).

**Decisões registradas (reversíveis, arbitráveis de manhã):**
- **D5** — painel **somente leitura**. O pedido é documento do Compras; editar daqui criaria um
  segundo escritor sem as validações da RN-01/07. Alternativa descartada: campos editáveis.
- **D6** — item sem `material_id` aparece **marcado e esmaecido**, em vez de escondido. Escondido,
  o almoxarife veria 5 itens na tela e receberia 4, sem nada dizendo qual sumiu
  (`receiptService.js:85` descarta). Só alcança pedidos anteriores a esta etapa — a RN-09 barra
  no POST.
- **D7** — a tela **diz** que a baixa lança sem IPI (RN-11), em vez de esconder o IPI. A nota do
  fornecedor vem com IPI e a diferença é esperada; sem a frase, alguém "corrige" o valor.

**Controle positivo (5 sabotagens, todas vermelhas antes de reverter):** arredondar o unitário na
leitura do almoxarife (2 cenários) · ignorar o snapshot do fornecedor (1) · tirar o `auth` da rota
aux (1) · pôr guarda de módulo na rota aux (1) · reimplementar a leitura no `receiptService` (6).
Uma sexta tentativa **não valeu** e foi refeita: `checkModulePermission` nem existe no escopo do
`extended.js`, então o arquivo quebrava antes dos testes rodarem — sabotagem que derruba o
processo não prova régua nenhuma.

**Medição:** `test:api` **167/167 arquivos** (166 → 167; `pedidoCompraRecebimento` 10/0) ·
`test:almoxarifado` / `test:validation` 4-0 / `test:safealter` 3-0 / `test:sqlite` 5-0 /
`test:permissions` / `test:familias` 12-0 / `test:familias-recriar` 15-0 / `test:proposta-variaveis`
— todos exit 0 · `npm run build` do client **Compiled successfully** · servidor sobe logando o
registro das rotas.

**Achado de ambiente (não é defeito do código):** `jsqr` estava declarado no `package.json` do
client mas **não instalado** — o build do front estava quebrado nesta máquina, e nenhuma mudança
de tela havia sido compilada. Mesma classe do `supertest` no tronco. Resolvido com `npm install`.

### Galhos — a fazer
G1 (formulário), G2 (impressão no layout do ERP), G3 (campos fiscais do fornecedor no cadastro).
G1 e G2 consomem o contrato acima, que está congelado e provado por T4 — e agora também por G4,
que já consome `pedidoLeitura` de fora do módulo de compras.
