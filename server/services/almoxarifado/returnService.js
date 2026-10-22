const { dbRun, dbAll, dbGet } = require('./db');
const { registrarMovimentacao } = require('./stockService');
const lotService = require('./lotService');
// Etapa 121 (C252, B784): as Auditorias deste arquivo rodam depois do ato (ou num catch que relanca o erro original).
const { registrarAuditoriaDoAto } = require('./audit');
// Etapa 96 (C176): a regra unica de quantidade (namespace — Fase 2, I3).
const Q = require('./quantidade');
// Etapa 97 (Fase 5, item 2): as duas pernas da devolucao (QUARENTENA, SUCATA) sob uma trava do material.
const trava = require('./travaPorMaterial');
// Etapa 117 (C236, B759): so a devolucao viva (a entrada nao estornada) conta no que ja voltou da saida.
// Etapa 121 (C253, B783): e a serie que voltou por outra entrada tambem nao se devolve de novo.
const { DEVOLUCAO_VIVA_SQL, seriesQueVoltaramSql } = require('./devolucaoViva');
// Sem ciclo: nem alertService nem notificationQueueService requerem este arquivo (Etapa 12,
// Task 3, RN-06 — aviso de devolucao em ESTADO_PARCIAL). stockService (acima) ja carregou os
// dois por completo antes desta linha rodar, entao aqui e so cache-hit.
const alertService = require('./alertService');
const notificationQueueService = require('./notificationQueueService');

const MOTIVOS = ['SOBRA_PROJETO', 'NAO_UTILIZADO', 'ITEM_ERRADO', 'DANIFICADO', 'RECUPERAVEL', 'SUCATA'];
const DESTINOS = ['ESTOQUE', 'QUARENTENA', 'SUCATA', 'RETRABALHO'];

// Etapa 7: os tipos de saida que uma devolucao pode desfazer. SUCATA, PERDA e AJUSTE_NEGATIVO
// ficam FORA de proposito — nao se devolve o que foi descartado nem o que foi corrigido por
// ajuste. A rota /devolucoes/saidas-elegiveis (Task 4) usa a mesma lista, para que a tela nunca
// ofereca uma saida que o servico vai recusar.
const TIPOS_SAIDA_DEVOLVIVEL = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA'];

// Etapa 178 (C2): a literal do plano ("estornada pelo livro" trocado por "devolvida").
const MSG_DEVOLUCAO_SAIDA_EPI = 'Saída de entrega de EPI não pode ser devolvida — a ficha do colaborador continuaria dizendo que recebeu';
const erro400 = (msg) => Object.assign(new Error(msg), { status: 400 });

/**
 * Valida a saida citada por uma devolucao e devolve a linha da movimentacao.
 * Cada recusa nomeia a razao ESPECIFICA: uma mensagem generica de "saida invalida" deixa o
 * operador sem saber se errou o material, se a entrega foi estornada ou se ja devolveu tudo.
 */
async function validarSaidaOriginal(db, { movimentacaoSaidaId, materialId, quantidade }) {
  const saida = await dbGet(db, 'SELECT * FROM movimentacoes_almoxarifado WHERE id = ?', [movimentacaoSaidaId]);
  if (!saida) throw erro400(`Movimentação de saída ${movimentacaoSaidaId} não encontrada`);
  // Etapa 118 (C240, RN-09; B772): o claim do estorno grava `cancelado = 1` ANTES do efeito e o desfaz se o estorno falhar —
  // so o estorno concluido tem `movimento_estorno_id` (a ultima escrita dele; devolucaoViva.estornoConcluidoSql). No meio, a
  // recusa dizia que o estorno ja tinha devolvido o material, e o estorno que falhava deixava a saida de pe.
  if (saida.cancelado && saida.movimento_estorno_id == null) {
    throw erro400(`A saída ${movimentacaoSaidaId} tem um estorno em andamento que ainda não concluiu — nada foi gravado. Tente de `
      + 'novo em instantes; se a recusa continuar, o estorno foi interrompido: avise o administrador do almoxarifado.');
  }
  if (saida.cancelado) {
    throw erro400(`A saída ${movimentacaoSaidaId} foi cancelada (estornada) — o estorno já devolveu o material`);
  }
  // Etapa 178 (C2, letra D): a saida de uma entrega de EPI nao se devolve por aqui — a ficha do colaborador (append-only, com a
  // assinatura) continuaria dizendo que ele recebeu. Devolucao de EPI e etapa propria. Casa pelo vinculo da entrega; a mesma
  // condicao vai no INSERT da devolucao (abaixo).
  if (await dbGet(db, 'SELECT 1 AS v FROM entregas_epi_almoxarifado WHERE movimentacao_id = ?', [movimentacaoSaidaId])) {
    throw erro400(MSG_DEVOLUCAO_SAIDA_EPI);
  }
  if (Number(saida.material_id) !== Number(materialId)) {
    throw erro400(`A saída ${movimentacaoSaidaId} é de outro material`);
  }
  if (!TIPOS_SAIDA_DEVOLVIVEL.includes(saida.tipo)) {
    throw erro400(`A movimentação ${movimentacaoSaidaId} é do tipo ${saida.tipo} e não é uma entrega devolvível `
      + `(devolvíveis: ${TIPOS_SAIDA_DEVOLVIVEL.join(', ')})`);
  }
  // Etapa 117 (Fase 5, revisor 1; C244): a entrega de uma requisicao EXCLUIDA nao se devolve — a exclusao ja devolveu ao
  // estoque o que faltava voltar (e a saida fica de pe no livro, sem o selo de estornada). Devolver de novo contava em dobro:
  // entrega 2, excluir (5), devolver 2 -> 7.
  if (await requisicaoExcluida(db, saida.requisicao_id)) {
    throw erro400(`A saída ${movimentacaoSaidaId} é de uma requisição excluída — a exclusão já devolveu o material ao estoque`);
  }
  // Etapa 117 (C236, RN-01): so a devolucao viva — a que teve a entrada estornada pelo livro tirou o material de novo, e
  // conta-la recusava devolver o que esta de fato fora ("ja foram devolvidos 2 e restam 0" com o material na rua).
  const { devolvida } = await dbGet(db,
    `SELECT COALESCE(SUM(d.quantidade),0) AS devolvida FROM devolucoes_material_almoxarifado d
      WHERE d.movimentacao_saida_id = ? AND ${DEVOLUCAO_VIVA_SQL}`, [movimentacaoSaidaId]);
  // Etapa 121 (C253, B783): as series desta saida que voltaram por uma entrada que nao a cita (Entrada avulsa, devolucao
  // avulsa) tambem ja voltaram — com a serie desligada, devolve-las de novo contava em dobro (2 pecas, fisico 4).
  const { voltaram } = await dbGet(db, `SELECT ${seriesQueVoltaramSql('?')} AS voltaram`, [movimentacaoSaidaId, movimentacaoSaidaId]);
  // Etapa 96 (C176, Fase 2 I1): o restante e uma DIFERENCA (0,3 - 0,1 = 0.19999999999999998) — arredondado, e a
  // comparacao com folga; a mensagem diz os numeros arredondados (R2). Nunca negativo: a devolucao que nao leva serie
  // (RETRABALHO, SUCATA sem serie, a devolucao sem serie da B755) deixa as series "Entregue", e uma Entrada de uma delas
  // depois soma nas duas contas. Fase 2 da 121 (I1, B785): a SOMA fica, de proposito — nao ha como saber se a peca que voltou
  // e a mesma da devolucao sem serie (entao restaria a outra) ou a outra (entao nao resta nada); o MAIOR dos dois devolveria
  // em dobro no segundo caso. Recusar nunca conta em dobro; a peca que de fato esta fora volta pela devolucao avulsa.
  const restante = Math.max(0, Q.qtd(saida.quantidade - devolvida - Number(voltaram || 0)));
  // `>` com a folga, e nao `!Q.cabe`: quantidade nao numerica (NaN) continua passando daqui para a recusa de sempre do
  // motor, em vez de virar "acima do entregue".
  if (Q.qtd(quantidade) > restante + Q.QTD_FOLGA) {
    // A mensagem DIZ o numero: sem ele o operador tem de adivinhar quanto ainda pode devolver. Sem volta por outra entrada,
    // a literal de sempre (nao muda); com ela, a frase diz quantas voltaram por fora, senao "devolvidos 0 e restam 0" nao fecha.
    const porFora = Number(voltaram || 0) > 0
      ? `, ${voltaram} ${voltaram > 1 ? 'já voltaram' : 'já voltou'} ao estoque por uma entrada que não cita esta saída`
      : '';
    throw erro400(`Devolução acima do entregue: a saída ${movimentacaoSaidaId} entregou ${Q.qtd(saida.quantidade)}, `
      + `já foram devolvidos ${Q.qtd(devolvida)}${porFora} e restam ${restante}`);
  }
  return saida;
}

/** Etapa 117 (C244): a requisicao da saida foi excluida (`ativo = 0`). */
async function requisicaoExcluida(db, requisicaoId) {
  if (!requisicaoId) return false;
  const r = await dbGet(db, 'SELECT COALESCE(ativo, 1) AS ativo FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  return !!r && Number(r.ativo) === 0;
}
/** O mesmo, em SQL correlacionado com a saida (apelido `alias`) — para o INSERT condicional e a lista. */
const requisicaoNaoExcluidaSql = (alias) => `NOT EXISTS (SELECT 1 FROM requisicoes_almoxarifado rqx
  WHERE rqx.id = ${alias}.requisicao_id AND COALESCE(rqx.ativo, 1) = 0)`;

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
  // Etapa 58: herda o lote da saida citada sempre que ela TEM lote — a entrega passou a poder
  // escolher lote tambem em material sem controle_lote, e voltar sem lote tiraria o saldo dele.
  // Fase 5: so para os destinos que ENTRAM (estoque/quarentena) — no RETRABALHO a devolucao e uma
  // saida, e herdar um lote vencido/curto passaria a recusar o que antes passava.
  const herdaLote = saidaOriginal && (material.controle_lote || ['ESTOQUE', 'QUARENTENA'].includes(destinoFinal));
  const loteFinalId = lote_id || (herdaLote ? saidaOriginal.lote_id : null) || null;

  // Heranca de projeto_id/os_id (Etapa 14, Task 3 — RN-05, emenda I2, MESMO MOLDE da heranca de
  // lote acima): o valor informado a mao pelo chamador GANHA; sem informar, herda da saida
  // CITADA (quando ha vinculo). Devolucao AVULSA (sem movimentacao_saida_id) continua sem
  // projeto/os — declarado, nao ha de onde herdar. SEM esta heranca o relatorio de custo por
  // projeto tem `devolvido` ESTRUTURALMENTE ZERO em producao: a tela (DevolucoesAlmoxarifado.js)
  // nunca envia origem_projeto_id/origem_os_id no payload — medido.
  const origemProjetoFinal = origem_projeto_id || (saidaOriginal ? saidaOriginal.projeto_id : null) || null;
  const origemOsFinal = origem_os_id || (saidaOriginal ? saidaOriginal.os_id : null) || null;

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
  // Etapa 117 (Fase 5, revisor 1; B766): com a entrega citada, cada serie tem de ter saido NELA (Entregue com o vinculo a
  // ela, ou sem vinculo — legado anterior ao vinculo). Desde a 117 o estorno da entrada da devolucao devolve as series da
  // entrada a "Entregue" na saida citada; uma serie digitada errada (inexistente: nascia nova) ou de outra saida passava a
  // constar daquela saida — fisico 1 com 2 series presentes. A tela so oferece as series da entrega.
  if (saidaOriginal && destinoAceitaSerie && material.controle_serie) {
    for (const numero of seriesInformadas) {
      const sr = await dbGet(db, 'SELECT status, movimentacao_saida_id FROM series_almoxarifado WHERE material_id = ? AND numero = ?',
        [material_id, numero]);
      const daSaida = sr && sr.status === 'ENTREGUE'
        && (sr.movimentacao_saida_id == null || Number(sr.movimentacao_saida_id) === Number(movimentacao_saida_id));
      if (!daSaida) {
        throw erro400(`A série ${numero} não saiu na saída ${movimentacao_saida_id} — informe as séries desta entrega `
          + '(a lista mostra as que estão fora) ou registre a devolução sem citar a entrega.');
      }
    }
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

  // Etapa 116 (Fase 5, revisor 2): com vinculo, a linha so nasce se a saida continua nao estornada e o que se devolve ainda
  // cabe no restante — a conferencia de `validarSaidaOriginal` e a gravacao num comando so. Lidas antes, separadas, duas
  // devolucoes simultaneas da mesma saida passavam as duas (30/30: fisico 7 para 5), e o estorno concorrente tambem (o claim
  // do estorno tem a condicao inversa: nenhuma devolucao viva). Nao gravou -> a validacao de novo diz por que.
  // Etapa 117 (C236, RN-02): a mesma regua viva da validacao — se so uma das duas contasse a viva, a validacao passaria e
  // esta gravacao recusaria com "mudou enquanto a devolucao era gravada". Etapa 121 (C253, RN-07): e a mesma volta por outra
  // entrada — a que chega entre a validacao e este comando faz a validacao de baixo dizer quantas voltaram.
  const valores = [
    material_id, quantidade, motivo, condicao || null, destinoFinal,
    origemOsFinal, origemProjetoFinal,
    user.id, user.nome || user.email, observacoes || null,
    movimentacao_saida_id || null, loteFinalId,
  ];
  const colunas = `(material_id, quantidade, motivo, condicao, destino, origem_os_id, origem_projeto_id,
     responsavel_id, responsavel_nome, observacoes, movimentacao_saida_id, lote_id)`;
  const r = movimentacao_saida_id
    ? await dbRun(db, `INSERT INTO devolucoes_material_almoxarifado ${colunas}
      SELECT ?,?,?,?,?,?,?,?,?,?,?,?
      WHERE EXISTS (SELECT 1 FROM movimentacoes_almoxarifado s WHERE s.id = ? AND COALESCE(s.cancelado, 0) = 0
        AND ${requisicaoNaoExcluidaSql('s')}
        AND NOT EXISTS (SELECT 1 FROM entregas_epi_almoxarifado ee WHERE ee.movimentacao_id = s.id)
        AND ROUND(s.quantidade - (SELECT COALESCE(SUM(d.quantidade), 0) FROM devolucoes_material_almoxarifado d
          WHERE d.movimentacao_saida_id = s.id AND ${DEVOLUCAO_VIVA_SQL}) - ${seriesQueVoltaramSql('s.id')}, 6)
          >= ROUND(?, 6) ${Q.FOLGA_SQL})`,
    [...valores, movimentacao_saida_id, Q.qtd(quantidade)])
    : await dbRun(db, `INSERT INTO devolucoes_material_almoxarifado ${colunas} VALUES (?,?,?,?,?,?,?,?,?,?,?,?)`, valores);
  if (!r.changes) {
    await validarSaidaOriginal(db, { movimentacaoSaidaId: movimentacao_saida_id, materialId: material_id, quantidade });
    throw erro400(`A saída ${movimentacao_saida_id} mudou enquanto a devolução era gravada — nada foi gravado. Tente de novo.`);
  }

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
  // `daDevolucao` (Etapa 117, B764): so esta porta grava ENTRADA_DEVOLUCAO com a referencia DEV-<id>.
  const opcoesEntrada = { exigeLote: true, exigeSerie: destinoAceitaSerie, daDevolucao: true };

  // ── COMPENSACAO DA DEVOLUCAO (conserto da Etapa 7, fora do plano) ───────────────────────────
  //
  // POR QUE ISTO EXISTE: a linha da devolucao TEM de ser gravada antes das movimentacoes — o
  // `referencia: DEV-<id>` acima depende do `id` que so o INSERT produz. E este modulo NAO TEM
  // TRANSACAO: cada escrita no SQLite vale por si, entao toda escrita que pode falhar DEPOIS de
  // outra precisa do seu desfazer explicito, escrito a mao. E o mesmo padrao de
  // `seriesService.desfazerEntrada`/`desfazerSaida`. (Quem resolve isto de vez e a migracao para
  // Postgres, com transacao de verdade — fora do escopo desta etapa.)
  //
  // O BUG, medido com sonda executada (2026-08-12): material com controle_lote, entrada de 20 no
  // lote L1, saida de 10, e entao uma devolucao AVULSA de 3 sem informar lote respondia
  // 400 "exige lote" e deixava `linhas em devolucoes_material_almoxarifado antes: 0 | depois: 1`.
  // Duas consequencias:
  //   1. `listarDevolucoes` (a tela da Etapa 7) mostrava uma devolucao que nunca aconteceu.
  //   2. Pior, quando a recusada CITAVA uma saida: o SUM de `quantidade_devolvida` — usado tanto
  //      por `validarSaidaOriginal` quanto pelo `saldo_devolvivel` de `listarSaidasElegiveis` —
  //      contava a linha fantasma. Cada recusa encolhia PARA SEMPRE o quanto ainda podia ser
  //      devolvido daquela entrega, e nada avisava.
  //
  // POR QUE COMPENSACAO E NAO MAIS PRE-VALIDACAO CASO A CASO: as pre-validacoes das Tasks 3
  // (lote do destino SUCATA) e 5 (cardinalidade de serie) continuam acima e continuam sendo a
  // PRIMEIRA linha de defesa — sao elas que impedem o par entrada+saida da sucata de ficar meio
  // feito, coisa que compensacao nenhuma aqui conseguiria desfazer. Mas elas fecham CASOS, e o
  // buraco e GERAL: qualquer erro do motor depois do INSERT deixa a linha, e a lista de erros do
  // motor cresce sem este arquivo ficar sabendo. Perseguir cada um deles com mais uma checagem
  // seria correr atras de um alvo que se move.
  // Etapa 97 (Fase 5, item 2): os destinos de DUAS pernas (QUARENTENA: ENTRADA_DEVOLUCAO + BLOQUEIO; SUCATA:
  // ENTRADA_DEVOLUCAO + SUCATA) rodam sob UMA trava do material. Antes cada perna pegava a trava sozinha (o motor, B494):
  // uma separacao entre as duas separava o que a entrada acabou de creditar e a segunda perna o levava — SUCATA: fisico 0
  // com caixa 4; QUARENTENA: bloqueado 4 + caixa 4 sobre fisico 4 —, e a entrega ficava presa em "Maximo: 0" (igual na
  // base, 20/20). O "par soma zero" da perna SUCATA (Fase 2, I-4) so vale sem nada entre as pernas; a trava garante isso.
  // O motor, chamado aqui dentro, roda direto (`naTravaDoMaterial`: a secao segura o material). `naTravaDoMaterial` e nao
  // `comLockDoMaterial`: fora de secao (a rota, unico chamador) e a mesma coisa; chamado de dentro de uma secao que ja
  // segura o material nao espera a si mesmo. O `catch` (compensacao) roda FORA da trava. Destinos de uma perna so
  // (ESTOQUE, RETRABALHO): a trava do proprio motor basta.
  // Etapa 121 (Fase 5, r2; B786): a releitura DENTRO da trava do material. A validacao e o INSERT condicional rodam antes, fora
  // dela; uma Entrada das series (que as reativa e grava de que saida vieram) e o desligar da serie no meio faziam o motor da
  // devolucao rodar com o controle ja desligado — as series informadas ignoradas, a guarda "serie ja em estoque" sem rodar — e
  // creditar de novo (fisico 4 com 2 pecas; 20/20 com o gancho, 8/300 sem, anterior a etapa). Aqui: (1) devolucao com series e
  // o controle desligado desde a validacao -> recusa; (2) devolucao citando a saida e o que ja voltou dela (devolucoes vivas,
  // ESTA incluida, + as series que voltaram por fora) passando do entregue -> recusa. Lanca antes de qualquer perna: o catch de
  // baixo (emitidas 0) apaga a linha. Descartado: a devolucao inteira (validacao e INSERT) sob a trava — a conferencia
  // devolucao x estorno vai no proprio comando, e uma devolucao no meio de um estorno espera hoje so o que precisa.
  const reconferirNaTrava = async () => {
    if (seriesInformadas.length > 0) {
      const agora = await dbGet(db, 'SELECT controle_serie FROM materiais_almoxarifado WHERE id = ?', [material_id]);
      if (!agora || Number(agora.controle_serie) !== 1) {
        throw erro400(`O controle por número de série do material ${material.codigo} foi desligado enquanto a devolução era `
          + 'gravada — nada foi gravado. Registre a devolução de novo.');
      }
    }
    if (movimentacao_saida_id) {
      const c = await dbGet(db, `SELECT s.quantidade AS q,
          (SELECT COALESCE(SUM(d.quantidade), 0) FROM devolucoes_material_almoxarifado d
            WHERE d.movimentacao_saida_id = s.id AND ${DEVOLUCAO_VIVA_SQL}) AS dev,
          ${seriesQueVoltaramSql('s.id')} AS volt
        FROM movimentacoes_almoxarifado s WHERE s.id = ?`, [movimentacao_saida_id]);
      if (c && Q.qtd(Number(c.dev) + Number(c.volt)) > Q.qtd(c.q) + Q.QTD_FOLGA) {
        throw erro400(`A saída ${movimentacao_saida_id} mudou enquanto a devolução era gravada — nada foi gravado. Tente de novo.`);
      }
    }
  };
  const pernas = async () => {
    if (destinoFinal === 'ESTOQUE' || destinoFinal === 'QUARENTENA') {
      await reconferirNaTrava();
      await registrarMovimentacao(db, user, {
        material_id, tipo: 'ENTRADA_DEVOLUCAO', quantidade,
        motivo, os_id: origemOsFinal, projeto_id: origemProjetoFinal,
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
        motivo, os_id: origemOsFinal, projeto_id: origemProjetoFinal,
        localizacao_destino_id: localizacao_id, lote_id: loteFinalId,
        series: seriesInformadas,
        justificativa: observacoes, referencia,
      }, opcoesEntrada);
      await registrarMovimentacao(db, user, {
        // Revisao da Task 3 (I-1): o ramo SUCATA herdava os_id mas NAO projeto_id — uma linha
        // assimetrica com duas consequencias medidas: (a) a sucata saia do encargo do projeto
        // e nao entrava no de ninguem (ENTRADA_DEVOLUCAO creditava `devolvido` e o SUCATA —
        // que ESTA em TIPOS_SAIDA e conta como consumido — nascia sem projeto: buraco
        // contabil no custo-por-projeto); (b) na devolucao-sucata de material de CLIENTE, o
        // ramo com OS ja completava 201 pela heranca e o ramo com PROJETO dava 400 + estado
        // parcial — divergencia por acidente. Com o projeto herdado, a guarda do dono aceita
        // (mesmo cliente da saida citada) e os DOIS ramos completam; o estado parcial
        // pre-existente desse fluxo morre. Declarado no design.
        material_id, tipo: 'SUCATA', quantidade, motivo, os_id: origemOsFinal,
        projeto_id: origemProjetoFinal,
        localizacao_origem_id: localizacao_id, lote_id: loteFinalId,
        justificativa: observacoes || motivo, referencia,
        // Etapa 97 (Fase 2, I-4): par da ENTRADA_DEVOLUCAO logo acima (soma zero) — fica na regua de hoje. Na regua das
        // portas avulsas, no legado (caixa > fisico), a entrada gravava e esta perna recusava: devolucao pela metade.
      }, { ...opcoes, parDaDevolucao: true });
    } else if (destinoFinal === 'RETRABALHO') {
      await registrarMovimentacao(db, user, {
        material_id, tipo: 'RETRABALHO', quantidade, motivo, os_id: origemOsFinal,
        lote_id: loteFinalId, referencia,
      });
    }
  };
  try {
    // Etapa 121 (Fase 5, r2; B786): ESTOQUE tambem — a releitura de `reconferirNaTrava` so vale dentro da secao.
    if (destinoFinal === 'ESTOQUE' || destinoFinal === 'QUARENTENA' || destinoFinal === 'SUCATA') {
      await trava.naTravaDoMaterial(material_id, pernas);
    } else await pernas();
  } catch (e) {
    // A PERGUNTA QUE DECIDE: alguma movimentacao chegou ao LIVRO? Contar linhas por `referencia`
    // responde exatamente isso — `DEV-<id>` e unica por devolucao, e o motor grava o ledger por
    // ultimo, compensando os proprios efeitos de saldo quando falha antes disso (ver o catch
    // amplo de `registrarMovimentacao`). Linha no livro = estoque mexido de verdade.
    const { emitidas } = await dbGet(db,
      'SELECT COUNT(*) AS emitidas FROM movimentacoes_almoxarifado WHERE referencia = ?', [referencia]);

    if (emitidas === 0) {
      // Nada aconteceu no estoque: a linha da devolucao e pura ficcao. Apaga.
      await dbRun(db, 'DELETE FROM devolucoes_material_almoxarifado WHERE id = ?', [r.lastID]);
      // Etapa 121 (C252, B784): a falha desta Auditoria trocava o 400 do motor ("exige lote") por 500 — nao-fatal, e o
      // `throw e` abaixo segue com o erro original. `require` local: o topo do arquivo muda em paralelo (C253).
      await registrarAuditoriaDoAto(db, {
        entidade: 'devolucao', entidade_id: r.lastID, acao: 'COMPENSACAO',
        usuario_id: null, usuario_nome: 'sistema',
        dados_anteriores: {
          material_id, quantidade, destino: destinoFinal,
          movimentacao_saida_id: movimentacao_saida_id || null, lote_id: loteFinalId,
        },
        dados_novos: null,
        justificativa: `compensacao automatica de devolucao que falhou: ${e.message}`,
      });
    } else {
      // A LINHA FICA, DE PROPOSITO. Alguma perna ja mexeu no estoque — o caso do destino SUCATA,
      // que emite ENTRADA_DEVOLUCAO e so DEPOIS a SUCATA. Apagar aqui seria PIOR do que o bug:
      // a linha da devolucao passaria a ser o unico rastro de um movimento que de fato aconteceu,
      // e o livro ficaria com uma ENTRADA_DEVOLUCAO cuja `referencia` nao aponta para nada. O que
      // este ramo pode fazer e deixar o estado parcial REGISTRADO, para ser resolvido a mao —
      // desfazer a perna ja gravada daqui seria reimplementar o estorno pela metade.
      // Etapa 121 (C252, B784): nao-fatal — a falha desta Auditoria mascarava o erro do motor e pulava o aviso abaixo.
      await registrarAuditoriaDoAto(db, {
        entidade: 'devolucao', entidade_id: r.lastID, acao: 'ESTADO_PARCIAL',
        usuario_id: user.id, usuario_nome: user.nome || user.email,
        dados_novos: {
          referencia, movimentacoes_emitidas: emitidas, destino: destinoFinal, quantidade,
        },
        justificativa: `devolucao ficou parcial: ${emitidas} movimentacao(oes) ja gravada(s) quando o motor `
          + `recusou o restante (${e.message}). A linha foi MANTIDA porque e o rastro do que ja mexeu no estoque.`,
      });

      // RN-06/RN-01: aviso da devolucao parcial na fila, ANTES do `throw e` abaixo, em try/catch
      // PROPRIO — o aviso nao pode nem engolir nem substituir o erro original que o operador
      // precisa ler (a mensagem do motor e o que diz o que corrigir).
      // Revisao da Task 3 (I1): destino e alertas_estoque_emails -> o toggle "Notificar por
      // e-mail" governa (mesma regra do zerado e das varreduras). O parseBool com default
      // ligado vive em alertService.alertasEmailLigado; se o toggle falhar na leitura, o
      // catch abaixo engole como qualquer falha de aviso (RN-01).
      try {
        if (await alertService.alertasEmailLigado(db)) {
        const destinatarios = alertService.parseList(await alertService.getConfigValue(db, 'alertas_estoque_emails'));
        const linhas = [
          `Devolução: #${r.lastID}`,
          `Material: ${material.codigo}`,
          `Quantidade: ${quantidade}`,
          `Destino: ${destinoFinal}`,
          `Movimentações emitidas: ${emitidas}`,
          `Motivo da falha: ${e.message}`,
        ];
        await notificationQueueService.enfileirar(db, {
          evento: 'DEVOLUCAO_PARCIAL',
          dedupe_chave: `devolucao-parcial-${r.lastID}`,
          destinatarios,
          assunto: `[Almoxarifado] Devolução ficou parcial — #${r.lastID}`,
          corpo_texto: linhas.join('\n'),
          corpo_html: `<div>${linhas.map((l) => `<p>${alertService.escapeHtml(l)}</p>`).join('\n')}</div>`,
          payload: { devolucao_id: r.lastID },
        });
        }
      } catch (avisoErr) {
        console.warn('[almoxarifado-notificacoes] Falha ao enfileirar aviso de devolucao parcial:', avisoErr.message);
      }
    }
    // Re-lanca o erro ORIGINAL, sem mascarar: a mensagem do motor e o que o operador le e o que
    // diz o que corrigir ("exige lote", "saldo insuficiente"). Trocar por um "falha ao registrar
    // devolucao" generico transformaria um erro acionavel em adivinhacao.
    throw e;
  }

  // Etapa 121 (C252, B784): a devolucao ja esta no livro; a falha da Auditoria respondia 500 e repetir devolvia de novo.
  await registrarAuditoriaDoAto(db, { entidade: 'devolucao', entidade_id: r.lastID, acao: 'CRIACAO', usuario_id: user.id, usuario_nome: user.nome || user.email });
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
 * Etapa 117 (C236, RN-03): as duas pontas somam so a devolucao viva (`devolucaoViva.js`).
 * Etapa 121 (C253, B783): e descontam as series que voltaram por uma entrada que nao cita a saida (`quantidade_reentrada`,
 * campo novo da lista — a tela diz "já voltou ao estoque" em vez de "já devolvido por inteiro").
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
                      WHERE d.movimentacao_saida_id = mv.id AND ${DEVOLUCAO_VIVA_SQL}), 0) AS quantidade_devolvida,
           ${seriesQueVoltaramSql('mv.id')} AS quantidade_reentrada
      FROM movimentacoes_almoxarifado mv
      LEFT JOIN requisicoes_almoxarifado req ON req.id = mv.requisicao_id
     WHERE mv.material_id = ? AND COALESCE(mv.cancelado,0) = 0 AND mv.tipo IN (${marcadores})
       AND ${requisicaoNaoExcluidaSql('mv')}
       -- Etapa 178 (C2): a saida de entrega de EPI nao e devolvivel nesta etapa — nao aparece para escolher.
       AND NOT EXISTS (SELECT 1 FROM entregas_epi_almoxarifado ee WHERE ee.movimentacao_id = mv.id)
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
      // Etapa 121 (C253): a mesma conta da validacao — menos o que voltou por uma entrada que nao cita a saida.
      saldo_devolvivel: Math.max(0, Number((s.quantidade - s.quantidade_devolvida - s.quantidade_reentrada).toFixed(4))),
      series,
    });
  }
  return out;
}

module.exports = {
  MOTIVOS, DESTINOS, TIPOS_SAIDA_DEVOLVIVEL,
  registrarDevolucao, listarDevolucoes, listarSaidasElegiveis,
};
