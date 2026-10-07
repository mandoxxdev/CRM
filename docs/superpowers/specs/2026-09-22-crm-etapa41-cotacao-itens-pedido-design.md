# Etapa 41 — A cotação ganha ITENS e vira PEDIDO de compra (design)

**Data:** 2026-09-22 · **Branch:** `desenvolvimento-almoxarifado` · **BASE:** `820860a` (fechamento da 40) ·
**Módulo:** **CORE Compras** (quarta etapa seguida fora do almoxarifado) · **Fatia de spec:**
`specs/modulo-compras/README.md` (aba Cotações) e `specs/modulo-almoxarifado/22-integracoes/README.md`
(fatia Compras — o "falta para 🟢" alcançável nomeado no fechamento da 40: *itens de cotação + converter
cotação em pedido*).

**Medição de base:** `.superpowers/sdd/etapa41-fase0-servidor.md` e `etapa41-fase0-cliente.md`
(2026-09-22, contra `820860a`; as duas suítes de cotação executadas: 10/0 e 3/0; as quatro do client
50/50). **Todo fato tem `arquivo:linha`** dessas medições. Onde o handoff da 40 dizia outra coisa,
vale a medição (dez divergências no servidor, nove no cliente — as que mudam o desenho estão na seção 11).

> ⚠️ **Modo autônomo.** Toda decisão abaixo é o caminho **reversível**, com o descartado escrito; vai
> para a letra **B** do documento de novidades no fechamento. O André arbitra lendo.

---

## 1. Contexto e problema

A Etapa 40 deu à cotação um cabeçalho: número digitado (o do documento do fornecedor), fornecedor,
datas, um `valor_total` **digitado** e status. Ficou declarado (D1/D8 da 40) que não havia itens
porque **nenhuma** tabela de item de cotação existia — medido de novo hoje: zero em quatro grafias,
servidor e client (`etapa41-fase0-servidor.md` §2.6), só dois comentários dizendo isso.

**O que o comprador não consegue fazer hoje:**

1. **Registrar o que foi cotado.** A cotação diz "R$ 1.500,00 da Aços Vale" e nada mais. Qual
   material, quanto, a que preço — fica no PDF do fornecedor. A cotação do CRM não serve para
   comparar nem para conferir na entrega.
2. **Transformar a cotação em pedido.** Aprovada a cotação, o comprador **redigita** o pedido em
   *Compras → Pedidos → Novo Pedido*: fornecedor, cada material pela busca, quantidade e preço. O
   único precedente de "gerar pedido a partir de outra coisa" é a Reposição, que navega com query
   string e pré-carrega **uma** linha (`ReposicaoAlmoxarifado.js:390-400` →
   `PedidoCompraForm.js:168-185`) — para N itens a URL não serve.
3. **Saber que a cotação virou pedido.** Não há coluna de vínculo em nenhuma das duas tabelas
   (`grep cotacao_id` = 0; nenhuma das duas tabelas foi alterada alguma vez depois do `CREATE`).

**E o que a Fase 0 mediu por baixo, que decide a forma:**

- O molde de "documento com itens" é o pedido: `itens_pedido_compra` tem **9 colunas**
  (`schema.js:1311-1321` — `material_id`, `codigo`, `descricao`, `unidade` copiados do material por
  `resolverItens`, `pedidoCompraService.js:290-309`, **não exportada**), `criarPedido` grava
  cabeçalho por `inserirComNumeroUnico('PC')`, itens em laço e `valor_total` **derivado**
  (`:357-359`). `atualizarPedido` faz `DELETE + INSERT` das linhas (`:506-511`).
- A cadeia do custo médio já existe e só precisa do **mesmo nome de coluna**:
  `itens_cotacao.valor_unitario` → `itens_pedido_compra.valor_unitario` → recebimento herda
  (`receiptService.js:396-412`, U1 da 37) → `stockService.js:1098`. Cotação sem preço → pedido com 0
  → custo médio não alimentado (contrapartida já declarada no pedido).
- `initSchema` roda no harness (`testApp.js:32`): tabela criada em `schema.js` chega a **todas** as
  suítes sem stub e com a DDL de produção; tabela criada em `index.js` exige stub manual — a classe
  de divergência da F1 da 40. `cotacoes` é core (`index.js:19244`): uma coluna nova nela vai por
  `ALTER` no estilo `index.js:19269` **e** no stub `testApp.js:117-127` **e** em `SELECT_LINHA`.
- Com `itens_cotacao.cotacao_id REFERENCES cotacoes(id)` e FK ligada em produção
  (`sqliteConcurrency.js:50`), o `DELETE FROM cotacoes` cru do genérico (`routes/compras.js:392`)
  **falha com 500** para cotação com itens e **passa no harness** deixando órfãos — o mesmo caso que
  a 38 fechou para o pedido com rota própria que apaga os filhos primeiro.
- No client, três dos oito cenários de `CotacaoForm.test.js` ((d), (e), (h)) morrem se o input
  `cotacao-valor` sumir ou virar somente-leitura; **derivado quando há itens, digitável quando não
  há** preserva os oito sem tocar fixture (`etapa41-fase0-cliente.md` §2.2, caminho C).
- Produção: **0** cotações, **0** pedidos, **0** itens, **3** materiais — nada a migrar; a coluna
  `valor_total` digitada da 40 não tem linha para virar derivada. E o dump ainda tem
  `itens_pedido_compra` com **8** colunas: o `safeAlter` da 37 roda no boot, mas ninguém conferiu
  depois — vira letra A.

### Os números da Fase 0 que decidem o corte

| Medida | Valor | Consequência |
|---|---|---|
| Cenários que criam cotação **só com** `{ numero, fornecedor_id }` | 4 ((1) de `comprasCotacaoRotas`, (j) de schemas, (A)/(B) da integração) | `itens` **opcional** (D2) — os quatro continuam verdes |
| Cenários do client que dependem do input `cotacao-valor` | 3 ((d), (e), (h)) | caminho **C** para o total (D3) |
| Colunas de `itens_pedido_compra` | 9 (não 5) | `itens_cotacao` espelha as 9 menos `quantidade_recebida`; `resolverItens` **exportada** (D4) |
| Lugares que uma coluna em `cotacoes` toca | 3 (`index.js`, stub, `SELECT_LINHA`) | `pedido_id` é a **única** coluna nova em tabela core (D6) |
| Rotas de conversão existentes | 0 | é contrato novo (D5) |
| Ids de fixture livres no client | 770/771, 7701/7702, 912, 650 | as suítes novas usam esses |

---

## 2. Objetivo e corte

**Objetivo:** ao fim da etapa, uma cotação pode ter **linhas** (material do catálogo, quantidade,
preço unitário) com o total **somado**; a lista de cotações mostra **qual pedido** cada cotação gerou;
e um clique em **"Gerar pedido"** na linha da cotação cria o pedido de compra **no servidor** — número
`PC-…` gerado, itens copiados com preço, total derivado — e leva o comprador para a **edição** desse
pedido, onde ele revisa datas e salva. A mesma cotação **não gera dois pedidos**. Excluir cotação com
itens **funciona** (leva os itens junto) e excluir cotação que já gerou pedido é **recusado** com frase.

**Dentro:**

- **A0 — o servidor da cotação com itens:** `itens_cotacao` (tronco), `CotacaoItemSchema` + `itens`
  opcional em `CotacaoSchema`, `cotacaoService` gravando/lendo itens e derivando o total,
  `DELETE /api/compras/cotacoes/:id` próprio com cascata e guarda.
- **A1 — a conversão:** `cotacoes.pedido_id`, `POST /api/compras/cotacoes/:id/gerar-pedido` →
  `criarPedido`, 409 na segunda vez, `pedido_numero` na lista.
- **A2 — a tela da cotação com itens:** busca de material, tabela de linhas, total derivado (caminho C),
  edição pré-carregando as linhas.
- **A3 — a aba Cotações:** botão "Gerar pedido" na linha, coluna "Pedido", exportação com a coluna.
- **A4 — a integração** que cruza pela rota e pelo serviço: cria cotação com itens → gera pedido →
  o pedido é o que a Etapa 37 recebe (`GET /almoxarifado/recebimentos-aux/pedidos-compra` o lista com
  saldo) → segunda conversão 409 → exclusão da cotação 409 → exclusão do pedido libera.

**Fora (seção 8):** comparar cotações entre fornecedores; puxar preço da lista de itens do fornecedor
(`itens_fornecedor` é texto livre sem `material_id`); status "convertida"; pré-carga do form de pedido
por `?cotacao=` (caminho (a)); itens de cotação sem material do catálogo; recebimento olhando a cotação.

---

## 3. Decisões desta etapa — **doze** (vão para a letra B)

| # | Decisão | Descartado, e por quê |
|---|---|---|
| **D1** | **Escopo = A0 → A1 → A2 → A3 → A4.** | Comparação de cotações (não há base: uma cotação por fornecedor por número; comparar exige "processo de cotação" com N fornecedores — entidade nova). |
| **D2** | **`itens` é OPCIONAL na cotação** (`z.array(CotacaoItemSchema).optional()`, sem `min(1)`); cotação **sem** itens continua válida (valor fechado digitado). **A conversão exige itens** (400). | `itens.min(1)` como no pedido: quebra os 4 cenários que criam cotação de cabeçalho e proíbe um uso real — o fornecedor mandou "R$ 1.500 o lote" sem discriminar. O pedido exige itens porque o recebimento precisa de linhas; a cotação não é recebida. |
| **D3** | **`valor_total` tem duas regras, escritas:** com itens → **derivado** (Σ quantidade × valor_unitário, o payload é ignorado como no pedido); sem itens → **entrada** (como na 40). Na tela: campo travado e somado quando há linha; digitável quando não há. | Sempre derivado (mata (d)/(e)/(h) da suíte e o uso "valor fechado"); sempre entrada (o total mentiria com itens). |
| **D4** | **`itens_cotacao` em `schema.js` após `:1339`**, espelho de `itens_pedido_compra` **sem** `quantidade_recebida`, com `valor_unitario` (mesmo nome) e índice por `cotacao_id`; **`resolverItens` passa a ser exportada** de `pedidoCompraService` e reusada. | Criar em `index.js` junto de `cotacoes` (exige stub manual, a classe de defeito da F1 da 40); 5 colunas com `JOIN` na leitura (a tela de edição precisa de `codigo/descricao/unidade` por linha, como o pedido); copiar `resolverItens` (a frase `'Material não encontrado'` ganharia dois donos). |
| **D5** | **Conversão NO SERVIDOR:** `POST /api/compras/cotacoes/:id/gerar-pedido`, sem corpo, chama **`pedidoCompraService.criarPedido`** com `{ fornecedor_id, itens[{material_id, quantidade, valor_unitario}], observacoes }` — herda `PC-…`, total derivado, `resolverItens`, `assertFornecedor` — grava `cotacoes.pedido_id`, e a tela navega para **`/compras/pedidos/editar/:id`** (o comprador revisa datas e previsão ali). *(corrigido no fechamento — §12.4: o "grava `pedido_id`" era um `UPDATE` incondicional e a conversão não era atômica; hoje é compare-and-set com compensação.)* | Caminho (a) `?cotacao=ID` com pré-carga no `PedidoCompraForm`: zero servidor, mas a cotação nunca sabe que virou pedido, o mapeamento cotação→pedido vive no client, e a segunda conversão não é barrada — reabre a pergunta na etapa seguinte. Os dois são compatíveis; (a) pode entrar depois como atalho. |
| **D6** | **Vínculo = `cotacoes.pedido_id`** (a origem aponta para o pedido, como `solicitacoes…pedido_compra_id` da Reposição), 1:1, criada por `ALTER` em `index.js` (estilo `:19269`) + coluna no stub + `SELECT_LINHA`; **segunda conversão → 409** *"Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩"*. A lista `GET /cotacoes` ganha `pedido_numero` por `LEFT JOIN pedidos_compra`. | `pedidos_compra.cotacao_id` (toca a tabela que o recebimento lê; permite N pedidos por cotação — não é o que se quer); `status = 'convertida'` (mexe em `STATUS_COTACAO` e nos dois espelhos do client, e o (g) da suíte cai). |
| **D7** | **Conversão recusa cotação `rejeitado` ou `cancelado`** (400 *"cotação ⟨status⟩ não pode gerar pedido"*), aceita `em_analise` e `aprovado`, e **grava `status = 'aprovado'`** ao converter (gerar o pedido **é** aprovar). | Exigir `aprovado` antes: um clique a mais sem informação nova. Não mexer no status: a lista mostraria "Em Análise" com pedido gerado. |
| **D8** | **Conversão recusa fornecedor `inativo`** (400 *"Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido"*): é a **primeira** porta do Compras a olhar `status` do fornecedor. `assertFornecedor` **continua** sem olhar (o `POST /pedidos` direto segue aceitando — D5 da 40). | Deixar passar: o pedido nasceria para um fornecedor que a tela do grupo e o recebimento escondem. Mudar `assertFornecedor`: contrato de duas portas já entregues. |
| **D9** | **`DELETE /api/compras/cotacoes/:id` próprio, registrado ANTES do genérico** (`:367`), via `excluirCotacao`: **409** se `pedido_id` (*"Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩ — não pode ser excluída"*), senão apaga os itens e depois a cotação; 404 com a literal existente. O genérico deixa de alcançar `cotacoes` (sombreado, como `pedidos`). | Cascata dentro do genérico: não tem onde pôr a guarda do `pedido_id` sem inchar o bloco; o precedente do pedido é rota própria. `ON DELETE CASCADE` no DDL: a FK não dispara no harness e a suíte não provaria nada. |
| **D10** | **Tela da cotação: cópia do bloco de itens do `PedidoCompraForm`** (busca por `GET /compras/materiais?search=`, tabela de linhas, `Number()` no payload) com `data-testid` **prefixados `cotacao-`**; linhas **sem `min="0"`** (coerente com F4 da 40); edição pré-carrega `itens` do `GET /:id`. | Extrair um componente `TabelaItens` compartilhado: a 38 e a 39 não extraíram nada do pedido, e uma extração sem cenário próprio mexe em 25 cenários verdes; fica como candidato de higiene, declarado. |
| **D11** | **Botão "Gerar pedido" na linha da aba Cotações** (`<button title="Gerar pedido">`, só quando não há `pedido_id` e o status não é `rejeitado`/`cancelado`), toast *"Pedido ⟨PC⟩ gerado da cotação ⟨numero⟩"*, `navigate` para a edição; erro do servidor no **toast** (a linha não tem `role="alert"` — é o mesmo canal da lixeira). **Coluna "Pedido"** entre Status e Ações com link para a edição do pedido; a exportação ganha a coluna **no fim**. | Botão dentro do `CotacaoForm`: obriga abrir a edição para converter. |
| **D12** | **Paralelismo:** T1 tronco (DDL + schema + exports + `ALTER` + stub); **T2 servidor** (itens + lixeira + conversão, **um** executor, porque as três tocam `cotacaoService.js` e o bloco de rotas); **T3 cliente-form** e **T4 cliente-aba** em worktrees paralelas contra o contrato congelado; T5 integração; T6 fechamento. | Dividir T2 em dois galhos: mesmo arquivo, mesmas funções vizinhas — conflito certo. |

---

## 4. Regras de negócio — `RN-F01…RN-F14`

### A0 — cotação com itens (servidor)

| RN | Enunciado | Cenário |
|---|---|---|
| **RN-F01** | Cada item tem `material_id` inteiro positivo do catálogo (`materiais_almoxarifado`, ativo ou não), `quantidade` > 0 e `valor_unitario` ≥ 0 opcional (default 0). Literais **próprias** da cotação: `material do item da cotação é obrigatório`, `quantidade do item da cotação deve ser um número maior que zero`, `valor unitário do item da cotação não pode ser negativo`. Material inexistente → 400 `Material não encontrado` (a frase de `resolverItens`), e **nada é gravado**. | `POST { …, itens: [{ material_id: 999999, quantidade: 1 }] }` → 400 e `COUNT(cotacoes)` inalterado. |
| **RN-F02** | `itens` é opcional; ausente ou `[]` → cotação sem linhas, `valor_total` = o do payload (ou 0). | Os quatro cenários de cabeçalho da 40 continuam iguais. |
| **RN-F03** | Com itens, `valor_total` = Σ(quantidade × valor_unitario), e o `valor_total` do payload é **ignorado**. | `POST { valor_total: 999, itens: [2×10, 1×5] }` → `valor_total` 25. |
| **RN-F04** | O `GET /:id`, o `POST` e o `PUT` devolvem `itens[{ id, material_id, codigo, descricao, unidade, quantidade, valor_unitario }]` na ordem de lançamento (`ORDER BY id`); a lista (`GET /cotacoes`) **não** devolve itens, mas devolve `pedido_id` e `pedido_numero`. | Edição da tela pré-carrega as linhas sem buscar material. |
| **RN-F05** | O `PUT` **substitui** as linhas (`DELETE` + `INSERT`), como o pedido; `PUT` sem `itens` **apaga** as linhas existentes (substituição total do documento) e volta o total ao do payload. | `PUT` com 1 item numa cotação de 2 → 1 linha, total recalculado. |
| **RN-F06** | `DELETE /api/compras/cotacoes/:id`: cotação **com `pedido_id`** → 409 `Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩ — não pode ser excluída`; sem → apaga itens e cotação (200 `{ message: 'Cotação excluída com sucesso' }`); inexistente → 404 `Cotação não encontrada`. | Sabotagem: sem o `DELETE` dos itens, o cenário conta órfãos em `itens_cotacao`. |

### A1 — conversão

| RN | Enunciado | Cenário |
|---|---|---|
| **RN-F07** | `POST /api/compras/cotacoes/:id/gerar-pedido` cria o pedido por `criarPedido` com `fornecedor_id`, os itens (`material_id`, `quantidade`, `valor_unitario`) e `observacoes` da cotação; responde **201** com o pedido relido (`obterPedido`: `numero` `PC-…`, `valor_total` = Σ, `itens` com `codigo/descricao/unidade`); grava `cotacoes.pedido_id` e `status = 'aprovado'`. | Cotação 2×10 + 1×5 → pedido `PC-…` total 25, 2 linhas, `quantidade_recebida` 0. |
| **RN-F08** | Sem itens → 400 `cotação sem itens não pode gerar pedido`. | Cotação de cabeçalho → 400, `pedido_id` continua NULL. |
| **RN-F09** | `rejeitado`/`cancelado` → 400 `cotação ⟨status⟩ não pode gerar pedido`. | |
| **RN-F10** | Já convertida → **409** `Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩`; nenhum pedido novo. | Segunda chamada → 409, `COUNT(pedidos_compra)` inalterado. |
| **RN-F11** | Fornecedor `inativo` → 400 `Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido`. Fornecedor apagado → 400 `Fornecedor não encontrado` (de `assertFornecedor`). | Inativa pelo `PUT` da 40 → gerar → 400; reativa → 201. |
| **RN-F12** | O pedido gerado é um pedido **normal**: aparece em `GET /api/compras/pedidos`, em `GET /almoxarifado/recebimentos-aux/pedidos-compra` (`?pendentes=1`) com saldo cheio, pode ser editado (`PUT`) e excluído (`DELETE /pedidos/:id`) — e excluí-lo **LIBERA a cotação** (`pedido_id` volta a NULL; a resposta traz `cotacoes_liberadas`), que pode gerar outro pedido ou ser excluída. *(corrigido na Fase 2, I2: a versão original dizia que o `pedido_id` ficava como rastro — isso deixava a cotação num beco sem saída, o inverso do precedente da I1 da Etapa 38, que libera as solicitações ao excluir o pedido. Ver §12.1.)* | T2-gerar (10), integração A4. |
| **RN-F15** | Cotação convertida **não pode mais ser editada**: `PUT` → **409** `Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩ — não pode mais ser editada`. *(acrescentada na Fase 2, I3 — ver §12.2; a metade da tela entrou só na onda final, F5 — §12.6.)* | T2-gerar (9). |

### A2/A3 — telas

| RN | Enunciado | Cenário |
|---|---|---|
| **RN-F13** | `CotacaoForm`: busca de material (Enter/botão, `GET /compras/materiais?search=`), linha adicionada com quantidade 1 e preço vazio, subtotal e **Total** somado; com ≥ 1 linha o campo *Valor total* fica somente-leitura e mostra a soma; sem linha, é digitável. Payload: `itens[{ material_id, quantidade, valor_unitario }]` com `Number()`; `valor_total` só quando **não** há itens. Edição pré-carrega as linhas. 400 de item do servidor → `role="alert"`. | (d)/(e)/(h) da 40 seguem iguais; cenários novos cobrem o resto. |
| **RN-F14** | Aba Cotações: coluna **Pedido** (link `PC-…` para `/compras/pedidos/editar/:pedido_id`, ou `-`); botão **"Gerar pedido"** só quando `pedido_id` é nulo e o status não é `rejeitado`/`cancelado`; clique → `POST …/gerar-pedido` → toast `Pedido ⟨PC⟩ gerado da cotação ⟨numero⟩` → `navigate('/compras/pedidos/editar/⟨id⟩')`; erro → toast com a literal do servidor, sem navegar. Exportação: coluna `Pedido` no fim. | |

---

## 5. Contratos congelados

### 5.1 DDL — `server/services/almoxarifado/schema.js`, após o índice de `:1339`

```sql
CREATE TABLE IF NOT EXISTS itens_cotacao (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cotacao_id INTEGER NOT NULL,
  material_id INTEGER,
  codigo TEXT,
  descricao TEXT,
  quantidade REAL NOT NULL DEFAULT 1,
  valor_unitario REAL DEFAULT 0,
  unidade TEXT DEFAULT 'UN',
  FOREIGN KEY (cotacao_id) REFERENCES cotacoes(id),
  FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
);
CREATE INDEX IF NOT EXISTS idx_itens_cotacao_cotacao ON itens_cotacao(cotacao_id);
```

E em `server/index.js`, após o `CREATE TABLE cotacoes` (`:19256`), no estilo `:19269`:
`db.run('ALTER TABLE cotacoes ADD COLUMN pedido_id INTEGER REFERENCES pedidos_compra(id)', cb-que-ignora-duplicate)`.
No stub `testApp.js:117-127`: `pedido_id INTEGER` (sem FK, como o resto do stub).

### 5.2 Schemas (`server/services/compras/schemas.js`, ao lado de `CotacaoSchema :211`)

```js
const MATERIAL_ITEM_COTACAO_OBRIGATORIO = 'material do item da cotação é obrigatório';
const QTD_ITEM_COTACAO_INVALIDA = 'quantidade do item da cotação deve ser um número maior que zero';
const VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO = 'valor unitário do item da cotação não pode ser negativo';

const CotacaoItemSchema = z.looseObject({
  material_id: z.number({ error: MATERIAL_ITEM_COTACAO_OBRIGATORIO }).int(MATERIAL_ITEM_COTACAO_OBRIGATORIO).positive(MATERIAL_ITEM_COTACAO_OBRIGATORIO),
  quantidade: z.number({ error: QTD_ITEM_COTACAO_INVALIDA }).gt(0, QTD_ITEM_COTACAO_INVALIDA),
  valor_unitario: z.number({ error: VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO }).min(0, VALOR_UNITARIO_ITEM_COTACAO_NEGATIVO).optional(),
});
// em CotacaoSchema:  itens: z.array(CotacaoItemSchema).optional(),
```

Sem `min(1)` e sem `{ error }` no array (D2): `itens: 'abc'` → 400 em inglês? **Não**: dê
`z.array(CotacaoItemSchema, { error: ITENS_COTACAO_INVALIDOS }).optional()` com
`ITENS_COTACAO_INVALIDOS = 'itens da cotação devem ser uma lista'` — a armadilha 2 vale para o tipo do
array. Caminho do 400: `itens.0.material_id: <literal>` (um item `{}` gera **duas** issues, `material_id`
e `quantidade`, unidas por `; ` — Fase 2, M3).

### 5.3 `cotacaoService.js` — contrato

```
obterCotacao(db, id)                 -> linha + itens[]                       // 404
criarCotacao(db, dados)              -> linha + itens[]                       // 400 material/fornecedor; 409 numero
atualizarCotacao(db, id, dados)      -> linha + itens[]                       // 404; 400; 409; substitui linhas
excluirCotacao(db, id)               -> { message: 'Cotação excluída com sucesso' }   // 404; 409 COTACAO_JA_GEROU_PEDIDO
gerarPedidoDaCotacao(db, id, user)   -> pedido (obterPedido)                  // 404; 400 sem itens / status / fornecedor inativo; 409 já gerou
COTACAO_SEM_ITENS = 'cotação sem itens não pode gerar pedido'
cotacaoStatusNaoGera(status) = `cotação ${status} não pode gerar pedido`
FORNECEDOR_INATIVO_CONVERSAO = 'Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido'
cotacaoJaGerouPedido(numero, pc) = `Cotação ${numero} já gerou o pedido ${pc}`
cotacaoJaGerouPedidoExclusao(numero, pc) = `Cotação ${numero} já gerou o pedido ${pc} — não pode ser excluída`
```

`linha` = a da 40 **+ `pedido_id`, `pedido_numero`** (`LEFT JOIN pedidos_compra p ON p.id = c.pedido_id`)
**+ `itens`**. `resolverItens` importada de `pedidoCompraService` (exportada na T1). A ordem em
`criarCotacao`: `assertFornecedor` → `resolverItens` (todos os materiais **antes** de qualquer escrita)
→ `assertNumeroLivre` → INSERT cabeçalho (`valor_total` = Σ se itens, senão o do payload) → laço de
itens → `obterCotacao`. `gerarPedidoDaCotacao`: `obterCotacao` → guardas **nesta ordem** (409 já gerou →
status → itens → `assertFornecedor` → inativo por `SELECT status`; *alinhado ao plano na Fase 2, M2*) →
`criarPedido(db, { fornecedor_id, data_pedido: hojeLocalISO(), itens, observacoes }, user)` *(o
`data_pedido` entrou na Fase 2, I4: `criarPedido` não põe default e o pedido nascia com data NULL —
ver §12.3)*
→ `UPDATE cotacoes SET pedido_id = ?, status = 'aprovado', updated_at = …` → `obterPedido`. Se o `UPDATE`
do vínculo falhar depois do pedido criado, o erro **sobe** (o pedido fica; a cotação sem vínculo — o
409 não protege; declarado em G, mesma classe do vínculo não-fatal da Reposição). *(corrigido no
fechamento — §12.4: o `UPDATE` acima era incondicional e o "409 não protege" era mais grave do que
"declarado em G" — sob corrida ele não protegia NADA, 6 POSTs davam 6 pedidos. Hoje: `… WHERE id = ?
AND pedido_id IS NULL`, e `changes === 0` compensa com `excluirPedido` do pedido recém-criado e
lança o 409 com o vencedor, `d6a1beb`.)*

### 5.4 Rotas (`server/routes/compras.js`)

| Rota | Corpo | Resposta | Erros |
|---|---|---|---|
| `POST /api/compras/cotacoes` | `CotacaoSchema` (+ `itens`) | `201` linha + itens | `400`; `409` |
| `PUT /api/compras/cotacoes/:id` | idem | `200` | `400`; `404`; `409` |
| `GET /api/compras/cotacoes/:id` | — | `200` linha + itens + `pedido_*` | `404` |
| `GET /api/compras/cotacoes` | — | `200` lista **+ `pedido_id`, `pedido_numero`** (SQL inline da rota ganha o `LEFT JOIN`) | — |
| **`POST /api/compras/cotacoes/:id/gerar-pedido`** (nova) | — | `201` pedido (`obterPedido`) | `404`; `400` (sem itens / status / inativo / fornecedor apagado); `409` |
| **`DELETE /api/compras/cotacoes/:id`** (nova, **antes** de `:367`) | — | `200 { message: 'Cotação excluída com sucesso' }` | `404 'Cotação não encontrada'`; `409` |

Gate de todas: `authenticateToken, checkModulePermission('compras')`. O genérico `:367` mantém
`cotacoes` no mapa (inalcançável — sombreado, como `pedidos`; dizer no comentário).

### 5.5 Client

**`CotacaoForm.js`:** `data-testid` novos: `cotacao-busca-material`, `cotacao-botao-buscar-material`,
`cotacao-adicionar-material-${id}`, `cotacao-qtd-item-${material_id}`, `cotacao-valor-item-${material_id}`,
`cotacao-remover-item-${material_id}`; `cotacao-valor` ganha `readOnly={itens.length > 0}` e
`value={itens.length ? total : valorTotal}`; payload: `itens` sempre (pode ser `[]`), `valor_total`
**só** quando `itens.length === 0`. Mock do `GET /compras/materiais` no molde `PedidoCompraForm.test.js`.

**`Compras.js` (aba Cotações):** `<th>Pedido</th>` entre Status e Ações, `colSpan` 8; célula
`{cotacao.pedido_id ? <Link to={`/compras/pedidos/editar/${cotacao.pedido_id}`}>{cotacao.pedido_numero}</Link> : '-'}`;
`<button type="button" className="btn-icon" title="Gerar pedido" data-testid={`gerar-pedido-${cotacao.id}`}>`
condicional; `handleGerarPedido(cotacao)`: `api.post(`/compras/cotacoes/${id}/gerar-pedido`)` →
`toast.success(`Pedido ${res.data.numero} gerado da cotação ${cotacao.numero}`)` →
`navigate(`/compras/pedidos/editar/${res.data.id}`)`; `catch` → `toast.error(error.response?.data?.error || 'Não foi possível gerar o pedido')`.
Exportação (`:268-278`): `'Pedido': c.pedido_numero || ''` no fim.

*(corrigido no fechamento — §12.6: este §5.5 não previa (a) a tela da cotação **convertida** — o
`GET /:id` traz `pedido_id` e o `CotacaoForm` o ignorava, abrindo em edição livre para levar o 409
só no Salvar; (b) o arredondamento do total travado — `String(total)` mostrava
`0.30000000000000004`; (c) o botão "Gerar pedido" sem trava em voo — duplo clique mandava dois
`POST`. Entraram na onda: F5 `abb46f4`, F6 `327d33f`, F4 `a09dfe8`.)*

---

## 6. Telas — o que o usuário vê, com as literais

- **Compras → Cotações → "Nova Cotação"**: além do cabeçalho, o bloco **Itens**: busca por código ou
  descrição, **Adicionar**, linha com Código · Descrição · Unidade · Quantidade · Valor unitário ·
  Subtotal · remover. **Total: R$ …** somado; o campo *Valor total* fica cinza e mostra a soma enquanto
  houver linha. Material sem preço → aviso, não recusa. **Salvar** → *"Cotação salva"*.
- **Lápis** → as linhas voltam preenchidas; trocar quantidade/preço e salvar substitui.
- **Na lista**, a coluna **Pedido**: `-` ou o número `PC-…` clicável. O botão **"Gerar pedido"** (ícone)
  aparece só na cotação sem pedido e não rejeitada/cancelada. Clique → *"Pedido PC-… gerado da cotação
  ⟨numero⟩"* e a tela de **Editar pedido de compra** abre, com fornecedor, linhas e preços da cotação,
  para conferir datas e previsão. Segundo clique (voltando à lista) → o botão **não está mais lá**; pela
  API, *"Cotação ⟨numero⟩ já gerou o pedido PC-…"*.
- Cotação sem itens → *"cotação sem itens não pode gerar pedido"*. Fornecedor inativo → *"Fornecedor
  inativo — reative-o em Compras → Fornecedores antes de gerar o pedido"*.
- **Lixeira** da cotação com pedido → *"Cotação ⟨numero⟩ já gerou o pedido PC-… — não pode ser
  excluída"*; sem pedido → some com as linhas.

---

## 7. Testes — arquivos e cenários

### 7.1 `server/tests/api/comprasSchemasFornecedorCotacao.api.test.js` (estender, +4) — T1

(p) `itens` ausente → `undefined`; `[]` passa; (q) `itens: 'abc'` → `itens: itens da cotação devem ser
uma lista`; (r) item sem `material_id` / `'3'` / `0` → `itens.0.material_id: material do item da cotação
é obrigatório`; `quantidade` 0/`'2'` → literal; `valor_unitario` -1 → literal; (s) as três literais são
**diferentes** das do pedido (`grep` de uma acha um dono).

### 7.2 `server/tests/api/comprasCotacaoItens.api.test.js` (novo, ~10) — T2

(1) `POST` com 2 itens → 201, `valor_total` = Σ, `itens` com `codigo/descricao/unidade` do material, ordem;
(2) RN-F03 `valor_total` do payload ignorado com itens; (3) RN-F02 sem itens → `valor_total` do payload;
(4) RN-F01 material inexistente → 400 `Material não encontrado` e `COUNT(cotacoes)` inalterado; (5)
RN-F05 `PUT` substitui (2 → 1 linha; ids novos) e `PUT` sem `itens` apaga; (6) `GET /:id` devolve
`itens`; lista **não** devolve; (7) RN-F06 `DELETE` leva os itens (`COUNT(itens_cotacao)` = 0) — **sabotagem:
sem o `DELETE` dos filhos, órfãos ≠ 0**; (8) `DELETE` inexistente → 404; (9) o (8) da suíte da 40
(`DELETE` pelo caminho `/api/compras/cotacoes/:id`) continua 200 — agora pela rota própria; (10) o
genérico não alcança mais `cotacoes`: `DELETE /api/compras/cotacoes/:id` de cotação com `pedido_id`
→ 409 (é a rota própria respondendo; se o genérico respondesse seria 200).

### 7.3 `server/tests/api/comprasCotacaoGerarPedido.api.test.js` (novo, ~8) — T2

(1) RN-F07 201, `/^PC-/`, `valor_total` = Σ, 2 linhas, `quantidade_recebida` 0, `cotacoes.pedido_id` =
id, `status` → `aprovado`, `GET /cotacoes/:id` traz `pedido_numero`; (2) RN-F10 segunda → 409 com número e
PC, `COUNT(pedidos_compra)` inalterado; (3) RN-F08 sem itens → 400; (4) RN-F09 `rejeitado` → 400,
`cancelado` → 400, `em_analise` → 201; (5) RN-F11 inativo → 400, reativado → 201; fornecedor apagado
(`DELETE FROM fornecedores`) → 400 `Fornecedor não encontrado`; (6) 404; (7) RN-F06 cotação convertida
→ `DELETE` 409 com a literal de exclusão; (8) pelo **serviço** (`gerarPedidoDaCotacao` direto) — o
mesmo pedido, sem passar pela rota.

*(corrigido no fechamento — §12.5: esta lista de cenários, mais a (9)/(10) da Fase 2, não via a
**ordem** UPDATE → DELETE em `excluirPedido`/`excluirCotacao` sob FK ligada — o harness roda com
`foreign_keys = 0`, então a sabotagem "UPDATE depois do DELETE" ficava verde e dava 500 em produção.
A onda acrescentou (11)/(12) (corrida, F1) e o arquivo `comprasCotacaoFkProducao.api.test.js` (F2),
que abre um segundo banco com a DDL de produção e a FK ligada.)*

### 7.4 `client/src/components/compras/CotacaoForm.test.js` (estender, +6 → 14) — T3

(i) busca (`GET /compras/materiais` com `search`), adicionar 912, total 0 → digitar preço → Total e
`cotacao-valor` travado com a soma; (j) `POST` com `itens` `Number()` e **sem** `valor_total`; (k) sem
item → `POST` com `valor_total` digitado e `itens: []` (é o (d) reforçado); (l) edição da 770 pré-carrega
2 linhas (7701/7702) sem chamar materiais; (m) remover linha → `PUT` com 1 item e o `toEqual` de (e)
ajustado (8 chaves); (n) 400 `Dados inválidos — itens.0.quantidade: …` em `role="alert"`.

### 7.5 `client/src/components/Compras.test.js` (estender, +3 → 12) — T4

(j) aba Cotações com 770 (`pedido_id` null, `aprovado`) e 771 (`pedido_id` 650, `pedido_numero`
`PC-2026-650`): coluna Pedido `-` e link `PC-2026-650` para `/compras/pedidos/editar/650`; botão
`gerar-pedido-770` existe, `gerar-pedido-771` **não**; (k) clique → `api.post` com a URL exata → toast
com a literal → navega (a tela de edição do pedido é stub `PedidoCompraForm` no Proxy — afirmar pela
URL, com `PedidoCompraForm` em `reais` **ou** afirmar `mockNavigate`, à escolha do executor, declarado
— *corrigido no fechamento, §12.7: não há stub; `PedidoCompraForm` já está em `reais` de
`Compras.test.js:41-45` e a tela REAL monta — Fase 2 C1*);
(l) 409 do servidor → `toast.error` com a literal, sem navegar; exportação com a coluna `Pedido` no fim.
Uma cotação `rejeitado` (772) sem botão.

### 7.6 `server/tests/api/comprasCotacaoPedidoIntegracao.api.test.js` (novo, A4) — T5

Pela rota **e** pelo serviço: cria fornecedor (tela da 40) → cria cotação com 2 itens → gera pedido →
`GET /api/compras/pedidos` o lista → `GET /api/almoxarifado/recebimentos-aux/pedidos-compra` o lista
com saldo cheio → segunda geração 409 → `DELETE /cotacoes/:id` 409 → `PUT` do pedido (troca quantidade)
200 → `DELETE /pedidos/:id` 200 com `cotacoes_liberadas: 1` → `pedido_id` da cotação volta a **NULL**
(RN-F12, *corrigido na Fase 2, I2*) → gerar de novo → 201 com `PC-` novo → excluir o pedido novo →
`DELETE /cotacoes/:id` → 200 com os itens.

### 7.7 Suítes que precisam continuar verdes (números de partida, medidos)

`comprasCotacaoRotas` **10**, `comprasFornecedorCotacaoIntegracao` **3**,
`comprasSchemasFornecedorCotacao` **15**, `comprasFornecedorRotas` **13**, `comprasPedidoEditarExcluir`
**13**, `comprasPedidoCriar` **13**, `comprasPedidosRotas` **5**, `comprasPedidoImportar` **10**; API
**191 arquivos**; client `CotacaoForm` **8**, `PedidoCompraForm` **25**, `FornecedorForm` **8**,
`Compras` **9** (51 suítes / 769). O (8) de `comprasCotacaoRotas` e a linha `:62` de (A) continuam
**200** (cotação sem pedido).

---

## 8. Fora de escopo — o que esta etapa NÃO cobre

- **Comparar cotações** de fornecedores diferentes para o mesmo material.
- **Preço puxado da lista do fornecedor** (`itens_fornecedor` é texto livre, sem `material_id`, e a
  própria tela não a renderiza).
- **Status "convertida"** — o vínculo é `pedido_id`.
- **Pré-carga do pedido por `?cotacao=`** (caminho (a)).
- **Item de cotação sem material do catálogo** (texto livre): o pedido exige material, e a conversão
  precisa do `material_id`.
- **Recebimento olhando a cotação**: o recebimento continua contra o pedido.
- ~~**Limpar `pedido_id` quando o pedido é excluído** (RN-F12 / G).~~ *(Fase 2, I2: entrou na etapa —
  `excluirPedido` libera a cotação. Deixado riscado para o próximo não reabrir a pergunta.)*
- **Editar uma cotação já convertida** (RN-F15): recusado com 409; se algum dia for preciso, o gesto
  é excluir o pedido (que libera a cotação) e editar depois.
- **Extrair `TabelaItens`** compartilhada (D10).
- **`assertFornecedor` olhando status** nas portas de pedido (D8).

---

## 9. Letras para o fechamento

- **A:** (i) depois do primeiro boot em produção, `PRAGMA table_info(itens_pedido_compra)` deve ter
  **9** colunas e `PRAGMA table_info(itens_cotacao)` **8**, `PRAGMA table_info(cotacoes)` **11**
  (`pedido_id`) — o dump de 03/09 tem 8/–/10; (ii) `SELECT COUNT(*) FROM itens_cotacao i LEFT JOIN
  cotacoes c ON c.id = i.cotacao_id WHERE c.id IS NULL` = 0 (órfãos).
- **B:** D1–D12 com o descartado.
- **C:** nenhum furo novo em operação (a etapa não muda comportamento existente além da lixeira, que
  passa a **funcionar** onde daria 500).
- **D/G:** seção 8; ~~o `UPDATE` do vínculo depois do `criarPedido` sem transação~~ *(corrigido no
  fechamento — §12.4: virou CAS + compensação, `d6a1beb`; o que fica em G é o entrelaçamento
  teórico `excluirCotacao` × `gerar` e o `ALTER … pedido_id` no primeiro boot de banco novo)*; o `status`
  `aprovado` fica quando o pedido é excluído (só o vínculo cai); o `PUT` do pedido gerado faz
  `DELETE+INSERT` das linhas (herdado); `criarCotacao` pelo serviço não passa pelo schema (M4);
  "Gerar pedido" sem `window.confirm` (M6, reversível: excluir o pedido libera); a lixeira da aba
  mostra o toast fixo e não a literal nova (M7); os Minor da 40 que seguem (`textoOpcional` coage;
  `observacoes: ''`).

---

## 10. Riscos, e onde o desenho os fecha

| Risco | Onde fecha |
|---|---|
| `itens` obrigatório quebra os cenários de cabeçalho | D2, 7.7 |
| `valor_total` com duas regras diverge entre tela e servidor | RN-F03/RN-F13 espelhadas; (j)/(k) do client e (2)/(3) do servidor |
| Lixeira passa no harness e falha em produção (FK) | rota própria com cascata (D9) e sabotagem contando órfãos (7.2 (7)) |
| Segunda conversão cria pedido duplicado | RN-F10 com `COUNT(pedidos_compra)` — *(corrigido no fechamento — §12.4: o `COUNT` do (2) media a segunda chamada **sequencial**; a **concorrente** criava N pedidos e nenhum cenário via. Hoje (11)/(12), `d6a1beb`.)* |
| O pedido gerado não é "um pedido normal" para a Etapa 37 | integração A4 pelo aux do recebimento |
| Fornecedor inativo vira pedido | RN-F11 |
| Merge dos galhos | T2 é um executor só; T3/T4 tocam arquivos disjuntos (`CotacaoForm.*` vs `Compras.*`) |

---

## 11. O que o handoff da 40 dizia, e este design corrige

1. *"`itens_pedido_compra` (pedido_id, material_id, quantidade, valor_unitario, quantidade_recebida)"* —
   **5 de 9 colunas**; `codigo/descricao/unidade` são copiados do material e a tela de edição depende
   deles (D4).
2. *"`GET /compras/materiais?q=`"* (brief da Fase 0) — o parâmetro é **`search`**.
3. *"criar a tabela em `schema.js` pelo precedente"* — o motivo que decide é o harness (`initSchema`
   roda em `testApp.js:32`), não o precedente.
4. *"`valor_total` derivado quando houver itens?"* — virou regra de duas caras porque três cenários
   do client dependem do input (D3).
5. Não dito no handoff: `cotacoes.pedido_id` toca **três** lugares; o `DELETE` genérico passa a dar 500
   em produção no dia em que existir item — por isso a lixeira própria é **parte** da etapa, não higiene.
6. `specs/modulo-compras/README.md:70` ("cotação não tem filhos") fica falsa — corrigir no fechamento
   dizendo que era verdade até a 40.

---

## 12. Como foi executado — o que este design previu errado (escrito no fechamento, 2026-09-22)

> **Range da etapa:** `7d9e7d7..ffba9b9` — design `7d9e7d7`, plano `d870404`, Fase 2 `183ac38`,
> T1 `8d81cc5`, T2 `11591ca`, T3 `7ecf91f`, T4 `bd224d2`, T5 `dae1cee`, e a onda de correção F4
> `a09dfe8`, F5 `abb46f4`, F6 `327d33f`, F1 `d6a1beb`, F2 `83a5d71`, F3+F3b `ffba9b9`. Todos
> conferidos com `git merge-base --is-ancestor` no fechamento.
>
> **Design errado é dado, não vergonha** — o que não se faz é apagar a versão errada em silêncio,
> porque a próxima sessão confia nela de novo (regra 5 do `CLAUDE.md`). As sete correções abaixo
> ficam **ao lado** do texto original das seções 3, 4, 5, 7, 9 e 10, que **não foi apagado**: cada
> lugar ganhou um *(corrigido no fechamento)* apontando para cá. Fontes:
> `.superpowers/sdd/2026-09-22-crm-etapa41-cotacao-itens-pedido/etapa41-fase2-revisao.md`,
> `final-review-rn.md`, `final-review-ux.md`, `fix-wave-report-servidor.md`,
> `fix-wave-report-cliente.md`.

### 12.1 RN-F12 dizia que `pedido_id` ficava como RASTRO ao excluir o pedido — deixava a cotação num beco *(corrigido na Fase 2, I2)*

**O design dizia** (RN-F12 e a letra G do §9, na versão `7d9e7d7`): que o pedido gerado era um
pedido normal, editável e excluível, e que ao excluí-lo o `pedido_id` da cotação **ficava** como
rastro — o cabeçalho do plano até afirmava *"a RN-F12 declara que o `pedido_id` fica, e o cenário
afirma isso para ninguém 'consertar'"*.

**Estava errado na consequência.** A Fase 2 traçou a cadeia até o último gesto (sonda 6): depois do
`DELETE /pedidos/:id`, `pedido_id` ficava apontando para um id inexistente, o `LEFT JOIN` devolvia
`pedido_numero: null`, o 409 saía como *"já gerou o pedido **null**"* (I1), e a cotação respondia
409 em `gerar-pedido` **e** 409 em `DELETE` para sempre — só SQL resolvia (I2). É o **inverso** do
precedente que a própria base registrou como defeito na Etapa 38 (I1, `liberarSolicitacoesDoPedido`:
a solicitação ficava `VINCULADO` a um pedido que não existia mais).

**O que vale hoje** (`11591ca`): `excluirPedido` faz `UPDATE cotacoes SET pedido_id = NULL …
WHERE pedido_id = ?` **antes** do `DELETE` do cabeçalho (a ordem que a FK de produção exige — §12.5)
e devolve `cotacoes_liberadas: N`; o `status = 'aprovado'` fica (a aprovação aconteceu); a cotação
pode gerar de novo (`PC-` novo, **a partir da cotação** — o `PUT` feito no pedido anterior se perde,
letra B) ou ser excluída. `rotuloPedido` (`pedido_numero || '#id'`) ficou como cinto para o
intervalo sem transação. Cenário T2-gerar (10) e T5 (A). **Descartado:** manter D6/G e escrever na
letra B que é o oposto da 38.

### 12.2 Faltava a RN-F15 — o `PUT` de cotação convertida continuava aberto *(acrescentada na Fase 2, I3)*

**O design dizia:** nada. As RN-F01…F14 não olhavam `pedido_id` no `PUT`: depois de gerar, o
comprador podia trocar itens e preços (o pedido não acompanhava) ou voltar o `status` para
`rejeitado` com `pedido_id` gravado — a lista mostraria "Rejeitado" com link `PC-…`.

**O que vale hoje** (`11591ca`): `atualizarCotacao` lança **409** *"Cotação ⟨numero⟩ já gerou o
pedido ⟨PC⟩ — não pode mais ser editada"* antes de qualquer escrita (T2-gerar (9)); se algum dia for
preciso editar, o gesto é excluir o pedido (que libera) e editar depois (§8). **A metade da tela só
entrou na onda** (§12.6): o servidor recusava, mas o `CotacaoForm` abria a convertida em edição
livre. **Descartado:** congelar só os itens e deixar o cabeçalho — a tela manda tudo junto (RN-F05).

### 12.3 O pedido gerado nascia com `data_pedido` NULL *(corrigido na Fase 2, I4)*

**O design dizia** (§5.3, D5): `criarPedido(db, { fornecedor_id, itens, observacoes }, user)` — sem
`data_pedido`. A Fase 0 cliente §3.4 tinha afirmado *"`data_pedido` = hoje do servidor"*.

**Estava errado — a Fase 0 afirmou um default que não existe.** `camposDoCabecalho` pula
`undefined` e a DDL de `pedidos_compra` não tem default para as datas (`index.js:19235-19236`):
sonda 3 da Fase 2 → `data_pedido null`. Efeito: a coluna "Data Pedido" da aba e o `data_pedido` do
aux do recebimento saíam `-`/`null` até o comprador digitar.

**O que vale hoje** (`11591ca`): `data_pedido: pedidoCompraService.hojeLocalISO()` no payload —
o mesmo fallback de `importarPedidos`; T2-gerar (1) afirma. `previsao_entrega` fica NULL de
propósito (é o que o comprador confere na edição, §6). **Descartado:** copiar `data_cotacao` (é a
data do documento do fornecedor).

### 12.4 A conversão NÃO era atômica — D5 e §5.3 descreviam um `UPDATE` incondicional *(corrigido na onda, F1)*

**O design dizia** (D5, §5.3, §9 G, §10): `obterCotacao` → guardas (409 se `pedido_id`) →
`criarPedido` → `UPDATE cotacoes SET pedido_id = ? … WHERE id = ?` → `obterPedido`; e que se o
`UPDATE` falhasse "o erro sobe, o 409 não protege — declarado em G". O risco do §10 ("segunda
conversão cria pedido duplicado") apontava para RN-F10 com `COUNT(pedidos_compra)` — medido na
**segunda chamada sequencial**.

**Estava errado na gravidade: sob concorrência a guarda não protegia nada.** As duas lentes da
revisão final chegaram ao mesmo achado por sondas diferentes (RN I1 e M3; UX C1): 6 `POST
…/gerar-pedido` em `Promise.all` na mesma cotação → **201 × 6, seis pedidos, cinco sem cotação
apontando**, todos visíveis no aux do recebimento com saldo cheio; duplo clique em "Gerar pedido"
reproduzia com dois (o botão não tinha trava); `DELETE /cotacoes/:id` concorrente com `gerar` deixava
pedido vivo com cotação apagada (o `UPDATE` afetava 0 linhas e ninguém olhava `changes`). Causa: o 409
era lido antes de uma dezena de `await` e o `UPDATE` era incondicional, sem transação.

**O que vale hoje** (`d6a1beb`, F1; `a09dfe8`, F4): o `UPDATE` **é** a guarda — `… WHERE id = ? AND
pedido_id IS NULL` (compare-and-set); `changes === 0` → **compensação** com
`pedidoCompraService.excluirPedido(db, pedido.id)` (o perdedor nunca foi apontado por cotação
nenhuma, então passa com FK ON — provado em `comprasCotacaoFkProducao` (3)) → relê a cotação (404 se
sumiu) → 409 com o vencedor. Cenários (11) (1×201 + 5×409, `COUNT` +1, 0 órfãos) e (12) (`DELETE` ×
`gerar` → 0 órfãos; ramo observado no harness: 200 + 404). No client, `gerandoRef` + `disabled` —
a guarda por **estado** ficava verde sob sabotagem (entre dois eventos discretos o React já
re-renderizou; no mesmo tick o closure lê `null`), por isso `useRef`. **Descartado:** fila em
memória por id de cotação (molde de `enqueueWrite`) — o CAS cobre as duas corridas sem estado no
processo, e a transação real fica para o Postgres. **Fica declarado (G):** um terceiro entrelaçamento
(`excluirCotacao` lê `pedido_id NULL` → `gerar` vence o CAS → `DELETE FROM cotacoes` apaga) é
inalcançável no harness e não é coberto pelo CAS; o (12) acusa se aparecer.

### 12.5 A suíte não via a ordem UPDATE → DELETE sob FK — o "modo de falha desta etapa" ficou sem guarda *(corrigido na onda, F2)*

**O design dizia** (§7, §10, e o cabeçalho do plano): que o risco de "lixeira passa no harness e
falha em produção" fechava com a rota própria e a sabotagem que **conta órfãos** em (7). Correto para
`excluirCotacao` sem o `DELETE` dos filhos — mas só para essa.

**Estava incompleto.** A lente RN (I2) sabotou a **ordem**: mover o `UPDATE cotacoes SET pedido_id =
NULL` de `excluirPedido` para **depois** do `DELETE FROM pedidos_compra` deixava as 20 de cotação
**verdes** (o harness roda `foreign_keys = 0`, `testApp.js:97`) e dava `DELETE /pedidos/:id → 500
SQLITE_CONSTRAINT` em produção, com a cotação seguindo apontando. Nenhum `COUNT` pega ordem; só a FK
vigiando pega.

**O que vale hoje** (`83a5d71`, F2): `comprasCotacaoFkProducao.api.test.js` — **sem**
`createTestApp` — abre um segundo `sqlite3.Database(':memory:')` com a DDL de produção **lida em
tempo de execução** de `index.js` (`fornecedores`, `pedidos_compra`, `cotacoes`) e `schema.js`
(`itens_pedido_compra`, `itens_cotacao`) por um extrator que falha alto se a marca sumir (cópia
divergiria na primeira edição — a classe da F1 da 40), mais os dois `ALTER` reais, `PRAGMA
foreign_keys = ON` afirmado, e **controle positivo dentro de cada cenário** (`UPDATE pedido_id = 999`
e `DELETE` cru têm de falhar com `SQLITE_CONSTRAINT`). Três cenários: `excluirPedido`,
`excluirCotacao` com itens, e a compensação do F1 sob FK. A sabotagem "FK OFF no próprio teste"
derruba os três — o controle do controle. **Divergência do brief:** arquivo próprio (195, não 194) e
DDL lida, não copiada.

### 12.6 §5.5 não previa a tela da cotação CONVERTIDA nem o arredondamento *(corrigido na onda, F5/F6)*

**O design dizia** (§5.5, §6): `cotacao-valor` com `readOnly={itens.length > 0}` e `value={String(total)}`;
lápis → "as linhas voltam preenchidas"; a recusa da convertida era do servidor (§8, RN-F15).

**Estava incompleto em dois pontos que a lente UX reproduziu.** (I1) o `GET /:id` já trazia
`pedido_id`/`pedido_numero` (RN-F04) e a tela os ignorava: a convertida abria com **todos** os
campos livres, nenhum sinal do `PC-…`, e o comprador preenchia tudo para levar o 409 no Salvar —
exatamente o que o comentário da 39 no `PedidoCompraForm` (`soStatus` por `teve_recebimento`) diz
por que não fazer. (I2) `String(total)` mostrava `0.30000000000000004` para 3 × 0,1 enquanto o
`<p>Total: R$ 0,30</p>` ao lado estava certo; o servidor gravava o mesmo double; e ao remover a
última linha o campo digitável herdava o lixo com `step="0.01"` — o M2 da 40 voltando por outra
porta.

**O que vale hoje:** F5 (`abb46f4`) — `convertida = c.pedido_id != null`, faixa `role="status"`
`data-testid="cotacao-convertida"` *"Esta cotação já gerou o pedido ⟨PC⟩ — não pode mais ser
editada"* com `<Link>` para o pedido, 13 controles `disabled`, Salvar não renderizado; cenário (o).
F6 (`327d33f`) + F3b (`ffba9b9`) — `arredondar2` no `value`, no `<p>` e na carga do `GET /:id`
(cotações gravadas antes do F3b continuam no banco); `somaItens` arredondada no servidor; cenário
(p) e o (2) de Itens com 3 × 0,1 → 0,3. **Fica declarado:** `criarPedido` segue somando cru.

### 12.7 T4 (k) afirmava um `data-stub` que nunca renderiza *(corrigido na Fase 2, C1)*

**O design dizia** (§7.5 (k)): que a tela de edição do pedido era stub `PedidoCompraForm` no Proxy
de `Compras.test.js`, e que o executor podia afirmar a navegação pelo `data-stub` ou por
`mockNavigate`.

**Estava errado.** `Compras.test.js:41-45` tem `reais = { Compras, PedidoCompraForm, Layout }`: ao
navegar, o `PedidoCompraForm` **real** monta, chama `GET /compras/fornecedores` e `GET
/compras/pedidos/650` e mostra `<h1>Editar pedido de compra</h1>`. `querySelector('[data-stub=…]')`
seria `null` contra o código certo — e o "conserto" óbvio (tirar `PedidoCompraForm` de `reais`)
mudaria o que a suíte mede. Único Critical da Fase 2.

**O que vale hoje** (`bd224d2`): o (k) prova a navegação pelo `h1` da tela real **e** pelo `GET
/compras/pedidos/650` (a regex do mock resolve a fixture de `pedidosDoBanco`), e afirma que a
lista de cotações **não** está mais na tela. A sabotagem "sem `navigate`" cai no `h1`.

### O que as seções 11 e 12 deixam para a Etapa 42

O handoff da 40 errou em **seis** pontos que a Fase 0 desta etapa achou (seção 11); este design
errou em **sete** que a Fase 2 e a revisão final acharam (esta seção). O padrão dos dois é o mesmo:
**cadeia não traçada até o último gesto** (excluir o pedido, editar a convertida, clicar duas
vezes) e **régua que só mede o caso sequencial**. A retro nº 4 deste plano fica em branco para a
42 preencher olhando para trás; a nº 4 do plano da 40 foi preenchida no fechamento desta.
