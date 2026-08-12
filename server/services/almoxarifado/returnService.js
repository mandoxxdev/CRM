const { dbRun, dbAll, dbGet } = require('./db');
const { registrarMovimentacao } = require('./stockService');
const lotService = require('./lotService');
const { registrarAuditoria } = require('./audit');

const MOTIVOS = ['SOBRA_PROJETO', 'NAO_UTILIZADO', 'ITEM_ERRADO', 'DANIFICADO', 'RECUPERAVEL', 'SUCATA'];
const DESTINOS = ['ESTOQUE', 'QUARENTENA', 'SUCATA', 'RETRABALHO'];

// Etapa 7: os tipos de saida que uma devolucao pode desfazer. SUCATA, PERDA e AJUSTE_NEGATIVO
// ficam FORA de proposito — nao se devolve o que foi descartado nem o que foi corrigido por
// ajuste. A rota /devolucoes/saidas-elegiveis (Task 4) usa a mesma lista, para que a tela nunca
// ofereca uma saida que o servico vai recusar.
const TIPOS_SAIDA_DEVOLVIVEL = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA'];

const erro400 = (msg) => Object.assign(new Error(msg), { status: 400 });

/**
 * Valida a saida citada por uma devolucao e devolve a linha da movimentacao.
 * Cada recusa nomeia a razao ESPECIFICA: uma mensagem generica de "saida invalida" deixa o
 * operador sem saber se errou o material, se a entrega foi estornada ou se ja devolveu tudo.
 */
async function validarSaidaOriginal(db, { movimentacaoSaidaId, materialId, quantidade }) {
  const saida = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [movimentacaoSaidaId]);
  if (!saida) throw erro400(`Movimentação de saída ${movimentacaoSaidaId} não encontrada`);
  if (saida.cancelado) {
    throw erro400(`A saída ${movimentacaoSaidaId} foi cancelada (estornada) — o estorno já devolveu o material`);
  }
  if (Number(saida.material_id) !== Number(materialId)) {
    throw erro400(`A saída ${movimentacaoSaidaId} é de outro material`);
  }
  if (!TIPOS_SAIDA_DEVOLVIVEL.includes(saida.tipo)) {
    throw erro400(`A movimentação ${movimentacaoSaidaId} é do tipo ${saida.tipo} e não é uma entrega devolvível `
      + `(devolvíveis: ${TIPOS_SAIDA_DEVOLVIVEL.join(', ')})`);
  }
  const { devolvida } = await dbGet(db,
    `SELECT COALESCE(SUM(quantidade),0) AS devolvida FROM devolucoes_material_almoxarifado
      WHERE movimentacao_saida_id = ?`, [movimentacaoSaidaId]);
  const restante = saida.quantidade - devolvida;
  if (Number(quantidade) > restante) {
    // A mensagem DIZ o numero: sem ele o operador tem de adivinhar quanto ainda pode devolver.
    throw erro400(`Devolução acima do entregue: a saída ${movimentacaoSaidaId} entregou ${saida.quantidade}, `
      + `já foram devolvidos ${devolvida} e restam ${restante}`);
  }
  return saida;
}

async function registrarDevolucao(db, user, data) {
  const {
    material_id, quantidade, motivo, condicao, destino, origem_os_id, origem_projeto_id,
    observacoes, localizacao_id, movimentacao_saida_id, lote_id, series,
  } = data;
  if (!material_id || !quantidade || !motivo) {
    throw Object.assign(new Error('material_id, quantidade e motivo são obrigatórios'), { status: 400 });
  }

  const material = await dbGet(db,
    'SELECT id, codigo, controle_lote, controle_serie FROM materiais_almoxarifado WHERE id = ?', [material_id]);
  if (!material) throw erro400('Material não encontrado');

  const destinoFinal = destino || 'ESTOQUE';

  // Vinculo OPCIONAL, mas VALIDADO quando informado (decisao 2 do design). Obrigatorio foi
  // descartado porque tornaria impossivel devolver o que saiu por um caminho sem registro
  // (sobra antiga, material entregue antes do sistema); "continua avulso" foi descartado porque
  // e justamente o buraco que a spec 12 mais cita.
  let saidaOriginal = null;
  if (movimentacao_saida_id) {
    saidaOriginal = await validarSaidaOriginal(db, {
      movimentacaoSaidaId: movimentacao_saida_id, materialId: material_id, quantidade });
  }

  // Heranca de lote (decisao 4): o lote informado a mao ganha do herdado. So herda em material
  // com controle_lote — herdar num material sem controle criaria linhas de saldo quebradas por
  // lote sem que ninguem tenha pedido isso.
  const loteFinalId = lote_id || (material.controle_lote && saidaOriginal ? saidaOriginal.lote_id : null) || null;

  // ── Serie na devolucao (Etapa 7, Task 5 — decisao 10 do design) ──────────────────────────────
  // Coberta so nos destinos ESTOQUE e QUARENTENA, onde o motor sabe reativar a serie ENTREGUE de
  // volta a EM_ESTOQUE por um caminho unico (seriesService.entradaSeries, com guarda no WHERE).
  //
  // POR QUE SUCATA E RETRABALHO FICAM DE FORA: suportar sucata direta exigiria encadear entrada
  // de serie + saida de serie com compensacao no meio, e este modulo NAO TEM TRANSACAO — uma
  // falha entre as duas pernas deixaria a serie num estado que ninguem desfaz (mesma familia de
  // problema que obrigou a pre-validacao do lote de sucata logo abaixo). O caminho de dois passos
  // ja funciona hoje e e seguro: devolver ao estoque e depois sucatear na tela Movimentacoes, que
  // ja tem seletor de serie. Por isso o erro abaixo ENSINA esse caminho em vez de so negar —
  // recusa que nao diz para onde ir transforma limitacao declarada em beco sem saida. E ignorar
  // `series` em silencio seria pior ainda: o operador acharia que registrou a peca.
  //
  // A limitacao e "nao da para informar a serie nesses destinos", nao "material serializado nao
  // pode ir para sucata": sem `series`, SUCATA continua passando — a ENTRADA_DEVOLUCAO entra sem
  // serie e a SUCATA sai logo depois, saldo liquido zero, e o invariante da Etapa 6b
  // (COUNT(series presentes) == quantidade_atual) fecha no fim da operacao.
  const destinoAceitaSerie = destinoFinal === 'ESTOQUE' || destinoFinal === 'QUARENTENA';
  const seriesInformadas = Array.isArray(series) ? series.map((s) => String(s).trim()).filter(Boolean) : [];
  if (!destinoAceitaSerie && seriesInformadas.length > 0) {
    throw erro400(`Devolução com número de série não é suportada no destino ${destinoFinal}. `
      + 'Devolva ao estoque e, em seguida, registre a baixa na tela Movimentações, que tem seletor de série.');
  }
  // Cardinalidade conferida AQUI, antes do INSERT da devolucao — o motor tambem confere, mas ele
  // so roda depois que a linha de `devolucoes_material_almoxarifado` ja existe, e uma devolucao
  // gravada sem movimentacao nenhuma continuaria contando no `saldo_devolvivel` da saida citada,
  // encolhendo para sempre o que ainda pode ser devolvido.
  if (destinoAceitaSerie && material.controle_serie && seriesInformadas.length !== Number(quantidade)) {
    throw erro400(`Material com controle de série: informe ${quantidade} número(s) de série para `
      + `${quantidade} unidade(s) devolvida(s) — recebidos ${seriesInformadas.length}`);
  }

  // ARMADILHA do destino SUCATA: ele faz ENTRADA_DEVOLUCAO e DEPOIS SUCATA (correcao do bug de
  // saldo). A guarda de status do lote vive no ramo de SAIDA do motor, entao um lote
  // BLOQUEADO/REPROVADO deixaria a ENTRADA passar e a SAIDA falhar — o material entraria e nao
  // sairia, e nao ha transacao neste modulo para desfazer. Pre-validar aqui e o que impede o
  // estado parcial. (tiposDescarte, no motor, isenta o VENCIMENTO, nao o status — por isso a
  // checagem abaixo olha so `status`.)
  if (destinoFinal === 'SUCATA' && loteFinalId) {
    const loteDaSucata = await lotService.getLote(db, loteFinalId);
    if (!loteDaSucata) throw erro400('Lote informado não encontrado');
    if (loteDaSucata.status !== 'ATIVO') {
      throw erro400(`Lote ${loteDaSucata.codigo} está ${loteDaSucata.status.toLowerCase()} e não pode ser sucateado `
        + 'por devolução. Resolva o status do lote primeiro (tela Lotes e Séries) e repita a devolução.');
    }
  }

  const r = await dbRun(db, `INSERT INTO devolucoes_material_almoxarifado
    (material_id, quantidade, motivo, condicao, destino, origem_os_id, origem_projeto_id,
     responsavel_id, responsavel_nome, observacoes, movimentacao_saida_id, lote_id)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, [
    material_id, quantidade, motivo, condicao || null, destinoFinal,
    origem_os_id || null, origem_projeto_id || null,
    user.id, user.nome || user.email, observacoes || null,
    movimentacao_saida_id || null, loteFinalId,
  ]);

  // `referencia` em TODAS as movimentacoes de TODOS os destinos (Etapa 7, Task 1). Ate aqui so
  // ESTOQUE/QUARENTENA gravavam: a devolucao que virava sucata ficava sem nenhum fio ligando o
  // lancamento do livro ao registro da devolucao.
  const referencia = `DEV-${r.lastID}`;
  // `exigeLote: true` (Etapa 7): a devolucao SAI da lista de fluxos internos isentos da spec 10.
  // A isencao existia porque nao havia DE ONDE tirar um lote — agora ha nos dois caminhos (herda
  // da saida quando ha vinculo, seletor na tela quando e avulsa). Continua no 4o argumento,
  // nunca no body.
  const opcoes = { exigeLote: true };
  // `exigeSerie` so onde a serie e suportada — declarar nos destinos SUCATA/RETRABALHO travaria a
  // devolucao de material serializado para eles sem oferecer caminho nenhum. Continua no 4o
  // argumento, nunca no body.
  const opcoesEntrada = { exigeLote: true, exigeSerie: destinoAceitaSerie };

  if (destinoFinal === 'ESTOQUE' || destinoFinal === 'QUARENTENA') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id, lote_id: loteFinalId,
      series: seriesInformadas,
      justificativa: observacoes, referencia,
    }, opcoesEntrada);
    if (destinoFinal === 'QUARENTENA') {
      await registrarMovimentacao(db, user, {
        material_id, tipo: 'BLOQUEIO', quantidade, motivo: 'Devolução para quarentena',
        justificativa: 'Devolução recebida em quarentena para inspeção', referencia,
      });
    }
  } else if (destinoFinal === 'SUCATA') {
    // BUG CORRIGIDO NA ETAPA 7 (medido com sonda executada, 2026-08-12): o material devolvido
    // para sucata JA tinha saido do estoque na entrega. Emitir so o SUCATA (que e um tipo de
    // SAIDA para o motor) descontava de novo um saldo que nunca voltou — 100 -> saida 10 -> 90
    // -> devolucao 3 para sucata dava 87, quando o certo e 90. Agora entra e sai: o saldo fecha,
    // e o livro conta as duas coisas (voltou, e foi sucateada). Descartado: nao movimentar nada
    // no destino SUCATA — o saldo tambem ficaria certo, mas a sucata sumiria do livro, e a
    // feature 15 (retalhos e sucatas) vai precisar dela la.
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
      motivo, os_id: origem_os_id, projeto_id: origem_projeto_id,
      localizacao_destino_id: localizacao_id, lote_id: loteFinalId,
      series: seriesInformadas,
      justificativa: observacoes, referencia,
    }, opcoesEntrada);
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'SUCATA', quantidade, motivo, os_id: origem_os_id,
      localizacao_origem_id: localizacao_id, lote_id: loteFinalId,
      justificativa: observacoes || motivo, referencia,
    }, opcoes);
  } else if (destinoFinal === 'RETRABALHO') {
    await registrarMovimentacao(db, user, {
      material_id, tipo: 'RETRABALHO', quantidade, motivo, os_id: origem_os_id,
      lote_id: loteFinalId, referencia,
    });
  }

  await registrarAuditoria(db, { entidade: 'devolucao', entidade_id: r.lastID, acao: 'CRIACAO', usuario_id: user.id, usuario_nome: user.nome || user.email });
  return { id: r.lastID };
}

async function listarDevolucoes(db, filters = {}) {
  let sql = `SELECT d.*, m.nome as material_nome, m.codigo as material_codigo
    FROM devolucoes_material_almoxarifado d
    JOIN materiais_almoxarifado m ON d.material_id = m.id WHERE 1=1`;
  const params = [];
  if (filters.material_id) { sql += ' AND d.material_id = ?'; params.push(filters.material_id); }
  sql += ' ORDER BY d.created_at DESC';
  return dbAll(db, sql, params);
}

/**
 * As entregas daquele material que uma devolucao pode citar (Etapa 7, Task 4).
 *
 * Leitura agregada de tres tabelas: a movimentacao (a entrega), a soma das devolucoes que ja
 * citam aquela movimentacao, e as series que sairam nela. Linha ja devolvida por inteiro VOLTA
 * na lista, com saldo 0 — "ja devolvido por inteiro" e informacao util, nao ruido, e a tela a
 * mostra desabilitada. As 30 mais recentes: quem devolve devolve o que saiu ha pouco; lista
 * infinita rolando no modal atrapalha mais do que ajuda.
 *
 * O `saldo_devolvivel` publicado aqui e, DE PROPOSITO, a mesma conta de `validarSaidaOriginal`
 * (`saida.quantidade - SUM(devolucoes daquela movimentacao)`), sobre a mesma lista de tipos
 * (`TIPOS_SAIDA_DEVOLVIVEL`) e o mesmo filtro de cancelamento. Se as duas pontas divergirem, a
 * tela oferece devolver 6 e o servidor responde que so cabem 4 — e o operador nao tem como saber
 * quem esta certo. Por isso os testes das duas pontas moram no mesmo arquivo
 * (`tests/api/devolucaoVinculo.api.test.js`) e um deles le o numero DAQUI para bater contra a
 * validacao na mesma execucao.
 */
async function listarSaidasElegiveis(db, materialId, { limite = 30 } = {}) {
  const material = await dbGet(db,
    'SELECT id, controle_serie FROM materiais_almoxarifado WHERE id = ?', [materialId]);
  if (!material) throw erro400('Material não encontrado');

  const marcadores = TIPOS_SAIDA_DEVOLVIVEL.map(() => '?').join(',');
  const saidas = await dbAll(db, `
    SELECT mv.id, mv.tipo, mv.quantidade, mv.created_at, mv.lote_id, mv.lote,
           mv.requisicao_id, mv.os_id, mv.projeto_id, mv.usuario_nome,
           req.numero AS requisicao_numero,
           COALESCE((SELECT SUM(d.quantidade) FROM devolucoes_material_almoxarifado d
                      WHERE d.movimentacao_saida_id = mv.id), 0) AS quantidade_devolvida
      FROM movimentacoes_almoxarifado mv
      LEFT JOIN requisicoes_almoxarifado req ON req.id = mv.requisicao_id
     WHERE mv.material_id = ? AND COALESCE(mv.cancelado,0) = 0 AND mv.tipo IN (${marcadores})
     ORDER BY mv.created_at DESC, mv.id DESC
     LIMIT ?`, [materialId, ...TIPOS_SAIDA_DEVOLVIVEL, limite]);

  const out = [];
  for (const s of saidas) {
    // Serie por saida e uma QUERY, nao estrutura nova: series_almoxarifado ja tem
    // movimentacao_saida_id desde a Etapa 6b. Status ENTREGUE porque e o que a saida deixou —
    // uma serie ja reentrada por outro caminho nao esta la fora para ser devolvida.
    const series = material.controle_serie
      ? await dbAll(db, `SELECT id, numero, status FROM series_almoxarifado
                          WHERE movimentacao_saida_id = ? AND status = 'ENTREGUE' ORDER BY numero`, [s.id])
      : [];
    out.push({
      ...s,
      saldo_devolvivel: Number((s.quantidade - s.quantidade_devolvida).toFixed(4)),
      series,
    });
  }
  return out;
}

module.exports = {
  MOTIVOS, DESTINOS, TIPOS_SAIDA_DEVOLVIVEL,
  registrarDevolucao, listarDevolucoes, listarSaidasElegiveis,
};
