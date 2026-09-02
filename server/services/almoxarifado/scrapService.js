/**
 * Sobras/retalhos (Etapa 9, Task 1 — reforma).
 *
 * Ate aqui esta era uma ilha de 37 linhas: SQL direto sem validacao, sem auditoria, e o `user`
 * de atualizarSobra era parametro morto (a assinatura recebia, ninguem lia). Isso pagava a
 * pendencia nomeada na spec 23 — o unico servico de cauda do modulo sem auditoria.
 *
 * `criarSobra` NAO e mais exportado nem tem rota: o unico caminho de criacao passa a ser
 * gerarRetalho (Task 3), que grava as colunas novas de rastreamento (lote_origem_id,
 * material_retalho_id, movimentacao_baixa_id, movimentacao_entrada_id — ver comentario do
 * safeAlter em schema.js) que este INSERT legado nunca preenchia. Deixar o POST avulso vivo
 * recriaria a mesma ilha, so que com uma casca de validacao por cima.
 */
const { dbRun, dbAll, dbGet } = require('./db');
const { registrarAuditoria } = require('./audit');
const stockService = require('./stockService');
const ownerRules = require('./ownerRules');
const lotService = require('./lotService');
const { disponivelSql } = require('./availabilitySql');

function erro(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

async function listarSobras(db, filters = {}) {
  let sql = `SELECT s.*, l.codigo as localizacao_codigo
    FROM sobras_material_almoxarifado s
    LEFT JOIN localizacoes_almoxarifado l ON s.localizacao_id = l.id WHERE 1=1`;
  const params = [];
  if (filters.status) { sql += ' AND s.status = ?'; params.push(filters.status); }
  if (filters.disponivel) { sql += " AND s.status = 'DISPONIVEL' AND s.reutilizavel = 1"; }
  // material_id filtra pela ORIGEM (a sobra que veio de retalhar ESTE material — ver comentario
  // do safeAlter em schema.js), nao pelo material que a sobra representa no catalogo
  // (material_retalho_id, que a Task 3 preenche).
  if (filters.material_id) { sql += ' AND s.material_id = ?'; params.push(filters.material_id); }
  if (filters.q) {
    sql += ` AND (s.norma LIKE ? OR s.dimensoes_originais LIKE ? OR s.dimensoes_restantes LIKE ?
      OR s.material_descricao LIKE ?)`;
    const like = `%${filters.q}%`;
    params.push(like, like, like, like);
  }
  sql += ' ORDER BY s.created_at DESC';
  return dbAll(db, sql, params);
}

/**
 * Sobras de retalho REUTILIZAVEIS de um material de ORIGEM (Etapa 9, Task 4) — a lista que
 * responde "o que ja sobrou de cortar este material e ainda da pra usar".
 *
 * Tres filtros, e os tres tem de valer juntos: `status='DISPONIVEL'` (nao consumida nem
 * sucateada), `reutilizavel=1` (a Task 1 deixou essa flag existir de verdade — ver
 * atualizarSobra) e o disponivel do MATERIAL-RETALHO (nao da sobra, que nao tem saldo proprio)
 * maior que zero: a sobra pode estar "DISPONIVEL" no cadastro e o material-retalho que ela
 * referencia ja ter sido todo consumido por outra requisicao — listar mesmo assim ofereceria algo
 * que nao tem mais estoque.
 *
 * A formula do disponivel vem de `disponivelSql` (availabilitySql.js) — REGRA do modulo desde a
 * 8b, ver o cabecalho daquele arquivo: nenhuma query nova escreve a subtracao a mao.
 */
async function listarRetalhosDisponiveis(db, materialOrigemId) {
  const sql = `SELECT s.*, l.codigo as localizacao_codigo,
      ma.codigo as material_retalho_codigo, ma.nome as material_retalho_nome,
      ${disponivelSql('ma')} as material_retalho_disponivel
    FROM sobras_material_almoxarifado s
    JOIN materiais_almoxarifado ma ON s.material_retalho_id = ma.id
    LEFT JOIN localizacoes_almoxarifado l ON s.localizacao_id = l.id
    WHERE s.material_id = ? AND s.status = 'DISPONIVEL' AND s.reutilizavel = 1
      AND ${disponivelSql('ma')} > 0
    ORDER BY s.created_at DESC`;
  return dbAll(db, sql, [materialOrigemId]);
}

async function atualizarSobra(db, user, id, data) {
  const anterior = await dbGet(db, 'SELECT * FROM sobras_material_almoxarifado WHERE id = ?', [id]);
  if (!anterior) {
    const err = new Error('Sobra não encontrada');
    err.status = 404;
    throw err;
  }

  // Preserve-when-omitted (HARD REQUIREMENT — mesma classe de bug corrigida 3x em
  // routes/almoxarifado.js, padrao `val(k)` na linha ~379: `undefined` no body preserva o valor
  // atual, qualquer valor explicito, INCLUINDO `null`, substitui). O COALESCE anterior nao
  // distinguia "chave omitida" de "null explicito" — os dois viravam `null` no parametro e o
  // SQL preservava os dois casos igual, quebrando o contrato que SobraUpdateSchema promete com
  // `.nullable()` em localizacao_id/observacoes: o Zod aceitava `null` para limpar o campo e a
  // implementacao nunca limpava nada.
  const val = (k) => (data[k] === undefined ? anterior[k] : data[k]);
  const status = data.status === undefined ? anterior.status : data.status;
  const reutilizavel = data.reutilizavel === undefined ? anterior.reutilizavel : (data.reutilizavel ? 1 : 0);

  await dbRun(db, `UPDATE sobras_material_almoxarifado SET
    status = ?, localizacao_id = ?, observacoes = ?, reutilizavel = ?,
    updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
    [status, val('localizacao_id'), val('observacoes'), reutilizavel, id]);

  const atual = await dbGet(db, 'SELECT * FROM sobras_material_almoxarifado WHERE id = ?', [id]);

  // O `user` deixa de ser parametro morto: grava quem agiu, com o antes/depois completo — o
  // pedaco da spec 23 que faltava fechar neste servico.
  await registrarAuditoria(db, {
    entidade: 'sobra',
    entidade_id: Number(id),
    acao: 'atualizar',
    usuario_id: user && user.id,
    usuario_nome: user && user.nome,
    dados_anteriores: anterior,
    dados_novos: atual,
  });

  return atual;
}

/**
 * Desfaz o que ja entrou quando a geracao de retalho falha no meio (Etapa 9, decisao 15 —
 * "pre-checagem, claim, compensacao", a forma da 8b/8c/returnService).
 *
 * A ORDEM E A INVERSA DA APLICACAO, e ela e decidida pelo mesmo criterio de
 * thirdPartyService.compensarTransformacao: baixa o original primeiro, credita o retalho depois;
 * entao a compensacao estorna o CREDITO e so depois devolve a BAIXA. Compensar na mesma ordem da
 * aplicacao criaria, na falha, um estado intermediario com o retalho creditado e o original ja
 * devolvido — estoque do nada, o pior dos dois estados possiveis.
 *
 * Compensa ESTORNANDO pelo livro (`cancelarMovimentacao`), nao apagando a linha: a movimentacao e
 * imutavel neste modulo, e o livro fica honesto — a saida existiu, esta marcada cancelada e tem a
 * linha de ESTORNO ao lado. Mesmo criterio da 8c.
 *
 * O estorno do CREDITO leva `.catch(() => {})` e o da BAIXA nao, e a assimetria e deliberada
 * (mesma regra da 8c, com o "ultimo passo" sendo outro aqui): compensacao que falha no meio nao
 * pode esconder o erro ORIGINAL, que e o que interessa a quem chamou — mas se o estorno da BAIXA
 * falhar, o material de origem fica baixado sem retalho nenhum em troca (estoque destruido em
 * silencio), e isso e pior do que mascarar o erro original. Por isso ele estoura.
 */
async function compensarRetalho(db, user, { movEntrada, movBaixa }) {
  const motivo = 'Compensacao automatica: a geracao de retalho falhou no meio e foi desfeita';
  if (movEntrada && movEntrada.id) {
    // Fix wave final da Etapa 9: o engolir continua deliberado (nao mascarar o erro original),
    // mas SEM rastro nao — o unico cenario em que este ramo falha e exatamente o que deixa
    // retalho-fantasma (credito sem linha de sobra), e alguem precisa achar isso no log.
    // Padrao da casa: stockService.js:1319.
    await stockService.cancelarMovimentacao(db, user, movEntrada.id, motivo).catch((err) => {
      console.warn('[almoxarifado-retalho] Falha ao estornar a ENTRADA_RETALHO na compensacao '
        + `(mov ${movEntrada.id}) — retalho-fantasma possivel, conferir o livro:`, err.message);
    });
  }
  if (movBaixa && movBaixa.id) {
    await stockService.cancelarMovimentacao(db, user, movBaixa.id, motivo);
  }
}

const ouNulo = (v) => (v === undefined ? null : v);

/**
 * Gera um retalho: o EVENTO COMPOSTO da Etapa 9 (decisao 2 do design).
 *
 * Tres pernas, nesta ordem, e a ordem e a decisao:
 *   1. `SAIDA` do material de origem — so no modo `baixar_original`;
 *   2. `ENTRADA_RETALHO` do material-retalho (tipo dedicado da Task 2, SEM custo);
 *   3. INSERT da linha de sobra, o anexo dimensional que amarra as duas pontas.
 * Falha na 2 compensa a 1; falha na 3 compensa a 2 e a 1 (`compensarRetalho` acima).
 *
 * ── Os dois modos, e por que os dois existem ────────────────────────────────────────────────
 *
 * `baixar_original: true` e o corte feito AQUI: a peca ainda esta no estoque, entao ela sai (com
 * as regras de vinculo normais de SAIDA e a guarda de dono do motor) e o retalho entra.
 * `baixar_original: false` e a sobra que VOLTA do chao de fabrica: a peca ja saiu por requisicao
 * ha dias — nao ha o que baixar, e inventar uma baixa aqui tiraria do saldo material que ja nao
 * esta la. Nesse modo `movimentacao_baixa_id` fica NULL, e NULL ali significa exatamente isso.
 *
 * ── Custo: ZERO, sempre (decisao 4) ─────────────────────────────────────────────────────────
 *
 * A perna 2 NUNCA recebe `custo_unitario` — nem do payload (o schema nao declara o campo) nem
 * montado aqui. O projeto ja pagou a chapa inteira na SAIDA; creditar o retalho com custo infla o
 * patrimonio duas vezes pelo mesmo aco. E entrada sem custo NAO apaga o custo que o
 * material-retalho porventura ja tenha: o motor so mexe em custo com `custoInformado > 0`.
 *
 * ── A justificativa e o id que ainda nao existe ──────────────────────────────────────────────
 *
 * O design pedia `Retalho gerado de <codigo origem> (sobra #<id>)`, mas o id da sobra so nasce na
 * perna 3, DEPOIS das duas movimentacoes — e movimentacao e imutavel neste modulo, entao voltar
 * para reescrever a justificativa esta fora de questao. Resolvido citando a MOVIMENTACAO DE BAIXA
 * (`(baixa #N)`), que ja existe quando a perna 2 roda e e o agrupador natural do evento — mesmo
 * papel do `movimentacao_consumo_id` da 8c. O caminho de volta continua completo: a linha da sobra
 * guarda os DOIS ids, entao do livro se chega a sobra e da sobra se chega ao livro.
 *
 * ── Pre-checagem: o que este servico checa e o que ele deliberadamente NAO checa ─────────────
 *
 * Checa o que so ele sabe: os dois materiais existem, nao sao o mesmo, tem o mesmo dono, o lote
 * informado e daquele material, e o lote e obrigatorio quando a origem controla lote. NAO
 * reimplementa saldo disponivel nem restricao de endereco: as duas tem fonte unica no motor
 * (availabilitySql.js e validarLocalizacaoParaMovimento) e uma segunda copia aqui divergiria na
 * primeira mudanca. Saldo insuficiente cai na perna 1, que e a PRIMEIRA coisa que se move e cuja
 * guarda roda antes do proprio efeito — "recusa antes de qualquer perna" continua verdade.
 *
 * ── `exigeLote` declarado so na perna 1, e isso e decisao ───────────────────────────────────
 *
 * A exigencia de lote e declarada pelo CHAMADOR (stockService.js:569-607, decisao do cliente de
 * 2026-08-10: vale so onde existe COMO informar). A perna 1 declara porque o payload tem
 * `lote_origem_id`. A perna 2 NAO declara porque nao existe campo de "lote do retalho" — declarar
 * la tornaria impossivel gerar retalho para um material-retalho com controle de lote, exatamente o
 * tipo de trava que fez o cliente tomar aquela decisao. PENDENCIA DECLARADA, na mesma linha dos
 * quatro fluxos internos isentos citados na spec 10: retalho de material-retalho com
 * `controle_lote` entra sem lote.
 */
async function gerarRetalho(db, user, payload = {}) {
  if (!user || !user.id) throw erro('Usuario responsavel obrigatorio');

  const {
    material_origem_id: materialOrigemId,
    material_retalho_id: materialRetalhoId,
    baixar_original: baixarOriginal,
    quantidade_baixa: quantidadeBaixa,
    lote_origem_id: loteOrigemId = null,
    localizacao_id: localizacaoId = null,
    projeto_id: projetoId, os_id: osId, centro_custo_id: centroCustoId, justificativa,
  } = payload;

  // Default do retalho: UMA peca. O corte devolve um pedaco, e e o caso comum — mas so o do
  // RETALHO tem default; `quantidade_baixa` nao tem, porque adivinhar quanto sair do estoque de
  // origem seria inventar movimento de saldo.
  const quantidadeRetalho = (payload.quantidade_retalho === undefined || payload.quantidade_retalho === null)
    ? 1 : Number(payload.quantidade_retalho);
  if (!(quantidadeRetalho > 0)) throw erro('quantidade do retalho deve ser maior que zero');

  // ── 1. Pre-checagens: tudo antes de mover qualquer coisa ────────────────────────────────────
  const origem = materialOrigemId
    ? await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialOrigemId]) : null;
  if (!origem) throw erro(`O material de origem ${materialOrigemId} nao existe`);

  const retalho = materialRetalhoId
    ? await dbGet(db, 'SELECT * FROM materiais_almoxarifado WHERE id = ?', [materialRetalhoId]) : null;
  // Decisao 6: o motor NAO cria material. Precedente do modulo (recebimento, transformacao da 8c):
  // criar material implicitamente a partir de um formulario produz cadastro-lixo a cada erro de
  // digitacao, e cadastro-lixo em almoxarifado nao se apaga — ele ganha saldo. A mensagem ENSINA o
  // caminho em vez de so recusar.
  if (!retalho) {
    throw erro(`O material do retalho ${materialRetalhoId} nao existe. Cadastre o material do `
      + 'retalho primeiro (Almoxarifado > Materiais > Novo, ou o atalho "Criar material do retalho" '
      + 'na tela de Sobras e Retalhos) e refaca a geracao — o sistema nao cria material sozinho a '
      + 'partir de um formulario de retalho.');
  }
  if (!retalho.ativo) {
    throw erro(`O material ${retalho.codigo} do retalho esta inativo — reative o cadastro antes de `
      + 'gerar retalho para ele');
  }
  // Retalhar um material para ELE MESMO seria uma saida e uma entrada no mesmo saldo: o numero
  // muda (baixa 30, entra 1) sem nada ter mudado no mundo fisico, e a sobra apontaria para si
  // mesma. Mesmo criterio da transformacao da 8c ("o resultado e o MESMO material da chapa").
  if (Number(retalho.id) === Number(origem.id)) {
    throw erro(`O retalho ${retalho.codigo} e o mesmo material da origem. Meia chapa nao e chapa: `
      + 'cadastre (ou escolha) um material proprio para o retalho.');
  }

  // Decisao 5: o retalho de material de cliente PERMANECE do cliente. Sem esta guarda, um corte
  // converteria chapa de cliente em patrimonio da GMP (ou o inverso) em silencio.
  await ownerRules.assertMesmoDonoNoRetalho(db, origem, retalho);

  // ── controle_serie: recusa ANTES de mover, porque aqui a compensacao NAO SALVA (fix round 1) ──
  //
  // Achado do review, e a cadeia foi verificada nas duas pontas. Nenhuma das duas pernas informa
  // serie (nao ha campo no payload para isso), entao:
  //  - ORIGEM serializada + modo com baixa: a SAIDA debita sem reivindicar serie, e o estorno dela
  //    e RECUSADO pela guarda de stockService.js:1434 (`COUNT(series ENTREGUE/SUCATEADA) = 0 <
  //    quantidade`). Se a perna 2 falhasse, `compensarRetalho` estouraria NO ESTORNO DA BAIXA — que
  //    de proposito nao tem `.catch` — e o material de origem ficaria BAIXADO sem retalho nenhum em
  //    troca. E exatamente o estado que a compensacao existe para impedir, alcancavel justamente
  //    onde ela nao consegue rodar.
  //  - RETALHO serializado: a ENTRADA_RETALHO credita sem serie e fica impossivel de estornar para
  //    sempre (mesma guarda, stockService.js:1414). No ramo da perna 3 o `.catch` engoliria a
  //    recusa e sobraria retalho fantasma — saldo creditado sem linha de sobra.
  // Alem do estorno, os dois casos ja quebram na hora o invariante da Etapa 6b
  // (COUNT(series presentes) == quantidade_atual), que nenhuma compensacao reconstroi.
  //
  // Precedente duplo para RECUSAR em vez de inventar serie: a rota v1 (routes/almoxarifado.js:640-
  // 653) declara `exigeSerie: true` justamente porque o corpo dela nao carrega series, e
  // returnService.js:104 recusa devolucao de material serializado sem as series. A saida do
  // operador e a mesma nos dois: a tela que TEM o seletor de serie.
  //
  // A checagem da ORIGEM e gateada por `baixarOriginal` porque so ela emite movimentacao na origem:
  // no modo sem baixa nada e movido la, o invariante nao e tocado e nao ha estorno para recusar —
  // recusar tambem ali seria falsa recusa, e e justamente o caminho que a mensagem abaixo ensina.
  if (baixarOriginal && origem.controle_serie) {
    throw erro(`O material ${origem.codigo} tem controle de serie e a geracao de retalho nao tem `
      + 'campo para dizer QUAL numero de serie esta sendo cortado. Baixe a peca pela tela de '
      + 'Movimentacoes (que tem seletor de serie) e depois registre o retalho aqui no modo "peca '
      + 'ja baixada do estoque".');
  }
  if (retalho.controle_serie) {
    throw erro(`O material ${retalho.codigo} do retalho tem controle de serie, e nao ha como `
      + 'informar a serie de um retalho — creditar sem serie deixaria o saldo maior que a contagem '
      + 'de series e a entrada nao poderia mais ser estornada. Cadastre (ou escolha) um material de '
      + 'retalho SEM controle de serie: retalho e pedaco, nao unidade rastreada uma a uma.');
  }

  if (baixarOriginal && !(Number(quantidadeBaixa) > 0)) {
    throw erro('Informe a quantidade baixada do material de origem (quantidade_baixa)');
  }
  if (baixarOriginal && origem.controle_lote && !loteOrigemId) {
    throw erro(`O material ${origem.codigo} controla lote: informe o lote de origem `
      + '(lote_origem_id) para gerar retalho com baixa — o retalho herda a rastreabilidade do lote '
      + 'da chapa, e a propria saida exige o lote de qualquer forma.');
  }
  // Lote informado e VALIDADO nos dois modos (decisao 2: "opcional-mas-validado" no modo sem
  // baixa). No modo com baixa o motor tambem valida; no modo sem baixa NINGUEM validaria — e a
  // sobra ficaria com um vinculo de lote que aponta para outro material, que e pior do que nao ter
  // vinculo nenhum (parece rastreabilidade e nao e).
  if (loteOrigemId) {
    const lote = await lotService.getLote(db, loteOrigemId);
    if (!lote) throw erro('Lote de origem nao encontrado');
    if (Number(lote.material_id) !== Number(origem.id)) {
      throw erro(`O lote ${lote.codigo} pertence a outro material, nao a ${origem.codigo}`);
    }
  }

  // A frase montada so fala em BAIXA quando ha baixa (fix round 1, achado do review). Ela era
  // montada incondicionalmente com `quantidade_baixa`, que no modo sem baixa e `undefined` de
  // proposito — entao, sem justificativa do operador, a AUDITORIA do evento gravava "...:
  // undefined UN baixados...". Registro que mente e pior do que registro ausente: quem for
  // auditar "quem gerou este retalho" leria uma baixa que nunca existiu. Mesmo condicional que a
  // justificativa da entrada ja tinha.
  const justificativaMontada = baixarOriginal
    ? `Retalho gerado de ${origem.codigo}: ${quantidadeBaixa} ${origem.unidade || ''} baixados `
      + `para gerar ${quantidadeRetalho} ${retalho.unidade || ''} de ${retalho.codigo}`
    : `Retalho gerado de ${origem.codigo}: entrada de ${quantidadeRetalho} `
      + `${retalho.unidade || ''} de ${retalho.codigo} (peca ja tinha saido do estoque)`;
  const justificativaEvento = (justificativa && String(justificativa).trim()) || justificativaMontada;

  // ── 2. Perna 1: a baixa do original ─────────────────────────────────────────────────────────
  let movBaixa = null;
  if (baixarOriginal) {
    movBaixa = await stockService.registrarMovimentacao(db, user, {
      material_id: origem.id,
      tipo: 'SAIDA',
      quantidade: Number(quantidadeBaixa),
      lote_id: loteOrigemId || undefined,
      projeto_id: projetoId || undefined,
      os_id: osId || undefined,
      centro_custo_id: centroCustoId || undefined,
      justificativa: justificativaEvento,
    }, { exigeLote: true });
  }

  const justificativaEntrada = `Retalho gerado de ${origem.codigo}`
    + (movBaixa ? ` (baixa #${movBaixa.id})`
      : ' (peca ja tinha saido do estoque — sobra devolvida do chao de fabrica)');

  // ── 3. Pernas 2 e 3, com compensacao do que ja foi aplicado ─────────────────────────────────
  let movEntrada = null;
  let sobraId = null;
  try {
    movEntrada = await stockService.registrarMovimentacao(db, user, {
      material_id: retalho.id,
      tipo: 'ENTRADA_RETALHO',
      quantidade: quantidadeRetalho,
      localizacao_destino_id: localizacaoId || undefined,
      justificativa: justificativaEntrada,
      // SEM custo_unitario. Ver o bloco "Custo: ZERO, sempre" no docstring — a ausencia e a regra.
    });

    // `tipo_material` NAO vem do payload: e herdado do material de origem, no mesmo espirito da
    // decisao 5 (dono e categoria herdados) — o retalho E aquele material, so que parcial, e um
    // campo digitavel aqui so criaria divergencia entre a sobra e o catalogo.
    const ins = await dbRun(db, `INSERT INTO sobras_material_almoxarifado
      (material_id, tipo_material, dimensoes_originais, dimensoes_restantes, espessura,
       material_descricao, peso_aproximado, localizacao_id, projeto_origem_id, os_origem_id,
       reutilizavel, status, observacoes, norma, diametro, largura, comprimento,
       criado_por_id, criado_por_nome, lote_origem_id, material_retalho_id,
       movimentacao_baixa_id, movimentacao_entrada_id)
      VALUES (?,?,?,?,?,?,?,?,?,?,1,'DISPONIVEL',?,?,?,?,?,?,?,?,?,?,?)`, [
      origem.id, origem.tipo_material || null,
      ouNulo(payload.dimensoes_originais), ouNulo(payload.dimensoes_restantes),
      ouNulo(payload.espessura), ouNulo(payload.material_descricao), ouNulo(payload.peso_aproximado),
      localizacaoId || null, ouNulo(payload.projeto_origem_id), ouNulo(payload.os_origem_id),
      ouNulo(payload.observacoes), ouNulo(payload.norma), ouNulo(payload.diametro),
      ouNulo(payload.largura), ouNulo(payload.comprimento),
      user.id, user.nome || user.email || null,
      loteOrigemId || null, retalho.id,
      movBaixa ? movBaixa.id : null, movEntrada.id,
    ]);
    sobraId = ins.lastID;
  } catch (e) {
    await compensarRetalho(db, user, { movEntrada, movBaixa });
    throw e;
  }

  const sobra = await dbGet(db, 'SELECT * FROM sobras_material_almoxarifado WHERE id = ?', [sobraId]);

  // Auditoria FORA do try de proposito: ela e o registro de um evento que JA aconteceu por
  // inteiro. Dentro, uma falha de gravacao do log desfaria uma geracao de retalho valida — e
  // auditoria e para nao perder o rastro, nao para poder cancelar o fato.
  await registrarAuditoria(db, {
    entidade: 'sobra',
    entidade_id: sobraId,
    acao: 'gerar_retalho',
    usuario_id: user.id,
    usuario_nome: user.nome || user.email,
    dados_novos: {
      material_origem_id: origem.id,
      material_origem_codigo: origem.codigo,
      material_retalho_id: retalho.id,
      material_retalho_codigo: retalho.codigo,
      quantidade_retalho: quantidadeRetalho,
      baixar_original: !!baixarOriginal,
      quantidade_baixa: baixarOriginal ? Number(quantidadeBaixa) : null,
      lote_origem_id: loteOrigemId || null,
      localizacao_id: localizacaoId || null,
      movimentacao_baixa_id: movBaixa ? movBaixa.id : null,
      movimentacao_entrada_id: movEntrada.id,
    },
    justificativa: justificativaEvento,
  });

  return {
    sobra,
    movimentacao_baixa_id: movBaixa ? movBaixa.id : null,
    movimentacao_entrada_id: movEntrada.id,
  };
}

module.exports = { listarSobras, listarRetalhosDisponiveis, atualizarSobra, gerarRetalho };
