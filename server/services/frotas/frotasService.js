/**
 * Serviços do módulo Frotas — GMP Industriais
 */

const { dbRun, dbGet, dbAll } = require('./db');
const { hojeLocalISO, modificadorDoFuso } = require('../diaLocal');
const { naFilaDeViagens } = require('./filaDeViagens');

const VEICULO_JOIN = `SELECT v.*, t.nome as tipo_nome, t.categoria as tipo_categoria,
  mot.nome as motorista_nome
  FROM frotas_veiculos v
  LEFT JOIN frotas_tipos_veiculo t ON v.tipo_id = t.id
  LEFT JOIN frotas_motoristas mot ON v.motorista_id = mot.id`;

function normalizePlaca(placa) {
  return String(placa || '').trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Etapa 164 (RN-164.05, B1047, C409): os dias de `data` (coluna so de data, 'AAAA-MM-DD') ate o `hoje` de Brasilia, em dias de
 * calendario — independente do TZ do processo. A conta antiga (`new Date('AAAA-MM-DD')` = meia-noite UTC, com `setHours(0)` LOCAL) dava
 * um dia a menos o dia inteiro em TZ=America/Sao_Paulo (o de producao): o vencimento de hoje saia "Vencido ha 1 dia(s)" e critico.
 * Texto que nao comeca por 'AAAA-MM-DD' (legado) cai na conta antiga, com o mesmo resultado de antes.
 */
function diasAte(dateStr, hoje = hojeLocalISO()) {
  if (!dateStr) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(dateStr));
  const h = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(hoje));
  if (m && h) {
    // `setUTCFullYear` (nao `Date.UTC`, que le os anos 0-99 como 1900+): o ano 0026 que o navegador grava quando se digita "26" e a data
    // impossivel (2026-02-30 -> 02/03) rolam como o `new Date` da conta antiga rolava (Fase 5 r1: a versao anterior devolvia nulo, e o
    // alerta que o SQL inclui saia sem dias e sem a cor critica). Instante com hora/fuso usa o prefixo AAAA-MM-DD (o mesmo dia do `date()`).
    const dia = (x) => new Date(0).setUTCFullYear(Number(x[1]), Number(x[2]) - 1, Number(x[3]));
    return Math.round((dia(m) - dia(h)) / 86400000);
  }
  const d = new Date(dateStr);
  if (Number.isNaN(d.getTime())) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  d.setHours(0, 0, 0, 0);
  return Math.ceil((d - today) / (1000 * 60 * 60 * 24));
}

function buildSearchWhere(fields, search) {
  if (!search) return { clause: '', params: [] };
  const term = `%${search}%`;
  const parts = fields.map((f) => `${f} LIKE ?`);
  return { clause: ` AND (${parts.join(' OR ')})`, params: fields.map(() => term) };
}

/**
 * Frota Etapa 3 (RN-F3.08): sobe a leitura do veiculo para a maior num comando so. Antes era ler e depois gravar (dois comandos):
 * dois lancamentos em paralelo liam o mesmo valor e o de leitura MENOR podia gravar por ultimo (o veiculo descia).
 */
async function updateKmVeiculoSeMaior(db, veiculoId, km) {
  if (km == null || Number.isNaN(Number(km))) return;
  await dbRun(db, `UPDATE frotas_veiculos SET km_atual = MAX(COALESCE(km_atual, 0), ?), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`, [Number(km), veiculoId]);
}

/** Frota Etapa 3 (A10, RN-F3.04/08): o horimetro da maquina — ate aqui sem chamador. */
async function updateHorimetroVeiculoSeMaior(db, veiculoId, horimetro) {
  if (horimetro == null || Number.isNaN(Number(horimetro))) return;
  await dbRun(db, `UPDATE frotas_veiculos SET horimetro_atual = MAX(COALESCE(horimetro_atual, 0), ?), updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`, [Number(horimetro), veiculoId]);
}

/**
 * Frota Etapa 3: horimetro opcional vindo do formulario do gestor ('' / null / ausente -> null). Fase5-R1/R2: texto que nao e numero
 * ("130,5", "abc") virava NaN e gravava NULL — no PUT apagava a leitura gravada; negativo gravava. Agora 400.
 */
function numeroOpcional(v) {
  if (v == null || v === '') return null;
  const textoTorto = typeof v === 'string' && !/^\d+(\.\d+)?$/.test(v.trim()); // a mesma regua do portal (lerKm)
  const n = typeof v === 'boolean' || textoTorto ? NaN : Number(v);
  if (!Number.isFinite(n) || n < 0) {
    const err = new Error('Horímetro inválido');
    err.status = 400;
    throw err;
  }
  return n;
}

// Fase5-R4: ate 6 casas — com 2, um atual de 1800,004 aparecia como 1.800 e contradizia a leitura 1800 recusada
const formatoBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });

/** RN-F3.06 / RN-F3.15: retorno de maquina por horimetro abaixo da saida — dura, como a RN-F1.07 do km (portal e gestor). */
function conferirHorimetroDoRetorno(horimetroSaida, horimetroRetorno) {
  if (horimetroSaida != null && horimetroRetorno != null && Number(horimetroRetorno) < Number(horimetroSaida)) {
    const err = new Error(`Horímetro do retorno (${formatoBR.format(Number(horimetroRetorno))} h) menor que o da saída (${
      formatoBR.format(Number(horimetroSaida))} h). Confira o painel.`);
    err.status = 400;
    throw err;
  }
}

// ── Escopo do motorista (Frotas Etapa 1, A6) ─────────────────────────────────

const MSG_NAO_VINCULADO = 'Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo.';
const MSG_SO_OS_SEUS = 'Você só pode alterar os seus próprios registros';

function erroNaoVinculado() {
  const err = new Error(MSG_NAO_VINCULADO);
  err.status = 409;
  err.code = 'MOTORISTA_NAO_VINCULADO';
  return err;
}

function erroSoOsSeus() {
  const err = new Error(MSG_SO_OS_SEUS);
  err.status = 403;
  return err;
}

/** RN-F1.12: o motorista (ativo) ligado ao usuario, ou null. */
async function motoristaDoUsuario(db, user) {
  if (!user?.id) return null;
  return dbGet(db, 'SELECT * FROM frotas_motoristas WHERE usuario_id = ? AND ativo = 1 ORDER BY id LIMIT 1', [user.id]);
}

/**
 * RN-F1.14/15/19: `null` quando o usuario e ADMIN_FROTA ou CONSULTA (desde a Fase5-1 da Etapa 2; antes: "nao e MOTORISTA") (ve e altera tudo — ou nao ha usuario, chamada interna);
 * senao `{ motoristaId, usuarioId }` (motoristaId nulo = sem vinculo). Antes, o motorista logado listava tudo de todos — inclusive
 * CPF/CNH dos colegas (A6).
 */
async function escopoDoUsuario(db, user) {
  if (!user) return null;
  const { getPerfilFromUser, PERFIS } = require('./permissions');
  // Frotas Etapa 2 (Fase5-1): escopo FECHADO — so ADMIN_FROTA e CONSULTA leem tudo. Antes era "so o MOTORISTA e restrito", e uma
  // linha com valor fora da lista (ex.: 'consulta' minusculo gravado por SQL, como a C2 ensinava) lia CPF/CNH de todos e os
  // documentos com valor, sem poder agir em nada.
  const perfil = getPerfilFromUser(user);
  if (perfil === PERFIS.ADMIN_FROTA || perfil === PERFIS.CONSULTA) return null;
  const m = await motoristaDoUsuario(db, user);
  return { motoristaId: m ? m.id : null, usuarioId: user.id };
}

/** RN-F1.19: para MOTORISTA, o motorista_id e sempre o do vinculo (o do corpo e ignorado); sem vinculo -> 409. */
async function forcarMotoristaDoVinculo(db, user, data) {
  const esc = await escopoDoUsuario(db, user);
  if (!esc) return data;
  if (!esc.motoristaId) throw erroNaoVinculado();
  return { ...data, motorista_id: esc.motoristaId };
}

/** RN-F1.15 + RN-F1.19 no PUT: o registro tem de ser do motorista do vinculo. */
async function conferirDonoPorMotorista(db, user, current, data) {
  const esc = await escopoDoUsuario(db, user);
  if (!esc) return data;
  if (!esc.motoristaId) throw erroNaoVinculado();
  if (Number(current.motorista_id) !== Number(esc.motoristaId)) throw erroSoOsSeus();
  return { ...data, motorista_id: esc.motoristaId };
}

/** F2-5: usuario inexistente/inativo -> 400; ligado a outro motorista ativo -> 409 (RN-F1.12). */
async function conferirUsuarioDoVinculo(db, usuarioId, motoristaId = 0) {
  if (usuarioId == null) return;
  const u = await dbGet(db, 'SELECT id FROM usuarios WHERE id = ? AND ativo = 1', [usuarioId]);
  if (!u) {
    const err = new Error('Usuário não encontrado');
    err.status = 400;
    throw err;
  }
  const outro = await dbGet(db, 'SELECT id, nome FROM frotas_motoristas WHERE usuario_id = ? AND ativo = 1 AND id != ? LIMIT 1',
    [usuarioId, motoristaId || 0]);
  if (outro) {
    const err = new Error(`Este usuário já está ligado ao motorista ${outro.nome}`);
    err.status = 409;
    throw err;
  }
}

/**
 * Fase5-9: a corrida que passou pela conferencia bate no indice unico parcial (idx_frotas_motoristas_usuario_ativo) — vira a 409
 * do contrato, com o nome relido de quem ficou com o usuario.
 */
async function traduzirVinculoDuplicado(db, e, usuarioId, motoristaId = 0) {
  if (!e || e.code !== 'SQLITE_CONSTRAINT' || !/usuario_id|idx_frotas_motoristas_usuario_ativo/.test(String(e.message))) return e;
  const outro = await dbGet(db, 'SELECT nome FROM frotas_motoristas WHERE usuario_id = ? AND ativo = 1 AND id != ? ORDER BY id LIMIT 1',
    [usuarioId, motoristaId || 0]);
  if (!outro) return e;
  const err = new Error(`Este usuário já está ligado ao motorista ${outro.nome}`);
  err.status = 409;
  return err;
}

function normalizarUsuarioId(v) {
  if (v === undefined || v === null || v === '') return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : v;
}

/**
 * F2-5: todos os usuarios ativos (sem o filtro de setor de /usuarios/por-modulo), com o motorista ja ligado.
 * Fase5-10: tambem o usuario DESATIVADO que segue ligado a um motorista ativo, com `ativo: false` — sem ele o select da tela
 * mostrava "— nenhum —" para um vinculo que existe. Os demais vem com `ativo: true`.
 */
async function listUsuariosVinculaveis(db) {
  // Frotas Etapa 2 (RN-F2.08): + perfil_frota (o efetivo, pela regua unica) para o aviso do cadastro do motorista
  const { classificarPerfilFrota } = require('./permissions');
  const rows = await dbAll(db, `SELECT u.id, u.nome, u.email, u.ativo, u.role, u.is_superadmin, u.admin_modulos,
      p.perfil AS perfil_explicito, m.id AS motorista_id, m.nome AS motorista_nome
    FROM usuarios u
    LEFT JOIN perfil_frota_usuario p ON p.usuario_id = u.id
    LEFT JOIN frotas_motoristas m ON m.usuario_id = u.id AND m.ativo = 1
    WHERE u.ativo = 1 OR m.id IS NOT NULL
    ORDER BY u.nome, u.id, m.id`);
  const vistos = new Set(); // legado com dois motoristas ativos no mesmo usuario: o primeiro
  return rows.filter((r) => (vistos.has(r.id) ? false : vistos.add(r.id))).map((r) => ({
    id: r.id, nome: r.nome, email: r.email, ativo: Number(r.ativo) === 1,
    motorista: r.motorista_id ? { id: r.motorista_id, nome: r.motorista_nome } : null,
    perfil_frota: classificarPerfilFrota(r, r.perfil_explicito).efetivo,
  }));
}

// ── Meta ─────────────────────────────────────────────────────────────────────

async function getMeta(db) {
  const tipos = await dbAll(db, 'SELECT * FROM frotas_tipos_veiculo WHERE ativo = 1 ORDER BY nome');
  const motoristas = await dbAll(db, "SELECT id, nome FROM frotas_motoristas WHERE ativo = 1 AND status = 'ativo' ORDER BY nome");
  const {
    SETORES_GMP, CENTROS_CUSTO_GMP, STATUS_VEICULO, TIPOS_COMBUSTIVEL, TIPOS_MANUTENCAO, TIPOS_DOCUMENTO, TIPOS_MEDICAO, STATUS_VIAGEM,
    ITENS_CHECKLIST, VISTAS_AVARIA, TIPOS_AVARIA, NIVEIS_COMBUSTIVEL, TIPOS_REGISTRO, ORIGEM_PADRAO,
  } = require('./schema');
  return {
    tipos, motoristas, setores: SETORES_GMP, centrosCusto: CENTROS_CUSTO_GMP,
    // Frota Etapa 8 (RN-F8.16): a origem fixa da saida do portal; a tela do gestor preenche a viagem nova com ela
    origemPadrao: ORIGEM_PADRAO,
    statusVeiculo: STATUS_VEICULO, combustiveis: TIPOS_COMBUSTIVEL,
    tiposManutencao: TIPOS_MANUTENCAO, tiposDocumento: TIPOS_DOCUMENTO,
    tiposMedicao: TIPOS_MEDICAO, statusViagem: STATUS_VIAGEM,
    // Frotas Etapa 1 (RN-F1.01): os 12 itens do papel e as listas do portal
    itensChecklist: ITENS_CHECKLIST, vistasAvaria: VISTAS_AVARIA, tiposAvaria: TIPOS_AVARIA,
    niveisCombustivel: NIVEIS_COMBUSTIVEL, tiposRegistro: TIPOS_REGISTRO,
  };
}

// ── Veículos ─────────────────────────────────────────────────────────────────

async function listVeiculos(db, { search, status } = {}) {
  let sql = `${VEICULO_JOIN} WHERE v.ativo = 1`;
  const params = [];
  const s = buildSearchWhere(['v.placa', 'v.modelo', 'v.marca', 'v.setor_responsavel'], search);
  sql += s.clause;
  params.push(...s.params);
  if (status) {
    sql += ' AND v.status = ?';
    params.push(status);
  }
  sql += ' ORDER BY v.placa';
  return dbAll(db, sql, params);
}

async function getVeiculo(db, id) {
  return dbGet(db, `${VEICULO_JOIN} WHERE v.id = ?`, [id]);
}

async function createVeiculo(db, userOrData, maybeData) {
  const data = maybeData || userOrData;
  const placa = normalizePlaca(data.placa);
  if (!placa) {
    const err = new Error('Placa é obrigatória');
    err.status = 400;
    throw err;
  }
  const exists = await dbGet(db, 'SELECT id FROM frotas_veiculos WHERE placa = ? AND ativo = 1', [placa]);
  if (exists) {
    const err = new Error('Placa já cadastrada');
    err.status = 409;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_veiculos
    (placa, modelo, marca, ano, tipo_id, tipo_texto, status, km_atual, horimetro_atual, tipo_medicao,
     combustivel, consumo_medio_esperado, setor_responsavel, centro_custo, motorista_id,
     cor, chassi, renavam, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    placa, data.modelo || null, data.marca || null, data.ano || null,
    data.tipo_id || null, data.tipo_texto || null, data.status || 'ativo',
    Number(data.km_atual) || 0, Number(data.horimetro_atual) || 0, data.tipo_medicao || 'km',
    data.combustivel || 'diesel', data.consumo_medio_esperado != null ? Number(data.consumo_medio_esperado) : null,
    data.setor_responsavel || null, data.centro_custo || null, data.motorista_id || null,
    data.cor || null, data.chassi || null, data.renavam || null, data.observacoes || null,
  ]);
  return getVeiculo(db, r.lastID);
}

async function updateVeiculo(db, id, data) {
  const current = await getVeiculo(db, id);
  if (!current) {
    const err = new Error('Veículo não encontrado');
    err.status = 404;
    throw err;
  }
  const placa = data.placa != null ? normalizePlaca(data.placa) : current.placa;
  if (placa !== current.placa) {
    const exists = await dbGet(db, 'SELECT id FROM frotas_veiculos WHERE placa = ? AND id != ? AND ativo = 1', [placa, id]);
    if (exists) {
      const err = new Error('Placa já cadastrada');
      err.status = 409;
      throw err;
    }
  }
  await dbRun(db, `UPDATE frotas_veiculos SET
    placa=?, modelo=?, marca=?, ano=?, tipo_id=?, tipo_texto=?, status=?, km_atual=?, horimetro_atual=?,
    tipo_medicao=?, combustivel=?, consumo_medio_esperado=?, setor_responsavel=?, centro_custo=?,
    motorista_id=?, cor=?, chassi=?, renavam=?, observacoes=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    placa, data.modelo ?? current.modelo, data.marca ?? current.marca, data.ano ?? current.ano,
    data.tipo_id ?? current.tipo_id, data.tipo_texto ?? current.tipo_texto,
    data.status ?? current.status, data.km_atual != null ? Number(data.km_atual) : current.km_atual,
    data.horimetro_atual != null ? Number(data.horimetro_atual) : current.horimetro_atual,
    data.tipo_medicao ?? current.tipo_medicao ?? 'km',
    data.combustivel ?? current.combustivel,
    data.consumo_medio_esperado != null ? Number(data.consumo_medio_esperado) : current.consumo_medio_esperado,
    data.setor_responsavel ?? current.setor_responsavel, data.centro_custo ?? current.centro_custo,
    data.motorista_id ?? current.motorista_id,
    data.cor ?? current.cor, data.chassi ?? current.chassi, data.renavam ?? current.renavam,
    data.observacoes ?? current.observacoes, id,
  ]);
  return getVeiculo(db, id);
}

async function deleteVeiculo(db, id) {
  await dbRun(db, 'UPDATE frotas_veiculos SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return { success: true };
}

// ── Motoristas ───────────────────────────────────────────────────────────────

async function listMotoristas(db, { search, status } = {}, user) {
  let sql = 'SELECT * FROM frotas_motoristas WHERE ativo = 1';
  const params = [];
  // RN-F1.14: o MOTORISTA so ve a si mesmo (CPF/CNH dos colegas ficavam abertos — A6); sem vinculo, lista vazia
  const esc = await escopoDoUsuario(db, user);
  if (esc) {
    if (!esc.motoristaId) return [];
    sql += ' AND id = ?';
    params.push(esc.motoristaId);
  }
  const s = buildSearchWhere(['nome', 'cpf', 'cnh_numero', 'setor'], search);
  sql += s.clause;
  params.push(...s.params);
  if (status) {
    sql += ' AND status = ?';
    params.push(status);
  }
  sql += ' ORDER BY nome';
  return dbAll(db, sql, params);
}

async function getMotorista(db, id, user) {
  // F2-2: MOTORISTA pedindo outro -> nulo (a rota responde 404 "Não encontrado")
  const esc = await escopoDoUsuario(db, user);
  if (esc && Number(esc.motoristaId) !== Number(id)) return null;
  return dbGet(db, 'SELECT * FROM frotas_motoristas WHERE id = ? AND ativo = 1', [id]);
}

async function createMotorista(db, userOrData, maybeData) {
  const data = maybeData || userOrData;
  if (!data.nome) {
    const err = new Error('Nome é obrigatório');
    err.status = 400;
    throw err;
  }
  const usuarioId = normalizarUsuarioId(data.usuario_id);
  await conferirUsuarioDoVinculo(db, usuarioId); // RN-F1.12
  const r = await dbRun(db, `INSERT INTO frotas_motoristas
    (nome, cpf, usuario_id, cnh_numero, cnh_categoria, cnh_validade, telefone, email, setor, status, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    data.nome, data.cpf || null, usuarioId, data.cnh_numero || null,
    data.cnh_categoria || null, data.cnh_validade || null, data.telefone || null,
    data.email || null, data.setor || null, data.status || 'ativo', data.observacoes || null,
  ]).catch(async (e) => { throw await traduzirVinculoDuplicado(db, e, usuarioId); }); // Fase5-9
  return getMotorista(db, r.lastID);
}

async function updateMotorista(db, id, data) {
  const current = await getMotorista(db, id);
  if (!current) {
    const err = new Error('Motorista não encontrado');
    err.status = 404;
    throw err;
  }
  // F2-4: `'usuario_id' in data` — null DESVINCULA (o `??` antigo ignorava o null e nao havia como desfazer o vinculo)
  const usuarioId = 'usuario_id' in data ? normalizarUsuarioId(data.usuario_id) : current.usuario_id;
  // Fase5-10: manter o MESMO usuario ja gravado passa mesmo se ele foi desativado (antes, todo salvar dava 400 e nao havia como
  // editar o motorista); so a troca valida existencia/ativo e o vinculo com outro motorista.
  const mudou = 'usuario_id' in data && String(usuarioId ?? '') !== String(current.usuario_id ?? '');
  if (mudou) await conferirUsuarioDoVinculo(db, usuarioId, Number(id));
  await dbRun(db, `UPDATE frotas_motoristas SET
    nome=?, cpf=?, usuario_id=?, cnh_numero=?, cnh_categoria=?, cnh_validade=?,
    telefone=?, email=?, setor=?, status=?, observacoes=?, updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    data.nome ?? current.nome, data.cpf ?? current.cpf, usuarioId,
    data.cnh_numero ?? current.cnh_numero, data.cnh_categoria ?? current.cnh_categoria,
    data.cnh_validade ?? current.cnh_validade, data.telefone ?? current.telefone,
    data.email ?? current.email, data.setor ?? current.setor, data.status ?? current.status,
    data.observacoes ?? current.observacoes, id,
  ]).catch(async (e) => { throw await traduzirVinculoDuplicado(db, e, usuarioId, Number(id)); }); // Fase5-9
  return getMotorista(db, id);
}

async function deleteMotorista(db, id) {
  await dbRun(db, 'UPDATE frotas_motoristas SET ativo = 0, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [id]);
  return { success: true };
}

// ── Manutenções ──────────────────────────────────────────────────────────────

async function listManutencoes(db, { search, veiculo_id, tipo } = {}, user) {
  let sql = `SELECT m.*, v.placa, v.modelo as veiculo_modelo
    FROM frotas_manutencoes m
    JOIN frotas_veiculos v ON m.veiculo_id = v.id
    WHERE 1=1`;
  const params = [];
  // RN-F1.14: manutencao nao tem motorista — o MOTORISTA ve as que ele mesmo lancou
  const esc = await escopoDoUsuario(db, user);
  if (esc) { sql += ' AND m.usuario_id = ?'; params.push(esc.usuarioId); }
  if (veiculo_id) {
    sql += ' AND m.veiculo_id = ?';
    params.push(veiculo_id);
  }
  if (tipo) {
    sql += ' AND m.tipo = ?';
    params.push(tipo);
  }
  const s = buildSearchWhere(['m.descricao', 'm.oficina', 'v.placa'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY m.data_manutencao DESC, m.id DESC';
  return dbAll(db, sql, params);
}

async function createManutencao(db, user, data) {
  if (!data.veiculo_id || !data.descricao) {
    const err = new Error('Veículo e descrição são obrigatórios');
    err.status = 400;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_manutencoes
    (veiculo_id, tipo, descricao, oficina, custo, pecas_descricao, km_manutencao, data_manutencao,
     proxima_revisao_km, proxima_revisao_data, status, usuario_id, usuario_nome, observacoes, requisicao_almox_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.tipo || 'preventiva', data.descricao, data.oficina || null,
    Number(data.custo) || 0, data.pecas_descricao || null, data.km_manutencao != null ? Number(data.km_manutencao) : null,
    data.data_manutencao || hojeLocalISO(), // Etapa 164 (RN-164.06, B1048): o dia de Brasilia, nao o UTC
    data.proxima_revisao_km != null ? Number(data.proxima_revisao_km) : null,
    data.proxima_revisao_data || null, data.status || 'concluida',
    user?.id || null, user?.nome || user?.name || null, data.observacoes || null,
    data.requisicao_almox_id || null,
  ]);
  if (data.km_manutencao != null) {
    await updateKmVeiculoSeMaior(db, data.veiculo_id, data.km_manutencao);
  }
  if (data.status === 'em_andamento') {
    await dbRun(db, "UPDATE frotas_veiculos SET status = 'manutencao', updated_at = CURRENT_TIMESTAMP WHERE id = ?", [data.veiculo_id]);
  }
  return dbGet(db, 'SELECT * FROM frotas_manutencoes WHERE id = ?', [r.lastID]);
}

async function updateManutencao(db, id, data, user) {
  const current = await dbGet(db, 'SELECT * FROM frotas_manutencoes WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Manutenção não encontrada');
    err.status = 404;
    throw err;
  }
  const esc = await escopoDoUsuario(db, user); // RN-F1.15: a manutencao do MOTORISTA e a que ele lancou
  if (esc && Number(current.usuario_id) !== Number(esc.usuarioId)) throw erroSoOsSeus();
  await dbRun(db, `UPDATE frotas_manutencoes SET
    veiculo_id=?, tipo=?, descricao=?, oficina=?, custo=?, pecas_descricao=?, km_manutencao=?,
    data_manutencao=?, proxima_revisao_km=?, proxima_revisao_data=?, status=?, observacoes=?,
    requisicao_almox_id=?
    WHERE id=?`, [
    data.veiculo_id ?? current.veiculo_id, data.tipo ?? current.tipo, data.descricao ?? current.descricao,
    data.oficina ?? current.oficina, data.custo != null ? Number(data.custo) : current.custo,
    data.pecas_descricao ?? current.pecas_descricao,
    data.km_manutencao != null ? Number(data.km_manutencao) : current.km_manutencao,
    data.data_manutencao ?? current.data_manutencao,
    data.proxima_revisao_km != null ? Number(data.proxima_revisao_km) : current.proxima_revisao_km,
    data.proxima_revisao_data ?? current.proxima_revisao_data, data.status ?? current.status,
    data.observacoes ?? current.observacoes,
    data.requisicao_almox_id ?? current.requisicao_almox_id, id,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_manutencoes WHERE id = ?', [id]);
}

async function deleteManutencao(db, id) {
  await dbRun(db, 'DELETE FROM frotas_manutencoes WHERE id = ?', [id]);
  return { success: true };
}

// ── Abastecimentos ───────────────────────────────────────────────────────────

async function listAbastecimentos(db, { search, veiculo_id } = {}, user) {
  let sql = `SELECT a.*, v.placa, m.nome as motorista_nome
    FROM frotas_abastecimentos a
    JOIN frotas_veiculos v ON a.veiculo_id = v.id
    LEFT JOIN frotas_motoristas m ON a.motorista_id = m.id
    WHERE 1=1`;
  const params = [];
  const esc = await escopoDoUsuario(db, user); // RN-F1.14
  if (esc) {
    if (!esc.motoristaId) return [];
    sql += ' AND a.motorista_id = ?';
    params.push(esc.motoristaId);
  }
  if (veiculo_id) {
    sql += ' AND a.veiculo_id = ?';
    params.push(veiculo_id);
  }
  const s = buildSearchWhere(['v.placa', 'a.posto'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY a.data_abastecimento DESC, a.id DESC';
  const rows = await dbAll(db, sql, params);
  return comLitrosPorHora(db, rows); // Frota Etapa 4 (RN-F4.09)
}

/**
 * Frota Etapa 4 (RN-F4.05/06/08): litros por hora da maquina, calculado NA LEITURA (nada gravado — criar, editar e excluir refazem o
 * vizinho por construcao). A regua da RN-F1.11 com horas no lugar do km: o anterior e o abastecimento de horimetro imediatamente
 * menor do mesmo veiculo (ordem `horimetro ASC, id ASC`, so linhas com horimetro); horas = horimetro − o do anterior; L/h = litros
 * DESTE ÷ horas, 2 casas. Sem anterior: horas e L/h nulos; horas ≤ 0: L/h nulo. Olha so o horimetro da linha (B39): uma linha com km
 * e horimetro tem km/L e L/h. O anterior e procurado entre TODAS as linhas do veiculo, fora do filtro de quem pede (periodo, motorista).
 * Devolve Map id -> { horas_desde_anterior, consumo_litros_hora } das linhas com horimetro dos veiculos pedidos.
 */
async function litrosPorHora(db, veiculoIds) {
  const ids = [...new Set((veiculoIds || []).map(Number).filter(Number.isFinite))];
  const mapa = new Map();
  if (!ids.length) return mapa;
  const linhas = await dbAll(db, `SELECT id, veiculo_id, horimetro_abastecimento AS h, litros FROM frotas_abastecimentos
    WHERE horimetro_abastecimento IS NOT NULL AND veiculo_id IN (${ids.map(() => '?').join(',')})
    ORDER BY veiculo_id, horimetro_abastecimento ASC, id ASC`, ids);
  let anterior = null;
  for (const l of linhas) {
    let horas = null;
    let lph = null;
    if (anterior && anterior.veiculo_id === l.veiculo_id) {
      const diff = Number(l.h) - Number(anterior.h);
      horas = Math.round(diff * 1e6) / 1e6;
      if (horas > 0 && Number(l.litros) > 0) lph = Math.round((Number(l.litros) / horas) * 100) / 100;
    }
    mapa.set(l.id, { horas_desde_anterior: horas, consumo_litros_hora: lph });
    anterior = l;
  }
  return mapa;
}

/** Acrescenta horas_desde_anterior e consumo_litros_hora a linhas de abastecimento (com `id` e `veiculo_id`). */
async function comLitrosPorHora(db, rows) {
  const mapa = await litrosPorHora(db, rows.map((r) => r.veiculo_id));
  return rows.map((r) => {
    const x = mapa.get(r.id);
    return { ...r, horas_desde_anterior: x ? x.horas_desde_anterior : null, consumo_litros_hora: x ? x.consumo_litros_hora : null };
  });
}

/**
 * Frota Etapa 4 (RN-F4.03): filtro de periodo com cada data opcional — a regua da planilha (`substr(col,1,10)`), para a tela e a
 * planilha mostrarem a mesma coisa. `expr` e uma expressao SQL que da o dia 'AAAA-MM-DD'.
 */
function filtroDoPeriodo(expr, { data_inicio: inicio, data_fim: fim } = {}) {
  const partes = [];
  const params = [];
  if (inicio) { partes.push(`${expr} >= ?`); params.push(String(inicio).slice(0, 10)); }
  if (fim) { partes.push(`${expr} <= ?`); params.push(String(fim).slice(0, 10)); }
  return { sql: partes.length ? ` AND ${partes.join(' AND ')}` : '', params };
}

/**
 * Frota Etapa 4 (RN-F4.01): o dia de uma multa para o periodo — a data da infracao; sem ela (nula ou ''), o dia de Brasilia em que
 * foi lancada (`created_at` e instante UTC). `alias` e o da tabela frotas_multas na consulta. Devolve { sql, params } da expressao.
 */
function diaDaMultaSql(alias = 'mu') {
  return {
    sql: `COALESCE(NULLIF(substr(${alias}.data_infracao, 1, 10), ''), date(${alias}.created_at, ?))`,
    params: [modificadorDoFuso()],
  };
}

/**
 * Frotas Etapa 1 (RN-F1.11, A1, A2, F2-8): o km/L de um abastecimento conta do anterior EM KM do mesmo veiculo (ordem `km ASC, id ASC`),
 * nao do de data mais nova. Antes: `ORDER BY data_abastecimento DESC` — um lancamento retroativo virava o "anterior" de si mesmo e o
 * do seguinte nunca era refeito (A1); e o PUT recalculava contra o mais novo, que muitas vezes era ele proprio (kmDiff 0 -> km/L nulo, A2).
 * Linha sem km fica com km/L e km_desde_anterior nulos e nao serve de anterior.
 */
async function anteriorEmKm(db, veiculoId, km, id) {
  return dbGet(db,
    `SELECT id, km_abastecimento FROM frotas_abastecimentos
     WHERE veiculo_id = ? AND km_abastecimento IS NOT NULL AND id != ?
       AND (km_abastecimento < ? OR (km_abastecimento = ? AND id < ?))
     ORDER BY km_abastecimento DESC, id DESC LIMIT 1`,
    [veiculoId, id, km, km, id]);
}

async function seguinteEmKm(db, veiculoId, km, id) {
  if (km == null) return null;
  return dbGet(db,
    `SELECT id FROM frotas_abastecimentos
     WHERE veiculo_id = ? AND km_abastecimento IS NOT NULL AND id != ?
       AND (km_abastecimento > ? OR (km_abastecimento = ? AND id > ?))
     ORDER BY km_abastecimento ASC, id ASC LIMIT 1`,
    [veiculoId, id, km, km, id]);
}

/** Recalcula km_desde_anterior e consumo_medio de UMA linha pela regua da RN-F1.11. */
async function recalcularConsumoDaLinha(db, id) {
  const a = await dbGet(db, 'SELECT id, veiculo_id, km_abastecimento, litros FROM frotas_abastecimentos WHERE id = ?', [id]);
  if (!a) return;
  let kmDesde = null;
  let consumo = null;
  if (a.km_abastecimento != null) {
    const prev = await anteriorEmKm(db, a.veiculo_id, Number(a.km_abastecimento), a.id);
    if (prev) {
      kmDesde = Number(a.km_abastecimento) - Number(prev.km_abastecimento);
      if (kmDesde > 0 && Number(a.litros) > 0) consumo = Math.round((kmDesde / Number(a.litros)) * 100) / 100;
    }
  }
  await dbRun(db, 'UPDATE frotas_abastecimentos SET km_desde_anterior = ?, consumo_medio = ? WHERE id = ?', [kmDesde, consumo, id]);
}

/** Recalcula o seguinte (em km) da posicao (veiculo, km, id) — a posicao pode ser a de uma linha que ja saiu dali ou foi apagada. */
async function recalcularSeguinte(db, veiculoId, km, id) {
  const seg = await seguinteEmKm(db, veiculoId, km, id);
  if (seg) await recalcularConsumoDaLinha(db, seg.id);
}

/**
 * Frota Etapa 4 (Fase5-R2): litros do gestor — numero finito maior que zero (a regua do portal). Antes o PUT aceitava -10 e 0, e os
 * totais do relatorio de consumo (que desde a Etapa 4 somam todas as linhas, B47) mostravam a soma torta.
 */
function lerLitrosDoGestor(v) {
  const n = typeof v === 'string' && v.trim() === '' ? NaN : Number(v);
  if (!Number.isFinite(n) || n <= 0) {
    const err = new Error('Informe os litros');
    err.status = 400;
    throw err;
  }
  return n;
}

async function createAbastecimento(db, user, dataBruta) {
  const data = await forcarMotoristaDoVinculo(db, user, dataBruta || {}); // RN-F1.19
  if (!data.veiculo_id || !data.litros || !data.data_abastecimento) {
    const err = new Error('Veículo, litros e data são obrigatórios');
    err.status = 400;
    throw err;
  }
  const litros = lerLitrosDoGestor(data.litros);
  const valorTotal = Number(data.valor_total) || 0;
  const valorLitro = data.valor_litro != null ? Number(data.valor_litro) : (litros > 0 ? valorTotal / litros : 0);
  const km = data.km_abastecimento != null && data.km_abastecimento !== '' ? Number(data.km_abastecimento) : null;
  const horimetro = numeroOpcional(data.horimetro_abastecimento); // Frota Etapa 3 (RN-F3.04/15): fora da regua do km/L
  const r = await dbRun(db, `INSERT INTO frotas_abastecimentos
    (veiculo_id, motorista_id, data_abastecimento, litros, valor_total, valor_litro, posto,
     km_abastecimento, combustivel_tipo, consumo_medio, observacoes, usuario_id, usuario_nome, horimetro_abastecimento)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.motorista_id || null, data.data_abastecimento, litros, valorTotal, valorLitro,
    data.posto || null, km,
    data.combustivel_tipo || null, null, data.observacoes || null,
    user?.id || null, user?.nome || user?.name || null, horimetro,
  ]);
  await recalcularConsumoDaLinha(db, r.lastID);
  await recalcularSeguinte(db, data.veiculo_id, km, r.lastID);
  if (km != null) {
    await updateKmVeiculoSeMaior(db, data.veiculo_id, km);
  }
  if (horimetro != null) await updateHorimetroVeiculoSeMaior(db, data.veiculo_id, horimetro);
  return dbGet(db, 'SELECT * FROM frotas_abastecimentos WHERE id = ?', [r.lastID]);
}

async function updateAbastecimento(db, id, dataBruta, user) {
  const current = await dbGet(db, 'SELECT * FROM frotas_abastecimentos WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Abastecimento não encontrado');
    err.status = 404;
    throw err;
  }
  const data = await conferirDonoPorMotorista(db, user, current, dataBruta); // RN-F1.15 / RN-F1.19
  const litros = data.litros != null ? lerLitrosDoGestor(data.litros) : current.litros;
  const valorTotal = data.valor_total != null ? Number(data.valor_total) : current.valor_total;
  // Fase5-1: litros ou valor_total novos sem valor_litro no corpo -> recalcula (antes ficava o preco antigo: 40L R$200 -> 50L seguia 5/L)
  let valorLitro = current.valor_litro;
  if (data.valor_litro != null && data.valor_litro !== '') valorLitro = Number(data.valor_litro);
  else if ((data.litros != null || data.valor_total != null) && litros > 0) valorLitro = (Number(valorTotal) || 0) / litros;
  const km = 'km_abastecimento' in data
    ? (data.km_abastecimento != null && data.km_abastecimento !== '' ? Number(data.km_abastecimento) : null)
    : current.km_abastecimento;
  const veiculoId = data.veiculo_id ?? current.veiculo_id;
  // Frota Etapa 3 (RN-F3.15): o gestor corrige a leitura de horas; ausente no corpo mantem, vazio apaga (como o km)
  const horimetro = 'horimetro_abastecimento' in data ? numeroOpcional(data.horimetro_abastecimento) : current.horimetro_abastecimento;
  await dbRun(db, `UPDATE frotas_abastecimentos SET
    veiculo_id=?, motorista_id=?, data_abastecimento=?, litros=?, valor_total=?, valor_litro=?,
    posto=?, km_abastecimento=?, combustivel_tipo=?, observacoes=?, horimetro_abastecimento=? WHERE id=?`, [
    veiculoId, data.motorista_id ?? current.motorista_id, data.data_abastecimento ?? current.data_abastecimento,
    litros, valorTotal, valorLitro, data.posto ?? current.posto, km,
    data.combustivel_tipo ?? current.combustivel_tipo, data.observacoes ?? current.observacoes, horimetro, id,
  ]);
  await recalcularConsumoDaLinha(db, id);
  // F2-8: o seguinte da posicao antiga (no veiculo antigo) e o da nova (no veiculo novo)
  if (current.km_abastecimento != null) await recalcularSeguinte(db, current.veiculo_id, Number(current.km_abastecimento), Number(id));
  await recalcularSeguinte(db, veiculoId, km, Number(id));
  if (km != null) await updateKmVeiculoSeMaior(db, veiculoId, km);
  if (horimetro != null) await updateHorimetroVeiculoSeMaior(db, veiculoId, horimetro);
  return dbGet(db, 'SELECT * FROM frotas_abastecimentos WHERE id = ?', [id]);
}

async function deleteAbastecimento(db, id) {
  const current = await dbGet(db, 'SELECT * FROM frotas_abastecimentos WHERE id = ?', [id]);
  await dbRun(db, 'DELETE FROM frotas_abastecimentos WHERE id = ?', [id]);
  if (current && current.km_abastecimento != null) {
    await recalcularSeguinte(db, current.veiculo_id, Number(current.km_abastecimento), Number(id));
  }
  return { success: true };
}

// ── Multas ───────────────────────────────────────────────────────────────────

async function listMultas(db, { search, veiculo_id, status_pagamento } = {}, user) {
  let sql = `SELECT mu.*, v.placa, mot.nome as motorista_nome
    FROM frotas_multas mu
    JOIN frotas_veiculos v ON mu.veiculo_id = v.id
    LEFT JOIN frotas_motoristas mot ON mu.motorista_id = mot.id
    WHERE 1=1`;
  const params = [];
  const esc = await escopoDoUsuario(db, user); // RN-F1.14
  if (esc) {
    if (!esc.motoristaId) return [];
    sql += ' AND mu.motorista_id = ?';
    params.push(esc.motoristaId);
  }
  if (veiculo_id) { sql += ' AND mu.veiculo_id = ?'; params.push(veiculo_id); }
  if (status_pagamento) { sql += ' AND mu.status_pagamento = ?'; params.push(status_pagamento); }
  const s = buildSearchWhere(['mu.descricao', 'v.placa', 'mu.numero_auto'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY mu.data_infracao DESC';
  return dbAll(db, sql, params);
}

// A rota generica chama `createFn(db, req.user, req.body)` — tres argumentos.
// Estas duas declaravam `(db, data)` e recebiam o USUARIO no lugar do corpo:
// `data.veiculo_id` era sempre indefinido e a criacao respondia 400 "Veiculo e
// obrigatorio" com o veiculo preenchido. Multa e documento nao podiam ser
// criados pela API. Descoberto ao povoar as telas de Frota para medi-las.
/**
 * Frota Etapa 4 (Fase5-R1): o status da multa so pode ser um dos tres da tela. Antes gravava qualquer texto: "Contestado" (maiusculo)
 * ou "contestado " somavam no custo por veiculo (que compara com 'contestado') e a planilha a mostrava como contestada — tela e
 * planilha deixavam de bater (RN-F4.14). Recusa em vez de normalizar (B53). Ausente/nulo/vazio: o padrao (criar) ou o gravado (PUT).
 */
const STATUS_MULTA = ['pendente', 'pago', 'contestado'];
function conferirStatusDaMulta(v) {
  if (v == null || v === '') return;
  if (!STATUS_MULTA.includes(v)) {
    const err = new Error('Status de pagamento inválido');
    err.status = 400;
    throw err;
  }
}

async function createMulta(db, _user, data) {
  if (!data.veiculo_id) {
    const err = new Error('Veículo é obrigatório');
    err.status = 400;
    throw err;
  }
  conferirStatusDaMulta(data.status_pagamento);
  const r = await dbRun(db, `INSERT INTO frotas_multas
    (veiculo_id, motorista_id, data_infracao, descricao, valor, pontos, status_pagamento,
     data_vencimento, data_pagamento, numero_auto, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.motorista_id || null, data.data_infracao || null, data.descricao || null,
    Number(data.valor) || 0, Number(data.pontos) || 0, data.status_pagamento || 'pendente',
    data.data_vencimento || null, data.data_pagamento || null, data.numero_auto || null, data.observacoes || null,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_multas WHERE id = ?', [r.lastID]);
}

async function updateMulta(db, id, data) {
  const current = await dbGet(db, 'SELECT * FROM frotas_multas WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Multa não encontrada');
    err.status = 404;
    throw err;
  }
  conferirStatusDaMulta(data.status_pagamento);
  await dbRun(db, `UPDATE frotas_multas SET
    veiculo_id=?, motorista_id=?, data_infracao=?, descricao=?, valor=?, pontos=?,
    status_pagamento=?, data_vencimento=?, data_pagamento=?, numero_auto=?, observacoes=? WHERE id=?`, [
    data.veiculo_id ?? current.veiculo_id, data.motorista_id ?? current.motorista_id,
    data.data_infracao ?? current.data_infracao, data.descricao ?? current.descricao,
    data.valor != null ? Number(data.valor) : current.valor,
    data.pontos != null ? Number(data.pontos) : current.pontos,
    data.status_pagamento || current.status_pagamento, data.data_vencimento ?? current.data_vencimento,
    data.data_pagamento ?? current.data_pagamento, data.numero_auto ?? current.numero_auto,
    data.observacoes ?? current.observacoes, id,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_multas WHERE id = ?', [id]);
}

async function deleteMulta(db, id) {
  await dbRun(db, 'DELETE FROM frotas_multas WHERE id = ?', [id]);
  return { success: true };
}

// ── Documentos ─────────────────────────────────────────────────────────────

async function listDocumentos(db, { search, veiculo_id, tipo, vencendo } = {}, user) {
  // Frotas Etapa 2 (RN-F2.12, C7): documento e do veiculo e tem valor (IPVA, seguro); o motorista nao tem "os dele" -> lista vazia,
  // como as outras listas dele sem vinculo. O menu ja nao mostrava Documentos; digitando o endereco ele via os de todos.
  if (await escopoDoUsuario(db, user)) return [];
  let sql = `SELECT d.*, v.placa FROM frotas_documentos d
    JOIN frotas_veiculos v ON d.veiculo_id = v.id WHERE 1=1`;
  const params = [];
  if (veiculo_id) { sql += ' AND d.veiculo_id = ?'; params.push(veiculo_id); }
  if (tipo) { sql += ' AND d.tipo = ?'; params.push(tipo); }
  if (vencendo === '1' || vencendo === 'true') {
    // Etapa 164 (RN-164.01, B1046): o teto conta do hoje de Brasilia (parametro, coluna so de data — sem modificador)
    sql += ` AND d.data_vencimento IS NOT NULL
      AND date(d.data_vencimento) <= date(?, '+' || COALESCE(d.alerta_dias_antes, 30) || ' days')`;
    params.push(hojeLocalISO());
  }
  const s = buildSearchWhere(['d.descricao', 'v.placa', 'd.numero_documento'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY d.data_vencimento ASC';
  return dbAll(db, sql, params);
}

async function createDocumento(db, _user, data) {
  if (!data.veiculo_id || !data.tipo) {
    const err = new Error('Veículo e tipo são obrigatórios');
    err.status = 400;
    throw err;
  }
  const r = await dbRun(db, `INSERT INTO frotas_documentos
    (veiculo_id, tipo, descricao, numero_documento, seguradora, valor, data_emissao,
     data_vencimento, alerta_dias_antes, status, observacoes)
    VALUES (?,?,?,?,?,?,?,?,?,?,?)`, [
    data.veiculo_id, data.tipo, data.descricao || null, data.numero_documento || null,
    data.seguradora || null, Number(data.valor) || 0, data.data_emissao || null,
    data.data_vencimento || null, data.alerta_dias_antes != null ? Number(data.alerta_dias_antes) : 30,
    data.status || 'ativo', data.observacoes || null,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_documentos WHERE id = ?', [r.lastID]);
}

async function updateDocumento(db, id, data) {
  const current = await dbGet(db, 'SELECT * FROM frotas_documentos WHERE id = ?', [id]);
  if (!current) {
    const err = new Error('Documento não encontrado');
    err.status = 404;
    throw err;
  }
  await dbRun(db, `UPDATE frotas_documentos SET
    veiculo_id=?, tipo=?, descricao=?, numero_documento=?, seguradora=?, valor=?,
    data_emissao=?, data_vencimento=?, alerta_dias_antes=?, status=?, observacoes=?,
    updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
    data.veiculo_id ?? current.veiculo_id, data.tipo ?? current.tipo, data.descricao ?? current.descricao,
    data.numero_documento ?? current.numero_documento, data.seguradora ?? current.seguradora,
    data.valor != null ? Number(data.valor) : current.valor, data.data_emissao ?? current.data_emissao,
    data.data_vencimento ?? current.data_vencimento,
    data.alerta_dias_antes != null ? Number(data.alerta_dias_antes) : current.alerta_dias_antes,
    data.status ?? current.status, data.observacoes ?? current.observacoes, id,
  ]);
  return dbGet(db, 'SELECT * FROM frotas_documentos WHERE id = ?', [id]);
}

async function deleteDocumento(db, id) {
  await dbRun(db, 'DELETE FROM frotas_documentos WHERE id = ?', [id]);
  return { success: true };
}

// ── Viagens ──────────────────────────────────────────────────────────────────

async function listViagens(db, { search, veiculo_id, status } = {}, user) {
  let sql = `SELECT vi.*, v.placa, m.nome as motorista_nome
    FROM frotas_viagens vi
    JOIN frotas_veiculos v ON vi.veiculo_id = v.id
    LEFT JOIN frotas_motoristas m ON vi.motorista_id = m.id
    WHERE 1=1`;
  const params = [];
  const esc = await escopoDoUsuario(db, user); // RN-F1.14
  if (esc) {
    if (!esc.motoristaId) return [];
    sql += ' AND vi.motorista_id = ?';
    params.push(esc.motoristaId);
  }
  if (veiculo_id) { sql += ' AND vi.veiculo_id = ?'; params.push(veiculo_id); }
  if (status) { sql += ' AND vi.status = ?'; params.push(status); }
  const s = buildSearchWhere(['vi.destino', 'vi.finalidade', 'v.placa'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY vi.data_saida DESC, vi.id DESC';
  return dbAll(db, sql, params);
}

const MSG_VEICULO_EM_USO = 'Este veículo já está em uso (saída sem retorno).';
const MSG_MOTORISTA_EM_VIAGEM = 'Você já tem uma saída sem retorno. Registre o retorno primeiro.';

function erro(status, msg, code) {
  const err = new Error(msg);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/**
 * RN-F1.20 (Fase5-8): so quem tem `aprovar_viagens` leva a viagem a aprovada ou cancelada. Antes o motorista aprovava a propria
 * viagem pelo POST/PUT (sem aprovador) e cancelava a que o gestor aprovou. Sem `user` (chamada interna) passa.
 */
function conferirQuemDecideAViagem(user, status) {
  if (!user || !["aprovada", "cancelada"].includes(status)) return;
  const { can } = require('./permissions');
  if (!can(user, 'aprovar_viagens')) throw erro(403, 'Só o gestor da frota pode aprovar ou cancelar viagem');
}

/** RN-F1.05 / F2-10: um veiculo e um motorista tem no maximo UMA viagem em andamento. `excetoId` = a propria viagem (PUT). */
async function conferirViagemUnica(db, { veiculoId, motoristaId, excetoId = 0 }) {
  if (veiculoId) {
    const v = await dbGet(db, "SELECT id FROM frotas_viagens WHERE veiculo_id = ? AND status = 'em_andamento' AND id != ? LIMIT 1",
      [veiculoId, excetoId || 0]);
    if (v) throw erro(409, MSG_VEICULO_EM_USO);
  }
  if (motoristaId) {
    const m = await dbGet(db, "SELECT id FROM frotas_viagens WHERE motorista_id = ? AND status = 'em_andamento' AND id != ? LIMIT 1",
      [motoristaId, excetoId || 0]);
    if (m) throw erro(409, MSG_MOTORISTA_EM_VIAGEM);
  }
}

/** Fase5-3: `AAAA-MM-DDTHH:MM`, `AAAA-MM-DD HH:MM[:SS]` ou `AAAA-MM-DD` -> chave comparavel (`AAAA-MM-DD HH:MM` ou so o dia). */
function momentoDaViagem(v) {
  if (v == null || v === '') return null;
  const m = /^(\d{4}-\d{2}-\d{2})(?:[T ](\d{2}:\d{2}))?/.exec(String(v));
  if (!m) return null;
  return { dia: m[1], hora: m[2] || null, texto: m[2] ? `${m[1]} ${m[2]}` : m[1] };
}

/** Fase5-3: retorno antes da saida -> 400. So com as duas datas; se uma delas nao tem hora, compara so o dia. */
function conferirDataDoRetorno(dataSaida, dataRetorno) {
  const s = momentoDaViagem(dataSaida);
  const r = momentoDaViagem(dataRetorno);
  if (!s || !r) return;
  const anterior = s.hora && r.hora ? `${r.dia} ${r.hora}` < `${s.dia} ${s.hora}` : r.dia < s.dia;
  if (anterior) throw erro(400, `Data/hora do retorno anterior à saída (${s.texto}).`);
}

/** RN-F1.07 (A5): retorno abaixo da saida e a "VERIFICAR KM" da planilha. */
function conferirKmDoRetorno(kmSaida, kmRetorno) {
  if (kmSaida != null && kmRetorno != null && Number(kmRetorno) < Number(kmSaida)) {
    throw erro(400, `KM do retorno (${Number(kmRetorno)}) menor que o KM da saída (${Number(kmSaida)}). Confira o hodômetro.`);
  }
}

async function createViagem(db, user, dataBruta) {
  const data = await forcarMotoristaDoVinculo(db, user, dataBruta || {}); // RN-F1.19
  conferirQuemDecideAViagem(user, data.status); // RN-F1.20
  if (!data.veiculo_id) {
    const err = new Error('Veículo é obrigatório');
    err.status = 400;
    throw err;
  }
  const kmSaida = data.km_saida != null ? Number(data.km_saida) : null;
  const kmRetorno = data.km_retorno != null ? Number(data.km_retorno) : null;
  conferirKmDoRetorno(kmSaida, kmRetorno);
  const horSaida = numeroOpcional(data.horimetro_saida); // Frota Etapa 3 (RN-F3.15)
  const horRetorno = numeroOpcional(data.horimetro_retorno);
  conferirHorimetroDoRetorno(horSaida, horRetorno);
  conferirDataDoRetorno(data.data_saida, data.data_retorno); // Fase5-3
  const status = data.status || 'solicitada';
  return naFilaDeViagens(async () => {
    if (status === 'em_andamento') {
      await conferirViagemUnica(db, { veiculoId: data.veiculo_id, motoristaId: data.motorista_id });
    }
    const r = await dbRun(db, `INSERT INTO frotas_viagens
      (veiculo_id, motorista_id, data_saida, data_retorno, km_saida, km_retorno, km_rodado,
       destino, finalidade, setor, status, observacoes, solicitante_id, solicitante_nome, origem, horimetro_saida, horimetro_retorno)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      data.veiculo_id, data.motorista_id || null, data.data_saida || null, data.data_retorno || null,
      kmSaida, kmRetorno,
      data.km_rodado != null ? Number(data.km_rodado) : (kmSaida != null && kmRetorno != null ? kmRetorno - kmSaida : null),
      data.destino || null, data.finalidade || null,
      data.setor || null, status, data.observacoes || null,
      user?.id || null, user?.nome || user?.name || null, data.origem || null, horSaida, horRetorno,
    ]);
    if (kmRetorno != null) await updateKmVeiculoSeMaior(db, data.veiculo_id, kmRetorno);
    if (horRetorno != null) await updateHorimetroVeiculoSeMaior(db, data.veiculo_id, horRetorno);
    return dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [r.lastID]);
  });
}

async function updateViagem(db, id, dataBruta, user) {
  return naFilaDeViagens(async () => {
    const current = await dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
    if (!current) {
      const err = new Error('Viagem não encontrada');
      err.status = 404;
      throw err;
    }
    const data = await conferirDonoPorMotorista(db, user, current, dataBruta); // RN-F1.15 / RN-F1.19
    if (data.status != null && data.status !== current.status) conferirQuemDecideAViagem(user, data.status); // RN-F1.20
    let kmRodado = data.km_rodado;
    const kmSaida = data.km_saida != null ? Number(data.km_saida) : current.km_saida;
    const kmRetorno = data.km_retorno != null ? Number(data.km_retorno) : current.km_retorno;
    conferirKmDoRetorno(kmSaida, kmRetorno);
    // Frota Etapa 3 (RN-F3.15): como o km — null/ausente no corpo mantem o gravado (o formulario manda null em campo vazio)
    const horSaida = numeroOpcional(data.horimetro_saida) ?? current.horimetro_saida;
    const horRetorno = numeroOpcional(data.horimetro_retorno) ?? current.horimetro_retorno;
    conferirHorimetroDoRetorno(horSaida, horRetorno);
    const dataSaida = data.data_saida ?? current.data_saida;
    const dataRetorno = data.data_retorno ?? current.data_retorno;
    conferirDataDoRetorno(dataSaida, dataRetorno); // Fase5-3
    if (kmRodado == null && kmSaida != null && kmRetorno != null) {
      kmRodado = kmRetorno - kmSaida;
    }
    const veiculoId = data.veiculo_id ?? current.veiculo_id;
    const motoristaId = data.motorista_id ?? current.motorista_id;
    const status = data.status ?? current.status;
    if (status === 'em_andamento') {
      await conferirViagemUnica(db, { veiculoId, motoristaId, excetoId: Number(id) });
    }
    await dbRun(db, `UPDATE frotas_viagens SET
      veiculo_id=?, motorista_id=?, data_saida=?, data_retorno=?, km_saida=?, km_retorno=?, km_rodado=?,
      destino=?, finalidade=?, setor=?, status=?, observacoes=?, origem=?, horimetro_saida=?, horimetro_retorno=?,
      updated_at=CURRENT_TIMESTAMP WHERE id=?`, [
      veiculoId, motoristaId,
      dataSaida, dataRetorno,
      kmSaida, kmRetorno, kmRodado != null ? kmRodado : current.km_rodado,
      data.destino ?? current.destino, data.finalidade ?? current.finalidade, data.setor ?? current.setor,
      status, data.observacoes ?? current.observacoes, data.origem ?? current.origem, horSaida, horRetorno, id,
    ]);
    if (kmRetorno != null) {
      await updateKmVeiculoSeMaior(db, veiculoId, kmRetorno);
    }
    if (horRetorno != null) await updateHorimetroVeiculoSeMaior(db, veiculoId, horRetorno);
    return dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
  });
}

async function aprovarViagem(db, id, user) {
  const viagem = await dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
  if (!viagem) {
    const err = new Error('Viagem não encontrada');
    err.status = 404;
    throw err;
  }
  // RN-F1.17 (A4): aprovar uma concluida a fazia voltar para "aprovada" (e reabrir no painel). O status vai no WHERE da gravacao.
  const r = await dbRun(db, `UPDATE frotas_viagens SET status='aprovada', aprovador_id=?, aprovador_nome=?,
    data_aprovacao=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP WHERE id=? AND status = 'solicitada'`, [
    user?.id || null, user?.nome || user?.name || null, id,
  ]);
  if (!r.changes) throw erro(409, 'Só é possível aprovar viagem solicitada');
  return dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [id]);
}

async function deleteViagem(db, id) {
  await dbRun(db, 'DELETE FROM frotas_viagens WHERE id = ?', [id]);
  return { success: true };
}

// ── Checklists ───────────────────────────────────────────────────────────────

function lerJson(texto, padrao) {
  if (texto == null || texto === '') return padrao;
  try { return JSON.parse(texto); } catch (e) { return padrao; }
}

/** Frotas Etapa 1: a linha de frotas_checklists com `itens` (objeto) e `avarias` (array) no lugar do JSON cru. */
function registroComItens(row) {
  if (!row) return row;
  const { itens_json: itensJson, avarias_json: avariasJson, ...resto } = row;
  return { ...resto, itens: lerJson(itensJson, null), avarias: lerJson(avariasJson, []) };
}

/** RN-F1.01: chaves e respostas dos 12 itens. Lanca 400 `Item de checklist inválido: <chave>`. */
function validarItens(itens) {
  const { ITENS_CHECKLIST, RESPOSTAS_ITEM } = require('./schema');
  if (itens == null) return {};
  if (typeof itens !== 'object' || Array.isArray(itens)) {
    const err = new Error('Item de checklist inválido: itens');
    err.status = 400;
    throw err;
  }
  const chaves = new Set(ITENS_CHECKLIST.map((i) => i.chave));
  const limpo = {};
  for (const [k, v] of Object.entries(itens)) {
    if (!chaves.has(k) || !RESPOSTAS_ITEM.includes(v)) {
      const err = new Error(`Item de checklist inválido: ${k}`);
      err.status = 400;
      throw err;
    }
    limpo[k] = v;
  }
  return limpo;
}

/** RN-F1.01 / Fase5-6: avarias = lista de {vista, tipo, descricao?} validas; a rota do gestor e o portal usam a mesma. 400 `Avaria inválida`. */
function validarAvarias(v) {
  const { VISTAS_AVARIA, TIPOS_AVARIA } = require('./schema');
  const invalida = () => erro(400, 'Avaria inválida');
  if (v === undefined || v === null) return [];
  if (!Array.isArray(v)) throw invalida();
  return v.map((a) => {
    if (!a || typeof a !== 'object' || !VISTAS_AVARIA.includes(a.vista) || !TIPOS_AVARIA.includes(a.tipo)) throw invalida();
    if (a.descricao != null && typeof a.descricao !== 'string') throw invalida();
    const limpa = { vista: a.vista, tipo: a.tipo };
    if (a.descricao) limpa.descricao = a.descricao;
    return limpa;
  });
}

/**
 * Grava uma linha de frotas_checklists — a rota antiga do gestor e o portal (saida/retorno/inspecao) passam por aqui.
 * Com `itens` (os 12): situacao pela RN-F1.02 e os 7 *_ok legados derivados (FALHA -> 0, OK/NA -> 1, ausente -> nulo;
 * extintor e limpeza, que o papel nao tem, -> 1). Sem `itens`: os 7 *_ok como vieram (ausente -> nulo, A3) e situacao pela F2-7.
 * `aprovado` = 1 so se OK.
 */
async function inserirRegistro(db, user, r) {
  const { ITENS_LEGADOS, LEGADO_DE_ITEM, situacaoDoRegistro } = require('./schema');
  const temItens = r.itens != null;
  let legados;
  let situacao;
  if (temItens) {
    legados = Object.fromEntries(ITENS_LEGADOS.map((k) => {
      const chave = LEGADO_DE_ITEM[k];
      if (!chave) return [k, 1];
      const v = r.itens[chave];
      return [k, v === 'FALHA' ? 0 : (v === 'OK' || v === 'NA') ? 1 : null];
    }));
    situacao = situacaoDoRegistro({ itens: r.itens, avarias: r.avarias });
  } else {
    const bool = (v) => (v === 0 || v === false || v === '0' ? 0 : v === 1 || v === true || v === '1' ? 1 : null);
    legados = Object.fromEntries(ITENS_LEGADOS.map((k) => [k, bool(r.legados?.[k])]));
    situacao = situacaoDoRegistro({ legados, avarias: r.avarias });
  }
  const ins = await dbRun(db, `INSERT INTO frotas_checklists
    (veiculo_id, motorista_id, data_checklist, pneus_ok, oleo_ok, luzes_ok, freios_ok,
     extintor_ok, documentos_ok, limpeza_ok, observacoes, aprovado, usuario_id, usuario_nome,
     tipo_registro, km, horario, nivel_combustivel, itens_json, avarias_json, status_geral, viagem_id, horimetro)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    r.veiculo_id, r.motorista_id || null, r.data_checklist,
    ...ITENS_LEGADOS.map((k) => legados[k]), r.observacoes || null, situacao === 'OK' ? 1 : 0,
    user?.id || null, user?.nome || user?.name || null,
    r.tipo_registro || 'inspecao', r.km != null ? Number(r.km) : null, r.horario || null, r.nivel_combustivel || null,
    temItens ? JSON.stringify(r.itens) : null, JSON.stringify(Array.isArray(r.avarias) ? r.avarias : []),
    situacao, r.viagem_id || null, r.horimetro != null ? Number(r.horimetro) : null, // Frota Etapa 3 (RN-F3.04)
  ]);
  return registroComItens(await dbGet(db, 'SELECT * FROM frotas_checklists WHERE id = ?', [ins.lastID]));
}

async function listChecklists(db, { search, veiculo_id } = {}, user) {
  const esc = await escopoDoUsuario(db, user); // RN-F1.14
  // Frota Etapa 6 (RN-F6.05): a descricao da manutencao ligada ao tratamento (null se nao ha ou se ela foi excluida). Para quem tem
  // escopo (motorista), null: ele so ve as manutencoes que lancou (listManutencoes) — Fase 2, 6 (B63).
  let sql = `SELECT c.*, v.placa, m.nome as motorista_nome, ${esc ? 'NULL' : 'mt.descricao'} AS pendencia_manutencao_descricao
    FROM frotas_checklists c
    JOIN frotas_veiculos v ON c.veiculo_id = v.id
    LEFT JOIN frotas_motoristas m ON c.motorista_id = m.id
    LEFT JOIN frotas_manutencoes mt ON mt.id = c.pendencia_manutencao_id
    WHERE 1=1`;
  const params = [];
  if (esc) {
    if (!esc.motoristaId) return [];
    sql += ' AND c.motorista_id = ?';
    params.push(esc.motoristaId);
  }
  if (veiculo_id) { sql += ' AND c.veiculo_id = ?'; params.push(veiculo_id); }
  const s = buildSearchWhere(['v.placa', 'c.observacoes'], search);
  sql += s.clause;
  params.push(...s.params);
  sql += ' ORDER BY c.data_checklist DESC, c.horario DESC, c.id DESC';
  return (await dbAll(db, sql, params)).map(registroComItens);
}

async function createChecklist(db, user, dataBruta) {
  const data = await forcarMotoristaDoVinculo(db, user, dataBruta || {}); // RN-F1.19
  if (!data.veiculo_id || !data.data_checklist) {
    const err = new Error('Veículo e data são obrigatórios');
    err.status = 400;
    throw err;
  }
  const itens = data.itens != null ? validarItens(data.itens) : null;
  const { ITENS_LEGADOS } = require('./schema');
  return inserirRegistro(db, user, {
    veiculo_id: data.veiculo_id,
    motorista_id: data.motorista_id,
    data_checklist: data.data_checklist,
    observacoes: data.observacoes,
    tipo_registro: 'inspecao',
    km: data.km,
    itens,
    avarias: validarAvarias(data.avarias), // Fase5-6: antes gravava qualquer coisa e a planilha saia "undefined: undefined"
    legados: Object.fromEntries(ITENS_LEGADOS.map((k) => [k, data[k]])),
  });
}

async function deleteChecklist(db, id) {
  await dbRun(db, 'DELETE FROM frotas_checklists WHERE id = ?', [id]);
  return { success: true };
}

// ── Dashboard e alertas ──────────────────────────────────────────────────────

/**
 * Etapa 164 (RN-164.01 a .05, B1046, C409): todas as reguas contam do `hoje` de Brasilia, lido UMA vez (o painel passa o dele) e como
 * parametro — as colunas sao so de data (`type="date"`), entao sem modificador de fuso. Antes, `date('now')` = o dia UTC: das 21h a
 * meia-noite, o de amanha.
 */
/** RN-F3.14: a leitura que a revisao compara — horimetro na maquina, km no resto (alias `v` = frotas_veiculos). */
const LEITURA_SQL = "(CASE WHEN v.tipo_medicao = 'horimetro' THEN COALESCE(v.horimetro_atual, 0) ELSE v.km_atual END)";
const FOLGA_SQL = "(CASE WHEN v.tipo_medicao = 'horimetro' THEN 50 ELSE 500 END)";

async function getAlertas(db, hoje = hojeLocalISO()) {
  const alertas = [];

  const docs = await dbAll(db, `SELECT d.*, v.placa FROM frotas_documentos d
    JOIN frotas_veiculos v ON d.veiculo_id = v.id
    WHERE d.data_vencimento IS NOT NULL
    AND date(d.data_vencimento) <= date(?, '+' || COALESCE(d.alerta_dias_antes, 30) || ' days')
    AND d.status = 'ativo' ORDER BY d.data_vencimento`, [hoje]);
  docs.forEach((d) => {
    const dias = diasAte(d.data_vencimento, hoje);
    alertas.push({
      tipo: 'documento',
      severidade: dias != null && dias < 0 ? 'critico' : dias != null && dias <= 7 ? 'alto' : 'medio',
      titulo: `${d.tipo.toUpperCase()} — ${d.placa}`,
      descricao: d.descricao || d.numero_documento || 'Documento vencendo',
      data: d.data_vencimento,
      dias_restantes: dias,
      referencia_id: d.id,
      veiculo_id: d.veiculo_id,
    });
  });

  const motoristas = await dbAll(db, `SELECT * FROM frotas_motoristas
    WHERE ativo = 1 AND status = 'ativo' AND cnh_validade IS NOT NULL
    AND date(cnh_validade) <= date(?, '+30 days') ORDER BY cnh_validade`, [hoje]);
  motoristas.forEach((m) => {
    const dias = diasAte(m.cnh_validade, hoje);
    alertas.push({
      tipo: 'cnh',
      severidade: dias != null && dias < 0 ? 'critico' : 'alto',
      titulo: `CNH — ${m.nome}`,
      descricao: `Categoria ${m.cnh_categoria || '-'} vence em ${m.cnh_validade}`,
      data: m.cnh_validade,
      dias_restantes: dias,
      referencia_id: m.id,
    });
  });

  // Frota Etapa 3 (RN-F3.14): na maquina por horimetro a "proxima revisao" e em horas — compara com o horimetro (folga 50 h, B40)
  const manutencoes = await dbAll(db, `SELECT m.*, v.placa, ${LEITURA_SQL} AS km_atual FROM frotas_manutencoes m
    JOIN frotas_veiculos v ON m.veiculo_id = v.id
    WHERE (m.proxima_revisao_data IS NOT NULL AND date(m.proxima_revisao_data) <= date(?, '+15 days'))
       OR (m.proxima_revisao_km IS NOT NULL AND ${LEITURA_SQL} >= m.proxima_revisao_km - ${FOLGA_SQL})
    ORDER BY m.proxima_revisao_data`, [hoje]);
  manutencoes.forEach((m) => {
    const dias = diasAte(m.proxima_revisao_data, hoje);
    const kmRestante = m.proxima_revisao_km != null ? m.proxima_revisao_km - (m.km_atual || 0) : null;
    alertas.push({
      tipo: 'manutencao',
      severidade: (dias != null && dias < 0) || (kmRestante != null && kmRestante <= 0) ? 'critico' : 'medio',
      titulo: `Manutenção — ${m.placa}`,
      descricao: m.descricao,
      data: m.proxima_revisao_data,
      dias_restantes: dias,
      km_restante: kmRestante,
      referencia_id: m.id,
      veiculo_id: m.veiculo_id,
    });
  });

  const multas = await dbAll(db, `SELECT mu.*, v.placa FROM frotas_multas mu
    JOIN frotas_veiculos v ON mu.veiculo_id = v.id
    WHERE mu.status_pagamento = 'pendente' AND mu.data_vencimento IS NOT NULL
    AND date(mu.data_vencimento) <= date(?, '+15 days')`, [hoje]);
  multas.forEach((mu) => {
    alertas.push({
      tipo: 'multa',
      severidade: 'alto',
      titulo: `Multa pendente — ${mu.placa}`,
      descricao: mu.descricao || mu.numero_auto,
      data: mu.data_vencimento,
      dias_restantes: diasAte(mu.data_vencimento, hoje),
      referencia_id: mu.id,
      veiculo_id: mu.veiculo_id,
    });
  });

  // Frotas Etapa 1 (RN-F1.10, B3): registro do portal (ou da tela antiga) com PENDENCIA — Falha ou avaria.
  // Frota Etapa 6 (RN-F6.04): so a NAO tratada, e sem a janela de 7 dias — antes o alerta sumia sozinho em 7 dias, consertado ou nao;
  // agora fica ate o gestor tratar (POST /checklists/:id/tratar-pendencia). Veiculo excluido (ativo = 0) nao gera mais o alerta, como no de
  // consumo (Fase 2, 8 — sem a janela, a pendencia dele ficaria para sempre; trata-se pela lista Checklist).
  const { ITENS_CHECKLIST } = require('./schema');
  const pendencias = await dbAll(db, `SELECT c.*, v.placa, m.nome AS motorista_nome FROM frotas_checklists c
    JOIN frotas_veiculos v ON c.veiculo_id = v.id
    LEFT JOIN frotas_motoristas m ON c.motorista_id = m.id
    WHERE c.status_geral = 'PENDENCIA' AND c.pendencia_tratada_em IS NULL AND v.ativo = 1
    ORDER BY c.data_checklist ASC, c.id ASC`); // Fase 5 (Etapa 6): a MAIS ANTIGA primeiro — o painel corta em 15 e, com a mais nova
  // primeiro, a falha mais atrasada era a que sumia do painel (a ordenacao final por severidade e estavel)
  pendencias.forEach((row) => {
    const c = registroComItens(row);
    const falhas = c.itens ? ITENS_CHECKLIST.filter((i) => c.itens[i.chave] === 'FALHA').map((i) => i.rotulo) : [];
    const partes = [];
    if (falhas.length) partes.push(`Falha: ${falhas.join(', ')}`);
    if (c.avarias && c.avarias.length) partes.push(`${c.avarias.length} avaria(s)`);
    if (!partes.length) partes.push('Item marcado como não conforme');
    if (c.motorista_nome) partes.push(c.motorista_nome);
    alertas.push({
      tipo: 'checklist',
      severidade: 'alto',
      titulo: `Checklist com pendência — ${c.placa}`,
      descricao: partes.join(' · '),
      data: c.data_checklist,
      // Fase5-11: nao e vencimento — com dias, o painel mostrava "Vencido há 3 dia(s)" para um registro de 3 dias atras
      dias_restantes: null,
      referencia_id: c.id,
      veiculo_id: c.veiculo_id,
      placa: c.placa, // Frota Etapa 6 (Fase 2, T-3): o titulo da janela Tratar pendencia
    });
  });

  const consumoAnomalo = await dbAll(db, `SELECT v.id as veiculo_id, v.placa, v.consumo_medio_esperado,
    AVG(a.consumo_medio) as consumo_recente
    FROM frotas_abastecimentos a
    JOIN frotas_veiculos v ON a.veiculo_id = v.id
    WHERE a.consumo_medio IS NOT NULL AND v.ativo = 1
    AND a.data_abastecimento >= date(?, '-60 days')
    GROUP BY v.id
    HAVING v.consumo_medio_esperado IS NOT NULL AND consumo_recente < v.consumo_medio_esperado * 0.7`, [hoje]);
  consumoAnomalo.forEach((c) => {
    alertas.push({
      tipo: 'consumo',
      severidade: 'medio',
      titulo: `Consumo baixo — ${c.placa}`,
      descricao: `Média recente ${Number(c.consumo_recente).toFixed(1)} km/L${c.consumo_medio_esperado ? ` (esperado ${c.consumo_medio_esperado} km/L)` : ''}`,
      referencia_id: c.veiculo_id,
      veiculo_id: c.veiculo_id,
    });
  });

  return alertas.sort((a, b) => {
    const order = { critico: 0, alto: 1, medio: 2 };
    return (order[a.severidade] ?? 3) - (order[b.severidade] ?? 3);
  });
}

async function getDashboard(db) {
  const hoje = hojeLocalISO(); // Etapa 164 (RN-164.04, B1046): um hoje so para os cartoes e os alertas
  const [veiculoStats, custos, counters, manutencoesVencidas, alertas, ultimosAbastecimentos] = await Promise.all([
    dbGet(db, `SELECT
      SUM(CASE WHEN status = 'ativo' THEN 1 ELSE 0 END) as veiculosAtivos,
      SUM(CASE WHEN status = 'manutencao' THEN 1 ELSE 0 END) as veiculosManutencao,
      SUM(CASE WHEN status = 'inativo' THEN 1 ELSE 0 END) as veiculosInativos,
      SUM(CASE WHEN status = 'vendido' THEN 1 ELSE 0 END) as veiculosVendidos,
      COUNT(*) as totalVeiculos
      FROM frotas_veiculos WHERE ativo = 1`),
    dbGet(db, `SELECT
      COALESCE((SELECT SUM(custo) FROM frotas_manutencoes), 0) as manutencao,
      COALESCE((SELECT SUM(valor_total) FROM frotas_abastecimentos), 0) as combustivel,
      COALESCE((SELECT SUM(valor) FROM frotas_multas WHERE status_pagamento != 'contestado'), 0) as multas,
      COALESCE((SELECT SUM(valor) FROM frotas_documentos), 0) as documentos`),
    dbGet(db, `SELECT
      (SELECT COALESCE(SUM(valor_total), 0) FROM frotas_abastecimentos
        WHERE strftime('%Y-%m', data_abastecimento) = ?) as custoCombustivelMes,
      (SELECT COUNT(*) FROM frotas_manutencoes WHERE status IN ('agendada','em_andamento')) as osAbertas,
      (SELECT COUNT(*) FROM frotas_viagens WHERE status IN ('solicitada','aprovada','em_andamento')) as viagensAbertas,
      (SELECT COUNT(*) FROM frotas_checklists WHERE date(data_checklist) = ?) as checklistsHoje`, [hoje.slice(0, 7), hoje]),
    dbGet(db, `SELECT COUNT(DISTINCT m.veiculo_id) as total
      FROM frotas_manutencoes m
      JOIN frotas_veiculos v ON m.veiculo_id = v.id
      WHERE (m.proxima_revisao_data IS NOT NULL AND date(m.proxima_revisao_data) < ?)
         OR (m.proxima_revisao_km IS NOT NULL AND ${LEITURA_SQL} >= m.proxima_revisao_km)`, [hoje]),
    getAlertas(db, hoje),
    dbAll(db, `SELECT a.*, v.placa FROM frotas_abastecimentos a
      JOIN frotas_veiculos v ON a.veiculo_id = v.id ORDER BY a.data_abastecimento DESC LIMIT 5`),
  ]);

  const custoTotal = (custos?.manutencao || 0) + (custos?.combustivel || 0) + (custos?.multas || 0) + (custos?.documentos || 0);

  return {
    veiculosAtivos: veiculoStats?.veiculosAtivos || 0,
    veiculosManutencao: veiculoStats?.veiculosManutencao || 0,
    veiculosInativos: veiculoStats?.veiculosInativos || 0,
    totalVeiculos: veiculoStats?.totalVeiculos || 0,
    custoManutencao: custos?.manutencao || 0,
    custoCombustivel: custos?.combustivel || 0,
    custoMultas: custos?.multas || 0,
    custoDocumentos: custos?.documentos || 0,
    custoTotal,
    custoCombustivelMes: counters?.custoCombustivelMes || 0,
    osAbertas: counters?.osAbertas || 0,
    manutencoesVencidas: manutencoesVencidas?.total || 0,
    alertasCount: alertas.length,
    alertas: alertas.slice(0, 15),
    viagensAbertas: counters?.viagensAbertas || 0,
    checklistsHoje: counters?.checklistsHoje || 0,
    ultimosAbastecimentos,
  };
}

// ── Relatórios ───────────────────────────────────────────────────────────────

async function relatorioCustosPorVeiculo(db, periodo = {}) {
  // Frota Etapa 4: cada data opcional (RN-F4.03); multas pelo dia da infracao/lancamento e sem as contestadas (RN-F4.01/02, A7)
  const fMan = filtroDoPeriodo('substr(data_manutencao, 1, 10)', periodo);
  const fAbs = filtroDoPeriodo('substr(data_abastecimento, 1, 10)', periodo);
  const dia = diaDaMultaSql('mu');
  const fMul = filtroDoPeriodo(dia.sql, periodo);
  const paramsMul = fMul.params.flatMap((p) => [...dia.params, p]);

  const rows = await dbAll(db, `SELECT
      v.id, v.placa, v.modelo, v.marca, v.setor_responsavel, v.km_atual, v.tipo_medicao, v.horimetro_atual,
      COALESCE(man.total, 0) as custo_manutencao,
      COALESCE(abs.total, 0) as custo_combustivel,
      COALESCE(mul.total, 0) as custo_multas
    FROM frotas_veiculos v
    LEFT JOIN (
      SELECT veiculo_id, SUM(custo) as total FROM frotas_manutencoes WHERE 1=1${fMan.sql} GROUP BY veiculo_id
    ) man ON man.veiculo_id = v.id
    LEFT JOIN (
      SELECT veiculo_id, SUM(valor_total) as total FROM frotas_abastecimentos WHERE 1=1${fAbs.sql} GROUP BY veiculo_id
    ) abs ON abs.veiculo_id = v.id
    LEFT JOIN (
      SELECT mu.veiculo_id, SUM(mu.valor) as total FROM frotas_multas mu
      WHERE COALESCE(mu.status_pagamento, '') != 'contestado'${fMul.sql} GROUP BY mu.veiculo_id
    ) mul ON mul.veiculo_id = v.id
    WHERE v.ativo = 1
    ORDER BY v.placa`,
  [...fMan.params, ...fAbs.params, ...paramsMul]);

  return rows.map((r) => ({
    id: r.id,
    placa: r.placa,
    modelo: r.modelo,
    marca: r.marca,
    setor_responsavel: r.setor_responsavel,
    custo_manutencao: r.custo_manutencao || 0,
    custo_combustivel: r.custo_combustivel || 0,
    custo_multas: r.custo_multas || 0,
    custo_total: (r.custo_manutencao || 0) + (r.custo_combustivel || 0) + (r.custo_multas || 0),
    km_atual: r.km_atual,
    tipo_medicao: r.tipo_medicao || 'km',
    horimetro_atual: r.horimetro_atual,
  }));
}

/**
 * Frota Etapa 4 (RN-F4.07/08): uma linha por veiculo com algum abastecimento no periodo (e no `veiculo_id`); km/L = media das linhas
 * com km/L (como antes), L/h = media das linhas com L/h (RN-F4.05, calculado sobre TODAS as linhas do veiculo); totais de todas as
 * linhas do periodo (B47 — antes, so das linhas com km/L). Ordem por placa. So veiculos ativos (RN-F4.14).
 */
async function relatorioConsumo(db, { veiculo_id, data_inicio, data_fim } = {}) {
  const f = filtroDoPeriodo('substr(a.data_abastecimento, 1, 10)', { data_inicio, data_fim });
  let sql = `SELECT a.id, a.veiculo_id, a.litros, a.valor_total, a.consumo_medio, v.placa, v.tipo_medicao
    FROM frotas_abastecimentos a
    JOIN frotas_veiculos v ON a.veiculo_id = v.id
    WHERE v.ativo = 1${f.sql}`; // RN-F4.14: so ativos, como o custo por veiculo (B49)
  const params = [...f.params];
  if (veiculo_id) { sql += ' AND a.veiculo_id = ?'; params.push(veiculo_id); }
  const linhas = await comLitrosPorHora(db, await dbAll(db, sql, params));
  const media = (xs) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null);
  const porVeiculo = new Map();
  for (const l of linhas) {
    if (!porVeiculo.has(l.veiculo_id)) {
      porVeiculo.set(l.veiculo_id, { veiculo_id: l.veiculo_id, placa: l.placa, tipo_medicao: l.tipo_medicao || 'km', kmL: [], lph: [], total_litros: 0, total_gasto: 0, abastecimentos: 0 });
    }
    const g = porVeiculo.get(l.veiculo_id);
    if (l.consumo_medio != null) g.kmL.push(Number(l.consumo_medio));
    if (l.consumo_litros_hora != null) g.lph.push(Number(l.consumo_litros_hora));
    g.total_litros += Number(l.litros) || 0;
    g.total_gasto += Number(l.valor_total) || 0;
    g.abastecimentos += 1;
  }
  return [...porVeiculo.values()]
    .sort((a, b) => String(a.placa).localeCompare(String(b.placa)) || a.veiculo_id - b.veiculo_id)
    .map(({ kmL, lph, ...g }) => ({ ...g, consumo_medio: media(kmL), consumo_litros_hora: media(lph) }));
}

module.exports = {
  validarAvarias,
  conferirDataDoRetorno,
  getMeta,
  listVeiculos, getVeiculo, createVeiculo, updateVeiculo, deleteVeiculo,
  listMotoristas, getMotorista, createMotorista, updateMotorista, deleteMotorista,
  listManutencoes, createManutencao, updateManutencao, deleteManutencao,
  listAbastecimentos, createAbastecimento, updateAbastecimento, deleteAbastecimento,
  listMultas, createMulta, updateMulta, deleteMulta,
  listDocumentos, createDocumento, updateDocumento, deleteDocumento,
  listViagens, createViagem, updateViagem, aprovarViagem, deleteViagem,
  listChecklists, createChecklist, deleteChecklist,
  getDashboard, getAlertas, diasAte,
  relatorioCustosPorVeiculo, relatorioConsumo,
  // Frota Etapa 4
  litrosPorHora, comLitrosPorHora, filtroDoPeriodo, diaDaMultaSql,
  // Frotas Etapa 1
  listUsuariosVinculaveis, motoristaDoUsuario, escopoDoUsuario, erroNaoVinculado, registroComItens, inserirRegistro,
  validarItens, conferirViagemUnica, conferirKmDoRetorno, updateKmVeiculoSeMaior, MSG_VEICULO_EM_USO, MSG_MOTORISTA_EM_VIAGEM,
  // Frota Etapa 3
  updateHorimetroVeiculoSeMaior, conferirHorimetroDoRetorno,
};
