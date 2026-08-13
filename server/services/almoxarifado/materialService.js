/**
 * Cadastro de material — a criacao, fora do handler HTTP.
 *
 * Ate a Etapa 8c o unico INSERT INTO materiais_almoxarifado de producao morava INLINE no handler
 * (routes/almoxarifado.js:454), junto com quatro efeitos que ninguem que so olha o INSERT enxerga:
 * a movimentacao de saldo inicial, a sincronizacao da linha de saldo por localizacao, a auditoria
 * e a releitura enriquecida com a familia. Qualquer outro caminho que precisasse criar material
 * teria de fazer uma requisicao HTTP para o proprio servidor, ou reimplementar os cinco passos —
 * e a Etapa 8c precisa exatamente disso (a tela cria o material-peca resultante da transformacao).
 *
 * O QUE ESTE SERVICO NAO FAZ: nao checa permissao. O gate e da ROTA
 * (requirePermission('criar_material')), como em todo o modulo — os caminhos internos que chamam
 * este servico ja passaram pelo gate DELES, e duplicar a checagem aqui recusaria chamadas
 * legitimas de servico para servico. Ver o mesmo desenho em thirdPartyService (o gate proprio
 * `remessar_terceiro` esta no servico porque ele NAO tem chamador interno; aqui tem).
 *
 * Os quatro helpers no topo eram closures do modulo de rota (capturavam `db`). Aqui recebem `db`
 * por parametro e a rota mantem wrappers de uma linha, para os outros usos dela nao mudarem —
 * refactor sem mudanca de comportamento e testado como tal
 * (tests/api/materialServiceCriacao.api.test.js compara a linha da rota com a do servico coluna
 * a coluna, em vez de uma lista de campos escolhida a dedo).
 */
const { dbRun, dbGet } = require('./db');
const { registrarAuditoria } = require('./audit');
const stockService = require('./stockService');

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

function bool01(v) { return v ? 1 : 0; }

async function validateFamiliaAtiva(db, familiaId) {
  if (!familiaId) return null;
  const row = await dbGet(db, 'SELECT id, ativo FROM familias_material_almoxarifado WHERE id = ?', [familiaId]);
  if (!row) throw new Error('Família não encontrada');
  if (row.ativo !== 1) throw new Error('Família inativa — não é possível vincular novos itens');
  return row;
}

/**
 * Subfamilias (Etapa 2, Task 3): quando informada, a subfamilia do material precisa ser filha
 * (parent_id = familiaId) e ativa. familiaId pode ser null (familia omitida no PUT full-replace) —
 * nesse caso nenhuma subfamilia bate no WHERE e a validacao falha, que e o comportamento correto.
 */
async function validateSubfamilia(db, subfamiliaId, familiaId) {
  if (!subfamiliaId) return null;
  const row = await dbGet(db,
    'SELECT id FROM familias_material_almoxarifado WHERE id = ? AND parent_id = ? AND ativo = 1',
    [subfamiliaId, familiaId]);
  if (!row) throw new Error('Subfamília inválida para a família selecionada');
  return row;
}

/**
 * COPIA LITERAL das closures homonimas de routes/almoxarifado.js (:98-112). O plano da 8c trazia
 * uma versao REESCRITA destas duas funcoes (montava o caminho como
 * `parent.codigo + parent.descricao` e depois o primeiro nao-vazio de descricao/subgrupo/setor);
 * isso teria mudado o rotulo gravado na coluna `localizacao` de todo material criado pelo servico,
 * calado — e o guarda de refactor nao pegaria, porque o corpo de teste nao manda
 * `localizacao_padrao_id`. Refactor sem mudanca de comportamento significa a MESMA conta.
 */
function buildLocalizacaoPath(loc, parent) {
  if (!loc) return '';
  const parts = [];
  if (loc.setor) parts.push(loc.setor);
  if (parent) parts.push(parent.subgrupo || parent.descricao || parent.codigo);
  if (loc.subgrupo) parts.push(loc.subgrupo);
  else if (loc.descricao && !parent) parts.push(loc.descricao);
  return parts.join(' / ');
}

function formatLocalizacaoLabel(loc, parent) {
  if (!loc) return null;
  const path = buildLocalizacaoPath(loc, parent);
  return path ? `${loc.codigo} — ${path}` : loc.codigo;
}

/**
 * Resolve o par (id, rotulo formatado) de uma localizacao padrao a partir do FK — usado no cadastro
 * de materiais (POST/PUT). locId e null quando o FK nao foi informado; locText e null quando a
 * localizacao nao existe mais (FK orfao).
 */
async function resolveLocalizacaoFromFk(db, localizacaoPadraoId) {
  const id = localizacaoPadraoId ? parseInt(localizacaoPadraoId, 10) : null;
  if (!id) return { locId: null, locText: null };
  const row = await dbGet(db,
    `SELECT l.id, l.codigo, l.descricao, l.setor, l.subgrupo, l.parent_id,
            p.codigo as parent_codigo, p.descricao as parent_descricao, p.subgrupo as parent_subgrupo
     FROM localizacoes_almoxarifado l
     LEFT JOIN localizacoes_almoxarifado p ON l.parent_id = p.id
     WHERE l.id = ?`, [id]);
  if (!row) return { locId: id, locText: null };
  const parent = row.parent_id ? {
    codigo: row.parent_codigo, descricao: row.parent_descricao, subgrupo: row.parent_subgrupo,
  } : null;
  return { locId: id, locText: formatLocalizacaoLabel(row, parent) };
}

/**
 * Proximo codigo da familia — pelo MAIOR NUMERO, nao pelo material de maior id.
 *
 * O que havia antes (routes/almoxarifado.js:697-739) era `ORDER BY id DESC LIMIT 1` + 1. Dois
 * defeitos: (1) cadastrar CHP-010 e depois CHP-002 fazia o gerador olhar CHP-002 (id maior) e
 * propor CHP-003, que ja podia existir; (2) em lote, N chamadas concorrentes devolvem o MESMO
 * numero — e a Etapa 8c pede N codigos de uma vez (uma chapa vira N pecas).
 *
 * O (1) se resolve aqui, com MAX. O (2) NAO se resolve aqui e nem tem como: esta funcao so LE.
 * Quem resolve e createMaterial, com retry sob UNIQUE quando `codigo_auto` esta ligado — a
 * colisao e detectada onde ela de fato acontece, no INSERT.
 *
 * GLOB '[0-9]*' alem do LIKE: sem ele, um codigo manual como 'CHP-ESPECIAL' entraria no CAST e
 * viraria 0 em silencio (SQLite nao lanca em CAST invalido), e um codigo 'CHP-12A' viraria 12 —
 * numeros que competiriam com os de verdade pelo MAX.
 */
async function proximoCodigo(db, familiaId) {
  if (familiaId) {
    const fam = await dbGet(db, 'SELECT codigo FROM familias_material_almoxarifado WHERE id = ?', [familiaId]);
    if (!fam) throw erro('Família não encontrada', 404);
    const prefix = fam.codigo;
    const row = await dbGet(db, `SELECT MAX(CAST(substr(codigo, ?) AS INTEGER)) AS maxnum
      FROM materiais_almoxarifado
      WHERE familia_id = ? AND codigo LIKE ? AND codigo GLOB ?`,
      [prefix.length + 2, familiaId, `${prefix}-%`, `${prefix}-[0-9]*`]);
    const prox = Number(row?.maxnum || 0) + 1;
    return `${prefix}-${String(prox).padStart(3, '0')}`;
  }
  const row = await dbGet(db, `SELECT MAX(CAST(substr(codigo, 5) AS INTEGER)) AS maxnum
    FROM materiais_almoxarifado WHERE codigo GLOB 'ALM-[0-9]*'`);
  const prox = Number(row?.maxnum || 0) + 1;
  return `ALM-${String(prox).padStart(3, '0')}`;
}

/** Quantas vezes createMaterial regera o codigo quando `codigo_auto` esta ligado. */
const TENTATIVAS_CODIGO_AUTO = 5;

/**
 * Cria o material. Mesmos cinco passos do handler de onde ele saiu, na MESMA ORDEM:
 *   1. valida familia e subfamilia   2. resolve a localizacao padrao (id + rotulo)
 *   3. INSERT                         4. movimentacao de saldo inicial (so se quantidade > 0)
 *   5. sync da linha de saldo por localizacao, auditoria, e releitura enriquecida com a familia
 *
 * `data.codigo_auto` (Etapa 8c, decisao 6): quando verdadeiro, `data.codigo` e SUGESTAO. Colisao
 * UNIQUE regera pelo proximoCodigo da familia e tenta de novo, ate TENTATIVAS_CODIGO_AUTO. Sem a
 * flag, colisao continua sendo 400 'Código já existe' — identico ao de hoje, e o formulario de
 * cadastro manual nao muda: quem digitou o codigo quer saber que ele ja existe, nao ganhar outro.
 */
async function createMaterial(db, user, data) {
  const {
    codigo, nome, descricao, categoria, unidade,
    quantidade_atual, quantidade_minima, quantidade_maxima,
    custo_unitario, fornecedor_principal, codigo_fornecedor,
    ncm, especificacoes, observacoes,
    descricao_tecnica, categoria_id, subcategoria_id, localizacao_padrao_id,
    fornecedor_id, proprietario_cliente_id, tipo_material, material_critico, controle_lote,
    controle_certificado, familia_id, subfamilia_id,
    fabricante, codigo_fabricante, peso_unitario, dimensoes, material_construtivo,
    norma, marca, modelo, aplicacao, ponto_reposicao, lote_economico,
    controle_serie, controle_validade, controle_corrida, requer_inspecao, requer_foto,
    classe_abc, unidade_compra, fator_conversao_compra, unidade_consumo, fator_conversao_consumo,
    codigo_auto,
  } = data;

  try {
    await validateFamiliaAtiva(db, familia_id);
    await validateSubfamilia(db, subfamilia_id || null, familia_id);
  } catch (e) {
    throw erro(e.message, 400);
  }

  let locId; let locText;
  try {
    ({ locId, locText } = await resolveLocalizacaoFromFk(db, localizacao_padrao_id));
  } catch (e) {
    throw erro(e.message, 500);
  }

  const insertValues = {
    codigo, nome,
    descricao: descricao || null,
    categoria: categoria || 'OUTROS',
    unidade: unidade || 'UN',
    localizacao: locText,
    quantidade_atual: quantidade_atual || 0,
    quantidade_minima: quantidade_minima || 0,
    quantidade_maxima: quantidade_maxima || 0,
    custo_unitario: custo_unitario || 0,
    fornecedor_principal: fornecedor_principal || null,
    codigo_fornecedor: codigo_fornecedor || null,
    ncm: ncm || null,
    especificacoes: especificacoes || null,
    observacoes: observacoes || null,
    descricao_tecnica: descricao_tecnica || null,
    categoria_id: categoria_id ?? null,
    subcategoria_id: subcategoria_id ?? null,
    localizacao_padrao_id: locId,
    fornecedor_id: fornecedor_id ?? null,
    // Etapa 8: NULL = material nosso. O select da secao "Propriedade" manda '' quando ninguem e
    // escolhido; `|| null` normaliza para o unico valor que significa "nosso" — 0 e '' NAO
    // significam nada aqui (as leituras de estoque proprio testam IS NULL).
    proprietario_cliente_id: proprietario_cliente_id || null,
    tipo_material: tipo_material || null,
    material_critico: bool01(material_critico),
    controle_lote: bool01(controle_lote),
    controle_certificado: bool01(controle_certificado),
    familia_id,
    subfamilia_id: subfamilia_id ?? null,
    fabricante: fabricante || null,
    codigo_fabricante: codigo_fabricante || null,
    peso_unitario: peso_unitario ?? null,
    dimensoes: dimensoes || null,
    material_construtivo: material_construtivo || null,
    norma: norma || null,
    marca: marca || null,
    modelo: modelo || null,
    aplicacao: aplicacao || null,
    ponto_reposicao: ponto_reposicao ?? null,
    lote_economico: lote_economico ?? null,
    controle_serie: bool01(controle_serie),
    controle_validade: bool01(controle_validade),
    controle_corrida: bool01(controle_corrida),
    requer_inspecao: bool01(requer_inspecao),
    requer_foto: bool01(requer_foto),
    classe_abc: classe_abc || null,
    unidade_compra: unidade_compra || null,
    fator_conversao_compra: fator_conversao_compra ?? null,
    unidade_consumo: unidade_consumo || null,
    fator_conversao_consumo: fator_conversao_consumo ?? null,
  };
  const insertColumns = Object.keys(insertValues);

  let id = null;
  const tentativas = codigo_auto ? TENTATIVAS_CODIGO_AUTO : 1;
  for (let i = 0; i < tentativas && id === null; i += 1) {
    try {
      const result = await dbRun(db, `INSERT INTO materiais_almoxarifado
        (${insertColumns.join(', ')})
        VALUES (${insertColumns.map(() => '?').join(',')})`,
        insertColumns.map((c) => insertValues[c]));
      id = result.lastID;
    } catch (err) {
      if (!(err.message && err.message.includes('UNIQUE'))) throw erro(err.message, 500);
      // Regera SO quando a flag esta ligada, e SO se ainda ha tentativa pela frente. Sem ela, a
      // colisao e resposta ao usuario, nao acidente a contornar.
      if (codigo_auto && i + 1 < tentativas) insertValues.codigo = await proximoCodigo(db, familia_id);
    }
  }
  if (id === null) {
    throw erro(codigo_auto
      ? `Não foi possível gerar um código livre para a família após ${TENTATIVAS_CODIGO_AUTO} tentativas`
      : 'Código já existe', 400);
  }

  // Movimentacao inicial: SO com saldo. Gravar sempre sujaria o extrato de todo material
  // cadastrado sem saldo, e o extrato e a tela onde a Etapa 1 gastou uma etapa inteira.
  if ((quantidade_atual || 0) > 0) {
    await dbRun(db, `INSERT INTO movimentacoes_almoxarifado
      (material_id, tipo, quantidade, saldo_anterior, saldo_posterior, motivo, usuario_id, usuario_nome)
      VALUES (?, 'ENTRADA', ?, 0, ?, 'Saldo inicial de cadastro', ?, ?)`,
      [id, quantidade_atual, quantidade_atual, user.id, user.nome || user.email]);
  }

  await stockService.syncSaldoLocalizacaoPadrao(db, id).catch((e) => {
    console.warn('[almoxarifado] Falha ao sincronizar saldo por localização:', e.message);
  });

  await registrarAuditoria(db, {
    entidade: 'material', entidade_id: id, acao: 'CRIACAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { codigo: insertValues.codigo, nome, familia_id },
  });

  return dbGet(db, `SELECT m.*, f.nome as familia_nome, f.codigo as familia_codigo
    FROM materiais_almoxarifado m
    LEFT JOIN familias_material_almoxarifado f ON m.familia_id = f.id
    WHERE m.id = ?`, [id]);
}

module.exports = {
  bool01, validateFamiliaAtiva, validateSubfamilia, resolveLocalizacaoFromFk,
  proximoCodigo, createMaterial, TENTATIVAS_CODIGO_AUTO,
};
