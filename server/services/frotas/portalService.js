/**
 * Frotas Etapa 1 — portal do motorista: o formulario de papel (saida, retorno, inspecao) e o abastecimento, gravados pelo proprio
 * motorista. Contratos congelados em docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md.
 *
 * Quem e o motorista sai SEMPRE do vinculo usuario -> frotas_motoristas.usuario_id (RN-F1.12/13): o corpo nao escolhe.
 * A saida e o retorno abrem/fecham viagem dentro da `naFilaDeViagens` (RN-F1.05: uma em andamento por veiculo e por motorista).
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { hojeLocalISO } = require('../diaLocal');
const { naFilaDeViagens } = require('./filaDeViagens');
const { can, getPerfilFromUser } = require('./permissions');
const {
  ITENS_CHECKLIST, VISTAS_AVARIA, TIPOS_AVARIA, NIVEIS_COMBUSTIVEL, TIPOS_REGISTRO,
} = require('./schema');
const frotasService = require('./frotasService');

function erro(status, msg) {
  const err = new Error(msg);
  err.status = status;
  return err;
}

/** Hora de Brasilia agora, 'HH:MM' (o mesmo fuso do `hojeLocalISO`). */
function horaLocalHHMM(agora = new Date()) {
  const { FUSO_PADRAO } = require('../almoxarifado/auditFiltros');
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: FUSO_PADRAO, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(agora);
  const h = p.find((x) => x.type === 'hour').value;
  const m = p.find((x) => x.type === 'minute').value;
  return `${h}:${m}`;
}

function lerKm(v) {
  if (v === undefined || v === null || v === '' || typeof v === 'boolean') return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/** 'AAAA-MM-DD' que existe no calendario (2026-02-30 nao). Vazio -> hoje de Brasilia. */
function lerData(v) {
  if (v === undefined || v === null || v === '') return hojeLocalISO();
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v));
  if (!m) throw erro(400, 'Data inválida');
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  if (d.toISOString().slice(0, 10) !== v) throw erro(400, 'Data inválida');
  // Fase5-5: data adiante deixava o alerta de pendencia no painel por semanas (a janela de 7 dias conta da data do registro)
  if (v > hojeLocalISO()) throw erro(400, 'Data no futuro');
  return v;
}

function lerHorario(v) {
  if (v === undefined || v === null || v === '') return horaLocalHHMM();
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(String(v))) throw erro(400, 'Horário inválido');
  return String(v);
}

function lerNivel(v) {
  if (v === undefined || v === null || v === '') return null;
  if (!NIVEIS_COMBUSTIVEL.includes(v)) throw erro(400, 'Nível de combustível inválido');
  return v;
}

/** Fase5-6: a validacao das avarias mora no frotasService (a rota do gestor usa a mesma). */
const lerAvarias = (v) => frotasService.validarAvarias(v);

/** Veiculo que o portal aceita: ativo = 1 e status fora de vendido/inativo. Senao 404. */
async function veiculoDoPortal(db, veiculoId) {
  const v = await dbGet(db, `SELECT * FROM frotas_veiculos WHERE id = ? AND ativo = 1
    AND COALESCE(status, 'ativo') NOT IN ('vendido', 'inativo')`, [veiculoId]);
  if (!v) throw erro(404, 'Veículo não encontrado');
  return v;
}

async function motoristaObrigatorio(db, user) {
  const m = await frotasService.motoristaDoUsuario(db, user);
  if (!m) throw frotasService.erroNaoVinculado(); // RN-F1.13
  return m;
}

// ── GET /portal/inicio ───────────────────────────────────────────────────────

async function inicio(db, user) {
  const m = await frotasService.motoristaDoUsuario(db, user);
  let viagemAberta = null;
  if (m) {
    viagemAberta = await dbGet(db, `SELECT vi.id, vi.veiculo_id, v.placa, vi.km_saida, vi.data_saida, vi.destino
      FROM frotas_viagens vi JOIN frotas_veiculos v ON v.id = vi.veiculo_id
      WHERE vi.motorista_id = ? AND vi.status = 'em_andamento' ORDER BY vi.id DESC LIMIT 1`, [m.id]) || null;
  }
  const veiculos = await dbAll(db, `SELECT v.id, v.placa, v.modelo, v.marca, v.km_atual, v.tipo_medicao, v.status,
      EXISTS (SELECT 1 FROM frotas_viagens vi WHERE vi.veiculo_id = v.id AND vi.status = 'em_andamento') AS em_uso
    FROM frotas_veiculos v
    WHERE v.ativo = 1 AND COALESCE(v.status, 'ativo') NOT IN ('vendido', 'inativo')
    ORDER BY v.placa`);
  return {
    motorista: m ? { id: m.id, nome: m.nome, cnh_validade: m.cnh_validade || null } : null,
    viagem_aberta: viagemAberta,
    veiculos: veiculos.map((v) => ({ ...v, em_uso: !!v.em_uso })),
    itens: ITENS_CHECKLIST.map((i) => ({ chave: i.chave, rotulo: i.rotulo })),
    vistas: VISTAS_AVARIA,
    tipos_avaria: TIPOS_AVARIA,
    niveis_combustivel: NIVEIS_COMBUSTIVEL,
    // F2-11: o front sabe se mostra o formulario e o menu do gestor
    perfil: getPerfilFromUser(user),
    pode_registrar: can(user, 'registrar_operacoes'),
    pode_gerir: can(user, 'gerenciar_veiculos'),
  };
}

// ── POST /portal/registros ───────────────────────────────────────────────────

async function registrar(db, user, body) {
  const b = body || {};
  const motorista = await motoristaObrigatorio(db, user);
  if (!TIPOS_REGISTRO.includes(b.tipo)) throw erro(400, 'Tipo deve ser saida, retorno ou inspecao');
  const km = lerKm(b.km);
  if (km == null) throw erro(400, 'Informe o KM atual');
  const data = lerData(b.data);
  const horario = lerHorario(b.horario);
  const nivel = lerNivel(b.nivel_combustivel);
  const itens = frotasService.validarItens(b.itens); // RN-F1.01 (ausente -> {} -> INCOMPLETO)
  const avarias = lerAvarias(b.avarias);
  if (b.tipo !== 'retorno' && !b.veiculo_id) throw erro(400, 'Escolha o veículo');

  const registroBase = {
    motorista_id: motorista.id, data_checklist: data, km, horario, nivel_combustivel: nivel, itens, avarias,
    observacoes: b.observacoes || null, tipo_registro: b.tipo,
  };
  const dataHora = `${data}T${horario}`; // F2-15: abre no datetime-local da tela do gestor

  if (b.tipo === 'inspecao') {
    const veiculo = await veiculoDoPortal(db, b.veiculo_id);
    const registro = await frotasService.inserirRegistro(db, user, { ...registroBase, veiculo_id: veiculo.id });
    await frotasService.updateKmVeiculoSeMaior(db, veiculo.id, km); // RN-F1.08
    return { registro, viagem: null };
  }

  return naFilaDeViagens(async () => {
    if (b.tipo === 'saida') {
      const veiculo = await veiculoDoPortal(db, b.veiculo_id);
      // F2-14 (B9): veiculo em manutencao nao sai
      if (veiculo.status === 'manutencao') throw erro(409, 'Veículo em manutenção. Fale com o gestor da frota.');
      await frotasService.conferirViagemUnica(db, { veiculoId: veiculo.id, motoristaId: motorista.id }); // RN-F1.05
      // B8: a viagem ja aprovada para este veiculo e motorista vira a desta saida (em vez de uma segunda)
      const aprovada = await dbGet(db, `SELECT id FROM frotas_viagens
        WHERE veiculo_id = ? AND motorista_id = ? AND status = 'aprovada' ORDER BY id LIMIT 1`, [veiculo.id, motorista.id]);
      let viagemId;
      if (aprovada) {
        await dbRun(db, `UPDATE frotas_viagens SET status = 'em_andamento', km_saida = ?, data_saida = ?,
          origem = COALESCE(?, origem), destino = COALESCE(?, destino), finalidade = COALESCE(?, finalidade),
          observacoes = COALESCE(?, observacoes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        // Fase5-4: as observacoes da saida iam so no INSERT — ao consumir a aprovada, se perdiam
        [km, dataHora, b.origem || null, b.destino || null, b.finalidade || null, b.observacoes || null, aprovada.id]);
        viagemId = aprovada.id;
      } else {
        // RN-F1.04 (B4): sem aprovacao — a planilha nao tem
        const r = await dbRun(db, `INSERT INTO frotas_viagens
          (veiculo_id, motorista_id, data_saida, km_saida, origem, destino, finalidade, status, observacoes,
           solicitante_id, solicitante_nome)
          VALUES (?,?,?,?,?,?,?,'em_andamento',?,?,?)`, [
          veiculo.id, motorista.id, dataHora, km, b.origem || null, b.destino || null, b.finalidade || null,
          b.observacoes || null, user?.id || null, user?.nome || user?.name || null,
        ]);
        viagemId = r.lastID;
      }
      const registro = await frotasService.inserirRegistro(db, user, { ...registroBase, veiculo_id: veiculo.id, viagem_id: viagemId });
      await frotasService.updateKmVeiculoSeMaior(db, veiculo.id, km); // RN-F1.08
      const viagem = await dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [viagemId]);
      return { registro, viagem };
    }

    // retorno (RN-F1.06): fecha a viagem em andamento DO MOTORISTA; o veiculo e o dela (veiculo_id do corpo e ignorado)
    const aberta = await dbGet(db, `SELECT * FROM frotas_viagens WHERE motorista_id = ? AND status = 'em_andamento'
      ORDER BY id DESC LIMIT 1`, [motorista.id]);
    if (!aberta) throw erro(409, 'Você não tem saída aberta para registrar o retorno.');
    frotasService.conferirKmDoRetorno(aberta.km_saida, km); // RN-F1.07
    frotasService.conferirDataDoRetorno(aberta.data_saida, dataHora); // Fase5-3
    const kmRodado = aberta.km_saida != null ? km - Number(aberta.km_saida) : null;
    const up = await dbRun(db, `UPDATE frotas_viagens SET km_retorno = ?, data_retorno = ?, km_rodado = ?, status = 'concluida',
      updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'em_andamento'`, [km, dataHora, kmRodado, aberta.id]);
    if (!up.changes) throw erro(409, 'Você não tem saída aberta para registrar o retorno.');
    const registro = await frotasService.inserirRegistro(db, user, {
      ...registroBase, veiculo_id: aberta.veiculo_id, viagem_id: aberta.id,
    });
    await frotasService.updateKmVeiculoSeMaior(db, aberta.veiculo_id, km); // RN-F1.08
    const viagem = await dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [aberta.id]);
    return { registro, viagem };
  });
}

// ── POST /portal/abastecimentos ──────────────────────────────────────────────

async function registrarAbastecimento(db, user, body) {
  const b = body || {};
  const motorista = await motoristaObrigatorio(db, user);
  if (!b.veiculo_id) throw erro(400, 'Veículo, litros e data são obrigatórios');
  const km = lerKm(b.km);
  if (km == null) throw erro(400, 'Informe o KM atual');
  const litros = Number(b.litros);
  if (b.litros == null || b.litros === '' || !Number.isFinite(litros) || litros <= 0) throw erro(400, 'Informe os litros');
  let valorTotal = 0;
  if (b.valor_total != null && b.valor_total !== '') {
    valorTotal = Number(b.valor_total);
    if (!Number.isFinite(valorTotal) || valorTotal < 0) throw erro(400, 'Valor inválido');
  }
  const data = lerData(b.data);
  const veiculo = await veiculoDoPortal(db, b.veiculo_id);
  // o motorista_id e o do vinculo (o corpo nao escolhe); o calculo do km/L e o da RN-F1.11
  return frotasService.createAbastecimento(db, user, {
    veiculo_id: veiculo.id, motorista_id: motorista.id, data_abastecimento: data, litros, valor_total: valorTotal,
    km_abastecimento: km, posto: b.posto || null, combustivel_tipo: b.combustivel_tipo || null, observacoes: b.observacoes || null,
  });
}

// ── GET /portal/meus-registros ───────────────────────────────────────────────

async function meusRegistros(db, user, { limite } = {}) {
  const m = await frotasService.motoristaDoUsuario(db, user);
  if (!m) return { registros: [], abastecimentos: [] };
  let n = parseInt(limite, 10);
  if (!Number.isFinite(n) || n <= 0) n = 30;
  n = Math.min(n, 200);
  const registros = await dbAll(db, `SELECT c.*, v.placa FROM frotas_checklists c
    JOIN frotas_veiculos v ON v.id = c.veiculo_id
    WHERE c.motorista_id = ?
    ORDER BY c.data_checklist DESC, c.horario DESC, c.id DESC LIMIT ?`, [m.id, n]);
  const abastecimentos = await dbAll(db, `SELECT a.*, v.placa FROM frotas_abastecimentos a
    JOIN frotas_veiculos v ON v.id = a.veiculo_id
    WHERE a.motorista_id = ?
    ORDER BY a.data_abastecimento DESC, a.id DESC LIMIT ?`, [m.id, n]);
  return { registros: registros.map(frotasService.registroComItens), abastecimentos };
}

module.exports = { inicio, registrar, registrarAbastecimento, meusRegistros, horaLocalHHMM };
