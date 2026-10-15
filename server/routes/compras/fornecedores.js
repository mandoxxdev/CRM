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
 * `grupo_id`: ausente/`''`/`null` → NULL (no PUT, limpa); não-inteiro não vazio ('abc') → 400
 * "Grupo inválido". Inteiro NOVO (todo POST; no PUT, diferente do gravado) tem de ser de um grupo
 * que existe e está ativo (Etapa 103, RN-103.08, B52) — até a 102 gravava SEM validar, e a tela de
 * um grupo desativado aberta por endereço antigo vinculava fornecedor a ele. O MESMO valor do
 * gravado passa (fornecedor que já está num grupo desativado continua editável — B45/B46).
 *
 * Ordem de registro: este módulo só tem GET/POST/PUT, então a posição em relação ao
 * `app.delete('/api/compras/:tipo/:id')` genérico é inócua (verbos diferentes não se
 * sombreiam). O DELETE /fornecedores/:id continua no genérico, como Compras.js usa.
 *
 * Regras: docs/superpowers/plans/2026-10-06-crm-etapa34-ficha-do-fornecedor.md (grep RN-34).
 */

const { dbRun, dbGet, dbAll } = require('../../services/compras/db');

// Literal já usada pelas outras rotas de fornecedor do index.js (foto, planilha) — uma só.
const NAO_ENCONTRADO = 'Fornecedor não encontrado';
const STATUS_VALIDOS = ['ativo', 'inativo'];
/** Etapa 103 (RN-103.08) — literais do vínculo a grupo que não pode receber fornecedor. */
const GRUPO_NAO_ENCONTRADO = 'Grupo não encontrado';
const GRUPO_DESATIVADO = 'Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores';

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

  /** Devolve a literal da recusa, ou null quando o grupo existe e está ativo. */
  async function recusaDoGrupoNovo(grupoId) {
    const g = await dbGet(db, 'SELECT ativo FROM grupos_compras WHERE id = ?', [grupoId]);
    if (!g) return GRUPO_NAO_ENCONTRADO;
    if (Number(g.ativo) !== 1) return GRUPO_DESATIVADO;
    return null;
  }

  /**
   * Etapa 109 (B52, RN-109.01/02) — condicao SQL do vinculo novo: o grupo esta ativo NO COMANDO que
   * grava. A conferencia previa (recusaDoGrupoNovo) e um SELECT separado; um "Remover grupo" que caisse
   * entre ela e a gravacao deixava o vinculo gravado DEPOIS da desativacao (sonda: 30 de 30 no POST).
   * Um comando so o SQLite executa inteiro antes ou depois do UPDATE do DELETE /grupos/:id.
   */
  const GRUPO_ATIVO_NO_COMANDO = 'EXISTS (SELECT 1 FROM grupos_compras WHERE id = ? AND ativo = 1)';

  /** A gravacao condicional nao gravou: rele para responder a literal da 103 (ou a de desativado). */
  async function recusaDepoisDaCorrida(grupoId) {
    return (await recusaDoGrupoNovo(grupoId)) || GRUPO_DESATIVADO;
  }

  // G2 (lote de outubro): a lista morava inline no index.js como `SELECT *` e devolvia
  // `planilha_dados` — a planilha de precos inteira em JSON — para QUATRO telas que nao a leem
  // (Compras.js, PedidoCompraForm.js, FornecedoresDoGrupo.js, ItensFornecedor.js); um fornecedor
  // com planilha de milhares de linhas entrava em todo pedido novo. Mesma projecao nomeada do
  // GET /:id; `search` (razao, fantasia, cnpj) e `status` continuam; ORDER BY created_at DESC
  // continua. Mora aqui para o harness alcancar (o index.js nao e carregado nos testes).
  app.get('/api/compras/fornecedores', guard, async (req, res) => {
    const { search, status } = req.query;
    let sql = `SELECT ${COLUNAS_FICHA.join(', ')} FROM fornecedores WHERE 1=1`;
    const params = [];
    if (search) {
      sql += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)';
      const termo = `%${search}%`;
      params.push(termo, termo, termo);
    }
    if (status) {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    try {
      res.json(await dbAll(db, sql, params));
    } catch (err) {
      console.error('Erro ao listar fornecedores:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // RN-34.06 — nasce aqui.
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
      if (grupo.valor != null) {
        const recusa = await recusaDoGrupoNovo(grupo.valor);
        if (recusa) return res.status(400).json({ error: recusa });
      }
      const colunas = `razao_social, ${CAMPOS_TEXTO.join(', ')}, grupo_id, status`;
      const marcas = `?, ${CAMPOS_TEXTO.map(() => '?').join(', ')}, ?, ?`;
      const valores = [razao_social, ...textos, grupo.valor, 'ativo'];
      // Etapa 109: com grupo, INSERT ... SELECT ... WHERE grupo ativo — a conferencia e a gravacao
      // sao o mesmo comando. Sem grupo, o INSERT de sempre.
      const r = grupo.valor == null
        ? await dbRun(db, `INSERT INTO fornecedores (${colunas}) VALUES (${marcas})`, valores)
        : await dbRun(
          db,
          `INSERT INTO fornecedores (${colunas}) SELECT ${marcas} WHERE ${GRUPO_ATIVO_NO_COMANDO}`,
          [...valores, grupo.valor]
        );
      if (r.changes === 0) return res.status(400).json({ error: await recusaDepoisDaCorrida(grupo.valor) });
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

    // Lido aqui (a ordem dos 400 nao muda: razao -> grupo invalido -> status), gravado abaixo.
    const temGrupo = temChave(body, 'grupo_id');
    let grupoValor = null;
    if (temGrupo) {
      const grupo = parseGrupoId(body.grupo_id);
      if (grupo.erro) return res.status(400).json({ error: grupo.erro });
      grupoValor = grupo.valor;
    }

    if (temChave(body, 'status')) {
      const status = String(body.status || '').trim().toLowerCase();
      if (!STATUS_VALIDOS.includes(status)) return res.status(400).json({ error: 'Status inválido' });
      sets.push('status = ?');
      params.push(status);
    }

    if (!id) return res.status(404).json({ error: NAO_ENCONTRADO });

    try {
      // RN-103.08 (B52): só o grupo que MUDA passa pela checagem; o fornecedor inexistente responde
      // 404 antes dela. A comparação é com o valor JÁ passado por parseGrupoId ('7' da URL = 7).
      // Grupo IGUAL ao gravado não entra no SET: com a FK de produção ligada
      // (`grupo_id REFERENCES grupos_compras`, foreign_keys = ON), reescrever um grupo_id órfão com
      // ele mesmo falha ("FOREIGN KEY constraint failed") — achado M1 da revisão do plano.
      let grupoNovo = null;
      if (temGrupo && grupoValor != null) {
        const atual = await dbGet(db, 'SELECT grupo_id FROM fornecedores WHERE id = ?', [id]);
        if (!atual) return res.status(404).json({ error: NAO_ENCONTRADO });
        const mesmo = atual.grupo_id != null && Number(atual.grupo_id) === grupoValor;
        if (!mesmo) {
          const recusa = await recusaDoGrupoNovo(grupoValor);
          if (recusa) return res.status(400).json({ error: recusa });
          sets.push('grupo_id = ?');
          params.push(grupoValor);
          grupoNovo = grupoValor;
        }
      } else if (temGrupo) {
        sets.push('grupo_id = ?');
        params.push(null);
      }
      sets.push('updated_at = CURRENT_TIMESTAMP');
      params.push(id);
      // Etapa 109: grupo NOVO -> o UPDATE so grava se o grupo ainda esta ativo no proprio comando
      // (tudo ou nada: a ficha inteira e recusada, como na recusa previa da 103).
      let where = 'WHERE id = ?';
      if (grupoNovo != null) {
        where += ` AND ${GRUPO_ATIVO_NO_COMANDO}`;
        params.push(grupoNovo);
      }
      const r = await dbRun(db, `UPDATE fornecedores SET ${sets.join(', ')} ${where}`, params);
      if (r.changes === 0) {
        if (grupoNovo != null && await dbGet(db, 'SELECT 1 AS existe FROM fornecedores WHERE id = ?', [id])) {
          return res.status(400).json({ error: await recusaDepoisDaCorrida(grupoNovo) });
        }
        return res.status(404).json({ error: NAO_ENCONTRADO });
      }
      res.json({ message: 'Fornecedor atualizado' });
    } catch (err) {
      console.error('Erro ao atualizar fornecedor:', err);
      res.status(500).json({ error: err.message });
    }
  });

  console.log('✅ Rotas de fornecedor registradas (Etapa 34)');
};
