/**
 * Memória de tradução da proposta bilíngue (specs/proposta-bilingue/README.md, RN-BI.04/05/06).
 *
 * Uma linha por (idioma, texto PT). A chave é o texto PT NORMALIZADO (`normalizarChave`: espaços em sequência, NBSP e quebras viram
 * um espaço) e ANTES da troca dos marcadores {{…}} — o template grava a chave assim no atributo `data-tr-origem`, o painel do preview
 * a lê de lá e a devolve igual. `origem`: 'auto' (tradutor do Chrome) ou 'manual' (corrigida pelo vendedor); auto nunca sobrescreve
 * manual (RN-BI.06). A memória é global: a mesma frase em outra proposta já sai traduzida.
 */
const { normalizarChave, IDIOMAS, marcadoresDe } = require('../propostaBilingue');

const MAX_ITENS = 500;
const MAX_CARACTERES = 5000;

const ERROS = {
  idioma: 'Idioma inválido. Use en ou es.',
  origem: 'Origem inválida. Use auto ou manual.',
  itens: 'Envie os itens (até 500), cada um com texto_origem e texto_traduzido de até 5.000 caracteres.',
  vazia: 'A tradução não pode ficar vazia.',
  marcadores: 'A tradução tem de manter os mesmos marcadores {{…}} do texto em português.',
};

// Nomes de programa e de formato que nunca se traduzem — a mesma lista do cliente (client/.../traducaoChrome.js, TERMOS_FIXOS).
const TERMOS_FIXOS = ['Excel', 'Word', 'PowerPoint', 'PDF', 'DWG', 'DXF', 'AutoCAD', 'Revit', 'SolidWorks'];
const LETRA = 'A-Za-zÀ-ÖØ-öø-ÿ';
const temTermo = (texto, t) => new RegExp(`(?<![${LETRA}])${t}(?![${LETRA}])`, 'i').test(String(texto || ''));

/**
 * Apaga as traduções AUTOMÁTICAS que perderam um termo fixo ("✓ Excel;" -> "✓ Sobresalir;", 24/11/2026). Elas voltam a ficar
 * pendentes e a tela as traduz de novo, já com o termo protegido. A correção manual (origem 'manual') nunca é apagada.
 * callback(err, apagadas).
 */
function limparTraducoesSemTermoFixo(db, callback = () => {}) {
  db.all("SELECT id, texto_origem, texto_traduzido FROM traducoes WHERE origem = 'auto'", [], (err, rows) => {
    if (err) return callback(err, 0);
    const ids = (rows || []).filter((r) => TERMOS_FIXOS.some((t) => temTermo(r.texto_origem, t) && !temTermo(r.texto_traduzido, t)))
      .map((r) => r.id);
    if (!ids.length) return callback(null, 0);
    db.run(`DELETE FROM traducoes WHERE origem = 'auto' AND id IN (SELECT value FROM json_each(?))`, [JSON.stringify(ids)], function feito(e) {
      callback(e || null, e ? 0 : this.changes);
    });
  });
}

function criarTabelaTraducoes(db, callback = () => {}) {
  db.run(`CREATE TABLE IF NOT EXISTS traducoes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    idioma TEXT NOT NULL,
    texto_origem TEXT NOT NULL,
    texto_traduzido TEXT NOT NULL,
    origem TEXT NOT NULL DEFAULT 'auto',
    updated_by INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(idioma, texto_origem)
  )`, (err) => {
    if (err) return callback(err);
    // Quem gravou (Fase 5, 4): a memória é global e muda o texto de propostas já enviadas ao regerar o PDF — precisa de rastro.
    db.run('ALTER TABLE traducoes ADD COLUMN updated_by INTEGER', (errA) => {
      const jaTem = errA && /duplicate column/i.test(String(errA.message));
      callback(errA && !jaTem ? errA : null);
    });
  });
}

/**
 * Valida o corpo do POST. Devolve { erro } (mensagem literal do contrato) ou { idioma, origem, itens } com os textos normalizados.
 * Texto de origem repetido no mesmo pedido: vale o ÚLTIMO (a mesma frase em duas cláusulas é uma tradução só).
 */
function validarGravacao(corpo) {
  const b = corpo && typeof corpo === 'object' ? corpo : {};
  if (!IDIOMAS.includes(b.idioma)) return { erro: ERROS.idioma };
  if (b.origem !== 'auto' && b.origem !== 'manual') return { erro: ERROS.origem };
  if (!Array.isArray(b.itens) || b.itens.length === 0 || b.itens.length > MAX_ITENS) return { erro: ERROS.itens };
  const porChave = new Map();
  for (const it of b.itens) {
    if (!it || typeof it.texto_origem !== 'string' || typeof it.texto_traduzido !== 'string') return { erro: ERROS.itens };
    const origem = normalizarChave(it.texto_origem);
    const traduzido = normalizarChave(it.texto_traduzido);
    if (!origem || origem.length > MAX_CARACTERES || traduzido.length > MAX_CARACTERES) return { erro: ERROS.itens };
    if (!traduzido) return { erro: ERROS.vazia };
    // A chave tem os marcadores {{…}}; a tradução tem de ter os mesmos — senão o dado de UM cliente (o nome que já tinha sido trocado
    // no texto visível) iria para a memória global e sairia na proposta de outro (Fase 5, crítico 1).
    if (marcadoresDe(origem).join('|') !== marcadoresDe(traduzido).join('|')) return { erro: ERROS.marcadores };
    porChave.set(origem, traduzido);
  }
  return { idioma: b.idioma, origem: b.origem, itens: [...porChave].map(([texto_origem, texto_traduzido]) => ({ texto_origem, texto_traduzido })) };
}

/** Grava os itens já validados. callback(err, { gravadas, ignoradas }) — ignorada = auto que encontrou uma correção manual. */
function gravarTraducoes(db, { idioma, origem, itens, usuarioId = null }, callback) {
  let gravadas = 0; let ignoradas = 0; let i = 0;
  // auto: o WHERE do DO UPDATE protege a manual (sem mudança = ignorada); manual: sobrescreve sempre.
  const sql = `INSERT INTO traducoes (idioma, texto_origem, texto_traduzido, origem, updated_by, updated_at)
               VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
               ON CONFLICT(idioma, texto_origem) DO UPDATE SET
                 texto_traduzido = excluded.texto_traduzido, origem = excluded.origem, updated_by = excluded.updated_by,
                 updated_at = CURRENT_TIMESTAMP
               ${origem === 'auto' ? "WHERE traducoes.origem <> 'manual'" : ''}`;
  const proximo = () => {
    if (i >= itens.length) return callback(null, { gravadas, ignoradas });
    const it = itens[i++];
    db.run(sql, [idioma, it.texto_origem, it.texto_traduzido, origem, usuarioId], function feito(err) {
      if (err) return callback(err, { gravadas, ignoradas });
      if (this.changes > 0) gravadas++; else ignoradas++;
      proximo();
    });
  };
  proximo();
}

/** { [texto PT]: texto traduzido } do idioma — o que o template usa. Idioma fora de en/es = {} sem ir ao banco. */
function carregarMapaTraducoes(db, idioma, callback) {
  if (!IDIOMAS.includes(idioma)) return callback(null, {});
  db.all('SELECT texto_origem, texto_traduzido FROM traducoes WHERE idioma = ?', [idioma], (err, rows) => {
    if (err) return callback(err, {});
    const mapa = {};
    (rows || []).forEach((r) => { mapa[r.texto_origem] = r.texto_traduzido; });
    callback(null, mapa);
  });
}

module.exports = { ERROS, MAX_ITENS, MAX_CARACTERES, TERMOS_FIXOS, limparTraducoesSemTermoFixo, criarTabelaTraducoes, validarGravacao, gravarTraducoes, carregarMapaTraducoes };
