const { dbRun, dbAll, dbGet } = require('./db');
const { registrarAuditoria } = require('./audit');
const { STATUS } = require('./toolStateMachine');

async function criarFerramenta(db, user, data) {
  const r = await dbRun(db, `INSERT INTO ferramentas_almoxarifado
    (codigo_patrimonio, nome, tipo, setor_responsavel, status, material_id, numero_serie,
     localizacao_id, exige_calibracao, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?)`, [
    data.codigo_patrimonio, data.nome, data.tipo || null, data.setor_responsavel || null,
    data.status || STATUS.DISPONIVEL, data.material_id || null, data.numero_serie || null,
    data.localizacao_id || null, data.exige_calibracao || 0, data.observacoes || null,
  ]);
  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: r.lastID, acao: 'CRIACAO', usuario_id: user.id, usuario_nome: user.nome || user.email });
  return { id: r.lastID };
}

/**
 * Colunas que atualizarFerramenta aceita mudar — mesma disciplina de MATERIAL_UPDATE_COLUMNS em
 * outros serviços: lista fixa, nunca `Object.keys(data)` direto (evitaria alguem mandar `id`,
 * `status` ou `ativo` por fora da maquina de estados/rotas dedicadas).
 */
const FERRAMENTA_UPDATE_COLUMNS = [
  'codigo_patrimonio', 'nome', 'tipo', 'setor_responsavel', 'material_id',
  'numero_serie', 'localizacao_id', 'exige_calibracao', 'observacoes',
];

async function atualizarFerramenta(db, user, id, data) {
  const atual = await dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ? AND ativo = 1', [id]);
  if (!atual) throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });

  const sets = [];
  const params = [];
  for (const col of FERRAMENTA_UPDATE_COLUMNS) {
    if (Object.prototype.hasOwnProperty.call(data, col)) {
      sets.push(`${col} = ?`);
      params.push(data[col]);
    }
  }
  if (sets.length === 0) return { id: Number(id) };
  sets.push('updated_at = CURRENT_TIMESTAMP');
  params.push(id);
  await dbRun(db, `UPDATE ferramentas_almoxarifado SET ${sets.join(', ')} WHERE id = ?`, params);
  await registrarAuditoria(db, {
    entidade: 'ferramenta', entidade_id: Number(id), acao: 'EDICAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_anteriores: atual, dados_novos: data,
  });
  return { id: Number(id) };
}

/**
 * Calibracao vigente da ferramenta (a mais recente cuja validade nao venceu). Usado por
 * emprestarFerramenta (RN-03) e por listarFerramentas (calibracao_vigente); Task 3 e 8 tambem
 * reusam — nao duplicar esta consulta em outro lugar.
 */
async function calibracaoVigente(db, ferramentaId) {
  return dbGet(db, `SELECT * FROM calibracoes_ferramenta_almoxarifado
    WHERE ferramenta_id = ? AND date(data_validade) >= date('now')
    ORDER BY date(data_validade) DESC LIMIT 1`, [ferramentaId]);
}

async function emprestarFerramenta(db, user, ferramentaId, data) {
  const ferr = await dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ? AND ativo = 1', [ferramentaId]);
  if (!ferr) throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });

  // RN-03: pre-checagem fora do claim DE PROPOSITO — vencimento e funcao do tempo, nao de
  // escritor concorrente (design D3). Quem muda status concorrentemente e barrado pelo claim.
  if (ferr.exige_calibracao && !(await calibracaoVigente(db, ferramentaId))) {
    throw Object.assign(new Error('Ferramenta com calibração vencida ou sem calibração registrada'), { status: 400 });
  }

  // RN-01/RN-02: claim atomico — a leitura acima e so para a mensagem; quem decide e o UPDATE.
  const claim = await dbRun(db, `UPDATE ferramentas_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
    [STATUS.EMPRESTADA, ferramentaId, STATUS.DISPONIVEL]);
  if (claim.changes === 0) {
    const atual = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [ferramentaId]);
    throw Object.assign(new Error(`Ferramenta não está disponível (status atual: ${atual.status})`), { status: 400 });
  }

  const r = await dbRun(db, `INSERT INTO emprestimos_ferramenta_almoxarifado
    (ferramenta_id, colaborador_id, colaborador_nome, setor, data_prevista_devolucao, observacoes)
    VALUES (?,?,?,?,?,?)`, [
    ferramentaId, data.colaborador_id || null, data.colaborador_nome,
    data.setor || null, data.data_prevista_devolucao || null, data.observacoes || null,
  ]).catch(async (e) => {
    // compensacao: o claim ja tirou a ferramenta de circulacao; se o INSERT falhar, devolve.
    await dbRun(db, 'UPDATE ferramentas_almoxarifado SET status = ? WHERE id = ?', [STATUS.DISPONIVEL, ferramentaId]);
    throw e;
  });

  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: ferramentaId, acao: 'EMPRESTIMO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { emprestimo_id: r.lastID, colaborador_nome: data.colaborador_nome } });
  return { id: r.lastID };
}

async function devolverFerramenta(db, user, emprestimoId, data = {}) {
  // Claim no emprestimo: o WHERE status='EMPRESTADA' e o mesmo raciocinio do claim de
  // emprestarFerramenta — o UPDATE decide, uma leitura antes so serviria pra mensagem e teria a
  // mesma janela de corrida que o design da RN-01 existe para fechar.
  const claim = await dbRun(db, `UPDATE emprestimos_ferramenta_almoxarifado
    SET status = 'DEVOLVIDA', data_devolucao_real = CURRENT_TIMESTAMP,
        observacoes = COALESCE(?, observacoes)
    WHERE id = ? AND status = 'EMPRESTADA'`, [data.observacoes || null, emprestimoId]);
  if (claim.changes === 0) throw Object.assign(new Error('Empréstimo não encontrado'), { status: 404 });

  const emp = await dbGet(db, 'SELECT * FROM emprestimos_ferramenta_almoxarifado WHERE id = ?', [emprestimoId]);
  await dbRun(db, 'UPDATE ferramentas_almoxarifado SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
    [STATUS.DISPONIVEL, emp.ferramenta_id]);

  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: emp.ferramenta_id, acao: 'DEVOLUCAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { emprestimo_id: Number(emprestimoId) } });
  return { success: true };
}

async function listarFerramentas(db, filters = {}) {
  let sql = 'SELECT * FROM ferramentas_almoxarifado WHERE ativo = 1';
  const params = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  sql += ' ORDER BY nome';
  const ferramentas = await dbAll(db, sql, params);

  for (const f of ferramentas) {
    // calibracao_vigente: null quando a ferramenta nao exige calibracao (a pergunta nao se
    // aplica a ela); true/false quando exige.
    f.calibracao_vigente = f.exige_calibracao ? !!(await calibracaoVigente(db, f.id)) : null;

    const aberto = await dbGet(db, `SELECT id, colaborador_nome, data_prevista_devolucao
      FROM emprestimos_ferramenta_almoxarifado WHERE ferramenta_id = ? AND status = 'EMPRESTADA'
      ORDER BY id DESC LIMIT 1`, [f.id]);
    f.emprestimo_aberto = aberto || null;
  }
  return ferramentas;
}

async function listarEmprestimos(db, filters = {}) {
  let sql = `SELECT e.*, f.nome as ferramenta_nome, f.codigo_patrimonio
    FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id WHERE 1=1`;
  const params = [];
  if (filters.status) { sql += ' AND e.status = ?'; params.push(filters.status); }
  if (filters.ferramenta_id) { sql += ' AND e.ferramenta_id = ?'; params.push(filters.ferramenta_id); }
  if (filters.colaborador_nome) { sql += ' AND e.colaborador_nome LIKE ?'; params.push(`%${filters.colaborador_nome}%`); }
  sql += ' ORDER BY e.data_retirada DESC';
  return dbAll(db, sql, params);
}

module.exports = {
  criarFerramenta, atualizarFerramenta, emprestarFerramenta, devolverFerramenta,
  listarFerramentas, listarEmprestimos, calibracaoVigente,
};
