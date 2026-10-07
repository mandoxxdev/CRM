/**
 * Etapa 40, Task 3 — a cotacao de compra (cabecalho: `cotacoes`, `server/index.js:19244-19256`).
 * Etapa 41, Task 2 — a cotacao ganha ITENS (`itens_cotacao`, `schema.js`), total derivado, lixeira
 * PROPRIA (`excluirCotacao`) e a CONVERSAO em pedido (`gerarPedidoDaCotacao`).
 *
 * E o MESMO molde do pedido (`pedidoCompraService.js`): a rota nao faz SQL, o servico lanca
 * `erro(msg, status)` e a rota traduz `e.status`. `erro`, `assertFornecedor`, a literal de
 * fornecedor e (desde a 41) `resolverItens` sao IMPORTADOS de la, nao copiados — duas frases
 * "Fornecedor não encontrado" / "Material não encontrado" divergiriam na primeira edicao.
 *
 * `numero` e DIGITADO (contrato de `numeroDoc.js:44-64`; D6 do design da 40) e `UNIQUE` na DDL. O
 * 409 e checado ANTES do INSERT/UPDATE (`SELECT id … WHERE numero = ? AND id <> ?`) E traduzido no
 * catch de `SQLITE_CONSTRAINT … cotacoes.numero`: sao duas guardas porque a corrida entre o SELECT
 * e o INSERT existe (sem transacao, como o resto desta base ate o Postgres). A segunda guarda so e
 * exercida por corrida — a sabotagem 5 da Task 3 da 40 removeu-a e nada caiu, e isso e PREVISTO.
 *
 * Ate a Etapa 40 nao havia itens de cotacao (zero `cotacao_itens` no sistema, medido) e
 * `valor_total` era SO campo de entrada (D8 da 40). Desde a 41 (D2/D3 do design) `itens` e
 * OPCIONAL e `valor_total` tem DUAS regras: com itens e DERIVADO (Σ quantidade × valor_unitario, o
 * do payload e ignorado, como no pedido); sem itens continua sendo o do payload (default 0) — o
 * "R$ 1.500 o lote" sem discriminar segue valido.
 *
 * ⚠️ O MODO DE FALHA DESTA ETAPA (cabecalho do plano da 41): a FK `itens_cotacao.cotacao_id` NAO
 * dispara no harness (`foreign_keys = 0`) e dispara em producao. Um `DELETE FROM cotacoes` que nao
 * apague os filhos antes passa aqui deixando orfaos e da 500 la. `excluirCotacao` apaga os filhos
 * PRIMEIRO, e o cenario (7) de `comprasCotacaoItens` conta orfaos em vez de olhar o status. Desde a onda de
 * correcao da 41 (F2), `comprasCotacaoFkProducao.api.test.js` prova a ORDEM com a FK LIGADA (segundo
 * banco com a DDL de producao): sabotagem de ordem passa no harness e cai la.
 */
const { dbRun, dbGet, dbAll } = require('../almoxarifado/db');
const pedidoCompraService = require('./pedidoCompraService');
const { erro, assertFornecedor, resolverItens } = pedidoCompraService;

const COTACAO_NAO_ENCONTRADA = 'Cotação não encontrada';
const FORNECEDOR_COM_COTACOES = 'Fornecedor possui cotações — não pode ser excluído';
const COTACAO_EXCLUIDA = 'Cotação excluída com sucesso';
const COTACAO_SEM_ITENS = 'cotação sem itens não pode gerar pedido';
const FORNECEDOR_INATIVO_CONVERSAO = 'Fornecedor inativo — reative-o em Compras → Fornecedores antes de gerar o pedido';
const STATUS_QUE_NAO_GERA = ['rejeitado', 'cancelado'];
const numeroDuplicado = (numero) => `Já existe uma cotação com o número ${numero}`;
const cotacaoStatusNaoGera = (status) => `cotação ${status} não pode gerar pedido`;
const cotacaoJaGerouPedido = (numero, pc) => `Cotação ${numero} já gerou o pedido ${pc}`;
const cotacaoJaGerouPedidoExclusao = (numero, pc) => `${cotacaoJaGerouPedido(numero, pc)} — não pode ser excluída`;
const cotacaoJaGerouPedidoEdicao = (numero, pc) => `${cotacaoJaGerouPedido(numero, pc)} — não pode mais ser editada`;
// Fase 2 (I1/I2): depois que o pedido e excluido, `excluirPedido` LIBERA a cotacao (pedido_id volta
// a NULL), entao `pedido_numero` null com `pedido_id` gravado so acontece por SQL direto — mesmo
// assim a frase nao pode dizer "pedido null".
const rotuloPedido = (c) => c.pedido_numero || `#${c.pedido_id}`;

const SELECT_LINHA = `SELECT c.id, c.numero, c.fornecedor_id, f.razao_social AS fornecedor_nome, c.valor_total,
  c.data_cotacao, c.validade, c.status, c.observacoes, c.pedido_id, p.numero AS pedido_numero, c.created_at, c.updated_at
  FROM cotacoes c LEFT JOIN fornecedores f ON f.id = c.fornecedor_id LEFT JOIN pedidos_compra p ON p.id = c.pedido_id`;

/** As linhas na ordem de lancamento (`ORDER BY id`), com o que a tela de edicao precisa por linha. */
async function lerItens(db, cotacaoId) {
  return dbAll(db, `SELECT id, material_id, codigo, descricao, unidade, quantidade, valor_unitario
    FROM itens_cotacao WHERE cotacao_id = ? ORDER BY id`, [cotacaoId]);
}

async function obterCotacao(db, id) {
  const linha = await dbGet(db, `${SELECT_LINHA} WHERE c.id = ?`, [id]);
  if (!linha) throw erro(COTACAO_NAO_ENCONTRADA, 404);
  linha.itens = await lerItens(db, id);
  return linha;
}

/** Normaliza o corpo JA validado pelo `CotacaoSchema` para as colunas da tabela. */
function colunas(dados) {
  return {
    numero: String(dados.numero).trim(),
    fornecedor_id: dados.fornecedor_id,
    valor_total: dados.valor_total == null ? 0 : dados.valor_total,
    data_cotacao: dados.data_cotacao || null,
    validade: dados.validade || null,
    status: dados.status || 'em_analise',
    observacoes: dados.observacoes == null ? null : dados.observacoes,
  };
}

async function assertNumeroLivre(db, numero, idAtual) {
  const outra = await dbGet(db, 'SELECT id FROM cotacoes WHERE numero = ? AND id <> ?', [numero, idAtual || 0]);
  if (outra) throw erro(numeroDuplicado(numero), 409);
}

const traduzUnique = (e, numero) => (
  /SQLITE_CONSTRAINT.*cotacoes\.numero/.test(e && e.message) ? erro(numeroDuplicado(numero), 409) : e
);

// RN-F03: a MESMA conta do pedido (`criarPedido`), sobre as linhas ja resolvidas — ARREDONDADA a 2 casas
// (onda de correcao da 41, F3b = UX I2): 3 x 0.1 em double e 0.30000000000000004, e esse lixo ia para o
// banco e para o campo travado da tela. Descartado: arredondar so no cliente — o `valor_total` gravado e
// o que a lista le. (O `criarPedido` continua somando cru: fora do escopo desta onda, registrado.)
const somaItens = (itens) => Math.round(itens.reduce((s, i) => s + Number(i.quantidade) * Number(i.valor_unitario || 0), 0) * 100) / 100;

/** RN-F05: substituicao total — `DELETE` + `INSERT`, como o `PUT` do pedido. */
async function gravarItens(db, cotacaoId, resolvidos) {
  await dbRun(db, 'DELETE FROM itens_cotacao WHERE cotacao_id = ?', [cotacaoId]);
  for (const it of resolvidos) {
    await dbRun(db, `INSERT INTO itens_cotacao (cotacao_id, material_id, codigo, descricao, quantidade, valor_unitario, unidade)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [cotacaoId, it.material_id, it.codigo, it.descricao, it.quantidade, it.valor_unitario, it.unidade]);
  }
}

async function criarCotacao(db, dados) {
  const c = colunas(dados);
  const itens = Array.isArray(dados.itens) ? dados.itens : [];
  await assertFornecedor(db, c.fornecedor_id);
  // RN-F01: TODOS os materiais antes de qualquer escrita — sem transacao, descobrir na segunda
  // linha que o material nao existe deixaria o cabecalho gravado; o cenario (4) conta `cotacoes`.
  const resolvidos = await resolverItens(db, itens);
  await assertNumeroLivre(db, c.numero, null);
  if (resolvidos.length) c.valor_total = somaItens(resolvidos);   // RN-F03: o payload e ignorado
  let r;
  try {
    r = await dbRun(db, `INSERT INTO cotacoes (numero, fornecedor_id, valor_total, data_cotacao, validade, status, observacoes)
      VALUES (?, ?, ?, ?, ?, ?, ?)`, [c.numero, c.fornecedor_id, c.valor_total, c.data_cotacao, c.validade, c.status, c.observacoes]);
  } catch (e) { throw traduzUnique(e, c.numero); }
  await gravarItens(db, r.lastID, resolvidos);
  return obterCotacao(db, r.lastID);
}

async function atualizarCotacao(db, id, dados) {
  const atual = await obterCotacao(db, id); // 404 antes de qualquer validacao de negocio
  // RN-F15 (Fase 2, I3): convertida nao se edita — o pedido ja nasceu; mexer na cotacao depois
  // seria rastro falso (e o status voltaria de 'aprovado' com pedido_id gravado).
  if (atual.pedido_id != null) throw erro(cotacaoJaGerouPedidoEdicao(atual.numero, rotuloPedido(atual)), 409);
  const c = colunas(dados);
  const itens = Array.isArray(dados.itens) ? dados.itens : [];   // RN-F05: sem itens = apaga as linhas
  await assertFornecedor(db, c.fornecedor_id);
  const resolvidos = await resolverItens(db, itens);
  await assertNumeroLivre(db, c.numero, id);
  if (resolvidos.length) c.valor_total = somaItens(resolvidos);
  try {
    await dbRun(db, `UPDATE cotacoes SET numero = ?, fornecedor_id = ?, valor_total = ?, data_cotacao = ?, validade = ?,
      status = ?, observacoes = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [c.numero, c.fornecedor_id, c.valor_total, c.data_cotacao, c.validade, c.status, c.observacoes, id]);
  } catch (e) { throw traduzUnique(e, c.numero); }
  await gravarItens(db, id, resolvidos);
  return obterCotacao(db, id);
}

/**
 * RN-F06 — a lixeira PROPRIA (D9). Ate a Etapa 40 o generico `DELETE /api/compras/:tipo/:id` apagava
 * `cotacoes` cru; com `itens_cotacao` (FK) isso da 500 em producao e passa no harness deixando orfaos.
 */
async function excluirCotacao(db, id) {
  const c = await obterCotacao(db, id);
  if (c.pedido_id != null) throw erro(cotacaoJaGerouPedidoExclusao(c.numero, rotuloPedido(c)), 409);
  // ⚠️ REIVINDICAR ANTES DE APAGAR (re-revisao da onda da 41, I1). O 409 acima le `pedido_id NULL`,
  // mas um `gerar-pedido` em voo pode vencer o CAS dele entre esta leitura e o `DELETE` — o (12) da
  // suite, que dispara os dois no mesmo tick, nunca via; com o DELETE chegando algumas voltas do
  // event loop depois (28 de 301 janelas na sonda), a cotacao era apagada por baixo do pedido recem
  // criado: pedido vivo, orfao, no aux do recebimento. Este UPDATE e o CAS simetrico ao do gerar:
  // marca `cancelado` SO se ninguem vinculou pedido; 0 linhas = o gerar venceu -> 409 com o vencedor.
  // E o CAS do gerar, por sua vez, recusa `cancelado` — quem marcou primeiro ganha, nos dois sentidos.
  // Descartado: apagar a cotacao com `DELETE ... WHERE pedido_id IS NULL` direto — a FK de
  // `itens_cotacao` exige os filhos apagados ANTES, e apagar filhos de uma cotacao que outro esta
  // convertendo e o mesmo furo por outra porta.
  const claim = await dbRun(db,
    "UPDATE cotacoes SET status = 'cancelado', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND pedido_id IS NULL", [id]);
  if (!claim.changes) {
    const atual = await obterCotacao(db, id); // 404 se sumiu no meio
    throw erro(cotacaoJaGerouPedidoExclusao(atual.numero, rotuloPedido(atual)), 409);
  }
  // Filhos PRIMEIRO: a FK nao dispara no harness e dispara em producao (ver o cabecalho do plano da 41).
  await dbRun(db, 'DELETE FROM itens_cotacao WHERE cotacao_id = ?', [id]);
  await dbRun(db, 'DELETE FROM cotacoes WHERE id = ?', [id]);
  return { message: COTACAO_EXCLUIDA };
}

/**
 * RN-F07…RN-F11 — a conversao (D5). Guardas NESTA ordem: 409 ja gerou -> status -> itens ->
 * fornecedor existe (`assertFornecedor`, 400 'Fornecedor não encontrado') -> fornecedor inativo. O
 * `assertFornecedor` tem de vir ANTES do `SELECT status`: com o fornecedor apagado (alcancavel so no
 * harness, FK desligada) `f` seria `undefined` e o 400 sairia com a frase errada.
 *
 * RN-F11/D8: e a PRIMEIRA porta do Compras a olhar `status` do fornecedor. `assertFornecedor` continua
 * sem olhar (o `POST /pedidos` direto segue aceitando inativo — D5 da 40).
 */
async function gerarPedidoDaCotacao(db, id, user) {
  const c = await obterCotacao(db, id);
  if (c.pedido_id != null) throw erro(cotacaoJaGerouPedido(c.numero, rotuloPedido(c)), 409);
  if (STATUS_QUE_NAO_GERA.includes(c.status)) throw erro(cotacaoStatusNaoGera(c.status));
  if (!c.itens.length) throw erro(COTACAO_SEM_ITENS);
  await assertFornecedor(db, c.fornecedor_id);
  const f = await dbGet(db, 'SELECT status FROM fornecedores WHERE id = ?', [c.fornecedor_id]);
  if (f && f.status === 'inativo') throw erro(FORNECEDOR_INATIVO_CONVERSAO);
  const pedido = await pedidoCompraService.criarPedido(db, {
    fornecedor_id: c.fornecedor_id,
    // Fase 2 (I4): `criarPedido` NAO poe default em data_pedido (`camposDoCabecalho` pula undefined,
    // DDL sem default) — sem esta linha o pedido gerado nascia com data NULL. Mesmo precedente de
    // `importarPedidos`.
    data_pedido: pedidoCompraService.hojeLocalISO(),
    observacoes: c.observacoes,
    itens: c.itens.map((i) => ({ material_id: i.material_id, quantidade: i.quantidade, valor_unitario: i.valor_unitario })),
  }, user);
  // ⚠️ O UPDATE E A GUARDA (onda de correcao da 41, F1 = RN I1/M3 = UX C1). O 409 la em cima e o
  // caminho RAPIDO, nao a protecao: entre ele e este ponto ha uma dezena de `await`, e sem transacao
  // (como o resto ate o Postgres) N chamadas concorrentes leem `pedido_id NULL` e criam N pedidos —
  // medido por sonda: 6 POSTs em paralelo -> 6 x 201, cinco pedidos sem cotacao apontando, todos
  // visiveis no aux do recebimento; duplo clique na tela reproduz com dois. O `AND pedido_id IS NULL`
  // faz do UPDATE um compare-and-set: uma unica chamada afeta 1 linha, as outras afetam 0. Tambem
  // cobre a corrida com `DELETE /cotacoes/:id` (a cotacao sumiu -> 0 linhas -> o pedido nao pode ficar).
  // D7: gerar o pedido E aprovar — sem isto a lista mostraria "Em Análise" com pedido gerado.
  // `AND status NOT IN ('rejeitado', 'cancelado')` (re-revisao, I1): `excluirCotacao` reivindica a
  // cotacao marcando `cancelado` antes de apagar; sem esta clausula o gerar venceria o CAS sobre uma
  // cotacao ja reivindicada e o DELETE a apagaria por baixo do pedido.
  const vinculo = await dbRun(db,
    "UPDATE cotacoes SET pedido_id = ?, status = 'aprovado', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND pedido_id IS NULL AND status NOT IN ('rejeitado', 'cancelado')",
    [pedido.id, id]);
  if (!vinculo.changes) {
    // Perdeu a corrida (ou a cotacao foi apagada no meio): COMPENSAR — o pedido que acabou de nascer
    // nao e apontado por cotacao nenhuma, entao `excluirPedido` passa com FK ON (libera 0 cotacoes,
    // 0 solicitacoes, apaga linhas e cabecalho). Depois, o mesmo 409 da checagem rapida, com o
    // vencedor relido; se a cotacao nao existe mais, `obterCotacao` lanca o 404.
    // Descartado: fila em memoria por id de cotacao (molde de `enqueueWrite`) — o CAS cobre as duas
    // corridas sem estado no processo.
    await pedidoCompraService.excluirPedido(db, pedido.id);
    const atual = await obterCotacao(db, id);
    // Perdeu para a EXCLUSAO (re-revisao I1): a cotacao ainda existe por um instante, marcada
    // `cancelado` e sem pedido — a frase certa e a de status, nao "ja gerou o pedido #null".
    if (atual.pedido_id == null) throw erro(cotacaoStatusNaoGera(atual.status));
    throw erro(cotacaoJaGerouPedido(atual.numero, rotuloPedido(atual)), 409);
  }
  return pedidoCompraService.obterPedido(db, pedido.id);
}

module.exports = {
  criarCotacao, obterCotacao, atualizarCotacao, excluirCotacao, gerarPedidoDaCotacao,
  COTACAO_NAO_ENCONTRADA, FORNECEDOR_COM_COTACOES, COTACAO_EXCLUIDA, COTACAO_SEM_ITENS, FORNECEDOR_INATIVO_CONVERSAO,
  numeroDuplicado, cotacaoStatusNaoGera, cotacaoJaGerouPedido, cotacaoJaGerouPedidoExclusao, cotacaoJaGerouPedidoEdicao, rotuloPedido,
};
