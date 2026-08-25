const { dbRun, dbGet, dbAll } = require('./db');
const { disponivelSql } = require('./availabilitySql');
const { custoUnitarioSql } = require('./custoSql');
const { consumoJanelaSql, consumoJanelaParams } = require('./consumoSql');
const { TIPOS_SAIDA, TIPOS_ENTRADA } = require('./movementTypes');
const { registrarAuditoria } = require('./audit');
// Sem ciclo: nem alertService nem notificationQueueService requerem este arquivo (Etapa 12,
// Task 3, RN-06 — resumo de solicitacoes de compra geradas).
const alertService = require('./alertService');
const notificationQueueService = require('./notificationQueueService');

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

// Estados terminais do ciclo de vida da solicitacao (RN-01, Etapa 14): RECEBIDA (automatica,
// D2) e CANCELADA (manual, D3). Um so lugar para a lista — cancelar e vincular checam a MESMA
// coisa (RN-01b).
const STATUS_TERMINAIS = ['RECEBIDA', 'CANCELADA'];

// RN-01b (EMENDA da Fase 2, C3 — medido: solicitacao inexistente E pedido inexistente
// respondiam 200 antes desta guarda, gravando pedido fantasma que o gancho da RN-03 nunca
// fecharia). Valida as DUAS pontas, nesta ordem: (1) solicitacao existe; (2) nao esta em
// estado terminal; (3) pedido existe em pedidos_compra (tabela do core).
async function vincularPedidoCompra(db, solicitacaoId, pedidoCompraId) {
  const sol = await dbGet(db, 'SELECT * FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solicitacaoId]);
  if (!sol) throw Object.assign(new Error('Solicitação não encontrada'), { status: 404 });
  if (STATUS_TERMINAIS.includes(sol.status)) {
    // Literal nasce aqui (familia do de cancelar, Global Constraints da Etapa 14): mesma
    // semantica ("ja finalizada, nao aceita mais transicao"), verbo trocado para o contexto.
    throw Object.assign(
      new Error('Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser vinculada a um pedido'),
      { status: 400 });
  }
  const pedido = await dbGet(db, 'SELECT id FROM pedidos_compra WHERE id = ?', [pedidoCompraId]);
  // Literal REUSADO de receiptService.criarRecebimento:76 (RN-01b) — um literal so para "pedido
  // de compra nao existe", nao inventar um segundo.
  if (!pedido) throw Object.assign(new Error('Pedido de compra não encontrado'), { status: 400 });

  await dbRun(db, "UPDATE solicitacoes_compra_almoxarifado SET pedido_compra_id = ?, status = 'VINCULADO' WHERE id = ?",
    [pedidoCompraId, solicitacaoId]);
  return { success: true };
}

// RN-02 (Etapa 14, D3): cancelamento manual. Permitido em PENDENTE/VINCULADO (o vinculo e
// informativo — cancelar NAO mexe no pedido do core, declarado). Exige justificativa.
async function cancelarSolicitacao(db, user, solicitacaoId, motivo) {
  if (!motivo || !String(motivo).trim()) {
    throw Object.assign(new Error('Justificativa obrigatória para cancelar a solicitação'), { status: 400 });
  }
  const sol = await dbGet(db, 'SELECT * FROM solicitacoes_compra_almoxarifado WHERE id = ?', [solicitacaoId]);
  if (!sol) throw Object.assign(new Error('Solicitação não encontrada'), { status: 404 });
  if (STATUS_TERMINAIS.includes(sol.status)) {
    throw Object.assign(
      new Error('Solicitação já finalizada (RECEBIDA ou CANCELADA) — não pode ser cancelada'),
      { status: 400 });
  }

  await dbRun(db, `UPDATE solicitacoes_compra_almoxarifado
      SET status = 'CANCELADA', cancelada_em = CURRENT_TIMESTAMP, cancelada_por = ?, cancelamento_motivo = ?
      WHERE id = ?`,
    [user.nome || user.email, motivo, solicitacaoId]);

  // dados_novos OBJETO (licao E11/Fase 2) — audit.js serializa.
  await registrarAuditoria(db, {
    entidade: 'solicitacao_compra', entidade_id: solicitacaoId, acao: 'CANCELAMENTO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
    dados_novos: { motivo, status_anterior: sol.status },
  });

  return { success: true, status: 'CANCELADA' };
}

// RN-03 (EMENDA da Fase 2, C4 — medido): helper UNICO chamado nos DOIS pontos onde um
// recebimento chega a estoque dado com pedido_compra_id (fim de processarNota E fim de
// aprovarRecebimento no ramo que grava APROVADO direto, receiptService:672) — cada chamador com
// o seu try/catch, NUNCA derruba o caminho principal (padrao RN-01 da E12). Recebimento sem
// pedido: no-op (pedidoCompraId undefined/null). O `AND status = 'VINCULADO'` no UPDATE E o
// dedupe do segundo recebimento do mesmo pedido (I1) — a auditoria fica DENTRO do laco das
// linhas EFETIVAMENTE fechadas por ESTA chamada, entao um segundo recebimento do mesmo pedido
// nao encontra nenhuma linha VINCULADO e nao audita nada de novo.
async function fecharSolicitacoesDoPedido(db, user, pedidoCompraId) {
  if (!pedidoCompraId) return;
  const fechadas = await dbAll(db, `UPDATE solicitacoes_compra_almoxarifado
      SET status = 'RECEBIDA', recebida_em = CURRENT_TIMESTAMP
      WHERE pedido_compra_id = ? AND status = 'VINCULADO'
      RETURNING id`, [pedidoCompraId]);
  for (const linha of fechadas) {
    await registrarAuditoria(db, {
      entidade: 'solicitacao_compra', entidade_id: linha.id, acao: 'RECEBIDA',
      usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
      dados_novos: { pedido_compra_id: pedidoCompraId },
    });
  }
}

async function lerConfigNumero(db, chave, fallback) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  const n = parseFloat(row?.valor);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// RN-04 (Etapa 14, Task 2): contexto do comprador para UM material. D5 — mesmo gate de quem
// gera/vincula/cancela solicitacao (gerenciar_reposicao, dado de pipeline de compra).
//
// EMENDA DA FASE 2 (C1, medido): a regua original ("custo gravado no livro") e INIMPLEMENTAVEL —
// movimentacoes_almoxarifado NAO TEM coluna de custo (receiptService.js:515-521, schema.js
// 205-219). A regua real e o PAR (movimentacao de entrada nao-cancelada x item de recebimento):
// so um item de recebimento tem valor_unitario, e so uma movimentacao tem created_at/cancelado.
// `mv.id DESC` no desempate e OBRIGATORIO — created_at do SQLite tem resolucao de SEGUNDO, entao
// duas entradas no mesmo teste (ou no mesmo segundo em producao) empatam por created_at e o
// resultado seria intermitente sem o desempate por id.
//
// NUNCA usar custo_medio nem materiais.custo_unitario: sao o custo do CADASTRO, nao da ENTRADA —
// custo_medio e media ponderada (nunca bate com o valor de uma NF especifica) e custo_unitario e
// reescrito a cada entrada mas NAO REVERTE quando a movimentacao e cancelada (medido) — o
// comprador quer o preco da ULTIMA NF de verdade, com data.
async function contextoMaterial(db, materialId) {
  const janela = await lerConfigNumero(db, 'reposicao_janela_consumo_dias', 90);

  const m = await dbGet(db, `SELECT m.id, m.codigo, m.nome, m.unidade, m.proprietario_cliente_id,
      COALESCE(m.quantidade_reservada,0) AS reservado,
      COALESCE(m.quantidade_em_terceiros,0) AS em_terceiros,
      COALESCE(${disponivelSql('m')}, 0) AS disponivel,
      ${consumoJanelaSql('m')} AS consumo_janela
    FROM materiais_almoxarifado m WHERE m.id = ?`,
    [...consumoJanelaParams(janela), materialId]);
  if (!m) throw Object.assign(new Error('Material não encontrado'), { status: 404 });

  // Emenda I5 (decisao da Fase 2 — medido): material de cliente responde 200 com os dados (404
  // mentiria, o material EXISTE). Revisao da Task 2 (A2): a versao anterior deste comentario
  // dizia "[] por construcao — a query naturalmente nao encontra nada"; ESTAVA ERRADA:
  // verificarEstoqueMinimo so ganhou o filtro de cliente na Etapa 8 — banco que rodou antes
  // pode ter solicitacao PENDENTE legada de material de cliente, e nada as fecha. O []
  // prometido pelo contrato agora e GARANTIDO por filtro explicito (o ramo abaixo pula a
  // query), nao por fe na higiene do dado.
  let proprietario_cliente = null;
  if (m.proprietario_cliente_id) {
    const cliente = await dbGet(db, 'SELECT id, razao_social FROM clientes WHERE id = ?', [m.proprietario_cliente_id]);
    proprietario_cliente = cliente ? { id: cliente.id, razao_social: cliente.razao_social } : null;
  }

  // Revisao da Task 2 (A1, medido): recebimento com DUAS linhas do MESMO material gera N mov x
  // N itens (produto cartesiano — nao ha vinculo item<->movimentacao no schema). O `ri.id DESC`
  // fixa a regra "a ULTIMA linha da NF vence" de forma deterministica (antes era a ordem do
  // planner, estabilidade acidental). LIMITACAO DECLARADA: no caso degenerado de linhas
  // duplicadas com estorno PARCIAL de uma delas, o custo reportado e o da ultima linha da NF
  // enquanto houver QUALQUER movimentacao viva daquele material naquele recebimento — sem
  // vinculo item<->movimentacao nao ha como saber qual linha foi estornada. A tela de
  // recebimento bloqueia material duplicado ('Material já incluído'); a API aceita (declarado).
  const phEntrada = TIPOS_ENTRADA.map(() => '?').join(',');
  const custoRow = await dbGet(db, `
    SELECT ri.valor_unitario AS valor, mv.created_at AS data
    FROM movimentacoes_almoxarifado mv
    JOIN recebimentos_material_itens_almoxarifado ri
      ON ri.recebimento_id = mv.recebimento_id AND ri.material_id = mv.material_id
    WHERE mv.material_id = ? AND mv.cancelado = 0 AND mv.tipo IN (${phEntrada}) AND ri.valor_unitario > 0
    ORDER BY mv.created_at DESC, mv.id DESC, ri.id DESC LIMIT 1`,
    [materialId, ...TIPOS_ENTRADA]);

  const solicitacoes_abertas = m.proprietario_cliente_id ? [] : await dbAll(db,
    `SELECT id, status, quantidade, pedido_compra_id, created_at
    FROM solicitacoes_compra_almoxarifado
    WHERE material_id = ? AND status IN ('PENDENTE','VINCULADO')
    ORDER BY created_at DESC, id DESC`, [materialId]);

  return {
    material: { id: m.id, codigo: m.codigo, nome: m.nome, unidade: m.unidade },
    disponivel: Number(m.disponivel.toFixed(4)),
    reservado: Number(m.reservado.toFixed(4)),
    em_terceiros: Number(m.em_terceiros.toFixed(4)),
    consumo_medio_diario: Number((m.consumo_janela / janela).toFixed(4)),
    janela_dias: janela,
    ultimo_custo_entrada: custoRow ? { valor: custoRow.valor, data: custoRow.data } : null,
    solicitacoes_abertas: solicitacoes_abertas.map((s) => ({
      id: s.id, status: s.status, quantidade: s.quantidade,
      pedido_compra_id: s.pedido_compra_id, created_at: s.created_at,
    })),
    proprietario_cliente,
  };
}

// Etapa 11 (RN-01..RN-06): a sugestao de reposicao. Fontes unicas: disponivelSql (disponivel
// JA desconta reservado/bloqueado/inspecao/terceiros — NAO descontar reserva de novo, RN-03),
// custoUnitarioSql (valor), TIPOS_SAIDA (consumo = tudo que debita patrimonio, D6).
// Material de cliente fora de tudo (nao se compra material dos outros).
async function calcularSugestoes(db) {
  const janela = await lerConfigNumero(db, 'reposicao_janela_consumo_dias', 90);
  const horizonte = await lerConfigNumero(db, 'reposicao_horizonte_solicitacao_dias', 60);

  const rows = await dbAll(db, `
    SELECT m.id AS material_id, m.codigo, m.nome, m.unidade,
           m.quantidade_minima, m.quantidade_maxima, m.ponto_reposicao, m.lote_economico,
           m.prazo_reposicao_dias, m.material_critico, m.fornecedor_id,
           f.razao_social AS fornecedor_nome,
           COALESCE(${disponivelSql('m')}, 0) AS disponivel,
           ${custoUnitarioSql('m')} AS custo_unitario,
           ${consumoJanelaSql('m')} AS consumo_janela,
           COALESCE((SELECT SUM(sc.quantidade) FROM solicitacoes_compra_almoxarifado sc
                     WHERE sc.material_id = m.id AND sc.status IN ('PENDENTE','VINCULADO')
                       AND sc.created_at >= datetime('now', '-' || ? || ' days')), 0) AS a_caminho,
           -- Revisao final E11 (achado 5): o espelho do a_caminho, para FORA do horizonte —
           -- expoe a solicitacao velha que deixou de segurar a posicao (RN-03) mas continua
           -- aberta de verdade, para a tela avisar "ha solicitacao antiga aberta" em vez de
           -- fingir que ela nunca existiu. O fix definitivo (status terminal no recebimento)
           -- e a letra E; isto e a mitigacao honesta ate la.
           COALESCE((SELECT SUM(sc.quantidade) FROM solicitacoes_compra_almoxarifado sc
                     WHERE sc.material_id = m.id AND sc.status IN ('PENDENTE','VINCULADO')
                       AND sc.created_at < datetime('now', '-' || ? || ' days')), 0) AS a_caminho_vencido
    FROM materiais_almoxarifado m
    LEFT JOIN fornecedores f ON m.fornecedor_id = f.id
    WHERE m.ativo = 1 AND m.proprietario_cliente_id IS NULL`,
    // Etapa 13, Task 2 (C4): consumo_janela agora vem de consumoJanelaSql('m') — os bind params
    // dela (TIPOS_SAIDA + janela) tem de vir NA MESMA ORDEM que os `?` da subquery aparecem no
    // texto acima, antes dos dois `horizonte` de a_caminho/a_caminho_vencido.
    [...consumoJanelaParams(janela), horizonte, horizonte]);

  // RN-06 (revisao final E11, medido): o resumo tem de contar TODOS os criticos zerados,
  // sugeridos ou nao — clicar em "Gerar" faz a solicitacao entrar em a_caminho e o item some
  // da LISTA (posicao passa a cobrir o ponto), mas o material continua FISICAMENTE parado
  // (disponivel ainda <= 0: uma solicitacao a caminho nao segura producao, a mesma razao de
  // RN-06 para o flag por item). Contar so `itens` zerava o numero enquanto a fabrica
  // continuava parada. O flag por ITEM (abaixo) continua so nos sugeridos — so eles tem
  // objeto no payload.
  let riscosParadaTotal = 0;
  const itens = [];
  for (const r of rows) {
    if (r.material_critico && r.disponivel <= 0) riscosParadaTotal += 1;

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
    // CORRECAO (revisao da Task 2, emendada na revisao final E11): o comentario original dizia
    // que o guard "<= 0" era codigo morto — era verdade ANTES do toFixed e FALSO depois:
    // residuo de float (minima 2.14 contra pendencias 1.0 + 1.14 = 2.1399999999999997)
    // arredondava a sugestao para 0, o material continuava "sugerido" para sempre e cada POST
    // gravava mais uma solicitacao de quantidade ZERO — lixo infinito no relatorio.
    // O guard "<=0" sozinho nao bastava: um residuo um fio MAIOR (minima 2.14 contra pendencia
    // 2.1399, sem o 999...) arredonda para 0.0001 — positivo, passa pelo "<=0" e ainda grava a
    // solicitacao fantasma (achado 6, medido). Piso ABSOLUTO 0.001, nao relativo: um piso
    // relativo (ex.: % do ponto) esconderia falta real de material com ponto gigante.
    const quantidadeSugerida = Number(sugerida.toFixed(4));
    if (quantidadeSugerida < 0.001) continue;

    itens.push({
      material_id: r.material_id, codigo: r.codigo, nome: r.nome, unidade: r.unidade,
      fornecedor_id: r.fornecedor_id, fornecedor_nome: r.fornecedor_nome,
      disponivel: Number(r.disponivel.toFixed(4)), a_caminho: Number(r.a_caminho.toFixed(4)),
      a_caminho_vencido: Number(r.a_caminho_vencido.toFixed(4)),
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
      riscos_parada: riscosParadaTotal,
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
  // RN-06: o resumo enfileirado no fim precisa de codigo/nome/unidade do material, que NAO estao
  // em `criadas` (so material_id/solicitacao_id/quantidade) — capturados aqui, do `item` que so
  // existe DENTRO do laco (Fase 2).
  const resumoItens = [];
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
    resumoItens.push({
      codigo: item.codigo, nome: item.nome, unidade: item.unidade, quantidade: item.quantidade_sugerida,
    });
  }

  // RN-06/RN-01: UM e-mail de resumo por lote gerado (nao um por material) — try/catch proprio,
  // porque falha de enfileirar NUNCA pode derrubar a criacao das solicitacoes ja gravadas acima.
  if (criadas.length > 0) {
    try {
      // Sort NUMERICO dos ids (achado da Fase 2): o lexicografico ordenaria [2,10] como [10,2] —
      // duas chamadas com os MESMOS ids em ordem diferente teriam de gerar a MESMA hash de
      // dedupe, senao o mesmo lote gerado duas vezes (ex.: retry do cliente) dobraria o aviso.
      const idsOrdenados = criadas.map((c) => c.solicitacao_id).sort((a, b) => a - b);
      let destinatarios = alertService.parseList(await alertService.getConfigValue(db, 'notificacoes_dest_compras'));
      if (!destinatarios.length) {
        destinatarios = alertService.parseList(await alertService.getConfigValue(db, 'compras_notificar_emails'));
      }
      const linhas = [
        `Solicitações de compra geradas: ${criadas.length}`,
        ...resumoItens.map((i) => `- ${i.codigo} — ${i.nome}: ${i.quantidade} ${i.unidade || ''}`.trim()),
      ];
      await notificationQueueService.enfileirar(db, {
        evento: 'SOLICITACAO_COMPRA',
        dedupe_chave: `solicitacoes-${idsOrdenados.join('-')}`,
        destinatarios,
        assunto: `[Almoxarifado] Solicitações de compra geradas (${criadas.length})`,
        corpo_texto: linhas.join('\n'),
        corpo_html: `<div>${linhas.map((l) => `<p>${alertService.escapeHtml(l)}</p>`).join('\n')}</div>`,
        payload: { solicitacao_ids: idsOrdenados },
      });
    } catch (e) {
      console.warn('[almoxarifado-notificacoes] Falha ao enfileirar resumo de solicitacoes de compra:', e.message);
    }
  }

  return { criadas, puladas };
}

// RN-07: excesso / sem consumo / obsoleto — flags INDEPENDENTES (um material pode ser excesso
// E obsoleto). So material ativo, nosso, com saldo (a regua e "ocupa prateleira"). LIMIT 500,
// maior valor parado primeiro.
async function estoqueParado(db, tipo) {
  const dias = await lerConfigNumero(db, 'reposicao_dias_sem_consumo', 180);
  const phSaida = TIPOS_SAIDA.map(() => '?').join(',');
  // Revisao da Task 2 (A1, medido): recebimento com DUAS linhas do MESMO material gera N mov x
  // N itens (produto cartesiano — nao ha vinculo item<->movimentacao no schema). O `ri.id DESC`
  // fixa a regra "a ULTIMA linha da NF vence" de forma deterministica (antes era a ordem do
  // planner, estabilidade acidental). LIMITACAO DECLARADA: no caso degenerado de linhas
  // duplicadas com estorno PARCIAL de uma delas, o custo reportado e o da ultima linha da NF
  // enquanto houver QUALQUER movimentacao viva daquele material naquele recebimento — sem
  // vinculo item<->movimentacao nao ha como saber qual linha foi estornada. A tela de
  // recebimento bloqueia material duplicado ('Material já incluído'); a API aceita (declarado).
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
  // Revisao final E11 (achado 7): armadilha latente — created_at do SQLite vem sem "T"
  // ("YYYY-MM-DD HH:MM:SS") e precisava do "Z" concatenado para virar ISO valido; mas se
  // algum dia uma linha chegar aqui ja em ISO (com "T"), concatenar "Z" de novo vira "...ZZ",
  // Date invalido, e o material cai em silencio no ramo "recente" (nunca aparece como
  // parado/obsoleto quando deveria). So concatena "Z" quando a string NAO tem "T".
  const antigaOuNunca = (d) => {
    if (d == null) return true;
    const s = String(d);
    const iso = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
    return new Date(iso).getTime() < limite;
  };

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
  cancelarSolicitacao, fecharSolicitacoesDoPedido, contextoMaterial,
};
