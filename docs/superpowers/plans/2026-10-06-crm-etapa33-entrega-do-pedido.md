# Etapa 33 (linha `main`) — a entrega é do pedido, não do item

> Design: `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`, seções 1.2 e 3.
> Task de origem: nº 1 do lote de 2026-10-06. Branch: `main`. Baseline medida antes de começar:
> `test:api` 170/170 arquivos OK; jest do client 44 suítes / 685 testes verdes.

## Regras (copiadas do design para `grep RN-33`)

- **RN-33.01** sem data de entrega por item na tela.
- **RN-33.02** seção "3. Entrega" com *Previsão de entrega* + *Entregar em*; "4. Condições" (pagamento, frete, via); "5. Total". *Cobrar em* **continua** na seção colapsável "Mais opções" (`:744-764`), que não é tocada.
- **RN-33.03** servidor grava `NULL` em `itens_pedido_compra.data_entrega` mesmo recebendo valor; leitura não projeta.
- **RN-33.04** recebimento sem a coluna **Entrega** por item.
- **RN-33.05** pedido antigo abre sem a data; o primeiro `PUT` zera. Sem migração.

## Tasks

Tudo nesta etapa é **tronco** (um executor), porque as três pontas (rota, leitura, tela) descrevem a
mesma regra.

### T1 — servidor: `data_entrega` deixa de ser gravada e lida (RN-33.03) — ✅ `75f378b4`
1. **Teste primeiro** em `server/tests/api/pedidoCompra.api.test.js:96-106`: o cenário "os itens
   voltam com NCM, data de entrega e IPI" vira "os itens voltam com NCM e IPI; a data de entrega
   por item é IGNORADA (RN-33.03)": enviar `data_entrega: '2025-12-18'` e afirmar
   `item.data_entrega === undefined` na resposta **e** `SELECT data_entrega` no banco `=== null`.
   Rodar → tem de **falhar** (controle positivo: hoje grava e devolve).
2. Mesmo em `pedidoCompraRecebimento.api.test.js:134-156` (`:148`).
3. Implementar: `server/routes/compras/pedidos.js:93-110` — tirar `data_entrega` do `INSERT`
   (ou gravar `null` fixo; preferir tirar da lista de colunas e deixar o `DEFAULT NULL`);
   `server/services/compras/pedidoLeitura.js:36` — tirar `i.data_entrega` do `SQL_ITENS`.
4. Rodar os 4 arquivos `pedidoCompra*.api.test.js` + `comprasMinimos` → verde.

### T2 — tela do pedido: seção "Entrega" no pedido, bloco do item some (RN-33.01, 33.02) — ✅ `9a7f9776`
1. **Teste primeiro**: criar `client/src/components/compras/PedidoCompraForm.entrega.test.js`
   (não existe teste do form em `main`; modelo de montagem: `Compras.test.js` não existe em `main`
   — montar `<MemoryRouter initialEntries={['/compras/pedidos/novo']}>` com `<Routes>` e o
   componente, mockando `../../services/api` — o `get` tem de responder aos **três** GETs da montagem
   (`PedidoCompraForm.js:182-184`: `/compras/fornecedores`, `/compras/pedidos-aux/opcoes` e o
   terceiro que estiver lá; `/compras/pedidos-aux/materiais` só na busca) — e **`react-toastify`**
   (única lib de toast de `main`, `client/package.json:25`; `react-hot-toast` não existe aqui). Cenários:
   (a) não existe texto "Entrega deste item" nem botão com `title` "Unidade, IPI e entrega deste item";
   (b) existe o heading "3. Entrega" com "Previsão de entrega" e "Entregar em", e "4. Condições";
   (c) ao adicionar um item e salvar, o corpo do `POST` tem `itens[0]` **sem** a chave `data_entrega`.
   Rodar → falha.
2. Implementar em `client/src/components/compras/PedidoCompraForm.js`: tirar `data_entrega` de
   `LINHA_VAZIA` (`:38`), da carga (`:203`) e do payload (`:406`); remover o bloco `:640-655`;
   `title` do botão de detalhes vira "Unidade, IPI e observações deste item" (`:617`); mover
   "Previsão de entrega do pedido" (`:691-706`) e `<BotoesLocal campo="local_entrega">` (`:708`) para
   uma `<section className="pcf-bloco"><h2>3. Entrega</h2>` nova antes de Condições; renumerar.
   Rótulo do bloco vira "Previsão de entrega" (o "do pedido" fica redundante dentro da seção).
3. `client/src/components/compras/PedidoCompraForm.css`: só se a seção nova precisar (provavelmente
   não — reusa `.pcf-bloco`).
4. Jest do arquivo novo → verde; depois a suíte inteira do client.

### T3 — recebimento: coluna Entrega por item sai (RN-33.04) — ✅ `9a7f9776` (mesmo commit da T2)
1. Procurar teste de `RecebimentosAlmoxarifado` em `main` que afirme a coluna "Entrega"
   (`grep -n "Entrega" client/src/components/almoxarifado/*.test.js`); se existir, ajustar primeiro.
   **Executado:** não existia teste nenhum do componente; foi criado
   `RecebimentosAlmoxarifado.entrega.test.js` (abre "Novo Recebimento", troca para "Por Pedido de
   Compra", escolhe o pedido e lê o `thead`). Vermelho antes com `[..., "Total", "Entrega"]`.
   `etiquetasPdf` é mockado porque o jspdf pede canvas no carregamento do módulo.
2. `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js:735` (`<th>Entrega</th>`) e
   `:757` (`<td>{formatDateOnly(it.data_entrega)}</td>`) saem. `formatDateOnly` é função local
   (`:365`) e continua usada em `:698-699` — nada a remover.

### T4 — fechamento — ✅ (commit "Etapa 33: fechamento", o que contém esta marcação)
Marcar este plano; `docs/compras-novidades-por-etapa.md` (seção da Etapa 33: "Em uma frase", "O que
há de novo", "Por baixo do capô", "Antes → Agora", roteiro de teste manual); `specs/modulo-compras/README.md`
(linha da 33). Commit único por assunto, sem trailer de atribuição, `git add` só dos arquivos
tocados.
**Executado:** plano e novidades neste commit. A linha da 33 em `specs/modulo-compras/README.md`
**não** foi tocada aqui — fica para o integrador do lote (instrução de execução da worktree `c33`).

## Pontos de atenção
- ~~`hojeISO`/`emDias`/`dataCurta` continuam em uso pela previsão do cabeçalho — não apagar.~~
  **Estava errado:** `hojeISO` só era usada pelo chip "Hoje" do bloco do item (a previsão do
  pedido começa em 7 dias). Depois de apagar o bloco ela ficou sem uso, e `CI=true build` trata
  `no-unused-vars` como erro — foi removida na T2. `emDias` e `dataCurta` continuam em uso.
- A camada mobile de `main` (`client/src/styles/mobile-app.css`, `tabelasComoCartoes.js`) enquadra
  `.pcf-bloco`; seção nova herda. Conferir no `CI=true build` que nenhum warning nasce.
- Pedido antigo com `data_entrega` nos itens: RN-33.05 — nada a fazer, mas o cenário (a) da T1
  prova que o `PUT` zera (criar com a coluna preenchida via `INSERT` direto, dar `PUT`, ler `NULL`).

## Retro (preenchido no fechamento)
- Rodadas de correção até verde: **T1** 1 (vermelho → implementação → verde na primeira rodada).
  **T2** 1 (idem). **T3** 1 na implementação, mas **2 rodadas no próprio teste** antes de ele ficar
  vermelho pelo motivo certo: (i) `selects[0]` pegava o filtro de status da lista, não o "Forma de
  recebimento" do modal — os dois usam `select.almox-select`; (ii) o jspdf (via `etiquetasPdf`)
  pede canvas no carregamento do módulo e o jsdom não tem — mockado.
- Achados da revisão: **real** — o plano mandava não apagar `hojeISO`, mas ela só servia ao chip
  "Hoje" do bloco removido; sem apagar, o `CI=true build` quebraria (`no-unused-vars`). **Ruído** —
  os dois tropeços do harness da T3 acima (defeito de teste, não de produto).
- Paralelismo: nenhum no código (etapa de tronco, um executor). As três verificações finais
  (`test:api`, jest inteiro, `CI=true build`) rodaram em paralelo em background.
- Defeito escapado: preencher na etapa seguinte.

## Como foi executado

- **Commits (branch `c33`, derivada de `main`):** `75f378b4` T1 (servidor);
  `9a7f9776` T2+T3 (client); fechamento = o commit que contém este texto.
- **Controle positivo (vermelho antes de implementar):**
  - T1: 3 cenários vermelhos — 2 em `pedidoCompra.api.test.js` ("a leitura ainda projeta
    data_entrega por item (2025-12-18)" e RN-33.05 "a tela abriria mostrando a data antiga por
    item") e 1 em `pedidoCompraRecebimento.api.test.js` (mesmo motivo, pela rota do almoxarife).
  - T2: 3/3 cenários vermelhos — (a) `"Entrega deste item"` presente; (b) headings
    `["1. Fornecedor", "2. O que está sendo comprado", "3. Condições", "4. Total"]`; (c) payload do
    POST com a chave `data_entrega` em `itens[0]`.
  - T3: 1/1 vermelho — `thead` = `["#","Código","Descrição","NCM","Qtd","Un","Vl. unit.","Total","Entrega"]`.
- **Verde depois de implementar:**
  - T1: `pedidoCompra` 25/25 (era 24 + 1 cenário novo da RN-33.05), `pedidoCompraRecebimento` 10/10,
    `pedidoCompraFormulario` 10/10, `pedidoCompraOpcoes` 13/13, `comprasMinimos` 1/1.
  - T2: `PedidoCompraForm.entrega.test.js` 3/3. T3: `RecebimentosAlmoxarifado.entrega.test.js` 1/1.
- **Suítes inteiras no fechamento:** `cd server && npm run test:api` → **170/170 arquivos de teste
  OK** (igual à baseline); jest do client → **46 suítes / 689 testes** verdes (baseline 44 / 685:
  +2 arquivos, +4 cenários); `CI=true npx react-scripts build` → `Compiled successfully.`, sem warning.
- **Divergências do plano:** (1) `hojeISO` removida (ver "Pontos de atenção"); (2) a T3 ganhou teste
  próprio embora o plano só mandasse "ajustar se existir" — a instrução de execução exigia TDD em
  toda task; (3) `specs/modulo-compras/README.md` não foi editado nesta worktree (integrador).
- **Decisões tomadas sem perguntar (reversíveis):** o `title` do botão de detalhes do item virou
  "Unidade, IPI e observações deste item" (plano); o teste da T1 prova RN-33.05 com `UPDATE` direto
  na coluna seguida de `PUT` (o plano falava em `INSERT` direto — mesmo efeito, menos setup).
