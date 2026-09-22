# Módulo Compras (core) — índice mínimo

> **Status:** este módulo **não tem spec própria**, e a ausência é decisão, não esquecimento
> (decisão 11 do design da Etapa 38 / **B105**, reversível). A fatia dele que foi especificada e
> entregue — **a criação do pedido de compra** — vive em
> [`specs/modulo-almoxarifado/22-integracoes/README.md`](../modulo-almoxarifado/22-integracoes/README.md)
> como **"fatia Compras"**, porque foi ali que o elo quebrado apareceu (a reposição gerava
> solicitações que ninguém convertia em pedido, e o recebimento contra pedido da Etapa 37 era
> inerte).
> **Última atualização:** 2026-09-22 — **Etapa 41** (`7d9e7d7..ffba9b9`): a **cotação ganhou
> ITENS e vira PEDIDO de compra**. Tabela nova `itens_cotacao` (em `schema.js`, não em `index.js` —
> chega ao harness sem stub), `itens` **opcional** em `CotacaoSchema` (`8d81cc5`); `valor_total`
> com **duas regras** (derivado com itens, digitado sem); `POST /api/compras/cotacoes/:id/gerar-pedido`
> criando o pedido pelo `criarPedido` da 38 (número `PC-…`, total derivado, `data_pedido` hoje
> local) e gravando `cotacoes.pedido_id`; `DELETE /api/compras/cotacoes/:id` **próprio** (a lixeira
> pelo genérico daria **500** em produção no dia em que existisse item); cotação convertida não se
> edita nem se exclui (409), e excluir o pedido **libera** a cotação (`11591ca`). Tela com bloco de
> itens e campo *Valor total* travado (`7ecf91f`), coluna **Pedido** e botão **"Gerar pedido"** na
> aba (`bd224d2`), integração até o aux do recebimento (`dae1cee`). A revisão final achou a
> **corrida** do `gerar-pedido` (6 POSTs → 6 pedidos) — fechada por `UPDATE` condicional +
> compensação (`d6a1beb`) e provada sob FK ligada com a DDL de produção (`83a5d71`). Detalhe na
> seção *"O que a Etapa 41 mudou na aba Cotações"* · antes: 2026-09-22 — **Etapa 40**
> (`7ccfc85..03cd048`): as abas **Fornecedores**
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

- **Rotas:** `server/routes/compras.js` — **36 rotas** `/api/compras/*` medidas em 2026-09-22 no
  fechamento da 41 (`grep -cE "^app\.(get|post|put|patch|delete)\('/api/compras"`; eram 34 na 40, 30
  na 39): as **23** extraídas de
  `server/index.js` na Etapa 38 (`be71754`) e montadas no harness
  (`server/tests/helpers/testApp.js`), as **6** portas novas de pedido da própria 38, o
  **`PATCH /api/compras/pedidos/:id/status`** da Etapa 39 (`19ebf7d`), as **4** da Etapa 40:
  **`GET /api/compras/fornecedores/:id`** (`6795b39`) e **`POST` / `GET /:id` / `PUT
  /api/compras/cotacoes`** (`29dd6a8`), e as **2** da Etapa 41 (`11591ca`): **`POST
  /api/compras/cotacoes/:id/gerar-pedido`** (`:379`) e **`DELETE /api/compras/cotacoes/:id`**
  (`:387`, registrada **acima** do genérico `:393` — a posição é comportamento, provada por
  sabotagem: movida para baixo, o (8) e o (10) de `comprasCotacaoItens` caem). As duas portas de
  fornecedor que já existiam (`POST`, `PUT`) ganharam `validate(FornecedorSchema)` na 40, sem mudar
  a resposta.
  Antes da 38 **nenhum teste batia em `/api/compras`**.
  ⚠️ **Três rotas ficaram em `index.js` de propósito:** `/api/compras/solicitacoes-compra`
  (`:18465`, `:18500`, `:18525`). Elas operam `solicitacoes_compra`, tabela do **core**, que **não
  é** `solicitacoes_compra_almoxarifado` — juntá-las confundiria dois fluxos diferentes.
- **Serviços e schemas:** `server/services/compras/pedidoCompraService.js` (desde a **41**
  exporta `resolverItens` — a frase `'Material não encontrado'` tem **um** dono — e `excluirPedido`
  **libera a cotação** que apontava para o pedido, `cotacoes_liberadas` na resposta, `11591ca`),
  `server/services/compras/cotacaoService.js` (**Etapa 40**, `29dd6a8` — `criarCotacao`,
  `obterCotacao`, `atualizarCotacao`, importando `erro`/`assertFornecedor` do serviço de pedido;
  **Etapa 41**, `11591ca` + `d6a1beb` + `ffba9b9` — itens gravados por `DELETE`+`INSERT`,
  `somaItens` arredondada a 2 casas, `excluirCotacao` com cascata e 409, `gerarPedidoDaCotacao`
  com `UPDATE … WHERE pedido_id IS NULL` e compensação),
  `server/services/compras/schemas.js` (os **primeiros Zod do módulo core**; desde a 40 também
  `FornecedorSchema` e `CotacaoSchema`, `008a041`; desde a 41 `CotacaoItemSchema` com três literais
  próprias e `itens` **opcional** em `CotacaoSchema`, `8d81cc5`) e
  `server/services/compras/planilhaCompras.js`.
  **Fornecedor continua SQL na rota + `validate()`** — não ganhou serviço, por decisão (D9 da 40).
- **Telas:** `client/src/components/Compras.js` (as três abas),
  `client/src/components/compras/PedidoCompraForm.js` (lazy, rotas `/compras/pedidos/novo` e
  `/compras/pedidos/editar/:id`), e desde a **Etapa 40**
  `client/src/components/compras/FornecedorForm.js` (`23b86f3`, rotas `/compras/fornecedores/novo` e
  `/compras/fornecedores/editar/:id`) e `client/src/components/compras/CotacaoForm.js` (`b692413`,
  rotas `/compras/cotacoes/nova` e `/compras/cotacoes/editar/:id`; desde a **41** com o bloco de
  **itens** copiado do `PedidoCompraForm` — busca por `GET /compras/materiais?search=`, linhas,
  campo *Valor total* **travado** com a soma enquanto há linha, `7ecf91f`; cotação **convertida**
  abre travada com faixa `role="status"` e link para o pedido, `abb46f4`; total arredondado a 2
  casas, `327d33f`). A aba Cotações de `Compras.js` ganhou na 41 a coluna **Pedido** (link para a
  edição do pedido), o botão **"Gerar pedido"** (`bd224d2`) que não aceita clique repetido em voo
  (`a09dfe8`) e a coluna `Pedido` no fim do Excel. O modal de edição de fornecedor
  que já existia em `client/src/components/FornecedoresDoGrupo.js` (Fornecedores homologados → grupo)
  **continua**, e é o consumidor que o retrofit de Zod não podia recusar.
  ⚠️ **Este caminho estava ERRADO aqui** (dizia `client/src/components/PedidoCompraForm.js`, sem o
  diretório `compras/`): o arquivo não existe nesse lugar, e quem seguisse a linha concluiria que a
  tela sumiu. Medido em 2026-09-17.
- **Tabelas:** `pedidos_compra`, `cotacoes`, `fornecedores` e afins são do core; mas
  **`itens_pedido_compra` NÃO é** — o `CREATE TABLE` está em
  `server/services/almoxarifado/schema.js:1311` (o design da Etapa 37 dizia o contrário, e
  **estava errado**). **`itens_cotacao` (Etapa 41, `8d81cc5`) seguiu o mesmo caminho de
  propósito:** `schema.js:1349`, 8 colunas (espelho de `itens_pedido_compra` **sem**
  `quantidade_recebida`, com `valor_unitario` de **mesmo nome** para o custo médio do recebimento
  herdar), FK para `cotacoes(id)` e `materiais_almoxarifado(id)`, índice por `cotacao_id`. O motivo
  não é precedente: `initSchema` roda no harness (`testApp.js:32`), então tabela em `schema.js`
  chega a toda suíte com a DDL de produção sem stub — a classe de divergência da F1 da 40. Já
  **`cotacoes.pedido_id`** é coluna em tabela core e por isso toca **três** lugares: `ALTER` em
  `index.js` (após o `CREATE TABLE cotacoes`, erro `duplicate` ignorado), o stub de
  `testApp.js` e o `SELECT_LINHA` do serviço.

## As três abas — o que cada uma faz, e o que NÃO faz

| Aba | Lista | Cria / edita | Apaga |
|---|---|---|---|
| **Pedidos** | ✅ `GET /api/compras/pedidos` — **desde a Etapa 39 com `atrasado`/`dias_atraso` derivados, badge vermelho `Atrasado há N dias`, checkbox `Só atrasados` (`?atrasados=1`) e as colunas `Atrasado`/`Dias de atraso` no Excel** | ✅ **desde a Etapa 38**: formulário + importação por planilha, `PUT` enquanto nenhum recebimento tocou o pedido; **desde a Etapa 39**, pedido que já teve recebimento abre em modo "só status" e salva por `PATCH /api/compras/pedidos/:id/status` | ✅ rota própria, 409 se já houve recebimento, e **libera** a solicitação da reposição |
| **Fornecedores** | ✅ — desde a **Etapa 40** o filtro *Inativo* deixou de ser inerte (antes nenhuma porta escrevia `status`) e o `<select>` mostra só `Ativo`/`Inativo` (`b692413`) | ✅ **desde a Etapa 40**: `FornecedorForm` em `/compras/fornecedores/novo` e `/editar/:id` (`23b86f3`) — 7 textos + grupo (opcional) + **status só na edição**; erro do servidor em `role="alert"`, toast *"Fornecedor salvo"*. Servidor: `GET /:id` novo com projeção nomeada (sem `planilha_*`), `POST`/`PUT` com `FornecedorSchema` (`6795b39`, `008a041`). O `PUT` é **substituição total** dos 7 textos (caracterizado, não mudado) | ⚠️ genérico, **409** com pedido (`59abaea`, Etapa 38), com **cotação** (`6795b39`, RN-E12) e com **itens cadastrados** (`bdaadd8`, F1 da onda — a terceira FK); precedência pedido → cotação → itens |
| **Cotações** | ✅ — `<select>` de status com `em_analise/aprovado/rejeitado/cancelado` e o botão passou a dizer **"Nova Cotação"** (era "Novo Cotação", `b692413`); **desde a Etapa 41** a lista traz `pedido_id`/`pedido_numero` (`LEFT JOIN pedidos_compra`, `11591ca`), a aba mostra a coluna **Pedido** (link `PC-…` para `/compras/pedidos/editar/:id`, ou `-`) e o botão **"Gerar pedido"** só na cotação sem pedido e não rejeitada/cancelada (`bd224d2`; travado enquanto o `POST` está em voo, `a09dfe8`); Excel com a coluna `Pedido` no fim | ✅ **desde a Etapa 40**: `CotacaoForm` em `/compras/cotacoes/nova` e `/editar/:id` (`b692413`) — número **digitado** (o do documento do fornecedor, `UNIQUE` → 409 com o número na frase), fornecedor, data (nasce hoje **local**), validade, valor total, status, observações. ~~**cabeçalho só** … valor total (campo de entrada, não derivado)~~ — **era verdade até a 40; desde a 41** (`7ecf91f`) a tela tem o bloco **Itens** (busca de material, quantidade, valor unitário, subtotal) e o *Valor total* tem **duas regras**: **derivado e travado** com ≥ 1 linha, **digitável** sem linha (D3 da 41 — os quatro cenários de cabeçalho da 40 seguem válidos); total arredondado a 2 casas (`327d33f`). Cotação **convertida** abre **travada** (faixa com o `PC-…` e link, sem Salvar, `abb46f4`) e o `PUT` responde 409 (`11591ca`, RN-F15). Servidor: `POST`/`GET /:id`/`PUT` por `cotacaoService.js` (`29dd6a8`), desde a 41 com `itens[]` na resposta e `valor_total` = Σ quando há itens (`11591ca`); **`POST /:id/gerar-pedido`** cria o pedido pelo `criarPedido` da 38 e grava o vínculo (`11591ca`, atômico por CAS desde `d6a1beb`) | ~~⚠️ genérico, sem guarda (cotação não tem filhos)~~ — **era verdade até a 40; desde a 41** (`11591ca`) é **rota própria** `DELETE /api/compras/cotacoes/:id`, registrada **acima** do genérico: **409** se a cotação já gerou pedido (*"Cotação ⟨numero⟩ já gerou o pedido ⟨PC⟩ — não pode ser excluída"*), senão apaga os **itens antes** do cabeçalho (com FK ligada em produção o genérico daria **500** — provado com a DDL de produção em `83a5d71`). O genérico mantém `cotacoes` no mapa, **sombreado**, como `pedidos` |

**A Etapa 38 consertou UMA das três abas, a Etapa 39 aprofundou a MESMA aba, a Etapa 40 fechou
as outras DUAS, e a Etapa 41 ligou Cotações a Pedidos.** ~~Cotações e fornecedores seguem sem tela de criação — são **4 caminhos mortos**
medidos (`/compras/fornecedores/novo`, `/compras/cotacoes/nova` e os dois lápis de edição em
`Compras.js`), e continuam sendo o **próximo candidato declarado** ("tema B")~~ — **era verdade até
a 39**; a Etapa 40 (`7ccfc85..03cd048`) abriu os quatro caminhos com `FornecedorForm` e
`CotacaoForm`, e o "tema B" deixou de existir como candidato. A Etapa 41 (`7d9e7d7..ffba9b9`)
deu itens à cotação e a converteu em pedido — o "próximo alcançável" nomeado no fechamento da 40.
O que ainda **não** existe em Compras está nas seções seguintes.

## O que a Etapa 41 mudou na aba Cotações (`7d9e7d7..ffba9b9`)

Range: design `7d9e7d7`, plano `d870404`, Fase 2 `183ac38`, T1 `8d81cc5`, T2 `11591ca`, T3
`7ecf91f`, T4 `bd224d2`, T5 `dae1cee`, onda de correção F4 `a09dfe8`, F5 `abb46f4`, F6 `327d33f`,
F1 `d6a1beb`, F2 `83a5d71`, F3+F3b `ffba9b9` (todos conferidos com `git merge-base --is-ancestor`
no fechamento). Contratos completos (schemas, literais, rotas, ordem das guardas) na feature 22 do
almoxarifado, item *"Cotação com itens e conversão em pedido de compra"*, e no design
(`docs/superpowers/specs/2026-09-22-crm-etapa41-cotacao-itens-pedido-design.md`, §5).

**Os fatos novos, medidos** (Fase 0 de 2026-09-22 contra `820860a`,
`.superpowers/sdd/etapa41-fase0-servidor.md` / `-cliente.md`; revisões em
`.superpowers/sdd/2026-09-22-crm-etapa41-cotacao-itens-pedido/`):

- **`itens_cotacao` nasceu em `schema.js`, não em `index.js`** (`8d81cc5`, `schema.js:1349`).
  Espelho das 9 colunas de `itens_pedido_compra` **menos** `quantidade_recebida` (cotação não é
  recebida): `id, cotacao_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade`;
  `codigo/descricao/unidade` são copiados do material por `resolverItens` (a mesma do pedido, agora
  **exportada** de `pedidoCompraService`) porque a tela de edição lê por linha, e `valor_unitario`
  tem o mesmo nome da linha do pedido para a conversão copiar sem renomear e o custo médio do
  recebimento (U1 da 37) herdar o preço. O handoff da 40 dizia que `itens_pedido_compra` tinha **5**
  colunas — a Fase 0 mediu **9**.
- **`itens` é OPCIONAL na cotação** (D2): a cotação de cabeçalho ("R$ 1.500 o lote") continua
  válida, os quatro cenários da 40 que criam cotação só com `{ numero, fornecedor_id }` seguem
  iguais, e quem exige itens é a **conversão** (400 *"cotação sem itens não pode gerar pedido"*).
  `valor_total` ganhou **duas regras** (D3): com itens é Σ(quantidade × valor unitário) e o do
  payload é **ignorado**; sem itens é o do payload. A tela espelha: campo travado com linha,
  digitável sem.
- **`cotacoes.pedido_id`** (D6): a origem aponta para o pedido, 1:1, `ALTER` em `index.js` + stub do
  harness + `SELECT_LINHA` — três lugares, não um. Descartado `pedidos_compra.cotacao_id` (tocaria a
  tabela que o recebimento lê e permitiria N pedidos por cotação) e `status = 'convertida'`.
- **A conversão é do servidor** (D5): `POST /api/compras/cotacoes/:id/gerar-pedido`, sem corpo,
  chama `pedidoCompraService.criarPedido` com `{ fornecedor_id, data_pedido: hojeLocalISO(),
  observacoes, itens }` — herda `PC-…`, total derivado, `resolverItens`, `assertFornecedor` —,
  grava `pedido_id` + `status = 'aprovado'` (gerar **é** aprovar, D7) e responde 201 com o pedido
  relido. Guardas nesta ordem: 409 já gerou → 400 `rejeitado`/`cancelado` → 400 sem itens → 400
  fornecedor apagado → 400 **fornecedor inativo** (a **primeira** porta do Compras a olhar
  `fornecedores.status`; `assertFornecedor` segue sem olhar, D8). O `data_pedido` entrou na Fase 2
  (I4): `criarPedido` não põe default e o pedido nascia com data NULL.
- **Excluir o pedido gerado LIBERA a cotação** (`excluirPedido`, `cotacoes_liberadas` na resposta):
  o design original dizia que `pedido_id` ficava como rastro — a Fase 2 (I2) traçou o beco (nem
  regenera, nem se exclui, só SQL resolve) e inverteu, pelo precedente da I1 da 38 com as
  solicitações. O `status = 'aprovado'` **fica** (a aprovação aconteceu); o pedido regenerado nasce
  **da cotação**, não do pedido editado.
- **A corrida que a revisão final achou e a onda fechou** (RN I1 = UX C1, `d6a1beb`): o 409 era lido
  antes de uma dezena de `await` e o `UPDATE` do vínculo era incondicional — **6 POSTs em paralelo
  → 6 pedidos**, 5 sem cotação apontando, todos no aux do recebimento; duplo clique na tela
  reproduzia com dois. Conserto sem transação: `UPDATE cotacoes SET pedido_id = ? … WHERE id = ? AND
  pedido_id IS NULL` vira a guarda (CAS); `changes === 0` → **compensa** com `excluirPedido` do
  perdedor (nunca apontado, passa com FK ON) e lança o 409 com o vencedor. Cenários (11) (6 em
  `Promise.all` → 1×201 + 5×409, `COUNT` +1) e (12) (`DELETE` × `gerar` → 0 órfãos). Descartado:
  fila em memória por id (o CAS cobre as duas corridas sem estado no processo). Metade cliente:
  `gerandoRef` + `disabled` no botão (`a09dfe8`) — a guarda por **estado** não protegia (sabotagem
  verde), por isso `useRef`.
- **A suíte não via a ordem UPDATE → DELETE sob FK** (RN I2, `83a5d71`): mover o `UPDATE cotacoes
  SET pedido_id = NULL` para depois do `DELETE FROM pedidos_compra` ficava **verde** nas 20 e dava
  **500** em produção. `comprasCotacaoFkProducao.api.test.js` (3 cenários) abre um segundo banco
  com a **DDL de produção lida de `index.js`/`schema.js` em tempo de execução** (não copiada — cópia
  diverge na primeira edição), `PRAGMA foreign_keys = ON` afirmado, **controle positivo dentro do
  cenário** (`UPDATE pedido_id = 999` e `DELETE` cru têm de falhar com `SQLITE_CONSTRAINT`), e então
  `excluirPedido`, `excluirCotacao` e a compensação do F1 resolvendo com `foreign_key_check` vazio.
  A sabotagem "FK OFF no próprio teste" derruba os três — o controle do controle.
- **Ponto flutuante** (UX I2, `327d33f` + `ffba9b9`): 3 × 0,1 mostrava `0.30000000000000004` no
  campo travado e gravava o mesmo double em `cotacoes.valor_total`; `arredondar2` na tela (no
  `value`, no `<p>Total</p>` e na carga do `GET /:id`, por causa das cotações gravadas antes) e
  `somaItens` arredondada no servidor. **`criarPedido` continua somando cru** (fora do escopo,
  declarado): um pedido gerado de 3 × 0,1 nasce com `pedidos_compra.valor_total` sem arredondar.
- **Cotação convertida abre travada** (UX I1, `abb46f4`): o `GET /:id` já trazia `pedido_id` e a
  tela ignorava — o comprador editava tudo e levava o 409 só no Salvar. Agora: faixa `role="status"`
  *"Esta cotação já gerou o pedido ⟨PC⟩ — não pode mais ser editada"* com link, 13 controles
  `disabled`, Salvar não renderizado.

**O que ainda NÃO existe em Compras depois da 41** (por decisão, declarados): **comparar cotações**
de fornecedores diferentes para o mesmo material (exige "processo de cotação" com N fornecedores —
entidade nova); preço puxado de `itens_fornecedor` (texto livre, sem `material_id`); status
`convertida` (o vínculo é `pedido_id`); pré-carga do pedido por `?cotacao=`; item de cotação sem
material do catálogo; recebimento olhando a cotação; `TabelaItens` compartilhada; `assertFornecedor`
olhando status nas portas de pedido; `window.confirm` no "Gerar pedido" (reversível — excluir o
pedido libera); a lixeira da aba continua visível para a convertida (409 no toast); o `ALTER …
pedido_id` falha no **primeiro** boot de banco **novo** (fila do sqlite3 fora do `serialize`,
padrão herdado das cinco colunas de `fornecedores` — produção já tinha `cotacoes`; letra G com a
consulta A18); a frase morta de `comprasPedidoEditarExcluir.api.test.js:93` (*"`cotacoes` e tabela
CORE que o harness nao stuba"* — falsa desde `008a041`) **não foi tocada**; e os que a 40 já
declarava — foto do fornecedor na tela nova; `cidade`/`estado`/`cep`; CNPJ/e-mail; perfis no core
(G30); paginação; suíte para `FornecedoresDoGrupo.js`.

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

**O que ainda NÃO existia em Compras depois da 40** (todos por decisão, declarados): ~~itens de cotação
e "converter cotação em pedido" (o próximo alcançável — ver o plano da 40, "Próxima tarefa
detalhada")~~ — **entregues na Etapa 41** (`7d9e7d7..ffba9b9`, seção acima); foto do fornecedor na tela nova (segue no modal do grupo); `cidade`/`estado`/`cep` na
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
**`PATCH …/pedidos/:id/status`** da Etapa 39, as **quatro rotas da Etapa 40** (`GET
/fornecedores/:id`, `POST`/`GET /:id`/`PUT /cotacoes` — a revisão final sondou as quatro com
`setUser(null)` → 401) e as **duas da Etapa 41** (`POST /cotacoes/:id/gerar-pedido`, `DELETE
/cotacoes/:id` — a revisão final montou as rotas com espiões: negando `authenticateToken` → 401,
negando `checkModulePermission` → 403, `COUNT(pedidos_compra)` = 0 e cotação viva): quem tem o
módulo `compras` cria, edita, importa, muda status, converte cotação e apaga
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
