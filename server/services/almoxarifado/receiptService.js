const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
const { registrarMovimentacao } = require('./stockService');

const STATUS = {
  RECEBIDO: 'RECEBIDO',
  EM_CONFERENCIA: 'EM_CONFERENCIA',
  CONFERIDO_ALMOX: 'CONFERIDO_ALMOX',
  EM_COMPRAS: 'EM_COMPRAS',
  ENCAMINHADO_FATURAMENTO: 'ENCAMINHADO_FATURAMENTO',
  EM_ENTRADA_NF: 'EM_ENTRADA_NF',
  PROCESSADO: 'PROCESSADO',
  APROVADO: 'APROVADO',
  REPROVADO: 'REPROVADO',
  PARCIALMENTE_APROVADO: 'PARCIALMENTE_APROVADO',
  BLOQUEADO: 'BLOQUEADO',
};

const ETAPAS = {
  ALMOXARIFADO: 'ALMOXARIFADO',
  COMPRAS: 'COMPRAS',
  FATURAMENTO: 'FATURAMENTO',
  CONCLUIDO: 'CONCLUIDO',
};

const STATUS_ETAPA = {
  [STATUS.RECEBIDO]: ETAPAS.ALMOXARIFADO,
  [STATUS.EM_CONFERENCIA]: ETAPAS.ALMOXARIFADO,
  [STATUS.CONFERIDO_ALMOX]: ETAPAS.ALMOXARIFADO,
  [STATUS.EM_COMPRAS]: ETAPAS.COMPRAS,
  [STATUS.ENCAMINHADO_FATURAMENTO]: ETAPAS.FATURAMENTO,
  [STATUS.EM_ENTRADA_NF]: ETAPAS.FATURAMENTO,
  [STATUS.PROCESSADO]: ETAPAS.CONCLUIDO,
  [STATUS.APROVADO]: ETAPAS.CONCLUIDO,
};

function gerarNumero(prefix) {
  return `${prefix}-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
}

async function carregarItensPedidoCompra(db, pedidoCompraId) {
  const itens = await dbAll(db, `SELECT ipc.*, m.nome as material_nome, m.codigo as material_codigo
    FROM itens_pedido_compra ipc
    LEFT JOIN materiais_almoxarifado m ON ipc.material_id = m.id
    WHERE ipc.pedido_id = ?`, [pedidoCompraId]);
  return itens.filter((i) => i.material_id);
}

async function resolverPedidoCompra(db, { pedido_compra_id, pedido_compra_numero }) {
  if (pedido_compra_id) {
    return dbGet(db, `SELECT p.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj
      FROM pedidos_compra p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE p.id = ?`, [pedido_compra_id]);
  }
  if (pedido_compra_numero) {
    return dbGet(db, `SELECT p.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj
      FROM pedidos_compra p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE p.numero = ?`, [pedido_compra_numero]);
  }
  return null;
}

async function criarRecebimento(db, user, data) {
  const {
    pedido_compra_id, pedido_compra_numero, tipo_recebimento, nota_fiscal,
    fornecedor_id, fornecedor_nome, fornecedor_cnpj, observacoes, itens: itensInput,
  } = data;

  let pedido = null;
  let itens = itensInput || [];
  const tipo = tipo_recebimento || (pedido_compra_id || pedido_compra_numero ? 'PEDIDO_COMPRA' : 'NOTA_FISCAL');

  if (tipo === 'PEDIDO_COMPRA') {
    pedido = await resolverPedidoCompra(db, { pedido_compra_id, pedido_compra_numero });
    if (!pedido) throw Object.assign(new Error('Pedido de compra não encontrado'), { status: 400 });
    if (!itens.length) {
      const itensPedido = await carregarItensPedidoCompra(db, pedido.id);
      itens = itensPedido.map((i) => ({
        material_id: i.material_id,
        quantidade: i.quantidade,
        quantidade_esperada: i.quantidade,
        quantidade_recebida: i.quantidade,
        valor_unitario: i.valor_unitario || 0,
        valor_total: (i.quantidade || 0) * (i.valor_unitario || 0),
      }));
    }
  }

  if (!itens.length) throw Object.assign(new Error('Inclua ao menos um item'), { status: 400 });

  const numero = gerarNumero('REC');
  const r = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, pedido_compra_id, pedido_compra_numero, tipo_recebimento, nota_fiscal,
     fornecedor_id, fornecedor_nome, fornecedor_cnpj, status, etapa_atual,
     responsavel_id, responsavel_nome, observacoes)
    VALUES (?,?,?,?,?,?,?,?,'RECEBIDO','ALMOXARIFADO',?,?,?)`, [
    numero,
    pedido?.id || pedido_compra_id || null,
    pedido?.numero || pedido_compra_numero || null,
    tipo,
    nota_fiscal || null,
    pedido?.fornecedor_id || fornecedor_id || null,
    pedido?.fornecedor_nome || fornecedor_nome || null,
    pedido?.fornecedor_cnpj || fornecedor_cnpj || null,
    user.id, user.nome || user.email, observacoes || null,
  ]);

  for (const item of itens) {
    const qtd = item.quantidade_esperada || item.quantidade;
    const vUnit = parseFloat(item.valor_unitario) || 0;
    const vTotal = parseFloat(item.valor_total) || (qtd * vUnit);
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, observacoes,
       valor_unitario, valor_total, valor_icms, valor_ipi, reducao_icms_percent)
      VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
      r.lastID, item.material_id, qtd,
      item.quantidade_recebida || qtd, item.lote || null, item.observacoes || null,
      vUnit, vTotal, parseFloat(item.valor_icms) || 0, parseFloat(item.valor_ipi) || 0,
      parseFloat(item.reducao_icms_percent) || 0,
    ]);
  }

  await registrarAuditoria(db, {
    entidade: 'recebimento', entidade_id: r.lastID, acao: 'CRIACAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
  });
  return { id: r.lastID, numero, status: STATUS.RECEBIDO };
}

async function conferirRecebimento(db, user, recebimentoId, data) {
  const { status, itens } = data;
  const validStatus = [
    STATUS.EM_CONFERENCIA, STATUS.CONFERIDO_ALMOX, STATUS.APROVADO, STATUS.REPROVADO,
    STATUS.PARCIALMENTE_APROVADO, STATUS.BLOQUEADO,
  ];
  if (status && !validStatus.includes(status)) {
    throw Object.assign(new Error('Status inválido'), { status: 400 });
  }

  if (status) {
    const etapa = STATUS_ETAPA[status] || ETAPAS.ALMOXARIFADO;
    await dbRun(db, `UPDATE recebimentos_material_almoxarifado
      SET status = ?, etapa_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, etapa, recebimentoId]);
  }

  if (itens) {
    for (const item of itens) {
      await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET
        quantidade_recebida = ?, conferencia_quantidade = ?, conferencia_descricao = ?, observacoes = ?
        WHERE id = ? AND recebimento_id = ?`, [
        item.quantidade_recebida, item.conferencia_quantidade ? 1 : 0,
        item.conferencia_descricao ? 1 : 0, item.observacoes || null,
        item.id, recebimentoId,
      ]);
    }
  }

  return { success: true };
}

async function avancarWorkflow(db, user, recebimentoId, acao) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });

  const transicoes = {
    iniciar_conferencia: { de: [STATUS.RECEBIDO], para: STATUS.EM_CONFERENCIA, etapa: ETAPAS.ALMOXARIFADO },
    finalizar_conferencia: { de: [STATUS.EM_CONFERENCIA], para: STATUS.CONFERIDO_ALMOX, etapa: ETAPAS.ALMOXARIFADO },
    encaminhar_compras: { de: [STATUS.CONFERIDO_ALMOX, STATUS.RECEBIDO], para: STATUS.EM_COMPRAS, etapa: ETAPAS.COMPRAS },
    finalizar_compras: { de: [STATUS.EM_COMPRAS], para: STATUS.ENCAMINHADO_FATURAMENTO, etapa: ETAPAS.FATURAMENTO,
      extra: { compras_responsavel_id: user.id, compras_responsavel_nome: user.nome || user.email, compras_data: new Date().toISOString() } },
    iniciar_faturamento: { de: [STATUS.ENCAMINHADO_FATURAMENTO], para: STATUS.EM_ENTRADA_NF, etapa: ETAPAS.FATURAMENTO },
    processar: { de: [STATUS.EM_ENTRADA_NF], para: STATUS.PROCESSADO, etapa: ETAPAS.CONCLUIDO,
      handler: 'processar' },
  };

  const t = transicoes[acao];
  if (!t) throw Object.assign(new Error('Ação de workflow inválida'), { status: 400 });
  if (!t.de.includes(rec.status)) {
    throw Object.assign(new Error(`Não é possível "${acao}" no status atual (${rec.status})`), { status: 400 });
  }

  if (t.handler === 'processar') {
    return processarNota(db, user, recebimentoId);
  }

  const sets = ['status = ?', 'etapa_atual = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const params = [t.para, t.etapa];
  if (t.extra) {
    for (const [k, v] of Object.entries(t.extra)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
  }
  params.push(recebimentoId);
  await dbRun(db, `UPDATE recebimentos_material_almoxarifado SET ${sets.join(', ')} WHERE id = ?`, params);

  await registrarAuditoria(db, {
    entidade: 'recebimento', entidade_id: recebimentoId, acao: acao.toUpperCase(),
    usuario_id: user.id, usuario_nome: user.nome || user.email,
  });
  return { success: true, status: t.para, etapa_atual: t.etapa };
}

async function salvarDadosFiscal(db, user, recebimentoId, data) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });

  const permitidos = [
    STATUS.ENCAMINHADO_FATURAMENTO, STATUS.EM_ENTRADA_NF, STATUS.EM_COMPRAS,
    STATUS.CONFERIDO_ALMOX, STATUS.EM_CONFERENCIA,
  ];
  if (!permitidos.includes(rec.status)) {
    throw Object.assign(new Error('Dados fiscais só podem ser editados antes do processamento'), { status: 400 });
  }

  const {
    nota_fiscal, nota_serie, data_emissao_nf, data_entrada_nf, cfop_nota, cfop_entrada, chave_nfe,
    fornecedor_id, fornecedor_nome, fornecedor_cnpj, pedido_compra_id, pedido_compra_numero, tipo_recebimento,
    base_icms, valor_icms, valor_produtos, frete, desconto, outras_despesas, valor_ipi, valor_total_nota,
    itens,
  } = data;

  let pedido = null;
  if (pedido_compra_id || pedido_compra_numero) {
    pedido = await resolverPedidoCompra(db, { pedido_compra_id, pedido_compra_numero });
  }

  await dbRun(db, `UPDATE recebimentos_material_almoxarifado SET
    nota_fiscal = COALESCE(?, nota_fiscal),
    nota_serie = COALESCE(?, nota_serie),
    data_emissao_nf = COALESCE(?, data_emissao_nf),
    data_entrada_nf = COALESCE(?, data_entrada_nf),
    cfop_nota = COALESCE(?, cfop_nota),
    cfop_entrada = COALESCE(?, cfop_entrada),
    chave_nfe = COALESCE(?, chave_nfe),
    fornecedor_id = COALESCE(?, fornecedor_id),
    fornecedor_nome = COALESCE(?, fornecedor_nome),
    fornecedor_cnpj = COALESCE(?, fornecedor_cnpj),
    pedido_compra_id = COALESCE(?, pedido_compra_id),
    pedido_compra_numero = COALESCE(?, pedido_compra_numero),
    tipo_recebimento = COALESCE(?, tipo_recebimento),
    base_icms = COALESCE(?, base_icms),
    valor_icms = COALESCE(?, valor_icms),
    valor_produtos = COALESCE(?, valor_produtos),
    frete = COALESCE(?, frete),
    desconto = COALESCE(?, desconto),
    outras_despesas = COALESCE(?, outras_despesas),
    valor_ipi = COALESCE(?, valor_ipi),
    valor_total_nota = COALESCE(?, valor_total_nota),
    faturamento_responsavel_id = ?,
    faturamento_responsavel_nome = ?,
    faturamento_data = CURRENT_TIMESTAMP,
    status = CASE WHEN status = 'ENCAMINHADO_FATURAMENTO' THEN 'EM_ENTRADA_NF' ELSE status END,
    etapa_atual = CASE WHEN status IN ('ENCAMINHADO_FATURAMENTO','EM_ENTRADA_NF') THEN 'FATURAMENTO' ELSE etapa_atual END,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`, [
    nota_fiscal ?? null, nota_serie ?? null, data_emissao_nf ?? null, data_entrada_nf ?? null,
    cfop_nota ?? null, cfop_entrada ?? null, chave_nfe ?? null,
    pedido?.fornecedor_id ?? fornecedor_id ?? null,
    pedido?.fornecedor_nome ?? fornecedor_nome ?? null,
    pedido?.fornecedor_cnpj ?? fornecedor_cnpj ?? null,
    pedido?.id ?? pedido_compra_id ?? null,
    pedido?.numero ?? pedido_compra_numero ?? null,
    tipo_recebimento ?? null,
    base_icms ?? null, valor_icms ?? null, valor_produtos ?? null,
    frete ?? null, desconto ?? null, outras_despesas ?? null, valor_ipi ?? null, valor_total_nota ?? null,
    user.id, user.nome || user.email, recebimentoId,
  ]);

  if (itens?.length) {
    for (const item of itens) {
      const qtd = parseFloat(item.quantidade_recebida) || parseFloat(item.quantidade_esperada) || 0;
      const vUnit = parseFloat(item.valor_unitario) || 0;
      const vTotal = parseFloat(item.valor_total) || (qtd * vUnit);
      await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET
        quantidade_recebida = COALESCE(?, quantidade_recebida),
        valor_unitario = COALESCE(?, valor_unitario),
        valor_total = COALESCE(?, valor_total),
        valor_icms = COALESCE(?, valor_icms),
        valor_ipi = COALESCE(?, valor_ipi),
        reducao_icms_percent = COALESCE(?, reducao_icms_percent),
        conferencia_quantidade = COALESCE(?, conferencia_quantidade),
        conferencia_descricao = COALESCE(?, conferencia_descricao)
        WHERE id = ? AND recebimento_id = ?`, [
        item.quantidade_recebida ?? null, vUnit || null, vTotal || null,
        item.valor_icms ?? null, item.valor_ipi ?? null, item.reducao_icms_percent ?? null,
        item.conferencia_quantidade != null ? (item.conferencia_quantidade ? 1 : 0) : null,
        item.conferencia_descricao != null ? (item.conferencia_descricao ? 1 : 0) : null,
        item.id, recebimentoId,
      ]);
    }
  }

  return { success: true };
}

function validarDadosProcessamento(rec) {
  const faltando = [];
  if (!rec.nota_fiscal) faltando.push('número da nota fiscal');
  if (!rec.fornecedor_nome && !rec.fornecedor_cnpj) faltando.push('fornecedor (CNPJ ou nome)');
  if (!rec.data_emissao_nf) faltando.push('data de emissão da nota');
  if (!rec.data_entrada_nf) faltando.push('data de entrada da nota');
  if (rec.valor_total_nota == null || rec.valor_total_nota <= 0) faltando.push('valor total da nota');
  if (faltando.length) {
    throw Object.assign(new Error(`Preencha antes de processar: ${faltando.join(', ')}`), { status: 400 });
  }
}

async function darEntradaEstoque(db, user, rec, recebimentoId, { localizacao_id } = {}) {
  const itens = await dbAll(db, `SELECT ri.*, m.material_critico, m.controle_certificado
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    WHERE ri.recebimento_id = ?`, [recebimentoId]);

  for (const item of itens) {
    // Etapa 5: a inspecao deixou de ser PRE-REQUISITO da entrada e passou a ser passo posterior.
    // O material esta fisicamente no galpao desde o descarregamento — barrar a entrada fazia o
    // sistema negar o que existe, e o bloqueio da inspecao recaia sobre saldo que ainda nao
    // tinha entrado. Agora entra sempre; o que exige inspecao entra RETIDO.
    const cfg = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'inspecao_material_critico'");
    const reter = !!item.material_critico && cfg?.valor === '1';

    const qtd = item.quantidade_recebida || item.quantidade_esperada;
    if (qtd > 0) {
      await registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'ENTRADA_COMPRA',
        quantidade: qtd,
        motivo: `Recebimento ${rec.numero}`,
        referencia: rec.nota_fiscal,
        recebimento_id: recebimentoId,
        localizacao_destino_id: localizacao_id,
        lote: item.lote,
        documento_vinculado: rec.numero,
      });

      if (reter) {
        await registrarMovimentacao(db, user, {
          material_id: item.material_id,
          tipo: 'QUARENTENA',
          quantidade: qtd,
          motivo: `Retido para inspeção — recebimento ${rec.numero}`,
          justificativa: `Material crítico aguardando inspeção (recebimento ${rec.numero})`,
          recebimento_id: recebimentoId,
        });
        // Etapa 5, correcao de review: quantidade_em_inspecao do MATERIAL e um pool
        // compartilhado entre itens de recebimentos diferentes. Sem isto, inspectionService não
        // tinha como saber quanto DESTE item especifico esta retido — inferia de
        // quantidade_recebida, que conferirRecebimento pode sobrescrever sem guarda de status.
        await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado
          SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) + ? WHERE id = ?`,
          [qtd, item.id]);
      }
    }
  }
}

async function gerarContaPagar(db, rec) {
  const tableExists = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='contas_pagar'");
  if (!tableExists) return null;

  const descricao = `NF ${rec.nota_fiscal}${rec.nota_serie ? `/${rec.nota_serie}` : ''} — ${rec.numero}`;
  const r = await dbRun(db, `INSERT INTO contas_pagar
    (descricao, fornecedor, valor, data_vencimento, status, categoria, observacoes)
    VALUES (?,?,?,?,?,?,?)`, [
    descricao,
    rec.fornecedor_nome || rec.fornecedor_cnpj || 'Fornecedor',
    rec.valor_total_nota,
    rec.data_entrada_nf || new Date().toISOString().split('T')[0],
    'pendente',
    'Material/Compras',
    [
      `Recebimento ${rec.numero}`,
      rec.chave_nfe ? `Chave NF-e: ${rec.chave_nfe}` : null,
      rec.pedido_compra_numero ? `Pedido: ${rec.pedido_compra_numero}` : null,
    ].filter(Boolean).join(' | '),
  ]);
  return r.lastID;
}

async function processarNota(db, user, recebimentoId, { localizacao_id } = {}) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });
  if ([STATUS.PROCESSADO, STATUS.APROVADO].includes(rec.status)) {
    throw Object.assign(new Error('Nota já processada'), { status: 400 });
  }

  const statusPermitidos = [STATUS.EM_ENTRADA_NF, STATUS.ENCAMINHADO_FATURAMENTO];
  if (!statusPermitidos.includes(rec.status)) {
    throw Object.assign(new Error('Processe a nota somente após entrada no faturamento'), { status: 400 });
  }

  validarDadosProcessamento(rec);
  await darEntradaEstoque(db, user, rec, recebimentoId, { localizacao_id });
  const contasPagarId = await gerarContaPagar(db, rec);

  await dbRun(db, `UPDATE recebimentos_material_almoxarifado SET
    status = 'PROCESSADO', etapa_atual = 'CONCLUIDO',
    faturamento_responsavel_id = ?, faturamento_responsavel_nome = ?,
    faturamento_data = CURRENT_TIMESTAMP, contas_pagar_id = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    user.id, user.nome || user.email, contasPagarId, recebimentoId,
  ]);

  await registrarAuditoria(db, {
    entidade: 'recebimento', entidade_id: recebimentoId, acao: 'PROCESSAR_NOTA',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
  });

  return { success: true, status: STATUS.PROCESSADO, contas_pagar_id: contasPagarId };
}

async function aprovarRecebimento(db, user, recebimentoId, opts = {}) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });
  if ([STATUS.PROCESSADO, STATUS.APROVADO].includes(rec.status)) {
    throw Object.assign(new Error('Recebimento já aprovado/processado'), { status: 400 });
  }

  if ([STATUS.EM_ENTRADA_NF, STATUS.ENCAMINHADO_FATURAMENTO].includes(rec.status)) {
    return processarNota(db, user, recebimentoId, opts);
  }

  await darEntradaEstoque(db, user, rec, recebimentoId, opts);
  await dbRun(db, `UPDATE recebimentos_material_almoxarifado
    SET status = 'APROVADO', etapa_atual = 'CONCLUIDO', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [recebimentoId]);
  return { success: true };
}

async function listarRecebimentos(db, filters = {}) {
  let sql = 'SELECT * FROM recebimentos_material_almoxarifado WHERE 1=1';
  const params = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.etapa) { sql += ' AND etapa_atual = ?'; params.push(filters.etapa); }
  sql += ' ORDER BY created_at DESC';
  return dbAll(db, sql, params);
}

async function listarPedidosCompraAux(db, { search } = {}) {
  const tableExists = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos_compra'");
  if (!tableExists) return [];

  let sql = `SELECT p.id, p.numero, p.valor_total, p.status, p.data_pedido,
    f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj
    FROM pedidos_compra p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (p.numero LIKE ? OR f.razao_social LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT 50';
  return dbAll(db, sql, params);
}

async function listarFornecedoresAux(db, { search } = {}) {
  const tableExists = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='fornecedores'");
  if (!tableExists) return [];

  let sql = 'SELECT id, razao_social, nome_fantasia, cnpj FROM fornecedores WHERE status = ?';
  const params = ['ativo'];
  if (search) {
    sql += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY razao_social LIMIT 50';
  return dbAll(db, sql, params);
}

async function getRecebimento(db, id) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
  if (!rec) return null;
  const itens = await dbAll(db, `SELECT ri.*, m.nome as material_nome, m.codigo as material_codigo, m.unidade
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    WHERE ri.recebimento_id = ?`, [id]);

  let pedido_compra = null;
  if (rec.pedido_compra_id) {
    pedido_compra = await dbGet(db, `SELECT p.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj
      FROM pedidos_compra p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE p.id = ?`, [rec.pedido_compra_id]);
  }

  return { ...rec, itens, pedido_compra };
}

module.exports = {
  STATUS,
  ETAPAS,
  criarRecebimento,
  conferirRecebimento,
  aprovarRecebimento,
  avancarWorkflow,
  salvarDadosFiscal,
  processarNota,
  listarRecebimentos,
  listarPedidosCompraAux,
  listarFornecedoresAux,
  getRecebimento,
};
