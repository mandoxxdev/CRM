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
// Etapa 27, Task 3. `toleranciaInspecao` e funcao pura (sem db, sem ciclo). `calibracaoVigente`
// vem de `toolService` por require direto — verificado que nao ha ciclo: toolService so carrega
// db/audit/toolStateMachine, e nenhum deles chega aqui. Reusar a consulta em vez de copiar o
// `date(data_validade) >= date('now')` foi decisao explicita da Etapa 9b ("nao duplicar esta
// consulta em outro lugar", toolService.js:55): duas definicoes de "calibracao vigente" e como
// ter duas reguas para o mesmo fato.
const { avaliarMedida, paraNumeroFinito } = require('./toleranciaInspecao');
const { calibracaoVigente } = require('./toolService');

const ENCAMINHAMENTOS = ['DEVOLVER', 'ANALISE_ENGENHARIA', 'SUBSTITUICAO'];

/**
 * Etapa 27 (RN-03 a RN-07, contrato C3): resolve o payload de medidas em linhas prontas para
 * gravar, JA AVALIADAS pela regua da tolerancia.
 *
 * Devolve `null` quando nao ha medidas — e `null` e diferente de `[]` de proposito: sem medidas a
 * `divergencia_dimensional` continua sendo a marcacao MANUAL do payload (RN-03), e um `[]`
 * tratado como "tem medidas" zeraria a flag legitima de quem inspecionou sem medir.
 * `Array.isArray(medidas) && medidas.length > 0` e a guarda exata: `[]` e TRUTHY, entao
 * `if (data.medidas)` estaria errado.
 *
 * ─── POR QUE ESTA FUNCAO NAO ESCREVE NADA, E RODA ANTES DO CLAIM ────────────────────────────
 *
 * Ela so LE e AVALIA. Todas as recusas novas (plano inexistente, plano de outro material,
 * ferramenta inexistente/inativa, ferramenta descalibrada, medida nao numerica) saem daqui, e
 * `decidirInspecao` a chama ANTES da Fase 1 (o claim da linha do item). No lugar "natural" —
 * junto da gravacao das medidas, depois do INSERT da inspecao — cada uma dessas recusas seria um
 * 400 emitido DEPOIS de o saldo ja ter se movido, contra o que o comentario da guarda de
 * fechamento promete ("o saldo nao pode mudar quando isto recusa"). Nada aqui precisa do
 * `inspecao_id`: a derivacao da flag e calculada em memoria neste ponto, e o `inspecao_id` so
 * entra na hora do INSERT.
 *
 * ─── POR QUE NAO CONFIAR EM "NaN REPROVA SOZINHO" ───────────────────────────────────────────
 *
 * `Number('12,4')` (virgula decimal de input pt-BR) e NaN. A intuicao diz que ele reprovaria a
 * caracteristica; a Task 1 MEDIU o contrario: na forma de guardas de rejeicao — a natural quando
 * se quer devolver motivo especifico — nenhuma guarda dispara e a medida sai CONFORME. O defeito
 * nao seria falsa reprovacao, seria falsa APROVACAO com `valor_medido` nulo e a divergencia
 * apagada. Por isso `NAO_NUMERICO` vira 400 explicito aqui, e nada e gravado (RN-07).
 */
async function resolverMedidas(db, materialId, medidas) {
  if (!Array.isArray(medidas) || medidas.length === 0) return null;

  const linhas = [];
  for (const m of medidas) {
    const bruto = m || {};
    const planoId = paraNumeroFinito(bruto.plano_id);
    // Validado por EXISTENCIA, nao por `ativo = 1` — mesma regua que a Task 2 aplicou ao material
    // pai. O alvo e o plano FANTASMA (a FK nao segura: o harness roda com foreign_keys = 0 e
    // producao com 1, entao `plano_id` inexistente passaria no teste e falharia em producao).
    // Exigir ativo travaria a inspecao em andamento porque alguem desativou a caracteristica no
    // meio; e os valores sao congelados de qualquer jeito (RN-05), entao a medida continua
    // significando exatamente o que significava no ato.
    const plano = planoId === null ? null : await dbGet(db,
      'SELECT * FROM planos_inspecao_almoxarifado WHERE id = ?', [planoId]);
    if (!plano) {
      throw Object.assign(
        new Error(`Característica de plano de inspeção não encontrada: ${bruto.plano_id}`),
        { status: 400 });
    }
    if (Number(plano.material_id) !== Number(materialId)) {
      throw Object.assign(
        new Error(`A característica "${plano.caracteristica}" não pertence ao plano de inspeção deste material`),
        { status: 400 });
    }

    // Ferramenta e OPCIONAL (a coluna `medidas...ferramenta_id` e nullable, fixada pela Task 2).
    // Quando vem, vale o padrao do vizinho: `WHERE id = ? AND ativo = 1` e 404 se nao casar —
    // sem isso, `f.exige_calibracao` sobre `undefined` seria TypeError, ou seja 500 numa
    // situacao que e erro do pedido.
    let ferramenta = null;
    const ferramentaId = paraNumeroFinito(bruto.ferramenta_id);
    if (bruto.ferramenta_id !== undefined && bruto.ferramenta_id !== null && bruto.ferramenta_id !== '') {
      ferramenta = ferramentaId === null ? null : await dbGet(db,
        'SELECT * FROM ferramentas_almoxarifado WHERE id = ? AND ativo = 1', [ferramentaId]);
      if (!ferramenta) {
        throw Object.assign(new Error('Ferramenta não encontrada'), { status: 404 });
      }
      // RN-04: instrumento vencido NAO MEDE. Mensagem literal do vizinho (toolService.js:70),
      // que cobre "vencida" e "nunca calibrada" com a mesma frase de proposito: `calibracaoVigente`
      // devolve a linha vigente ou `undefined`, entao na recusa nao existe data para prometer.
      // Descartado apenas avisar: medida feita com paquimetro descalibrado nao e dado, e ruido
      // com aparencia de dado — e ficaria gravada como se fosse prova.
      if (ferramenta.exige_calibracao && !(await calibracaoVigente(db, ferramenta.id))) {
        throw Object.assign(
          new Error(`Ferramenta com calibração vencida ou sem calibração registrada (${ferramenta.nome})`),
          { status: 400 });
      }
    }

    const aval = avaliarMedida({
      nominal: plano.valor_nominal,
      desvioInf: plano.desvio_inferior,
      desvioSup: plano.desvio_superior,
      medido: bruto.valor_medido,
    });
    if (aval.motivo === 'NAO_NUMERICO') {
      throw Object.assign(
        new Error(`Valor medido inválido para "${plano.caracteristica}": informe um número (use ponto decimal)`),
        { status: 400 });
    }
    if (aval.motivo === 'FAIXA_INVALIDA') {
      // Plano com faixa invertida ou nominal nulo: o CRUD barra isso com 400, mas dado gravado
      // antes da validacao — ou escrita direta no banco — chega aqui. Recusar e melhor que gravar
      // "nao conforme" por causa de um cadastro quebrado, o que ligaria a divergencia sem medida.
      throw Object.assign(
        new Error(`Plano de inspeção inválido para "${plano.caracteristica}": verifique o valor nominal e os desvios`),
        { status: 400 });
    }

    linhas.push({
      plano_id: plano.id,
      // RN-05: os valores do plano sao COPIADOS, nunca referenciados. Editar o plano depois nao
      // pode reescrever inspecao antiga — mesma razao da RN-05 da Etapa 26 (renomear categoria
      // nao reclassifica o acervo). `ferramenta_nome` e congelado pelo mesmo motivo.
      caracteristica: plano.caracteristica,
      unidade: plano.unidade || null,
      valor_nominal: plano.valor_nominal,
      desvio_inferior: plano.desvio_inferior,
      desvio_superior: plano.desvio_superior,
      valor_medido: paraNumeroFinito(bruto.valor_medido),
      conforme: aval.conforme ? 1 : 0,
      ferramenta_id: ferramenta ? ferramenta.id : null,
      ferramenta_nome: ferramenta ? ferramenta.nome : null,
    });
  }
  return linhas;
}

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

  // Etapa 27 (RN-03, contrato C3) — AQUI, e nao la embaixo junto do INSERT das medidas. Este e o
  // ultimo ponto do fluxo em que uma recusa ainda nao custou saldo: resolver os planos, avaliar
  // pela regua e checar a calibracao roda ANTES do claim da Fase 1, pelo mesmo motivo que a guarda
  // de fechamento acima roda antes. Depois desta linha, recusar significa deixar o item com o
  // retido baixado e nenhuma inspecao gravada.
  const medidasResolvidas = await resolverMedidas(db, item.material_id, data.medidas);
  // A DERIVACAO VENCE A MARCACAO MANUAL quando ha medidas (RN-03): a flag deixa de ser opiniao de
  // quem inspecionou e passa a ser o que o numero diz. Descartado manter as duas fontes lado a
  // lado — a manual venceria por ser a que a tela mostra, e o modulo teria duas verdades para o
  // mesmo fato. Sem medidas, `medidasResolvidas` e null e tudo segue como antes desta etapa.
  const divergenciaDimensional = medidasResolvidas
    ? (medidasResolvidas.some((m) => !m.conforme) ? 1 : 0)
    : (data.divergencia_dimensional ? 1 : 0);

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
    data.divergencia_quantidade ? 1 : 0, divergenciaDimensional,
    data.certificado_ausente ? 1 : 0, data.dano_fisico ? 1 : 0, data.material_incorreto ? 1 : 0,
    data.acao || null, user.id, user.nome || user.email, data.observacoes || null,
    aprovada, reprovada, data.encaminhamento || null,
  ]);

  // As medidas entram num UNICO INSERT multi-linha, nunca em laco (contrato C3, achado A3).
  // Um laco deixa, se a segunda de tres falhar, a inspecao gravada com divergencia_dimensional = 1
  // e UMA medida so — a flag afirmando uma reprovacao cuja prova nao esta no banco. E o defeito
  // que a Etapa 23 consertou no PUT /configuracoes. `BEGIN` NAO e a saida: a mesma etapa mediu que
  // a conexao SQLite deste modulo e unica e o ROLLBACK engoliria escrita de outra requisicao em
  // voo. `VALUES (?,...),(?,...)` e atomico por statement, que e a garantia portavel aqui.
  // Tudo que podia recusar ja recusou la em cima, antes do claim — este INSERT so pode falhar por
  // erro de infraestrutura.
  if (medidasResolvidas) {
    const cols = ['inspecao_id', 'plano_id', 'caracteristica', 'unidade', 'valor_nominal',
      'desvio_inferior', 'desvio_superior', 'valor_medido', 'conforme', 'ferramenta_id',
      'ferramenta_nome'];
    const placeholder = `(${cols.map(() => '?').join(',')})`;
    const params = [];
    for (const m of medidasResolvidas) {
      params.push(ins.lastID, m.plano_id, m.caracteristica, m.unidade, m.valor_nominal,
        m.desvio_inferior, m.desvio_superior, m.valor_medido, m.conforme, m.ferramenta_id,
        m.ferramenta_nome);
    }
    await dbRun(db, `INSERT INTO medidas_inspecao_almoxarifado (${cols.join(',')})
      VALUES ${medidasResolvidas.map(() => placeholder).join(',')}`, params);
  }

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

  // `divergencia_dimensional` volta no retorno DE PROPOSITO (campo novo, aditivo): com medidas ela
  // pode ser o contrario do que o payload mandou, e sem ela quem chamou nao teria como saber que a
  // marcacao manual foi ignorada — a tela mostraria uma coisa e o banco guardaria outra, que e
  // exatamente o defeito da Etapa 26.
  return {
    id: ins.lastID,
    quantidade_aprovada: aprovada,
    quantidade_reprovada: reprovada,
    divergencia_dimensional: divergenciaDimensional,
    medidas_registradas: medidasResolvidas ? medidasResolvidas.length : 0,
  };
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
