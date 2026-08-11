const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
const {
  registrarMovimentacao, resolveLocalizacaoEntrada, validarLocalizacaoParaMovimento,
} = require('./stockService');
const lotService = require('./lotService');

const STATUS = {
  RECEBIDO: 'RECEBIDO',
  EM_CONFERENCIA: 'EM_CONFERENCIA',
  CONFERIDO_ALMOX: 'CONFERIDO_ALMOX',
  EM_COMPRAS: 'EM_COMPRAS',
  ENCAMINHADO_FATURAMENTO: 'ENCAMINHADO_FATURAMENTO',
  EM_ENTRADA_NF: 'EM_ENTRADA_NF',
  PROCESSADO: 'PROCESSADO',
  APROVADO: 'APROVADO',
  REPROVADO: 'REPROVADO',
  PARCIALMENTE_APROVADO: 'PARCIALMENTE_APROVADO',
  BLOQUEADO: 'BLOQUEADO',
};

const ETAPAS = {
  ALMOXARIFADO: 'ALMOXARIFADO',
  COMPRAS: 'COMPRAS',
  FATURAMENTO: 'FATURAMENTO',
  CONCLUIDO: 'CONCLUIDO',
};

const STATUS_ETAPA = {
  [STATUS.RECEBIDO]: ETAPAS.ALMOXARIFADO,
  [STATUS.EM_CONFERENCIA]: ETAPAS.ALMOXARIFADO,
  [STATUS.CONFERIDO_ALMOX]: ETAPAS.ALMOXARIFADO,
  [STATUS.EM_COMPRAS]: ETAPAS.COMPRAS,
  [STATUS.ENCAMINHADO_FATURAMENTO]: ETAPAS.FATURAMENTO,
  [STATUS.EM_ENTRADA_NF]: ETAPAS.FATURAMENTO,
  [STATUS.PROCESSADO]: ETAPAS.CONCLUIDO,
  [STATUS.APROVADO]: ETAPAS.CONCLUIDO,
};

function gerarNumero(prefix) {
  return `${prefix}-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
}

async function carregarItensPedidoCompra(db, pedidoCompraId) {
  const itens = await dbAll(db, `SELECT ipc.*, m.nome as material_nome, m.codigo as material_codigo
    FROM itens_pedido_compra ipc
    LEFT JOIN materiais_almoxarifado m ON ipc.material_id = m.id
    WHERE ipc.pedido_id = ?`, [pedidoCompraId]);
  return itens.filter((i) => i.material_id);
}

async function resolverPedidoCompra(db, { pedido_compra_id, pedido_compra_numero }) {
  if (pedido_compra_id) {
    return dbGet(db, `SELECT p.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj
      FROM pedidos_compra p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE p.id = ?`, [pedido_compra_id]);
  }
  if (pedido_compra_numero) {
    return dbGet(db, `SELECT p.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj
      FROM pedidos_compra p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE p.numero = ?`, [pedido_compra_numero]);
  }
  return null;
}

async function criarRecebimento(db, user, data) {
  const {
    pedido_compra_id, pedido_compra_numero, tipo_recebimento, nota_fiscal,
    fornecedor_id, fornecedor_nome, fornecedor_cnpj, observacoes, itens: itensInput,
  } = data;

  let pedido = null;
  let itens = itensInput || [];
  const tipo = tipo_recebimento || (pedido_compra_id || pedido_compra_numero ? 'PEDIDO_COMPRA' : 'NOTA_FISCAL');

  if (tipo === 'PEDIDO_COMPRA') {
    pedido = await resolverPedidoCompra(db, { pedido_compra_id, pedido_compra_numero });
    if (!pedido) throw Object.assign(new Error('Pedido de compra não encontrado'), { status: 400 });
    if (!itens.length) {
      const itensPedido = await carregarItensPedidoCompra(db, pedido.id);
      itens = itensPedido.map((i) => ({
        material_id: i.material_id,
        quantidade: i.quantidade,
        quantidade_esperada: i.quantidade,
        quantidade_recebida: i.quantidade,
        valor_unitario: i.valor_unitario || 0,
        valor_total: (i.quantidade || 0) * (i.valor_unitario || 0),
      }));
    }
  }

  if (!itens.length) throw Object.assign(new Error('Inclua ao menos um item'), { status: 400 });

  const numero = gerarNumero('REC');
  const r = await dbRun(db, `INSERT INTO recebimentos_material_almoxarifado
    (numero, pedido_compra_id, pedido_compra_numero, tipo_recebimento, nota_fiscal,
     fornecedor_id, fornecedor_nome, fornecedor_cnpj, status, etapa_atual,
     responsavel_id, responsavel_nome, observacoes)
    VALUES (?,?,?,?,?,?,?,?,'RECEBIDO','ALMOXARIFADO',?,?,?)`, [
    numero,
    pedido?.id || pedido_compra_id || null,
    pedido?.numero || pedido_compra_numero || null,
    tipo,
    nota_fiscal || null,
    pedido?.fornecedor_id || fornecedor_id || null,
    pedido?.fornecedor_nome || fornecedor_nome || null,
    pedido?.fornecedor_cnpj || fornecedor_cnpj || null,
    user.id, user.nome || user.email, observacoes || null,
  ]);

  for (const item of itens) {
    const qtd = item.quantidade_esperada || item.quantidade;
    const vUnit = parseFloat(item.valor_unitario) || 0;
    const vTotal = parseFloat(item.valor_total) || (qtd * vUnit);
    await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, quantidade_esperada, quantidade_recebida, lote, series, observacoes,
       valor_unitario, valor_total, valor_icms, valor_ipi, reducao_icms_percent)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
      r.lastID, item.material_id, qtd,
      item.quantidade_recebida || qtd, item.lote || null, item.series || null, item.observacoes || null,
      vUnit, vTotal, parseFloat(item.valor_icms) || 0, parseFloat(item.valor_ipi) || 0,
      parseFloat(item.reducao_icms_percent) || 0,
    ]);
  }

  await registrarAuditoria(db, {
    entidade: 'recebimento', entidade_id: r.lastID, acao: 'CRIACAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
  });
  return { id: r.lastID, numero, status: STATUS.RECEBIDO };
}

async function conferirRecebimento(db, user, recebimentoId, data) {
  const { status, itens } = data;
  const validStatus = [
    STATUS.EM_CONFERENCIA, STATUS.CONFERIDO_ALMOX, STATUS.APROVADO, STATUS.REPROVADO,
    STATUS.PARCIALMENTE_APROVADO, STATUS.BLOQUEADO,
  ];
  if (status && !validStatus.includes(status)) {
    throw Object.assign(new Error('Status inválido'), { status: 400 });
  }

  if (status) {
    const etapa = STATUS_ETAPA[status] || ETAPAS.ALMOXARIFADO;
    await dbRun(db, `UPDATE recebimentos_material_almoxarifado
      SET status = ?, etapa_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, etapa, recebimentoId]);
  }

  if (itens) {
    for (const item of itens) {
      await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET
        quantidade_recebida = ?, conferencia_quantidade = ?, conferencia_descricao = ?, observacoes = ?,
        series = COALESCE(?, series)
        WHERE id = ? AND recebimento_id = ?`, [
        item.quantidade_recebida, item.conferencia_quantidade ? 1 : 0,
        item.conferencia_descricao ? 1 : 0, item.observacoes || null,
        item.series ?? null,
        item.id, recebimentoId,
      ]);
    }
  }

  return { success: true };
}

async function avancarWorkflow(db, user, recebimentoId, acao) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });

  const transicoes = {
    iniciar_conferencia: { de: [STATUS.RECEBIDO], para: STATUS.EM_CONFERENCIA, etapa: ETAPAS.ALMOXARIFADO },
    finalizar_conferencia: { de: [STATUS.EM_CONFERENCIA], para: STATUS.CONFERIDO_ALMOX, etapa: ETAPAS.ALMOXARIFADO },
    encaminhar_compras: { de: [STATUS.CONFERIDO_ALMOX, STATUS.RECEBIDO], para: STATUS.EM_COMPRAS, etapa: ETAPAS.COMPRAS },
    finalizar_compras: { de: [STATUS.EM_COMPRAS], para: STATUS.ENCAMINHADO_FATURAMENTO, etapa: ETAPAS.FATURAMENTO,
      extra: { compras_responsavel_id: user.id, compras_responsavel_nome: user.nome || user.email, compras_data: new Date().toISOString() } },
    iniciar_faturamento: { de: [STATUS.ENCAMINHADO_FATURAMENTO], para: STATUS.EM_ENTRADA_NF, etapa: ETAPAS.FATURAMENTO },
    processar: { de: [STATUS.EM_ENTRADA_NF], para: STATUS.PROCESSADO, etapa: ETAPAS.CONCLUIDO,
      handler: 'processar' },
  };

  const t = transicoes[acao];
  if (!t) throw Object.assign(new Error('Ação de workflow inválida'), { status: 400 });
  if (!t.de.includes(rec.status)) {
    throw Object.assign(new Error(`Não é possível "${acao}" no status atual (${rec.status})`), { status: 400 });
  }

  if (t.handler === 'processar') {
    return processarNota(db, user, recebimentoId);
  }

  const sets = ['status = ?', 'etapa_atual = ?', 'updated_at = CURRENT_TIMESTAMP'];
  const params = [t.para, t.etapa];
  if (t.extra) {
    for (const [k, v] of Object.entries(t.extra)) {
      sets.push(`${k} = ?`);
      params.push(v);
    }
  }
  params.push(recebimentoId);
  await dbRun(db, `UPDATE recebimentos_material_almoxarifado SET ${sets.join(', ')} WHERE id = ?`, params);

  await registrarAuditoria(db, {
    entidade: 'recebimento', entidade_id: recebimentoId, acao: acao.toUpperCase(),
    usuario_id: user.id, usuario_nome: user.nome || user.email,
  });
  return { success: true, status: t.para, etapa_atual: t.etapa };
}

async function salvarDadosFiscal(db, user, recebimentoId, data) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });

  const permitidos = [
    STATUS.ENCAMINHADO_FATURAMENTO, STATUS.EM_ENTRADA_NF, STATUS.EM_COMPRAS,
    STATUS.CONFERIDO_ALMOX, STATUS.EM_CONFERENCIA,
  ];
  if (!permitidos.includes(rec.status)) {
    throw Object.assign(new Error('Dados fiscais só podem ser editados antes do processamento'), { status: 400 });
  }

  const {
    nota_fiscal, nota_serie, data_emissao_nf, data_entrada_nf, cfop_nota, cfop_entrada, chave_nfe,
    fornecedor_id, fornecedor_nome, fornecedor_cnpj, pedido_compra_id, pedido_compra_numero, tipo_recebimento,
    base_icms, valor_icms, valor_produtos, frete, desconto, outras_despesas, valor_ipi, valor_total_nota,
    itens,
  } = data;

  let pedido = null;
  if (pedido_compra_id || pedido_compra_numero) {
    pedido = await resolverPedidoCompra(db, { pedido_compra_id, pedido_compra_numero });
  }

  await dbRun(db, `UPDATE recebimentos_material_almoxarifado SET
    nota_fiscal = COALESCE(?, nota_fiscal),
    nota_serie = COALESCE(?, nota_serie),
    data_emissao_nf = COALESCE(?, data_emissao_nf),
    data_entrada_nf = COALESCE(?, data_entrada_nf),
    cfop_nota = COALESCE(?, cfop_nota),
    cfop_entrada = COALESCE(?, cfop_entrada),
    chave_nfe = COALESCE(?, chave_nfe),
    fornecedor_id = COALESCE(?, fornecedor_id),
    fornecedor_nome = COALESCE(?, fornecedor_nome),
    fornecedor_cnpj = COALESCE(?, fornecedor_cnpj),
    pedido_compra_id = COALESCE(?, pedido_compra_id),
    pedido_compra_numero = COALESCE(?, pedido_compra_numero),
    tipo_recebimento = COALESCE(?, tipo_recebimento),
    base_icms = COALESCE(?, base_icms),
    valor_icms = COALESCE(?, valor_icms),
    valor_produtos = COALESCE(?, valor_produtos),
    frete = COALESCE(?, frete),
    desconto = COALESCE(?, desconto),
    outras_despesas = COALESCE(?, outras_despesas),
    valor_ipi = COALESCE(?, valor_ipi),
    valor_total_nota = COALESCE(?, valor_total_nota),
    faturamento_responsavel_id = ?,
    faturamento_responsavel_nome = ?,
    faturamento_data = CURRENT_TIMESTAMP,
    status = CASE WHEN status = 'ENCAMINHADO_FATURAMENTO' THEN 'EM_ENTRADA_NF' ELSE status END,
    etapa_atual = CASE WHEN status IN ('ENCAMINHADO_FATURAMENTO','EM_ENTRADA_NF') THEN 'FATURAMENTO' ELSE etapa_atual END,
    updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`, [
    nota_fiscal ?? null, nota_serie ?? null, data_emissao_nf ?? null, data_entrada_nf ?? null,
    cfop_nota ?? null, cfop_entrada ?? null, chave_nfe ?? null,
    pedido?.fornecedor_id ?? fornecedor_id ?? null,
    pedido?.fornecedor_nome ?? fornecedor_nome ?? null,
    pedido?.fornecedor_cnpj ?? fornecedor_cnpj ?? null,
    pedido?.id ?? pedido_compra_id ?? null,
    pedido?.numero ?? pedido_compra_numero ?? null,
    tipo_recebimento ?? null,
    base_icms ?? null, valor_icms ?? null, valor_produtos ?? null,
    frete ?? null, desconto ?? null, outras_despesas ?? null, valor_ipi ?? null, valor_total_nota ?? null,
    user.id, user.nome || user.email, recebimentoId,
  ]);

  if (itens?.length) {
    for (const item of itens) {
      const qtd = parseFloat(item.quantidade_recebida) || parseFloat(item.quantidade_esperada) || 0;
      const vUnit = parseFloat(item.valor_unitario) || 0;
      const vTotal = parseFloat(item.valor_total) || (qtd * vUnit);
      await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET
        quantidade_recebida = COALESCE(?, quantidade_recebida),
        valor_unitario = COALESCE(?, valor_unitario),
        valor_total = COALESCE(?, valor_total),
        valor_icms = COALESCE(?, valor_icms),
        valor_ipi = COALESCE(?, valor_ipi),
        reducao_icms_percent = COALESCE(?, reducao_icms_percent),
        conferencia_quantidade = COALESCE(?, conferencia_quantidade),
        conferencia_descricao = COALESCE(?, conferencia_descricao),
        lote = COALESCE(?, lote),
        data_validade_lote = COALESCE(?, data_validade_lote),
        data_fabricacao_lote = COALESCE(?, data_fabricacao_lote),
        corrida_lote = COALESCE(?, corrida_lote),
        series = COALESCE(?, series)
        WHERE id = ? AND recebimento_id = ?`, [
        item.quantidade_recebida ?? null, vUnit || null, vTotal || null,
        item.valor_icms ?? null, item.valor_ipi ?? null, item.reducao_icms_percent ?? null,
        item.conferencia_quantidade != null ? (item.conferencia_quantidade ? 1 : 0) : null,
        item.conferencia_descricao != null ? (item.conferencia_descricao ? 1 : 0) : null,
        item.lote ?? null, item.data_validade_lote ?? null, item.data_fabricacao_lote ?? null,
        item.corrida_lote ?? null, item.series ?? null,
        item.id, recebimentoId,
      ]);
    }
  }

  return { success: true };
}

function validarDadosProcessamento(rec) {
  const faltando = [];
  if (!rec.nota_fiscal) faltando.push('número da nota fiscal');
  if (!rec.fornecedor_nome && !rec.fornecedor_cnpj) faltando.push('fornecedor (CNPJ ou nome)');
  if (!rec.data_emissao_nf) faltando.push('data de emissão da nota');
  if (!rec.data_entrada_nf) faltando.push('data de entrada da nota');
  if (rec.valor_total_nota == null || rec.valor_total_nota <= 0) faltando.push('valor total da nota');
  if (faltando.length) {
    throw Object.assign(new Error(`Preencha antes de processar: ${faltando.join(', ')}`), { status: 400 });
  }
}

/**
 * Quantidade que um item de recebimento leva para o estoque. Um lugar so — a pre-checagem e o
 * laco de entrada TEM de concordar sobre quais itens movem estoque, senao a pre-checagem valida
 * um conjunto e o laco move outro.
 */
function quantidadeDoItem(item) {
  return item.quantidade_recebida || item.quantidade_esperada;
}

/**
 * Numeros de serie digitados no item, um por linha (mesmo formato do campo `lote` de texto
 * livre). Etapa 6b, Task 6 — o parser vive aqui porque so o recebimento tem essa entrada em
 * texto; o motor (`stockService.registrarMovimentacao`) recebe `params.series` ja como array.
 */
function parseSeries(txt) {
  return String(txt || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

/**
 * Da entrada no estoque dos itens de um recebimento.
 *
 * ── Por que ha pre-checagem E marca de idempotencia (achado do review final da Etapa 6) ──
 * Antes, esta funcao percorria os itens chamando `registrarMovimentacao` um a um, sem nenhuma das
 * duas coisas. Se o item B falhasse, o item A JA tinha entrado, o recebimento continuava em
 * `EM_ENTRADA_NF` e o botao "Processar Nota" continuava na tela. Reproduzido pelo revisor: 1a
 * tentativa entrou 10 do A e falhou no B; corrigido o B, a 2a tentativa entrou MAIS 10 do A
 * (total 20). Nao ha transacao neste modulo, entao "tudo ou nada" nao sai de graca — as duas
 * pontas sao corrigidas separadamente:
 *
 *  1. **Pre-checagem**: tudo que da para saber por item ANTES de mover qualquer coisa (material
 *     inativo, `controle_lote` sem lote digitado, localizacao de destino bloqueada ou que nao
 *     aceita o tipo do material) e verificado para TODOS os itens primeiro. Uma nota com um item
 *     ruim e recusada inteira, sem ter movido nada.
 *  2. **Marca por item** (`entrada_estoque_em`): mesmo assim um passo posterior pode falhar (o
 *     motor tem guardas que dependem de estado concorrente). Entao cada item e RECLAMADO com um
 *     UPDATE condicional antes de mover — `WHERE entrada_estoque_em IS NULL` —, e o reprocessamento
 *     pula quem ja entrou em vez de creditar de novo. A marca e liberada de volta se a falha
 *     acontecer ANTES da entrada fisica; depois dela, nao: creditar duas vezes e pior do que
 *     deixar a QUARENTENA daquele item por fazer, e a marca e o que impede isso.
 *
 * Coberto por `server/tests/api/recebimentoEntradaAtomica.api.test.js`, que mede os numeros da
 * reproducao acima (A continua em 10 depois do reprocessamento, nao 20).
 */
async function darEntradaEstoque(db, user, rec, recebimentoId, { localizacao_id } = {}) {
  const itens = await dbAll(db, `SELECT ri.*, m.material_critico, m.controle_certificado,
      m.controle_lote, m.controle_serie, m.ativo as material_ativo, m.codigo as material_codigo,
      m.tipo_material, m.localizacao_padrao_id
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    WHERE ri.recebimento_id = ?`, [recebimentoId]);

  // ── 1. Pre-checagem: nada se move enquanto houver item invalido ──
  const problemas = [];
  for (const item of itens) {
    if (!(quantidadeDoItem(item) > 0)) continue; // item sem quantidade nao move estoque
    if (item.entrada_estoque_em) continue;       // ja entrou numa tentativa anterior
    if (!item.material_ativo) {
      problemas.push(`${item.material_codigo}: material inativo nao pode ser movimentado`);
      continue;
    }
    if (item.controle_lote && !(item.lote && String(item.lote).trim())) {
      problemas.push(`${item.material_codigo}: preencha o campo Lote (o material tem controle por lote)`);
      continue;
    }
    // Serie (Etapa 6b, Task 6): mesma cardinalidade que o motor vai exigir com `exigeSerie`,
    // antecipada aqui pelo mesmo motivo do lote acima — a nota inteira e recusada de uma vez,
    // em vez de entrar itens bons e travar no item ruim no meio do laco de efeito.
    if (item.controle_serie) {
      const qtdSerie = quantidadeDoItem(item);
      if (!Number.isInteger(qtdSerie)) {
        problemas.push(`${item.material_codigo}: quantidade fracionaria com controle de serie`);
        continue;
      }
      const numerosInformados = parseSeries(item.series).length;
      if (numerosInformados !== qtdSerie) {
        problemas.push(`${item.material_codigo}: informe ${qtdSerie} serie(s) — recebidas ${numerosInformados}`);
        continue;
      }
    }
    // Mesma resolucao e mesma validacao que o motor fara — antecipada aqui para que a nota seja
    // recusada inteira em vez de parar no meio.
    const material = { localizacao_padrao_id: item.localizacao_padrao_id, tipo_material: item.tipo_material };
    try {
      await validarLocalizacaoParaMovimento(
        db, resolveLocalizacaoEntrada(material, localizacao_id), material, 'destino');
    } catch (e) {
      problemas.push(`${item.material_codigo}: ${e.message}`);
    }
  }
  if (problemas.length) {
    throw Object.assign(
      new Error(`Nao foi possivel dar entrada no estoque: ${problemas.join('; ')}`),
      { status: 400 });
  }

  // ── 2. Entrada item a item, cada um reclamado antes de mover ──
  for (const item of itens) {
    // Etapa 5: a inspecao deixou de ser PRE-REQUISITO da entrada e passou a ser passo posterior.
    // O material esta fisicamente no galpao desde o descarregamento — barrar a entrada fazia o
    // sistema negar o que existe, e o bloqueio da inspecao recaia sobre saldo que ainda nao
    // tinha entrado. Agora entra sempre; o que exige inspecao entra RETIDO.
    const cfg = await dbGet(db, "SELECT valor FROM configuracoes_almoxarifado WHERE chave = 'inspecao_material_critico'");
    const reter = !!item.material_critico && cfg?.valor === '1';

    const qtd = quantidadeDoItem(item);
    if (qtd > 0) {
      // Claim no WHERE, padrao do modulo: de duas execucoes (reprocessamento, ou dois cliques
      // simultaneos em "Processar Nota") so uma casa `entrada_estoque_em IS NULL` e move estoque.
      const claim = await dbGet(db, `UPDATE recebimentos_material_itens_almoxarifado
        SET entrada_estoque_em = CURRENT_TIMESTAMP
        WHERE id = ? AND entrada_estoque_em IS NULL
        RETURNING id`, [item.id]);
      if (!claim) continue; // este item ja entrou — reprocessar nao credita de novo

      let entrouFisicamente = false;
      try {
        // Etapa 6: o lote nasce aqui, herdando o que a NF ja sabe. Ate esta etapa, `controle_certificado`
        // era selecionado nesta query (linha do SELECT acima) e NUNCA usado — quem auditasse por grep
        // concluia que a entrada verificava certificado. Agora verifica. Dentro do `if (qtd > 0)` de
        // proposito (fix round 1, achado do review): item com quantidade zero nao move estoque, entao
        // nao devia criar lote nem gravar lote_id nele.
        let loteId = null;
        if (item.lote && String(item.lote).trim()) {
          // So o controle do material decide o bloqueio. `certificado_arquivo` nao existe nesta
          // query (as tres colunas de certificado vivem em lotes_almoxarifado, nao no item do
          // recebimento) — testar por ele aqui sempre dava falso e acertava por constante, nao por
          // semantica (fix round 1, achado do review).
          const semCertificado = !!item.controle_certificado;
          const lote = await lotService.criarOuObterLote(db, user, {
            material_id: item.material_id,
            codigo: item.lote,
            fornecedor_id: rec.fornecedor_id,
            fornecedor_nome: rec.fornecedor_nome,
            corrida: item.corrida_lote,
            // Review final da Etapa 6: `lotes_almoxarifado.data_fabricacao` existia desde a Task 1
            // e NINGUEM a escrevia. Este e o escritor — o quarto campo de lote da tela do
            // recebimento (Lote / Validade / Fabricacao / Corrida).
            data_fabricacao: item.data_fabricacao_lote,
            data_validade: item.data_validade_lote,
            nota_fiscal: rec.nota_fiscal,
            recebimento_id: recebimentoId,
            recebimento_item_id: item.id,
            // Entra bloqueado, nao barrado: o material esta fisicamente no galpao. Barrar a ENTRADA
            // foi exatamente o erro corrigido na Etapa 5.
            status: semCertificado ? 'BLOQUEADO' : 'ATIVO',
            status_motivo: semCertificado ? 'Certificado do fornecedor nao anexado' : null,
          });
          loteId = lote.id;
          await dbRun(db, 'UPDATE recebimentos_material_itens_almoxarifado SET lote_id = ? WHERE id = ?',
            [loteId, item.id]);
        }

        await registrarMovimentacao(db, user, {
          material_id: item.material_id,
          tipo: 'ENTRADA_COMPRA',
          quantidade: qtd,
          motivo: `Recebimento ${rec.numero}`,
          referencia: rec.nota_fiscal,
          recebimento_id: recebimentoId,
          localizacao_destino_id: localizacao_id,
          lote_id: loteId,
          documento_vinculado: rec.numero,
          // Etapa 6b, Task 6: a serie nasce aqui. O motor (com exigeSerie) cria/reativa cada
          // numero em series_almoxarifado vinculado ao loteIdFinal e a localizacao de entrada —
          // o vinculo com ESTE recebimento/item e griffado logo abaixo, porque o motor nao
          // conhece recebimento_id/recebimento_item_id (so o chamador conhece).
          series: parseSeries(item.series),
        // O recebimento E um dos caminhos onde o operador tem como informar o lote (a tela tem os
        // campos Lote/Validade/Fabricacao/Corrida por item), entao a exigencia de `controle_lote`
        // vale aqui. A pre-checagem acima ja recusou a nota inteira nesse caso — esta declaracao
        // e a rede: se um item escapar da pre-checagem, o motor ainda barra. Mesma logica para
        // `exigeSerie`: o recebimento e um caminho onde o operador tem como informar as series.
        }, { exigeLote: true, exigeSerie: true });
        entrouFisicamente = true;

        // Griffa a origem: as series que o motor acabou de criar/reativar para este material
        // ainda nao sabem de qual recebimento/item elas vieram (o motor so grava
        // movimentacao_entrada_id). Casa por numero+material — o unico jeito de saber QUAIS
        // linhas de series_almoxarifado pertencem a ESTE item, ja que series_almoxarifado nao
        // tem FK direta para recebimentos_material_itens_almoxarifado no momento da criacao.
        const numerosSerie = parseSeries(item.series);
        if (numerosSerie.length > 0) {
          await dbRun(db, `UPDATE series_almoxarifado
              SET recebimento_id = ?, recebimento_item_id = ?
            WHERE material_id = ? AND numero IN (${numerosSerie.map(() => '?').join(',')})`,
            [recebimentoId, item.id, item.material_id, ...numerosSerie]);
        }

        if (reter) {
          await registrarMovimentacao(db, user, {
            material_id: item.material_id,
            tipo: 'QUARENTENA',
            quantidade: qtd,
            motivo: `Retido para inspeção — recebimento ${rec.numero}`,
            justificativa: `Material crítico aguardando inspeção (recebimento ${rec.numero})`,
            recebimento_id: recebimentoId,
          });
          // Etapa 5, correcao de review: quantidade_em_inspecao do MATERIAL e um pool
          // compartilhado entre itens de recebimentos diferentes. Sem isto, inspectionService não
          // tinha como saber quanto DESTE item especifico esta retido — inferia de
          // quantidade_recebida, que conferirRecebimento pode sobrescrever sem guarda de status.
          await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado
            SET quantidade_em_inspecao = COALESCE(quantidade_em_inspecao,0) + ? WHERE id = ?`,
            [qtd, item.id]);
        }
      } catch (e) {
        // Compensacao explicita (nao ha transacao): a marca so e devolvida se NADA entrou. Se a
        // entrada fisica ja aconteceu e o passo seguinte falhou, a marca FICA — reprocessar nao
        // pode creditar o mesmo saldo duas vezes, que e o defeito que esta funcao passou a evitar.
        if (!entrouFisicamente) {
          await dbRun(db,
            'UPDATE recebimentos_material_itens_almoxarifado SET entrada_estoque_em = NULL WHERE id = ?',
            [item.id]);
        }
        throw e;
      }
    }
  }
}

async function gerarContaPagar(db, rec) {
  const tableExists = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='contas_pagar'");
  if (!tableExists) return null;

  const descricao = `NF ${rec.nota_fiscal}${rec.nota_serie ? `/${rec.nota_serie}` : ''} — ${rec.numero}`;
  const r = await dbRun(db, `INSERT INTO contas_pagar
    (descricao, fornecedor, valor, data_vencimento, status, categoria, observacoes)
    VALUES (?,?,?,?,?,?,?)`, [
    descricao,
    rec.fornecedor_nome || rec.fornecedor_cnpj || 'Fornecedor',
    rec.valor_total_nota,
    rec.data_entrada_nf || new Date().toISOString().split('T')[0],
    'pendente',
    'Material/Compras',
    [
      `Recebimento ${rec.numero}`,
      rec.chave_nfe ? `Chave NF-e: ${rec.chave_nfe}` : null,
      rec.pedido_compra_numero ? `Pedido: ${rec.pedido_compra_numero}` : null,
    ].filter(Boolean).join(' | '),
  ]);
  return r.lastID;
}

async function processarNota(db, user, recebimentoId, { localizacao_id } = {}) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });
  if ([STATUS.PROCESSADO, STATUS.APROVADO].includes(rec.status)) {
    throw Object.assign(new Error('Nota já processada'), { status: 400 });
  }

  const statusPermitidos = [STATUS.EM_ENTRADA_NF, STATUS.ENCAMINHADO_FATURAMENTO];
  if (!statusPermitidos.includes(rec.status)) {
    throw Object.assign(new Error('Processe a nota somente após entrada no faturamento'), { status: 400 });
  }

  validarDadosProcessamento(rec);
  await darEntradaEstoque(db, user, rec, recebimentoId, { localizacao_id });
  const contasPagarId = await gerarContaPagar(db, rec);

  await dbRun(db, `UPDATE recebimentos_material_almoxarifado SET
    status = 'PROCESSADO', etapa_atual = 'CONCLUIDO',
    faturamento_responsavel_id = ?, faturamento_responsavel_nome = ?,
    faturamento_data = CURRENT_TIMESTAMP, contas_pagar_id = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`, [
    user.id, user.nome || user.email, contasPagarId, recebimentoId,
  ]);

  await registrarAuditoria(db, {
    entidade: 'recebimento', entidade_id: recebimentoId, acao: 'PROCESSAR_NOTA',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
  });

  return { success: true, status: STATUS.PROCESSADO, contas_pagar_id: contasPagarId };
}

async function aprovarRecebimento(db, user, recebimentoId, opts = {}) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) throw Object.assign(new Error('Recebimento não encontrado'), { status: 404 });
  if ([STATUS.PROCESSADO, STATUS.APROVADO].includes(rec.status)) {
    throw Object.assign(new Error('Recebimento já aprovado/processado'), { status: 400 });
  }

  if ([STATUS.EM_ENTRADA_NF, STATUS.ENCAMINHADO_FATURAMENTO].includes(rec.status)) {
    return processarNota(db, user, recebimentoId, opts);
  }

  await darEntradaEstoque(db, user, rec, recebimentoId, opts);
  await dbRun(db, `UPDATE recebimentos_material_almoxarifado
    SET status = 'APROVADO', etapa_atual = 'CONCLUIDO', updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [recebimentoId]);
  return { success: true };
}

async function listarRecebimentos(db, filters = {}) {
  let sql = 'SELECT * FROM recebimentos_material_almoxarifado WHERE 1=1';
  const params = [];
  if (filters.status) { sql += ' AND status = ?'; params.push(filters.status); }
  if (filters.etapa) { sql += ' AND etapa_atual = ?'; params.push(filters.etapa); }
  sql += ' ORDER BY created_at DESC';
  return dbAll(db, sql, params);
}

async function listarPedidosCompraAux(db, { search } = {}) {
  const tableExists = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos_compra'");
  if (!tableExists) return [];

  let sql = `SELECT p.id, p.numero, p.valor_total, p.status, p.data_pedido,
    f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj
    FROM pedidos_compra p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (p.numero LIKE ? OR f.razao_social LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY p.created_at DESC LIMIT 50';
  return dbAll(db, sql, params);
}

async function listarFornecedoresAux(db, { search } = {}) {
  const tableExists = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='fornecedores'");
  if (!tableExists) return [];

  let sql = 'SELECT id, razao_social, nome_fantasia, cnpj FROM fornecedores WHERE status = ?';
  const params = ['ativo'];
  if (search) {
    sql += ' AND (razao_social LIKE ? OR nome_fantasia LIKE ? OR cnpj LIKE ?)';
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  sql += ' ORDER BY razao_social LIMIT 50';
  return dbAll(db, sql, params);
}

async function getRecebimento(db, id) {
  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [id]);
  if (!rec) return null;
  const itens = await dbAll(db, `SELECT ri.*, m.nome as material_nome, m.codigo as material_codigo, m.unidade
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    WHERE ri.recebimento_id = ?`, [id]);

  let pedido_compra = null;
  if (rec.pedido_compra_id) {
    pedido_compra = await dbGet(db, `SELECT p.*, f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj
      FROM pedidos_compra p LEFT JOIN fornecedores f ON p.fornecedor_id = f.id WHERE p.id = ?`, [rec.pedido_compra_id]);
  }

  return { ...rec, itens, pedido_compra };
}

module.exports = {
  STATUS,
  ETAPAS,
  criarRecebimento,
  conferirRecebimento,
  aprovarRecebimento,
  // Exportada para teste (review final da Etapa 6): a pre-checagem e a marca de idempotencia
  // precisam ser exercitadas com um item que falha no meio, e chegar la pelo workflow inteiro do
  // recebimento tornaria o teste sobre o workflow, nao sobre a entrada.
  darEntradaEstoque,
  avancarWorkflow,
  salvarDadosFiscal,
  processarNota,
  listarRecebimentos,
  listarPedidosCompraAux,
  listarFornecedoresAux,
  getRecebimento,
};
