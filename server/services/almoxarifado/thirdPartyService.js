/**
 * Ciclo da remessa para terceiros (Etapa 8b).
 *
 * O que este servico NAO faz: ele nao mexe em saldo com SQL proprio. Todo efeito de estoque passa
 * por stockService.registrarMovimentacao, com os quatro tipos da Task 4 — e por isso lote, endereco,
 * livro de movimentacoes e auditoria funcionam de graca. Foi exatamente o que a ilha de materiais
 * de cliente NAO dava, e o que a Etapa 8 gastou uma etapa inteira para desfazer.
 *
 * Sem transacao (padrao do modulo): o envio segue a forma de receiptService.darEntradaEstoque —
 * PRE-CHECAGEM que recusa o documento INTEIRO antes de mover qualquer item, depois efeito item a
 * item com claim no WHERE. A Etapa 7 mostrou por que: reprocessar nota com falha no meio duplicava
 * estoque.
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { can } = require('./permissions');
const { registrarAuditoria } = require('./audit');
const { disponivelSql } = require('./availabilitySql');
const stockService = require('./stockService');
const sm = require('./thirdPartyStateMachine');

const DESTINOS_ENCERRAMENTO = ['PERDA_NO_TERCEIRO', 'CONSUMIDO_NO_PROCESSO'];
/** destino do encerramento -> tipo de movimento que o executa (Task 4). */
const TIPO_MOVIMENTO_DESTINO = {
  PERDA_NO_TERCEIRO: 'PERDA_TERCEIRO',
  CONSUMIDO_NO_PROCESSO: 'CONSUMO_TERCEIRO',
};

const erro = (msg, status = 400) => Object.assign(new Error(msg), { status });

function gerarNumero() {
  return `REM-${Date.now().toString().slice(-8)}${Math.floor(Math.random() * 100)}`;
}

function assertPodeRemessar(user) {
  if (!can(user, 'remessar_terceiro')) {
    throw erro('Sem permissao para remessa a terceiros (acao: remessar_terceiro)', 403);
  }
}

/**
 * Resolve o fornecedor por id OU por nome, no molde de receiptService.resolverPedidoCompra.
 *
 * Consulta `sqlite_master` antes de tocar em `fornecedores` porque a tabela e criada em
 * server/index.js, NAO pelo initSchema do almoxarifado — mesma protecao de
 * receiptService.listarFornecedoresAux. Quando a tabela nao existe, a remessa ainda pode ser criada
 * com `fornecedor_nome` digitado: o terceiro pode nao estar cadastrado em Compras, e travar a
 * remessa por causa disso pararia o galpao.
 */
async function resolverFornecedor(db, { fornecedor_id, fornecedor_nome }) {
  const existe = await dbGet(db, "SELECT name FROM sqlite_master WHERE type='table' AND name='fornecedores'");
  if (existe && fornecedor_id) {
    const f = await dbGet(db, 'SELECT id, razao_social FROM fornecedores WHERE id = ?', [fornecedor_id]);
    if (!f) throw erro(`Fornecedor ${fornecedor_id} nao encontrado`);
    return { fornecedor_id: f.id, fornecedor_nome: f.razao_social };
  }
  if (fornecedor_id && !existe) {
    return { fornecedor_id, fornecedor_nome: fornecedor_nome || null };
  }
  if (fornecedor_nome && String(fornecedor_nome).trim()) {
    return { fornecedor_id: null, fornecedor_nome: String(fornecedor_nome).trim() };
  }
  throw erro('Informe o fornecedor (terceiro) da remessa');
}

/**
 * Descobre o proprietario da remessa a partir dos materiais dos itens, e RECUSA remessa que mistura
 * donos diferentes (decisao 5 do design).
 *
 * A remessa e isenta da guarda de OS/projeto porque mandar galvanizar nao e aplicar a chapa em
 * ninguem — e a contrapartida dessa isencao e que o documento NOMEIA um proprietario. Um documento
 * com material de dois clientes (ou de um cliente misturado com o nosso) nao tem como nomear um so,
 * e a isencao viraria um caminho para material de cliente sair do predio sem rastro de propriedade.
 * A mensagem nomeia OS DOIS: sem isso o operador nao sabe qual item tirar.
 *
 * ATENCAO — REGRA DEDUZIDA, NAO CONFIRMADA COM O CLIENTE. "Uma remessa nao mistura donos" nao veio
 * da GMP: foi DEDUZIDO ao escrever o plano da 8b, a partir de o design dizer que o documento nomeia
 * "o proprietario", no singular. Se a GMP mandar remessas mistas na pratica (uma carreta para o
 * galvanizador com chapa de dois clientes), a regra a mudar e esta, e a saida ja esta desenhada:
 * o documento passa a LISTAR OS DONOS POR ITEM em vez de nomear um so — as colunas
 * `proprietario_cliente_id/nome` do cabecalho viram derivadas (ou nulas em remessa mista) e o dono
 * passa a ser lido do material de cada item, que ja e a fonte de verdade. Nada aqui e irreversivel;
 * so nao invente a mistura antes de a GMP pedir.
 */
async function resolverProprietario(db, materiais) {
  const donos = [...new Set(materiais.map((m) => m.proprietario_cliente_id || null))];
  if (donos.length === 1 && donos[0] === null) return { proprietario_cliente_id: null, proprietario_cliente_nome: null };
  const nomeDe = async (id) => {
    if (!id) return 'estoque proprio (material nosso)';
    const c = await dbGet(db, 'SELECT razao_social FROM clientes WHERE id = ?', [id]);
    return c?.razao_social || `cliente #${id}`;
  };
  if (donos.length > 1) {
    const nomes = [];
    for (const d of donos) nomes.push(await nomeDe(d));
    throw erro(`A remessa mistura materiais de donos diferentes (${nomes.join(' e ')}). `
      + 'O documento de remessa nomeia UM proprietario — separe em remessas diferentes.');
  }
  return { proprietario_cliente_id: donos[0], proprietario_cliente_nome: await nomeDe(donos[0]) };
}

async function criarRemessa(db, user, data) {
  assertPodeRemessar(user);
  const { tipo_servico, os_id, projeto_id, pedido_compra_id, prazo_previsto, observacoes } = data;
  const itens = Array.isArray(data.itens) ? data.itens : [];
  if (itens.length === 0) throw erro('A remessa precisa de ao menos um item');

  const materiais = [];
  for (const it of itens) {
    const qtd = Number(it.quantidade);
    if (!(qtd > 0)) throw erro('Quantidade do item da remessa deve ser maior que zero');
    const m = await dbGet(db,
      'SELECT id, codigo, nome, unidade, ativo, proprietario_cliente_id FROM materiais_almoxarifado WHERE id = ?',
      [it.material_id]);
    if (!m) throw erro(`Material ${it.material_id} nao encontrado`);
    if (!m.ativo) throw erro(`Material ${m.codigo} esta inativo e nao pode ir para o terceiro`);
    materiais.push(m);
  }

  const fornecedor = await resolverFornecedor(db, data);
  const proprietario = await resolverProprietario(db, materiais);
  const numero = gerarNumero();

  const r = await dbRun(db, `INSERT INTO remessas_terceiro_almoxarifado
    (numero, fornecedor_id, fornecedor_nome, tipo_servico, os_id, projeto_id, pedido_compra_id,
     proprietario_cliente_id, proprietario_cliente_nome, prazo_previsto, status, observacoes,
     criado_por, criado_por_nome)
    VALUES (?,?,?,?,?,?,?,?,?,?,'ABERTA',?,?,?)`, [
    numero, fornecedor.fornecedor_id, fornecedor.fornecedor_nome, tipo_servico || null,
    os_id || null, projeto_id || null, pedido_compra_id || null,
    proprietario.proprietario_cliente_id, proprietario.proprietario_cliente_nome,
    prazo_previsto || null, observacoes || null, user.id, user.nome || user.email,
  ]);
  const remessaId = r.lastID;

  const criados = [];
  for (const it of itens) {
    const linha = await dbRun(db, `INSERT INTO itens_remessa_terceiro_almoxarifado
      (remessa_id, material_id, quantidade, lote_id, peso, observacoes) VALUES (?,?,?,?,?,?)`,
    [remessaId, it.material_id, Number(it.quantidade), it.lote_id || null, it.peso || null,
      it.observacoes || null]);
    criados.push({ id: linha.lastID, material_id: it.material_id, quantidade: Number(it.quantidade) });
  }

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro',
    entidade_id: remessaId,
    acao: 'CRIACAO',
    usuario_id: user.id,
    usuario_nome: user.nome || user.email,
    dados_novos: {
      numero,
      fornecedor: fornecedor.fornecedor_nome,
      itens: criados.length,
      proprietario_cliente_nome: proprietario.proprietario_cliente_nome,
    },
  }).catch(() => { /* auditoria nao bloqueia a criacao */ });

  return {
    id: remessaId,
    numero,
    status: 'ABERTA',
    fornecedor_id: fornecedor.fornecedor_id,
    fornecedor_nome: fornecedor.fornecedor_nome,
    proprietario_cliente_id: proprietario.proprietario_cliente_id,
    proprietario_cliente_nome: proprietario.proprietario_cliente_nome,
    prazo_previsto: prazo_previsto || null,
    itens: criados,
  };
}

async function getRemessaBase(db, id) {
  const r = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [id]);
  if (!r) throw erro('Remessa nao encontrada', 404);
  return r;
}

/**
 * Envia a remessa: retem o saldo de TODOS os itens.
 *
 * Molde de receiptService.darEntradaEstoque, e nao por gosto: (1) PRE-CHECAGEM que recusa a remessa
 * INTEIRA — o operador conserta o item que falta e reenvia, em vez de descobrir que metade saiu e
 * metade nao; (2) claim `enviado_em IS NULL` no ITEM, para reprocessamento ou dois cliques nao
 * reterem o dobro.
 */
async function enviarRemessa(db, user, remessaId) {
  assertPodeRemessar(user);
  const remessa = await getRemessaBase(db, remessaId);
  const t = sm.validarTransicao(remessa.status, 'ENVIADA');
  if (!t.ok) throw erro(t.erro);

  const itens = await dbAll(db, `SELECT i.*, m.codigo AS material_codigo, m.unidade, m.ativo,
      ${disponivelSql('m')} AS disponivel
    FROM itens_remessa_terceiro_almoxarifado i
    JOIN materiais_almoxarifado m ON i.material_id = m.id
    WHERE i.remessa_id = ? ORDER BY i.id`, [remessaId]);
  if (itens.length === 0) throw erro('A remessa nao tem itens para enviar');

  // ── 1. Pre-checagem: a remessa INTEIRA e recusada antes de mover qualquer item ──
  //
  // A soma e POR MATERIAL, nao por linha, e isto e correcao de um defeito real do codigo que o
  // plano trazia pronto (achado na execucao da Task 5, com sonda executada — leitura e suite verde
  // nao pegavam). Checando cada linha sozinha contra o disponivel, duas linhas de 60 de um material
  // com 100 passavam as DUAS (60 <= 100, duas vezes): a primeira era enviada e a segunda batia no
  // claim do motor, deixando em_terceiros = 60, um item reclamado, o outro nao, e a remessa em
  // ABERTA — a remessa pela metade, que e exatamente o que esta pre-checagem existe para impedir.
  // Duas linhas do mesmo material sao caso normal: o item tem lote_id, peso e observacoes proprios
  // justamente para separar duas chapas do mesmo codigo.
  //
  // Item ja enviado num envio anterior fica FORA da soma de proposito: a quantidade dele ja esta
  // retida, e `disponivel` ja a exclui — soma-la de novo recusaria um reenvio legitimo.
  const pedidoPorMaterial = new Map();
  for (const item of itens) {
    if (item.enviado_em) continue; // ja enviado num envio anterior — nao entra na checagem
    const acc = pedidoPorMaterial.get(item.material_id)
      || { codigo: item.material_codigo, unidade: item.unidade, ativo: item.ativo,
        disponivel: item.disponivel, pedido: 0, linhas: 0 };
    acc.pedido += Number(item.quantidade);
    acc.linhas += 1;
    pedidoPorMaterial.set(item.material_id, acc);
  }
  const problemas = [];
  for (const m of pedidoPorMaterial.values()) {
    if (!m.ativo) { problemas.push(`${m.codigo}: material inativo`); continue; }
    if (Number(m.disponivel) < m.pedido) {
      // A mensagem DIZ o numero: sem ele o operador tem de adivinhar quanto falta (licao da Etapa 7).
      // E quando o material aparece em varias linhas, DIZ ISSO tambem — senao o operador olha uma
      // linha de 60, ve 100 disponiveis e conclui que o sistema esta errado.
      problemas.push(`${m.codigo}: disponivel ${m.disponivel} ${m.unidade}, `
        + `a remessa pede ${m.pedido}${m.linhas > 1 ? ` em ${m.linhas} linhas` : ''}`);
    }
  }
  if (problemas.length) {
    throw erro(`Nao foi possivel enviar a remessa ${remessa.numero}: ${problemas.join('; ')}`);
  }

  // ── 2. Efeito item a item, cada um reclamado antes de mover ──
  let enviados = 0;
  for (const item of itens) {
    const claim = await dbGet(db, `UPDATE itens_remessa_terceiro_almoxarifado
      SET enviado_em = CURRENT_TIMESTAMP
      WHERE id = ? AND enviado_em IS NULL
      RETURNING id`, [item.id]);
    if (!claim) continue; // este item ja saiu — reenviar nao retem de novo

    try {
      const mov = await stockService.registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'REMESSA_TERCEIRO',
        quantidade: Number(item.quantidade),
        lote_id: item.lote_id || undefined,
        os_id: remessa.os_id || undefined,
        projeto_id: remessa.projeto_id || undefined,
        cliente_id: remessa.proprietario_cliente_id || undefined,
        referencia: remessa.numero,
        justificativa: `Remessa ${remessa.numero} para ${remessa.fornecedor_nome || 'terceiro'}`
          + (remessa.tipo_servico ? ` (${remessa.tipo_servico})` : ''),
      });
      await dbRun(db, 'UPDATE itens_remessa_terceiro_almoxarifado SET movimentacao_envio_id = ? WHERE id = ?',
        [mov?.id || mov?.movimentacao_id || null, item.id]);
      enviados += 1;
    } catch (e) {
      // Sem transacao: compensa o claim a mao, senao o item fica marcado como enviado sem a
      // retencao correspondente — e nunca mais seria reenviado.
      await dbRun(db, 'UPDATE itens_remessa_terceiro_almoxarifado SET enviado_em = NULL WHERE id = ?', [item.id]);
      throw e;
    }
  }

  await dbRun(db, `UPDATE remessas_terceiro_almoxarifado
    SET status = 'ENVIADA', enviado_em = COALESCE(enviado_em, CURRENT_TIMESTAMP), enviado_por = ?,
        updated_at = CURRENT_TIMESTAMP
    WHERE id = ?`, [user.id, remessaId]);

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro',
    entidade_id: remessaId,
    acao: 'ENVIO',
    usuario_id: user.id,
    usuario_nome: user.nome || user.email,
    dados_anteriores: { status: remessa.status },
    dados_novos: { status: 'ENVIADA', itens_enviados: enviados },
  }).catch(() => {});

  return { success: true, remessa_id: Number(remessaId), status: 'ENVIADA', itens_enviados: enviados };
}

/** Remessa completa: cabecalho + itens (com `pendente` calculado) + retornos ja recebidos. */
async function getRemessa(db, id) {
  const r = await dbGet(db, 'SELECT * FROM remessas_terceiro_almoxarifado WHERE id = ?', [id]);
  if (!r) return null;
  const itens = await dbAll(db, `SELECT i.*, m.codigo AS material_codigo, m.nome AS material_nome,
      m.unidade, (i.quantidade - COALESCE(i.quantidade_retornada,0)) AS pendente
    FROM itens_remessa_terceiro_almoxarifado i
    JOIN materiais_almoxarifado m ON i.material_id = m.id
    WHERE i.remessa_id = ? ORDER BY i.id`, [id]);
  const retornos = await dbAll(db, `SELECT rr.*, m.codigo AS material_codigo, m.nome AS material_nome, m.unidade
    FROM retornos_remessa_item_almoxarifado rr
    JOIN materiais_almoxarifado m ON rr.material_id = m.id
    WHERE rr.remessa_id = ? ORDER BY rr.id`, [id]);
  return { ...r, itens, retornos };
}

/**
 * Lista para a tela. `vencida` e calculado no SQL (e nao no client) para o filtro por vencidas e o
 * destaque visual usarem o MESMO criterio — duas contas dariam telas que discordam.
 * So remessa que ainda tem material la fora pode estar vencida: encerrada/cancelada nao atrasa.
 */
async function listarRemessas(db, filtros = {}) {
  let sql = `SELECT r.*,
      (SELECT COUNT(*) FROM itens_remessa_terceiro_almoxarifado i WHERE i.remessa_id = r.id) AS itens_total,
      CASE WHEN r.prazo_previsto IS NOT NULL
             AND r.status IN ('ENVIADA','RETORNO_PARCIAL')
             AND date(r.prazo_previsto) < date(COALESCE(?, 'now'))
           THEN 1 ELSE 0 END AS vencida
    FROM remessas_terceiro_almoxarifado r WHERE 1=1`;
  const params = [filtros.referencia || null];
  if (filtros.status) { sql += ' AND r.status = ?'; params.push(filtros.status); }
  if (filtros.fornecedor_id) { sql += ' AND r.fornecedor_id = ?'; params.push(Number(filtros.fornecedor_id)); }
  if (String(filtros.vencidas) === '1') {
    sql += " AND r.prazo_previsto IS NOT NULL AND r.status IN ('ENVIADA','RETORNO_PARCIAL')"
      + " AND date(r.prazo_previsto) < date(COALESCE(?, 'now'))";
    params.push(filtros.referencia || null);
  }
  sql += ' ORDER BY r.created_at DESC, r.id DESC';
  return dbAll(db, sql, params);
}

module.exports = {
  DESTINOS_ENCERRAMENTO, TIPO_MOVIMENTO_DESTINO,
  criarRemessa, enviarRemessa, getRemessa, listarRemessas,
};
