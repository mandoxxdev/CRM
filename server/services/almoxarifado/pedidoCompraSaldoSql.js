// Etapa 72, T0 (D9/B351) — o NIVEL POR MATERIAL da regua do pedido de compra, num modulo proprio.
//
// Por que existe: ate a 72 esta subquery morava DENTRO de `receiptService.SOMA_POR_PEDIDO_SQL` (o
// nivel interno da agregacao de dois niveis da Etapa 42/71). A 72 passou a precisar da mesma soma
// em `purchaseService` (a solicitacao de compra fecha quando o MATERIAL dela completa no pedido) e
// `purchaseService` nao pode requerer `receiptService` — `receiptService` requer `purchaseService`
// no topo, e o ciclo entregaria um objeto pela metade. Escrever a soma de novo em `purchaseService`
// seria a SEGUNDA regua, exatamente o defeito que a Etapa 71 corrigiu no fechamento do pedido (a
// leitura agregava por material e o fechamento por pedido). Daqui saem as duas.
//
// Este arquivo NAO requer nenhum servico do almoxarifado (nem receiptService nem purchaseService):
// e texto SQL e uma lista. Quem quiser o epsilon importa de `./divergencia`, o dono dele.
//
// `material_id IS NOT NULL`: o mesmo recorte de `carregarItensPedidoCompra` e da regua de saldo do
// POST — linha de texto livre (frete, servico) nao da entrada no estoque e nao entra na conta.
const SOMA_POR_MATERIAL_SQL = `SELECT pedido_id, material_id,
      SUM(COALESCE(quantidade, 0)) as total_material,
      SUM(COALESCE(quantidade_recebida, 0)) as recebida_material
    FROM itens_pedido_compra WHERE material_id IS NOT NULL
    GROUP BY pedido_id, material_id`;

// O "status decidido" do pedido (minusculo, como `pedidos_compra.status` grava): a mesma lista da
// decisao 5 de `receiptService.fecharPedidosCompletos` (Etapa 42) — o fechamento automatico nao
// sobrescreve nenhum deles. Na 72 a lista tambem diz "pedido encerrado nao traz mais nada" (D3/B345):
// a solicitacao VINCULADO a ele nao conta no "a caminho" nem segura o dedupe do verificar-minimos.
const STATUS_PEDIDO_ENCERRADO = ['recebido', 'cancelado', 'rejeitado'];

// A lista como literal SQL (`'recebido','cancelado','rejeitado'`), para interpolar num `NOT IN (...)`.
// Interpolar e seguro: sao constantes deste arquivo, nunca entrada de usuario.
const STATUS_PEDIDO_ENCERRADO_SQL = STATUS_PEDIDO_ENCERRADO.map((s) => `'${s}'`).join(',');

module.exports = { SOMA_POR_MATERIAL_SQL, STATUS_PEDIDO_ENCERRADO, STATUS_PEDIDO_ENCERRADO_SQL };
