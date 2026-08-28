/**
 * Assinatura digital da entrega de requisição (Etapa 15, Task 1 — contratos C1/C2).
 *
 * Append-only de propósito: assinatura é evidência da entrega, não estado — não há UPDATE nem
 * DELETE aqui (RN-04). ENCERRADA assina porque o encerramento pode acontecer antes de o
 * papel/tela chegar ao recebedor — a assinatura documenta o passado (design da Etapa 15).
 * A rota (extended.js) é quem grava o arquivo via multer e limpa o órfão nas saídas ≠ 201;
 * este serviço só valida a requisição, insere e audita.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
const { MATERIAL_PHOTO_API_PREFIX } = require('./materialPhoto');

const STATUS_ASSINAVEIS = ['ENTREGUE', 'PARCIALMENTE_ATENDIDA', 'ENCERRADA'];

function montarResposta(row) {
  return {
    id: row.id,
    recebedor_nome: row.recebedor_nome,
    arquivo_url: `${MATERIAL_PHOTO_API_PREFIX}${row.arquivo}`,
    criado_em: row.criado_em,
    criado_por_nome: row.criado_por_nome,
  };
}

async function registrarAssinatura(db, user, requisicaoId, { recebedor_nome, arquivo }) {
  const req = await dbGet(db,
    'SELECT id, status FROM requisicoes_almoxarifado WHERE id = ? AND COALESCE(ativo, 1) = 1',
    [requisicaoId]);
  if (!req) throw Object.assign(new Error('Requisição não encontrada'), { status: 404 });
  if (!STATUS_ASSINAVEIS.includes(req.status)) {
    throw Object.assign(new Error(
      `Só é possível registrar assinatura de entrega em requisição entregue (total ou parcialmente). Status atual: ${req.status}.`,
    ), { status: 409 });
  }

  const r = await dbRun(db, `INSERT INTO assinaturas_entrega_almoxarifado
    (requisicao_id, recebedor_nome, arquivo, criado_por, criado_por_nome)
    VALUES (?,?,?,?,?)`,
    [req.id, recebedor_nome, arquivo, user.id, user.nome || user.email || null]);

  await registrarAuditoria(db, {
    entidade: 'requisicao',
    entidade_id: req.id,
    acao: 'ASSINATURA_ENTREGA',
    usuario_id: user.id,
    usuario_nome: user.nome || user.email,
    dados_novos: { recebedor_nome, arquivo },
  });

  const row = await dbGet(db, 'SELECT * FROM assinaturas_entrega_almoxarifado WHERE id = ?', [r.lastID]);
  return montarResposta(row);
}

async function listarAssinaturas(db, requisicaoId) {
  const rows = await dbAll(db, `SELECT id, recebedor_nome, arquivo, criado_em, criado_por_nome
    FROM assinaturas_entrega_almoxarifado WHERE requisicao_id = ?
    ORDER BY criado_em ASC, id ASC`, [requisicaoId]);
  return rows.map(montarResposta);
}

module.exports = { STATUS_ASSINAVEIS, registrarAssinatura, listarAssinaturas };
