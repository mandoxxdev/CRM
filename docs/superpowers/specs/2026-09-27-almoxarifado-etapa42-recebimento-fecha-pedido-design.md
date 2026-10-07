# Etapa 42 — design: o recebimento FECHA o pedido de compra

**Data:** 2026-09-27 · **Branch:** `desenvolvimento-almoxarifado` · **Base medida:** `2b9defb`
**Features tocadas:** 08 (recebimento, dona) e 20 (alertas, consumidora)

> **Por que este documento não tem perguntas ao usuário.** O `CLAUDE.md` deste projeto proíbe
> travar o fluxo esperando aval, inclusive em decisão de contrato. Onde o design teve escolha, a
> decisão está numerada abaixo **com a alternativa descartada**, e vai para a **letra B** de
> `docs/almoxarifado-novidades-por-etapa.md` para o André arbitrar depois. Nenhuma decisão aqui é
> irreversível: todas são uma escrita de `status` que o `PATCH` manual da Etapa 39 desfaz.

---

## 1. O problema, em uma frase

A cadeia que as Etapas 38→41 construíram (cotação → pedido → recebimento → custo médio) termina
num pedido que **continua "Atrasado" para sempre** na aba Compras depois de fisicamente recebido
por inteiro, até o comprador lembrar de usar o `PATCH .../status` à mão. E o alerta
*"pedido recebido parcialmente"* da feature 20 segue `[ ]` porque a única fonte exportada do saldo
tem `LIMIT 50` e não devolve `previsao_entrega`.

Os dois defeitos têm o **mesmo dado** por trás (`itens_pedido_compra.quantidade_recebida`, escrito
pela Etapa 37) e a **mesma régua** (`derivarRecebimentoDoPedido`). Por isso são uma etapa, não duas.

## 2. O que foi MEDIDO na Fase 0 (e não pressuposto)

| Fato | Onde | Consequência para o design |
|---|---|---|
| O acumulador soma **por linha**, dentro do claim `entrada_estoque_em IS NULL`, depois de `entrouFisicamente = true`, **não-fatal** | `receiptService.js:1261-1271` | o gancho de status é irmão dele, mas **depois do laço** (D1) |
| `derivarRecebimentoDoPedido` **não é exportada**; o `module.exports` não a inclui | `receiptService.js:1463`, `:1640-1658` | D5 exporta |
| `RECEBIDO` é `recebida >= pedida` **por pedido**, com `pedida > 0` | `situacaoRecebimentoPedido`, `:1424-1432` | pedido sem linhas nunca vira `recebido` — correto e intencional |
| Há **dois** caminhos de entrada física, e os dois chamam `darEntradaEstoque` | `:1342` (`processarNota`), `:1387` (`aprovarRecebimento`) | D1: um gancho só, dentro da função chamada pelos dois |
| `alterarStatusPedido` **não escreve auditoria** | `pedidoCompraService.js:449-455` | D7 decide *contra* a paridade, e diz por quê |
| `derivarAtraso` tira do atraso quem está em `['recebido','cancelado','rejeitado']` | `pedidoCompraService.js:748-761` | gravar `'recebido'` **é** o conserto do atraso; nenhuma régua nova |
| `ALERT_REGISTRY` tem **12** entradas (não 18, como o handoff da 41 dizia) | `alertRegistry.js`, 12 × `chave:` | corrigido no plano; é o defeito escapado da 41 (retro nº 4) |
| A entrada `PEDIDO_COMPRA_ATRASADO` **não** tem guarda `sqlite_master` | `alertRegistry.js:462-560`; nenhum `sqlite_master` no arquivo | D6 põe guarda na entrada NOVA; a velha vai para a letra G |
| O front já pinta `'recebido'` de verde no badge do pedido | `Compras.js:165` (cor), `:432` (o badge renderiza `{pedido.status \|\| 'pendente'}` — a string **crua**, minúscula); `'Recebido'` existe só como rótulo da **opção de filtro**, `:21` | **não há badge para fazer** — o galho de cliente encolhe para o cartão do alerta. ⚠️ A primeira versão desta linha dizia *"com rótulo «Recebido»"*: **errado**, e é da mesma classe de defeito de handoff que a retro nº 4 cataloga (F13 da Fase 2) |
| O cenário **(D)** da integração afirma `status === 'pendente'` e `atrasado === 1` depois de receber tudo, com a mensagem *"a RN-D12 precisa ser reescrita (nao e este teste que esta errado)"* | `comprasPedidoAtrasoIntegracao.api.test.js:245-291` | a 42 **inverte** este cenário de propósito (D8) |
| `pedido_item_id` só é gravado a partir das linhas do pedido resolvido | `resolverLinhaDoPedido`, `:667-696`; `:301` | `pedido_item_id != null` ⇒ pedido existe; mesmo assim D1 deriva o pedido por SQL |
| `varrerAlertasRegistrados` e `montarCentral` iteram o registro inteiro | `notificationQueueService.js:579-582`, `alertRegistry.js:573` | a entrada nova se matricula sozinha no job, na central e no e-mail |
| Baseline: `test:api` **195/195 arquivos** | rodado nesta Fase 0 | número de partida honesto |

### Divergência spec × código encontrada (regra 5 do CLAUDE.md)

`specs/modulo-almoxarifado/08-recebimento/README.md:3` lista como *"falta para 🟢"* o item **(1)
criação de pedido de compra no módulo Compras** — **entregue na Etapa 38**. A frase está
desatualizada desde então, e o handoff da 41 falou de um *"item (5)"* que **não existe** naquela
lista (ela tem 4). A Etapa 42 corrige a frase **à vista**, dizendo que estava errada, em vez de
reescrevê-la em silêncio.

## 3. Decisões (com o descartado)

**D1 — O gancho mora no FIM de `darEntradaEstoque`, depois do laço de itens.**
Depois do laço porque `RECEBIDO` é agregado: decidir por item faria um pedido de 2 linhas virar
`recebido` na primeira. Dentro de `darEntradaEstoque` (e não em `processarNota`) porque há dois
caminhos de entrada física e a Etapa 37 já pagou uma vez por esquecer o segundo. Os pedidos alvo
saem dos `pedido_item_id` dos itens que **entraram nesta execução** (os que casaram o claim),
resolvidos por SQL — não de `rec.pedido_compra_id`, que é redundante aqui e obrigaria a confiar num
invariante em vez de no dado.
*Descartado:* gancho em `processarNota` (perde `aprovarRecebimento`); gancho por item (fecha cedo).

⚠️ **O que "completo" ignora (F10 da Fase 2):** o agregado usa o recorte `material_id IS NOT NULL`,
que até aqui era régua de **leitura** e passa a ser régua de **escrita**. Um pedido com 1 linha de
material (10/10) + 1 linha de frete sem material fecha como `recebido` com o serviço não prestado.
**Medido:** `server/data/database.sqlite` tem 0 linhas em `itens_pedido_compra` e 0 em
`pedidos_compra`, e nenhum escritor da aplicação cria linha com `material_id NULL`
(`pedidoCompraService.js:624` manda a linha ruim para `ignorados`) — o caso só existe em acervo
importado por SQL. *Descartado:* somar **todas** as linhas — faria o pedido com frete **nunca**
fechar, que é o defeito mais provável dos dois e reintroduziria o beco que a etapa existe para fechar.

**D2 — O gancho só SOBE: nunca reverte `recebido` para `pendente`.**
O acumulador é `+ qtd` idempotente por claim e **não desfaz** — não existe estorno de
`quantidade_recebida` no módulo. Um gancho que descesse precisaria de uma régua de estorno que não
existe, e inventá-la aqui é regra nova sem demanda.
*Descartado:* reverter quando a situação volta a `PARCIAL`. Saída para o resto: o `PATCH` manual.

⚠️ **Emenda da Fase 2 (F7): o estorno EXISTE, e depois da RN-E01 ele apaga o último sinal.** A frase
acima ("não existe estorno de `quantidade_recebida`") é verdadeira ao pé da letra, mas o gesto real é
outro: `POST /api/almoxarifado/movimentacoes/:id/cancelar`
(`routes/almoxarifado/extended.js:798` → `stockService.cancelarMovimentacao:1425`,
`requirePermission('ajustar_estoque')`) reverte o **saldo** e não toca nem `quantidade_recebida` nem
`pedidos_compra.status`. Cenário: pedido de 10, recebimento de 10 → auto `recebido`; o almoxarife
descobre material errado e cancela a movimentação → estoque volta a 0 e o pedido fica `recebido`,
**fora** do `?atrasados=1` (RN-E10), **fora** do alerta de parcial (situação `RECEBIDO`) e **fora**
do `?pendentes=1` (saldo 0, desde a Etapa 37). **Antes da 42 o selo de atrasado era o sinal que
sobrava; agora não sobra nenhum.** Limitação **nova, criada por esta etapa**, assumida de propósito
(o alternativo é uma régua de estorno de pedido, que é etapa inteira): recuperação por
`PATCH .../status` + correção do `quantidade_recebida`. Vai para a **letra B** e para o guia do
usuário.

**D3 — Não sobrescreve status terminais do comprador.**
Só grava quando o status atual ∉ `{'cancelado','rejeitado','recebido'}`. `cancelado`/`rejeitado`
porque o aux `?pendentes=1` **não filtra status** (letra G da Etapa 38): a nota pode chegar num
pedido cancelado, e ressuscitá-lo para `recebido` seria decidir pelo comprador. `recebido` entra na
lista por idempotência (segundo recebimento não reescreve nem re-audita).
*Descartado:* gravar sempre que a situação derivada for `RECEBIDO`.

**D4 — Não-fatal, com guarda de tabela ausente.**
Mesmo molde do acumulador e do `gerarContaPagar`: `try/catch` com `console.warn`, e `sqlite_master`
antes de tocar `pedidos_compra`. Um `throw` aqui travaria a nota **com o estoque já creditado** e o
reprocessamento pularia os itens pelo claim — material no galpão, documento travado.
*Descartado:* propagar o erro.

**D5 — Uma régua, um dono: exportar em vez de copiar.**
`derivarRecebimentoDoPedido` entra no `module.exports`. Para o alerta, uma fonte **nova** sem
`LIMIT` e com `previsao_entrega`/`status` — `situacaoDosPedidosCompra(db, opts)` — que reusa a régua
exportada e **compartilha o SQL da soma** com `listarPedidosCompraAux` por constante, para a
agregação também ter um dono só. `listarPedidosCompraAux` **não muda**: o `LIMIT 50` dela é contrato
de tela, testado, e o `?pendentes=1` depende da posição do filtro.
*Descartado:* recalcular a situação dentro do `alertRegistry` (era exatamente o bloqueio que a spec
20 registrou); pendurar um parâmetro `semLimite` no aux (mexe na porta da tela por causa do e-mail).

**D6 — Alerta `PEDIDO_COMPRA_PARCIAL`, 13ª entrada do registro.**
População: situação `PARCIAL` **e** status ∉ `{'cancelado','rejeitado','recebido'}` — um pedido
cancelado no meio não é pendência, e um pedido que o comprador já marcou `recebido` à mão foi
decidido. Colunas **projetadas** (nunca `p.*`), prefixo `[Compras]`, require lazy, guarda
`sqlite_master`. Dedupe `pedido-parcial-<id>-<saldo_pendente>`: o saldo é o dado que **muda** a cada
chegada parcial nova, então cada remessa parcial avisa uma vez e um pedido parado no mesmo saldo não
repete — a lição do `pedido-atrasado-<id>` que calava o pedido para sempre.
*Descartado:* dedupe por mês (perde a chegada nova); dedupe só pelo id (silêncio permanente);
alerta agregado numa linha só (aqui a população é pequena e o comprador age **por pedido**).

**D7 — A mudança automática deixa rastro, embora o `PATCH` manual não deixe.**
`registrarAuditoria` com `entidade: 'pedido_compra'`, `acao: 'STATUS_AUTOMATICO_RECEBIDO'`,
autor = quem processou a nota, `dados_anteriores`/`dados_novos` com o status. Motivo para **romper**
a paridade com o `PATCH`: ali o autor é o próprio ato humano registrado na porta; aqui o pedido do
comprador muda **sozinho**, por um ato de outro módulo, e sem trilha ninguém responde "quem mudou
meu pedido". Escrita aditiva, em tabela do almoxarifado, dentro do mesmo `try` não-fatal.
*Descartado:* não auditar, por simetria com `alterarStatusPedido`.

**D8 — A RN-D12 da Etapa 39 é reescrita, declarando que estava certa até a 41.**
O cenário (D) da integração de atraso **afirma** hoje que receber tudo não muda o atraso; a 42
inverte isso de propósito. O cenário não é apagado: passa a afirmar o novo (`status = 'recebido'`,
`atrasado = 0`) com um comentário dizendo que a asserção anterior era **correta até a Etapa 41** e
por que mudou. Os blocos (E.9a)/(E.9b)/(E.9c) continuam válidos — o `PATCH`/`PUT` manual segue
sendo a saída para os casos que o gancho não cobre (D2/D3).

**D9 — Cliente: só o cartão do alerta.** Medido que o badge "Recebido" já existe. Entra uma entrada
em `COLUNAS_POR_CHAVE` para a chave nova (pedido, fornecedor, pedida/recebida, saldo, previsão),
senão o fallback genérico mostra `id` e campos crus. De carona, o comentário `:178` daquele arquivo
diz "a linha crua vem de `pedidos_compra` (SELECT p.*)" — **falso desde o F3 da Etapa 39**, que
trocou por colunas nomeadas; corrigido à vista.

**D10 — O alerta de parcial já enfileirado e PENDENTE não é suprimido quando o pedido fecha.**
Medido: a varredura que enfileira é **diária** (`DAILY_SCAN_INTERVAL_MS = 24h`,
`routes/almoxarifado.js:3785`) e o worker roda a cada N minutos (`WORKER_INTERVAL_MS`, `:3769`), então
a janela em que um pedido fecha **entre** o enfileiramento e o envio é de minutos. Existe precedente
para suprimir (`suprimirNotificacaoMovimentacao`, `notificationQueueService.js:415`, que vira a linha
`PENDENTE` em `FALHA`), mas ali o gatilho tem o id exato do evento; aqui a chave de dedupe carrega o
`saldo_pendente` **do momento do enfileiramento**, que o gancho não conhece — suprimir exigiria
varrer a fila por `payload LIKE`, uma segunda régua de casamento frágil. E o e-mail não fica falso:
o pedido **estava** parcial quando o aviso nasceu, e a fila **é** o histórico (D4 da Etapa 12).
*Descartado:* supressão por `payload LIKE`; dedupe sem o saldo (devolveria o silêncio permanente).
Corte declarado, na mesma classe da corrida residual já aceita naquele arquivo.

## 4. O que esta etapa NÃO faz

- Não cria máquina de estados do pedido: o `PATCH` da 39 continua aceitando qualquer um dos 7.
- Não mexe em `listarPedidosCompraAux` nem no `?pendentes=1`.
- Não conserta a falta de guarda `sqlite_master` da entrada `PEDIDO_COMPRA_ATRASADO` (letra G).
- Não faz conferência física estruturada nem divergência formal numerada (itens (2) e (3) da 08).
- Não faz comparação de cotações (feature 22 — exige entidade que a 41 descartou por design).
