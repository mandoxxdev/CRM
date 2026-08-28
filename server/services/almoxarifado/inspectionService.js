/**
 * Inspecao de recebimento: decide aprovar/reprovar/parcial e o bloqueio/desbloqueio avulso
 * de material (Etapa 5).
 *
 * `receiptService.js` ja responde por 511 linhas de workflow fiscal de 4 etapas com 11 status.
 * Recebimento e inspecao mudam por razoes diferentes — mesma separacao que `reservationService.js`
 * recebeu na Etapa 4. Tudo aqui passa pelo motor (`stockService.registrarMovimentacao`): nenhuma
 * funcao deste arquivo escreve em `materiais_almoxarifado` por conta propria.
 *
 * Substitui `receiptService.inspecionarItem` (removida), que fazia UPDATE SQL direto somando a
 * MESMA quantidade em `quantidade_bloqueada` E `quantidade_em_inspecao` — bloquear 10 tirava 20
 * do disponivel, sem passar pelo motor, sem movimentacao, sem existir no livro.
 */
const { dbGet, dbRun, dbAll } = require('./db');
const { registrarMovimentacao } = require('./stockService');
// Etapa 17, Task 2 (gancho C4.1). Chamado pelo OBJETO do modulo, NAO desestruturado — de
// proposito, contra o estilo local: o teste de RN-02 monkeypatcha
// `notificationQueueService.dispararAlertaRegistrado` em tempo de execucao para provar que o
// aviso nao derruba o ato, e uma desestruturacao no require capturaria a funcao original antes
// do patch (mesmo precedente de `purchaseService` em receiptService.js:11). Sem ciclo: o require
// de `stockService` acima ja carrega `notificationQueueService` por inteiro.
const notificationQueueService = require('./notificationQueueService');
const alertRegistry = require('./alertRegistry');

const ENCAMINHAMENTOS = ['DEVOLVER', 'ANALISE_ENGENHARIA', 'SUBSTITUICAO'];

/**
 * `retido` vem de `recebimentos_material_itens_almoxarifado.quantidade_em_inspecao` — o quanto
 * ESTE item especifico reteve (Task 3 grava isso em darEntradaEstoque), nao mais inferido de
 * quantidade_recebida/esperada. quantidade_em_inspecao do MATERIAL e um pool compartilhado entre
 * itens de recebimentos diferentes; a coluna por item e a fonte de verdade de quanto cada
 * decisao pode reivindicar, e o que a fila de pendentes filtra.
 *
 * A decisao reivindica o saldo em DUAS fases, sem transacao (padrao do modulo — atomicidade via
 * UPDATE condicional no proprio WHERE):
 *   Fase 1 — reivindica o retido do ITEM (recurso especifico desta decisao).
 *   Fase 2 — reivindica o saldo do MATERIAL via o tipo DECISAO_INSPECAO (baixa o retido inteiro
 *            de quantidade_em_inspecao e soma a parte reprovada em quantidade_bloqueada no MESMO
 *            UPDATE). Se falhar, compensa a Fase 1 (mesmo precedente do consumo de reserva em
 *            stockService.js:361-367 — um passo posterior que falha tem de devolver o que o
 *            passo anterior reivindicou).
 * As duas fases evitam a janela que existia com LIBERACAO_INSPECAO + REPROVACAO_INSPECAO como
 * chamadas independentes: uma decisao concorrente para o MESMO item nao pode mais "passar" só
 * porque o pool do material ainda tinha saldo de OUTRO item retido.
 */
async function decidirInspecao(db, user, itemId, data = {}) {
  const item = await dbGet(db,
    'SELECT * FROM recebimentos_material_itens_almoxarifado WHERE id = ?', [itemId]);
  if (!item) throw Object.assign(new Error('Item não encontrado'), { status: 404 });

  const retido = item.quantidade_em_inspecao || 0;
  // Item sem retido (nunca reteve, ou ja foi decidido antes): recusa ANTES de qualquer efeito —
  // sem isto, 0/0 passava a guarda de fechamento e gravava uma inspecao vazia sobre nada.
  if (retido <= 0) {
    throw Object.assign(new Error('Item não possui quantidade em inspeção retida'), { status: 400 });
  }

  const aprovada = Number(data.quantidade_aprovada || 0);
  const reprovada = Number(data.quantidade_reprovada || 0);

  // Quantidade nao numerica tem de recusar ANTES da guarda de fechamento (achado do review
  // final): `Number('dez')` e NaN, e TODA comparacao com NaN e false — inclusive
  // `Math.abs(NaN - retido) > 1e-6`. Ou seja, a guarda de fechamento abaixo NAO recusa NaN: ela
  // deixava passar, o retido inteiro ia para o disponivel e a inspecao era gravada com
  // quantidade_aprovada NULL. Negativo tambem entra aqui: `-10 + 110 === 100` fecharia a conta.
  if (!Number.isFinite(aprovada) || !Number.isFinite(reprovada) || aprovada < 0 || reprovada < 0) {
    throw Object.assign(
      new Error('quantidade_aprovada e quantidade_reprovada têm de ser números não negativos'),
      { status: 400 });
  }

  // Fechar a conta e obrigatorio: se aprovado + reprovado nao bater com o retido, sobra saldo
  // preso em quarentena que ninguem mais vai olhar — a reserva zumbi da Etapa 4 em outra roupa.
  // Validado ANTES de qualquer INSERT/movimentacao — o saldo nao pode mudar quando isto recusa.
  // Epsilon porque quantidade e REAL: em material fracionado (kg, m, L) `10.2 + 0.3 === 10.5` e
  // false em IEEE-754 (da 10.499999999999998) — igualdade estrita travaria aprovacao parcial
  // valida com um erro que pareceria aleatorio.
  if (Math.abs((aprovada + reprovada) - retido) > 1e-6) {
    throw Object.assign(
      new Error(`Aprovado + reprovado (${aprovada + reprovada}) tem de fechar com o retido (${retido})`),
      { status: 400 });
  }
  if (data.encaminhamento && !ENCAMINHAMENTOS.includes(data.encaminhamento)) {
    throw Object.assign(new Error(`Encaminhamento inválido: ${data.encaminhamento}`), { status: 400 });
  }

  // Fase 1 — reivindica o retido do ITEM. E o guarda real contra decidir o mesmo item duas
  // vezes (inclusive concorrente): a segunda tentativa le quantidade_em_inspecao=0 e este UPDATE
  // nao casa, ANTES de tocar no saldo do material.
  const claimItem = await dbGet(db, `UPDATE recebimentos_material_itens_almoxarifado
    SET quantidade_em_inspecao = quantidade_em_inspecao - ?
    WHERE id = ? AND COALESCE(quantidade_em_inspecao,0) >= ?
    RETURNING id`, [retido, itemId, retido]);
  if (!claimItem) {
    throw Object.assign(new Error('Item já foi decidido por outra inspeção'), { status: 400 });
  }

  let justificativaMovimento = data.observacoes;
  if (!justificativaMovimento) {
    if (reprovada > 0 && aprovada > 0) justificativaMovimento = 'Inspeção parcial — aprovado e reprovado';
    else if (reprovada > 0) justificativaMovimento = `Inspeção reprovada${data.encaminhamento ? ` — ${data.encaminhamento}` : ''}`;
    else justificativaMovimento = 'Inspeção aprovada';
  }

  // Fase 2 — reivindica o saldo do MATERIAL. DECISAO_INSPECAO baixa o retido inteiro de
  // quantidade_em_inspecao e soma a parte reprovada em quantidade_bloqueada no MESMO UPDATE
  // (ver stockService.js) — aprovar e reprovar deixaram de ser duas chamadas independentes.
  try {
    await registrarMovimentacao(db, user, {
      material_id: item.material_id, tipo: 'DECISAO_INSPECAO', quantidade: retido,
      quantidade_reprovada: reprovada,
      motivo: reprovada > 0 ? (aprovada > 0 ? 'Inspeção parcial' : 'Inspeção reprovada') : 'Inspeção aprovada',
      justificativa: justificativaMovimento,
      recebimento_id: item.recebimento_id,
    });
  } catch (e) {
    // Sem transacao neste modulo: se o claim do material falhar depois do claim do item,
    // devolve o retido ao item para nao deixar saldo no limbo (nem preso, nem contabilizado
    // duas vezes numa proxima tentativa).
    await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado
      SET quantidade_em_inspecao = quantidade_em_inspecao + ? WHERE id = ?`, [retido, itemId]);
    throw e;
  }

  // INSERT da decisao só DEPOIS que os dois claims (item + material) confirmaram — assim uma
  // tentativa que falha (item ja decidido, ou material rejeitando o claim) nao deixa historico
  // de uma decisao que nunca teve efeito no saldo.
  const ins = await dbRun(db, `INSERT INTO inspecoes_recebimento_almoxarifado
    (recebimento_item_id, conforme, divergencia_quantidade, divergencia_dimensional,
     certificado_ausente, dano_fisico, material_incorreto, acao, responsavel_id, responsavel_nome,
     observacoes, quantidade_aprovada, quantidade_reprovada, encaminhamento)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
    itemId,
    reprovada === 0 ? 1 : 0,
    data.divergencia_quantidade ? 1 : 0, data.divergencia_dimensional ? 1 : 0,
    data.certificado_ausente ? 1 : 0, data.dano_fisico ? 1 : 0, data.material_incorreto ? 1 : 0,
    data.acao || null, user.id, user.nome || user.email, data.observacoes || null,
    aprovada, reprovada, data.encaminhamento || null,
  ]);
  // Etapa 17 (RN-02/RN-03, gancho C4.1): aviso pos-commit — os dois claims e o INSERT ja
  // aconteceram quando chegamos aqui, entao o try/catch abaixo so pode custar o e-mail, nunca a
  // decisao (molde de stockService.js:1374-1405). A linha vem do dual-mode do registro
  // (`listarReprovados({ inspecaoId })`), NUNCA montada dos dados locais: `material_codigo`,
  // numero do recebimento e `data_inspecao` nao existem carregados neste escopo, e refazer a
  // consulta aqui criaria uma segunda definicao de "inspecao reprovada".
  // RN-03: so ha aviso quando houve reprovacao de verdade. A guarda e REDUNDANTE de proposito
  // com o `WHERE i.quantidade_reprovada > 0` do `listarReprovados` — medido no controle positivo
  // da Task 2: derrubar so a guarda OU so o filtro deixa RN-03 verde; a assercao so cai com as
  // DUAS fora. Fica porque evita a consulta no caso comum (aprovacao total) e declara a intencao
  // no ponto de leitura; a regua de verdade continua sendo a query compartilhada.
  if (reprovada > 0) {
    try {
      const [linha] = await alertRegistry.listarReprovados(db, { inspecaoId: ins.lastID });
      if (linha) await notificationQueueService.dispararAlertaRegistrado(db, 'MATERIAL_REPROVADO', linha);
    } catch (e) {
      console.warn('[almoxarifado-alertas] Falha ao avisar material reprovado pos-inspecao:', e.message);
    }
  }

  return { id: ins.lastID, quantidade_aprovada: aprovada, quantidade_reprovada: reprovada };
}

/**
 * Converte a quantidade do payload para numero e recusa o que nao for numero finito positivo.
 *
 * Achado do review final: `!quantidade || quantidade <= 0` NAO pega `'dez'` — a string e truthy
 * e `'dez' <= 0` e false. O motor tambem nao pegava (`Number.isNaN('dez')` e false, porque a
 * string nao E o valor NaN), e o SQLite coagia o texto para 0: gravava um BLOQUEIO de zero no
 * livro como se fosse um bloqueio de verdade. `Number('5')` continua aceito de proposito —
 * quantidade vinda de <input> pode chegar como string.
 */
function quantidadePositiva(valor, acao) {
  const qtd = Number(valor);
  if (!Number.isFinite(qtd) || qtd <= 0) {
    throw Object.assign(
      new Error(`Quantidade é obrigatória para ${acao} e tem de ser um número maior que zero`),
      { status: 400 });
  }
  return qtd;
}

async function bloquearMaterial(db, user, materialId, data = {}) {
  const { justificativa } = data;
  const quantidade = quantidadePositiva(data.quantidade, 'bloqueio');
  if (!justificativa) {
    throw Object.assign(new Error('Justificativa é obrigatória para bloqueio'), { status: 400 });
  }
  await registrarMovimentacao(db, user, {
    material_id: materialId, tipo: 'BLOQUEIO', quantidade, justificativa,
    motivo: 'Bloqueio avulso',
  });
  return { success: true };
}

async function desbloquearMaterial(db, user, materialId, data = {}) {
  const { justificativa } = data;
  const quantidade = quantidadePositiva(data.quantidade, 'desbloqueio');
  if (!justificativa) {
    throw Object.assign(new Error('Justificativa é obrigatória para desbloqueio'), { status: 400 });
  }
  await registrarMovimentacao(db, user, {
    material_id: materialId, tipo: 'DESBLOQUEIO', quantidade, justificativa,
    motivo: 'Desbloqueio avulso',
  });
  return { success: true };
}

/**
 * Fila de inspecao: itens de recebimento que ainda tem retido (quantidade_em_inspecao PRÓPRIO
 * do item > 0). Filtrar pelo item (nao mais pelo pool do material) evita dois furos: um item de
 * material que virou critico DEPOIS de outro recebimento nao aparece so por o material ter saldo
 * em quarentena de outro item; e um item decidido (mesmo parcialmente) sai da fila porque
 * decidirInspecao sempre baixa o retido do item por inteiro numa unica decisao.
 */
async function listarInspecoesPendentes(db, filtros = {}) {
  let sql = `SELECT ri.id as item_id, ri.recebimento_id, ri.material_id,
      ri.quantidade_em_inspecao as quantidade_retida,
      m.codigo as material_codigo, m.nome as material_nome, m.unidade as material_unidade,
      r.numero as recebimento_numero, r.nota_fiscal, r.created_at as data_entrada
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    JOIN recebimentos_material_almoxarifado r ON ri.recebimento_id = r.id
    WHERE COALESCE(ri.quantidade_em_inspecao, 0) > 0`;
  const params = [];
  if (filtros.material_id) { sql += ' AND ri.material_id = ?'; params.push(filtros.material_id); }
  if (filtros.recebimento_id) { sql += ' AND ri.recebimento_id = ?'; params.push(filtros.recebimento_id); }
  sql += ' ORDER BY r.created_at ASC';
  return dbAll(db, sql, params);
}

module.exports = {
  decidirInspecao,
  bloquearMaterial,
  desbloquearMaterial,
  listarInspecoesPendentes,
};
