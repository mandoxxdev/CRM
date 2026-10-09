/**
 * Requisições de material — atendimento parcial com validação de estoque
 */
const { dbRun, dbGet, dbAll } = require('./db');
const { registrarAuditoria } = require('./audit');
const { disponivelSql } = require('./availabilitySql');
const { custoUnitarioSql } = require('./custoSql');
const valueApprovalService = require('./requisitionValueApprovalService');
const stockService = require('./stockService');
const lotService = require('./lotService');
// Sem ciclo: reservationService importa db/audit/stockService, nunca este arquivo.
const reservationService = require('./reservationService');
// Etapa 91 (T1): a trava por material (modulo sem nenhum require — sem ciclo).
const travaPorMaterial = require('./travaPorMaterial');
const { can } = require('./permissions'); // Etapa 64: posso_conferir na fila
const {
  PODE_SEPARAR, PODE_ENTREGAR, STATUS_PARCIALMENTE_RESERVADA, STATUS_TOTALMENTE_RESERVADA,
  calcularStatusPosAprovacao,
} = require('./requisitionStateMachine');

function num(v) {
  return Number(v) || 0;
}

function getEntregue(item) {
  return num(item.quantidade_entregue ?? item.quantidade_atendida);
}

function getSeparado(item) {
  return num(item.quantidade_separada);
}

function pendenteEntrega(item) {
  return Math.max(0, num(item.quantidade_solicitada) - getEntregue(item));
}

function pendenteSeparacao(item) {
  return Math.max(0, num(item.quantidade_solicitada) - getSeparado(item));
}

/**
 * `estoque` aqui é o saldo DISPONÍVEL (quantidade_atual − reservada − bloqueada −
 * em_inspecao), não mais o físico (Etapa 3, Task 3 — fecha o bypass de
 * entregarRequisicao/excluirRequisicao que baixava/estornava direto no físico sem passar
 * pelo motor). Os chamadores (separarRequisicao/entregarRequisicao/normalizarItem) já
 * calculam e passam o disponível.
 */
function maxSeparar(item, estoque) {
  return Math.min(pendenteSeparacao(item), num(estoque));
}

function maxEntregar(item, estoque) {
  const pendente = pendenteEntrega(item);
  if (pendente <= 0) return 0;
  const separadoDisponivel = Math.max(0, getSeparado(item) - getEntregue(item));
  // Segunda rodada após entrega parcial: separado já foi consumido, mas pendente permanece
  if (getEntregue(item) > 0 && separadoDisponivel < pendente) {
    return Math.min(pendente, num(estoque));
  }
  return Math.min(pendente, separadoDisponivel, num(estoque));
}

function normalizarItem(item) {
  const entregue = getEntregue(item);
  const separado = getSeparado(item);
  const solicitado = num(item.quantidade_solicitada);
  // saldo_atual mantém o NOME por compat com o front, mas passa a carregar o DISPONÍVEL
  // quando a query de origem já traz saldo_disponivel (carregarItensRequisicao) — mudança
  // semântica documentada na Task 3. Se só o físico estiver disponível (chamador antigo),
  // cai no físico como antes.
  const estoque = num(item.saldo_atual ?? item.saldo_disponivel ?? item.quantidade_atual);
  const pendente = Math.max(0, solicitado - entregue);
  const entregavel = maxEntregar(item, estoque);
  return {
    ...item,
    quantidade_entregue: entregue,
    quantidade_separada: separado,
    quantidade_atendida: entregue,
    quantidade_pendente: pendente,
    quantidade_entregavel: entregavel,
    saldo_atual: item.saldo_atual ?? estoque,
  };
}

// Etapa 67 (M-1): epsilon de ponto flutuante, o mesmo 1e-9 do resto do modulo. Sem ele, dez
// entregas de 0,1 somam 0,9999999999999999 contra solicitada 1: a requisicao ficava
// PARCIALMENTE_ATENDIDA para sempre, sem data_entrega, e o indicador a contava como nao integral.
// E epsilon, nao tolerancia: 0,9 de 1 continua parcial.
function todosItensCompletos(itens) {
  return itens.every((i) => getEntregue(i) >= num(i.quantidade_solicitada) - 1e-9);
}

/**
 * Saldo que a reserva da PRÓPRIA requisição ainda segura para um item (Etapa 4).
 *
 * `quantidade_reservada` do material entra como dedução no disponível, então sem somar de volta
 * o hold do próprio item a reserva criada na aprovação viraria uma trava contra a requisição que
 * a originou — exatamente a armadilha que a Etapa 4 fecha. Só reservas ATIVAS de origem
 * REQUISICAO contam: reserva manual de terceiro continua sendo saldo de outro dono.
 */
const RESERVADO_PARA_ITEM_SQL = `COALESCE((
      SELECT SUM(r.quantidade - COALESCE(r.quantidade_utilizada,0))
      FROM reservas_material_almoxarifado r
      WHERE r.item_requisicao_id = ir.id AND r.material_id = ir.material_id
        AND r.status = 'ATIVA' AND r.origem = 'REQUISICAO'
    ), 0)`;

async function carregarItensRequisicao(db, requisicaoId) {
  // Etapa 28: `ma.material_critico` entra para a régua da segunda conferência
  // (assertConferidaSeObrigatorio em entregarRequisicao e no liberar-retirada).
  return dbAll(db, `SELECT ir.*, ma.quantidade_atual, ma.unidade, ma.nome as material_nome, ma.codigo as material_codigo,
      ma.material_critico,
      ${custoUnitarioSql('ma')} as custo_unitario,
      ${RESERVADO_PARA_ITEM_SQL} as reservado_para_item,
      (${disponivelSql('ma')} + ${RESERVADO_PARA_ITEM_SQL}) as saldo_disponivel
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    WHERE ir.requisicao_id = ?`, [requisicaoId]);
}

/**
 * Disponível para UM item, já somando o hold da própria requisição (mesma conta do
 * RESERVADO_PARA_ITEM_SQL). Usado nas leituras frescas de separar/entregar, que checam o saldo
 * item a item imediatamente antes de agir.
 */
async function saldoDisponivelParaItem(db, item) {
  const row = await dbGet(db, `SELECT
      ${disponivelSql('ma')} as saldo_disponivel,
      COALESCE((
        SELECT SUM(r.quantidade - COALESCE(r.quantidade_utilizada,0))
        FROM reservas_material_almoxarifado r
        WHERE r.item_requisicao_id = ? AND r.material_id = ma.id
          AND r.status = 'ATIVA' AND r.origem = 'REQUISICAO'
      ), 0) as reservado_para_item
    FROM materiais_almoxarifado ma WHERE ma.id = ?`, [item.id, item.material_id]);
  return {
    disponivel: num(row?.saldo_disponivel) + num(row?.reservado_para_item),
    reservado_para_item: num(row?.reservado_para_item),
  };
}

/**
 * Reserva de material na APROVAÇÃO (Etapa 4, ligação 04→07 — design, decisão 2).
 *
 * Para cada item reserva `min(pendente de atendimento, disponível do material)` e devolve o
 * status que a requisição deve assumir:
 *  - `TOTALMENTE_RESERVADA` — todo item pendente saiu com o pedido inteiro reservado;
 *  - `PARCIALMENTE_RESERVADA` — algo foi reservado, mas não tudo;
 *  - `null` — nada foi reservado; quem chama mantém o status pós-aprovação de sempre
 *    (APROVADO/AGUARDANDO_ESTOQUE/AGUARDANDO_COMPRA), que NÃO pode regredir por causa disto.
 *
 * As reservas são criadas uma a uma (`criarReserva` relê o disponível a cada chamada), então
 * dois itens do MESMO material não reservam o mesmo saldo duas vezes.
 *
 * Etapa 73 (Fase 5): idempotente — o hold ATIVO que o item já tem conta como reservado (só o que
 * falta é reservado, e o status considera o item seguro). Uma falha fora do try de um item (ex.: a
 * leitura do saldo) desfaz as reservas desta chamada e relança.
 *
 * Falha de reserva de um item não derruba a aprovação: a decisão de aprovar já foi tomada e é
 * independente de haver saldo (é justamente o caso AGUARDANDO_ESTOQUE). Um item que não
 * conseguiu reservar conta como não reservado — no pior caso a requisição fica
 * PARCIALMENTE_RESERVADA/sem reserva e a separação segue disputando o disponível como antes.
 */
async function reservarItensAprovacao(db, requisicaoId, user, reqRow = {}) {
  const itens = await carregarItensRequisicao(db, requisicaoId);
  // Etapa 91 (Fase 5, F1): dentro de uma secao da trava (as tres portas de aprovacao), todo material a
  // reservar tem de estar travado por ELA — conferido antes de reservar qualquer item, entao a recusa nao
  // deixa nada para desfazer. Fora de secao nao cobra nada (ver `comTravaDaRequisicao`).
  const foraDaTrava = travaPorMaterial.materiaisForaDaSecao(itens.map((i) => i.material_id));
  if (foraDaTrava.length > 0) {
    throw Object.assign(new Error(MSG_TRAVA_INCOMPLETA), { status: 409, code: 'TRAVA_INCOMPLETA', materiais: foraDaTrava });
  }
  const reservas = [];
  let algumFaltou = false;
  let algumSeguro = false; // algum item com hold: criado agora OU ja existente (Etapa 73, Fase 5)

  try {
    for (const item of itens) {
      const pendente = pendenteEntrega(item);
      if (pendente <= 0) continue; // item já atendido não precisa de hold

      // Etapa 73 (Fase 5, MENOR): desconta a reserva ATIVA que o item JA tem. Uma aprovacao que falhou
      // no meio podia deixar o hold de um item; o /aprovar seguinte reservava o mesmo item de novo
      // (duas reservas de 4 para um item de 4). `disponivel` ja soma o hold do proprio item de volta,
      // entao o livre de verdade e `disponivel - reservado_para_item`.
      // eslint-disable-next-line no-await-in-loop
      const { disponivel, reservado_para_item: jaReservado } = await saldoDisponivelParaItem(db, item);
      const falta = pendente - jaReservado;
      if (jaReservado > 0) algumSeguro = true;
      if (falta <= 1e-9) continue; // o item ja esta todo seguro
      const aReservar = Math.min(falta, Math.max(0, disponivel - jaReservado));
      if (aReservar <= 0) { algumFaltou = true; continue; }

      try {
        // eslint-disable-next-line no-await-in-loop
        const r = await stockService.criarReserva(db, user, {
          material_id: item.material_id,
          quantidade: aReservar,
          projeto_id: reqRow.projeto_id || null,
          os_id: reqRow.os_id || null,
          os_referencia: reqRow.os_referencia || null,
          cliente_id: reqRow.cliente_id || null,
          observacoes: `Reserva automática da requisição ${reqRow.numero || requisicaoId}`,
        }, {
          sistema: true,
          requisicao_id: Number(requisicaoId),
          item_requisicao_id: item.id,
          motivo: `Reserva automática requisição ${reqRow.numero || requisicaoId}`,
        });
        reservas.push({ item_id: item.id, reserva_id: r.id, quantidade: aReservar });
        algumSeguro = true;
        if (aReservar < falta) algumFaltou = true;
      } catch (e) {
        console.warn(`[almoxarifado-reservas] Falha ao reservar item ${item.id} da requisição ${requisicaoId}: ${e.message}`);
        algumFaltou = true;
      }
    }
  } catch (e) {
    // Etapa 73 (Fase 5, MENOR): uma falha FORA do try da reserva (a leitura do saldo do item, uma
    // falha de banco) saia daqui com as reservas dos itens anteriores ja criadas e ninguem sabendo
    // delas: reserva orfa com a requisicao PENDENTE. Desfaz as desta chamada e relanca — quem chama
    // decide (o /aprovar responde erro; a aprovacao automatica deixa a requisicao PENDENTE).
    await desfazerReservas(db, user, reservas);
    throw e;
  }

  if (!algumSeguro) return { status: null, reservas };
  return { status: algumFaltou ? STATUS_PARCIALMENTE_RESERVADA : STATUS_TOTALMENTE_RESERVADA, reservas };
}

/**
 * Etapa 73 (T2, D3/B359) — O POS-APROVACAO, UMA FUNCAO SO PARA AS TRES PORTAS (`/aprovar`,
 * `/aprovar-valor` e a aprovacao automatica do `POST /requisicoes`/`/enviar`).
 *
 * Ate a 73 so o `/aprovar` fazia as duas coisas; a liberacao por valor reservava mas ficava APROVADO
 * sem saldo, e a aprovacao automatica gravava APROVADO sem reservar nada (C122) — o mesmo fato com
 * tres status conforme a porta.
 *
 * A ORDEM E A REGRA: o status pos-aprovacao e calculado ANTES de reservar. Depois de reservar, o
 * disponivel do material ja caiu e o calculo diria AGUARDANDO_* para quem acabou de reservar tudo.
 * Se algo foi reservado, o status de reserva vence; se nada, fica o calculado (APROVADO quando
 * algum item tinha disponivel e a reserva falhou; AGUARDANDO_COMPRA/AGUARDANDO_ESTOQUE sem saldo).
 *
 * Etapa 73 (Fase 5, IMPORTANTE): "se nada, fica o calculado" estava errado sob corrida. Duas
 * aprovacoes simultaneas disputando as ultimas unidades calculavam APROVADO as duas (havia saldo
 * quando calcularam); uma reservava tudo e a outra gravava APROVADO sem reserva e sem saldo (8 de 8
 * rodadas na sonda da revisao, nas tres portas). Agora, se nada ficou seguro e o calculado era
 * APROVADO (que supoe saldo), o status e RECALCULADO com o disponivel relido — a mesma
 * `calcularStatusPosAprovacao`. Nao ha reserva desta chamada a descontar (nada foi reservado), entao
 * a releitura diz a verdade: AGUARDANDO_* se o saldo sumiu; APROVADO se ainda ha saldo e a reserva
 * falhou por outro motivo (o comportamento de antes).
 *
 * Uma falha no meio da reserva (ex.: SQLITE_BUSY lendo o saldo de um item) LANCA, ja com as reservas
 * desta chamada desfeitas (reservarItensAprovacao).
 *
 * Nao grava o status — quem chama grava num UPDATE guardado e, se perder, chama `desfazerReservas`.
 * @returns {Promise<{status: string, reservas: Array<{item_id, reserva_id, quantidade}>}>}
 */
async function prepararPosAprovacao(db, requisicaoId, user, reqRow = {}) {
  const statusPos = await calcularStatusPosAprovacao(db, requisicaoId);
  const reserva = await reservarItensAprovacao(db, requisicaoId, user, reqRow);
  if (reserva.status) return { status: reserva.status, reservas: reserva.reservas };
  const status = statusPos === 'APROVADO' ? await calcularStatusPosAprovacao(db, requisicaoId) : statusPos;
  return { status, reservas: reserva.reservas };
}

/**
 * Etapa 91 (T1, D1/B419) — a trava de TODOS os materiais da requisicao, para as tres portas de aprovacao
 * (`/aprovar`, `/aprovar-valor`, aprovacao automatica) segurarem em volta de `prepararPosAprovacao` E do
 * `UPDATE` guardado (+ o `desfazerReservas` de quem perde). Sem isto a aprovacao lia o saldo livre no meio
 * de uma liberacao (C131: a requisicao mais nova levava o que ia para quem esperava). O `UPDATE` fica
 * dentro: fora, uma distribuicao no meio veria a requisicao ainda PENDENTE (nao candidata) e deixaria a
 * sobra parada. Os materiais sao lidos ANTES de pegar a trava — estavel para TROCA (nenhuma rota troca o
 * `material_id` de um item depois de criado), mas NAO para item novo: a Fase 5 achou o furo (F1) e quem
 * reserva confere a trava (ver o comentario no corpo). `ORDER BY` + `comLockDosMateriais` (DISTINCT, crescente):
 * a ordem unica que impede ciclo com a nota (varios materiais). Nao reentrante: `fn` nunca pode pedir
 * a trava de novo (recalculo da 76, distribuicao sem `sobTrava`, outra porta).
 * @returns {Promise<*>} o retorno de `fn`.
 */
async function comTravaDaRequisicao(db, requisicaoId, fn) {
  // Etapa 91 (Fase 5, achado F1): "ler antes de travar e estavel" valia para TROCA de material, nao para
  // item NOVO. A requisicao nasce PENDENTE antes dos itens (`requisitionCreateService`: cabecalho, depois
  // um item por vez), entao um `/aprovar` que caia no meio da criacao lia {A}, travava so A e
  // `prepararPosAprovacao` reservava B — gravado nesse meio-tempo — sem a trava de B. Reler o conjunto
  // dentro da trava NAO basta (medido: o item pode chegar depois da releitura e antes da leitura dos itens
  // que vao ser reservados). Por isso a prova mora em quem reserva: `reservarItensAprovacao` confere, nos
  // itens que acabou de ler e ANTES de reservar qualquer um, se a secao segura todos os materiais
  // (`travaPorMaterial.materiaisForaDaSecao`); se nao, lanca `TRAVA_INCOMPLETA` sem ter reservado nada.
  // Aqui a secao e solta e refeita com o conjunto maior (sempre por `comLockDosMateriais`: ordem crescente
  // preservada). Limitado a TENTATIVAS_TRAVA_REQUISICAO: na ultima o 409 sobe — nunca uma reserva sem a
  // trava, e nunca um laco sem fim.
  let mats = (await dbAll(db, `SELECT DISTINCT material_id FROM itens_requisicao_almoxarifado
    WHERE requisicao_id = ? AND material_id IS NOT NULL ORDER BY material_id`, [requisicaoId]))
    .map((x) => Number(x.material_id));
  for (let tentativa = 1; ; tentativa += 1) {
    try {
      // eslint-disable-next-line no-await-in-loop
      return await travaPorMaterial.comLockDosMateriais(mats, fn);
    } catch (e) {
      if (!e || e.code !== 'TRAVA_INCOMPLETA' || tentativa >= TENTATIVAS_TRAVA_REQUISICAO) throw e;
      mats = [...new Set([...mats, ...e.materiais])];
    }
  }
}
const TENTATIVAS_TRAVA_REQUISICAO = 3;
/** Etapa 91 (Fase 5, F1): literal do 409 quando a requisicao ganha material novo a cada tentativa. */
const MSG_TRAVA_INCOMPLETA = 'A requisição ganhou itens enquanto era aprovada (ainda está sendo gravada); tente aprovar de novo.';

/**
 * Devolve SO as reservas que a chamada criou (perdeu o UPDATE guardado). Nao
 * `liberarReservasDaRequisicao`: ela soltaria tambem as de uma aprovacao concorrente que venceu
 * (Etapa 47, 9.7/C1). Cada uma no seu try — uma falha nao deixa as outras presas.
 */
async function desfazerReservas(db, user, reservas = []) {
  for (const r of reservas) {
    // Etapa 92 (T3, C148 (1), B438): quem venceu pode ter sido o cancelamento, que ja soltou esta reserva —
    // `liberarReserva` lancaria "Reserva liberada nao pode ser liberada" e o W1 abaixo parecia incidente
    // num desfecho certo (sonda: 5/5). Reserva que ja nao esta ATIVA: I1 e segue. A falha REAL (ativa que
    // nao solta) continua no W1. Residual declarado: soltar entre esta leitura e o liberarReserva ainda da
    // W1 (fechar exigiria o motor reconhecer "ja solta"). Descartado: reconhecer o erro pelo texto.
    // Fase 5: a leitura mora DENTRO do try — antes estava fora e uma falha nela abortava o laco, deixando
    // as reservas seguintes ATIVA. Leitura que falha vale "nao sei": segue para o liberarReserva (solta
    // se ainda ativa; se ja solta, lanca e cai no W1). Descartado: W1 + continue na falha da leitura —
    // deixaria ESTA reserva presa por uma leitura, quando o liberarReserva ainda podia solta-la.
    try {
      // eslint-disable-next-line no-await-in-loop
      const atual = await dbGet(db, 'SELECT status FROM reservas_material_almoxarifado WHERE id = ?', [r.reserva_id])
        .catch(() => null);
      if (atual && atual.status !== 'ATIVA') {
        console.info(`[almoxarifado-aprovar] Reserva ${r.reserva_id} ja estava ${atual.status} — nada a desfazer`);
        continue; // eslint-disable-line no-continue
      }
      // eslint-disable-next-line no-await-in-loop
      await stockService.liberarReserva(db, user, r.reserva_id, null, {
        statusFinal: 'LIBERADA',
        motivo: 'Aprovação recusada — reserva desfeita',
        motivoMovimentacao: 'Liberação por aprovação recusada',
      });
    } catch (relErr) {
      console.warn('[almoxarifado-aprovar] Falha ao desfazer reserva', r.reserva_id, '—', relErr.message);
    }
  }
}

/** Molde: scrapDisposalService.js — nome para a trilha e para a rodada. */
const nomeDoUsuario = (user) => user?.nome || user?.email || null;

/**
 * Régua ÚNICA da segunda conferência (Etapa 28, D2): obrigatória quando há material crítico
 * AINDA NA CAIXA — separado e não entregue. Crítico com `quantidade_separada = 0` ainda não está
 * na caixa; crítico com `separado == entregue` já saiu dela (fix-round 1, F5: antes o universo era
 * "separado > 0" e um crítico já entregue continuava exigindo conferência para entregar o comum).
 * Para virar "sempre" ou "nunca" muda-se esta linha, e só ela.
 */
function conferenciaObrigatoria(itens) {
  return (itens || []).some((i) => Number(i.material_critico) === 1 && (getSeparado(i) - getEntregue(i)) > 0);
}

/**
 * RN-06 (Etapa 28): a barreira das DUAS saídas — `liberar-retirada` e `entregarRequisicao`.
 * Uma função só porque a Fase 2 mediu que a entrega sai direto de EM_SEPARACAO sem passar pela
 * liberação (PODE_ENTREGAR): barreira só na liberação era barreira que ninguém é obrigado a
 * passar. Lança 400 com a mensagem literal do contrato C3 quando há material crítico SEPARADO e
 * ninguém conferiu. Chamar DEPOIS da checagem de status e ANTES de qualquer escrita/baixa.
 */
function assertConferidaSeObrigatorio(reqRow, itens) {
  if (conferenciaObrigatoria(itens) && !reqRow?.conferido_por_id) {
    const err = new Error('Esta requisição tem material crítico separado e ainda não passou pela segunda '
      + 'conferência. Peça a outra pessoa do almoxarifado para conferir a separação antes de liberar ou entregar.');
    err.status = 400;
    throw err;
  }
}

/**
 * O CLAIM da segunda conferência (Etapa 28, RN-03/RN-05). Exportado e provado direto, porque é a
 * única forma determinística de provar o `NOT EXISTS` (achado 2 da Fase 2): com a D3 (rodada nova
 * limpa a conferência), o estado final da corrida separar×conferir do mesmo usuário é seguro em
 * quase toda intercalação MESMO sem ele — um teste de corrida ficaria verde com o WHERE sabotado.
 *
 * As três condições do WHERE são as três barreiras, e cada uma tem um teste com o seu nome:
 *   - `status = 'EM_SEPARACAO'`     — conferir só em separação;
 *   - `conferido_por_id IS NULL`    — uma vez só (duas conferências simultâneas: uma passa);
 *   - `NOT EXISTS (rodada do user)` — QUEM SEPAROU NÃO CONFERE, em qualquer rodada, não só a
 *                                     última. Molde: scrapDisposalService.aprovar (a barreira 3
 *                                     repetida no WHERE), pelo mesmo TOCTOU: a checagem JS em
 *                                     conferirSeparacao lê e decide, o claim escreve depois, e
 *                                     entre as duas não há lock.
 * Devolve a linha (`{ id, conferido_em }`) ou `undefined` quando nenhuma linha satisfez o WHERE.
 */
async function claimConferencia(db, requisicaoId, user) {
  return dbGet(db, `UPDATE requisicoes_almoxarifado
       SET conferido_por_id = ?, conferido_por_nome = ?, conferido_em = CURRENT_TIMESTAMP,
           updated_at = CURRENT_TIMESTAMP
     WHERE id = ? AND status = 'EM_SEPARACAO' AND conferido_por_id IS NULL
       AND NOT EXISTS (SELECT 1 FROM separacoes_requisicao_almoxarifado s
                        WHERE s.requisicao_id = requisicoes_almoxarifado.id AND s.usuario_id = ?)
     RETURNING id, conferido_em`, [user.id, nomeDoUsuario(user), requisicaoId, user.id]);
}

/**
 * Segunda conferência da separação (Etapa 28, Task 2). Conferir é ato com dono (RN-05): exige
 * `user.id` — a régua da RN-01, sem `|| null` silencioso. A checagem "quem separou não confere"
 * (RN-03) aparece DUAS vezes de propósito: aqui em JS, pela MENSAGEM (diz ao operador qual rodada
 * ele registrou), e dentro do WHERE de `claimConferencia`, pela GARANTIA. Se a checagem JS sair,
 * o WHERE ainda segura — só a mensagem piora (403 com rodada vira 409 genérico).
 */
async function conferirSeparacao(db, requisicaoId, user) {
  if (!user?.id) {
    const err = new Error('Conferência exige usuário identificado');
    err.status = 400;
    throw err;
  }

  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (reqRow.status !== 'EM_SEPARACAO') {
    const err = new Error(`Só é possível conferir uma requisição em separação (status atual: ${reqRow.status})`);
    err.status = 400;
    throw err;
  }

  const separados = await dbGet(db,
    'SELECT COUNT(*) AS n FROM itens_requisicao_almoxarifado WHERE requisicao_id = ? AND quantidade_separada > 0',
    [requisicaoId]);
  if (!separados || Number(separados.n) === 0) {
    const err = new Error('Nenhum item separado');
    err.status = 400;
    throw err;
  }

  // RN-03, pela mensagem: QUALQUER rodada do usuário, não só a última (a separação acumula, e
  // comparar só com o último separador deixaria quem separou primeiro conferir a própria caixa).
  const rodada = await dbGet(db,
    'SELECT id FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ? AND usuario_id = ? ORDER BY id ASC LIMIT 1',
    [requisicaoId, user.id]);
  if (rodada) {
    const err = new Error(`Quem separou não confere: você registrou a rodada de separação #${rodada.id} desta requisição. `
      + 'A segunda conferência tem de ser de outra pessoa.');
    err.status = 403;
    throw err;
  }

  const claim = await claimConferencia(db, requisicaoId, user);
  if (!claim) {
    const err = new Error('Esta requisição não pode ser conferida agora: já foi conferida, saiu de EM_SEPARACAO, '
      + 'ou você separou uma rodada dela — outra pessoa (ou outra aba sua) agiu enquanto esta tela estava aberta. '
      + 'Recarregue e confira o estado atual.');
    err.status = 409;
    throw err;
  }

  // RN-08: rastro pós-escrita, best-effort (Etapa 19: falha de log não desfaz o ato).
  try {
    await registrarAuditoria(db, {
      entidade: 'requisicao',
      entidade_id: Number(requisicaoId),
      acao: 'CONFERENCIA_SEPARACAO',
      usuario_id: user.id,
      usuario_nome: nomeDoUsuario(user),
      dados_novos: { conferido_por_id: user.id, conferido_por_nome: nomeDoUsuario(user) },
    });
  } catch (e) {
    console.warn(`[almoxarifado-conferencia] Falha ao auditar a conferência da requisição ${requisicaoId}: ${e.message}`);
  }

  return {
    success: true,
    conferencia: { usuario_id: user.id, usuario_nome: nomeDoUsuario(user), em: claim.conferido_em },
  };
}

/** Etapa 63 (RN-03): as substituicoes da origem separada, com os codigos, para o detalhe. */
/**
 * Etapa 64 — a fila de separação do almoxarife. SÓ LEITURA: não muda regra de separar/entregar, e de
 * propósito NÃO chama `verificarBloqueioLiberacao` (ela ESCREVE: muda status e notifica). Uma consulta
 * de requisições + UMA de itens (sem N+1) + uma de separadores.
 *
 * `etapas` (Fase 2: uma etapa só escondia as outras):
 *  - SEPARAR           — em PODE_SEPARAR e algum item SEPARÁVEL AGORA (maxSeparar > 0; o pendente
 *                        sozinho punha no topo requisição aguardando compra que o separar recusa);
 *  - AGUARDANDO_SALDO  — algum item com pendente e nada separável (falta estoque);
 *  - CONFERIR          — material crítico separado sem conferência, em EM_SEPARACAO (o claim só confere ali);
 *  - REABRIR_SEPARACAO — o mesmo fora de EM_SEPARACAO (a conferência e a entrega recusam; separar de novo reabre);
 *  - ENTREGAR          — em PODE_ENTREGAR, algo separado e não entregue, sem conferência pendente;
 *  - APROVACAO_VALOR   — no lugar de SEPARAR/ENTREGAR quando a requisição precisa de aprovação de valor e não
 *                        tem (pelo que está GRAVADO — a avaliação ao vivo continua sendo a do separar/entregar).
 */
async function listarFilaSeparacao(db, user) {
  const statusFila = [...new Set([...PODE_SEPARAR, ...PODE_ENTREGAR])];
  const reqs = await dbAll(db, `SELECT r.id, r.numero, r.status, r.urgencia, r.data_necessidade, r.solicitante_nome,
      r.setor, r.created_at, r.conferido_por_id, r.requer_aprovacao_valor, r.data_aprovacao_valor
    FROM requisicoes_almoxarifado r
    WHERE COALESCE(r.ativo, 1) = 1 AND r.status IN (${statusFila.map(() => '?').join(',')})`, statusFila);
  if (!reqs.length) return [];
  const ids = reqs.map((r) => r.id);
  const marcas = ids.map(() => '?').join(',');
  const itens = await dbAll(db, `SELECT ir.*, ma.codigo as material_codigo, ma.nome as material_nome, ma.unidade,
      ma.material_critico,
      (${disponivelSql('ma')} + ${RESERVADO_PARA_ITEM_SQL}) as saldo_disponivel,
      lsep.codigo as origem_separacao_codigo, ltsep.codigo as lote_separacao_codigo
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ir.material_id = ma.id
    LEFT JOIN localizacoes_almoxarifado lsep ON lsep.id = ir.origem_separacao_id
    LEFT JOIN lotes_almoxarifado ltsep ON ltsep.id = ir.lote_separacao_id
    WHERE ir.requisicao_id IN (${marcas})`, ids);
  const separadores = await dbAll(db, `SELECT requisicao_id, usuario_id, MAX(usuario_nome) as usuario_nome
    FROM separacoes_requisicao_almoxarifado WHERE requisicao_id IN (${marcas})
    GROUP BY requisicao_id, usuario_id`, ids);
  const podeConferirPerfil = can(user, 'conferir_separacao');
  const fila = [];
  for (const r of reqs) {
    const doReq = itens.filter((i) => i.requisicao_id === r.id);
    const podeSep = PODE_SEPARAR.includes(r.status);
    // Fase 5: avaliacao de valor AO VIVO pela parte SO-LEITURA (avaliarRequisicaoValor) — o gravado nunca
    // coincide com um status separavel (quem grava o flag muda o status junto), e o risco real era o
    // limite baixar ou o custo subir depois: a fila dizia Separar e o separar recusava com 403.
    // eslint-disable-next-line no-await-in-loop
    const avaliacaoValor = r.data_aprovacao_valor ? null : await valueApprovalService.avaliarRequisicaoValor(db, r.id);
    const bloqueioValor = !!(avaliacaoValor && avaliacaoValor.requer_aprovacao_valor);
    const linhas = doReq.map((i) => {
      const aSeparar = pendenteSeparacao(i);
      const separavel = podeSep ? maxSeparar(i, num(i.saldo_disponivel)) : 0;
      return {
        item_id: i.id, material_id: i.material_id, material_codigo: i.material_codigo, material_nome: i.material_nome,
        unidade: i.unidade, a_separar: aSeparar, separavel, a_entregar: Math.max(0, getSeparado(i) - getEntregue(i)),
        // Fase 5 (critico): a separacao NAO reserva — o separado de A pode ter saido por B. Entregavel agora
        // e o separado limitado ao disponivel; sem isso a fila dizia "Entregar" e a entrega recusava.
        entregavel: Math.min(Math.max(0, getSeparado(i) - getEntregue(i)), Math.max(0, num(i.saldo_disponivel))),
        disponivel: num(i.saldo_disponivel), origem_separacao_codigo: i.origem_separacao_codigo || null,
        lote_separacao_codigo: i.lote_separacao_codigo || null, material_critico: Number(i.material_critico) === 1,
      };
    });
    const etapas = [];
    if (podeSep && linhas.some((l) => l.separavel > 1e-9)) etapas.push(bloqueioValor ? 'APROVACAO_VALOR' : 'SEPARAR');
    if (podeSep && linhas.some((l) => l.a_separar > 1e-9 && l.separavel <= 1e-9)) etapas.push('AGUARDANDO_SALDO');
    const conferenciaPendente = conferenciaObrigatoria(doReq) && !r.conferido_por_id;
    // Fase 5 (critico): REABRIR so onde separar de novo e possivel (PODE_SEPARAR); em PRONTA_PARA_RETIRADA nao
    // ha transicao de volta — CONFERENCIA_SEM_SAIDA, nao acionavel (o administrador resolve).
    if (conferenciaPendente) {
      etapas.push(r.status === 'EM_SEPARACAO' ? 'CONFERIR'
        : PODE_SEPARAR.includes(r.status) ? 'REABRIR_SEPARACAO' : 'CONFERENCIA_SEM_SAIDA');
    }
    if (PODE_ENTREGAR.includes(r.status) && linhas.some((l) => l.a_entregar > 1e-9) && !conferenciaPendente) {
      if (linhas.some((l) => l.entregavel > 1e-9)) {
        if (!etapas.includes('APROVACAO_VALOR')) etapas.push(bloqueioValor ? 'APROVACAO_VALOR' : 'ENTREGAR');
      } else if (!etapas.includes('AGUARDANDO_SALDO')) {
        etapas.push('AGUARDANDO_SALDO');
      }
    }
    if (!etapas.length) continue;
    const quemSeparou = separadores.filter((s) => s.requisicao_id === r.id)
      .map((s) => ({ id: s.usuario_id, nome: s.usuario_nome }));
    fila.push({
      id: r.id, numero: r.numero, status: r.status, urgencia: r.urgencia, data_necessidade: r.data_necessidade || null,
      solicitante_nome: r.solicitante_nome, setor: r.setor, created_at: r.created_at,
      etapas, acionavel: etapas.some((e) => ['SEPARAR', 'CONFERIR', 'REABRIR_SEPARACAO', 'ENTREGAR'].includes(e)),
      conferencia_pendente: conferenciaPendente, separadores: quemSeparou,
      posso_conferir: conferenciaPendente && r.status === 'EM_SEPARACAO' && podeConferirPerfil
        && !quemSeparou.some((s) => Number(s.id) === Number(user?.id)),
      itens: linhas.filter((l) => l.a_separar > 1e-9 || l.a_entregar > 1e-9),
    });
  }
  // Ordem (RN-02): o que dá para fazer agora primeiro; depois a prioridade (compararPrioridade).
  fila.sort((a, b) => (Number(b.acionavel) - Number(a.acionavel)) || compararPrioridade(a, b));
  return fila;
}

/**
 * Etapa 74 (T0, D3/B369) — QUEM É PRIMEIRO, uma função só. Extraída da ordem da fila de separação da 64
 * (que continua igual: a fila soma o "acionável" na frente) e usada também pela reserva na chegada
 * (reservaChegadaService): a fila e a reserva não podem discordar sobre quem leva o material.
 * Urgência (UPPER — há legado em minúsculo: CRITICO 1, URGENTE 2, o resto 3) → data de necessidade
 * (sem data por último) → a mais ANTIGA primeiro (FIFO) → id.
 * `a`/`b`: { urgencia, data_necessidade, created_at, id }.
 */
const RANK_URGENCIA = { CRITICO: 1, URGENTE: 2 };
function compararPrioridade(a, b) {
  const rank = (x) => RANK_URGENCIA[String(x.urgencia || '').toUpperCase()] || 3;
  const dataNec = (x) => (x.data_necessidade ? String(x.data_necessidade) : null);
  return (rank(a) - rank(b))
    || ((dataNec(a) === null) - (dataNec(b) === null))
    || String(dataNec(a) || '').localeCompare(String(dataNec(b) || ''))
    || String(a.created_at || '').localeCompare(String(b.created_at || ''))
    || (a.id - b.id);
}

async function listarSubstituicoes(db, requisicaoId) {
  return dbAll(db, `SELECT s.id, s.item_id, s.material_id, m.codigo as material_codigo, s.quantidade,
      lp.codigo as planejada_codigo, ltp.codigo as planejada_lote, ls.codigo as saiu_codigo, lts.codigo as saiu_lote,
      s.automatica, s.motivo, s.usuario_nome, s.created_at as em, COALESCE(s.momento, 'ENTREGA') as momento
    FROM substituicoes_origem_requisicao s
    JOIN materiais_almoxarifado m ON m.id = s.material_id
    LEFT JOIN localizacoes_almoxarifado lp ON lp.id = s.localizacao_planejada_id
    LEFT JOIN lotes_almoxarifado ltp ON ltp.id = s.lote_planejado_id
    LEFT JOIN localizacoes_almoxarifado ls ON ls.id = s.localizacao_saida_id
    LEFT JOIN lotes_almoxarifado lts ON lts.id = s.lote_saida_id
    WHERE s.requisicao_id = ? ORDER BY s.id`, [requisicaoId]);
}

/** Rodadas de separação de uma requisição, em ordem (Etapa 28, RN-02/RN-09). */
async function listarSeparacoes(db, requisicaoId) {
  const rows = await dbAll(db, `SELECT id, usuario_id, usuario_nome, itens_tocados, itens_json, created_at
    FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?
    ORDER BY created_at ASC, id ASC`, [requisicaoId]);
  return rows.map((r) => {
    let itens = [];
    try { itens = r.itens_json ? JSON.parse(r.itens_json) : []; } catch (e) { itens = []; }
    return {
      id: r.id,
      usuario_id: r.usuario_id,
      usuario_nome: r.usuario_nome,
      itens_tocados: r.itens_tocados,
      itens,
      created_at: r.created_at,
    };
  });
}

/**
 * Etapa 28 (Task 1): a separação passa a ter DONO. `user` é obrigatório (RN-01): sem `user.id`
 * a operação não acontece — não é um `|| null` silencioso, porque a rodada é a base da barreira
 * "quem separou não confere" (RN-03), e rodada sem dono é barreira furada.
 *
 * A separação ACUMULA (soma sobre quantidade_separada), então cada chamada com ≥1 item efetivo
 * vira UMA linha append-only em `separacoes_requisicao_almoxarifado` (RN-02). Rodada sem item
 * efetivo (`[]`, quantidades 0, item inexistente) não gera linha — mas o UPDATE de status para
 * EM_SEPARACAO continua INCONDICIONAL, como sempre foi: "Iniciar Separação" com quantidades
 * zeradas é caminho real da tela.
 *
 * Rodada com item efetivo LIMPA a segunda conferência (RN-07, D3): a conferência atesta o
 * conteúdo de uma caixa; se a caixa mudou, precisa ser atestada de novo. A conferência apagada
 * vai para `dados_anteriores` da auditoria. A limpeza é um COMPARE-AND-CLEAR (fix-round 1, F4):
 * relê `conferido_por_id` e só limpa se a linha ainda for a relida; se alguém conferiu no meio,
 * relê e repete (máx. 3). Antes era "releitura imediatamente antes do UPDATE", que só encolhia a
 * janela — a conferência que entrasse nela era apagada com `dados_anteriores: null`.
 *
 * Tudo ou nada (fix-round 1, F1): TODAS as entradas são validadas antes da primeira escrita. O
 * laço antigo gravava item a item e lançava 400 no meio, deixando `quantidade_separada` alterada
 * sem rodada — sem dono, sem trilha, e sem limpar a conferência de uma caixa que mudou.
 */
/**
 * Etapa 58/59 — a regra ÚNICA de "este item pode sair desta origem/lote nesta quantidade", usada
 * pela entrega e pela separação. Lança com a mensagem SEM o prefixo do material (quem chama prefixa).
 * `pedidoPorOrigem` acumula o que a mesma chamada já pediu do mesmo material/origem/lote.
 */
async function checarOrigemItem(db, item, { origemId, loteId, lidoNorm }, qty, pedidoPorOrigem) {
  if (lidoNorm && !origemId) {
    throw Object.assign(new Error('Para confirmar a origem pela leitura, informe a localização de origem'), { status: 400 });
  }
  let codigoOrigem = null;
  if (origemId) {
    const loc = await stockService.validarEnderecoExplicito(db, origemId, 'origem');
    await stockService.validarLocalizacaoParaMovimento(db, origemId, { tipo_material: item.tipo_material }, 'origem');
    codigoOrigem = loc.codigo;
    if (lidoNorm) await stockService.conferirLeitura(db, lidoNorm, origemId, 'origem');
  }
  let loteCodigo = null;
  if (loteId) {
    const lote = await dbGet(db, 'SELECT * FROM lotes_almoxarifado WHERE id = ?', [loteId]);
    if (!lote || Number(lote.material_id) !== Number(item.material_id)) {
      throw Object.assign(new Error('Lote não pertence a este material'), { status: 400 });
    }
    // Etapa 58 (Fase 5): status e vencimento com as literais do motor.
    if (lote.status !== 'ATIVO') {
      throw Object.assign(new Error(`Lote ${lote.codigo} esta ${String(lote.status).toLowerCase()} e nao pode ser utilizado`), { status: 400 });
    }
    if (lotService.isVencido(lote) && !lotService.vencimentoLiberado(lote)) {
      throw Object.assign(new Error(`Lote ${lote.codigo} vencido em ${lote.data_validade} nao pode sair para consumo. `
        + 'Libere o vencimento do lote (PUT /api/almoxarifado/lotes/:id/liberar-vencimento) com justificativa, '
        + 'ou baixe por SUCATA/PERDA ou corrija por AJUSTE.'), { status: 400 });
    }
    loteCodigo = lote.codigo;
  }
  const onde = origemId ? 'AND localizacao_id = ?' : '';
  const s = await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado
    WHERE material_id = ? AND lote_id IS ? ${onde}`, [item.material_id, loteId, ...(origemId ? [origemId] : [])]);
  // Dois itens do MESMO material saindo do mesmo endereço/lote somam (Etapa 58, Fase 5).
  const chave = `${item.material_id}|${origemId}|${loteId}`;
  const jaPedido = pedidoPorOrigem.get(chave) || 0;
  pedidoPorOrigem.set(chave, jaPedido + qty);
  const saldo = (Number(s.q) || 0) - jaPedido;
  if (saldo + 1e-9 < qty) {
    throw Object.assign(new Error(origemId
      ? `O saldo em ${codigoOrigem} (${Math.round(saldo * 1e6) / 1e6}) não cobre a quantidade (${qty}) — a saída tiraria de outros endereços`
      : `Saldo insuficiente no lote ${loteCodigo}. Disponível: ${Math.round(saldo * 1e6) / 1e6} ${item.unidade || ''}`.trim()),
    { status: 400 });
  }
  return codigoOrigem;
}

/** Etapa 92 (T0): o 400 da separacao fora de PODE_SEPARAR — na leitura e na reivindicacao (S1). */
const MSG_STATUS_SEPARAR = 'Requisição deve estar aprovada, aguardando estoque/compra, em separação ou parcialmente atendida para separar';

async function separarRequisicao(db, requisicaoId, itensSeparados = [], user) {
  if (!user?.id) {
    const err = new Error('Separação exige usuário identificado');
    err.status = 400;
    throw err;
  }

  // Etapa 92 (Fase 5): a ultima rodada da requisicao, lida ANTES do status (`reqRow`) e da reivindicacao.
  // O desfazer da RN-09 so devolve o status lido se nenhuma rodada entrou depois desta — uma separacao
  // concorrente que reivindicou (EM_SEPARACAO esta em PODE_SEPARAR) e gravou a sua rodada venceu, e
  // devolver o status lido apagaria o EM_SEPARACAO dela: a requisicao voltava a ser cancelavel com
  // material na caixa (revisao da Fase 4, reproduzido). Lida antes do `reqRow`, nao so antes da
  // reivindicacao: rodada gravada entre as duas leituras ficaria abaixo da marca, com o `reqRow` velho.
  const ultimaRodadaAntes = Number((await dbGet(db,
    'SELECT COALESCE(MAX(id), 0) AS m FROM separacoes_requisicao_almoxarifado WHERE requisicao_id = ?',
    [requisicaoId])).m) || 0;
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (!PODE_SEPARAR.includes(reqRow.status)) {
    const err = new Error(MSG_STATUS_SEPARAR);
    err.status = 400;
    throw err;
  }

  await valueApprovalService.verificarBloqueioLiberacao(db, requisicaoId);

  const itens = await carregarItensRequisicao(db, requisicaoId);

  // PASSADA 1 — validar TODAS as entradas antes de escrever qualquer coisa (fix-round 1, F1).
  // Antes, o laço gravava item a item e lançava 400 no meio: o item válido ficava gravado SEM
  // rodada — `quantidade_separada` mudava por um caminho que não deixava dono, e a barreira
  // "quem separou não confere" (RN-03) ficava apoiada numa rodada que nunca foi gravada. A
  // separação é tudo ou nada: ou todas as entradas cabem, ou nenhuma é gravada.
  const validados = []; // [{ item, qty, novaSeparada }] — só item existente com qty > 0
  const pedidoSeparacao = new Map();
  const reguaDivergencia = new Map(); // Etapa 60: item.id -> { maxInicial, origens, saldoOrigem, total, motivo }
  // Etapa 59 (Fase 5): o separado ainda nao entregue de TODOS os itens com origem planejada continua
  // fisicamente la — entra no acumulado desde o inicio. Antes so o do proprio item contava (mesmoPar):
  // dois itens do mesmo material no mesmo par passavam a separacao e a entrega de um clique recusava
  // um deles; e a mesma entrada duas vezes no payload contava o pendente em dobro.
  // Etapa 65 (Fase 2, critico): o RETRATO da planejada antes da rodada — o `item` e mutado em memoria no
  // laco abaixo, e o pendente "antes" lido dali gravava troca falsa no "A e depois B" sem planejada.
  const planejadaAntes = new Map(); // item.id -> { origemId, loteId, pend }
  for (const it of itens) {
    const pend = Math.max(0, getSeparado(it) - getEntregue(it));
    if (it.origem_separacao_id && pend > 1e-9) {
      planejadaAntes.set(it.id, {
        origemId: Number(it.origem_separacao_id), loteId: it.lote_separacao_id ? Number(it.lote_separacao_id) : null, pend,
      });
    }
    if (it.origem_separacao_id && pend > 1e-9) {
      const k = `${it.material_id}|${Number(it.origem_separacao_id)}|${it.lote_separacao_id ? Number(it.lote_separacao_id) : null}`;
      pedidoSeparacao.set(k, (pedidoSeparacao.get(k) || 0) + pend);
    }
  }
  for (const entrada of itensSeparados) {
    const item = itens.find((i) => Number(i.id) === Number(entrada.item_id));
    if (!item) continue;

    const qty = num(entrada.quantidade_separada);
    if (qty <= 0) continue;

    // Disponível + o hold da PRÓPRIA requisição (Etapa 4): a reserva criada na aprovação sai do
    // disponível geral, então sem somá-la de volta a requisição não conseguiria separar o
    // material que já está separado para ela.
    // eslint-disable-next-line no-await-in-loop
    const { disponivel: estoque } = await saldoDisponivelParaItem(db, item);
    const max = maxSeparar(item, estoque);
    // Etapa 60 (RN-01): a regua da divergencia e o maximo separavel NA HORA, do item AGREGADO (o mesmo
    // item duas vezes no payload nao vira duas reguas) — guardado no 1o encontro, antes da mutacao.
    if (!reguaDivergencia.has(item.id)) {
      reguaDivergencia.set(item.id, {
        maxInicial: max, pend: pendenteSeparacao(item), estoque: num(estoque), material_id: item.material_id,
        origens: new Set(), saldoOrigem: null, total: 0, motivo: null, motivoTroca: null,
      });
    }

    if (qty > max) {
      const err = new Error(
        `${item.material_nome}: não é possível separar ${qty} ${item.unidade || ''}. `
        + `Máximo: ${max} (pendente: ${pendenteSeparacao(item)}, disponível: ${estoque})`
      );
      err.status = 400;
      throw err;
    }

    // Só em memória: o mesmo item duas vezes no payload é validado contra o acumulado, como antes.
    // Etapa 59 (RN-01/02): a origem de onde o separador tirou. O saldo nela tem de cobrir esta rodada
    // somada ao separado pendente de quem ja planejou o mesmo par (semeado no acumulado acima).
    const origemId = entrada.localizacao_origem_id ? Number(entrada.localizacao_origem_id) : null;
    const loteId = entrada.lote_id ? Number(entrada.lote_id) : null;
    const pendenteAntes = Math.max(0, getSeparado(item) - getEntregue(item));
    // Etapa 65 (Fase 5): o par exato. A Fase 2 tinha alinhado "planejada sem lote vale qualquer lote"
    // com a entrega, mas so a COMPARACAO da troca da entrega pensa assim — o saldo da origem e o motor
    // leem (A, sem lote) como "o saldo sem lote em A", e a entrega de um clique de (A, —) + (A, L1)
    // passou a ser recusada. Volta o par exato: (A, —) -> (A, L1) apaga a planejada e registra a troca.
    const mesmoPar = Number(item.origem_separacao_id || 0) === Number(origemId || 0)
      && Number(item.lote_separacao_id || 0) === Number(loteId || 0);
    // Etapa 60 (RN-01/02): acumula a rodada do item para a regua. Com UMA origem na rodada, o separavel
    // e tambem limitado ao saldo nela menos o ja comprometido (Fase 2: "Sai de" e uma origem por
    // rodada — 4 em A e 6 em B nao e divergencia na rodada de A).
    const regua = reguaDivergencia.get(item.id);
    regua.origens.add(`${origemId}|${loteId}`);
    regua.total += qty;
    if (!regua.motivo && typeof entrada.motivo_divergencia === 'string' && entrada.motivo_divergencia.trim()) {
      regua.motivo = entrada.motivo_divergencia.trim().slice(0, 500);
    }
    if ((origemId || loteId) && regua.saldoOrigem === null) {
      // Fase 5: tambem lote sem endereco (o saldo do lote limita), e o separado ainda nao entregue de
      // OUTRAS requisicoes no mesmo par — senao quem separa tudo o que esta livre sai "divergente".
      const onde = origemId ? 'AND localizacao_id = ?' : '';
      // eslint-disable-next-line no-await-in-loop
      const so = await dbGet(db, `SELECT COALESCE(SUM(quantidade), 0) as q FROM estoque_saldo_almoxarifado
        WHERE material_id = ? AND lote_id IS ? ${onde}`, [item.material_id, loteId, ...(origemId ? [origemId] : [])]);
      // eslint-disable-next-line no-await-in-loop
      const outras = origemId ? await dbGet(db, `SELECT COALESCE(SUM(MAX(COALESCE(ir.quantidade_separada,0) - COALESCE(ir.quantidade_entregue,0), 0)), 0) as q
        FROM itens_requisicao_almoxarifado ir JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
        WHERE ir.material_id = ? AND ir.origem_separacao_id = ? AND ir.lote_separacao_id IS ?
          AND ir.requisicao_id <> ? AND COALESCE(r.ativo, 1) = 1`, [item.material_id, origemId, loteId, requisicaoId]) : { q: 0 };
      regua.saldoOrigem = (Number(so.q) || 0) - (Number(outras.q) || 0)
        - (pedidoSeparacao.get(`${item.material_id}|${origemId}|${loteId}`) || 0);
    }
    if (origemId || loteId) {
      try {
        // eslint-disable-next-line no-await-in-loop
        await checarOrigemItem(db, item, { origemId, loteId, lidoNorm: null }, qty, pedidoSeparacao);
      } catch (e) {
        const err = new Error(`${item.material_nome}: ${e.message}`);
        err.status = e.status || 400;
        throw err;
      }
    }
    // Rodada com origem diferente (ou sem origem) sobre separado pendente de outra: mista -> nula.
    const planejada = pendenteAntes > 1e-9 && !mesmoPar ? { origemId: null, loteId: null }
      // Fase 5: lote sem endereco nao vira planejada (a entrega exige o endereco, e ficaria preso).
      : { origemId: origemId || null, loteId: origemId ? loteId : null };
    // Etapa 65 (RN-01): o motivo da troca — o primeiro nao vazio do item na rodada (so texto; <= 500).
    if (!regua.motivoTroca && typeof entrada.motivo_substituicao === 'string' && entrada.motivo_substituicao.trim()) {
      regua.motivoTroca = entrada.motivo_substituicao.trim().slice(0, 500);
    }
    item.origem_separacao_id = planejada.origemId;
    item.lote_separacao_id = planejada.loteId;
    const novaSeparada = getSeparado(item) + qty;
    item.quantidade_separada = novaSeparada;
    validados.push({ item, qty, novaSeparada, origemId, loteId, planejada });
  }

  // PASSADA 2 — gravar. Daqui em diante nenhuma entrada pode falhar por regra de negócio.
  // Etapa 60 (RN-01/02): so REGISTRO — a divergencia nao recusa (Fase 2: o parcial legitimo, em varias
  // viagens ou por origem, e da spec 05). O motivo e opcional; a tela pede quando fica abaixo.
  const divergenciaPorItem = new Map();
  // Fase 5: dois itens do MESMO material dividem o disponivel na rodada — o que um separa sai do
  // separavel do outro (10 livres, 6 + 4: nenhum dos dois e divergente).
  const totalPorMaterial = new Map();
  for (const r of reguaDivergencia.values()) {
    totalPorMaterial.set(r.material_id, (totalPorMaterial.get(r.material_id) || 0) + r.total);
  }
  for (const [itemId, r] of reguaDivergencia) {
    const outros = totalPorMaterial.get(r.material_id) - r.total;
    const base = Math.min(r.pend, Math.max(0, r.estoque - outros));
    const umaChave = r.origens.size === 1 && r.saldoOrigem !== null;
    const maximo = umaChave ? Math.min(base, Math.max(0, r.saldoOrigem)) : base;
    const divergente = r.total < maximo - 1e-9;
    divergenciaPorItem.set(itemId, {
      // Fase 5: o motivo nunca e descartado — a regua da tela pode diferir da do servidor, e o texto
      // de quem separou vale mesmo quando o servidor nao ve divergencia.
      maximo: Math.round(maximo * 1e6) / 1e6, divergente, motivo_divergencia: r.motivo,
    });
  }

  // Etapa 92 (T0, B436): a separacao REIVINDICA a requisicao antes de gravar qualquer coisa. Antes, o
  // status so era gravado no fim, com `WHERE id=?` sem guarda: um cancelamento que entrasse entre a
  // leitura e esse UPDATE respondia 200 e a separacao passava por cima — a requisicao "ressuscitava"
  // em EM_SEPARACAO com a reserva ja solta (sonda da Fase 0: 50/50 e 10/10). Guardar so o UPDATE do fim
  // nao basta: a rodada (append-only) ja estaria gravada numa cancelada. Perdeu -> o 400 de sempre (S1).
  // (Fase 5: `ultimaRodadaAntes`, lida no topo, e a marca do desfazer da RN-09 — ver o catch abaixo.)
  const claim = await dbRun(db, `UPDATE requisicoes_almoxarifado
      SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
    WHERE id=? AND status IN (${PODE_SEPARAR.map(() => '?').join(',')})`, [requisicaoId, ...PODE_SEPARAR]);
  if (!claim.changes) {
    console.info(`[almoxarifado-separacao] Requisicao ${requisicaoId} saiu de ${reqRow.status} antes da separacao gravar — recusada`);
    const err = new Error(MSG_STATUS_SEPARAR);
    err.status = 400;
    throw err;
  }

  const tocados = []; // [{ item_id, material_id, quantidade }]
  let rodadaId = null;
  let conferenciaAnterior = null;
  // Etapa 92 (Fase 2, RN-09): gravacao que falha depois da reivindicacao, SEM rodada inserida, devolve o
  // status lido — senao a requisicao ficava presa em EM_SEPARACAO e quem pediu perdia o Cancelar (e, de
  // PARCIALMENTE_ATENDIDA, o Encerrar). Com a rodada gravada nao devolve: EM_SEPARACAO e o estado certo.
  try {
    for (const { item, qty, novaSeparada, origemId, loteId, planejada } of validados) {
      await dbRun(db, `UPDATE itens_requisicao_almoxarifado SET quantidade_separada = ?,
          origem_separacao_id = ?, lote_separacao_id = ? WHERE id = ?`,
      [novaSeparada, planejada.origemId, planejada.loteId, item.id]);
      tocados.push({
        item_id: item.id, material_id: item.material_id, quantidade: qty,
        ...(origemId ? { localizacao_origem_id: origemId } : {}), ...(loteId ? { lote_id: loteId } : {}),
        ...divergenciaPorItem.get(item.id),
      });
    }

    if (tocados.length > 0) {
      // RN-02: a rodada é append-only — nunca UPDATE/DELETE aqui.
      const ins = await dbRun(db, `INSERT INTO separacoes_requisicao_almoxarifado
        (requisicao_id, usuario_id, usuario_nome, itens_tocados, itens_json)
        VALUES (?, ?, ?, ?, ?)`,
        [requisicaoId, user.id, nomeDoUsuario(user), tocados.length, JSON.stringify(tocados)]);
      rodadaId = ins.lastID;

      // Etapa 65 (RN-01): a TROCA na separacao — item que antes da rodada tinha planejada com separado
      // pendente e termina a rodada sem ela. Detectada sobre o retrato e a regua (so entradas com
      // quantidade > 0), gravada DEPOIS da rodada (separacao_id); rodada recusada na passada 1 nao chega
      // aqui. Separacao nao move estoque: sem movimentacao_ids. Best-effort como a auditoria da rodada
      // (a rodada ja esta gravada; recusar agora deixaria o separado sem a resposta) — letra B.
      for (const [itemId, r] of reguaDivergencia) {
        const antes = planejadaAntes.get(itemId);
        const item = itens.find((i) => i.id === itemId);
        if (!antes || !item || item.origem_separacao_id) continue;
        const pares = [...r.origens].map((k) => k.split('|').map((x) => (x === 'null' ? null : Number(x))));
        const umPar = pares.length === 1 ? pares[0] : null;
        try {
          // eslint-disable-next-line no-await-in-loop
          await dbRun(db, `INSERT INTO substituicoes_origem_requisicao
            (requisicao_id, item_id, material_id, quantidade, localizacao_planejada_id, lote_planejado_id,
             localizacao_saida_id, lote_saida_id, automatica, movimentacao_ids, motivo, usuario_id, usuario_nome,
             momento, separacao_id)
            VALUES (?,?,?,?,?,?,?,?,?,NULL,?,?,?,'SEPARACAO',?)`,
          [requisicaoId, itemId, item.material_id, antes.pend, antes.origemId, antes.loteId,
            umPar ? umPar[0] : null, umPar ? umPar[1] : null, umPar && !umPar[0] && !umPar[1] ? 1 : 0,
            r.motivoTroca || null, user.id, nomeDoUsuario(user), rodadaId]);
        } catch (e) {
          console.warn(`[almoxarifado-separacao] Falha ao registrar a troca de origem do item ${itemId} na rodada ${rodadaId}: ${e.message}`);
        }
      }

      // RN-07 como COMPARE-AND-CLEAR (fix-round 1, F4). Reler a conferência e limpar só se a linha
      // ainda for a relida (`WHERE conferido_por_id IS ?`): se alguém conferiu entre a releitura e o
      // UPDATE, `changes` vem 0, relê-se e repete-se. Antes, a "releitura imediatamente antes do
      // UPDATE" era só uma janela menor — a conferência que entrasse nela era apagada com
      // `dados_anteriores: null`, e a mutação "usar o reqRow inicial" não derrubava teste nenhum.
      let limpou = false;
      for (let tentativa = 0; tentativa < 3 && !limpou; tentativa++) {
        // eslint-disable-next-line no-await-in-loop
        const conf = await dbGet(db,
          'SELECT conferido_por_id, conferido_por_nome, conferido_em FROM requisicoes_almoxarifado WHERE id = ?',
          [requisicaoId]);
        conferenciaAnterior = conf && conf.conferido_por_id != null
          ? { usuario_id: conf.conferido_por_id, usuario_nome: conf.conferido_por_nome, em: conf.conferido_em }
          : null;
        // eslint-disable-next-line no-await-in-loop
        const upd = await dbRun(db,
          `UPDATE requisicoes_almoxarifado
             SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL,
                 conferido_por_id=NULL, conferido_por_nome=NULL, conferido_em=NULL
           WHERE id=? AND conferido_por_id IS ?`,
          [requisicaoId, conferenciaAnterior ? conferenciaAnterior.usuario_id : null]);
        limpou = upd.changes > 0;
      }
      if (!limpou) {
        // Três corridas seguidas na MESMA linha: o estado seguro (limpa) prevalece sobre o rastro —
        // a última conferência a entrar fica fora de dados_anteriores, e isso fica avisado.
        console.warn(`[almoxarifado-separacao] Requisição ${requisicaoId}: a conferência mudou 3 vezes durante a rodada ${rodadaId}; limpando sem compare.`);
        await dbRun(db,
          `UPDATE requisicoes_almoxarifado
             SET status='EM_SEPARACAO', updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL,
                 conferido_por_id=NULL, conferido_por_nome=NULL, conferido_em=NULL
           WHERE id=?`,
          [requisicaoId]);
      }
    }
    // (Etapa 92: o `else` que gravava EM_SEPARACAO no "Iniciar Separacao" sem quantidade saiu — a
    // reivindicacao acima ja gravou o status e zerou o lembrete.)
  } catch (e) {
    if (rodadaId == null && reqRow.status !== 'EM_SEPARACAO') {
      try {
        // Fase 5: so devolve se ninguem gravou rodada depois da nossa reivindicacao (ver ultimaRodadaAntes).
        // A guarda nao devolveu -> nada de status e nada de W2 (W2 diz "status devolvido"); o erro sobe igual.
        const devolveu = await dbRun(db, `UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP
          WHERE id=? AND status='EM_SEPARACAO'
            AND NOT EXISTS (SELECT 1 FROM separacoes_requisicao_almoxarifado WHERE requisicao_id=? AND id > ?)`,
        [reqRow.status, requisicaoId, requisicaoId, ultimaRodadaAntes]);
        if (devolveu.changes > 0) console.warn(`[almoxarifado-separacao] Requisicao ${requisicaoId}: gravacao falhou depois da reivindicacao; status devolvido a ${reqRow.status}: ${e.message}`);
      } catch (eDesfazer) {
        console.error(`[almoxarifado-separacao] Requisicao ${requisicaoId}: falhou ao devolver o status ${reqRow.status} depois de ${e.message}: ${eDesfazer.message}`);
      }
    }
    throw e;
  }

  // RN-04: rastro pós-escrita, best-effort (decisão da Etapa 19: falha de log não desfaz o ato).
  // Só há linha quando houve rodada — "Iniciar Separação" sem quantidade não é evento da caixa.
  if (rodadaId != null) {
    try {
      await registrarAuditoria(db, {
        entidade: 'requisicao',
        entidade_id: Number(requisicaoId),
        acao: 'SEPARACAO',
        usuario_id: user.id,
        usuario_nome: nomeDoUsuario(user),
        dados_anteriores: conferenciaAnterior ? { conferencia: conferenciaAnterior } : undefined,
        dados_novos: {
          rodada_id: rodadaId,
          itens_tocados: tocados.length,
          itens: tocados.map((t) => ({
            item_id: t.item_id, quantidade: t.quantidade,
            maximo: t.maximo, divergente: t.divergente, motivo_divergencia: t.motivo_divergencia,
          })),
        },
      });
    } catch (e) {
      console.warn(`[almoxarifado-separacao] Falha ao auditar a rodada ${rodadaId} da requisição ${requisicaoId}: ${e.message}`);
    }
  }

  return {
    success: true, status: 'EM_SEPARACAO', rodada_id: rodadaId, itens_tocados: tocados.length,
  };
}

/**
 * `alertService` é aceito e ignorado (Etapa 3, Task 3): a baixa agora passa por
 * stockService.registrarMovimentacao, que já dispara a checagem de alerta internamente
 * (stockService.js, pós-INSERT da movimentação). Chamar de novo aqui duplicaria o disparo.
 * Mantido no parâmetro só para não quebrar as duas rotas que ainda o passam
 * (routes/almoxarifado.js, routes/requisicoesMaterial.js).
 */
async function entregarRequisicao(db, requisicaoId, itensAtendidos, user, alertService) { // eslint-disable-line no-unused-vars
  const reqRow = await dbGet(db, 'SELECT * FROM requisicoes_almoxarifado WHERE id = ?', [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }
  if (!PODE_ENTREGAR.includes(reqRow.status)) {
    const err = new Error('Requisição deve estar em separação, pronta para retirada ou parcialmente atendida');
    err.status = 400;
    throw err;
  }

  await valueApprovalService.verificarBloqueioLiberacao(db, requisicaoId);

  const itens = await carregarItensRequisicao(db, requisicaoId);

  // RN-06 (Etapa 28, achado 1 da Fase 2): a entrega sai DIRETO de EM_SEPARACAO, sem passar pela
  // liberação — então a barreira de material crítico tem de estar aqui também, depois da checagem
  // de PODE_ENTREGAR e ANTES de qualquer baixa. Vale nos três status de entrega: em
  // PARCIALMENTE_ATENDIDA a conferência da primeira rodada continua valendo (D3 só limpa com
  // rodada nova), e uma requisição antiga sem conferência volta a EM_SEPARACAO por "Iniciar
  // Separação" para alguém conferir.
  assertConferidaSeObrigatorio(reqRow, itens);

  // Fix-round 1 (F2): material CRÍTICO só sai até o que está na caixa (separado − entregue).
  // `maxEntregar` (Etapa 3) solta o teto do separado depois de uma entrega parcial — para
  // material comum é o comportamento desejado (reposição chegou, entrega direta, sem nova
  // rodada); para crítico era a barreira inteira furada: o que saía a mais nunca passou por
  // rodada nem por conferência. Validação de TODOS os itens ANTES de qualquer baixa, porque o
  // laço abaixo grava item a item. Material comum segue a Etapa 3 sem mudança.
  for (const item of itens) {
    if (Number(item.material_critico) !== 1) continue;
    const entrada = itensAtendidos?.find((ia) => Number(ia.item_id) === Number(item.id));
    const qty = entrada ? num(entrada.quantidade_atendida) : 0;
    if (qty <= 0) continue;
    const naCaixa = Math.max(0, getSeparado(item) - getEntregue(item));
    if (qty > naCaixa) {
      const err = new Error(`${item.material_nome}: material crítico só sai depois de separado e conferido — ${qty} excede `
        + `o separado ainda não entregue (${naCaixa}). Separe o restante e peça a segunda conferência.`);
      err.status = 400;
      throw err;
    }
  }

  // Etapa 58 (RN-01/02) + 59 (RN-03): origem, lote e leitura POR ITEM, validados ANTES de qualquer
  // baixa. Item sem origem no payload usa a origem PLANEJADA na separação — só até o separado ainda
  // não entregue (acima disso, o que sai nunca foi separado dali: automático) e nunca quando a tela
  // pede automático explicitamente (`origem_automatica: true` — a saída quando a planejada não serve
  // mais; Fase 2, crítico 1). Qualquer falha da PLANEJADA diz o que fazer.
  // Etapa 61 (RN-01): material com SERIE diz QUAIS series saem — antes de qualquer baixa. Sem isto a
  // entrega baixava o fisico e deixava as series EM_ESTOQUE (sonda: fisico 1, series presentes 3), e
  // a serie entregue podia sair de novo. A de um clique (sem series) cai aqui, com a saida na literal.
  const seriesPorItem = new Map(); // item.id -> { ids, loteSeries }
  const seriesUsadas = new Set();
  for (const item of itens) {
    const entrada = itensAtendidos?.find((ia) => Number(ia.item_id) === Number(item.id));
    const qty = entrada ? num(entrada.quantidade_atendida) : 0;
    if (qty <= 0) continue;
    const mat = await dbGet(db, 'SELECT controle_serie FROM materiais_almoxarifado WHERE id = ?', [item.material_id]);
    if (!mat || !Number(mat.controle_serie)) continue;
    const falha = (msg) => Object.assign(new Error(`${item.material_nome}: ${msg}`), { status: 400 });
    if (!Number.isInteger(qty)) throw falha('material com controle de serie exige quantidade inteira');
    const ids = Array.isArray(entrada.serie_ids)
      ? entrada.serie_ids.map(Number).filter((x) => Number.isInteger(x) && x > 0) : [];
    if (ids.length !== qty) {
      throw falha(`material com controle de serie: informe ${qty} serie(s) para ${qty} unidade(s) — recebidas ${ids.length}`
        + (ids.length === 0 ? ' — entregue escolhendo as series' : ''));
    }
    if (new Set(ids).size !== ids.length || ids.some((x) => seriesUsadas.has(x))) {
      throw falha('serie repetida na entrega');
    }
    const rows = await dbAll(db, `SELECT id, numero, material_id, status, lote_id FROM series_almoxarifado
      WHERE id IN (${ids.map(() => '?').join(',')})`, ids);
    for (const x of ids) {
      const s = rows.find((r) => r.id === x);
      if (!s || Number(s.material_id) !== Number(item.material_id) || s.status !== 'EM_ESTOQUE') {
        throw falha(`serie ${s ? s.numero : x} nao esta em estoque deste material`);
      }
    }
    // Fase 2: o lote vem das series (sem lote explicito, o claim aceitava series de qualquer lote e o
    // fisico drenava pelo ramo sem lote — o saldo por lote e o lote das series se separavam).
    const lotes = new Set(rows.map((r) => (r.lote_id ? Number(r.lote_id) : null)));
    if (lotes.size > 1) throw falha('escolha series de um lote so');
    ids.forEach((x) => seriesUsadas.add(x));
    seriesPorItem.set(item.id, { ids, loteSeries: [...lotes][0] || null });
  }

  const origemPorItem = new Map();
  const pedidoPorOrigem = new Map();
  const substituicoes = new Map(); // Etapa 63: item.id -> substituicao da origem separada
  for (const item of itens) {
    const entrada = itensAtendidos?.find((ia) => Number(ia.item_id) === Number(item.id));
    const qty = entrada ? num(entrada.quantidade_atendida) : 0;
    if (qty <= 0) continue;
    let origemId = entrada.localizacao_origem_id ? Number(entrada.localizacao_origem_id) : null;
    let loteId = entrada.lote_id ? Number(entrada.lote_id) : null;
    const lido = entrada.codigo_lido_origem;
    const semEscolha = !origemId && !loteId && (lido === undefined || lido === null || lido === '');
    let planejada = false;
    const pendenteSep = Math.max(0, getSeparado(item) - getEntregue(item));
    // Etapa 63 (Fase 2, critico): a planejada vale para o separado PENDENTE mesmo quando a entrega
    // passa dele — antes, acima do pendente TUDO saia automatico, inclusive o que estava na caixa
    // tirado de A (o livro dizia "saiu de B"). A baixa se divide: o pendente sai da planejada, o
    // excedente (nunca separado) automatico.
    let qtdComOrigem = qty;
    if (semEscolha && entrada.origem_automatica !== true && item.origem_separacao_id && pendenteSep > 1e-9) {
      origemId = Number(item.origem_separacao_id);
      loteId = item.lote_separacao_id ? Number(item.lote_separacao_id) : null;
      planejada = true;
      qtdComOrigem = Math.min(qty, pendenteSep);
    }
    // Etapa 61: o lote das series escolhidas vale como lote da saida (e tem de bater com o escolhido).
    const infoSeries = seriesPorItem.get(item.id);
    const loteSeries = infoSeries?.loteSeries || null;
    // Fase 5: tambem series SEM lote com lote escolhido (antes a checagem nem rodava e a recusa vinha
    // do claim do motor, generica); e, quando o lote e o da origem PLANEJADA, a mensagem diz isso.
    if (infoSeries && loteId && loteSeries !== loteId) {
      const err = new Error(planejada
        ? `${item.material_nome}: a origem da separação não serve mais (as series escolhidas nao sao do lote dela) — entregue escolhendo de onde sai`
        : `${item.material_nome}: as series escolhidas nao sao do lote escolhido`);
      err.status = 400;
      throw err;
    }
    if (loteSeries) loteId = loteSeries;
    // Etapa 63 (RN-01): SUBSTITUICAO — o item tinha separado pendente com origem planejada e a entrega
    // nao sai dela (origem no payload que difere, ou automatico pedido). Planejada sem lote = qualquer
    // lote: so o endereco conta. Comparado DEPOIS do lote derivado das series. So registro (aditivo).
    if (item.origem_separacao_id && pendenteSep > 1e-9 && !planejada) {
      const planOrigem = Number(item.origem_separacao_id);
      const planLote = item.lote_separacao_id ? Number(item.lote_separacao_id) : null;
      const automatica = entrada.origem_automatica === true && !origemId;
      const outroPar = automatica || Number(origemId || 0) !== planOrigem || (planLote !== null && Number(loteId || 0) !== planLote);
      if (outroPar) {
        const mot = typeof entrada.motivo_substituicao === 'string' ? entrada.motivo_substituicao.trim().slice(0, 500) : '';
        substituicoes.set(item.id, {
          planOrigem, planLote, saiuOrigem: origemId || null, saiuLote: loteId || null, automatica,
          quantidade: Math.min(qty, pendenteSep), motivo: mot || null,
        });
      }
    }
    if (!origemId && !loteId && semEscolha && !loteSeries) continue;
    try {
      const lidoNorm = stockService.normalizarCodigoLido(lido);
      await checarOrigemItem(db, item, { origemId, loteId, lidoNorm }, qtdComOrigem, pedidoPorOrigem);
      origemPorItem.set(item.id, { origemId, loteId, lido: lidoNorm, qtdComOrigem });
    } catch (e) {
      let msg = `${item.material_nome}: ${e.message}`;
      if (planejada) {
        const loc = await dbGet(db, 'SELECT codigo FROM localizacoes_almoxarifado WHERE id = ?', [origemId]);
        msg = `${item.material_nome}: a origem da separação (${loc ? loc.codigo : origemId}) não serve mais (${e.message}) — entregue escolhendo de onde sai`;
      }
      const err = new Error(msg);
      err.status = e.status || 400;
      throw err;
    }
  }

  const entregas = [];

  for (const item of itens) {
    const entrada = itensAtendidos?.find((ia) => Number(ia.item_id) === Number(item.id));
    const qtyEntregar = entrada ? num(entrada.quantidade_atendida) : 0;
    if (qtyEntregar <= 0) continue;

    // Ceiling é o DISPONÍVEL (Etapa 3, Task 3), não mais o físico — leitura fresca aqui é só
    // uma checagem antecipada para uma mensagem de erro com nome do material/pendente; a
    // validação que realmente vale é a atômica dentro de stockService.registrarMovimentacao
    // logo abaixo (fecha a janela de corrida entre esta leitura e a baixa real).
    // Etapa 4: o disponível soma o hold da própria requisição — o que a aprovação reservou é
    // desta requisição e não pode barrá-la.
    // eslint-disable-next-line no-await-in-loop
    const { disponivel, reservado_para_item: reservadoItem } = await saldoDisponivelParaItem(db, item);
    const max = maxEntregar(item, disponivel);

    if (qtyEntregar > max) {
      const err = new Error(
        `${item.material_nome}: não é possível entregar ${qtyEntregar} ${item.unidade || ''}. `
        + `Máximo: ${max} (pendente: ${pendenteEntrega(item)}, disponível: ${disponivel})`
      );
      err.status = 400;
      throw err;
    }

    // Etapa 4 — a entrega consome a RESERVA da própria requisição (design, decisão 2): é isso
    // que fecha a corrida aprovar→entregar, porque o saldo prometido na aprovação sai do hold
    // desta requisição e não do disponível geral (que qualquer outra saída pode ter levado).
    //
    // Quando a entrega passa do que a reserva tem, a saída é DIVIDIDA: o excedente sai pelo
    // caminho normal (sem reserva_id, validado contra o disponível) e a parte reservada é
    // consumida citando a reserva. Recusar o excedente seria mais simples, mas quebraria um caso
    // legítimo e comum: reserva parcial na aprovação (só havia parte do saldo), o resto do
    // material chega depois e a entrega completa passa a caber. Recusar obrigaria a entregar em
    // duas rodadas sem nenhum ganho de segurança — o excedente já é validado pelo motor.
    //
    // ORDEM: excedente PRIMEIRO. Ele é o único que disputa o disponível com o resto do mundo,
    // logo é o que pode falhar; deixando-o na frente, a falha provável acontece ANTES de mexer na
    // reserva — nada saiu do estoque. Com a reserva na frente, a mesma falha deixaria metade da
    // baixa feita. Cada baixa bem-sucedida é registrada no item logo em seguida, então uma falha
    // no meio ainda deixa item e estoque coerentes (o que saiu está contado como entregue).
    const reservasItem = reservadoItem > 0
      // eslint-disable-next-line no-await-in-loop
      ? await dbAll(db, `SELECT id, (quantidade - COALESCE(quantidade_utilizada,0)) as saldo
          FROM reservas_material_almoxarifado
          WHERE item_requisicao_id = ? AND material_id = ? AND status = 'ATIVA' AND origem = 'REQUISICAO'
            AND (quantidade - COALESCE(quantidade_utilizada,0)) > 0
          ORDER BY id`, [item.id, item.material_id])
      : [];

    const baixasReserva = [];
    let restante = qtyEntregar;
    for (const r of reservasItem) {
      if (restante <= 0) break;
      const usar = Math.min(restante, num(r.saldo));
      if (usar <= 0) continue;
      baixasReserva.push({ quantidade: usar, reserva_id: r.id });
      restante -= usar;
    }
    const baixas = restante > 0
      ? [{ quantidade: restante, reserva_id: undefined }, ...baixasReserva]
      : baixasReserva;

    // Etapa 63: com a planejada so para parte (o separado pendente), a baixa se divide em pedacos
    // "com origem" (estrita) e "automaticos". Sem divisao, cada baixa e um pedaco so.
    const qtdOrigemItem = origemPorItem.has(item.id) ? origemPorItem.get(item.id).qtdComOrigem : 0;
    const pedacos = [];
    let comOrigemRestante = qtdOrigemItem;
    for (const b of baixas) {
      let q = b.quantidade;
      if (comOrigemRestante > 1e-9) {
        const parte = Math.min(q, comOrigemRestante);
        pedacos.push({ ...b, quantidade: parte, comOrigem: true });
        comOrigemRestante -= parte;
        q -= parte;
      }
      if (q > 1e-9) pedacos.push({ ...b, quantidade: q, comOrigem: false });
    }
    const movimentosDoItem = [];

    let entregueAcumulado = getEntregue(item);
    // Etapa 61 (RN-02): as series se dividem entre as baixas, em ordem (a 1a baixa leva as primeiras).
    const seriesRestantes = [...(seriesPorItem.get(item.id)?.ids || [])];
    // Etapa 63 (Fase 5): o registro sai num finally — se um pedaco do item falhar depois de outro ja
    // baixado, o livro mostra a saida e a troca nao pode ficar sem registro.
    try {
    for (const baixa of pedacos) {
      try {
        // eslint-disable-next-line no-await-in-loop
        const mov = await stockService.registrarMovimentacao(db, user, {
          material_id: item.material_id,
          tipo: 'SAIDA',
          quantidade: baixa.quantidade,
          reserva_id: baixa.reserva_id,
          ...(seriesPorItem.has(item.id) ? { serie_ids: seriesRestantes.splice(0, baixa.quantidade) } : {}),
          ...(baixa.comOrigem ? {
            localizacao_origem_id: origemPorItem.get(item.id).origemId || undefined,
            lote_id: origemPorItem.get(item.id).loteId || undefined,
            codigo_lido_origem: origemPorItem.get(item.id).lido || undefined,
          } : {}),
          // Etapa 63 (Fase 5, critico): o pedaco AUTOMATICO de um item com serie leva o lote das series —
          // sem ele o fisico drenava pelo ramo sem lote e as series do lote L saiam (o defeito que a
          // Fase 2 da Etapa 61 fechou, reaberto pela divisao da baixa).
          ...(!baixa.comOrigem && seriesPorItem.get(item.id)?.loteSeries ? { lote_id: seriesPorItem.get(item.id).loteSeries } : {}),
          motivo: `Requisição ${reqRow.numero}`,
          referencia: reqRow.os_referencia || reqRow.numero,
          justificativa: `Entrega requisição ${reqRow.numero}`,
          requisicao_id: requisicaoId,
          projeto_id: reqRow.projeto_id || undefined,
          cliente_id: reqRow.cliente_id || undefined,
          centro_custo_id: reqRow.centro_custo_id || undefined,
        }, {
          origemEstrita: baixa.comOrigem && !!origemPorItem.get(item.id)?.origemId,
          exigeSerie: true,
          // Etapa 77 (C136): a marca que deixa o motor consumir a reserva de origem REQUISICAO
          // DESTA requisicao — sem ela o motor recusa (a reserva da requisicao so sai pela entrega).
          requisicaoDaEntrega: requisicaoId,
        });
        movimentosDoItem.push(mov.id);
      } catch (e) {
        const err = new Error(`${item.material_nome}: ${e.message}`);
        err.status = e.status;
        throw err;
      }

      entregueAcumulado += baixa.quantidade;
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db,
        'UPDATE itens_requisicao_almoxarifado SET quantidade_entregue=?, quantidade_atendida=?, quantidade_separada=? WHERE id=?',
        [entregueAcumulado, entregueAcumulado, Math.max(getSeparado(item), entregueAcumulado), item.id]);
    }
    } finally {

    // Etapa 63 (RN-01/02): o registro da substituicao, DEPOIS das baixas do item (um por item por
    // entrega, com os ids das movimentacoes). O lote que saiu vem do LIVRO (no automatico o motor
    // escolhe). Sem transacao: se um item seguinte falhar, este fica baixado E registrado.
    if (substituicoes.has(item.id) && movimentosDoItem.length) {
      const s = substituicoes.get(item.id);
      // eslint-disable-next-line no-await-in-loop
      const lotes = await dbAll(db, `SELECT DISTINCT lote_id FROM movimentacoes_almoxarifado
        WHERE id IN (${movimentosDoItem.map(() => '?').join(',')})`, movimentosDoItem);
      const loteSaida = s.saiuLote || (lotes.length === 1 ? lotes[0].lote_id : null);
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, `INSERT INTO substituicoes_origem_requisicao
        (requisicao_id, item_id, material_id, quantidade, localizacao_planejada_id, lote_planejado_id,
         localizacao_saida_id, lote_saida_id, automatica, movimentacao_ids, motivo, usuario_id, usuario_nome)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`,
      [requisicaoId, item.id, item.material_id, s.quantidade, s.planOrigem, s.planLote,
        s.saiuOrigem, loteSaida, s.automatica ? 1 : 0, JSON.stringify(movimentosDoItem), s.motivo,
        user.id, nomeDoUsuario(user)]);
    }
    }

    // Etapa 59 (RN-04): entregue todo o separado, a origem planejada nao vale mais.
    if (item.origem_separacao_id && Math.max(getSeparado(item), entregueAcumulado) - entregueAcumulado <= 1e-9) {
      // eslint-disable-next-line no-await-in-loop
      await dbRun(db, 'UPDATE itens_requisicao_almoxarifado SET origem_separacao_id = NULL, lote_separacao_id = NULL WHERE id = ?', [item.id]);
    }
    entregas.push({ item_id: item.id, quantidade: qtyEntregar });
  }

  if (entregas.length === 0) {
    const err = new Error('Informe ao menos uma quantidade maior que zero para entregar');
    err.status = 400;
    throw err;
  }

  const itensAtualizados = await carregarItensRequisicao(db, requisicaoId);
  const completo = todosItensCompletos(itensAtualizados);
  const novoStatus = completo ? 'ENTREGUE' : 'PARCIALMENTE_ATENDIDA';

  if (completo) {
    await dbRun(db,
      `UPDATE requisicoes_almoxarifado SET status=?, data_entrega=CURRENT_TIMESTAMP, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
      [novoStatus, requisicaoId]);
  } else {
    await dbRun(db,
      `UPDATE requisicoes_almoxarifado SET status=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL WHERE id=?`,
      [novoStatus, requisicaoId]);
  }

  return { success: true, status: novoStatus, parcial: !completo, entregas };
}

/**
 * `alertService` é aceito e ignorado (Etapa 3, Task 3) — mesmo motivo de entregarRequisicao:
 * stockService.registrarMovimentacao já dispara a checagem de alerta internamente.
 */
async function excluirRequisicao(db, requisicaoId, user, justificativa, alertService) { // eslint-disable-line no-unused-vars
  const reqRow = await dbGet(db,
    'SELECT * FROM requisicoes_almoxarifado WHERE id = ? AND COALESCE(ativo, 1) = 1',
    [requisicaoId]);
  if (!reqRow) {
    const err = new Error('Requisição não encontrada');
    err.status = 404;
    throw err;
  }

  const itens = await carregarItensRequisicao(db, requisicaoId);
  const estornos = [];
  // Calculado antes do loop (achado do fix round): o motor grava `justificativa` no livro/
  // auditoria do estorno — sem isto o ENTRADA de estorno saía sem justificativa (ENTRADA não
  // exige vínculo em movementRules.js, então passava despercebido, mas a rastreabilidade da
  // exclusão ficava incompleta).
  const motivo = justificativa?.trim() || 'Excluída pelo administrador';

  // Etapa 58 (Fase 2, crítico 3 + Fase 5): o estorno devolve POR SAÍDA — mesmo lote, e para a origem
  // dela se ela ainda aceita receber este material (ativa, não bloqueada, tipo permitido); senão a
  // padrão. Agrupado por MATERIAL (dois itens do mesmo material dividem as saídas do livro). Se o
  // livro não soma o entregue (dado antigo, saída estornada à parte), cai no estorno de antes.
  // TODAS as partes são validadas antes da primeira ENTRADA (Fase 5): uma recusa no meio deixava
  // parte creditada com a requisição ativa, e a nova tentativa creditava de novo.
  const partes = [];
  const materiais = [...new Set(itens.filter((i) => getEntregue(i) > 0).map((i) => i.material_id))];
  for (const materialId of materiais) {
    const doMaterial = itens.filter((i) => i.material_id === materialId && getEntregue(i) > 0);
    const totalEntregue = doMaterial.reduce((s, i) => s + getEntregue(i), 0);
    // eslint-disable-next-line no-await-in-loop
    const material = await dbGet(db, 'SELECT id, localizacao_padrao_id, tipo_material, controle_serie FROM materiais_almoxarifado WHERE id = ?', [materialId]);
    // Etapa 61 (Fase 5): POR SAÍDA e LÍQUIDO das devoluções. Por grupo (origem, lote) e sem descontar
    // as devoluções, excluir depois de devolver tudo creditava o físico DE NOVO (a devolução já
    // tinha devolvido; e as séries reativadas perdem o vínculo com a saída, então o caso caía no
    // ramo "legado" e entrava sem série); e uma saída legada misturada com uma nova no mesmo grupo
    // travava a exclusão para sempre. Cada saída: o que falta devolver dela; material com série,
    // as séries dela ainda ENTREGUE (legada: nenhuma — o de antes; número diferente: recusa).
    // eslint-disable-next-line no-await-in-loop
    const saidas = await dbAll(db, `SELECT m.id, m.localizacao_origem_id as origem, m.lote_id, m.quantidade as q,
        COALESCE((SELECT SUM(d.quantidade) FROM devolucoes_material_almoxarifado d WHERE d.movimentacao_saida_id = m.id), 0) as devolvida
      FROM movimentacoes_almoxarifado m
      WHERE m.requisicao_id = ? AND m.material_id = ? AND m.tipo = 'SAIDA' AND COALESCE(m.cancelado, 0) = 0
      ORDER BY m.id`, [requisicaoId, materialId]);
    const somaLivro = saidas.reduce((s, g) => s + (Number(g.q) || 0), 0);
    const nome = doMaterial[0].material_nome;
    if (saidas.length && Math.abs(somaLivro - totalEntregue) < 1e-9) {
      for (const g of saidas) {
        const liquido = (Number(g.q) || 0) - (Number(g.devolvida) || 0);
        if (liquido <= 1e-9) continue;
        let destino = g.origem || undefined;
        if (destino) {
          // eslint-disable-next-line no-await-in-loop
          const loc = await dbGet(db, 'SELECT * FROM localizacoes_almoxarifado WHERE id = ?', [destino]);
          if (!loc || Number(loc.ativo) !== 1 || stockService.motivoRecusaEndereco(loc, material, 'destino')) destino = undefined;
        }
        let series;
        if (Number(material.controle_serie)) {
          // eslint-disable-next-line no-await-in-loop
          const sr = await dbAll(db, `SELECT numero FROM series_almoxarifado
            WHERE status = 'ENTREGUE' AND movimentacao_saida_id = ?`, [g.id]);
          if (sr.length && Math.abs(sr.length - liquido) > 1e-9) {
            const err = new Error(`${nome}: as series desta entrega nao batem com o que falta devolver — use a devolucao`);
            err.status = 400;
            throw err;
          }
          if (sr.length) series = sr.map((s) => s.numero);
        }
        partes.push({ material, nome, quantidade: liquido, destino, lote_id: g.lote_id || undefined, series });
      }
    } else {
      // Livro que não soma o entregue (dado antigo): o estorno de antes — líquido do que já foi
      // devolvido citando as saídas desta requisição.
      // eslint-disable-next-line no-await-in-loop
      const dev = await dbGet(db, `SELECT COALESCE(SUM(d.quantidade), 0) as q FROM devolucoes_material_almoxarifado d
        JOIN movimentacoes_almoxarifado m ON m.id = d.movimentacao_saida_id
        WHERE m.requisicao_id = ? AND m.material_id = ?`, [requisicaoId, materialId]);
      const liquido = totalEntregue - (Number(dev.q) || 0);
      if (liquido > 1e-9) partes.push({ material, nome, quantidade: liquido, destino: undefined, lote_id: undefined });
    }
  }
  for (const parte of partes) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await stockService.validarLocalizacaoParaMovimento(db,
        stockService.resolveLocalizacaoEntrada(parte.material, parte.destino), parte.material, 'destino');
    } catch (e) {
      const err = new Error(`${parte.nome}: ${e.message}`);
      err.status = e.status || 400;
      throw err;
    }
  }
  for (const parte of partes) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await stockService.registrarMovimentacao(db, user, {
        material_id: parte.material.id,
        tipo: 'ENTRADA',
        quantidade: parte.quantidade,
        localizacao_destino_id: parte.destino,
        lote_id: parte.lote_id,
        ...(parte.series ? { series: parte.series } : {}),
        motivo: `Estorno exclusão requisição ${reqRow.numero}`,
        referencia: reqRow.os_referencia || reqRow.numero,
        justificativa: justificativa || motivo,
        requisicao_id: requisicaoId,
        projeto_id: reqRow.projeto_id || undefined,
        cliente_id: reqRow.cliente_id || undefined,
        centro_custo_id: reqRow.centro_custo_id || undefined,
      }, parte.series ? { exigeSerie: true } : {});
    } catch (e) {
      const err = new Error(`${parte.nome}: ${e.message}`);
      err.status = e.status;
      throw err;
    }
  }
  for (const item of itens) {
    if (getEntregue(item) > 0) estornos.push({ material_id: item.material_id, quantidade: getEntregue(item) });
  }

  await dbRun(db,
    `UPDATE requisicoes_almoxarifado
     SET ativo=0, status='CANCELADO', rejeicao_motivo=?, updated_at=CURRENT_TIMESTAMP, ultimo_lembrete_enviado=NULL
     WHERE id=?`,
    [motivo, requisicaoId]);

  // Task 6 — a exclusão deixava o hold preso. O /cancelar solta as reservas desde a Etapa 4;
  // o DELETE não soltava, e as duas rotas terminam no mesmo status CANCELADO. Como a expiração
  // é opt-in por config, na configuração padrão o saldo ficava reservado para uma requisição
  // morta PARA SEMPRE — a mesma armadilha de saldo inutilizável que a etapa fecha.
  //
  // Best-effort, como no /cancelar: falha ao liberar não desfaz a exclusão, que é a ação que o
  // usuário pediu (e cujo estorno de estoque já aconteceu acima).
  const liberacao = await reservationService
    .liberarReservasDaRequisicao(db, user, requisicaoId, motivo)
    .catch((e) => {
      console.warn(`[almoxarifado-reservas] Falha ao liberar reservas da requisição ${requisicaoId} na exclusão: ${e.message}`);
      return { liberadas: [], erros: [{ erro: e.message }] };
    });

  return { success: true, estornos, reservas_liberadas: liberacao.liberadas };
}

module.exports = {
  listarFilaSeparacao,
  compararPrioridade, // Etapa 74 (T0): a ordem unica da fila e da reserva na chegada
  listarSubstituicoes,
  num,
  getEntregue,
  getSeparado,
  pendenteEntrega,
  pendenteSeparacao,
  maxSeparar,
  maxEntregar,
  normalizarItem,
  todosItensCompletos,
  carregarItensRequisicao,
  saldoDisponivelParaItem,
  reservarItensAprovacao,
  prepararPosAprovacao, // Etapa 73
  desfazerReservas, // Etapa 73
  comTravaDaRequisicao, // Etapa 91 (T1)
  separarRequisicao,
  entregarRequisicao,
  excluirRequisicao,
  // Etapa 28
  nomeDoUsuario,
  conferenciaObrigatoria,
  listarSeparacoes,
  assertConferidaSeObrigatorio,
  claimConferencia,
  conferirSeparacao,
};
