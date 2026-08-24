const { dbRun, dbGet, dbAll } = require('./db');
const { disponivelSql } = require('./availabilitySql');
const { custoUnitarioSql } = require('./custoSql');
const { TIPOS_SAIDA, TIPOS_ENTRADA } = require('./movementTypes');
const { registrarAuditoria } = require('./audit');

async function verificarEstoqueMinimo(db) {
  const criticos = await dbAll(db, `SELECT * FROM materiais_almoxarifado
    WHERE ativo = 1 AND quantidade_atual <= quantidade_minima AND quantidade_minima > 0
      -- Etapa 8, Task 1 (classe A): sem este filtro o sistema abriria solicitacao de COMPRA
      -- para repor material que nao e nosso. E o pior caso da falha silenciosa que a auditoria
      -- da Task 1 caca — ninguem percebe ate chegar o pedido ao fornecedor.
      AND proprietario_cliente_id IS NULL`);

  const criadas = [];
  for (const m of criticos) {
    const existente = await dbGet(db,
      "SELECT id FROM solicitacoes_compra_almoxarifado WHERE material_id = ? AND status = 'PENDENTE'", [m.id]);
    if (!existente) {
      const qtd = Math.max(m.quantidade_maxima - m.quantidade_atual, m.quantidade_minima);
      const r = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado (material_id, quantidade, motivo) VALUES (?,?,?)`,
        [m.id, qtd, 'ESTOQUE_MINIMO']);
      criadas.push({ material_id: m.id, solicitacao_id: r.lastID, quantidade: qtd });
    }
  }
  return criadas;
}

async function vincularPedidoCompra(db, solicitacaoId, pedidoCompraId) {
  await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET pedido_compra_id = ?, status = 'VINCULADO' WHERE id = ?",
    [pedidoCompraId, solicitacaoId]);
  return { success: true };
}

async function lerConfigNumero(db, chave, fallback) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  const n = parseFloat(row?.valor);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// Etapa 11 (RN-01..RN-06): a sugestao de reposicao. Fontes unicas: disponivelSql (disponivel
// JA desconta reservado/bloqueado/inspecao/terceiros — NAO descontar reserva de novo, RN-03),
// custoUnitarioSql (valor), TIPOS_SAIDA (consumo = tudo que debita patrimonio, D6).
// Material de cliente fora de tudo (nao se compra material dos outros).
async function calcularSugestoes(db) {
  const janela = await lerConfigNumero(db, 'reposicao_janela_consumo_dias', 90);
  const horizonte = await lerConfigNumero(db, 'reposicao_horizonte_solicitacao_dias', 60);
  const placeholders = TIPOS_SAIDA.map(() => '?').join(',');

  const rows = await dbAll(db, `
    SELECT m.id AS material_id, m.codigo, m.nome, m.unidade,
           m.quantidade_minima, m.quantidade_maxima, m.ponto_reposicao, m.lote_economico,
           m.prazo_reposicao_dias, m.material_critico, m.fornecedor_id,
           f.razao_social AS fornecedor_nome,
           ${disponivelSql('m')} AS disponivel,
           ${custoUnitarioSql('m')} AS custo_unitario,
           COALESCE((SELECT SUM(mv.quantidade) FROM movimentacoes_almoxarifado mv
                     WHERE mv.material_id = m.id AND mv.cancelado = 0
                       AND mv.tipo IN (${placeholders})
                       AND mv.created_at >= datetime('now', '-' || ? || ' days')), 0) AS consumo_janela,
           COALESCE((SELECT SUM(sc.quantidade) FROM solicitacoes_compra_almoxarifado sc
                     WHERE sc.material_id = m.id AND sc.status IN ('PENDENTE','VINCULADO')
                       AND sc.created_at >= datetime('now', '-' || ? || ' days')), 0) AS a_caminho
    FROM materiais_almoxarifado m
    LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL`,
    [...TIPOS_SAIDA, janela, horizonte]);

  const itens = [];
  for (const r of rows) {
    const consumoDiario = r.consumo_janela / janela;
    // RN-02 (emendada pela revisao da Task 1, Critical): a MINIMA e o CHAO de todas as
    // reguas — se o alerta de minimo grita, a sugestao TEM de existir. Sem o chao, preencher
    // o prazo (que a propria etapa incentiva) fazia o material DESAPARECER: giro baixo x
    // prazo dava ponto microscopico (0.11) que vencia a minima (100), e o material ficava
    // invisivel na sugestao enquanto o verificar-minimos legado abria solicitacao de 195.
    // origem_ponto diz quem venceu DE FATO.
    let pontoEfetivo = 0; let origemPonto = null;
    if (r.ponto_reposicao > 0) { pontoEfetivo = r.ponto_reposicao; origemPonto = 'CADASTRADO'; }
    else if (consumoDiario > 0 && r.prazo_reposicao_dias > 0) {
      pontoEfetivo = consumoDiario * r.prazo_reposicao_dias; origemPonto = 'CALCULADO';
    }
    if ((r.quantidade_minima || 0) > pontoEfetivo) {
      pontoEfetivo = r.quantidade_minima; origemPonto = 'MINIMO';
    }
    if (pontoEfetivo <= 0) continue;                     // RN-02: sem regua, nunca sugere

    const posicao = r.disponivel + r.a_caminho;          // RN-03
    if (posicao >= pontoEfetivo) continue;

    const alvo = Math.max(r.quantidade_maxima || 0, pontoEfetivo);   // RN-04
    let sugerida = alvo - posicao;
    if (r.lote_economico > 0) sugerida = Math.max(sugerida, r.lote_economico);
    // CORRECAO (revisao da Task 2): o comentario anterior dizia que o guard "<= 0" era codigo
    // morto — era verdade ANTES do toFixed e FALSO depois: residuo de float abaixo de 5e-5
    // (minima 2.14 contra pendencias 1.0 + 1.14 = 2.1399999999999997) arredondava a sugestao
    // para 0, o material continuava "sugerido" para sempre e cada POST gravava mais uma
    // solicitacao de quantidade ZERO que nunca somava em a_caminho — lixo infinito no
    // relatorio. Arredonda UMA vez e descarta o fantasma.
    const quantidadeSugerida = Number(sugerida.toFixed(4));
    if (quantidadeSugerida <= 0) continue;

    itens.push({
      material_id: r.material_id, codigo: r.codigo, nome: r.nome, unidade: r.unidade,
      fornecedor_id: r.fornecedor_id, fornecedor_nome: r.fornecedor_nome,
      disponivel: Number(r.disponivel.toFixed(4)), a_caminho: Number(r.a_caminho.toFixed(4)),
      posicao: Number(posicao.toFixed(4)),
      consumo_medio_diario: Number(consumoDiario.toFixed(4)),
      prazo_reposicao_dias: r.prazo_reposicao_dias || 0,
      ponto_efetivo: Number(pontoEfetivo.toFixed(4)), origem_ponto: origemPonto,
      quantidade_sugerida: quantidadeSugerida,
      valor_estimado: Number((quantidadeSugerida * (r.custo_unitario || 0)).toFixed(2)),
      // RN-06/D7: critico sem disponivel = risco de parada — solicitacao a caminho nao
      // segura producao, por isso a flag olha o DISPONIVEL, nao a posicao.
      risco_parada: !!r.material_critico && r.disponivel <= 0,
    });
  }

  // RN-05: grupos por fornecedor, alfabetico, sem-fornecedor SEMPRE por ultimo.
  const porFornecedor = new Map();
  for (const item of itens) {
    const chave = item.fornecedor_id == null ? 'null' : String(item.fornecedor_id);
    if (!porFornecedor.has(chave)) {
      porFornecedor.set(chave, {
        fornecedor_id: item.fornecedor_id,
        // Fornecedor apagado/orfao (a coluna e INTEGER solto, sem FK): nome nulo viraria
        // cabecalho vazio na tela e String(null) ordenava como a palavra "null" — o rotulo
        // aponta o dado a consertar em vez de esconde-lo (revisao da Task 1).
        fornecedor_nome: item.fornecedor_id == null
          ? 'Sem fornecedor definido'
          : (item.fornecedor_nome || `Fornecedor #${item.fornecedor_id} (não cadastrado)`),
        itens: [], total_itens: 0, valor_total: 0,
      });
    }
    const g = porFornecedor.get(chave);
    const { fornecedor_id, fornecedor_nome, ...itemLimpo } = item;
    g.itens.push(itemLimpo);
    g.total_itens += 1;
    g.valor_total = Number((g.valor_total + item.valor_estimado).toFixed(2));
  }
  const fornecedores = [...porFornecedor.values()].sort((a, b) => {
    if (a.fornecedor_id == null) return 1;
    if (b.fornecedor_id == null) return -1;
    return String(a.fornecedor_nome).localeCompare(String(b.fornecedor_nome));
  });

  return {
    janela_dias: janela,
    fornecedores,
    resumo: {
      materiais_sugeridos: itens.length,
      valor_total: Number(itens.reduce((s, i) => s + i.valor_estimado, 0).toFixed(2)),
      riscos_parada: itens.filter((i) => i.risco_parada).length,
    },
  };
}

// RN-09 (reescrita pela Fase 2): o servidor calcula, o cliente so escolhe QUAIS materiais —
// ausente = todas as sugestoes do momento; [] = NENHUMA (desmarcar tudo nao dispara o
// catalogo inteiro). NAO ha dedupe aqui: a pendencia entra em a_caminho (RN-03), entao material
// coberto nem e sugerido, e pendencia INSUFICIENTE gera o COMPLEMENTO (a quantidade sugerida
// ja desconta o que esta a caminho) — recusar seria negar reposicao a material que continua
// faltando. O dedupe por PENDENTE segue existindo SO no legado verificar-minimos (D10).
async function gerarSolicitacoesDaSugestao(db, usuario, materialIds) {
  const sugestao = await calcularSugestoes(db);
  const porMaterial = new Map();
  for (const g of sugestao.fornecedores) for (const i of g.itens) porMaterial.set(i.material_id, i);

  // Set: id repetido no body multiplicava a quantidade calculada (POST [1,1,1] pedia 60 onde
  // o material precisava de 20 — revisao da Task 2, medido).
  const alvos = [...new Set(Array.isArray(materialIds) ? materialIds : [...porMaterial.keys()])];

  const criadas = []; const puladas = [];
  for (const materialId of alvos) {
    const item = porMaterial.get(materialId);
    if (!item) { puladas.push({ material_id: materialId, motivo: 'SEM_SUGESTAO' }); continue; }
    const r = await dbRun(db, `INSERT INTO solicitacoes_compra_almoxarifado
        (material_id, quantidade, motivo) VALUES (?,?,'PONTO_REPOSICAO')`,
      [materialId, item.quantidade_sugerida]);
    // dados_novos como OBJETO — audit.js serializa; string aqui viraria escape em dobro
    // (Fase 2, verificado nos 11 chamadores reais).
    await registrarAuditoria(db, {
      entidade: 'solicitacao_compra', entidade_id: r.lastID, acao: 'CRIAR',
      usuario_id: usuario.id, usuario_nome: usuario.nome || usuario.email,
      dados_novos: { material_id: materialId, quantidade: item.quantidade_sugerida, motivo: 'PONTO_REPOSICAO' },
    });
    criadas.push({ material_id: materialId, solicitacao_id: r.lastID, quantidade: item.quantidade_sugerida });
  }
  return { criadas, puladas };
}

// RN-07: excesso / sem consumo / obsoleto — flags INDEPENDENTES (um material pode ser excesso
// E obsoleto). So material ativo, nosso, com saldo (a regua e "ocupa prateleira"). LIMIT 500,
// maior valor parado primeiro.
async function estoqueParado(db, tipo) {
  const dias = await lerConfigNumero(db, 'reposicao_dias_sem_consumo', 180);
  const phSaida = TIPOS_SAIDA.map(() => '?').join(',');
  const phEntrada = TIPOS_ENTRADA.map(() => '?').join(',');

  const rows = await dbAll(db, `
    SELECT m.id AS material_id, m.codigo, m.nome, m.unidade,
           m.quantidade_atual, m.quantidade_maxima,
           ${custoUnitarioSql('m')} AS custo_unitario,
           (SELECT MAX(mv.created_at) FROM movimentacoes_almoxarifado mv
            WHERE mv.material_id = m.id AND mv.cancelado = 0 AND mv.tipo IN (${phSaida})) AS ultima_saida,
           (SELECT MAX(mv.created_at) FROM movimentacoes_almoxarifado mv
            WHERE mv.material_id = m.id AND mv.cancelado = 0 AND mv.tipo IN (${phEntrada})) AS ultima_entrada
    FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL AND m.quantidade_atual > 0`,
    [...TIPOS_SAIDA, ...TIPOS_ENTRADA]);

  const limite = Date.now() - dias * 24 * 60 * 60 * 1000;
  const antigaOuNunca = (d) => d == null || new Date(`${String(d).replace(' ', 'T')}Z`).getTime() < limite;

  const todos = rows.map((r) => {
    const sem_consumo = antigaOuNunca(r.ultima_saida);
    return {
      material_id: r.material_id, codigo: r.codigo, nome: r.nome, unidade: r.unidade,
      quantidade_atual: r.quantidade_atual, quantidade_maxima: r.quantidade_maxima,
      ultima_entrada: r.ultima_entrada || null, ultima_saida: r.ultima_saida || null,
      valor_parado: Number((r.quantidade_atual * (r.custo_unitario || 0)).toFixed(2)),
      excesso: r.quantidade_maxima > 0 && r.quantidade_atual > r.quantidade_maxima,
      sem_consumo,
      obsoleto: sem_consumo && antigaOuNunca(r.ultima_entrada),
    };
  }).filter((i) => i.excesso || i.sem_consumo || i.obsoleto);

  // Resumo sobre a lista COMPLETA, antes do filtro por tipo e do teto (semantica congelada
  // pela Fase 2): o resumo e o retrato do estoque parado inteiro; `itens` e a janela.
  const resumo = {
    excesso: todos.filter((i) => i.excesso).length,
    sem_consumo: todos.filter((i) => i.sem_consumo).length,
    obsoleto: todos.filter((i) => i.obsoleto).length,
    valor_parado_total: Number(todos.reduce((s, i) => s + i.valor_parado, 0).toFixed(2)),
  };

  let itens = todos;
  if (tipo) {
    const chave = { EXCESSO: 'excesso', SEM_CONSUMO: 'sem_consumo', OBSOLETO: 'obsoleto' }[tipo];
    itens = itens.filter((i) => i[chave]);
  }
  itens.sort((a, b) => b.valor_parado - a.valor_parado);
  itens = itens.slice(0, 500);

  return { dias_sem_consumo: dias, itens, resumo };
}

module.exports = {
  verificarEstoqueMinimo, vincularPedidoCompra, calcularSugestoes,
  gerarSolicitacoesDaSugestao, estoqueParado,
};
