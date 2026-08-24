const { dbAll, dbGet } = require('./db');
const { disponivelSql } = require('./availabilitySql');
const { valorEstoqueSql, custoUnitarioSql } = require('./custoSql');
const { divergenciaRealSql } = require('./divergencia');
const { consumoJanelaSql, consumoJanelaParams } = require('./consumoSql');
const { TIPOS_SAIDA } = require('./movementTypes');

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

// Nome ficou historico (Etapa 11, Task 2): ate a Etapa 11 so trazia PENDENTE. A aba
// Solicitacoes da tela nova de reposicao le este mesmo relatorio, e a VINCULADA e EXATAMENTE a
// que esconde o material da sugestao (a_caminho conta as duas, RN-03) — so trazer PENDENTE
// deixava a solicitacao vinculada invisivel na tela inteira (Fase 2). Renomear tocaria o
// dispatcher de relatorios (routes/almoxarifado/extended.js) a toa; o nome ficou desatualizado
// de proposito.
async function relatorioSolicitacoesCompraPendentes(db) {
  return dbAll(db, `SELECT s.*, m.nome as material_nome, m.codigo as material_codigo
    FROM solicitacoes_compra_almoxarifado s
    JOIN materiais_almoxarifado m ON s.material_id = m.id
    WHERE s.status IN ('PENDENTE','VINCULADO') ORDER BY s.created_at`);
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

// Local, no mesmo padrao de purchaseService.lerConfigNumero (Etapa 11) — mesma chave
// ('reposicao_janela_consumo_dias'), nao uma config nova (Global Constraints da Etapa 13: a
// janela vem por querystring, sem amarracao nova em configuracoesGerais.api.test.js).
async function lerJanelaPadrao(db) {
  const row = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'reposicao_janela_consumo_dias'");
  const n = parseFloat(row?.valor);
  // Assimetria DECLARADA (revisao da Task 2, minor): a querystring exige inteiro >= 1 (400
  // literal), este parseFloat aceita '1.5' — mas o PUT /configuracoes valida a chave como
  // inteiro (PREFIXOS_DIAS da Etapa 11), entao um decimal aqui so entra por UPDATE manual no
  // banco. Mesmo parseFloat do lerConfigNumero da E11, de proposito (uma regua de leitura so).
  return Number.isFinite(n) && n > 0 ? n : 90;
}

/** Mediana de uma lista de numeros. Lista vazia -> 0 (nao ha material com consumo na janela). */
function mediana(valores) {
  if (!valores.length) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 !== 0 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2;
}

/**
 * RN-04 (Etapa 13, Task 2): indicadores gerenciais medidos pelas fontes UNICAS do modulo —
 * `custoUnitarioSql`/`valorEstoqueSql` (custo, custoSql.js), `TIPOS_SAIDA` (consumo,
 * movementTypes.js) e `consumoJanelaSql` (consumo POR MATERIAL numa janela — o mesmo fragmento
 * que `purchaseService.calcularSugestoes` usa desde a Etapa 11, extraido para `consumoSql.js`
 * nesta task, Global Constraints/C4). Material de cliente (`proprietario_cliente_id IS NOT
 * NULL`) fica FORA de giro/cobertura/rupturas/valor_por_grupo — nao e patrimonio nosso (D4/RN-04
 * do design). `m.ativo = 1` em todas as consultas por materiail: giro/cobertura/rupturas/valor
 * comparam contra o estoque ATUAL, que so faz sentido para material ativo (mesmo criterio de
 * `relatorioEstoqueAtual`).
 */
async function relatorioIndicadores(db, query = {}) {
  const bruto = query.janela_dias;
  let janela;
  if (bruto === undefined || bruto === null || bruto === '') {
    janela = await lerJanelaPadrao(db);
  } else {
    const n = Number(bruto);
    if (!Number.isInteger(n) || n <= 0) {
      throw Object.assign(new Error('Parâmetro "janela_dias" deve ser um número inteiro maior que zero'), { status: 400 });
    }
    janela = n;
  }

  const phSaida = TIPOS_SAIDA.map(() => '?').join(',');

  // ── Giro (aproximado, D4): valor consumido (TIPOS_SAIDA, na janela) / valor do estoque ──
  // ATUAL (nao ha snapshot historico — usar o valor atual como denominador e aproximacao
  // honesta, escrita na `nota` do registro). Custo SEMPRE via custoUnitarioSql (fonte unica) —
  // `SUM(qtd * m.custo_unitario)` a mao NAO seria pego pela varredura (Global Constraints, I2).
  const giroConsumido = await dbGet(db, `
    SELECT COALESCE(SUM(mv.quantidade * ${custoUnitarioSql('m')}), 0) AS valor
    FROM movimentacoes_almoxarifado mv
    JOIN materiais_almoxarifado m ON m.id = mv.material_id
    WHERE mv.cancelado = 0 AND mv.tipo IN (${phSaida})
      AND mv.created_at >= datetime('now', '-' || ? || ' days')
      AND m.ativo = 1 AND m.proprietario_cliente_id IS NULL`,
    [...TIPOS_SAIDA, janela]);
  const giroEstoque = await dbGet(db, `
    SELECT COALESCE(SUM(${valorEstoqueSql('m')}), 0) AS valor
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL`);
  const valorConsumido = Number(giroConsumido.valor) || 0;
  const valorEstoqueAtual = Number(giroEstoque.valor) || 0;
  // Arredondado (I8, medido): asserts exatos contra o arredondado; os dois operandos ficam no
  // payload SEM arredondar (comparados por Math.abs(a-b) < 1e-9 pelos consumidores).
  const indice = valorEstoqueAtual > 0 ? Number((valorConsumido / valorEstoqueAtual).toFixed(2)) : 0;

  // ── Cobertura (dias): disponivel / consumo medio diario da janela, POR MATERIAL — a MESMA ──
  // regua de consumo da Etapa 11 (consumoJanelaSql/TIPOS_SAIDA). Agregado por MEDIANA: media
  // seria distorcida por material sem consumo (cobertura "infinita"); material sem consumo na
  // janela fica FORA da mediana, contado a parte em `materiais_sem_consumo`.
  const coberturaRows = await dbAll(db, `
    SELECT ${disponivelSql('m')} AS disponivel, ${consumoJanelaSql('m')} AS consumo_janela
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL`,
    consumoJanelaParams(janela));
  const coberturas = [];
  let materiaisSemConsumo = 0;
  for (const r of coberturaRows) {
    const consumoJanela = Number(r.consumo_janela) || 0;
    if (consumoJanela > 0) {
      const diario = consumoJanela / janela;
      coberturas.push(Number(r.disponivel) / diario);
    } else {
      materiaisSemConsumo += 1;
    }
  }
  const medianaDias = Number(mediana(coberturas).toFixed(2));

  // ── Rupturas (regua CORRIGIDA, Fase 2/C5): saldo FISICO <= 0 causado por um EVENTO de tipo ──
  // em TIPOS_SAIDA ou AJUSTE_INVENTARIO. Tipos NEUTROS (LIBERACAO_RESERVA, BLOQUEIO, RESERVA...)
  // gravam `saldo_posterior = saldo_anterior` (stockService.js) — sem este filtro de tipo, um
  // material ja zerado atribuiria a 1a ruptura a um lancamento burocratico (medido). DECLARADO:
  // a regua olha o FISICO, nao o disponivel — material 100% reservado (disponivel 0) sem evento
  // de saida/ajuste na janela NAO aparece (contagem de EVENTO, nao de ESTADO); AJUSTE_INVENTARIO
  // que zera por contagem fisica CONTA, por decisao.
  const rupturasRows = await dbAll(db, `
    SELECT m.codigo, m.nome, MIN(mv.created_at) AS data
    FROM movimentacoes_almoxarifado mv
    JOIN materiais_almoxarifado m ON m.id = mv.material_id
    WHERE mv.cancelado = 0 AND mv.saldo_posterior <= 0
      AND mv.tipo IN (${phSaida}, ?)
      AND mv.created_at >= datetime('now', '-' || ? || ' days')
      AND m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    GROUP BY m.id
    ORDER BY data ASC`,
    [...TIPOS_SAIDA, 'AJUSTE_INVENTARIO', janela]);

  // ── Valor do estoque por grupo: valorEstoqueSql agrupado por categoria, so materiais ──
  // PROPRIOS (nao e patrimonio nosso valorar o do cliente).
  const valorPorGrupoRows = await dbAll(db, `
    SELECT COALESCE(m.categoria, 'Sem categoria') AS categoria,
           COALESCE(SUM(${valorEstoqueSql('m')}), 0) AS valor
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    GROUP BY COALESCE(m.categoria, 'Sem categoria')
    ORDER BY categoria`);

  // ── Atendimento de requisicoes (I7, medido): so ENTREGA COMPLETA — `data_entrega` tem UM ──
  // escritor (requisitionService.js:376) e so grava na entrega COMPLETA (parcial/encerrada sem
  // completar ficam fora). `total_consideradas` tem de vir do MESMO WHERE que filtra
  // data_entrega: um COUNT(*) fora desse WHERE contaria requisicao nao entregue (medido 3 vs 2)
  // enquanto o AVG (que ja ignora NULL sozinho) continuaria certo — os dois numeros
  // divergiriam. SEM filtro de janela, de proposito: ao contrario de giro/cobertura/rupturas
  // (que a RN-04 declara "na janela" explicitamente), a regua do atendimento no design nao
  // menciona janela — decisao registrada no relatorio de fechamento desta task (reversivel).
  const atendimento = await dbGet(db, `
    SELECT AVG((julianday(data_entrega) - julianday(created_at)) * 24) AS media_horas,
           COUNT(*) AS total_consideradas
    FROM requisicoes_almoxarifado
    WHERE data_entrega IS NOT NULL`);
  const totalConsideradas = Number(atendimento.total_consideradas) || 0;
  const mediaHoras = totalConsideradas > 0 ? Number((atendimento.media_horas || 0).toFixed(2)) : 0;

  return {
    janela_dias: janela,
    giro: { valor_consumido: valorConsumido, valor_estoque_atual: valorEstoqueAtual, indice },
    cobertura: { mediana_dias: medianaDias, materiais_sem_consumo: materiaisSemConsumo },
    rupturas: {
      total: rupturasRows.length,
      materiais: rupturasRows.map((r) => ({ codigo: r.codigo, nome: r.nome, data: r.data })),
    },
    valor_por_grupo: valorPorGrupoRows.map((r) => ({ categoria: r.categoria, valor: Number(r.valor) || 0 })),
    atendimento_requisicoes: { media_horas: mediaHoras, total_consideradas: totalConsideradas },
  };
}

module.exports = {
  relatorioEstoqueAtual, relatorioAbaixoMinimo, relatorioReservadoPorOS,
  relatorioConsumoPorOS, relatorioMateriaisMaisConsumidos, relatorioRecebimentosPendentes,
  relatorioMateriaisBloqueados, relatorioHistoricoMovimentacoes, relatorioInventarioDivergencias,
  relatorioConsumoPeriodo, relatorioFerramentasEmprestadas, relatorioEPIPorColaborador,
  relatorioSolicitacoesCompraPendentes, relatorioSucataFinanceiro, relatorioIndicadores,
};
