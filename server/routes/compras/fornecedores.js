/**
 * Fornecedor — ficha (Etapa 34).
 *
 * Registrador montável, pelo mesmo motivo do pedidos.js: enquanto POST/PUT moravam inline no
 * index.js, NENHUM teste os alcançava — e dois defeitos viveram ali sem ninguém ver:
 *  - o POST não gravava endereço/cidade/estado/cep (só 7 das 13 colunas da ficha);
 *  - o PUT tratava `grupo_id: null` como "não mexe", então o botão "Remover do grupo"
 *    (FornecedoresDoGrupo.js) mostrava "removido" e não removia nada.
 *
 * Semântica do PUT (RN-34.05): chave AUSENTE não mexe; `''`/`null` LIMPA (grava NULL). É o
 * que deixa o modal antigo do grupo — que manda só 7 textos + grupo_id — continuar sem zerar
 * cidade/estado/cep/telefone do vendedor. Exceção única: `razao_social` é obrigatória também
 * no PUT (ausente ou vazia → 400), como já era.
 *
 * `grupo_id`: ausente/`''`/`null` → NULL (no PUT, limpa); inteiro grava SEM validar
 * existência (como sempre foi — o modal manda o id do grupo que está aberto); não-inteiro
 * não vazio ('abc') → 400 "Grupo inválido".
 *
 * Ordem de registro: este módulo só tem GET/POST/PUT, então a posição em relação ao
 * `app.delete('/api/compras/:tipo/:id')` genérico é inócua (verbos diferentes não se
 * sombreiam). O DELETE /fornecedores/:id continua no genérico, como Compras.js usa.
 *
 * Regras: docs/superpowers/plans/2026-10-06-crm-etapa34-ficha-do-fornecedor.md (grep RN-34).
 */

const { dbRun, dbGet } = require('../../services/compras/db');

// Literal já usada pelas outras rotas de fornecedor do index.js (foto, planilha) — uma só.
const NAO_ENCONTRADO = 'Fornecedor não encontrado';
const STATUS_VALIDOS = ['ativo', 'inativo'];

/** Colunas de texto da ficha, além de razao_social (obrigatória) e grupo_id (inteiro). */
const CAMPOS_TEXTO = [
  'nome_fantasia', 'cnpj', 'inscricao_estadual', 'contato', 'email', 'telefone',
  'telefone_vendedor', 'endereco', 'cidade', 'estado', 'cep',
];

/** Projeção do GET /:id — nomeada de propósito: `planilha_dados` é a planilha inteira em JSON. */
const COLUNAS_FICHA = [
  'id', 'razao_social', 'nome_fantasia', 'cnpj', 'inscricao_estadual', 'contato', 'email',
  'telefone', 'telefone_vendedor', 'celular', 'endereco', 'cidade', 'estado', 'cep', 'status',
  'grupo_id', 'foto', 'created_at', 'updated_at',
];

const temChave = (obj, k) => Object.prototype.hasOwnProperty.call(obj, k);

/** `''`, só espaços e null viram NULL — nenhum consumidor distingue '' de NULL. */
function textoOuNull(v) {
  if (v == null) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

/** Devolve `{ valor }` (inteiro ou null) ou `{ erro }`. */
function parseGrupoId(v) {
  if (v == null) return { valor: null };
  if (typeof v === 'number') {
    return Number.isInteger(v) ? { valor: v } : { erro: 'Grupo inválido' };
  }
  const s = String(v).trim();
  if (s === '') return { valor: null };
  if (!/^\d+$/.test(s)) return { erro: 'Grupo inválido' };
  return { valor: parseInt(s, 10) };
}

module.exports = function (app, db, authenticateToken, checkModulePermission) {
  const guard = [authenticateToken, checkModulePermission('compras')];

  // RN-34.06 — nasce aqui; a lista continua `SELECT *` no index.js.
  app.get('/api/compras/fornecedores/:id', guard, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(404).json({ error: NAO_ENCONTRADO });
    try {
      const row = await dbGet(db, `SELECT ${COLUNAS_FICHA.join(', ')} FROM fornecedores WHERE id = ?`, [id]);
      if (!row) return res.status(404).json({ error: NAO_ENCONTRADO });
      res.json(row);
    } catch (err) {
      console.error('Erro ao buscar fornecedor:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // RN-34.05 — grava as 13 colunas. `status` é ignorado no POST (sempre 'ativo').
  app.post('/api/compras/fornecedores', guard, async (req, res) => {
    const body = req.body || {};
    const razao_social = textoOuNull(body.razao_social);
    if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });
    const grupo = parseGrupoId(body.grupo_id);
    if (grupo.erro) return res.status(400).json({ error: grupo.erro });

    const textos = CAMPOS_TEXTO.map((k) => textoOuNull(body[k]));
    try {
      const r = await dbRun(
        db,
        `INSERT INTO fornecedores (razao_social, ${CAMPOS_TEXTO.join(', ')}, grupo_id, status)
         VALUES (?, ${CAMPOS_TEXTO.map(() => '?').join(', ')}, ?, ?)`,
        [razao_social, ...textos, grupo.valor, 'ativo']
      );
      res.status(201).json({
        id: r.lastID, razao_social, nome_fantasia: textos[0], grupo_id: grupo.valor,
      });
    } catch (err) {
      console.error('Erro ao criar fornecedor:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // RN-34.05 / RN-34.07 — ausente não mexe; ''/null limpa; razao obrigatória; status fechado.
  app.put('/api/compras/fornecedores/:id', guard, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const body = req.body || {};
    const razao_social = textoOuNull(body.razao_social);
    if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });

    const sets = ['razao_social = ?'];
    const params = [razao_social];

    CAMPOS_TEXTO.forEach((k) => {
      if (!temChave(body, k)) return;
      sets.push(`${k} = ?`);
      params.push(textoOuNull(body[k]));
    });

    if (temChave(body, 'grupo_id')) {
      const grupo = parseGrupoId(body.grupo_id);
      if (grupo.erro) return res.status(400).json({ error: grupo.erro });
      sets.push('grupo_id = ?');
      params.push(grupo.valor);
    }

    if (temChave(body, 'status')) {
      const status = String(body.status || '').trim().toLowerCase();
      if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido' });
      sets.push('status = ?');
      params.push(status);
    }

    sets.push('updated_at = CURRENT_TIMESTAMP');
    if (!id) return res.status(404).json({ error: NAO_ENCONTRADO });
    params.push(id);

    try {
      const r = await dbRun(db, `UPDATE fornecedores SET ${sets.join(', ')} WHERE id = ?`, params);
      if (r.changes === 0) return res.status(404).json({ error: NAO_ENCONTRADO });
      res.json({ message: 'Fornecedor atualizado' });
    } catch (err) {
      console.error('Erro ao atualizar fornecedor:', err);
      res.status(500).json({ error: err.message });
    }
  });

  console.log('✅ Rotas de fornecedor registradas (Etapa 34)');
};
