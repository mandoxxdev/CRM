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

/**
 * Valida o retorno de UM item e devolve a linha dele. Molde de returnService.validarSaidaOriginal
 * (Etapa 7): cada recusa nomeia a razao ESPECIFICA e o teto DIZ os numeros. Uma mensagem generica
 * de "quantidade invalida" deixa o operador sem saber se ele errou o item, se a remessa nao foi
 * enviada, ou se ja devolveu tudo.
 *
 * `quantidade` e o total ACUMULADO que o recebimento pede daquele item (ver registrarRetorno), nao
 * a linha isolada; `linhas` so existe para a mensagem dizer que o item aparece em mais de uma.
 * `remessaId` e OBRIGATORIO: e ele que impede retornar um item que pertence a outra remessa.
 */
async function validarRetornoDoItem(db, { remessaId, itemRemessaId, quantidade, materialId, linhas = 1 }) {
  const item = await dbGet(db, `SELECT i.*, m.codigo AS material_codigo, m.unidade
    FROM itens_remessa_terceiro_almoxarifado i
    JOIN materiais_almoxarifado m ON i.material_id = m.id
    WHERE i.id = ?`, [itemRemessaId]);
  if (!item) throw erro(`Item de remessa ${itemRemessaId} nao encontrado`);
  if (Number(item.remessa_id) !== Number(remessaId)) {
    throw erro(`O item ${itemRemessaId} pertence a outra remessa`);
  }
  if (!item.enviado_em) {
    throw erro(`O item ${item.material_codigo} ainda nao foi enviado ao terceiro — nao ha o que retornar`);
  }
  const qtd = Number(quantidade);
  if (!(qtd > 0)) throw erro('Quantidade do retorno deve ser maior que zero');

  // Etapa 8c: aqui e onde `materialId` diferente do enviado passa a ser aceito (chapa -> pecas).
  // Na 8b recusar e melhor que aceitar pela metade: creditar outro material sem baixar a chapa
  // original criaria estoque do nada e quebraria a rastreabilidade que a 8c existe para dar.
  if (materialId && Number(materialId) !== Number(item.material_id)) {
    throw erro(`O retorno de material DIFERENTE do enviado (transformacao: ${item.material_codigo} `
      + 'vira outro codigo) e a Etapa 8c e ainda nao esta implementado. Na Etapa 8b o retorno e '
      + 'sempre do mesmo material.');
  }

  // O teto e do ITEM, nao do material: dois itens do MESMO material na mesma remessa (duas chapas
  // do mesmo codigo, com lote e peso proprios) tem cada um o seu pendente. Comparar contra
  // `quantidade_em_terceiros` do material deixaria um item devolver o que o outro mandou, e o
  // documento passaria a discordar do saldo — e a Etapa 8c, que rastreia resultado POR ITEM
  // enviado, herdaria o desalinhamento.
  const restante = Number(item.quantidade) - Number(item.quantidade_retornada || 0);
  if (qtd > restante) {
    // A mensagem DIZ os numeros: sem eles o operador tem de adivinhar (licao da Etapa 7). E quando
    // o item aparece em varias linhas do MESMO recebimento, diz isso tambem — senao o operador
    // olha uma linha de 60, ve 100 no terceiro e conclui que o sistema esta errado (foi o que a
    // Task 5 aprendeu no envio).
    throw erro(`Retorno acima do enviado: o item ${item.material_codigo} enviou ${item.quantidade} `
      + `${item.unidade}, ja retornaram ${item.quantidade_retornada || 0} e ainda estao no terceiro `
      + `${restante} — este recebimento pede ${qtd}${linhas > 1 ? ` em ${linhas} linhas` : ''}`);
  }
  return item;
}

/**
 * Registra um recebimento de retorno — possivelmente com varios itens de uma vez.
 *
 * O retorno NAO credita estoque: `quantidade_em_terceiros` desce e `quantidade_atual` nao muda,
 * porque o material nunca saiu do patrimonio — ele so estava a 40 km. Creditar aqui contaria a
 * mesma chapa duas vezes. Quem faz isso e o motor (RETORNO_TERCEIRO, Task 4); este servico so
 * orquestra.
 *
 * Mesma forma do envio (decisao 9): PRE-CHECAGEM de todos os itens, depois efeito item a item. Um
 * item acima do pendente recusa o recebimento INTEIRO — creditar metade deixaria o operador sem
 * saber o que ja entrou.
 *
 * Encerra sozinha quando nao sobra pendencia: nao ha o que justificar, e exigir destino nesse caso
 * obrigaria o operador a inventar uma perda que nao houve.
 */
async function registrarRetorno(db, user, remessaId, data) {
  assertPodeRemessar(user);
  const remessa = await getRemessaBase(db, remessaId);
  if (!sm.PODE_RECEBER_RETORNO.includes(remessa.status)) {
    throw erro(`Remessa em ${remessa.status} nao recebe retorno `
      + `(recebem: ${sm.PODE_RECEBER_RETORNO.join(', ')})`);
  }
  const itens = Array.isArray(data?.itens) ? data.itens : [];
  if (itens.length === 0) throw erro('Informe ao menos um item retornado');

  // ── 1. Pre-checagem: o recebimento INTEIRO e recusado antes de creditar qualquer item ──
  //
  // A soma e POR ITEM, nao por linha do documento — a mesma regra que a Task 5 teve de consertar no
  // envio: toda pre-checagem "tudo ou nada" agrega pelo RECURSO ESCASSO (aqui, o pendente do item),
  // nunca pela linha. Sem o acumulador, dois resultados de 60 de um item de 100 passariam os DOIS
  // (60 <= 100, duas vezes), o primeiro seria creditado e o segundo bateria no claim: o recebimento
  // pela metade, que e exatamente o que esta pre-checagem existe para impedir.
  const linhasPorItem = new Map();
  for (const linha of itens) {
    const k = Number(linha.item_remessa_id);
    linhasPorItem.set(k, (linhasPorItem.get(k) || 0) + 1);
  }
  const validados = [];
  const jaPedido = new Map();
  for (const linha of itens) {
    const chave = Number(linha.item_remessa_id);
    const acumulado = jaPedido.get(chave) || 0;
    const item = await validarRetornoDoItem(db, {
      remessaId,
      itemRemessaId: linha.item_remessa_id,
      quantidade: Number(linha.quantidade) + acumulado,
      materialId: linha.material_id,
      linhas: linhasPorItem.get(chave) || 1,
    });
    jaPedido.set(chave, acumulado + Number(linha.quantidade));
    validados.push({ item, linha });
  }

  // ── 2. Efeito item a item ──
  for (const { item, linha } of validados) {
    const qtd = Number(linha.quantidade);
    const claim = await dbGet(db, `UPDATE itens_remessa_terceiro_almoxarifado
      SET quantidade_retornada = COALESCE(quantidade_retornada,0) + ?
      WHERE id = ? AND (quantidade - COALESCE(quantidade_retornada,0)) >= ?
      RETURNING id`, [qtd, item.id, qtd]);
    if (!claim) {
      // Corrida com outro recebimento concorrente do mesmo item: a pre-checagem passou, o claim
      // nao. Recusa em vez de saturar — saldo retornado a mais nao tem como ser desfeito depois.
      throw erro(`Retorno acima do enviado no item ${item.material_codigo}: outro recebimento `
        + 'foi registrado ao mesmo tempo. Recarregue a remessa e tente de novo.');
    }
    try {
      // `mov.id` e o contrato real de registrarMovimentacao ({ id, saldo_anterior, saldo_posterior }).
      // O plano escrevia `mov?.id || mov?.movimentacao_id`; o segundo termo e morto e foi tirado —
      // deixa-lo sugeriria um contrato `movimentacao_id` que nao existe.
      const mov = await stockService.registrarMovimentacao(db, user, {
        material_id: item.material_id,
        tipo: 'RETORNO_TERCEIRO',
        quantidade: qtd,
        lote_id: linha.lote_id || item.lote_id || undefined,
        referencia: remessa.numero,
        documento_vinculado: data.nota_fiscal || undefined,
        justificativa: `Retorno da remessa ${remessa.numero}`
          + (remessa.fornecedor_nome ? ` (${remessa.fornecedor_nome})` : ''),
      });
      await dbRun(db, `INSERT INTO retornos_remessa_item_almoxarifado
        (remessa_id, item_remessa_id, material_id, quantidade, lote_id, nota_fiscal, observacoes,
         movimentacao_id, recebido_por, recebido_por_nome)
        VALUES (?,?,?,?,?,?,?,?,?,?)`, [
        remessaId, item.id, item.material_id, qtd, linha.lote_id || item.lote_id || null,
        data.nota_fiscal || null, linha.observacoes || null,
        mov?.id || null, user.id, user.nome || user.email,
      ]);
    } catch (e) {
      // Sem transacao: devolve o claim, senao o item ficaria com quantidade_retornada maior que o
      // que voltou de verdade e o pendente encolheria sem o saldo ter sido liberado.
      await dbRun(db, `UPDATE itens_remessa_terceiro_almoxarifado
        SET quantidade_retornada = MAX(0, COALESCE(quantidade_retornada,0) - ?) WHERE id = ?`, [qtd, item.id]);
      throw e;
    }
  }

  // ── 3. Status ──
  const { pendente } = await dbGet(db, `SELECT
      COALESCE(SUM(quantidade - COALESCE(quantidade_retornada,0)), 0) AS pendente
    FROM itens_remessa_terceiro_almoxarifado WHERE remessa_id = ?`, [remessaId]);
  const novoStatus = Number(pendente) <= 0 ? 'ENCERRADA' : 'RETORNO_PARCIAL';
  const t = sm.validarTransicao(remessa.status, novoStatus);
  if (!t.ok) throw erro(t.erro);
  await dbRun(db, `UPDATE remessas_terceiro_almoxarifado
    SET status = ?, updated_at = CURRENT_TIMESTAMP,
        encerrado_em = CASE WHEN ? = 'ENCERRADA' THEN CURRENT_TIMESTAMP ELSE encerrado_em END,
        encerrado_por = CASE WHEN ? = 'ENCERRADA' THEN ? ELSE encerrado_por END
    WHERE id = ?`, [novoStatus, novoStatus, novoStatus, user.id, remessaId]);

  await registrarAuditoria(db, {
    entidade: 'remessa_terceiro',
    entidade_id: Number(remessaId),
    acao: 'RETORNO',
    usuario_id: user.id,
    usuario_nome: user.nome || user.email,
    dados_anteriores: { status: remessa.status },
    dados_novos: {
      status: novoStatus,
      resultados: validados.length,
      pendente_total: Number(pendente),
      nota_fiscal: data.nota_fiscal || null,
    },
  }).catch(() => {});

  return {
    success: true,
    remessa_id: Number(remessaId),
    status: novoStatus,
    resultados: validados.length,
    pendente_total: Number(pendente),
  };
}

module.exports = {
  DESTINOS_ENCERRAMENTO, TIPO_MOVIMENTO_DESTINO,
  criarRemessa, enviarRemessa, getRemessa, listarRemessas,
  validarRetornoDoItem, registrarRetorno,
};
