/**
 * Frota Etapa 5 — fotos do registro (saida, retorno, inspecao) e do abastecimento (cupom).
 * Contratos congelados em docs/superpowers/plans/2026-10-23-frotas-etapa5-fotos.md (RN-F5.01..08).
 *
 * O arquivo chega gravado pelo multer da rota (`routes/frotas.js`); daqui para a frente tudo e regra: o lancamento existe, e de quem
 * pede (a regua de escopo da RN-F1.14/15), os primeiros bytes sao do formato declarado e o teto de 3 vale NO MESMO COMANDO que grava.
 * Quem chama apaga o arquivo recebido em qualquer recusa (RN-F5.04). A URL assinada e feita na SAIDA (`comAnexos`), com o assinador
 * que a rota injeta — o banco guarda so o nome.
 */
const fs = require('fs');
const path = require('path');
const { dbRun, dbGet, dbAll } = require('./db');
const frotasService = require('./frotasService');

const LIMITE_FOTOS = 3;
const LIMITE_BYTES = 10 * 1024 * 1024;
const MIMES_ACEITOS = Object.freeze(['image/jpeg', 'image/jpg', 'image/png', 'image/webp']);

const ENTIDADES = Object.freeze({
  registro: { tabela: 'frotas_checklists', naoEncontrado: 'Registro não encontrado' },
  abastecimento: { tabela: 'frotas_abastecimentos', naoEncontrado: 'Abastecimento não encontrado' },
});

const MSG = Object.freeze({
  NENHUMA_FOTO: 'Nenhuma foto enviada',
  TIPO_INVALIDO: 'Tipo de lançamento inválido',
  LANCAMENTO_INVALIDO: 'Lançamento inválido',
  FORMATO: 'Formato de imagem não suportado',
  LIMITE: `Este lançamento já tem ${LIMITE_FOTOS} fotos`,
  FOTO_NAO_ENCONTRADA: 'Foto não encontrada',
  UMA_POR_VEZ: 'Envie uma foto por vez',
  ENVIO_TORTO: 'Não foi possível ler a foto enviada',
});

function erro(status, msg, code) {
  const err = new Error(msg);
  err.status = status;
  if (code) err.code = code;
  return err;
}

/** 'jpeg' | 'png' | 'webp' pelo MIME aceito (jpg = jpeg); null fora da lista. */
function familiaDoMime(mime) {
  const m = String(mime || '').toLowerCase();
  if (m === 'image/jpeg' || m === 'image/jpg') return 'jpeg';
  if (m === 'image/png') return 'png';
  if (m === 'image/webp') return 'webp';
  return null;
}

/** RN-F5.02: o formato pelos primeiros bytes (assinatura do arquivo); null se nao for um dos tres. */
function formatoPelosBytes(buf) {
  if (!buf || buf.length < 12) return null;
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) return 'jpeg';
  if (buf.slice(0, 8).equals(Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]))) return 'png';
  if (buf.slice(0, 4).toString('latin1') === 'RIFF' && buf.slice(8, 12).toString('latin1') === 'WEBP') return 'webp';
  return null;
}

function lerCabeca(caminho) {
  let fd;
  try {
    fd = fs.openSync(caminho, 'r');
    const buf = Buffer.alloc(12);
    const n = fs.readSync(fd, buf, 0, 12, 0);
    return buf.slice(0, n);
  } catch (e) {
    return null;
  } finally {
    if (fd !== undefined) try { fs.closeSync(fd); } catch (e) { /* ja fechado */ }
  }
}

/** Apaga um arquivo da pasta das fotos sem derrubar quem chama (so o nome: nunca caminho vindo de fora). */
function apagarArquivo(pasta, arquivo) {
  if (!pasta || !arquivo) return;
  const nome = path.basename(String(arquivo));
  try {
    fs.unlinkSync(path.join(pasta, nome));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn('[frotas] falha ao apagar a foto', nome, e.message);
  }
}

function lerEntidade(v) {
  const e = typeof v === 'string' ? v : '';
  if (!Object.prototype.hasOwnProperty.call(ENTIDADES, e)) throw erro(400, MSG.TIPO_INVALIDO);
  return e;
}

function lerId(v) {
  const s = typeof v === 'number' ? String(v) : (typeof v === 'string' ? v.trim() : '');
  if (!/^\d{1,15}$/.test(s) || Number(s) <= 0) throw erro(400, MSG.LANCAMENTO_INVALIDO);
  return Number(s);
}

/**
 * RN-F5.03 (a regua do PUT, RN-F1.15): ADMIN_FROTA/CONSULTA (escopo nulo) passam; o MOTORISTA precisa do vinculo (409) e de ser o
 * motorista do lancamento (403). Lancamento sumido (`row` nulo) so passa para quem nao tem escopo.
 */
async function conferirDono(db, user, row) {
  const esc = await frotasService.escopoDoUsuario(db, user);
  if (!esc) return null;
  if (!esc.motoristaId) throw frotasService.erroNaoVinculado();
  if (!row || row.motorista_id == null || Number(row.motorista_id) !== Number(esc.motoristaId)) {
    throw erro(403, 'Você só pode alterar os seus próprios registros');
  }
  return esc.motoristaId;
}

/**
 * RN-F5.01..04: grava a foto recebida. `arquivo` = { nome, caminho, tipo_mime, tamanho } (o que o multer gravou), ou nulo.
 * Lanca { status, message, code? } em toda recusa; quem chama apaga o arquivo.
 */
async function gravar(db, user, { entidade: entidadeBruta, entidade_id: idBruto, arquivo }) {
  if (!arquivo || !arquivo.nome) throw erro(400, MSG.NENHUMA_FOTO);
  const entidade = lerEntidade(entidadeBruta);
  const id = lerId(idBruto);
  const { tabela, naoEncontrado } = ENTIDADES[entidade];
  const row = await dbGet(db, `SELECT id, motorista_id FROM ${tabela} WHERE id = ?`, [id]);
  if (!row) throw erro(404, naoEncontrado);
  // dono = motorista do vinculo (quem tem escopo) ou null (gestor/Consulta: qualquer um)
  const dono = await conferirDono(db, user, row);
  const familia = familiaDoMime(arquivo.tipo_mime);
  if (!familia || formatoPelosBytes(lerCabeca(arquivo.caminho)) !== familia) throw erro(400, MSG.FORMATO);
  // RN-F5.01: lancamento ainda existe E menos de 3 fotos — no MESMO comando (o sqlite serializa: quatro envios juntos dao 3 + 1 recusa)
  const ins = await dbRun(db, `INSERT INTO frotas_anexos (entidade, entidade_id, arquivo, tipo_mime, tamanho, usuario_id, usuario_nome)
    SELECT ?, ?, ?, ?, ?, ?, ?
    WHERE EXISTS (SELECT 1 FROM ${tabela} WHERE id = ? AND (? IS NULL OR motorista_id = ?))
      AND (SELECT COUNT(*) FROM frotas_anexos WHERE entidade = ? AND entidade_id = ?) < ?`, [
    entidade, id, path.basename(arquivo.nome), String(arquivo.tipo_mime).toLowerCase() === 'image/jpg' ? 'image/jpeg' : String(arquivo.tipo_mime).toLowerCase(),
    Number(arquivo.tamanho) || 0, user?.id || null, user?.nome || user?.name || null,
    id, dono, dono, entidade, id, LIMITE_FOTOS,
  ]);
  if (!ins.changes) {
    // Fase 2 (9): o gestor trocou o motorista entre a conferencia e a gravacao -> 403; o lancamento sumiu -> 404; senao o teto
    const agora = await dbGet(db, `SELECT id, motorista_id FROM ${tabela} WHERE id = ?`, [id]);
    if (!agora) throw erro(404, naoEncontrado);
    if (dono != null && Number(agora.motorista_id) !== Number(dono)) throw erro(403, 'Você só pode alterar os seus próprios registros');
    throw erro(409, MSG.LIMITE, 'LIMITE_DE_FOTOS');
  }
  return dbGet(db, 'SELECT * FROM frotas_anexos WHERE id = ?', [ins.lastID]);
}

/** RN-F5.07: apaga a foto (linha e arquivo) com a regua de quem envia. */
async function apagar(db, user, idBruto, pasta) {
  const s = typeof idBruto === 'string' ? idBruto.trim() : String(idBruto ?? '');
  if (!/^\d{1,15}$/.test(s)) throw erro(404, MSG.FOTO_NAO_ENCONTRADA);
  const anexo = await dbGet(db, 'SELECT * FROM frotas_anexos WHERE id = ?', [Number(s)]);
  if (!anexo) throw erro(404, MSG.FOTO_NAO_ENCONTRADA);
  const ent = ENTIDADES[anexo.entidade];
  const row = ent ? await dbGet(db, `SELECT id, motorista_id FROM ${ent.tabela} WHERE id = ?`, [anexo.entidade_id]) : null;
  await conferirDono(db, user, row);
  const del = await dbRun(db, 'DELETE FROM frotas_anexos WHERE id = ?', [anexo.id]);
  if (!del.changes) throw erro(404, MSG.FOTO_NAO_ENCONTRADA);
  apagarArquivo(pasta, anexo.arquivo);
  return { success: true };
}

/** RN-F5.08: o lancamento foi excluido — as fotos dele (linhas e arquivos) vao junto. */
async function apagarDoLancamento(db, entidade, idBruto, pasta) {
  const id = Number(idBruto);
  if (!Number.isFinite(id)) return 0;
  const fotos = await dbAll(db, 'SELECT id, arquivo FROM frotas_anexos WHERE entidade = ? AND entidade_id = ?', [entidade, id]);
  if (!fotos.length) return 0;
  await dbRun(db, 'DELETE FROM frotas_anexos WHERE entidade = ? AND entidade_id = ?', [entidade, id]);
  for (const f of fotos) apagarArquivo(pasta, f.arquivo);
  return fotos.length;
}

/** O item da resposta: { id, url, tipo_mime, tamanho, created_at } (o nome do arquivo so sai dentro da URL assinada). */
function paraItem(anexo, assinar) {
  return {
    id: anexo.id, url: assinar(anexo.arquivo), tipo_mime: anexo.tipo_mime, tamanho: anexo.tamanho, created_at: anexo.created_at,
  };
}

/** RN-F5.05: cada linha ganha `anexos` (ordem id ASC; [] sem foto). As linhas ja vem no escopo de quem pede. */
async function comAnexos(db, entidade, rows, assinar) {
  const lista = Array.isArray(rows) ? rows : [];
  const ids = [...new Set(lista.map((r) => Number(r && r.id)).filter((n) => Number.isFinite(n)))];
  const porLancamento = new Map();
  for (let i = 0; i < ids.length; i += 500) {
    const fatia = ids.slice(i, i + 500);
    const fotos = await dbAll(db, `SELECT * FROM frotas_anexos WHERE entidade = ? AND entidade_id IN (${fatia.map(() => '?').join(',')})
      ORDER BY id`, [entidade, ...fatia]);
    for (const f of fotos) {
      if (!porLancamento.has(f.entidade_id)) porLancamento.set(f.entidade_id, []);
      porLancamento.get(f.entidade_id).push(paraItem(f, assinar));
    }
  }
  return lista.map((r) => ({ ...r, anexos: porLancamento.get(Number(r.id)) || [] }));
}

module.exports = {
  LIMITE_FOTOS, LIMITE_BYTES, MIMES_ACEITOS, ENTIDADES, MSG,
  familiaDoMime, formatoPelosBytes, apagarArquivo, gravar, apagar, apagarDoLancamento, comAnexos, paraItem,
};
