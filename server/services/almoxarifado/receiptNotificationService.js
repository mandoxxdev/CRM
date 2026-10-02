/**
 * Etapa 70 (feature 08 + 19) — o aviso da nota que entrou no estoque.
 *
 * Quando um recebimento termina de dar entrada (vira `PROCESSADO` por `processarNota` ou `APROVADO`
 * pelo ramo direto de `aprovarRecebimento`), a fila da 19 (`fila_notificacoes_almoxarifado`, so
 * `enfileirar` — quem envia e o worker) ganha:
 *   - UM aviso DA NOTA (`RECEBIMENTO_ENTRADA`, dedupe `recebimento-entrada-<id>`) para a lista
 *     `notificacoes_dest_recebimento`; vazia -> `notificacoes_dest_compras` -> `compras_notificar_emails`
 *     (D2: o banco nao tem o comprador do pedido; o setor de Compras e o "comprador" possivel).
 *     Governado por `notificar_recebimento_entrada`, que nasce '0' (Fase 2: o deploy mandaria e-mail
 *     na hora para uma lista compartilhada real — ligar e decisao de quem opera).
 *   - UM aviso POR REQUISICAO a quem pediu o material (`RECEBIMENTO_ENTRADA_REQUISITANTE`, dedupe
 *     `recebimento-entrada-<id>-req-<requisicao_id>`), para `usuarios.email` do solicitante.
 *     Governado por `notificar_recebimento_solicitante`, que nasce '1' (o aviso vai so a quem pediu —
 *     e o valor da etapa).
 *
 * Criterio "quem esperava" (Fase 2, por ITEM e nao por status AGUARDANDO_*): requisicao ativa, em
 * `PODE_SEPARAR` exceto `EM_SEPARACAO`, com item cujo pendente de separacao menos o reservado ATIVO
 * para o item seja > 1e-9, de material que entrou LIVRE nesta nota. Material retido para inspecao
 * nao avisa o solicitante (D5: prometeria material que pode ser reprovado).
 *
 * O conteudo e lido do BANCO (itens com `entrada_estoque_em`), nao do que a chamada moveu (D6): a
 * retomada apos falha parcial lista tudo o que entrou. "Retido" reflete o estado ATUAL do item
 * (declarado: numa retomada depois de a inspecao liberar, o item aparece "disponivel").
 *
 * Lanca so em erro de banco — quem chama (os ganchos do receiptService) engole com `console.warn`
 * (RN-05: o aviso nunca derruba a entrada). `alertService` e requerido LAZY (ciclo documentado em
 * `notificationQueueService.js`).
 */
const { dbGet, dbAll } = require('./db');
const notificationQueueService = require('./notificationQueueService');
const { PODE_SEPARAR } = require('./requisitionStateMachine');
// Etapa 74 (T2): o disponivel atual do material decide se a linha de quem nao ganhou reserva entra no aviso.
const { disponivelSql } = require('./availabilitySql');

const EPS = 1e-9;

// Etapa 70, Fase 5: a quantidade que o item levou ao estoque, em SQL — `quantidadeDoItem` do
// `receiptService`. `COALESCE` puro devolvia o `''` legado (texto na coluna REAL), e no SQLite
// TEXTO e sempre maior que numero: o item passava no `> 0` e o aviso anunciava "0".
const QTD_DO_ITEM_SQL = `(CASE WHEN ri.quantidade_recebida IS NULL
      OR (typeof(ri.quantidade_recebida) = 'text' AND TRIM(ri.quantidade_recebida) = '')
    THEN ri.quantidade_esperada ELSE ri.quantidade_recebida END)`;
const EVENTO_NOTA = 'RECEBIMENTO_ENTRADA';
const EVENTO_REQUISITANTE = 'RECEBIMENTO_ENTRADA_REQUISITANTE';

// Fase 2: EM_SEPARACAO fica fora — a separacao ja esta acontecendo, o almoxarife esta com ela.
const STATUS_QUE_ESPERAM = PODE_SEPARAR.filter((s) => s !== 'EM_SEPARACAO');

const SITUACAO_REQUISICAO = {
  APROVADO: 'Aprovada',
  AGUARDANDO_ESTOQUE: 'Aguardando estoque',
  AGUARDANDO_COMPRA: 'Aguardando compra',
  PARCIALMENTE_RESERVADA: 'Parcialmente reservada',
  TOTALMENTE_RESERVADA: 'Totalmente reservada',
  PARCIALMENTE_ATENDIDA: 'Parcialmente atendida',
};

/**
 * O link de "Minhas requisicoes" de quem pediu, pelo modulo de onde a requisicao saiu (Fase 2: quem
 * pediu pela Fabrica nao enxerga `/almoxarifado/requisicoes`).
 *
 * ⚠️ ESPELHO de `basePath` em `client/src/config/requisicoesMaterialConfig.js` (MODULOS_REQUISICAO),
 * que e ESM do CRA e nao pode ser requerido daqui. A fonte unica e garantida por TESTE:
 * `recebimentoAvisoEntrada.api.test.js` le o arquivo do cliente e compara este mapa com ele — uma
 * entrada nova la sem a linha aqui derruba o teste. A rota da lista e `${basePath}/requisicoes-material`
 * (`MENU_REQUISICAO_ITEMS`). Sem modulo (ou modulo desconhecido) -> a lista do almoxarifado.
 */
const BASE_PATH_POR_MODULO = {
  comercial: '/comercial',
  compras: '/compras',
  financeiro: '/financeiro',
  operacional: '/fabrica',
  engenharia: '/engenharia',
  engenharia_projetos: '/engenharia-projetos',
  almoxarifado: '/almoxarifado',
  administrativo: '/configuracoes',
  admin: '/admin',
  frota: '/frota',
};

function caminhoRequisicoesDoModulo(moduloOrigem) {
  const base = BASE_PATH_POR_MODULO[moduloOrigem];
  return base ? `${base}/requisicoes-material` : '/almoxarifado/requisicoes';
}

/** `String(Number(q.toFixed(6)))`: sem zeros a direita e sem ruido de ponto flutuante. */
function fmtQtd(q) {
  return String(Number(Number(q).toFixed(6)));
}
function qtdComUnidade(q, unidade) {
  return unidade ? `${fmtQtd(q)} ${unidade}` : fmtQtd(q);
}

/**
 * Pura. `dados`: { numero, nota_fiscal, fornecedor_nome, fornecedor_cnpj, pedido_compra_numero,
 * data_hora, usuario, itens: [{ codigo, nome, quantidade, unidade, localizacao, retido }],
 * requisicoes: [{ numero, solicitante_nome }], link }.
 */
function montarAvisoNota(dados) {
  const assunto = `[Almoxarifado] Entrada confirmada — ${dados.numero}`
    + (dados.nota_fiscal ? ` — NF ${dados.nota_fiscal}` : '');
  const linhas = [
    'A nota deu entrada no estoque.',
    `Recebimento: ${dados.numero}`,
    `Nota fiscal: ${dados.nota_fiscal || 'não informada'}`,
    `Fornecedor: ${dados.fornecedor_nome || dados.fornecedor_cnpj || 'não informado'}`,
  ];
  if (dados.pedido_compra_numero) linhas.push(`Pedido de compra: ${dados.pedido_compra_numero}`);
  linhas.push(`Data/hora: ${dados.data_hora}`);
  linhas.push(`Usuário: ${dados.usuario}`);
  linhas.push('Itens que entraram:');
  for (const it of dados.itens) {
    linhas.push(`- ${it.codigo} — ${it.nome}: ${qtdComUnidade(it.quantidade, it.unidade)}`
      + (it.localizacao ? ` em ${it.localizacao}` : '')
      + ` — ${it.retido ? 'retido para inspeção' : 'disponível'}`);
  }
  if (dados.requisicoes && dados.requisicoes.length) {
    linhas.push('Requisições que aguardavam estes materiais: '
      + dados.requisicoes.map((r) => `${r.numero} (${r.solicitante_nome})`).join(', '));
  }
  linhas.push(`Link: ${dados.link}`);
  return { assunto, corpo_texto: linhas.join('\n'), linhas };
}

/**
 * Etapa 74 (T2, D7/B373): as três frases finais do aviso ao solicitante. L0 é a da Etapa 70, intacta.
 * L1: todo material listado ganhou reserva nesta nota. L2: parte ganhou, parte não.
 */
const FRASE_SEM_RESERVA = 'O material ainda não está reservado para a sua requisição — a separação é feita pelo almoxarifado.';
const FRASE_TUDO_RESERVADO = 'O material indicado como reservado fica guardado para a sua requisição — outra requisição '
  + 'não pode levá-lo. A separação é feita pelo almoxarifado.';
const FRASE_PARTE_RESERVADA = 'Só o material indicado como reservado fica guardado para a sua requisição; o restante ainda '
  + 'não está reservado — a separação é feita pelo almoxarifado.';

/**
 * Pura. `dados`: { numero_requisicao, status, numero_recebimento,
 * materiais: [{ codigo, nome, unidade, entrou, pendente, reservado? }], link }.
 * Etapa 74: `reservado` (> 0) é o que esta nota reservou para a requisição; a linha ganha
 * "; reservado para a sua requisição: N" e a frase final passa a ter três formas (L0/L1/L2).
 */
function montarAvisoRequisitante(dados) {
  const assunto = `[Almoxarifado] Chegou material da sua requisição ${dados.numero_requisicao}`;
  const comReserva = dados.materiais.filter((m) => Number(m.reservado) > EPS).length;
  let frase = FRASE_SEM_RESERVA;
  if (comReserva > 0) frase = comReserva === dados.materiais.length ? FRASE_TUDO_RESERVADO : FRASE_PARTE_RESERVADA;
  const linhas = [
    'Chegou ao estoque material que a sua requisição aguardava.',
    `Requisição: ${dados.numero_requisicao}`,
    `Situação da requisição: ${SITUACAO_REQUISICAO[dados.status] || dados.status}`,
    `Recebimento: ${dados.numero_recebimento}`,
    'Materiais que chegaram:',
    ...dados.materiais.map((m) => `- ${m.codigo} — ${m.nome}: entrou ${qtdComUnidade(m.entrou, m.unidade)}`
      + ` (pendente na requisição: ${qtdComUnidade(m.pendente, m.unidade)}`
      + (Number(m.reservado) > EPS ? `; reservado para a sua requisição: ${qtdComUnidade(m.reservado, m.unidade)})` : ')')),
    frase,
    `Link: ${dados.link}`,
  ];
  return { assunto, corpo_texto: linhas.join('\n'), linhas };
}

function html(linhas, escapeHtml) {
  return `<div>${linhas.map((l) => `<p>${escapeHtml(l)}</p>`).join('\n')}</div>`;
}

async function chaveLigada(alertService, db, chave, padrao) {
  const v = await alertService.getConfigValue(db, chave);
  return (v === undefined || v === null ? padrao : String(v)) === '1';
}

/** D2: lista propria -> lista de Compras -> e-mails de Compras. O toggle de alertas NAO governa. */
async function destinatariosDaNota(alertService, db) {
  for (const chave of ['notificacoes_dest_recebimento', 'notificacoes_dest_compras', 'compras_notificar_emails']) {
    const lista = alertService.parseList(await alertService.getConfigValue(db, chave));
    if (lista.length) return lista;
  }
  return [];
}

/**
 * E-mail (ativo, nao vazio) de cada solicitante. A tabela `usuarios` e do core: no harness pode
 * nao existir — a consulta falhar vira "ninguem tem e-mail", e o aviso da nota sai mesmo assim.
 */
async function emailsDosUsuarios(db, ids) {
  const mapa = new Map();
  if (!ids.length) return mapa;
  try {
    const rows = await dbAll(db, `SELECT id, email FROM usuarios
      WHERE id IN (${ids.map(() => '?').join(',')})
        AND COALESCE(ativo, 1) = 1 AND email IS NOT NULL AND TRIM(email) <> ''`, ids);
    for (const r of rows) mapa.set(r.id, String(r.email).trim());
  } catch (e) {
    console.warn(`[recebimento] aviso de entrada: e-mail dos solicitantes indisponivel: ${e.message}`);
  }
  return mapa;
}

async function avisarEntradaConfirmada(db, user, recebimentoId) {
  const alertService = require('./alertService');
  const avisarNota = await chaveLigada(alertService, db, 'notificar_recebimento_entrada', '0');
  const avisarSolicitante = await chaveLigada(alertService, db, 'notificar_recebimento_solicitante', '1');
  if (!avisarNota && !avisarSolicitante) return { desligado: true };

  const rec = await dbGet(db, 'SELECT * FROM recebimentos_material_almoxarifado WHERE id = ?', [recebimentoId]);
  if (!rec) return { sem_entrada: true };

  // `QTD_DO_ITEM_SQL` e o espelho SQL de `quantidadeDoItem` (Etapa 70 T0 + Fase 5): o 0 conferido
  // nao entrou e nao aparece; o `''` LEGADO vale a esperada. So o que tem `entrada_estoque_em` (D6).
  const itens = await dbAll(db, `SELECT ri.id, ri.material_id,
      ${QTD_DO_ITEM_SQL} AS quantidade,
      COALESCE(ri.quantidade_em_inspecao, 0) AS em_inspecao,
      m.codigo, m.nome, m.unidade, l.codigo AS localizacao
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON m.id = ri.material_id
    LEFT JOIN localizacoes_almoxarifado l ON l.id = ri.localizacao_entrada_id
    WHERE ri.recebimento_id = ? AND ri.entrada_estoque_em IS NOT NULL
      AND ${QTD_DO_ITEM_SQL} > 0
    ORDER BY ri.id`, [recebimentoId]);
  if (!itens.length) return { sem_entrada: true };

  // Quanto entrou LIVRE de cada material (somado: o mesmo material em dois itens da nota).
  const livrePorMaterial = new Map();
  for (const it of itens) {
    if (it.em_inspecao > EPS) continue;
    livrePorMaterial.set(it.material_id, (livrePorMaterial.get(it.material_id) || 0) + Number(it.quantidade));
  }
  const materiaisDaNota = [...new Set(itens.map((it) => it.material_id))];

  // Requisicoes com pendente (separacao - reservado do item) de material que entrou nesta nota.
  // Etapa 74 (T2, D7): o hold que ESTA nota criou (reservaChegadaService, `recebimento_id`) NAO desconta
  // o pendente — senao quem ganhou tudo na chegada ficava sem e-mail (Surpresa 1); os demais holds
  // descontam como antes. `reservado_nesta_nota`: o que a chegada desta nota reservou para o item (ATIVA
  // ou ja consumida; a liberada nao conta — a liberacao total guarda a quantidade so como historico).
  const marcasMat = materiaisDaNota.map(() => '?').join(',');
  const marcasSt = STATUS_QUE_ESPERAM.map(() => '?').join(',');
  const linhasReq = await dbAll(db, `SELECT r.id AS requisicao_id, r.numero, r.status, r.solicitante_id,
      r.solicitante_nome, r.modulo_origem, ir.material_id,
      MAX(0, COALESCE(ir.quantidade_solicitada, 0) - COALESCE(ir.quantidade_separada, 0)) - COALESCE((
        SELECT SUM(rs.quantidade - COALESCE(rs.quantidade_utilizada, 0))
        FROM reservas_material_almoxarifado rs
        WHERE rs.item_requisicao_id = ir.id AND rs.material_id = ir.material_id
          AND rs.status = 'ATIVA' AND rs.origem = 'REQUISICAO'
          AND COALESCE(rs.recebimento_id, 0) <> ?), 0) AS pendente,
      COALESCE((
        SELECT SUM(rs.quantidade)
        FROM reservas_material_almoxarifado rs
        WHERE rs.item_requisicao_id = ir.id AND rs.material_id = ir.material_id
          AND rs.status IN ('ATIVA', 'CONSUMIDA') AND rs.recebimento_id = ?), 0) AS reservado_nesta_nota
    FROM itens_requisicao_almoxarifado ir
    JOIN requisicoes_almoxarifado r ON r.id = ir.requisicao_id
    WHERE COALESCE(r.ativo, 1) = 1 AND r.status IN (${marcasSt}) AND ir.material_id IN (${marcasMat})
    ORDER BY r.id, ir.id`, [Number(recebimentoId), Number(recebimentoId), ...STATUS_QUE_ESPERAM, ...materiaisDaNota]);

  // Agrupa por requisicao; `pendenteLivre` so com o material que entrou livre (o que avisa o solicitante).
  const porRequisicao = new Map();
  for (const l of linhasReq) {
    if (!(Number(l.pendente) > EPS)) continue;
    if (!porRequisicao.has(l.requisicao_id)) {
      porRequisicao.set(l.requisicao_id, { ...l, pendentePorMaterial: new Map(), reservadoPorMaterial: new Map() });
    }
    const req = porRequisicao.get(l.requisicao_id);
    req.pendentePorMaterial.set(l.material_id, (req.pendentePorMaterial.get(l.material_id) || 0) + Number(l.pendente));
    req.reservadoPorMaterial.set(l.material_id,
      (req.reservadoPorMaterial.get(l.material_id) || 0) + Math.min(Number(l.reservado_nesta_nota) || 0, Number(l.pendente)));
  }
  const requisicoes = [...porRequisicao.values()];

  const appBase = alertService.resolveAppBaseUrl(await alertService.getConfigValue(db, alertService.APP_URL_CONFIG_KEY));
  const resultado = { nota: null, requisitantes: [] };

  if (avisarNota) {
    const aviso = montarAvisoNota({
      numero: rec.numero,
      nota_fiscal: rec.nota_fiscal,
      fornecedor_nome: rec.fornecedor_nome,
      fornecedor_cnpj: rec.fornecedor_cnpj,
      pedido_compra_numero: rec.pedido_compra_numero,
      data_hora: alertService.formatDateTimePtBr(),
      usuario: user?.nome || user?.email || `usuário #${user?.id}`,
      itens: itens.map((it) => ({
        codigo: it.codigo, nome: it.nome, quantidade: it.quantidade, unidade: it.unidade,
        localizacao: it.localizacao, retido: it.em_inspecao > EPS,
      })),
      requisicoes: requisicoes.map((r) => ({ numero: r.numero, solicitante_nome: r.solicitante_nome })),
      link: `${appBase}/almoxarifado/recebimentos`,
    });
    resultado.nota = await notificationQueueService.enfileirar(db, {
      evento: EVENTO_NOTA,
      dedupe_chave: `recebimento-entrada-${recebimentoId}`,
      destinatarios: await destinatariosDaNota(alertService, db),
      assunto: aviso.assunto,
      corpo_texto: aviso.corpo_texto,
      corpo_html: html(aviso.linhas, alertService.escapeHtml),
      payload: {
        recebimento_id: Number(recebimentoId), numero: rec.numero, itens: itens.length,
        requisicoes: requisicoes.map((r) => r.requisicao_id),
      },
    });
  } else {
    resultado.nota = { enfileirada: false, motivo: 'DESLIGADO' };
  }

  if (avisarSolicitante) {
    // Etapa 74 (T2, D7 + Fase 2): a LINHA de um material so entra quando a chegada reservou dele para esta
    // requisicao OU ainda ha disponivel livre dele para separar — senao o e-mail prometeria material que
    // foi reservado para outra requisicao (o defeito medido na A2 da Fase 0). Sem linha, sem e-mail.
    const disponivelPorMaterial = new Map();
    for (const m of livrePorMaterial.keys()) {
      // eslint-disable-next-line no-await-in-loop
      const row = await dbGet(db, `SELECT ${disponivelSql()} AS d FROM materiais_almoxarifado WHERE id = ?`, [m]);
      disponivelPorMaterial.set(m, Number(row && row.d) || 0);
    }
    const linhaAvisavel = (r, m) => livrePorMaterial.has(m)
      && ((r.reservadoPorMaterial.get(m) || 0) > EPS || (disponivelPorMaterial.get(m) || 0) > EPS);
    const avisaveis = requisicoes.filter((r) => [...r.pendentePorMaterial.keys()].some((m) => linhaAvisavel(r, m)));
    const emails = await emailsDosUsuarios(db, [...new Set(avisaveis.map((r) => r.solicitante_id))]);
    const materialInfo = new Map(itens.map((it) => [it.material_id, it]));
    for (const r of avisaveis) {
      const materiais = [...r.pendentePorMaterial.entries()]
        .filter(([m]) => linhaAvisavel(r, m))
        .map(([m, pendente]) => {
          const info = materialInfo.get(m);
          return {
            codigo: info.codigo, nome: info.nome, unidade: info.unidade, entrou: livrePorMaterial.get(m), pendente,
            reservado: r.reservadoPorMaterial.get(m) || 0,
          };
        });
      const aviso = montarAvisoRequisitante({
        numero_requisicao: r.numero,
        status: r.status,
        numero_recebimento: rec.numero,
        materiais,
        link: `${appBase}${caminhoRequisicoesDoModulo(r.modulo_origem)}`,
      });
      // eslint-disable-next-line no-await-in-loop
      const fila = await notificationQueueService.enfileirar(db, {
        evento: EVENTO_REQUISITANTE,
        dedupe_chave: `recebimento-entrada-${recebimentoId}-req-${r.requisicao_id}`,
        destinatarios: emails.has(r.solicitante_id) ? [emails.get(r.solicitante_id)] : [],
        assunto: aviso.assunto,
        corpo_texto: aviso.corpo_texto,
        corpo_html: html(aviso.linhas, alertService.escapeHtml),
        payload: { recebimento_id: Number(recebimentoId), requisicao_id: r.requisicao_id, numero_requisicao: r.numero },
      });
      resultado.requisitantes.push({ requisicao_id: r.requisicao_id, ...fila });
    }
  }

  return resultado;
}

module.exports = {
  avisarEntradaConfirmada,
  montarAvisoNota,
  montarAvisoRequisitante,
  caminhoRequisicoesDoModulo,
  BASE_PATH_POR_MODULO,
  EVENTO_NOTA,
  EVENTO_REQUISITANTE,
  // Etapa 71, Fase 5: a NF relancavel (`receiptService.assertNotaNaoDuplicada`) usa a MESMA regua.
  QTD_DO_ITEM_SQL,
  // Etapa 74 (T2): as tres frases finais do aviso ao solicitante (L0 da 70, L1, L2).
  FRASE_SEM_RESERVA,
  FRASE_TUDO_RESERVADO,
  FRASE_PARTE_RESERVADA,
};
