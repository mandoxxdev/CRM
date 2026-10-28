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
  ITENS_CHECKLIST, VISTAS_AVARIA, TIPOS_AVARIA, NIVEIS_COMBUSTIVEL, TIPOS_REGISTRO, ORIGEM_PADRAO,
} = require('./schema');
const frotasService = require('./frotasService');

const MSG_CONDUTOR_OBRIGATORIO = 'Informe quem vai dirigir (condutor)';

function erro(status, msg) {
  const err = new Error(msg);
  err.status = status;
  return err;
}

function erroComCodigo(status, msg, code) {
  const err = erro(status, msg);
  err.code = code;
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
  // Fase5-R3 (Etapa 3): texto so com digitos e ponto decimal (B15) — Number(' ') = 0, Number('0x10') = 16 e Number('1e3') = 1000 passavam
  if (typeof v === 'string' && !/^\d+(\.\d+)?$/.test(v.trim())) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return null;
  return n;
}

/**
 * Frota Etapa 3 (A10, RN-F3.04/07): a regua da leitura e a do VEICULO. Maquina por horimetro manda `horimetro` (o `km` e ignorado);
 * veiculo por km manda `km` (o `horimetro` e ignorado). Veiculo inexistente cai na de km (e depois no 404 de sempre).
 */
const medicaoDe = (veiculo) => (veiculo && veiculo.tipo_medicao === 'horimetro' ? 'horimetro' : 'km');

/**
 * Fase 2 (T-2): o retorno segue a regua com que a VIAGEM abriu, nao a do veiculo de hoje (o gestor pode ter trocado a medicao no meio,
 * ou aberto a viagem com km numa maquina): horimetro_saida -> horas; km_saida -> km; nenhum dos dois -> a do veiculo.
 */
function medicaoDaViagem(viagem, veiculo) {
  if (viagem && viagem.horimetro_saida != null) return 'horimetro';
  if (viagem && viagem.km_saida != null) return 'km';
  return medicaoDe(veiculo);
}

async function medicaoDoVeiculo(db, veiculoId) {
  if (!veiculoId) return 'km';
  return medicaoDe(await dbGet(db, 'SELECT tipo_medicao FROM frotas_veiculos WHERE id = ?', [veiculoId]));
}

function lerLeitura(b, medicao) {
  if (medicao === 'horimetro') {
    const h = lerKm(b.horimetro);
    if (h == null) throw erro(400, 'Informe o horímetro atual');
    return h;
  }
  const km = lerKm(b.km);
  if (km == null) throw erro(400, 'Informe o KM atual');
  return km;
}

// Fase5-R4: ate 6 casas — com 2, um atual de 1800,004 aparecia como 1.800 e contradizia a leitura 1800 recusada
const formatoBR = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 6 });
const numeroBR = (n) => formatoBR.format(Number(n) || 0);

/**
 * Frota Etapa 3 (A8, RN-F3.01/02/05): leitura MENOR que a atual do veiculo para e pergunta (409 com `code`); o motorista confirma com
 * `confirmar_km_menor: true` (so o booleano) — lancamento atrasado e legitimo. Roda DEPOIS das recusas duras (RN-F3.03).
 */
function conferirMenorQueAtual(veiculo, medicao, leitura, confirmar) {
  if (confirmar === true) return;
  if (medicao === 'horimetro') {
    const atual = Number(veiculo.horimetro_atual) || 0;
    if (leitura < atual) {
      throw erroComCodigo(409, `Horímetro menor que o atual do veículo (${numeroBR(atual)} h). Confira o painel antes de salvar.`,
        'HORIMETRO_MENOR_QUE_ATUAL');
    }
    return;
  }
  const atual = Number(veiculo.km_atual) || 0;
  if (leitura < atual) {
    throw erroComCodigo(409, `KM menor que o atual do veículo (${numeroBR(atual)} km). Confira o hodômetro antes de salvar.`,
      'KM_MENOR_QUE_ATUAL');
  }
}

/** O veiculo sobe a leitura da regua dele (RN-F1.08 no km; RN-F3.04 no horimetro — o km nao muda). */
async function subirLeitura(db, veiculoId, medicao, leitura) {
  if (medicao === 'horimetro') await frotasService.updateHorimetroVeiculoSeMaior(db, veiculoId, leitura);
  else await frotasService.updateKmVeiculoSeMaior(db, veiculoId, leitura);
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
    viagemAberta = await dbGet(db, `SELECT vi.id, vi.veiculo_id, v.placa, vi.km_saida, vi.horimetro_saida,
      CASE WHEN vi.horimetro_saida IS NOT NULL THEN 'horimetro' WHEN vi.km_saida IS NOT NULL THEN 'km'
        ELSE COALESCE(v.tipo_medicao, 'km') END AS tipo_medicao, vi.data_saida, vi.destino, vi.condutor_nome
      FROM frotas_viagens vi JOIN frotas_veiculos v ON v.id = vi.veiculo_id
      WHERE vi.motorista_id = ? AND vi.status = 'em_andamento' ORDER BY vi.id DESC LIMIT 1`, [m.id]) || null;
  }
  // Frota Etapa 8 (RN-F8.15): + uso_funcionarios — a tela mostra o campo do condutor so no carro liberado (o servidor confere de novo
  // na saida, RN-F8.19)
  const veiculos = await dbAll(db, `SELECT v.id, v.placa, v.modelo, v.marca, v.km_atual, v.horimetro_atual, v.tipo_medicao, v.status,
      v.uso_funcionarios,
      EXISTS (SELECT 1 FROM frotas_viagens vi WHERE vi.veiculo_id = v.id AND vi.status = 'em_andamento') AS em_uso
    FROM frotas_veiculos v
    WHERE v.ativo = 1 AND COALESCE(v.status, 'ativo') NOT IN ('vendido', 'inativo')
    ORDER BY v.placa`);
  // Frota Etapa 8 (RN-F8.32): os destinos ativos para o select da saida
  const destinos = await dbAll(db, 'SELECT id, nome, endereco FROM frotas_destinos WHERE ativo = 1 ORDER BY nome COLLATE NOCASE, id');
  return {
    motorista: m ? { id: m.id, nome: m.nome, cnh_validade: m.cnh_validade || null } : null,
    viagem_aberta: viagemAberta,
    veiculos: veiculos.map((v) => ({ ...v, em_uso: !!v.em_uso })),
    destinos,
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
  // RN-F3.07: o veiculo do corpo (saida, inspecao) ou a VIAGEM aberta do motorista (retorno — Fase 2, T-2: a regua com que ela abriu)
  // diz se a leitura e km ou horas. Leitura previa so para a mensagem certa; adiante o veiculo/viagem e relido e, se a medicao mudou
  // no meio, a leitura tambem.
  let medicao;
  let leitura;
  if (b.tipo === 'retorno') {
    const aberta = await dbGet(db, `SELECT vi.km_saida, vi.horimetro_saida, v.tipo_medicao FROM frotas_viagens vi
      LEFT JOIN frotas_veiculos v ON v.id = vi.veiculo_id
      WHERE vi.motorista_id = ? AND vi.status = 'em_andamento' ORDER BY vi.id DESC LIMIT 1`, [motorista.id]);
    if (aberta) {
      medicao = medicaoDaViagem(aberta, aberta);
      leitura = lerLeitura(b, medicao);
    } else {
      // Fase 2 (item 6): sem saida aberta, a leitura em qualquer campo serve — o 409 "sem saida aberta" vem adiante, na fila
      leitura = lerKm(b.km) ?? lerKm(b.horimetro);
      if (leitura == null) throw erro(400, 'Informe o KM atual');
      medicao = lerKm(b.km) != null ? 'km' : 'horimetro';
    }
  } else {
    medicao = await medicaoDoVeiculo(db, b.veiculo_id);
    leitura = lerLeitura(b, medicao);
  }
  const data = lerData(b.data);
  const horario = lerHorario(b.horario);
  const nivel = lerNivel(b.nivel_combustivel);
  const itens = frotasService.validarItens(b.itens); // RN-F1.01 (ausente -> {} -> INCOMPLETO)
  const avarias = lerAvarias(b.avarias);
  if (b.tipo !== 'retorno' && !b.veiculo_id) throw erro(400, 'Escolha o veículo');

  const registroBase = {
    motorista_id: motorista.id, data_checklist: data, horario, nivel_combustivel: nivel, itens, avarias,
    observacoes: b.observacoes || null, tipo_registro: b.tipo,
  };
  const confirmar = b.confirmar_km_menor;
  /** Releu o veiculo: se a medicao dele nao e a da leitura previa, le de novo pela dele (400 se o corpo nao trouxe). */
  const acertarMedicao = (veiculo, viagem) => {
    const m = viagem ? medicaoDaViagem(viagem, veiculo) : medicaoDe(veiculo);
    if (m !== medicao) { medicao = m; leitura = lerLeitura(b, m); }
  };
  const leituras = () => (medicao === 'horimetro' ? { km: null, horimetro: leitura } : { km: leitura, horimetro: null });
  const dataHora = `${data}T${horario}`; // F2-15: abre no datetime-local da tela do gestor

  /**
   * Frota Etapa 8 (RN-F8.31, ponto 4): o destino cadastrado — resolvido DENTRO da fila (desativado no meio -> 400). `destino_id` que nao
   * e inteiro positivo, inexistente ou desativado -> 400. Sem `destino_id`, o texto `destino` como sempre (compat); com os dois, o id manda.
   */
  const resolverDestino = async () => {
    if (b.destino_id === undefined || b.destino_id === null || b.destino_id === '') return { destino: b.destino || null, destinoId: null };
    const id = typeof b.destino_id === 'number' || (typeof b.destino_id === 'string' && /^\d+$/.test(b.destino_id.trim()))
      ? Number(b.destino_id) : NaN;
    if (!Number.isInteger(id) || id <= 0) throw erro(400, frotasService.MSG_DESTINO_404);
    const d = await dbGet(db, 'SELECT id, nome FROM frotas_destinos WHERE id = ? AND ativo = 1', [id]);
    if (!d) throw erro(400, frotasService.MSG_DESTINO_404);
    return { destino: d.nome, destinoId: d.id };
  };

  if (b.tipo === 'inspecao') {
    const veiculo = await veiculoDoPortal(db, b.veiculo_id);
    acertarMedicao(veiculo);
    conferirMenorQueAtual(veiculo, medicao, leitura, confirmar); // RN-F3.01/05
    const registro = await frotasService.inserirRegistro(db, user, { ...registroBase, ...leituras(), veiculo_id: veiculo.id });
    await subirLeitura(db, veiculo.id, medicao, leitura); // RN-F1.08 / RN-F3.04
    return { registro, viagem: null };
  }

  return naFilaDeViagens(async () => {
    if (b.tipo === 'saida') {
      const veiculo = await veiculoDoPortal(db, b.veiculo_id);
      // F2-14 (B9): veiculo em manutencao nao sai
      if (veiculo.status === 'manutencao') throw erro(409, 'Veículo em manutenção. Fale com o gestor da frota.');
      await frotasService.conferirViagemUnica(db, { veiculoId: veiculo.id, motoristaId: motorista.id }); // RN-F1.05
      // Frota Etapa 8 (ajuste T-2): a ordem FIXA dentro da fila — destino -> tamanho do condutor -> condutor obrigatorio -> km menor.
      // Os 400 novos vem ANTES do 409 KM_MENOR_QUE_ATUAL: se viessem depois, o motorista confirmava o km menor, levava o 400 e tinha de
      // confirmar de novo. O veiculo aqui e o relido DENTRO da fila (RN-F8.19): a marca `uso_funcionarios` pode ter sido ligada pelo
      // gestor um segundo antes — a tela do motorista (que nao mostrava o campo) nao decide.
      const { destino, destinoId } = await resolverDestino(); // RN-F8.31
      const condutor = frotasService.lerCondutor(b.condutor_nome); // RN-F8.18: > 120 -> 400
      if (Number(veiculo.uso_funcionarios) === 1 && !condutor) throw erro(400, MSG_CONDUTOR_OBRIGATORIO); // RN-F8.18/19
      acertarMedicao(veiculo);
      conferirMenorQueAtual(veiculo, medicao, leitura, confirmar); // RN-F3.01/05 (dentro da fila: le o km_atual da hora)
      const { km, horimetro } = leituras();
      // B8: a viagem ja aprovada para este veiculo e motorista vira a desta saida (em vez de uma segunda)
      const aprovada = await dbGet(db, `SELECT id FROM frotas_viagens
        WHERE veiculo_id = ? AND motorista_id = ? AND status = 'aprovada' ORDER BY id LIMIT 1`, [veiculo.id, motorista.id]);
      let viagemId;
      if (aprovada) {
        // Frota Etapa 8 (ajuste 10): a origem que o gestor digitou na aprovada vence; so sem nenhuma das duas entra o GMP.
        // Destino, destino_id e condutor da saida entram se vieram (COALESCE); senao ficam os da aprovada.
        await dbRun(db, `UPDATE frotas_viagens SET status = 'em_andamento', km_saida = ?, horimetro_saida = ?, data_saida = ?,
          origem = COALESCE(?, origem, ?), destino = COALESCE(?, destino), destino_id = COALESCE(?, destino_id),
          condutor_nome = COALESCE(?, condutor_nome), finalidade = COALESCE(?, finalidade),
          observacoes = COALESCE(?, observacoes), updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
        // Fase5-4: as observacoes da saida iam so no INSERT — ao consumir a aprovada, se perdiam
        [km, horimetro, dataHora, b.origem || null, ORIGEM_PADRAO, destino || null, destinoId || null, condutor || null,
          b.finalidade || null, b.observacoes || null, aprovada.id]);
        viagemId = aprovada.id;
      } else {
        // RN-F1.04 (B4): sem aprovacao — a planilha nao tem
        // Frota Etapa 8 (RN-F8.17, ajuste 11): a saida do portal sai sempre da GMP — sem origem (ou vazia) grava ORIGEM_PADRAO; com,
        // grava o que veio (compat com quem ainda manda)
        const r = await dbRun(db, `INSERT INTO frotas_viagens
          (veiculo_id, motorista_id, data_saida, km_saida, horimetro_saida, origem, destino, destino_id, condutor_nome, finalidade,
           status, observacoes, solicitante_id, solicitante_nome)
          VALUES (?,?,?,?,?,?,?,?,?,?,'em_andamento',?,?,?)`, [
          veiculo.id, motorista.id, dataHora, km, horimetro, b.origem || ORIGEM_PADRAO, destino || null, destinoId || null, condutor,
          b.finalidade || null, b.observacoes || null, user?.id || null, user?.nome || user?.name || null,
        ]);
        viagemId = r.lastID;
      }
      const registro = await frotasService.inserirRegistro(db, user, {
        ...registroBase, km, horimetro, veiculo_id: veiculo.id, viagem_id: viagemId,
      });
      await subirLeitura(db, veiculo.id, medicao, leitura); // RN-F1.08 / RN-F3.04
      const viagem = await dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [viagemId]);
      return { registro, viagem };
    }

    // retorno (RN-F1.06): fecha a viagem em andamento DO MOTORISTA; o veiculo e o dela (veiculo_id do corpo e ignorado)
    const aberta = await dbGet(db, `SELECT * FROM frotas_viagens WHERE motorista_id = ? AND status = 'em_andamento'
      ORDER BY id DESC LIMIT 1`, [motorista.id]);
    if (!aberta) throw erro(409, 'Você não tem saída aberta para registrar o retorno.');
    const veiculo = await dbGet(db, 'SELECT * FROM frotas_veiculos WHERE id = ?', [aberta.veiculo_id]);
    acertarMedicao(veiculo, aberta);
    const { km, horimetro } = leituras();
    frotasService.conferirKmDoRetorno(aberta.km_saida, km); // RN-F1.07
    frotasService.conferirHorimetroDoRetorno(aberta.horimetro_saida, horimetro); // RN-F3.06
    frotasService.conferirDataDoRetorno(aberta.data_saida, dataHora); // Fase5-3
    if (veiculo) conferirMenorQueAtual(veiculo, medicao, leitura, confirmar); // RN-F3.01/05, depois das duras (RN-F3.03)
    const kmRodado = km != null && aberta.km_saida != null ? km - Number(aberta.km_saida) : null;
    const up = await dbRun(db, `UPDATE frotas_viagens SET km_retorno = ?, horimetro_retorno = ?, data_retorno = ?, km_rodado = ?,
      status = 'concluida', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND status = 'em_andamento'`,
    [km, horimetro, dataHora, kmRodado, aberta.id]);
    if (!up.changes) throw erro(409, 'Você não tem saída aberta para registrar o retorno.');
    const registro = await frotasService.inserirRegistro(db, user, {
      ...registroBase, km, horimetro, veiculo_id: aberta.veiculo_id, viagem_id: aberta.id,
    });
    await subirLeitura(db, aberta.veiculo_id, medicao, leitura); // RN-F1.08 / RN-F3.04
    const viagem = await dbGet(db, 'SELECT * FROM frotas_viagens WHERE id = ?', [aberta.id]);
    return { registro, viagem };
  });
}

// ── POST /portal/abastecimentos ──────────────────────────────────────────────

async function registrarAbastecimento(db, user, body) {
  const b = body || {};
  const motorista = await motoristaObrigatorio(db, user);
  if (!b.veiculo_id) throw erro(400, 'Veículo, litros e data são obrigatórios');
  let medicao = await medicaoDoVeiculo(db, b.veiculo_id); // RN-F3.07
  let leitura = lerLeitura(b, medicao);
  const litros = Number(b.litros);
  if (b.litros == null || b.litros === '' || !Number.isFinite(litros) || litros <= 0) throw erro(400, 'Informe os litros');
  let valorTotal = 0;
  if (b.valor_total != null && b.valor_total !== '') {
    valorTotal = Number(b.valor_total);
    if (!Number.isFinite(valorTotal) || valorTotal < 0) throw erro(400, 'Valor inválido');
  }
  const data = lerData(b.data);
  const veiculo = await veiculoDoPortal(db, b.veiculo_id);
  if (medicaoDe(veiculo) !== medicao) { medicao = medicaoDe(veiculo); leitura = lerLeitura(b, medicao); }
  conferirMenorQueAtual(veiculo, medicao, leitura, b.confirmar_km_menor); // RN-F3.01/05
  // o motorista_id e o do vinculo (o corpo nao escolhe); o km/L e o da RN-F1.11 — a leitura de horas fica fora dele (RN-F3.04)
  const horas = medicao === 'horimetro';
  return frotasService.createAbastecimento(db, user, {
    veiculo_id: veiculo.id, motorista_id: motorista.id, data_abastecimento: data, litros, valor_total: valorTotal,
    km_abastecimento: horas ? null : leitura, horimetro_abastecimento: horas ? leitura : null, posto: b.posto || null, combustivel_tipo: b.combustivel_tipo || null, observacoes: b.observacoes || null,
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
