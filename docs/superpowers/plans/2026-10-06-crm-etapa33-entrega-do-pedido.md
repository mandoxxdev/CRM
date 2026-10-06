# Etapa 33 (linha `main`) — a entrega é do pedido, não do item

> Design: `docs/superpowers/specs/2026-10-06-crm-lote-compras-outubro-design.md`, seções 1.2 e 3.
> Task de origem: nº 1 do lote de 2026-10-06. Branch: `main`. Baseline medida antes de começar:
> `test:api` 170/170 arquivos OK; jest do client 44 suítes / 685 testes verdes.

## Regras (copiadas do design para `grep RN-33`)

- **RN-33.01** sem data de entrega por item na tela.
- **RN-33.02** seção "3. Entrega" com *Previsão de entrega* + *Entregar em*; "4. Condições"; "5. Total".
- **RN-33.03** servidor grava `NULL` em `itens_pedido_compra.data_entrega` mesmo recebendo valor; leitura não projeta.
- **RN-33.04** recebimento sem a coluna **Entrega** por item.
- **RN-33.05** pedido antigo abre sem a data; o primeiro `PUT` zera. Sem migração.

## Tasks

Tudo nesta etapa é **tronco** (um executor), porque as três pontas (rota, leitura, tela) descrevem a
mesma regra.

### T1 — servidor: `data_entrega` deixa de ser gravada e lida (RN-33.03)
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

### T2 — tela do pedido: seção "Entrega" no pedido, bloco do item some (RN-33.01, 33.02)
1. **Teste primeiro**: criar `client/src/components/compras/PedidoCompraForm.entrega.test.js`
   (não existe teste do form em `main`; modelo de montagem: `Compras.test.js` não existe em `main`
   — montar `<MemoryRouter initialEntries={['/compras/pedidos/novo']}>` com `<Routes>` e o
   componente, mockando `../../services/api` (`get` para `/compras/pedidos-aux/opcoes` e
   `/compras/pedidos-aux/materiais`, `post`) e `react-hot-toast`). Cenários:
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

### T3 — recebimento: coluna Entrega por item sai (RN-33.04)
1. Procurar teste de `RecebimentosAlmoxarifado` em `main` que afirme a coluna "Entrega"
   (`grep -n "Entrega" client/src/components/almoxarifado/*.test.js`); se existir, ajustar primeiro.
2. `client/src/components/almoxarifado/RecebimentosAlmoxarifado.js:735` (`<th>Entrega</th>`) e
   `:757` (`<td>{formatDateOnly(it.data_entrega)}</td>`) saem. Se `formatDateOnly` ficar sem uso,
   remover o import (CI=true faz warning virar erro).

### T4 — fechamento
Marcar este plano; `docs/compras-novidades-por-etapa.md` (seção da Etapa 33: "Em uma frase", "O que
há de novo", "Por baixo do capô", "Antes → Agora", roteiro de teste manual); `specs/modulo-compras/README.md`
(linha da 33). Commit único por assunto, sem trailer de atribuição, `git add` só dos arquivos
tocados.

## Pontos de atenção
- `hojeISO`/`emDias`/`dataCurta` continuam em uso pela previsão do cabeçalho — não apagar.
- A camada mobile de `main` (`client/src/styles/mobile-app.css`, `tabelasComoCartoes.js`) enquadra
  `.pcf-bloco`; seção nova herda. Conferir no `CI=true build` que nenhum warning nasce.
- Pedido antigo com `data_entrega` nos itens: RN-33.05 — nada a fazer, mas o cenário (a) da T1
  prova que o `PUT` zera (criar com a coluna preenchida via `INSERT` direto, dar `PUT`, ler `NULL`).

## Retro (preencher no fechamento)
- Rodadas de correção até verde: _preencher_
- Achados da revisão: _preencher_ (reais vs. ruído)
- Paralelismo: _preencher_
- Defeito escapado: preencher na etapa seguinte.

## Como foi executado

_Preencher no fechamento, com o que foi medido de verdade (hashes, contagens de teste, controle positivo)._
