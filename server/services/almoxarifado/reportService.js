const { dbAll, dbGet } = require('./db');
const { disponivelSql } = require('./availabilitySql');
const { valorEstoqueSql, custoUnitarioSql } = require('./custoSql');
const { divergenciaRealSql } = require('./divergencia');

async function relatorioEstoqueAtual(db) {
  // Etapa 8, Task 1 (classe A): relatorio de posicao do estoque PROPRIO. valor_total somando
  // material de cliente contabilizaria patrimonio de terceiro como nosso. A posicao POR CLIENTE
  // tem tela e rota proprias (clienteEstoqueService, Task 8).
  return dbAll(db, `SELECT m.*,
    ${disponivelSql('m')} as disponivel,
    ${valorEstoqueSql('m')} as valor_total
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    ORDER BY m.categoria, m.nome`);
}

async function relatorioAbaixoMinimo(db) {
  // Etapa 8, Task 1 (classe A): mesma semantica de reposicao do alertService — material de
  // cliente nao se repoe.
  return dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
      AND proprietario_cliente_id IS NULL
    ORDER BY (quantidade_atual / NULLIF(quantidade_minima, 0))`);
}

async function relatorioReservadoPorOS(db, osId) {
  let sql = `SELECT r.*, m.nome as material_nome, m.codigo as material_codigo, m.unidade
    FROM reservas_material_almoxarifado r
    JOIN materiais_almoxarifado m ON r.material_id = m.id
    WHERE r.status = 'ATIVA'`;
  const params = [];
  if (osId) { sql += ' AND (r.os_id = ? OR r.os_referencia = ?)'; params.push(osId, String(osId)); }
  sql += ' ORDER BY r.created_at DESC';
  return dbAll(db, sql, params);
}

async function relatorioConsumoPorOS(db, osId, dataInicio, dataFim) {
  let sql = `SELECT m.material_id, ma.nome, ma.codigo, SUM(m.quantidade) as total_consumido, m.os_id
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo IN ('SAIDA','SAIDA_PRODUCAO','SAIDA_MONTAGEM','SAIDA_ASSISTENCIA') AND m.cancelado = 0`;
  const params = [];
  if (osId) { sql += ' AND m.os_id = ?'; params.push(osId); }
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  sql += ' GROUP BY m.material_id, m.os_id ORDER BY total_consumido DESC';
  return dbAll(db, sql, params);
}

async function relatorioRecebimentosPendentes(db) {
  return dbAll(db, `SELECT * FROM recebimentos_material_almoxarifado
    WHERE status IN ('RECEBIDO','EM_CONFERENCIA','PARCIALMENTE_APROVADO') ORDER BY created_at`);
}

async function relatorioMateriaisBloqueados(db) {
  // Etapa 8, Task 1, classe C da auditoria: NAO filtra o dono de proposito. E relatorio de
  // QUALIDADE — material de cliente bloqueado e exatamente o que o almoxarife precisa ver, e
  // esconde-lo aqui apagaria fato fisico real. O selo de propriedade (Task 9) e o que evita a
  // confusao, nao o filtro. Nao "uniformizar" com relatorioEstoqueAtual logo acima.
  return dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND COALESCE(quantidade_bloqueada,0) > 0 ORDER BY nome`);
}

async function relatorioHistoricoMovimentacoes(db, filters = {}) {
  let sql = `SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id WHERE m.cancelado = 0`;
  const params = [];
  if (filters.material_id) { sql += ' AND m.material_id = ?'; params.push(filters.material_id); }
  if (filters.tipo) { sql += ' AND m.tipo = ?'; params.push(filters.tipo); }
  if (filters.data_inicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(filters.data_inicio); }
  if (filters.data_fim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(filters.data_fim); }
  sql += ' ORDER BY m.created_at DESC LIMIT 500';
  return dbAll(db, sql, params);
}

// Revisao final da Etapa 10b: (1) so conferencia CONCLUIDO — sem o filtro, este relatorio
// vazava quantidade_sistema/divergencia/contado_por de contagem EM ANDAMENTO e desfazia o modo
// cego e a dupla contagem por fora (relatorio de divergencia sobre contagem inacabada nem faz
// sentido); (2) a comparacao exata `!= 0` era uma SEGUNDA definicao de "e divergencia" —
// deriva de float (7e-16) aparecia aqui como divergente enquanto a acuracidade dizia 100%.
// A definicao unica mora em divergencia.js.
async function relatorioInventarioDivergencias(db) {
  return dbAll(db, `SELECT ic.*, c.numero as conferencia_numero, ma.nome as material_nome, ma.codigo
    FROM itens_conferencia_almoxarifado ic
    JOIN conferencias_almoxarifado c ON ic.conferencia_id = c.id
    JOIN materiais_almoxarifado ma ON ic.material_id = ma.id
    WHERE c.status = 'CONCLUIDO' AND ic.divergencia IS NOT NULL AND ${divergenciaRealSql('ic.divergencia')}
    ORDER BY c.created_at DESC LIMIT 500`);
}

async function relatorioMateriaisMaisConsumidos(db, dataInicio, dataFim) {
  let sql = `SELECT ma.id as material_id, ma.nome, ma.codigo, ma.unidade, SUM(m.quantidade) as total_consumido
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo IN ('SAIDA','SAIDA_PRODUCAO','SAIDA_MONTAGEM','SAIDA_ASSISTENCIA') AND m.cancelado = 0`;
  const params = [];
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  sql += ' GROUP BY ma.id ORDER BY total_consumido DESC LIMIT 10';
  return dbAll(db, sql, params);
}

async function relatorioConsumoPeriodo(db, dataInicio, dataFim, projetoId, clienteId) {
  let sql = `SELECT ma.categoria, ma.nome, SUM(m.quantidade) as total, m.projeto_id, m.cliente_id
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo LIKE 'SAIDA%' AND m.cancelado = 0`;
  const params = [];
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  if (projetoId) { sql += ' AND m.projeto_id = ?'; params.push(projetoId); }
  if (clienteId) { sql += ' AND m.cliente_id = ?'; params.push(clienteId); }
  sql += ' GROUP BY ma.id, m.projeto_id, m.cliente_id ORDER BY total DESC';
  return dbAll(db, sql, params);
}

async function relatorioFerramentasEmprestadas(db) {
  return dbAll(db, `SELECT e.*, f.nome, f.codigo_patrimonio FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id
    WHERE e.status = 'EMPRESTADA' ORDER BY e.data_retirada`);
}

async function relatorioEPIPorColaborador(db) {
  return dbAll(db, `SELECT e.colaborador_nome, e.setor, f.nome as ferramenta, e.data_retirada
    FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id
    WHERE f.tipo = 'EPI' AND e.status = 'EMPRESTADA'`);
}

async function relatorioSolicitacoesCompraPendentes(db) {
  return dbAll(db, `SELECT s.*, m.nome as material_nome, m.codigo as material_codigo
    FROM solicitacoes_compra_almoxarifado s
    JOIN materiais_almoxarifado m ON s.material_id = m.id
    WHERE s.status = 'PENDENTE' ORDER BY s.created_at`);
}

/**
 * Relatorio financeiro de sucata (Etapa 9, Task 7 — consumidor declarado da spec 12).
 *
 * ── POR QUE ELE LE O LIVRO, E NAO SO `sucateamentos_almoxarifado` ────────────────────────────
 *
 * `sucateamentos_almoxarifado` (Task 6) so tem as sucatas do processo NOVO de dupla aprovacao.
 * Mas ha outra origem: a devolucao ao cliente com destino SUCATA (returnService.registrarDevolucao,
 * Etapa 7) TAMBEM emite uma linha `SUCATA` em `movimentacoes_almoxarifado` — o material ja tinha
 * saido fisicamente na entrega, entao a devolucao nao passa (nem precisa passar) pelas duas
 * assinaturas. Ela e sucata tao real quanto a outra, e um relatorio financeiro que so somasse
 * `sucateamentos_almoxarifado` subcontaria o total. Por isso a fonte de `movimentacoes` aqui e o
 * LIVRO (`tipo = 'SUCATA' AND cancelado = 0`), e o LEFT JOIN com `sucateamentos_almoxarifado` (por
 * `movimentacao_sucata_id`) so serve para trazer a `classificacao` QUANDO ela existe — a devolucao
 * nao tem esse campo, e fica `null` (agrupada como "SEM CLASSIFICACAO" abaixo).
 *
 * ── VALORACAO: custo ATUAL, nao historico (decisao 10 da 8c, deliberada) ────────────────────
 *
 * `valor_estimado = quantidade * custoUnitarioSql('ma')` — FONTE UNICA do custo unitario
 * (custoSql.js; `tests/api/custoUnitarioFonteUnica.api.test.js` varre o codigo-fonte atras de
 * quem reescrever essa conta a mao). A movimentacao NAO guarda o custo de quando saiu, entao o
 * valor reportado e sempre pelo custo de HOJE — se o custo do material mudou desde a baixa, o
 * relatorio de um periodo passado muda junto. A `nota` no retorno existe para a tela nao deixar
 * isso implicito.
 *
 * `vendas` (sucateamentos VENDIDA, `valor_venda` somado) e o valor FINANCEIRO real, declarado por
 * quem assinou a aprovacao — nao estimado. As duas somas nao sao a mesma pergunta: uma e "quanto
 * valia pelo custo de hoje", a outra e "quanto realmente entrou".
 */
async function relatorioSucataFinanceiro(db, { de, ate } = {}) {
  let sqlMov = `SELECT m.id, m.material_id, ma.codigo AS material_codigo, ma.nome AS material_nome,
      ma.unidade, m.quantidade, m.created_at, m.referencia, s.classificacao,
      (m.quantidade * ${custoUnitarioSql('ma')}) AS valor_estimado
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON ma.id = m.material_id
    LEFT JOIN sucateamentos_almoxarifado s ON s.movimentacao_sucata_id = m.id
    WHERE m.tipo = 'SUCATA' AND m.cancelado = 0`;
  const paramsMov = [];
  if (de) { sqlMov += ' AND DATE(m.created_at) >= ?'; paramsMov.push(de); }
  if (ate) { sqlMov += ' AND DATE(m.created_at) <= ?'; paramsMov.push(ate); }
  sqlMov += ' ORDER BY m.created_at DESC';
  const movimentacoes = await dbAll(db, sqlMov, paramsMov);

  let sqlVendas = `SELECT s.id, s.material_id, ma.codigo AS material_codigo, ma.nome AS material_nome,
      s.quantidade, s.valor_venda, s.classificacao, s.destino_registrado_em
    FROM sucateamentos_almoxarifado s
    JOIN materiais_almoxarifado ma ON ma.id = s.material_id
    WHERE s.status = 'VENDIDA'`;
  const paramsVendas = [];
  if (de) { sqlVendas += ' AND DATE(s.destino_registrado_em) >= ?'; paramsVendas.push(de); }
  if (ate) { sqlVendas += ' AND DATE(s.destino_registrado_em) <= ?'; paramsVendas.push(ate); }
  sqlVendas += ' ORDER BY s.destino_registrado_em DESC';
  const vendas = await dbAll(db, sqlVendas, paramsVendas);

  // Agrupamento por classificacao — feito em JS, nao em SQL: e a soma de DUAS consultas
  // independentes (movimentacoes e vendas), e um GROUP BY so enxergaria uma das duas.
  const porClassificacao = new Map();
  const bucket = (classificacao) => {
    const chave = classificacao || 'SEM CLASSIFICACAO';
    if (!porClassificacao.has(chave)) {
      porClassificacao.set(chave, {
        classificacao: chave, quantidade: 0, valor_estimado: 0, valor_vendido: 0,
      });
    }
    return porClassificacao.get(chave);
  };

  let quantidadeTotal = 0;
  let valorEstimadoTotal = 0;
  for (const m of movimentacoes) {
    quantidadeTotal += Number(m.quantidade) || 0;
    valorEstimadoTotal += Number(m.valor_estimado) || 0;
    const b = bucket(m.classificacao);
    b.quantidade += Number(m.quantidade) || 0;
    b.valor_estimado += Number(m.valor_estimado) || 0;
  }
  let valorVendidoTotal = 0;
  for (const v of vendas) {
    valorVendidoTotal += Number(v.valor_venda) || 0;
    bucket(v.classificacao).valor_vendido += Number(v.valor_venda) || 0;
  }

  return {
    periodo: { de: de || null, ate: ate || null },
    movimentacoes,
    vendas,
    totais: {
      quantidade_sucateada: quantidadeTotal,
      valor_estimado_total: valorEstimadoTotal,
      valor_vendido_total: valorVendidoTotal,
    },
    por_classificacao: Array.from(porClassificacao.values()),
    nota: 'Valor estimado calculado pelo custo ATUAL do material (custoUnitarioSql) — a movimentacao '
      + 'nao guarda custo historico, entao a valoracao nao reflete necessariamente o custo de quando '
      + 'o material saiu (decisao 10 da 8c). O valor vendido, esse sim, e o declarado na aprovacao.',
  };
}

module.exports = {
  relatorioEstoqueAtual, relatorioAbaixoMinimo, relatorioReservadoPorOS,
  relatorioConsumoPorOS, relatorioMateriaisMaisConsumidos, relatorioRecebimentosPendentes,
  relatorioMateriaisBloqueados, relatorioHistoricoMovimentacoes, relatorioInventarioDivergencias,
  relatorioConsumoPeriodo, relatorioFerramentasEmprestadas, relatorioEPIPorColaborador,
  relatorioSolicitacoesCompraPendentes, relatorioSucataFinanceiro,
};
