/**
 * Frota Etapa 6 (RN-F6.01..03) — tratar a pendencia de um registro (frotas_checklists com status_geral = 'PENDENCIA').
 *
 * "Tratada" e um estado A PARTE: a situacao gravada (status_geral) nao muda — e o que o motorista viu. As condicoes que importam
 * ("tem pendencia", "ainda nao tratada", "a manutencao e do mesmo veiculo") vao no WHERE da gravacao: dois gestores ao mesmo tempo, um
 * so grava; a manutencao excluida no meio nao fica ligada. Quando a gravacao nao casa, relemos e devolvemos a recusa do estado atual.
 *
 * Plano: docs/superpowers/plans/2026-10-23-frotas-etapa6-tratar-pendencia.md
 */
const { dbRun, dbGet } = require('./db');
const { hojeLocalISO } = require('../diaLocal');
const { horaLocalHHMM } = require('./portalService');
const { registroComItens } = require('./frotasService');

const LIMITE_TEXTO = 1000;
const INVISIVEIS = /[​-‍⁠﻿]/g;

const MSG = {
  DESCREVA: 'Descreva o que foi feito',
  TEXTO_LONGO: `O texto passou de ${LIMITE_TEXTO} caracteres`,
  MANUTENCAO_INVALIDA: 'Manutenção inválida',
  NAO_ENCONTRADO: 'Registro não encontrado',
  SEM_PENDENCIA: 'Este registro não tem pendência',
  JA_TRATADA: 'Esta pendência já foi tratada',
  NAO_TRATADA: 'Esta pendência não foi tratada',
  MANUTENCAO_NAO_ENCONTRADA: 'Manutenção não encontrada',
  MANUTENCAO_OUTRO_VEICULO: 'Esta manutenção é de outro veículo',
};

function erro(status, msg, code) {
  const e = new Error(msg);
  e.status = status;
  if (code) e.code = code;
  return e;
}

/** Inteiro > 0 vindo da URL ou do corpo (numero inteiro, ou texto so de digitos). Qualquer outra coisa -> null. */
function inteiroPositivo(v) {
  if (typeof v === 'number') return Number.isInteger(v) && v > 0 ? v : null;
  if (typeof v === 'string' && /^\d+$/.test(v)) {
    const n = Number(v);
    return Number.isSafeInteger(n) && n > 0 ? n : null;
  }
  return null;
}

/** RN-F6.02 (recusas 2-4): o corpo, antes de olhar o banco. */
function lerCorpo(corpo) {
  const c = corpo && typeof corpo === 'object' ? corpo : {};
  if (typeof c.tratamento !== 'string') throw erro(400, MSG.DESCREVA);
  const tratamento = c.tratamento.trim();
  // Fase 5 (Etapa 6): so caracteres invisiveis (espaco de largura zero, BOM) tambem e "vazio" — o trim() nao os tira
  if (!tratamento.replace(INVISIVEIS, '').trim()) throw erro(400, MSG.DESCREVA);
  if (tratamento.length > LIMITE_TEXTO) throw erro(400, MSG.TEXTO_LONGO);
  let manutencaoId = null;
  if (c.manutencao_id !== undefined && c.manutencao_id !== null && c.manutencao_id !== '') {
    manutencaoId = inteiroPositivo(c.manutencao_id);
    if (!manutencaoId) throw erro(400, MSG.MANUTENCAO_INVALIDA);
  }
  return { tratamento, manutencaoId };
}

/** O instante de Brasilia no formato do data_saida ('AAAA-MM-DDTHH:MM'), dia e hora do MESMO `agora`. */
function instanteLocal(agora = new Date()) {
  return `${hojeLocalISO(agora)}T${horaLocalHHMM(agora)}`;
}

const lerRegistro = (db, id) => dbGet(db, 'SELECT * FROM frotas_checklists WHERE id = ?', [id]);

/**
 * A gravacao, com todas as condicoes no WHERE. Devolve o numero de linhas alteradas (0 ou 1). Exportada para o teste provar que o
 * WHERE sozinho recusa (sem depender da conferencia anterior).
 */
async function gravarTratamento(db, user, id, { tratamento, manutencaoId }, agora = new Date()) {
  const r = await dbRun(db, `UPDATE frotas_checklists SET
      pendencia_tratada_em = ?, pendencia_tratada_por_id = ?, pendencia_tratada_por_nome = ?, pendencia_tratamento = ?,
      pendencia_manutencao_id = ?
    WHERE id = ? AND status_geral = 'PENDENCIA' AND pendencia_tratada_em IS NULL
      AND (? IS NULL OR EXISTS (SELECT 1 FROM frotas_manutencoes mt
        WHERE mt.id = ? AND mt.veiculo_id = frotas_checklists.veiculo_id))`, [
    instanteLocal(agora), user?.id || null, user?.nome || user?.name || null, tratamento, manutencaoId,
    id, manutencaoId, manutencaoId,
  ]);
  return r.changes;
}

/** RN-F6.02, recusas 5-9, pelo estado ATUAL (antes da gravacao e de novo quando ela nao casa). */
async function recusaDoEstado(db, id, manutencaoId) {
  const c = await lerRegistro(db, id);
  if (!c) return erro(404, MSG.NAO_ENCONTRADO);
  if (c.status_geral !== 'PENDENCIA') return erro(409, MSG.SEM_PENDENCIA, 'SEM_PENDENCIA');
  if (c.pendencia_tratada_em != null) return erro(409, MSG.JA_TRATADA, 'PENDENCIA_JA_TRATADA');
  if (manutencaoId) {
    const m = await dbGet(db, 'SELECT id, veiculo_id FROM frotas_manutencoes WHERE id = ?', [manutencaoId]);
    if (!m) return erro(400, MSG.MANUTENCAO_NAO_ENCONTRADA);
    if (Number(m.veiculo_id) !== Number(c.veiculo_id)) return erro(400, MSG.MANUTENCAO_OUTRO_VEICULO);
  }
  return null;
}

/** RN-F6.02: `POST /checklists/:id/tratar-pendencia`. */
async function tratar(db, user, idBruto, corpo) {
  const dados = lerCorpo(corpo);
  const id = inteiroPositivo(idBruto);
  if (!id) throw erro(404, MSG.NAO_ENCONTRADO);
  const antes = await recusaDoEstado(db, id, dados.manutencaoId);
  if (antes) throw antes;
  const n = await gravarTratamento(db, user, id, dados);
  if (n !== 1) {
    // perdeu a corrida (outro gestor tratou, o registro foi excluido, a manutencao foi excluida): a recusa do estado de agora
    throw (await recusaDoEstado(db, id, dados.manutencaoId)) || erro(409, MSG.JA_TRATADA, 'PENDENCIA_JA_TRATADA');
  }
  return registroComItens(await lerRegistro(db, id));
}

/** RN-F6.03: `DELETE /checklists/:id/tratar-pendencia` — limpa as 5 colunas; o alerta volta. */
async function desfazer(db, _user, idBruto) {
  const id = inteiroPositivo(idBruto);
  if (!id) throw erro(404, MSG.NAO_ENCONTRADO);
  const r = await dbRun(db, `UPDATE frotas_checklists SET
      pendencia_tratada_em = NULL, pendencia_tratada_por_id = NULL, pendencia_tratada_por_nome = NULL, pendencia_tratamento = NULL,
      pendencia_manutencao_id = NULL
    WHERE id = ? AND pendencia_tratada_em IS NOT NULL`, [id]);
  const c = await lerRegistro(db, id);
  if (!c) throw erro(404, MSG.NAO_ENCONTRADO);
  if (r.changes !== 1) throw erro(409, MSG.NAO_TRATADA, 'PENDENCIA_NAO_TRATADA');
  return registroComItens(c);
}

module.exports = { tratar, desfazer, gravarTratamento, instanteLocal, inteiroPositivo, LIMITE_TEXTO, MSG };
