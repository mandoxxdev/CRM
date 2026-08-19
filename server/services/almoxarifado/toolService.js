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

/**
 * Bloqueio/desbloqueio/manutencao/reencontro (Task 4, RN-06/RN-07/RN-10) — mesmo padrao de claim
 * de emprestarFerramenta/devolverFerramenta: UPDATE com o(s) status de origem no WHERE, e so se
 * `changes === 0` le o status atual para montar a mensagem literal do contrato. Nunca
 * ler-depois-decidir: essa ordem foi a TOCTOU que a Etapa 9 provou explorável.
 */
async function bloquearFerramenta(db, user, ferramentaId, data) {
  const claim = await dbRun(db, `UPDATE ferramentas_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
    [STATUS.BLOQUEADA, ferramentaId, STATUS.DISPONIVEL]);
  if (claim.changes === 0) {
    const atual = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [ferramentaId]);
    if (!atual) throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });
    throw Object.assign(new Error(`Ferramenta não pode ser bloqueada (status atual: ${atual.status})`), { status: 400 });
  }
  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: Number(ferramentaId), acao: 'BLOQUEIO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { justificativa: data.justificativa } });
  return { success: true };
}

async function desbloquearFerramenta(db, user, ferramentaId, data) {
  const claim = await dbRun(db, `UPDATE ferramentas_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
    [STATUS.DISPONIVEL, ferramentaId, STATUS.BLOQUEADA]);
  if (claim.changes === 0) {
    const atual = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [ferramentaId]);
    if (!atual) throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });
    throw Object.assign(new Error(`Ferramenta não está bloqueada (status atual: ${atual.status})`), { status: 400 });
  }
  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: Number(ferramentaId), acao: 'DESBLOQUEIO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { justificativa: data.justificativa } });
  return { success: true };
}

/**
 * Iniciar manutencao (RN-07): claim de origem DISPONIVEL|AVARIADA -> EM_MANUTENCAO. EMPRESTADA
 * fica de fora DE PROPOSITO — devolva primeiro, a manutencao e feita com a ferramenta na mao.
 * Uma manutencao aberta por ferramenta e garantida pelo proprio claim de status (nao ha UNIQUE
 * na tabela de manutencoes): so quem esta DISPONIVEL ou AVARIADA consegue abrir outra.
 */
async function iniciarManutencao(db, user, ferramentaId, data) {
  // Duas tentativas de claim, uma por origem, em vez de um IN (DISPONIVEL, AVARIADA) so: assim
  // sabemos com certeza qual das duas foi a origem REAL que o UPDATE viu (nao a que uma leitura
  // separada teria visto um instante antes, que poderia ja estar desatualizada por uma corrida
  // entre DISPONIVEL e AVARIADA). E a origem exata que a compensacao abaixo precisa para devolver
  // o status certo se o INSERT falhar.
  let origem = null;
  let claim = await dbRun(db, `UPDATE ferramentas_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
    [STATUS.EM_MANUTENCAO, ferramentaId, STATUS.DISPONIVEL]);
  if (claim.changes > 0) {
    origem = STATUS.DISPONIVEL;
  } else {
    claim = await dbRun(db, `UPDATE ferramentas_almoxarifado
      SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
      [STATUS.EM_MANUTENCAO, ferramentaId, STATUS.AVARIADA]);
    if (claim.changes > 0) origem = STATUS.AVARIADA;
  }
  if (!origem) {
    const atual = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [ferramentaId]);
    if (!atual) throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });
    throw Object.assign(new Error(`Ferramenta não pode entrar em manutenção (status atual: ${atual.status})`), { status: 400 });
  }

  // Compensacao (espelha emprestarFerramenta): o claim ja tirou a ferramenta de circulacao: se o
  // INSERT falhar (ex.: descricao NOT NULL violada por quem chama o servico direto, fora do Zod),
  // a ferramenta NAO pode ficar presa em EM_MANUTENCAO sem nenhuma linha de manutencao aberta —
  // devolve para a origem real que o claim capturou acima.
  const r = await dbRun(db, `INSERT INTO manutencoes_ferramenta_almoxarifado
    (ferramenta_id, descricao, usuario_id) VALUES (?,?,?)`,
    [ferramentaId, data.descricao, user.id]).catch(async (e) => {
      await dbRun(db, 'UPDATE ferramentas_almoxarifado SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
        [origem, ferramentaId]);
      throw e;
    });

  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: Number(ferramentaId), acao: 'MANUTENCAO_INICIO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { manutencao_id: r.lastID, descricao: data.descricao } });
  return { id: r.lastID };
}

/**
 * Concluir manutencao: claim no PROPRIO registro de manutencao (`data_fim IS NULL`) — cobre tanto
 * "id inexistente" quanto "manutencao ja concluida" com a mesma mensagem 404, como o contrato
 * pede. So depois de fechar a linha e que a ferramenta tenta voltar EM_MANUTENCAO -> DISPONIVEL.
 *
 * O invariante "uma manutencao aberta por ferramenta" (que iniciarManutencao garante hoje) e o
 * que deveria tornar esse segundo claim sempre bem-sucedido — mas ele NAO e checado aqui, e uma
 * task futura (Task 5, ocorrencias) vai abrir caminhos novos de mudanca de status. Por isso o
 * `changes` do segundo UPDATE e verificado: se vier 0, a linha de manutencao JA foi fechada (o
 * primeiro claim e irreversivel por design — nao ha por que desfaze-lo, o historico de "a
 * manutencao acabou nesta hora" continua verdadeiro), mas a ferramenta nao seguiu para DISPONIVEL
 * porque alguma outra escrita mudou o status dela nesse meio-tempo. Devolver {success:true} nesse
 * caso mentiria (a auditoria diria MANUTENCAO_FIM como se a ferramenta tivesse voltado a circular,
 * quando na verdade ela esta em outro estado) — em vez disso, a funcao AUDITA a anomalia (mesma
 * acao MANUTENCAO_FIM, com uma flag e o status real em dados_novos, para nao perder o rastro de
 * que a manutencao foi concluida) e lanca 400 com o status atual, para quem chamou saber que a
 * ferramenta nao esta disponivel e agir (ex.: reabrir uma manutencao, investigar).
 */
async function concluirManutencao(db, user, manutencaoId, data = {}) {
  const claim = await dbRun(db, `UPDATE manutencoes_ferramenta_almoxarifado
    SET data_fim = CURRENT_TIMESTAMP, observacoes = COALESCE(?, observacoes)
    WHERE id = ? AND data_fim IS NULL`, [data.observacoes || null, manutencaoId]);
  if (claim.changes === 0) throw Object.assign(new Error('Manutenção não encontrada'), { status: 404 });

  const manutencao = await dbGet(db, 'SELECT * FROM manutencoes_ferramenta_almoxarifado WHERE id = ?', [manutencaoId]);
  const claimFerramenta = await dbRun(db, `UPDATE ferramentas_almoxarifado SET status = ?, updated_at = CURRENT_TIMESTAMP
    WHERE id = ? AND status = ?`, [STATUS.DISPONIVEL, manutencao.ferramenta_id, STATUS.EM_MANUTENCAO]);

  if (claimFerramenta.changes === 0) {
    const atual = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [manutencao.ferramenta_id]);
    await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: manutencao.ferramenta_id, acao: 'MANUTENCAO_FIM',
      usuario_id: user.id, usuario_nome: user.nome || user.email,
      dados_novos: { manutencao_id: Number(manutencaoId), anomalia: 'ferramenta_nao_estava_em_manutencao', status_atual: atual ? atual.status : null } });
    throw Object.assign(new Error(`Estado da ferramenta mudou durante a conclusão da manutenção (status atual: ${atual ? atual.status : 'desconhecido'})`), { status: 400 });
  }

  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: manutencao.ferramenta_id, acao: 'MANUTENCAO_FIM',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { manutencao_id: Number(manutencaoId) } });
  return { success: true };
}

async function listarManutencoes(db, ferramentaId) {
  return dbAll(db, `SELECT * FROM manutencoes_ferramenta_almoxarifado
    WHERE ferramenta_id = ? ORDER BY data_inicio DESC, id DESC`, [ferramentaId]);
}

/** Reencontrar (RN-10): claim PERDIDA -> DISPONIVEL, justificativa obrigatoria e auditada. */
async function reencontrarFerramenta(db, user, ferramentaId, data) {
  const claim = await dbRun(db, `UPDATE ferramentas_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = ?`,
    [STATUS.DISPONIVEL, ferramentaId, STATUS.PERDIDA]);
  if (claim.changes === 0) {
    const atual = await dbGet(db, 'SELECT status FROM ferramentas_almoxarifado WHERE id = ?', [ferramentaId]);
    if (!atual) throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });
    throw Object.assign(new Error(`Ferramenta não está perdida (status atual: ${atual.status})`), { status: 400 });
  }
  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: Number(ferramentaId), acao: 'REENCONTRO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { justificativa: data.justificativa } });
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
  // Nome do query param e o contrato congelado no design (tabela de contratos, GET
  // /emprestimos): `colaborador`, nao `colaborador_nome`. A Task 6 e o front (Task 7)
  // constroem contra esse nome — usar outro aqui vira colisao que as proximas tasks teriam
  // de contornar. O match continua sendo contra o colaborador_nome gravado no emprestimo.
  if (filters.colaborador) { sql += ' AND e.colaborador_nome LIKE ?'; params.push(`%${filters.colaborador}%`); }
  sql += ' ORDER BY e.data_retirada DESC';
  return dbAll(db, sql, params);
}

/**
 * Registra uma calibracao (Task 3). `certificadoPath` ja vem resolvido pela ROTA (req.file.filename
 * depois do multer) — mesmo desenho de `comprovante_arquivo` em SucateamentoDestinoFormSchema:
 * quem grava o path e a rota, nunca um valor vindo do corpo do formulario.
 *
 * A regra "validade > calibracao" fica aqui, nao no Zod (CalibracaoSchema so valida forma) —
 * porque o erro do Zod sai embrulhado em "Dados invalidos - ..." (validation.js) e o contrato
 * exige a mensagem literal abaixo.
 */
async function registrarCalibracao(db, user, ferramentaId, data, certificadoPath) {
  const ferr = await dbGet(db, 'SELECT * FROM ferramentas_almoxarifado WHERE id = ? AND ativo = 1', [ferramentaId]);
  if (!ferr) throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });

  if (!(new Date(data.data_validade) > new Date(data.data_calibracao))) {
    throw Object.assign(new Error('Data de validade deve ser posterior à data de calibração'), { status: 400 });
  }

  const r = await dbRun(db, `INSERT INTO calibracoes_ferramenta_almoxarifado
    (ferramenta_id, data_calibracao, data_validade, certificado_path, observacoes, usuario_id)
    VALUES (?,?,?,?,?,?)`, [
    ferramentaId, data.data_calibracao, data.data_validade,
    certificadoPath || null, data.observacoes || null, user.id,
  ]);

  await registrarAuditoria(db, { entidade: 'ferramenta', entidade_id: Number(ferramentaId), acao: 'CALIBRACAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { calibracao_id: r.lastID, data_calibracao: data.data_calibracao, data_validade: data.data_validade } });
  return { id: r.lastID };
}

async function listarCalibracoes(db, ferramentaId) {
  return dbAll(db, `SELECT * FROM calibracoes_ferramenta_almoxarifado
    WHERE ferramenta_id = ? ORDER BY date(data_validade) DESC, id DESC`, [ferramentaId]);
}

/**
 * Painel de vencimento (Task 3, contrato congelado): so ferramentas `exige_calibracao = 1` e
 * `ativo = 1`, cada uma olhando so a sua calibracao vigente/mais recente (mesma consulta de
 * `calibracaoVigente`, mas aqui precisamos tambem da vencida — por isso MAX direto por
 * ferramenta, nao o filtro `data_validade >= hoje` daquela funcao).
 *
 * LEFT JOIN, nao INNER (ajuste pos-revisao do controller): ferramenta que exige calibracao e
 * NUNCA foi calibrada tem de aparecer em `vencidas` com `data_validade: null` e
 * `dias_restantes: null` — RN-03 ja trata "sem calibracao" como vencida na hora de emprestar; o
 * painel omitir o que o emprestimo recusa seria contradicao interna (o pior caso, a
 * nunca-calibrada, e o que o painel existe pra mostrar). O `AND c.data_validade = (MAX...)` no ON
 * (nao no WHERE) preserva essa semantica: quando nao ha nenhuma linha de calibracao a
 * comparacao nunca casa (NULL = NULL e falso em SQL), entao o LEFT JOIN devolve a ferramenta com
 * as colunas de `c` todas NULL, em vez de sumir da consulta.
 */
async function painelCalibracoes(db, dias = 30) {
  const rows = await dbAll(db, `
    SELECT f.id, f.codigo_patrimonio, f.nome, c.data_validade,
      CASE WHEN c.data_validade IS NULL THEN NULL
        ELSE CAST(julianday(date(c.data_validade)) - julianday(date('now')) AS INTEGER)
      END AS dias_restantes
    FROM ferramentas_almoxarifado f
    LEFT JOIN calibracoes_ferramenta_almoxarifado c ON c.ferramenta_id = f.id
      AND c.data_validade = (
        SELECT MAX(c2.data_validade) FROM calibracoes_ferramenta_almoxarifado c2
        WHERE c2.ferramenta_id = f.id
      )
    WHERE f.exige_calibracao = 1 AND f.ativo = 1
    ORDER BY c.data_validade ASC`);

  const vencidas = [];
  const a_vencer = [];
  for (const r of rows) {
    if (r.dias_restantes === null || r.dias_restantes < 0) {
      vencidas.push(r);
    } else if (r.dias_restantes <= dias) {
      a_vencer.push(r);
    }
  }
  return { vencidas, a_vencer };
}

module.exports = {
  criarFerramenta, atualizarFerramenta, emprestarFerramenta, devolverFerramenta,
  listarFerramentas, listarEmprestimos, calibracaoVigente,
  registrarCalibracao, listarCalibracoes, painelCalibracoes,
  bloquearFerramenta, desbloquearFerramenta, iniciarManutencao, concluirManutencao,
  listarManutencoes, reencontrarFerramenta,
};
