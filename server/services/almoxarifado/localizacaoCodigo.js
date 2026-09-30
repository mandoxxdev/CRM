/**
 * Etapa 55 (RN-01) — o próximo código de localização, no servidor.
 *
 * Porta o gerador que só existia na tela (`generateNextCodigo`, ConfiguracoesAlmoxarifado.js) com o
 * MESMO formato (`PREFIXO-NN`) e as mesmas regras de prefixo, e muda duas coisas medidas por sonda:
 *  1. o "maior número" conta as irmãs INATIVAS também — a tela só recebia ativas, propunha o código
 *     de uma localização desativada, e o POST a REATIVAVA em silêncio (herdando histórico e saldo);
 *     no Mover, o mesmo código estourava o UNIQUE com 500 cru;
 *  2. a proposta nunca é um código que já existe na tabela INTEIRA (Fase 2: as colisões mais comuns
 *     nem são inativas — o 1º filho de `A-01` recebe `A-02`, raiz do seed).
 * O formato não muda: código impresso em etiqueta e usado por integração não pode trocar.
 */
const { dbGet, dbAll } = require('./db');

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

const numeroDoCodigo = (codigo) => {
  const m = String(codigo || '').match(/-(\d+)$/);
  return m ? parseInt(m[1], 10) : 0;
};

const prefixoDoCodigo = (codigo) => {
  const m = String(codigo || '').match(/^(.+?)-(\d+)$/);
  if (m) return m[1];
  return String(codigo || '').replace(/\d+$/, '') || 'X';
};

/** Prefixo do setor: o configurado (só de setor ATIVO, como a tela), senão derivado do nome. */
async function prefixoDoSetor(db, setor) {
  if (setor) {
    const cfg = await dbGet(db, 'SELECT codigo_prefixo FROM setores_almoxarifado WHERE nome = ? AND ativo = 1', [setor]);
    if (cfg && cfg.codigo_prefixo) return cfg.codigo_prefixo;
  }
  const partes = String(setor || '').split(/\s+/);
  if (partes[0] === 'Corredor' && partes[1]) return partes[1].toUpperCase();
  const limpo = String(setor || '').replace(/[^A-Za-z0-9]/g, '');
  return (limpo.slice(0, 3) || 'LOC').toUpperCase();
}

async function proximoCodigoLocalizacao(db, { setor: setorBruto, parent_id: parentId, excluir_id: excluirId } = {}) {
  // Fase 5: `?setor=a&setor=b` chega como ARRAY e virava bind invalido (500). Vale o primeiro.
  const setor = Array.isArray(setorBruto) ? setorBruto[0] : setorBruto;
  const excluir = excluirId ? parseInt(excluirId, 10) : null;
  const pai = parentId ? parseInt(parentId, 10) : null;
  let prefixo; let base;
  if (pai) {
    const p = await dbGet(db, 'SELECT id, codigo, ativo FROM localizacoes_almoxarifado WHERE id = ?', [pai]);
    if (!p) throw erro('Localização pai não encontrada');
    if (Number(p.ativo) !== 1) throw erro(`Localização pai ${p.codigo} está inativa`);
    prefixo = prefixoDoCodigo(p.codigo);
    const filhas = (await dbAll(db, 'SELECT id, codigo FROM localizacoes_almoxarifado WHERE parent_id = ?', [pai]))
      .filter((l) => l.id !== excluir);
    base = filhas.length ? Math.max(...filhas.map((l) => numeroDoCodigo(l.codigo))) : numeroDoCodigo(p.codigo);
  } else {
    prefixo = await prefixoDoSetor(db, setor);
    // Setor vazio casa '' e NULL (a localização legada sem setor chega do Mover como '').
    const raizes = (await dbAll(db, `SELECT id, codigo FROM localizacoes_almoxarifado
      WHERE parent_id IS NULL AND COALESCE(setor, '') = ?`, [setor || '']))
      .filter((l) => l.id !== excluir);
    const nums = raizes.map((l) => numeroDoCodigo(l.codigo)).filter((n) => n > 0);
    base = nums.length ? Math.max(...nums) : 0;
  }
  // Colisão contra a tabela INTEIRA, ativa ou inativa, menos a própria localização movida. Filtro em
  // JS de propósito: um prefixo configurado pode conter `_`/`%`, e LIKE os leria como curinga.
  const existentes = new Set((await dbAll(db, 'SELECT id, codigo FROM localizacoes_almoxarifado'))
    .filter((l) => l.id !== excluir).map((l) => l.codigo));
  let n = base + 1;
  let codigo = `${prefixo}-${String(n).padStart(2, '0')}`;
  while (existentes.has(codigo)) {
    n += 1;
    codigo = `${prefixo}-${String(n).padStart(2, '0')}`;
  }
  return codigo;
}

module.exports = { proximoCodigoLocalizacao, prefixoDoCodigo, numeroDoCodigo };
