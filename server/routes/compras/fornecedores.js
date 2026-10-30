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
const { condicaoDeBusca } = require('../../services/buscaSemCaixa');

// Literal já usada pelas outras rotas de fornecedor do index.js (foto, planilha) — uma só.
const NAO_ENCONTRADO = 'Fornecedor não encontrado';
const STATUS_VALIDOS = ['ativo', 'inativo'];
/** Etapa 103 (RN-103.08) — literais do vínculo a grupo que não pode receber fornecedor. */
const GRUPO_NAO_ENCONTRADO = 'Grupo não encontrado';
const GRUPO_DESATIVADO = 'Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores';

/** Etapa 192 (RN-192.02/03) — literais do CPF (as mesmas da tela). */
const CPF_INVALIDO = 'CPF inválido. Verifique os dígitos.';
const CPF_E_CNPJ = 'Preencha o CPF ou o CNPJ, não os dois.';

/**
 * Etapa 192 (RN-192.05) — os textos LIVRES da ficha gravam em maiúsculas, com acento ("são" -> "SÃO").
 * Fora de propósito: email (minúsculo é o normal), telefones, CEP, CNPJ e CPF (dígitos/máscara).
 * Só na gravação: a leitura não converte, e o já cadastrado passa a maiúsculas quando for salvo de
 * novo (RN-192.06 — converter em massa seria irreversível).
 */
const CAMPOS_MAIUSCULOS = ['razao_social', 'nome_fantasia', 'inscricao_estadual', 'contato', 'endereco', 'cidade', 'estado'];

/** Colunas de texto da ficha, além de razao_social (obrigatória) e grupo_id (inteiro). */
const CAMPOS_TEXTO = [
  'nome_fantasia', 'cnpj', 'inscricao_estadual', 'contato', 'email', 'telefone',
  'telefone_vendedor', 'endereco', 'cidade', 'estado', 'cep',
];

/** Projeção do GET /:id — nomeada de propósito: `planilha_dados` é a planilha inteira em JSON. */
const COLUNAS_FICHA = [
  'id', 'razao_social', 'nome_fantasia', 'cnpj', 'cpf', 'inscricao_estadual', 'contato', 'email',
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

/** O texto da coluna `k` como vai para o banco: trim, '' -> NULL e, nos livres, maiúsculas. */
function textoDaFicha(k, v) {
  const t = textoOuNull(v);
  return t != null && CAMPOS_MAIUSCULOS.includes(k) ? t.toLocaleUpperCase('pt-BR') : t;
}

/** Dígitos verificadores do CPF (módulo 11); 11 dígitos iguais não valem. */
function cpfValido(digitos) {
  if (!/^\d{11}$/.test(digitos) || /^(\d)\1{10}$/.test(digitos)) return false;
  for (let t = 9; t < 11; t++) {
    let soma = 0;
    for (let i = 0; i < t; i++) soma += Number(digitos[i]) * (t + 1 - i);
    if (((soma * 10) % 11) % 10 !== Number(digitos[t])) return false;
  }
  return true;
}

/**
 * Etapa 192 (RN-192.02) — `{ valor }` ('000.000.000-00' ou null) ou `{ erro }`. Vazio/só espaços é
 * "sem CPF"; qualquer outra coisa tem de ter os 11 dígitos válidos (máscara opcional na entrada).
 */
function parseCpf(v) {
  const t = textoOuNull(v);
  if (t == null) return { valor: null };
  const d = t.replace(/\D/g, '');
  if (/[^\d.\-\s]/.test(t) || !cpfValido(d)) return { erro: CPF_INVALIDO };
  return { valor: `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` };
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
      // Etapa 192: o CPF entra na busca (mascarado ou só dígitos — RN-192.04). Fase 5 (X2): a regua sem caixa comum
      // (buscaSemCaixa.js) no lugar da feita a mao, que so mandava o termo como veio e em maiusculas — o legado em caixa
      // mista ("Aços Legado") nao era achado por "AÇOS".
      const cond = condicaoDeBusca(['razao_social', 'nome_fantasia', 'cnpj', 'cpf', "REPLACE(REPLACE(cpf, '.', ''), '-', '')"], search);
      if (cond.sql) { sql += ` AND ${cond.sql}`; params.push(...cond.params); }
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
    const razao_social = textoDaFicha('razao_social', body.razao_social);
    if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });
    const grupo = parseGrupoId(body.grupo_id);
    if (grupo.erro) return res.status(400).json({ error: grupo.erro });
    const cpf = parseCpf(body.cpf);
    if (cpf.erro) return res.status(400).json({ error: cpf.erro });

    const textos = CAMPOS_TEXTO.map((k) => textoDaFicha(k, body[k]));
    // RN-192.03: um documento só — CPF (pessoa física) ou CNPJ.
    if (cpf.valor != null && textos[CAMPOS_TEXTO.indexOf('cnpj')] != null) {
      return res.status(400).json({ error: CPF_E_CNPJ });
    }
    try {
      if (grupo.valor != null) {
        const recusa = await recusaDoGrupoNovo(grupo.valor);
        if (recusa) return res.status(400).json({ error: recusa });
      }
      const colunas = `razao_social, ${CAMPOS_TEXTO.join(', ')}, cpf, grupo_id, status`;
      const marcas = `?, ${CAMPOS_TEXTO.map(() => '?').join(', ')}, ?, ?, ?`;
      const valores = [razao_social, ...textos, cpf.valor, grupo.valor, 'ativo'];
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
        id: r.lastID, razao_social, nome_fantasia: textos[0], cpf: cpf.valor, grupo_id: grupo.valor,
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
    const razao_social = textoDaFicha('razao_social', body.razao_social);
    if (!razao_social) return res.status(400).json({ error: 'Razão social é obrigatória' });

    const sets = ['razao_social = ?'];
    const params = [razao_social];

    CAMPOS_TEXTO.forEach((k) => {
      if (!temChave(body, k)) return;
      sets.push(`${k} = ?`);
      params.push(textoDaFicha(k, body[k]));
    });

    // Etapa 192 (RN-192.02): mesma semântica dos textos — ausente não mexe, ''/null limpa.
    const temCpf = temChave(body, 'cpf');
    const cpf = temCpf ? parseCpf(body.cpf) : { valor: undefined };
    if (cpf.erro) return res.status(400).json({ error: cpf.erro });
    if (temCpf) { sets.push('cpf = ?'); params.push(cpf.valor); }

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
      // RN-192.03: CPF e CNPJ juntos é recusado olhando o estado FINAL — a chave ausente vale o gravado
      // (o modal do grupo manda cnpj sem cpf; um fornecedor só com CPF não pode ganhar CNPJ por ali).
      if (temCpf || temChave(body, 'cnpj')) {
        const atual = await dbGet(db, 'SELECT cnpj, cpf FROM fornecedores WHERE id = ?', [id]);
        if (!atual) return res.status(404).json({ error: NAO_ENCONTRADO });
        const cnpjFinal = temChave(body, 'cnpj') ? textoOuNull(body.cnpj) : textoOuNull(atual.cnpj);
        const cpfFinal = temCpf ? cpf.valor : textoOuNull(atual.cpf);
        if (cnpjFinal != null && cpfFinal != null) return res.status(400).json({ error: CPF_E_CNPJ });
      }
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
