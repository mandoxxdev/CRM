const { dbAll, dbGet } = require('./db');
const { disponivelSql, COLUNAS_RETENCAO } = require('./availabilitySql');
const { valorEstoqueSql, custoUnitarioSql } = require('./custoSql');
const { divergenciaRealSql } = require('./divergencia');
const { consumoJanelaSql, consumoJanelaParams } = require('./consumoSql');
const { TIPOS_SAIDA, TIPOS_DEVOLUCAO } = require('./movementTypes');
const { residualSemLote } = require('./lotService');

async function relatorioEstoqueAtual(db) {
  // Etapa 8, Task 1 (classe A): relatorio de posicao do estoque PROPRIO. valor_total somando
  // material de cliente contabilizaria patrimonio de terceiro como nosso. A posicao POR CLIENTE
  // tem tela e rota proprias (clienteEstoqueService, Task 8).
  return dbAll(db, `SELECT m.*,
    ${disponivelSql('m')} as disponivel,
    ${valorEstoqueSql('m')} as valor_total
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    ORDER BY m.categoria, m.nome`);
}

// ── Etapa 49 — relatórios de saldo ─────────────────────────────────────────────────────────
// As três chaves INCLUEM material de cliente (coluna Cliente): lote, série e retenção de material
// de cliente são justamente o que o almoxarife precisa ver. O que `relatorioEstoqueAtual` exclui é
// a VALORIZAÇÃO, e nenhuma destas valoriza (desenho da etapa, seção 6).
const CLIENTE_SQL = 'COALESCE(cl.nome_fantasia, cl.razao_social)';
const EPS_SALDO = 1e-9;

/**
 * RN-01 (corrigida na Fase 2): saldo ATRIBUÍDO por lote, mais a linha "Sem lote atribuído".
 * Os fluxos isentos de lote (entrega de requisição, AJUSTE absoluto, internos) gravam na linha
 * `lote_id NULL` de estoque_saldo — o saldo de um lote NÃO é o que está na prateleira. A invariante
 * que vale é a do material inteiro: Σ linhas = quantidade_atual. Por isso a linha residual
 * (`quantidade_atual − Σ lotes`, PODE ser negativa) e a coluna do físico total.
 */
async function relatorioSaldoPorLote(db) {
  const lotes = await dbAll(db, `SELECT m.id as material_id, m.codigo as material_codigo, m.nome as material_nome,
      ${CLIENTE_SQL} as cliente, m.quantidade_atual as fisico_material,
      l.id as lote_id, l.codigo as lote, l.data_validade as validade, l.status as status_lote,
      SUM(s.quantidade) as quantidade
    FROM estoque_saldo_almoxarifado s
    JOIN lotes_almoxarifado l ON l.id = s.lote_id
    JOIN materiais_almoxarifado m ON m.id = s.material_id
    LEFT JOIN clientes cl ON cl.id = m.proprietario_cliente_id
    WHERE m.ativo = 1
    GROUP BY s.material_id, l.id
    ORDER BY m.nome, l.codigo`);

  const porMaterial = new Map();
  for (const l of lotes) {
    if (!porMaterial.has(l.material_id)) porMaterial.set(l.material_id, { base: l, soma: 0, linhas: [] });
    const g = porMaterial.get(l.material_id);
    g.soma += Number(l.quantidade) || 0;
    // Fase 5 (I1): |saldo| e não saldo > 0 — com `permite_saldo_negativo` o motor deixa um lote
    // negativar de propósito, e escondê-lo enquanto ele entra na conta fazia a tela somar 10 com o
    // físico em 5. Só o lote EXATAMENTE zerado some.
    if (Math.abs(Number(l.quantidade) || 0) > EPS_SALDO) g.linhas.push(l);
  }

  // Fase 5 (I2): material com controle de lote que NUNCA teve lote (o legado que ganhou o controle
  // depois de já ter estoque) não tinha linha nenhuma — enquanto o de lote zerado aparecia com o
  // residual. Os dois estão no mesmo estado; entram os dois, com o físico inteiro sem lote.
  const semLoteNenhum = await dbAll(db, `SELECT m.id as material_id, m.codigo as material_codigo,
      m.nome as material_nome, ${CLIENTE_SQL} as cliente, m.quantidade_atual as fisico_material
    FROM materiais_almoxarifado m
    LEFT JOIN clientes cl ON cl.id = m.proprietario_cliente_id
    WHERE m.ativo = 1 AND m.controle_lote = 1 AND ABS(COALESCE(m.quantidade_atual, 0)) > ${EPS_SALDO}
      AND NOT EXISTS (SELECT 1 FROM estoque_saldo_almoxarifado s JOIN lotes_almoxarifado l ON l.id = s.lote_id
                      WHERE s.material_id = m.id)
    ORDER BY m.nome`);
  for (const m of semLoteNenhum) {
    porMaterial.set(m.material_id, { base: m, soma: 0, linhas: [] });
  }

  const saida = [];
  for (const { base, soma, linhas } of porMaterial.values()) {
    // Etapa 50: a conta do residuo e a da tela de Lotes (lotService.residualSemLote) - fonte unica.
    const semLote = residualSemLote(base.fisico_material, soma);
    for (const l of linhas) {
      saida.push({
        material_codigo: l.material_codigo, material_nome: l.material_nome, cliente: l.cliente,
        lote: l.lote, validade: l.validade, status_lote: l.status_lote,
        quantidade: l.quantidade, fisico_material: l.fisico_material,
      });
    }
    if (semLote !== 0) {
      saida.push({
        material_codigo: base.material_codigo, material_nome: base.material_nome, cliente: base.cliente,
        lote: 'Sem lote atribuído', validade: null, status_lote: null,
        quantidade: semLote, fisico_material: base.fisico_material,
      });
    }
  }
  return saida;
}

/** RN-02: uma linha por série PRESENTE — a lista de presentes é a do serviço de séries. */
async function relatorioSeriesEmEstoque(db) {
  const { STATUS_PRESENTES } = require('./seriesService');
  return dbAll(db, `SELECT m.codigo as material_codigo, m.nome as material_nome, ${CLIENTE_SQL} as cliente,
      s.numero, s.status, l.codigo as lote
    FROM series_almoxarifado s
    JOIN materiais_almoxarifado m ON m.id = s.material_id
    LEFT JOIN lotes_almoxarifado l ON l.id = s.lote_id
    LEFT JOIN clientes cl ON cl.id = m.proprietario_cliente_id
    WHERE s.status IN (${STATUS_PRESENTES.map(() => '?').join(',')})
    ORDER BY m.nome, s.numero`, STATUS_PRESENTES);
}

/**
 * RN-03: saldos comprometidos. Colunas e filtro montados de COLUNAS_RETENCAO (a mesma lista que
 * define o disponível) — e o registro tem um teste que exige `colunas ⊇ COLUNAS_RETENCAO`, porque
 * as colunas dele são estáticas (desenho, seção 6).
 */
async function relatorioSaldosComprometidos(db) {
  const retidas = COLUNAS_RETENCAO.map((c) => `COALESCE(m.${c},0) as ${c}`).join(', ');
  const algumaRetida = COLUNAS_RETENCAO.map((c) => `COALESCE(m.${c},0) > 0`).join(' OR ');
  return dbAll(db, `SELECT m.codigo as material_codigo, m.nome as material_nome, ${CLIENTE_SQL} as cliente,
      m.quantidade_atual as fisico, ${retidas}, ${disponivelSql('m')} as disponivel
    FROM materiais_almoxarifado m
    LEFT JOIN clientes cl ON cl.id = m.proprietario_cliente_id
    WHERE m.ativo = 1 AND (${algumaRetida})
    ORDER BY m.nome`);
}

async function relatorioAbaixoMinimo(db) {
  // Etapa 8, Task 1 (classe A): mesma semantica de reposicao do alertService — material de
  // cliente nao se repoe.
  return dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
      AND proprietario_cliente_id IS NULL
    ORDER BY (quantidade_atual / NULLIF(quantidade_minima, 0))`);
}

async function relatorioReservadoPorOS(db, osId) {
  let sql = `SELECT r.*, m.nome as material_nome, m.codigo as material_codigo, m.unidade
    FROM reservas_material_almoxarifado r
    JOIN materiais_almoxarifado m ON r.material_id = m.id
    WHERE r.status = 'ATIVA'`;
  const params = [];
  if (osId) { sql += ' AND (r.os_id = ? OR r.os_referencia = ?)'; params.push(osId, String(osId)); }
  sql += ' ORDER BY r.created_at DESC';
  return dbAll(db, sql, params);
}

async function relatorioConsumoPorOS(db, osId, dataInicio, dataFim) {
  let sql = `SELECT m.material_id, ma.nome, ma.codigo, SUM(m.quantidade) as total_consumido, m.os_id
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo IN ('SAIDA','SAIDA_PRODUCAO','SAIDA_MONTAGEM','SAIDA_ASSISTENCIA') AND m.cancelado = 0`;
  const params = [];
  if (osId) { sql += ' AND m.os_id = ?'; params.push(osId); }
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  sql += ' GROUP BY m.material_id, m.os_id ORDER BY total_consumido DESC';
  return dbAll(db, sql, params);
}

async function relatorioRecebimentosPendentes(db) {
  return dbAll(db, `SELECT * FROM recebimentos_material_almoxarifado
    WHERE status IN ('RECEBIDO','EM_CONFERENCIA','PARCIALMENTE_APROVADO') ORDER BY created_at`);
}

async function relatorioMateriaisBloqueados(db) {
  // Etapa 8, Task 1, classe C da auditoria: NAO filtra o dono de proposito. E relatorio de
  // QUALIDADE — material de cliente bloqueado e exatamente o que o almoxarife precisa ver, e
  // esconde-lo aqui apagaria fato fisico real. O selo de propriedade (Task 9) e o que evita a
  // confusao, nao o filtro. Nao "uniformizar" com relatorioEstoqueAtual logo acima.
  return dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND COALESCE(quantidade_bloqueada,0) > 0 ORDER BY nome`);
}

/**
 * Etapa 49 (RN-05): grupos de movimento para o filtro do histórico. O filtro `tipo` é EXATO sobre
 * texto livre — "entradas" são 8 tipos, e quem digitasse ENTRADA via só um deles. As listas vêm de
 * movementTypes (fonte única do motor); AJUSTE e TRANSFERENCIA não têm lista lá e são por nome.
 */
const GRUPOS_MOVIMENTO = {
  ENTRADA: { tipos: () => require('./movementTypes').TIPOS_ENTRADA },
  SAIDA: { tipos: () => TIPOS_SAIDA },
  DEVOLUCAO: { tipos: () => TIPOS_DEVOLUCAO },
  AJUSTE: { like: 'AJUSTE%' },
  TRANSFERENCIA: { tipos: () => ['TRANSFERENCIA'] },
};

/**
 * Etapa 67 (RN-05/RN-07): a regua UNICA do "numero de ajustes" — consumida pelo bloco `ajustes`
 * do `indicadores` e pela chave `ajustes-por-motivo` (T2), para os dois numeros nao divergirem.
 * Exige `movimentacoes_almoxarifado` com alias `mv` e JOIN em `materiais_almoxarifado` com
 * alias `m` (ou os aliases passados). O grupo e o mesmo AJUSTE do historico (`LIKE 'AJUSTE%'`:
 * AJUSTE, AJUSTE_POSITIVO, AJUSTE_NEGATIVO, AJUSTE_INVENTARIO); `cancelado = 0` tira a original
 * estornada e o ESTORNO nao casa o LIKE; material de cliente fora (D9); material INATIVADO conta
 * (e fato do livro — o numero nao pode cair ao inativar). A janela/periodo fica com quem chama.
 */
function ajustesWhereSql(mv = 'mv', m = 'm') {
  return `${mv}.cancelado = 0 AND ${mv}.tipo LIKE '${GRUPOS_MOVIMENTO.AJUSTE.like}'`
    + ` AND ${m}.proprietario_cliente_id IS NULL`;
}

/**
 * Etapa 67 (RN-04): requisicao VIVA para os blocos de requisicao do `indicadores` — nao excluida
 * (`ativo`, a correcao do C89) e fora dos status que nunca foram pedido valido.
 */
function REQUISICAO_VIVA_SQL(r = 'r') {
  return `COALESCE(${r}.ativo, 1) = 1 AND ${r}.status NOT IN ('RASCUNHO', 'CANCELADO', 'REJEITADO')`;
}

/** D12: percentual com 2 casas, ou null quando nao ha denominador (a tela mostra "—", nunca 0%). */
function percentualOuNull(parte, total) {
  return total > 0 ? Number((100 * parte / total).toFixed(2)) : null;
}

async function relatorioHistoricoMovimentacoes(db, filters = {}) {
  // Etapa 49 (RN-04): usuário e centro de custo — o mesmo JOIN da rota /movimentacoes, para a
  // coluna mostrar código e nome, e não o id.
  let sql = `SELECT m.*, ma.nome as material_nome, ma.codigo as material_codigo,
      CASE WHEN cc.id IS NULL THEN NULL ELSE cc.codigo || ' — ' || cc.nome END as centro_custo
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    LEFT JOIN centros_custo_almoxarifado cc ON m.centro_custo_id = cc.id
    WHERE m.cancelado = 0`;
  const params = [];
  if (filters.material_id) { sql += ' AND m.material_id = ?'; params.push(filters.material_id); }
  if (filters.tipo) { sql += ' AND m.tipo = ?'; params.push(filters.tipo); }
  if (filters.grupo) {
    const g = GRUPOS_MOVIMENTO[String(filters.grupo).toUpperCase()];
    if (!g) {
      throw Object.assign(new Error(
        `Grupo de movimento inválido: ${filters.grupo} (use ENTRADA, SAIDA, AJUSTE, DEVOLUCAO ou TRANSFERENCIA)`,
      ), { status: 400 });
    }
    if (g.like) { sql += ' AND m.tipo LIKE ?'; params.push(g.like); } else {
      const tipos = g.tipos();
      sql += ` AND m.tipo IN (${tipos.map(() => '?').join(',')})`;
      params.push(...tipos);
    }
  }
  if (filters.usuario) {
    // ESCAPE: % e _ digitados valem como texto, não como curinga.
    const termo = String(filters.usuario).replace(/[\\%_]/g, (c) => `\\${c}`);
    sql += " AND m.usuario_nome LIKE ? ESCAPE '\\'";
    params.push(`%${termo}%`);
  }
  if (filters.centro_custo_id) { sql += ' AND m.centro_custo_id = ?'; params.push(filters.centro_custo_id); }
  // Etapa 66 (T3): filtro pelo id do cadastro, nunca pelo nome — o texto livre com o mesmo nome
  // nao entra, e renomear o motivo nao tira as linhas antigas do filtro. Vazio = sem filtro.
  const motivoBruto = filters.motivo_id;
  if (motivoBruto !== undefined && motivoBruto !== null && String(motivoBruto).trim() !== '') {
    if (!/^\d+$/.test(String(motivoBruto).trim()) || Number(motivoBruto) <= 0) {
      throw Object.assign(new Error('Parâmetro "motivo_id" deve ser um número inteiro positivo'), { status: 400 });
    }
    sql += ' AND m.motivo_id = ?';
    params.push(Number(motivoBruto));
  }
  if (filters.data_inicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(filters.data_inicio); }
  if (filters.data_fim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(filters.data_fim); }
  sql += ' ORDER BY m.created_at DESC LIMIT 500';
  return dbAll(db, sql, params);
}

/**
 * Etapa 67 (T2, RN-06/RN-07): "Ajustes por motivo" — quantos lancamentos de ajuste por motivo,
 * pela MESMA regua do bloco `ajustes` do `indicadores` (`ajustesWhereSql`): grupo AJUSTE do
 * historico, sem os estornados, sem material de cliente, com material inativado.
 *
 * Tres baldes, nesta ordem de decisao:
 *   - `motivo_id` preenchido -> origem 'Cadastro', agrupado pelo ID e mostrado pelo nome ATUAL do
 *     cadastro (+ ' (desativado)'): renomear junta as linhas antigas. O livro (`mv.motivo`) guarda
 *     o nome do momento e continua assim — por isso o nome vem do JOIN, nunca de `mv.motivo`;
 *   - AJUSTE_INVENTARIO -> origem 'Inventário' (o cadastro nao serve a tipo dedicado);
 *   - o resto -> origem 'Texto livre', motivo 'Sem motivo do cadastro', mesmo que o texto digitado
 *     seja igual ao nome de um motivo (agrupar por texto juntaria coisas que o cadastro separa).
 * Conta LANCAMENTOS e materiais distintos, nunca soma quantidade (unidades diferentes; o AJUSTE
 * grava o saldo final). Datas pelo DIA (UTC), sem validacao — mesmo molde do historico (data
 * invalida devolve vazio). Sem CTE: a varredura do registro so captura SELECT.
 */
async function relatorioAjustesPorMotivo(db, filters = {}) {
  const params = [];
  let filtro = '';
  const materialBruto = filters.material_id;
  if (materialBruto !== undefined && materialBruto !== null && String(materialBruto).trim() !== '') {
    if (!/^\d+$/.test(String(materialBruto).trim()) || Number(materialBruto) <= 0) {
      throw Object.assign(new Error('Parâmetro "material_id" deve ser um número inteiro positivo'), { status: 400 });
    }
    filtro += ' AND mv.material_id = ?';
    params.push(Number(materialBruto));
  }
  if (filters.data_inicio) { filtro += ' AND DATE(mv.created_at) >= ?'; params.push(filters.data_inicio); }
  if (filters.data_fim) { filtro += ' AND DATE(mv.created_at) <= ?'; params.push(filters.data_fim); }
  const rows = await dbAll(db, `
    SELECT
      CASE WHEN mv.motivo_id IS NOT NULL THEN 'Cadastro'
           WHEN mv.tipo = 'AJUSTE_INVENTARIO' THEN 'Inventário'
           ELSE 'Texto livre' END AS origem,
      mv.motivo_id AS motivo_id,
      CASE WHEN mv.motivo_id IS NOT NULL
             THEN COALESCE(mm.nome, 'Motivo #' || mv.motivo_id)
                  || CASE WHEN COALESCE(mm.ativo, 1) = 0 THEN ' (desativado)' ELSE '' END
           WHEN mv.tipo = 'AJUSTE_INVENTARIO' THEN 'Ajuste de conferência de inventário'
           ELSE 'Sem motivo do cadastro' END AS motivo,
      COUNT(*) AS ajustes,
      COUNT(DISTINCT mv.material_id) AS materiais,
      MAX(mv.created_at) AS ultimo_em
    FROM movimentacoes_almoxarifado mv
    JOIN materiais_almoxarifado m ON m.id = mv.material_id
    LEFT JOIN motivos_movimentacao_almoxarifado mm ON mm.id = mv.motivo_id
    WHERE ${ajustesWhereSql('mv', 'm')}${filtro}
    GROUP BY 1, 2, 3
    ORDER BY ajustes DESC, motivo`, params);
  return rows.map((r) => ({ ...r, ajustes: Number(r.ajustes) || 0, materiais: Number(r.materiais) || 0 }));
}

/**
 * Etapa 67 (T3): CNPJ sem pontuacao (ponto, barra, hifen, espaco) e em maiusculas — nao "so
 * digitos": o CNPJ alfanumerico (2026) tem letras, e o SQLite nao tem regex para tirar o resto.
 */
function cnpjNormalizadoSql(r = 'r') {
  return `UPPER(REPLACE(REPLACE(REPLACE(REPLACE(TRIM(COALESCE(${r}.fornecedor_cnpj, '')), '.', ''), '/', ''), '-', ''), ' ', ''))`;
}

/**
 * Etapa 67 (T3, D8 revisto na Fase 2): a CHAVE do fornecedor no recebimento — CNPJ normalizado,
 * senao `fornecedor_id`, senao o nome digitado (trim + espacos duplos colapsados + lower, que no
 * SQLite so dobra ASCII), senao "sem". O CNPJ vem primeiro porque o pedido grava `fornecedor_id` e a
 * NF avulsa so nome + CNPJ — pelo id, o mesmo fornecedor sairia em duas linhas. Le o SNAPSHOT do
 * recebimento, sem JOIN no cadastro core (o harness e uma base sem Compras nao tem o mesmo dado).
 */
function chaveFornecedorSql(r = 'r') {
  const cnpj = cnpjNormalizadoSql(r);
  return `CASE WHEN ${cnpj} <> '' THEN 'cnpj:' || ${cnpj}
    WHEN ${r}.fornecedor_id IS NOT NULL THEN 'id:' || ${r}.fornecedor_id
    WHEN TRIM(COALESCE(${r}.fornecedor_nome, '')) <> ''
      THEN 'nome:' || LOWER(REPLACE(REPLACE(TRIM(${r}.fornecedor_nome), '  ', ' '), '  ', ' '))
    ELSE 'sem' END`;
}

/**
 * Etapa 67 (T3, RN-08/RN-09/RN-10, D6-D9): "Qualidade por fornecedor" — divergencia de recebimento
 * e indice de rejeicao, uma linha por fornecedor (chaveFornecedorSql), periodo pelo DIA de
 * `r.data_recebimento` (UTC; data invalida devolve vazio, como o historico).
 *
 * CONFERIDO = o recebimento teve a conferencia FINALIZADA (auditoria FINALIZAR_CONFERENCIA, que so
 * o gesto "Finalizar Conferencia" do workflow escreve) e o item tem quantidade recebida. Fase 2,
 * critico 2, medido na T3: todo item NASCE com `quantidade_recebida` (o INSERT grava
 * o informado ou a esperada — desde a Etapa 70 T0 o 0 informado fica 0, antes o `|| qtd` o
 * trocava pela esperada); `conferencia_quantidade` nao serve porque a tela grava
 * `recebida === esperada` (o divergente fica 0, igual ao default); status >= CONFERIDO_ALMOX nao
 * serve porque o /aprovar e o `encaminhar_compras` saem de RECEBIDO pulando a conferencia.
 *
 * Divergencia: a MESMA regua do alerta DIVERGENCIA_RECEBIMENTO (divergenciaRealSql, ε 1e-9) sobre
 * o estado ATUAL do item, uma vez por item — as NCs de quantidade (varias por item ao longo do
 * tempo) nao somam. Esperada = a gravada no item: no recebimento de pedido e o SALDO da linha, entao
 * entrega parcial combinada conta como falta (declarado na nota). Rejeicao: inspecoes decididas
 * (com quantidade) e as com reprovada > ε — contadas por SUBCONSULTA por item, nunca JOIN item x
 * inspecao na agregacao (RN-10: o item com duas inspecoes contaria duas vezes nos itens). NC,
 * devolucao ao fornecedor e status REPROVADO do recebimento nao entram (D7). Material de cliente
 * fora (D9): recebimento so de material de cliente nao gera linha (M-2).
 *
 * Toda coluna sai do SQL (a varredura do registro mede por TEMP VIEW): percentuais com
 * ROUND(100.0 * x / NULLIF(y, 0), 2) — NULL sem denominador (D12). Sem CTE (a varredura so captura
 * SELECT). O nome exibido e o do recebimento mais recente do grupo: MAX sobre um carimbo de
 * largura fixa (data + id) concatenado ao nome, recortado depois.
 */
async function relatorioQualidadeFornecedores(db, filters = {}) {
  const params = [];
  let filtro = '';
  if (filters.data_inicio) { filtro += ' AND DATE(r.data_recebimento) >= ?'; params.push(filters.data_inicio); }
  if (filters.data_fim) { filtro += ' AND DATE(r.data_recebimento) <= ?'; params.push(filters.data_fim); }
  const cnpj = cnpjNormalizadoSql('r');
  const rows = await dbAll(db, `
    SELECT
      SUBSTR(MAX(x.carimbo || x.nome_exibido), 32) AS fornecedor,
      SUBSTR(MAX(x.carimbo || x.agrupamento), 32) AS agrupado_por,
      COUNT(DISTINCT x.recebimento_id) AS recebimentos,
      SUM(x.conferido) AS itens_conferidos,
      SUM(x.conferido * x.divergente) AS itens_divergentes,
      SUM(x.conferido * x.falta) AS itens_com_falta,
      SUM(x.conferido * x.sobra) AS itens_com_sobra,
      ROUND(100.0 * SUM(x.conferido * x.divergente) / NULLIF(SUM(x.conferido), 0), 2) AS percentual_divergencia,
      SUM(x.inspecoes) AS inspecoes,
      SUM(x.inspecoes_com_reprovacao) AS inspecoes_com_reprovacao,
      ROUND(100.0 * SUM(x.inspecoes_com_reprovacao) / NULLIF(SUM(x.inspecoes), 0), 2) AS indice_rejeicao
    FROM (
      SELECT
        ${chaveFornecedorSql('r')} AS chave,
        printf('%-19.19s%012d', COALESCE(r.data_recebimento, ''), r.id) AS carimbo,
        COALESCE(NULLIF(TRIM(r.fornecedor_nome), ''),
          CASE WHEN ${cnpj} <> '' THEN 'CNPJ ' || ${cnpj}
               WHEN r.fornecedor_id IS NOT NULL THEN 'Fornecedor #' || r.fornecedor_id
               ELSE 'Sem fornecedor' END) AS nome_exibido,
        -- Fase 5 (C): a chave da linha em texto legivel. Tres linhas "ACME" (CNPJ / cadastro sem
        -- CNPJ / nome digitado) eram indistinguiveis. O CNPJ sai como veio (o do mais recente).
        CASE WHEN ${cnpj} <> '' THEN 'CNPJ ' || TRIM(r.fornecedor_cnpj)
             WHEN r.fornecedor_id IS NOT NULL THEN 'Cadastro #' || r.fornecedor_id
             WHEN TRIM(COALESCE(r.fornecedor_nome, '')) <> '' THEN 'Nome digitado'
             ELSE 'Sem CNPJ, cadastro ou nome' END AS agrupamento,
        ri.recebimento_id AS recebimento_id,
        CASE WHEN ri.quantidade_recebida IS NOT NULL AND EXISTS (
               SELECT 1 FROM auditoria_log_almoxarifado a
               WHERE a.entidade = 'recebimento' AND a.entidade_id = r.id AND a.acao = 'FINALIZAR_CONFERENCIA')
             THEN 1 ELSE 0 END AS conferido,
        CASE WHEN ri.quantidade_recebida IS NOT NULL
               AND ${divergenciaRealSql('ri.quantidade_recebida - ri.quantidade_esperada')} THEN 1 ELSE 0 END AS divergente,
        CASE WHEN ri.quantidade_recebida - ri.quantidade_esperada < -${EPS_SALDO} THEN 1 ELSE 0 END AS falta,
        CASE WHEN ri.quantidade_recebida - ri.quantidade_esperada > ${EPS_SALDO} THEN 1 ELSE 0 END AS sobra,
        (SELECT COUNT(*) FROM inspecoes_recebimento_almoxarifado i
          WHERE i.recebimento_item_id = ri.id
            AND (i.quantidade_aprovada IS NOT NULL OR i.quantidade_reprovada IS NOT NULL)) AS inspecoes,
        (SELECT COUNT(*) FROM inspecoes_recebimento_almoxarifado i
          WHERE i.recebimento_item_id = ri.id AND i.quantidade_reprovada > ${EPS_SALDO}) AS inspecoes_com_reprovacao
      FROM recebimentos_material_itens_almoxarifado ri
      JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
      JOIN materiais_almoxarifado m ON m.id = ri.material_id
      WHERE m.proprietario_cliente_id IS NULL${filtro}
    ) x
    GROUP BY x.chave
    ORDER BY fornecedor, x.chave`, params);
  const n = (v) => Number(v) || 0;
  return rows.map((r) => ({
    fornecedor: r.fornecedor,
    agrupado_por: r.agrupado_por,
    recebimentos: n(r.recebimentos),
    itens_conferidos: n(r.itens_conferidos),
    itens_divergentes: n(r.itens_divergentes),
    itens_com_falta: n(r.itens_com_falta),
    itens_com_sobra: n(r.itens_com_sobra),
    percentual_divergencia: r.percentual_divergencia === null ? null : Number(r.percentual_divergencia),
    inspecoes: n(r.inspecoes),
    inspecoes_com_reprovacao: n(r.inspecoes_com_reprovacao),
    indice_rejeicao: r.indice_rejeicao === null ? null : Number(r.indice_rejeicao),
  }));
}

// Revisao final da Etapa 10b: (1) so conferencia CONCLUIDO — sem o filtro, este relatorio
// vazava quantidade_sistema/divergencia/contado_por de contagem EM ANDAMENTO e desfazia o modo
// cego e a dupla contagem por fora (relatorio de divergencia sobre contagem inacabada nem faz
// sentido); (2) a comparacao exata `!= 0` era uma SEGUNDA definicao de "e divergencia" —
// deriva de float (7e-16) aparecia aqui como divergente enquanto a acuracidade dizia 100%.
// A definicao unica mora em divergencia.js.
async function relatorioInventarioDivergencias(db) {
  return dbAll(db, `SELECT ic.*, c.numero as conferencia_numero, ma.nome as material_nome, ma.codigo
    FROM itens_conferencia_almoxarifado ic
    JOIN conferencias_almoxarifado c ON ic.conferencia_id = c.id
    JOIN materiais_almoxarifado ma ON ic.material_id = ma.id
    WHERE c.status = 'CONCLUIDO' AND ic.divergencia IS NOT NULL AND ${divergenciaRealSql('ic.divergencia')}
    ORDER BY c.created_at DESC LIMIT 500`);
}

async function relatorioMateriaisMaisConsumidos(db, dataInicio, dataFim) {
  let sql = `SELECT ma.id as material_id, ma.nome, ma.codigo, ma.unidade, SUM(m.quantidade) as total_consumido
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo IN ('SAIDA','SAIDA_PRODUCAO','SAIDA_MONTAGEM','SAIDA_ASSISTENCIA') AND m.cancelado = 0`;
  const params = [];
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  sql += ' GROUP BY ma.id ORDER BY total_consumido DESC LIMIT 10';
  return dbAll(db, sql, params);
}

async function relatorioConsumoPeriodo(db, dataInicio, dataFim, projetoId, clienteId) {
  let sql = `SELECT ma.categoria, ma.nome, SUM(m.quantidade) as total, m.projeto_id, m.cliente_id
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON m.material_id = ma.id
    WHERE m.tipo LIKE 'SAIDA%' AND m.cancelado = 0`;
  const params = [];
  if (dataInicio) { sql += ' AND DATE(m.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(m.created_at) <= ?'; params.push(dataFim); }
  if (projetoId) { sql += ' AND m.projeto_id = ?'; params.push(projetoId); }
  if (clienteId) { sql += ' AND m.cliente_id = ?'; params.push(clienteId); }
  sql += ' GROUP BY ma.id, m.projeto_id, m.cliente_id ORDER BY total DESC';
  return dbAll(db, sql, params);
}

async function relatorioFerramentasEmprestadas(db) {
  return dbAll(db, `SELECT e.*, f.nome, f.codigo_patrimonio FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id
    WHERE e.status = 'EMPRESTADA' ORDER BY e.data_retirada`);
}

async function relatorioEPIPorColaborador(db) {
  return dbAll(db, `SELECT e.colaborador_nome, e.setor, f.nome as ferramenta, e.data_retirada
    FROM emprestimos_ferramenta_almoxarifado e
    JOIN ferramentas_almoxarifado f ON e.ferramenta_id = f.id
    WHERE f.tipo = 'EPI' AND e.status = 'EMPRESTADA'`);
}

// Nome ficou historico (Etapa 11, Task 2): ate a Etapa 11 so trazia PENDENTE. A aba
// Solicitacoes da tela nova de reposicao le este mesmo relatorio, e a VINCULADA e EXATAMENTE a
// que esconde o material da sugestao (a_caminho conta as duas, RN-03) — so trazer PENDENTE
// deixava a solicitacao vinculada invisivel na tela inteira (Fase 2). Renomear tocaria o
// dispatcher de relatorios (routes/almoxarifado/extended.js) a toa; o nome ficou desatualizado
// de proposito.
//
// Etapa 72, T3 (RN-10): com a T1 a VINCULADO nao fecha mais na nota parcial, entao a aba precisa
// dizer quanto ja chegou. Cada linha ganha tres campos ADITIVOS, lidos da FONTE UNICA por
// solicitacao (`purchaseService.posicaoDasSolicitacoes`, a mesma que a sugestao soma) — nunca uma
// terceira conta aqui: `quantidade - recebido do par` por linha diverge da sugestao quando ha duas
// solicitacoes no mesmo par (tests/api/relatorioSolicitacoesChegou.api.test.js, teste 2).
//   - recebido_no_pedido = recebido_atribuido (o que o LIVRO de atribuicao deu a esta solicitacao,
//     Fase 5; ate ela era o recebido do par rateado em ordem de id; null em PENDENTE ou par sem
//     linha). Nao e o recebido do par inteiro (Fase 2 do plano da 72);
//   - a_caminho, pedido_encerrado: como a fonte devolve.
// Export e tela de Relatorios nao mudam: projetam `colunas` do reportRegistry (declarado no plano).
// require tardio: purchaseService nao importa este arquivo hoje, mas o par de services nao deve
// virar ciclo por acidente.
async function relatorioSolicitacoesCompraPendentes(db) {
  const linhas = await dbAll(db, `SELECT s.*, m.nome as material_nome, m.codigo as material_codigo
    FROM solicitacoes_compra_almoxarifado s
    JOIN materiais_almoxarifado m ON s.material_id = m.id
    WHERE s.status IN ('PENDENTE','VINCULADO') ORDER BY s.created_at`);
  if (!linhas.length) return linhas;
  const { posicaoDasSolicitacoes } = require('./purchaseService');
  const posicoes = new Map((await posicaoDasSolicitacoes(db, { solicitacao_ids: linhas.map((l) => l.id) }))
    .map((p) => [p.solicitacao_id, p]));
  return linhas.map((l) => {
    const p = posicoes.get(l.id);
    return {
      ...l,
      recebido_no_pedido: p ? p.recebido_atribuido : null,
      a_caminho: p ? p.a_caminho : null,
      pedido_encerrado: p ? p.pedido_encerrado : false,
    };
  });
}

/**
 * Relatorio financeiro de sucata (Etapa 9, Task 7 — consumidor declarado da spec 12).
 *
 * ── POR QUE ELE LE O LIVRO, E NAO SO `sucateamentos_almoxarifado` ────────────────────────────
 *
 * `sucateamentos_almoxarifado` (Task 6) so tem as sucatas do processo NOVO de dupla aprovacao.
 * Mas ha outra origem: a devolucao ao cliente com destino SUCATA (returnService.registrarDevolucao,
 * Etapa 7) TAMBEM emite uma linha `SUCATA` em `movimentacoes_almoxarifado` — o material ja tinha
 * saido fisicamente na entrega, entao a devolucao nao passa (nem precisa passar) pelas duas
 * assinaturas. Ela e sucata tao real quanto a outra, e um relatorio financeiro que so somasse
 * `sucateamentos_almoxarifado` subcontaria o total. Por isso a fonte de `movimentacoes` aqui e o
 * LIVRO (`tipo = 'SUCATA' AND cancelado = 0`), e o LEFT JOIN com `sucateamentos_almoxarifado` (por
 * `movimentacao_sucata_id`) so serve para trazer a `classificacao` QUANDO ela existe — a devolucao
 * nao tem esse campo, e fica `null` (agrupada como "SEM CLASSIFICACAO" abaixo).
 *
 * ── VALORACAO: custo ATUAL, nao historico (decisao 10 da 8c, deliberada) ────────────────────
 *
 * `valor_estimado = quantidade * custoUnitarioSql('ma')` — FONTE UNICA do custo unitario
 * (custoSql.js; `tests/api/custoUnitarioFonteUnica.api.test.js` varre o codigo-fonte atras de
 * quem reescrever essa conta a mao). A movimentacao NAO guarda o custo de quando saiu, entao o
 * valor reportado e sempre pelo custo de HOJE — se o custo do material mudou desde a baixa, o
 * relatorio de um periodo passado muda junto. A `nota` no retorno existe para a tela nao deixar
 * isso implicito.
 *
 * `vendas` (sucateamentos VENDIDA, `valor_venda` somado) e o valor FINANCEIRO real, declarado por
 * quem assinou a aprovacao — nao estimado. As duas somas nao sao a mesma pergunta: uma e "quanto
 * valia pelo custo de hoje", a outra e "quanto realmente entrou".
 */
async function relatorioSucataFinanceiro(db, { de, ate } = {}) {
  let sqlMov = `SELECT m.id, m.material_id, ma.codigo AS material_codigo, ma.nome AS material_nome,
      ma.unidade, m.quantidade, m.created_at, m.referencia, s.classificacao,
      (m.quantidade * ${custoUnitarioSql('ma')}) AS valor_estimado
    FROM movimentacoes_almoxarifado m
    JOIN materiais_almoxarifado ma ON ma.id = m.material_id
    LEFT JOIN sucateamentos_almoxarifado s ON s.movimentacao_sucata_id = m.id
    WHERE m.tipo = 'SUCATA' AND m.cancelado = 0`;
  const paramsMov = [];
  if (de) { sqlMov += ' AND DATE(m.created_at) >= ?'; paramsMov.push(de); }
  if (ate) { sqlMov += ' AND DATE(m.created_at) <= ?'; paramsMov.push(ate); }
  sqlMov += ' ORDER BY m.created_at DESC';
  const movimentacoes = await dbAll(db, sqlMov, paramsMov);

  let sqlVendas = `SELECT s.id, s.material_id, ma.codigo AS material_codigo, ma.nome AS material_nome,
      s.quantidade, s.valor_venda, s.classificacao, s.destino_registrado_em
    FROM sucateamentos_almoxarifado s
    JOIN materiais_almoxarifado ma ON ma.id = s.material_id
    WHERE s.status = 'VENDIDA'`;
  const paramsVendas = [];
  if (de) { sqlVendas += ' AND DATE(s.destino_registrado_em) >= ?'; paramsVendas.push(de); }
  if (ate) { sqlVendas += ' AND DATE(s.destino_registrado_em) <= ?'; paramsVendas.push(ate); }
  sqlVendas += ' ORDER BY s.destino_registrado_em DESC';
  const vendas = await dbAll(db, sqlVendas, paramsVendas);

  // Agrupamento por classificacao — feito em JS, nao em SQL: e a soma de DUAS consultas
  // independentes (movimentacoes e vendas), e um GROUP BY so enxergaria uma das duas.
  const porClassificacao = new Map();
  const bucket = (classificacao) => {
    const chave = classificacao || 'SEM CLASSIFICACAO';
    if (!porClassificacao.has(chave)) {
      porClassificacao.set(chave, {
        classificacao: chave, quantidade: 0, valor_estimado: 0, valor_vendido: 0,
      });
    }
    return porClassificacao.get(chave);
  };

  let quantidadeTotal = 0;
  let valorEstimadoTotal = 0;
  for (const m of movimentacoes) {
    quantidadeTotal += Number(m.quantidade) || 0;
    valorEstimadoTotal += Number(m.valor_estimado) || 0;
    const b = bucket(m.classificacao);
    b.quantidade += Number(m.quantidade) || 0;
    b.valor_estimado += Number(m.valor_estimado) || 0;
  }
  let valorVendidoTotal = 0;
  for (const v of vendas) {
    valorVendidoTotal += Number(v.valor_venda) || 0;
    bucket(v.classificacao).valor_vendido += Number(v.valor_venda) || 0;
  }

  return {
    periodo: { de: de || null, ate: ate || null },
    movimentacoes,
    vendas,
    totais: {
      quantidade_sucateada: quantidadeTotal,
      valor_estimado_total: valorEstimadoTotal,
      valor_vendido_total: valorVendidoTotal,
    },
    por_classificacao: Array.from(porClassificacao.values()),
    nota: 'Valor estimado calculado pelo custo ATUAL do material (custoUnitarioSql) — a movimentacao '
      + 'nao guarda custo historico, entao a valoracao nao reflete necessariamente o custo de quando '
      + 'o material saiu (decisao 10 da 8c). O valor vendido, esse sim, e o declarado na aprovacao.',
  };
}

// Local, no mesmo padrao de purchaseService.lerConfigNumero (Etapa 11) — mesma chave
// ('reposicao_janela_consumo_dias'), nao uma config nova (Global Constraints da Etapa 13: a
// janela vem por querystring, sem amarracao nova em configuracoesGerais.api.test.js).
async function lerJanelaPadrao(db) {
  const row = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'reposicao_janela_consumo_dias'");
  const n = parseFloat(row?.valor);
  // Assimetria DECLARADA (revisao da Task 2, minor): a querystring exige inteiro >= 1 (400
  // literal), este parseFloat aceita '1.5' — mas o PUT /configuracoes valida a chave como
  // inteiro (PREFIXOS_DIAS da Etapa 11), entao um decimal aqui so entra por UPDATE manual no
  // banco. Mesmo parseFloat do lerConfigNumero da E11, de proposito (uma regua de leitura so).
  return Number.isFinite(n) && n > 0 ? n : 90;
}

/** Mediana de uma lista de numeros. Lista vazia -> 0 (nao ha material com consumo na janela). */
function mediana(valores) {
  if (!valores.length) return 0;
  const ordenado = [...valores].sort((a, b) => a - b);
  const meio = Math.floor(ordenado.length / 2);
  return ordenado.length % 2 !== 0 ? ordenado[meio] : (ordenado[meio - 1] + ordenado[meio]) / 2;
}

/**
 * RN-04 (Etapa 13, Task 2): indicadores gerenciais medidos pelas fontes UNICAS do modulo —
 * `custoUnitarioSql`/`valorEstoqueSql` (custo, custoSql.js), `TIPOS_SAIDA` (consumo,
 * movementTypes.js) e `consumoJanelaSql` (consumo POR MATERIAL numa janela — o mesmo fragmento
 * que `purchaseService.calcularSugestoes` usa desde a Etapa 11, extraido para `consumoSql.js`
 * nesta task, Global Constraints/C4). Material de cliente (`proprietario_cliente_id IS NOT
 * NULL`) fica FORA de giro/cobertura/rupturas/valor_por_grupo — nao e patrimonio nosso (D4/RN-04
 * do design). `m.ativo = 1` em todas as consultas por materiail: giro/cobertura/rupturas/valor
 * comparam contra o estoque ATUAL, que so faz sentido para material ativo (mesmo criterio de
 * `relatorioEstoqueAtual`).
 */
async function relatorioIndicadores(db, query = {}) {
  const bruto = query.janela_dias;
  let janela;
  if (bruto === undefined || bruto === null || bruto === '') {
    janela = await lerJanelaPadrao(db);
  } else {
    const n = Number(bruto);
    if (!Number.isInteger(n) || n <= 0) {
      throw Object.assign(new Error('Parâmetro "janela_dias" deve ser um número inteiro maior que zero'), { status: 400 });
    }
    janela = n;
  }

  const phSaida = TIPOS_SAIDA.map(() => '?').join(',');

  // ── Giro (aproximado, D4): valor consumido (TIPOS_SAIDA, na janela) / valor do estoque ──
  // ATUAL (nao ha snapshot historico — usar o valor atual como denominador e aproximacao
  // honesta, escrita na `nota` do registro). Custo SEMPRE via custoUnitarioSql (fonte unica) —
  // `SUM(qtd * m.custo_unitario)` a mao NAO seria pego pela varredura (Global Constraints, I2).
  const giroConsumido = await dbGet(db, `
    SELECT COALESCE(SUM(mv.quantidade * ${custoUnitarioSql('m')}), 0) AS valor
    FROM movimentacoes_almoxarifado mv
    JOIN materiais_almoxarifado m ON m.id = mv.material_id
    WHERE mv.cancelado = 0 AND mv.tipo IN (${phSaida})
      AND mv.created_at >= datetime('now', '-' || ? || ' days')
      AND m.ativo = 1 AND m.proprietario_cliente_id IS NULL`,
    [...TIPOS_SAIDA, janela]);
  const giroEstoque = await dbGet(db, `
    SELECT COALESCE(SUM(${valorEstoqueSql('m')}), 0) AS valor
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL`);
  const valorConsumido = Number(giroConsumido.valor) || 0;
  const valorEstoqueAtual = Number(giroEstoque.valor) || 0;
  // Arredondado (I8, medido): asserts exatos contra o arredondado; os dois operandos ficam no
  // payload SEM arredondar (comparados por Math.abs(a-b) < 1e-9 pelos consumidores).
  const indice = valorEstoqueAtual > 0 ? Number((valorConsumido / valorEstoqueAtual).toFixed(2)) : 0;

  // ── Cobertura (dias): disponivel / consumo medio diario da janela, POR MATERIAL — a MESMA ──
  // regua de consumo da Etapa 11 (consumoJanelaSql/TIPOS_SAIDA). Agregado por MEDIANA: media
  // seria distorcida por material sem consumo (cobertura "infinita"); material sem consumo na
  // janela fica FORA da mediana, contado a parte em `materiais_sem_consumo`.
  const coberturaRows = await dbAll(db, `
    SELECT ${disponivelSql('m')} AS disponivel, ${consumoJanelaSql('m')} AS consumo_janela
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL`,
    consumoJanelaParams(janela));
  const coberturas = [];
  let materiaisSemConsumo = 0;
  for (const r of coberturaRows) {
    const consumoJanela = Number(r.consumo_janela) || 0;
    if (consumoJanela > 0) {
      const diario = consumoJanela / janela;
      coberturas.push(Number(r.disponivel) / diario);
    } else {
      materiaisSemConsumo += 1;
    }
  }
  const medianaDias = Number(mediana(coberturas).toFixed(2));

  // ── Rupturas (regua CORRIGIDA, Fase 2/C5): saldo FISICO <= 0 causado por um EVENTO de tipo ──
  // em TIPOS_SAIDA ou AJUSTE_INVENTARIO. Tipos NEUTROS (LIBERACAO_RESERVA, BLOQUEIO, RESERVA...)
  // gravam `saldo_posterior = saldo_anterior` (stockService.js) — sem este filtro de tipo, um
  // material ja zerado atribuiria a 1a ruptura a um lancamento burocratico (medido). DECLARADO:
  // a regua olha o FISICO, nao o disponivel — material 100% reservado (disponivel 0) sem evento
  // de saida/ajuste na janela NAO aparece (contagem de EVENTO, nao de ESTADO); AJUSTE_INVENTARIO
  // que zera por contagem fisica CONTA, por decisao.
  const rupturasRows = await dbAll(db, `
    SELECT m.codigo, m.nome, MIN(mv.created_at) AS data
    FROM movimentacoes_almoxarifado mv
    JOIN materiais_almoxarifado m ON m.id = mv.material_id
    WHERE mv.cancelado = 0 AND mv.saldo_posterior <= 0
      AND mv.tipo IN (${phSaida}, ?)
      AND mv.created_at >= datetime('now', '-' || ? || ' days')
      AND m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    GROUP BY m.id
    ORDER BY data ASC`,
    [...TIPOS_SAIDA, 'AJUSTE_INVENTARIO', janela]);

  // ── Valor do estoque por grupo: valorEstoqueSql agrupado por categoria, so materiais ──
  // PROPRIOS (nao e patrimonio nosso valorar o do cliente).
  const valorPorGrupoRows = await dbAll(db, `
    SELECT COALESCE(m.categoria, 'Sem categoria') AS categoria,
           COALESCE(SUM(${valorEstoqueSql('m')}), 0) AS valor
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL
    GROUP BY COALESCE(m.categoria, 'Sem categoria')
    ORDER BY categoria`);

  // ── Atendimento de requisicoes (I7, medido): so ENTREGA COMPLETA — `data_entrega` tem UM ──
  // escritor (requisitionService.js:376) e so grava na entrega COMPLETA (parcial/encerrada sem
  // completar ficam fora). `total_consideradas` tem de vir do MESMO WHERE que filtra
  // data_entrega: um COUNT(*) fora desse WHERE contaria requisicao nao entregue (medido 3 vs 2)
  // enquanto o AVG (que ja ignora NULL sozinho) continuaria certo — os dois numeros
  // divergiriam. SEM filtro de janela, de proposito: ao contrario de giro/cobertura/rupturas
  // (que a RN-04 declara "na janela" explicitamente), a regua do atendimento no design nao
  // menciona janela — decisao registrada no relatorio de fechamento desta task (reversivel).
  const atendimento = await dbGet(db, `
    SELECT AVG((julianday(data_entrega) - julianday(created_at)) * 24) AS media_horas,
           COUNT(*) AS total_consideradas
    FROM requisicoes_almoxarifado
    WHERE data_entrega IS NOT NULL AND COALESCE(ativo, 1) = 1`);
  // Etapa 67 (C89): o `ativo` acima. O DELETE /requisicoes/:id estorna as entregas e grava
  // ativo=0 SEM limpar data_entrega — a entrega desfeita continuava no tempo medio do dashboard.
  const totalConsideradas = Number(atendimento.total_consideradas) || 0;
  const mediaHoras = totalConsideradas > 0 ? Number((atendimento.media_horas || 0).toFixed(2)) : 0;

  // ── Etapa 67 (RN-01/RN-02, D1-D3): requisicoes NO PRAZO. Ancora no PRAZO (date da ──
  // data_necessidade) dentro de [hoje - janela, hoje], dia UTC como o alerta REQUISICAO_ATRASADA.
  // No prazo = entrega COMPLETA (data_entrega so existe nela) ate o dia do prazo. Prazo de hoje
  // ainda sem entrega fica fora do denominador (o dia nao acabou) e e contado em
  // em_aberto_no_dia. Sem prazo legivel por date() (NULL, '', DD/MM/AAAA legado): fora, contado
  // em sem_data_valida entre as CRIADAS na janela. Tabela derivada no FROM, nao CTE (a varredura
  // do registro so captura SELECT).
  const noPrazo = await dbGet(db, `
    SELECT
      COALESCE(SUM(CASE WHEN x.dn >= date('now', '-' || ? || ' days') AND x.dn <= date('now')
                         AND NOT (x.dn = date('now') AND x.de IS NULL) THEN 1 ELSE 0 END), 0) AS consideradas,
      COALESCE(SUM(CASE WHEN x.dn >= date('now', '-' || ? || ' days') AND x.dn <= date('now')
                         AND x.de IS NOT NULL AND x.de <= x.dn THEN 1 ELSE 0 END), 0) AS no_prazo,
      COALESCE(SUM(CASE WHEN x.dn = date('now') AND x.de IS NULL THEN 1 ELSE 0 END), 0) AS em_aberto_no_dia,
      COALESCE(SUM(CASE WHEN x.dn IS NULL AND x.created_at >= datetime('now', '-' || ? || ' days')
                         THEN 1 ELSE 0 END), 0) AS sem_data_valida
    FROM (
      SELECT date(r.data_necessidade) AS dn, date(r.data_entrega) AS de, r.created_at
      FROM requisicoes_almoxarifado r
      WHERE ${REQUISICAO_VIVA_SQL('r')}
    ) x`, [janela, janela, janela]);
  const npConsideradas = Number(noPrazo.consideradas) || 0;
  const npNoPrazo = Number(noPrazo.no_prazo) || 0;

  // ── Etapa 67 (RN-03, D4): requisicoes INTEGRAIS. Das finalizadas na janela (ENTREGUE/ ──
  // ENCERRADA, ancora COALESCE(data_entrega, encerrado_em)), integral = data_entrega preenchida:
  // o motor so grava data_entrega quando TODOS os itens chegaram na quantidade pedida, e item nao
  // tem cancelamento nem reducao. Entregue e depois encerrada conta UMA vez (e uma linha so).
  const integrais = await dbGet(db, `
    SELECT COUNT(*) AS consideradas,
           COALESCE(SUM(CASE WHEN r.data_entrega IS NOT NULL THEN 1 ELSE 0 END), 0) AS integrais,
           COALESCE(SUM(CASE WHEN r.data_entrega IS NULL THEN 1 ELSE 0 END), 0) AS encerradas_incompletas
    FROM requisicoes_almoxarifado r
    WHERE ${REQUISICAO_VIVA_SQL('r')} AND r.status IN ('ENTREGUE', 'ENCERRADA')
      AND COALESCE(r.data_entrega, r.encerrado_em) >= datetime('now', '-' || ? || ' days')`, [janela]);
  const inConsideradas = Number(integrais.consideradas) || 0;
  const inIntegrais = Number(integrais.integrais) || 0;

  // ── Etapa 67 (RN-05, D9): numero de AJUSTES na janela, pela regua unica ajustesWhereSql ──
  // (a mesma da chave ajustes-por-motivo). Conta LANCAMENTOS, nunca soma quantidade: o AJUSTE
  // grava o saldo final (absoluto), nao a diferenca.
  const ajustesRows = await dbAll(db, `
    SELECT mv.tipo AS tipo, COUNT(*) AS total
    FROM movimentacoes_almoxarifado mv
    JOIN materiais_almoxarifado m ON m.id = mv.material_id
    WHERE ${ajustesWhereSql('mv', 'm')}
      AND mv.created_at >= datetime('now', '-' || ? || ' days')
    GROUP BY mv.tipo
    ORDER BY mv.tipo`, [janela]);
  const porTipo = ajustesRows.map((r) => ({ tipo: r.tipo, total: Number(r.total) || 0 }));

  return {
    janela_dias: janela,
    giro: { valor_consumido: valorConsumido, valor_estoque_atual: valorEstoqueAtual, indice },
    cobertura: { mediana_dias: medianaDias, materiais_sem_consumo: materiaisSemConsumo },
    rupturas: {
      total: rupturasRows.length,
      materiais: rupturasRows.map((r) => ({ codigo: r.codigo, nome: r.nome, data: r.data })),
    },
    valor_por_grupo: valorPorGrupoRows.map((r) => ({ categoria: r.categoria, valor: Number(r.valor) || 0 })),
    atendimento_requisicoes: { media_horas: mediaHoras, total_consideradas: totalConsideradas },
    requisicoes_no_prazo: {
      percentual: percentualOuNull(npNoPrazo, npConsideradas),
      no_prazo: npNoPrazo,
      fora_do_prazo: npConsideradas - npNoPrazo,
      consideradas: npConsideradas,
      em_aberto_no_dia: Number(noPrazo.em_aberto_no_dia) || 0,
      sem_data_valida: Number(noPrazo.sem_data_valida) || 0,
    },
    requisicoes_integrais: {
      percentual: percentualOuNull(inIntegrais, inConsideradas),
      integrais: inIntegrais,
      encerradas_incompletas: Number(integrais.encerradas_incompletas) || 0,
      consideradas: inConsideradas,
    },
    ajustes: { total: porTipo.reduce((s, r) => s + r.total, 0), por_tipo: porTipo },
  };
}

/**
 * RN-05 (Etapa 14, Task 3): custo por projeto, lido do LIVRO — nada materializado, sempre atual.
 * Fontes UNICAS: `custoUnitarioSql` (custo), `TIPOS_SAIDA`/`TIPOS_DEVOLUCAO` (movementTypes.js).
 *
 * `consumido` = Σ(saidas com projeto_id, TIPOS_SAIDA, nao canceladas x custo). `devolvido` =
 * Σ(entradas de devolucao com projeto_id, TIPOS_DEVOLUCAO, nao canceladas x custo) — SO existe em
 * producao porque returnService.registrarDevolucao passou a HERDAR projeto_id/os_id da saida
 * citada (Etapa 14, Task 3, I2); sem a heranca esta coluna seria estruturalmente zero, porque a
 * tela de devolucao nunca envia origem_projeto_id. `liquido = consumido - devolvido`.
 *
 * `liquido` e recalculado NA MESMA expressao (duas SUMs repetidas) em vez de reaproveitar os
 * aliases `consumido`/`devolvido` do SELECT: SQL nao permite referenciar um alias de coluna
 * dentro de outra expressao da MESMA lista de SELECT. A varredura de relatoriosRegistro.api.test.js
 * confere que toda `chave` declarada em `colunas` existe literalmente no SQL — se `liquido` fosse
 * so um calculo em JS depois do dbAll, a varredura acusaria a coluna como inexistente.
 *
 * `custo ATUAL retroativo` (I4, medido): o livro nao guarda custo por movimento — o valor
 * aplicado e sempre o custo de HOJE do material, entao um periodo fechado MUDA quando chega NF
 * nova. Dito na `nota` do registro (reportRegistry.js), nao so em comentario.
 *
 * Materiais de cliente (`m.proprietario_cliente_id IS NOT NULL`) FICAM FORA — patrimonio alheio.
 * Movimentacao SEM projeto_id fica fora — o relatorio E por projeto; o total geral do consumo
 * (indicador de giro) e regua distinta (`relatorioIndicadores`), declarada na nota.
 */
async function relatorioCustoProjeto(db, dataInicio, dataFim) {
  const custo = custoUnitarioSql('m');
  const phSaida = TIPOS_SAIDA.map(() => '?').join(',');
  const phDevolucao = TIPOS_DEVOLUCAO.map(() => '?').join(',');
  const phTodos = [...TIPOS_SAIDA, ...TIPOS_DEVOLUCAO].map(() => '?').join(',');

  const consumidoExpr = `SUM(CASE WHEN mv.tipo IN (${phSaida}) THEN mv.quantidade * ${custo} ELSE 0 END)`;
  const devolvidoExpr = `SUM(CASE WHEN mv.tipo IN (${phDevolucao}) THEN mv.quantidade * ${custo} ELSE 0 END)`;

  let sql = `SELECT mv.projeto_id AS projeto_id, p.nome AS projeto_nome,
      ${consumidoExpr} AS consumido,
      ${devolvidoExpr} AS devolvido,
      (${consumidoExpr} - ${devolvidoExpr}) AS liquido,
      COUNT(*) AS movimentacoes
    FROM movimentacoes_almoxarifado mv
    JOIN materiais_almoxarifado m ON m.id = mv.material_id
    LEFT JOIN projetos p ON p.id = mv.projeto_id
    WHERE mv.cancelado = 0 AND mv.projeto_id IS NOT NULL AND m.proprietario_cliente_id IS NULL
      AND mv.tipo IN (${phTodos})`;
  // A ordem dos binds tem de bater com a ordem dos `?` NO TEXTO: o bloco (TIPOS_SAIDA seguido de
  // TIPOS_DEVOLUCAO) aparece TRES vezes na string SQL acima — 1a vez nas colunas
  // consumido/devolvido (SAIDA do consumidoExpr, DEVOLUCAO do devolvidoExpr, nesta ordem), 2a vez
  // dentro de `liquido` (que REPETE o texto de consumidoExpr/devolvidoExpr — SQL nao permite
  // referenciar um alias de outra coluna do mesmo SELECT), 3a vez no WHERE (`phTodos`). NUNCA 4
  // blocos: `consumido`/`devolvido` sao UM bloco so (SAIDA+DEVOLUCAO consecutivos), nao dois.
  const blocoSaidaDevolucao = [...TIPOS_SAIDA, ...TIPOS_DEVOLUCAO];
  const params = [...blocoSaidaDevolucao, ...blocoSaidaDevolucao, ...blocoSaidaDevolucao];
  if (dataInicio) { sql += ' AND DATE(mv.created_at) >= ?'; params.push(dataInicio); }
  if (dataFim) { sql += ' AND DATE(mv.created_at) <= ?'; params.push(dataFim); }
  sql += ' GROUP BY mv.projeto_id, p.nome ORDER BY mv.projeto_id';

  const rows = await dbAll(db, sql, params);
  return rows.map((r) => ({
    projeto_id: r.projeto_id,
    // Projeto nao cadastrado na tabela do core (0 registros em producao hoje, medido na Fase 0
    // do design) -> rotulo Projeto #<id>, nunca null nem string vazia.
    projeto_nome: r.projeto_nome || `Projeto #${r.projeto_id}`,
    consumido: Number((Number(r.consumido) || 0).toFixed(2)),
    devolvido: Number((Number(r.devolvido) || 0).toFixed(2)),
    // Revisao da Task 3 (M-1): o liquido arredondado INDEPENDENTE nao fechava com as outras
    // duas colunas na planilha (10.01 - 5.00 saia 5.00) — o exibido e a diferenca dos DOIS
    // valores ja arredondados; a coluna `liquido` do SQL continua existindo (a varredura da
    // E13 exige a chave no SQL executado), so o valor final e coerente com o que o leitor ve.
    liquido: Number((Number((Number(r.consumido) || 0).toFixed(2)) - Number((Number(r.devolvido) || 0).toFixed(2))).toFixed(2)),
    movimentacoes: Number(r.movimentacoes) || 0,
  }));
}

module.exports = {
  relatorioEstoqueAtual, relatorioAbaixoMinimo, relatorioReservadoPorOS,
  relatorioConsumoPorOS, relatorioMateriaisMaisConsumidos, relatorioRecebimentosPendentes,
  relatorioMateriaisBloqueados, relatorioHistoricoMovimentacoes, relatorioInventarioDivergencias,
  relatorioConsumoPeriodo, relatorioFerramentasEmprestadas, relatorioEPIPorColaborador,
  relatorioSolicitacoesCompraPendentes, relatorioSucataFinanceiro, relatorioIndicadores,
  relatorioCustoProjeto,
  // Etapa 67: regua unica dos ajustes (consumida pela chave ajustes-por-motivo)
  ajustesWhereSql, relatorioAjustesPorMotivo, relatorioQualidadeFornecedores,
  // Etapa 49
  relatorioSaldoPorLote, relatorioSeriesEmEstoque, relatorioSaldosComprometidos,
};
