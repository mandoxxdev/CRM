const { dbRun, dbGet, dbAll } = require('./db');
// Etapa 36 (RN-11): o enum de `tipo_recebimento` tem fonte UNICA em schema.js — quem grava (aqui) e
// quem valida (schemas.js/Zod) leem a MESMA lista. Sem ciclo: schema.js so requer ./db.
// Os dois nomes saem da PROPRIA lista, sem reescrever nenhuma string do enum a mao, e o default
// derivado abaixo le por NOME em vez de `TIPOS_RECEBIMENTO[0]` / `[1]` espalhados.
//
// ⚠️ Mas a ligacao e POSICIONAL, e isso NAO e seguro a reordenacao (revisao final, F4 — o
// comentario anterior afirmava o contrario, que e o oposto da verdade): se `TIPOS_RECEBIMENTO`
// mudar de ordem em schema.js, `TIPO_NOTA_FISCAL` passa a valer 'PEDIDO_COMPRA' e vice-versa, em
// silencio. Nenhum teste de hoje pega: a coluna e write-only e o unico ramo de comportamento
// compara com `TIPO_PEDIDO_COMPRA`, entao o enum continua valido e o ramo troca sozinho.
// Fica assim de proposito: exportar dois nomes proprios de schema.js foi declarado FORA DE ESCOPO
// na T1 desta etapa. Quem reordenar a lista tem de vir ate aqui.
const { TIPOS_RECEBIMENTO } = require('./schema');
const [TIPO_NOTA_FISCAL, TIPO_PEDIDO_COMPRA] = TIPOS_RECEBIMENTO;
const { registrarAuditoria } = require('./audit');
const { inserirComNumeroUnico } = require('./numeroDoc');
const {
  registrarMovimentacao, resolveLocalizacaoEntrada, validarLocalizacaoParaMovimento,
} = require('./stockService');
const lotService = require('./lotService');
// Etapa 14, Task 1 (RN-03): sem ciclo — purchaseService NAO requer receiptService. Chamado pelo
// OBJETO do modulo (nao desestruturado) de proposito: o teste de sabotagem monkeypatcha
// `purchaseService.fecharSolicitacoesDoPedido` em tempo de execucao, e uma desestruturacao no
// require capturaria a funcao original antes do monkeypatch.
const purchaseService = require('./purchaseService');
// Etapa 17, Task 2 (gancho C4.2) — pelo OBJETO do modulo pelo MESMO motivo do purchaseService
// acima: o teste de RN-02 monkeypatcha `dispararAlertaRegistrado` e uma desestruturacao
// capturaria a funcao original. Sem ciclo (purchaseService/stockService ja carregam a fila).
const notificationQueueService = require('./notificationQueueService');
const alertRegistry = require('./alertRegistry');
// Etapa 36 (RN-18): a barreira de excedente e CONDICIONAL (so quando o body traz a flag), entao a
// checagem mora aqui e nao em `requirePermission` na rota — molde de
// `ownerRules.assertAjustePermitido`. Sem ciclo: `permissions.js` nao requer nada no topo (o
// `../systemPermissions` dele e requerido DENTRO de `getPerfilFromUser`, de proposito).
const { can, getPerfilFromUser } = require('./permissions');

/**
 * Etapa 17 (RN-04, gancho C4.2) — aviso pos-escrita da quantidade recebida, nos DOIS escritores
 * reais (`conferirRecebimento` e `salvarDadosFiscal`; a UI de producao passa pelo fiscal, entao
 * um gancho so na conferencia nunca dispararia de verdade — achado Critico da revisao do plano).
 *
 * A regua e a query compartilhada do registro (`listarDivergenciasRecebimento({ recebimentoId })`,
 * float-safe por `divergenciaRealSql`): refazer a comparacao em JS aqui seria a segunda definicao
 * de "item divergente" — a classe de bug que divergencia.js existe para matar.
 *
 * Roda mesmo quando a chamada nao trouxe itens: o dedupe por item (`receb-diverg-<item_id>`)
 * torna o disparo repetido inofensivo e o gancho vira rede de seguranca a mais. Nunca derruba o
 * ato (padrao pos-commit, stockService.js:1374-1405).
 */
async function avisarDivergenciasDoRecebimento(db, recebimentoId) {
  try {
    const itens = await alertRegistry.listarDivergenciasRecebimento(db, { recebimentoId });
    for (const linha of itens) {
      await notificationQueueService.dispararAlertaRegistrado(db, 'DIVERGENCIA_RECEBIMENTO', linha);
    }
  } catch (e) {
    console.warn('[almoxarifado-alertas] Falha ao avisar divergencia de recebimento:', e.message);
  }
}

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

// Etapa 31: `gerarNumero(prefix)` SUMIU daqui — era o milissegundo fatiado em DECIMAL (os oito
// ultimos digitos) mais um sorteio de 0..99, e fatiar em decimal faz o carimbo REPETIR a cada
// 27,78 horas. O numero do recebimento passa a sair do gerador unico do modulo (`numeroDoc.js`),
// com carimbo base36 INTEIRO (nao da a volta) e 8 caracteres de entropia.

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

/**
 * RN-12/13/14 (Etapa 36) — a mesma nota fiscal do mesmo fornecedor nao entra duas vezes.
 *
 * Medido por sonda executada na Fase 0: dois POST com a mesma `nota_fiscal` e o mesmo
 * `fornecedor_id` respondiam 201 + 201; processando as duas, o material era creditado DUAS VEZES
 * (20 em vez de 10) e nasciam DUAS contas a pagar, com descricao identica exceto pelo numero do REC.
 * Ninguem mais no sistema segurava essa porta: `gerarContaPagar` insere sem consultar duplicidade.
 *
 * Mora no SERVICO e e chamada pelos DOIS escritores — `criarRecebimento` e `salvarDadosFiscal` —
 * porque o PUT /fiscal PREENCHE a NF depois, e uma guarda so no POST seria contornavel pelo mesmo
 * caminho que tornava o enum contornavel (RN-11).
 *
 * NAO e `UNIQUE(nota_fiscal, fornecedor_id)` no banco, e isso e decisao reversivel registrada na
 * letra B: producao pode ja ter duplicatas e o indice unico falharia na SUBIDA do servidor (o
 * `numero TEXT UNIQUE` nasceu no CREATE TABLE, nao por safeAlter — nao ha precedente de unico
 * aplicado a acervo aqui); `NULL` nunca colide, entao o indice seria silenciosamente parcial onde
 * mais importa; e a recusa viria como SQLITE_CONSTRAINT, nao como literal legivel. A letra A do
 * fechamento leva a consulta SQL que mede duplicatas em producao ANTES de qualquer deploy.
 *
 * Tres coisas NAO sao duplicata: NF vazia/nula, fornecedor diferente, e fornecedor nao identificado
 * (id, CNPJ e NOME os tres nulos) — sem fornecedor nao existe "mesmo fornecedor" a afirmar.
 *
 * (Fase 2) O `fornecedor_nome` E o terceiro identificador, e nao um detalhe: a TELA nunca manda
 * `fornecedor_id` — `handleCriar` monta o payload sem ele e `form` nao tem esse campo
 * (`RecebimentosAlmoxarifado.js:86-93` e `:342-354`); o `<select>` de fornecedores copia
 * `razao_social` -> `fornecedor_nome` e `cnpj` -> `fornecedor_cnpj` (`selecionarFornecedor`).
 * Com a chave so em id/CNPJ, a guarda ficaria INALCANCAVEL pelo caminho real sempre que o
 * fornecedor nao tivesse CNPJ digitado — regra entregue e porta faltando, a classe de defeito que
 * esta etapa esta pagando do outro lado (a rota /conferir sem chamador).
 *
 * ⚠️ (revisao final, R3/R4/R5) A COMPARACAO SAIU DO SQL. Ela era `UPPER(TRIM(coluna)) = UPPER(?)`
 * sobre UMA perna escolhida por ordem de preferencia, e isso era contornavel de tres jeitos, os
 * tres medidos por sonda:
 * - `UPPER` do SQLite e ASCII-ONLY: 'José Aços Ltda' e 'JOSÉ AÇOS LTDA' entravam as DUAS (201 +
 *   201), com o estoque creditado duas vezes. E o caminho real da tela, que manda nome digitado;
 * - identificacao MISTA vencia a guarda inteira: A digitado a mao (so nome) e B escolhido no
 *   `<select>` (nome E CNPJ) nunca se achavam, porque a ordem de preferencia escolhia UMA perna e
 *   descartava as outras;
 * - a perna do CNPJ fazia TRIM na coluna e nao no parametro, e ignorava pontuacao.
 *
 * Agora: busca os candidatos pela NF normalizada (`UPPER(TRIM(...))` basta para NF, que e ASCII) e
 * compara o FORNECEDOR em JS, casando se QUALQUER perna casar — mesmo `fornecedor_id`, ou mesmo
 * CNPJ so-digitos, ou mesmo nome sem acento/caixa/espaco duplo. Nenhuma perna vazia casa.
 * DESCARTADO resolver no SQL: nao ha como tirar acento em SQLite sem extensao, e um REPLACE
 * encadeado por acento seria ilegivel e incompleto. CONSEQUENCIA REGISTRADA: a consulta que mede
 * duplicatas em PRODUCAO (letra A do fechamento) roda em SQL e NAO ve as duplicatas por acento —
 * ela SUB-REPORTA, e isso esta dito no fechamento.
 */
const digitosDe = (v) => (v == null ? '' : String(v).replace(/\D+/g, ''));
const nomeChave = (v) => (typeof v === 'string'
  // NFD separa a letra do acento; `\p{M}` apaga so as marcas. Depois caixa, bordas e espaco duplo
  // (o Caps Lock e o espaco a mais sao os dois erros de digitacao que criavam documento novo).
  ? v.normalize('NFD').replace(/\p{M}+/gu, '').toUpperCase().trim().replace(/\s+/g, ' ')
  : '');

async function assertNotaNaoDuplicada(db, { nota_fiscal, fornecedor_id, fornecedor_cnpj, fornecedor_nome }, recebimentoId = null) {
  const nf = typeof nota_fiscal === 'string' ? nota_fiscal.trim() : nota_fiscal;
  if (!nf) return;                                   // RN-13: sem NF nao ha duplicata
  const nome = nomeChave(fornecedor_nome);
  const cnpj = digitosDe(fornecedor_cnpj);
  if (!fornecedor_id && !cnpj && !nome) return;       // RN-13: sem fornecedor, idem

  const params = [nf];
  // (Fase 2) O filtro de CANCELADO saiu: `STATUS` do recebimento nao tem 'CANCELADO' (os 11 status
  // sao RECEBIDO..BLOQUEADO), entao a clausula era codigo morto que fazia o proximo leitor acreditar
  // num cancelamento que nao existe. Se um dia existir, ela volta COM o teste que a exercita.
  let sql = `SELECT id, numero, fornecedor_id, fornecedor_cnpj, fornecedor_nome
    FROM recebimentos_material_almoxarifado WHERE UPPER(TRIM(nota_fiscal)) = UPPER(?)`;
  if (recebimentoId) { sql += ' AND id <> ?'; params.push(recebimentoId); }

  // A NF e seletiva: este `dbAll` traz 0 ou 1 linha no caso normal, e as duplicatas de acervo sao
  // exatamente o que se quer ver. `LIMIT 1` aqui seria errado — o candidato certo pode ser o segundo.
  const candidatos = await dbAll(db, sql, params);
  const ja = candidatos.find((c) => (
    (fornecedor_id && Number(c.fornecedor_id) === Number(fornecedor_id))
    || (cnpj && digitosDe(c.fornecedor_cnpj) === cnpj)
    || (nome && nomeChave(c.fornecedor_nome) === nome)
  ));
  if (ja) {
    throw Object.assign(
      new Error(`Nota fiscal ${nf} já lançada no recebimento ${ja.numero} para este fornecedor`),
      { status: 409 },
    );
  }
}

/**
 * (Etapa 37) A recebida que o operador DECLAROU, lida do payload CRU — antes de a esperada ser
 * trocada pelo saldo. A ordem de preferencia e a mesma que o INSERT dos itens usa
 * (`quantidade_recebida`, senao a esperada, senao a quantidade), e `parseFloat` +
 * `Number.isFinite` pelo motivo ja comentado na barreira da Etapa 36: `''` nao pode ser lido como
 * ZERO, senao a comparacao ficaria falsa por acidente e nao por regra.
 */
const recebidaDeclaradaNoPayload = (item) => {
  for (const v of [item.quantidade_recebida, item.quantidade_esperada, item.quantidade]) {
    if (v == null || v === '') continue;
    const n = parseFloat(v);
    if (Number.isFinite(n)) return n;
  }
  return 0;
};

async function criarRecebimento(db, user, data) {
  const {
    pedido_compra_id, pedido_compra_numero, tipo_recebimento, nota_fiscal,
    fornecedor_id, fornecedor_nome, fornecedor_cnpj, observacoes, itens: itensInput,
  } = data;

  let pedido = null;
  let itens = itensInput || [];
  // (Etapa 37) As linhas do pedido COM o saldo de cada uma, e a ligacao item -> linha resolvida
  // pelo SERVIDOR. Ficam vazias no caminho NF puro (e ai nao ha saldo a medir: o unico "esperado"
  // e o que o proprio operador digitou, e quem governa e a barreira da Etapa 36).
  let linhasDoPedido = [];
  let resolvidos = [];
  const tipo = tipo_recebimento || (pedido_compra_id || pedido_compra_numero ? TIPO_PEDIDO_COMPRA : TIPO_NOTA_FISCAL);

  if (tipo === TIPO_PEDIDO_COMPRA) {
    pedido = await resolverPedidoCompra(db, { pedido_compra_id, pedido_compra_numero });
    if (!pedido) throw Object.assign(new Error('Pedido de compra não encontrado'), { status: 400 });
    linhasDoPedido = await saldoDasLinhasDoPedido(db, pedido.id);

    if (!itens.length) {
      // RN-25 — DUAS contagens, DUAS literais (decisao 14). "Nenhuma linha com saldo" abrigava
      // dois fatos diferentes: o pedido QUITADO e o pedido cujo Compras ainda NAO LANCOU as
      // linhas. Dizer "ja foi recebido por completo" ao segundo e MENTIRA — e ele e justamente o
      // pedido que a RN-24 manda manter visivel em `?pendentes=1` como ABERTO: a tela o oferece e
      // a porta o recusaria mentindo. Nenhuma das duas e 'Inclua ao menos um item', que e a recusa
      // do caminho NF e nao explica nada ao operador do pedido.
      if (!linhasDoPedido.length) {
        throw Object.assign(new Error(
          `Pedido de compra ${pedido.numero} não tem itens lançados no módulo Compras`,
        ), { status: 400 });
      }
      const comSaldo = linhasDoPedido.filter((l) => l.saldo > 0);
      if (!comSaldo.length) {
        throw Object.assign(new Error(
          `Pedido de compra ${pedido.numero} já foi recebido por completo`,
        ), { status: 400 });
      }
      // RN-25, caminho SEM `itens` (o que a tela usa hoje): o item nasce do SALDO, e nao da
      // quantidade original. Antes nascia `esperada = recebida = quantidade` — um pedido de 10 com
      // 6 ja recebidos gerava um recebimento de 10/10, e o `/conferir` da Etapa 36 passava a medir
      // a contagem contra o pedido INTEIRO: recebimento parcial era impossivel de registrar certo.
      itens = comSaldo.map((l) => ({
        material_id: l.material_id,
        pedido_item_id: l.id,
        quantidade: l.saldo,
        quantidade_esperada: l.saldo,
        quantidade_recebida: l.saldo,
        valor_unitario: l.valor_unitario || 0,
        valor_total: l.saldo * (l.valor_unitario || 0),
      }));
      resolvidos = comSaldo.map((l, indice) => ({ indice, linha: l, recebida: l.saldo }));
    } else if (linhasDoPedido.length) {
      // (Fase 2) O caminho COM `itens` e o que a TELA usa depois da T5, e o unico em que o payload
      // traz `quantidade_esperada`. A esperada GRAVADA tem de ser o SALDO e nao o payload: a
      // barreira da Etapa 36 no `/conferir`/`/fiscal` compara a contagem com a ESPERADA GRAVADA,
      // entao uma esperada vinda do payload a desligaria EM SILENCIO (mandar 99 aceitaria qualquer
      // contagem depois). A recebida declarada e lida ANTES da troca, pelo mesmo motivo.
      resolvidos = itens.map((item, indice) => ({
        indice,
        linha: resolverLinhaDoPedido(item, linhasDoPedido),
        recebida: recebidaDeclaradaNoPayload(item),
      }));
      itens = itens.map((item, indice) => {
        const { linha } = resolvidos[indice];
        // Linha quitada (saldo 0) nao tem saldo a congelar, e gravar `quantidade_esperada = 0`
        // seria pior que nao gravar: o `||` do INSERT abaixo leria 0 como "campo ausente".
        if (!linha || !(linha.saldo > 0)) return item;
        return { ...item, quantidade_esperada: linha.saldo };
      });
    }
  }

  if (!itens.length) throw Object.assign(new Error('Inclua ao menos um item'), { status: 400 });

  // RN-12 (Etapa 36): DEPOIS de resolver o pedido (e ele quem traz o fornecedor quando o
  // recebimento nasce de um PEDIDO_COMPRA) e ANTES do `inserirComNumeroUnico` — se a guarda
  // rodasse depois, o INSERT do cabecalho ja teria gravado e o `throw` deixaria o documento
  // duplicado no banco (nao ha transacao neste modulo). Os tres identificadores sao os MESMOS
  // valores efetivos que o INSERT abaixo grava.
  await assertNotaNaoDuplicada(db, {
    nota_fiscal,
    fornecedor_id: pedido?.fornecedor_id || fornecedor_id || null,
    fornecedor_cnpj: pedido?.fornecedor_cnpj || fornecedor_cnpj || null,
    fornecedor_nome: pedido?.fornecedor_nome || fornecedor_nome || null,
  });

  // RN-18, TERCEIRA porta (fix-round 2, F5): o item NASCE com `quantidade_recebida`, e ate aqui
  // ninguem checava — a regra da barreira "so o AUMENTO sobre a gravada" tirou o bloqueio
  // ACIDENTAL que o `/fiscal` fazia, e a RN-18 passou a ser contornavel por um payload de criacao.
  // ANTES do INSERT do cabecalho, DEPOIS da guarda de NF (que mantem a precedencia do 409).
  // ⚠️ Mede o payload CRU (`itensInput`), e nao `itens`: no caminho do pedido a esperada de `itens`
  // ja foi trocada pelo SALDO, e comparar contra ela barraria um recebimento LEGITIMO de duas
  // linhas do mesmo material (saldo agregado 10 dividido em 6 e 4 — a regua do pedido, abaixo, e
  // quem julga esse caso). O que esta barreira mede continua sendo o que a Etapa 36 mediu: a
  // coerencia do payload consigo mesmo, com `#` = POSICAO no payload. No caminho SEM `itens`
  // `itensInput` e vazio, e nao ha payload de item nenhum a medir.
  const excedentesDaCriacao = assertExcedenteNaCriacaoPermitido(user, itensInput || [], data.autorizar_excedente === true);

  // RN-20/RN-21 (Etapa 37) — a SEGUNDA comparacao da criacao, e ela nao substitui a de cima: a da
  // 36 mede o documento contra a esperada que ele mesmo declarou; esta mede contra o SALDO DO
  // PEDIDO DE COMPRA, agregado por material. Antes desta linha, `POST` de 999 contra um pedido de
  // 10 entrava com 201, porque a unica referencia do excedente era o numero que o operador digitou.
  // ANTES do `inserirComNumeroUnico`, DEPOIS da guarda de NF (que mantem a precedencia do 409).
  const excedentesDoPedido = assertSaldoDoPedidoPermitido(user, resolvidos, linhasDoPedido,
    data.autorizar_excedente === true);

  // Etapa 31 (RN-07): o numero nasce DENTRO do gerador, na tentativa que vencer o UNIQUE, e e ele
  // que volta no `return` daqui. O `fn` contem SO o INSERT do cabecalho — os itens sao inseridos
  // DEPOIS, e entrariam em duplicata se estivessem aqui dentro quando o retry disparasse.
  const { numero, resultado: r } = await inserirComNumeroUnico(db, 'REC', (num) => dbRun(db,
    `INSERT INTO recebimentos_material_almoxarifado
    (numero, pedido_compra_id, pedido_compra_numero, tipo_recebimento, nota_fiscal,
     fornecedor_id, fornecedor_nome, fornecedor_cnpj, status, etapa_atual,
     responsavel_id, responsavel_nome, observacoes)
    VALUES (?,?,?,?,?,?,?,?,'RECEBIDO','ALMOXARIFADO',?,?,?)`, [
    num,
    pedido?.id || pedido_compra_id || null,
    pedido?.numero || pedido_compra_numero || null,
    tipo,
    nota_fiscal || null,
    pedido?.fornecedor_id || fornecedor_id || null,
    pedido?.fornecedor_nome || fornecedor_nome || null,
    pedido?.fornecedor_cnpj || fornecedor_cnpj || null,
    user.id, user.nome || user.email, observacoes || null,
  ]));

  // (F5) O id de cada item inserido, por POSICAO no payload: e o que deixa a trilha do excedente
  // autorizado nascer com o id REAL do item, e nao com a posicao que a literal do 400 usa.
  const idsPorIndice = [];
  for (const [indice, item] of itens.entries()) {
    const qtd = item.quantidade_esperada || item.quantidade;
    const vUnit = parseFloat(item.valor_unitario) || 0;
    const vTotal = parseFloat(item.valor_total) || (qtd * vUnit);
    // (Etapa 37) `pedido_item_id` sai de `resolvidos`, NUNCA de `item.pedido_item_id`: e o link que
    // a Task 3 usa para somar na linha certa, e deixar o id do payload chegar ao INSERT faria a
    // contagem cair na linha de outro pedido. Sem linha resolvida, `null` — item fora do pedido
    // (decisao 9) nao inventa link.
    const linhaResolvida = resolvidos[indice] && resolvidos[indice].linha;
    const ins = await dbRun(db, `INSERT INTO recebimentos_material_itens_almoxarifado
      (recebimento_id, material_id, pedido_item_id, quantidade_esperada, quantidade_recebida,
       lote, series, observacoes,
       valor_unitario, valor_total, valor_icms, valor_ipi, reducao_icms_percent)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`, [
      r.lastID, item.material_id, linhaResolvida ? linhaResolvida.id : null, qtd,
      item.quantidade_recebida || qtd, item.lote || null, item.series || null, item.observacoes || null,
      vUnit, vTotal, parseFloat(item.valor_icms) || 0, parseFloat(item.valor_ipi) || 0,
      parseFloat(item.reducao_icms_percent) || 0,
    ]);
    idsPorIndice[indice] = ins.lastID;
  }

  // (F5) A trilha DEPOIS do INSERT, e nao dentro da barreira: antes do INSERT o item nao tem id, e
  // auditar a posicao do payload deixaria `entidade_id` apontando para lugar nenhum.
  for (const ex of excedentesDaCriacao) {
    await auditarExcedenteAutorizado(db, user, idsPorIndice[ex.indice], ex);
  }

  // (Etapa 37) A trilha do excedente CONTRA O PEDIDO, uma linha por item excedente, DEPOIS dos
  // INSERT (antes do INSERT o item nao tem id, e auditar a posicao do payload deixaria
  // `entidade_id` apontando para lugar nenhum). Verbo e entidade sao os MESMOS da Etapa 36 — os
  // rotulos ja existem em `auditLabels.js` e esta etapa nao os toca.
  // `dados_anteriores` guarda `saldo_pedido` e nao `quantidade_esperada`: a medida desta porta e
  // outra, e chamar as duas pelo mesmo nome faria a leitura da trilha mentir sobre o que foi
  // comparado. Por isso NAO reusa `auditarExcedenteAutorizado`.
  for (const ex of excedentesDoPedido) {
    for (const indice of ex.indices) {
      await registrarAuditoria(db, {
        entidade: 'recebimento_item', entidade_id: idsPorIndice[indice],
        acao: 'EXCEDENTE_AUTORIZADO',
        usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
        dados_anteriores: { saldo_pedido: ex.saldoMaterial },
        dados_novos: { quantidade_recebida: resolvidos[indice].recebida },
      });
    }
  }

  await registrarAuditoria(db, {
    entidade: 'recebimento', entidade_id: r.lastID, acao: 'CRIACAO',
    usuario_id: user.id, usuario_nome: user.nome || user.email,
  });
  return { id: r.lastID, numero, status: STATUS.RECEBIDO };
}

/**
 * RN-18 — as DUAS recusas e a trilha, em UM lugar para as TRES portas (criacao, conferencia e
 * fiscal). Escritas de novo em cada porta, divergiriam na primeira edicao e o operador veria texto
 * diferente dependendo de qual porta recusou — foi o que aconteceu com a literal do F3, que estava
 * copiada em cinco lugares.
 *
 * `referencia` e o id do item nas portas de UPDATE e a POSICAO no payload (1-based) na criacao,
 * onde o item ainda nao existe. Quem chama diz qual; a frase e a mesma.
 *
 * (F3) A literal NOMEIA quem autoriza em vez de mandar marcar a caixa: quem mais toma este 400 e o
 * ALMOXARIFE, e ele NUNCA ve a caixa — ela e escondida por `pode('autorizar_excedente')` e a acao e
 * de [ADMINISTRADOR, COMPRAS]. A instrucao antiga mandava um gesto impossivel.
 */
// (Etapa 37) O SUFIXO e UMA constante para as TRES portas. Escrito de novo no 400 do saldo, o F3
// se repetiria: a instrucao ao operador divergiria entre as portas na primeira edicao, e foi
// exatamente por estar copiada em cinco lugares que ela precisou de um fix-round.
const SUFIXO_AUTORIZACAO_EXCEDENTE = ' — a autorização de excedente é de Compras ou do Administrador';

const mensagemExcedenteSemFlag = (recebida, esperada, referencia) => `Quantidade recebida `
  + `(${recebida}) maior que a esperada (${esperada}) no item #${referencia}`
  + SUFIXO_AUTORIZACAO_EXCEDENTE;

/**
 * (Etapa 37, RN-20) O 400 do caminho do PEDIDO tem literal PROPRIA, e isso e decisao (a 10 do
 * design). A da Etapa 36 diz "maior que a esperada (10) no item #58": no `POST` nao existe id de
 * item (nada foi inserido ainda) e "esperada" nao e o que se esta medindo — a medida e o SALDO do
 * pedido de compra, agregado por material.
 * DESCARTADO parametrizar a literal da 36 com dois buracos ("no item #x" / "para o material y"):
 * uma frase com dois buracos para dizer duas coisas diferentes fica pior de ler nas duas portas, e
 * a regua deixaria de poder afirmar texto literal.
 */
const mensagemAcimaDoSaldoDoPedido = (recebida, saldo, codigo) => `Quantidade recebida `
  + `(${recebida}) maior que o saldo do pedido (${saldo}) para o material ${codigo}`
  + SUFIXO_AUTORIZACAO_EXCEDENTE;

/**
 * (Etapa 37, decisao 7) A metade DECISORIA, compartilhada pelas TRES portas: a INTENCAO (a flag) e
 * a AUTORIDADE (a acao). Só a metade, e nao a funcao inteira: `assertExcedentePermitido` compara o
 * payload com a linha JA GRAVADA e e INALCANCAVEL no `POST` por construcao (medido na Fase 0 — no
 * `POST` os itens ainda nao existem, e ela da `continue`). Cada porta COLETA os excedentes e
 * formata o PROPRIO 400, porque "excedente" mede coisas diferentes em cada uma — contra a esperada
 * do item (36) e contra o saldo do pedido (37).
 *
 * O 403, ao contrario, e o MESMO fato nas tres portas ("voce nao tem a acao"), e por isso a literal
 * mora AQUI, em UM lugar: mudar uma palavra dela derruba o teste da Etapa 36 E o da 37 ao mesmo
 * tempo, que e a prova EXECUTADA de que o reuso existe (sabotagem 3 da Task 2).
 */
function assertAutorizacaoExcedente(user, autorizado, mensagem400) {
  if (!autorizado) throw Object.assign(new Error(mensagem400), { status: 400 });
  if (!can(user, 'autorizar_excedente')) {
    throw Object.assign(new Error(
      'Autorizar recebimento acima do pedido exige a permissão "autorizar_excedente"'
      + ` (seu perfil: ${getPerfilFromUser(user)}).`), { status: 403 });
  }
}

const auditarExcedenteAutorizado = (db, user, itemId, { esperada, recebida }) => registrarAuditoria(db, {
  entidade: 'recebimento_item', entidade_id: itemId, acao: 'EXCEDENTE_AUTORIZADO',
  usuario_id: user?.id, usuario_nome: user?.nome || user?.email,
  dados_anteriores: { quantidade_esperada: esperada },
  dados_novos: { quantidade_recebida: recebida },
});

/**
 * RN-18 (Etapa 36) — recebimento acima do esperado exige autorizacao EXPLICITA e PERMISSAO.
 *
 * Medido por sonda na Fase 0: `quantidade_esperada: 10, quantidade_recebida: 999` entrava com 201 e
 * era gravado. O motor de DETECCAO ja existia inteiro (`alertRegistry.listarDivergenciasRecebimento`
 * + `avisarDivergenciasDoRecebimento` nos dois escritores); o que nao existia era a BARREIRA.
 *
 * Duas condicoes, e as duas importam: a flag e a INTENCAO ("eu sei que estou recebendo a mais"), a
 * permissao e a AUTORIDADE. Só a flag foi descartado no design: flag que qualquer perfil liga nao e
 * barreira, e formulario — o mesmo usuario que digita 999 marca a caixa.
 *
 * Chamada ANTES de qualquer UPDATE nas DUAS portas: nao ha transacao neste modulo, entao recusar
 * depois de gravar deixaria o excedente no banco com um 400 por cima (o mesmo defeito que a
 * sabotagem 3 da Task 2 mede na guarda de NF duplicada).
 *
 * `parseFloat` + `Number.isFinite`, e nao `Number(...)`: item sem o campo (o caso do COALESCE
 * abaixo) e item com `''` nao podem ser lidos como ZERO — `Number('')` e 0, e 0 > 10 e falso por
 * acidente, nao por regra. O `continue` do `== null` e o que deixa o payload parcial passar.
 *
 * A barreira exige AUMENTO (revisao final, F1 + R2): barra o item quando `recebida > esperada`
 * **E** `recebida > quantidade_recebida GRAVADA`. Ecoar a quantidade que ja esta no banco nao e
 * ato novo de autorizacao (ou ela foi autorizada e auditada quando entrou, ou e acervo anterior a
 * esta etapa), e BAIXAR um excedente ja registrado nao pede autorizacao nenhuma. `> gravada`, e
 * nao `!== gravada`: corrigir 25 para 20 num item de 10 esperados continua acima do pedido e
 * continua sendo uma correcao para baixo.
 *
 * Sem isso, as DUAS telas travavam depois do primeiro excedente autorizado, porque as duas
 * reenviam a quantidade JA GRAVADA de todos os itens que tem o campo preenchido e nenhuma manda
 * `autorizar_excedente` fora da caixa da conferencia: (a) o modal de NF ficava preso em 400 para
 * sempre — nao tem campo de quantidade nem caixa —, e o `processar` seguinte morria em
 * `validarDadosProcessamento`; (b) na conferencia, o ALMOXARIFE nao conseguia mais salvar a
 * contagem de NENHUM outro item do documento, e COMPRAS/ADMIN, remarcando a caixa para escapar do
 * 400, gravavam uma linha nova de EXCEDENTE_AUTORIZADO A CADA SAVE. Como a trilha so e escrita
 * quando a barreira DISPAROU, exigir aumento tambem conserta a auditoria inflada.
 */
async function assertExcedentePermitido(db, user, recebimentoId, itens, autorizado) {
  const excedentes = [];
  for (const item of itens || []) {
    if (item.quantidade_recebida == null) continue;
    const atual = await dbGet(db, `SELECT id, quantidade_esperada, quantidade_recebida
      FROM recebimentos_material_itens_almoxarifado WHERE id = ? AND recebimento_id = ?`,
    [item.id, recebimentoId]);
    if (!atual) continue;
    const recebida = parseFloat(item.quantidade_recebida);
    const esperada = parseFloat(atual.quantidade_esperada);
    const gravada = parseFloat(atual.quantidade_recebida);
    // Coluna vazia (ou texto) NAO e "zero gravado": sem numero no banco nao existe "aumento sobre
    // o que ja esta registrado", e a barreira volta a depender so de `recebida > esperada`.
    const aumenta = !Number.isFinite(gravada) || recebida > gravada;
    if (Number.isFinite(recebida) && Number.isFinite(esperada) && recebida > esperada && aumenta) {
      excedentes.push({ id: atual.id, recebida, esperada });
    }
  }
  if (!excedentes.length) return;

  const e = excedentes[0];
  assertAutorizacaoExcedente(user, autorizado,
    mensagemExcedenteSemFlag(e.recebida, e.esperada, e.id));
  for (const ex of excedentes) {
    await auditarExcedenteAutorizado(db, user, ex.id, ex);
  }
}

/**
 * RN-18 na TERCEIRA porta (fix-round 2, F5) — o item NASCE com a quantidade recebida.
 *
 * `criarRecebimento` grava `quantidade_recebida = item.quantidade_recebida || qtd` e nunca chamou
 * a barreira: a RN-18 tinha duas portas, nao tres. Antes da onda de correcao, a barreira do
 * `/fiscal` parava esse documento por ACIDENTE — qualquer edicao fiscal reenviava 999 sobre uma
 * esperada de 10 e tomava 400 (era exatamente o F1, o defeito que TRAVAVA o documento). Com a
 * regra correta (barra so o AUMENTO sobre a quantidade gravada), ecoar deixou de barrar e o
 * bloqueio acidental caiu junto: medido por sonda, um POST como ALMOXARIFE com
 * `quantidade: 10, quantidade_recebida: 999` entrava com 201, sem trilha, e depois atravessava
 * `/fiscal`, `/conferir` e `finalizar_conferencia` com 200. Nao e alcancavel pela TELA
 * (`handleCriar` manda `quantidade_recebida = quantidade`) — basta um payload de API.
 *
 * ⚠️ Na criacao NAO EXISTE id de item, e o `#` da literal leva a POSICAO DO ITEM NO PAYLOAD
 * (1-based) — a unica referencia que quem chamou tem. E a MESMA literal das outras portas (os
 * helpers acima existem para isso: escrita de novo aqui, ela divergiria na primeira edicao).
 *
 * Roda ANTES do INSERT (nao ha transacao neste modulo, entao recusar depois deixaria o documento
 * gravado com um 400 por cima) e DEVOLVE os excedentes para `criarRecebimento` auditar DEPOIS do
 * INSERT, quando o item ja tem id real. Auditar aqui gravaria a posicao no lugar do id.
 */
function assertExcedenteNaCriacaoPermitido(user, itens, autorizado) {
  const excedentes = [];
  (itens || []).forEach((item, i) => {
    if (item.quantidade_recebida == null) return;
    const recebida = parseFloat(item.quantidade_recebida);
    // A esperada EFETIVA e a mesma expressao que o INSERT abaixo usa (`quantidade_esperada ||
    // quantidade`): comparar com outra coisa barraria um item e gravaria outro.
    const esperada = parseFloat(item.quantidade_esperada || item.quantidade);
    if (Number.isFinite(recebida) && Number.isFinite(esperada) && recebida > esperada) {
      excedentes.push({ indice: i, posicao: i + 1, recebida, esperada });
    }
  });
  if (!excedentes.length) return excedentes;

  const e = excedentes[0];
  assertAutorizacaoExcedente(user, autorizado,
    mensagemExcedenteSemFlag(e.recebida, e.esperada, e.posicao));
  return excedentes;
}

/**
 * RN-20 (Etapa 37) — o SALDO de cada linha do pedido de compra.
 *
 * `saldo = quantidade - COALESCE(quantidade_recebida, 0)`, e o `COALESCE` em JS (`Number.isFinite`)
 * pelo mesmo motivo do SQL: producao pode ter linha com `quantidade_recebida` NULL (anterior ao
 * ALTER da Task 1), e `10 - null` viraria `NaN` — com `NaN` toda comparacao e falsa e a barreira
 * ficaria DESLIGADA em silencio, exatamente na linha mais antiga do acervo.
 *
 * Ordenado por `id` porque a resolucao da linha (abaixo) e "menor id primeiro", e
 * `carregarItensPedidoCompra` nao tem `ORDER BY` — ordenar aqui evita mudar a query compartilhada.
 * "Linhas lancadas" aqui sao as linhas COM material: `carregarItensPedidoCompra` filtra as sem
 * `material_id` (sem material nao ha o que dar entrada no estoque), e e o mesmo filtro do resto do
 * modulo.
 */
async function saldoDasLinhasDoPedido(db, pedidoId) {
  const linhas = await carregarItensPedidoCompra(db, pedidoId);
  return linhas
    .map((l) => {
      const pedida = parseFloat(l.quantidade);
      const recebida = parseFloat(l.quantidade_recebida);
      return {
        ...l,
        saldo: (Number.isFinite(pedida) ? pedida : 0) - (Number.isFinite(recebida) ? recebida : 0),
      };
    })
    .sort((a, b) => a.id - b.id);
}

/**
 * Decisao 9 + risco R5 — o SERVIDOR escolhe a linha do pedido; o payload nunca decide.
 *
 * `pedido_item_id` do payload vale se, e SO SE, ele pertence ao pedido resolvido — um id de outra
 * linha (ou de outro pedido) escolheria a linha errada e a Task 3 somaria no pedido alheio. Senao:
 * a linha do mesmo material com menor id e saldo > 0; senao a linha do mesmo material com menor
 * id; sem linha nenhuma, `null` — e ai o item mantem o que o payload mandou e NAO tem regua de
 * saldo (decisao 9: material fora do pedido e caso legitimo, e recusa-lo e regra NOVA).
 *
 * Omitir o campo tambem nao contorna nada, porque a regua e o saldo AGREGADO POR MATERIAL: o id do
 * payload nunca decide se o `POST` passa.
 */
function resolverLinhaDoPedido(item, linhas) {
  if (item.pedido_item_id != null) {
    const daqui = linhas.find((l) => Number(l.id) === Number(item.pedido_item_id));
    if (daqui) return daqui;
  }
  const doMaterial = linhas.filter((l) => Number(l.material_id) === Number(item.material_id));
  if (!doMaterial.length) return null;
  return doMaterial.find((l) => l.saldo > 0) || doMaterial[0];
}

/**
 * RN-20/RN-21 (Etapa 37) — a regua do `POST` contra o saldo do pedido, AGREGADA POR MATERIAL.
 *
 * Decisao 3: agregada, e nao por linha. Duas linhas do mesmo material no mesmo pedido (precos ou
 * prazos diferentes, caso legitimo) fariam um recebimento LEGITIMO tomar 400 so por o operador ter
 * digitado na "linha errada". O saldo do material e a soma do saldo de TODAS as linhas dele no
 * pedido, e a recebida e a soma do que o payload declarou para aquele material.
 *
 * A recebida DECLARADA vem do payload cru (`quantidade_recebida`, senao `quantidade_esperada`,
 * senao `quantidade`) e e medida ANTES de a esperada ser trocada pelo saldo: medir depois faria um
 * payload de `quantidade: 999` sem `quantidade_recebida` ser silenciosamente reduzido ao saldo em
 * vez de recusado.
 *
 * Roda ANTES de `inserirComNumeroUnico` (nao ha transacao neste modulo: recusar depois deixaria o
 * documento gravado com um 400 por cima) e DEVOLVE os excedentes para `criarRecebimento` auditar
 * DEPOIS dos INSERT, quando o item ja tem id real.
 */
function assertSaldoDoPedidoPermitido(user, resolvidos, linhas, autorizado) {
  const porMaterial = new Map();
  for (const r of resolvidos) {
    if (!r.linha) continue;
    const chave = String(r.linha.material_id);
    const g = porMaterial.get(chave) || { recebidaTotal: 0, indices: [] };
    g.recebidaTotal += r.recebida;
    g.indices.push(r.indice);
    porMaterial.set(chave, g);
  }

  const excedentes = [];
  for (const [chave, grupo] of porMaterial) {
    const doMaterial = linhas.filter((l) => String(l.material_id) === chave);
    const saldoMaterial = doMaterial.reduce((s, l) => s + l.saldo, 0);
    const { recebidaTotal } = grupo;
    if (recebidaTotal > saldoMaterial) {
      // O codigo que o operador reconhece: o do cadastro do material, senao o que o Compras
      // digitou na linha do pedido, senao o id — nunca uma mensagem sem referencia nenhuma.
      const codigo = doMaterial[0].material_codigo || doMaterial[0].codigo || `#${chave}`;
      excedentes.push({
        codigo, recebidaTotal, saldoMaterial, indices: grupo.indices,
      });
    }
  }
  if (!excedentes.length) return excedentes;

  const e = excedentes[0];
  assertAutorizacaoExcedente(user, autorizado,
    mensagemAcimaDoSaldoDoPedido(e.recebidaTotal, e.saldoMaterial, e.codigo));
  return excedentes;
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

  // RN-18: a PRIMEIRA porta. Antes do UPDATE de status e do UPDATE de item — recusar depois de
  // gravar deixaria o documento meio escrito com um 400 por cima.
  await assertExcedentePermitido(db, user, recebimentoId, itens, data.autorizar_excedente === true);

  if (status) {
    const etapa = STATUS_ETAPA[status] || ETAPAS.ALMOXARIFADO;
    await dbRun(db, `UPDATE recebimentos_material_almoxarifado
      SET status = ?, etapa_atual = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
      [status, etapa, recebimentoId]);
  }

  if (itens) {
    for (const item of itens) {
      // Etapa 36 (T3): as CINCO colunas com COALESCE, no molde ja escrito em `salvarDadosFiscal`.
      // Esta rota esta ganhando o PRIMEIRO chamador da vida (o painel de conferencia da T5), e
      // enquanto ela nao tinha chamador o defeito ficou invisivel: com `quantidade_recebida = ?` e
      // `observacoes = ?`, um item enviado SEM esses campos APAGAVA os dois (medido por sonda: a
      // coluna ia a `null`, e 200 na resposta). Duas colunas, nao uma. Os booleanos so viram 0/1
      // quando VIERAM (`!= null`), senao `false` e `ausente` seriam a mesma coisa e qualquer
      // chamada parcial zeraria o que a conferencia anterior marcou.
      await dbRun(db, `UPDATE recebimentos_material_itens_almoxarifado SET
        quantidade_recebida = COALESCE(?, quantidade_recebida),
        conferencia_quantidade = COALESCE(?, conferencia_quantidade),
        conferencia_descricao = COALESCE(?, conferencia_descricao),
        observacoes = COALESCE(?, observacoes),
        series = COALESCE(?, series)
        WHERE id = ? AND recebimento_id = ?`, [
        item.quantidade_recebida ?? null,
        item.conferencia_quantidade != null ? (item.conferencia_quantidade ? 1 : 0) : null,
        item.conferencia_descricao != null ? (item.conferencia_descricao ? 1 : 0) : null,
        item.observacoes ?? null,
        item.series ?? null,
        item.id, recebimentoId,
      ]);
    }
  }

  await avisarDivergenciasDoRecebimento(db, recebimentoId);

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

  // RN-14 (Etapa 36): a SEGUNDA porta. Roda DEPOIS de `resolverPedidoCompra` e ANTES do UPDATE,
  // com `recebimentoId` — que exclui o proprio documento, senao salvar os dados fiscais duas vezes
  // com a PROPRIA nota se autoacusaria com 409.
  // Os valores olhados sao os EFETIVOS do UPDATE abaixo, que usa COALESCE: um `PUT` que manda so a
  // NF herda o fornecedor DO REGISTRO (`rec`), e e esse o caso mais comum da tela — comparar com o
  // que veio no body deixaria passar exatamente a duplicata mais provavel. Mesmo motivo para a NF:
  // sem o `?? rec.nota_fiscal`, um PUT que nao manda NF cairia no `if (!nf) return`.
  await assertNotaNaoDuplicada(db, {
    nota_fiscal: nota_fiscal ?? rec.nota_fiscal,
    fornecedor_id: pedido?.fornecedor_id ?? fornecedor_id ?? rec.fornecedor_id,
    fornecedor_cnpj: pedido?.fornecedor_cnpj ?? fornecedor_cnpj ?? rec.fornecedor_cnpj,
    fornecedor_nome: pedido?.fornecedor_nome ?? fornecedor_nome ?? rec.fornecedor_nome,
  }, recebimentoId);

  // RN-18 (Etapa 36): a SEGUNDA porta, e a que a UI de producao realmente usa para escrever
  // quantidade (o mesmo motivo que colocou o gancho de divergencia nos dois escritores na Etapa
  // 17). ANTES do UPDATE do cabecalho: recusar depois gravaria os dados fiscais e devolveria 400.
  // A regra de AUMENTO (F1 + R2) mora dentro de `assertExcedentePermitido` e vale nas duas portas:
  // o modal de NF nao tem campo de quantidade nem caixa de autorizacao, e reenvia a quantidade de
  // TODOS os itens.
  await assertExcedentePermitido(db, user, recebimentoId, itens, data.autorizar_excedente === true);

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

  await avisarDivergenciasDoRecebimento(db, recebimentoId);

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
      m.tipo_material, m.localizacao_padrao_id,
      -- Etapa 8: o dono do material entra na pre-checagem (recebimento de material de cliente
      -- exige numero de documento) e a razao social entra na MENSAGEM de recusa.
      m.proprietario_cliente_id, cli.razao_social as proprietario_cliente_nome
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN materiais_almoxarifado m ON ri.material_id = m.id
    LEFT JOIN clientes cli ON m.proprietario_cliente_id = cli.id
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
    // Etapa 8, decisao 8: material de cliente entra pelo Recebimento normal — a nota de remessa
    // e o campo de nota que ja existe. O que muda e que para ele o documento e OBRIGATORIO: e o
    // papel que prova que a chapa chegou, de quem, e em que quantidade. Material NOSSO continua
    // podendo entrar sem nota (entrada manual, devolucao, ajuste de inventario) — travar isso
    // para todo mundo quebraria todo recebimento do modulo, e ha teste de controle positivo
    // exatamente para prender essa metade da guarda.
    // Projeto NAO e exigido aqui: o mesmo cliente manda a mesma chapa para dois projetos, e
    // exigir projeto na entrada obrigaria a criar dois materiais identicos para o mesmo item
    // fisico do mesmo dono. O projeto e exigido na SAIDA (ownerRules.assertSaidaPermitida).
    if (item.proprietario_cliente_id && !(rec.nota_fiscal && String(rec.nota_fiscal).trim())) {
      problemas.push(`${item.material_codigo}: material do cliente `
        + `${item.proprietario_cliente_nome || `#${item.proprietario_cliente_id}`} exige numero de `
        + 'documento (nota de remessa) para dar entrada');
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

        const numerosSerie = parseSeries(item.series);

        await registrarMovimentacao(db, user, {
          material_id: item.material_id,
          tipo: 'ENTRADA_COMPRA',
          quantidade: qtd,
          // Etapa 8c, decisao 5 do design: o custo do item da nota passa a ALIMENTAR o custo medio.
          //
          // Ate aqui o recebimento gravava valor_unitario/valor_total na linha do item (linha ~112)
          // e NAO os passava adiante, entao o unico caminho que movia custo_medio no sistema
          // inteiro era a movimentacao manual com custo digitado a mao. A Etapa 8c rateia o custo
          // da chapa entre as pecas cortadas — com o custo medio quase nunca alimentado, o rateio
          // distribuiria R$ 0,00, a conta fecharia (zero = zero) e o resultado seria inutil.
          //
          // `|| undefined` NAO e cosmetico e tem teste bilateral: nota SEM valor e caso normal
          // (conserto, amostra, brinde, material de cliente). O motor so mexe em custo quando
          // `custoInformado > 0` (stockService.js:1031); mandar 0 cai no ramo `else` (:1043) e o
          // custo fica intocado — que e o comportamento certo. Mandar `undefined` explicitamente
          // deixa isso legivel em vez de depender de o motor tratar o 0. A GUARDA REAL, porem, e a
          // do motor: sabotar esta condicional para passar o custo cegamente NAO derruba nenhum
          // teste (sabotagem S2 da Task 2), porque quem recusa o 0 e o `custoInformado > 0`.
          //
          // MUDANCA DE COMPORTAMENTO DECLARADA: material recebido por NF passa a ter custo medio
          // real, e vale SO daqui para frente. NAO ha backfill: recalcular custo medio retroativo
          // exigiria o custo POR MOVIMENTO, e movimentacoes_almoxarifado nao tem nenhuma coluna de
          // custo (schema.js:205-219).
          custo_unitario: (parseFloat(item.valor_unitario) || 0) > 0
            ? parseFloat(item.valor_unitario)
            : undefined,
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
          series: numerosSerie,
        // O recebimento E um dos caminhos onde o operador tem como informar o lote (a tela tem os
        // campos Lote/Validade/Fabricacao/Corrida por item), entao a exigencia de `controle_lote`
        // vale aqui. A pre-checagem acima ja recusou a nota inteira nesse caso — esta declaracao
        // e a rede: se um item escapar da pre-checagem, o motor ainda barra. Mesma logica para
        // `exigeSerie`: o recebimento e um caminho onde o operador tem como informar as series.
        }, { exigeLote: true, exigeSerie: true });
        entrouFisicamente = true;

        // Griffa a origem (Etapa 6b, Task 6, fix round 1 do review): as series que o motor acabou
        // de criar/reativar para este material ainda nao sabem de qual recebimento/item elas
        // vieram (o motor so grava movimentacao_entrada_id). Casa por numero+material — o unico
        // jeito de saber QUAIS linhas de series_almoxarifado pertencem a ESTE item, ja que
        // series_almoxarifado nao tem FK direta para recebimentos_material_itens_almoxarifado no
        // momento da criacao.
        //
        // Gate por `item.controle_serie` (achado do review por sonda): sem ele, um item de
        // material SEM controle de serie mas com texto residual no campo `series` (ex.: colado
        // por engano, ou sobra de quando o material tinha controle_serie ligado) reescrevia
        // recebimento_id/recebimento_item_id de series ORFAS/antigas daquele material que o motor
        // nem tocou nesta chamada — corrupcao silenciosa de rastreabilidade.
        //
        // Roda DEPOIS de `entrouFisicamente = true` de proposito: o motor precisa ter criado as
        // series antes de poder griffa-las. Por isso, se este UPDATE falhar, e tratado como
        // NAO-FATAL (nao rethrow): devolver o claim `entrada_estoque_em` aqui reabriria o item
        // para reprocessamento, e a segunda passada chamaria o motor de novo com as MESMAS series
        // ja EM_ESTOQUE — o motor recusa ("serie ja esta em estoque") e o item ficaria travado
        // para sempre, sem nenhum jeito de sair pelo fluxo normal. Preferimos perder a
        // rastreabilidade de origem de 1 item numa falha rara de UPDATE (reparavel por SQL manual
        // depois) a travar o recebimento inteiro por causa dela.
        if (item.controle_serie && numerosSerie.length > 0) {
          try {
            await dbRun(db, `UPDATE series_almoxarifado
                SET recebimento_id = ?, recebimento_item_id = ?
              WHERE material_id = ? AND numero IN (${numerosSerie.map(() => '?').join(',')})`,
              [recebimentoId, item.id, item.material_id, ...numerosSerie]);
          } catch (eGriffagem) {
            console.warn(`[recebimento] griffagem de origem da serie falhou (item ${item.id}, `
              + `recebimento ${recebimentoId}): ${eGriffagem.message}`);
          }
        }

        // (Etapa 37, RN-22) O PEDIDO DE COMPRA passa a saber o que chegou. `itens_pedido_compra`
        // tinha 8 colunas, 1 leitor e ZERO escritores: um pedido de 10 recebeu 25 em tres
        // recebimentos e continuou `ABERTO` com `quantidade = 10` (sonda executada). Este e o
        // escritor.
        //
        // AQUI, e nao em `processarNota`, porque ha DOIS caminhos de entrada fisica:
        // `processarNota` e `aprovarRecebimento` (ramo APROVADO, `POST /recebimentos/:id/aprovar`,
        // que chama esta funcao DIRETO). Somar la deixaria o segundo caminho creditando estoque
        // sem contar ao pedido — e com a suite inteira verde, porque nenhum teste olhava
        // `itens_pedido_compra` depois de processar.
        //
        // DENTRO do claim `entrada_estoque_em IS NULL` e DEPOIS de `entrouFisicamente = true`, de
        // proposito pelos dois lados: fora do claim, reprocessar a mesma nota somaria DE NOVO (o
        // defeito que esta funcao ja pagou — "a 2a tentativa entrou MAIS 10 do A"); antes da
        // entrada fisica, uma falha do motor devolveria a marca (`entrada_estoque_em = NULL`) e o
        // pedido ficaria creditado por material que nunca entrou.
        //
        // `qtd` (= `quantidadeDoItem`) e o MESMO numero que acabou de mover estoque: somar a
        // esperada faria o pedido e o estoque discordarem. `COALESCE` porque producao pode ter
        // linha com `quantidade_recebida` NULL (anterior ao ALTER da Task 1) e `null + 6` em
        // SQLite e NULL — o saldo daquela linha ficaria NULL para sempre, e saldo NULL desliga a
        // barreira do `POST` em silencio.
        //
        // NAO-FATAL, como a griffagem acima e por um motivo proprio: daqui para baixo o `catch`
        // NAO devolve o claim, e o modulo ASSUME que as tabelas de compras podem nao existir
        // (`listarPedidosCompraAux` e `gerarContaPagar` tem guarda de tabela ausente). Um `throw`
        // aqui faria `processarNota` falhar DEPOIS de o estoque ter entrado: o recebimento ficaria
        // fora de PROCESSADO e o reprocessamento PULARIA o item pelo claim — material no estoque,
        // documento travado e o pedido sem contar. Perder a contagem de um pedido com um `warn` e
        // reparavel por SQL; travar a nota nao e.
        if (item.pedido_item_id) {
          try {
            await dbRun(db, `UPDATE itens_pedido_compra
                SET quantidade_recebida = COALESCE(quantidade_recebida, 0) + ?
              WHERE id = ?`, [qtd, item.pedido_item_id]);
          } catch (ePedido) {
            console.warn(`[recebimento] soma no saldo do pedido de compra falhou (item ${item.id}, `
              + `linha do pedido ${item.pedido_item_id}, recebimento ${recebimentoId}): `
              + `${ePedido.message}`);
          }
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

  // RN-03 (D2, Etapa 14): a nota PROCESSADA fecha as solicitacoes VINCULADO do pedido que a
  // originou. Roda DEPOIS do UPDATE que marca PROCESSADO e da auditoria acima, de proposito
  // (padrao RN-01 da E12): falha do gancho NUNCA pode impedir o proprio processamento, que ja
  // aconteceu quando chegamos aqui. Igualmente importante (Fase 2, controle i, medido): rodar
  // DEPOIS de darEntradaEstoque garante que uma falha na entrada de estoque (nota recusada por
  // item invalido, por exemplo) faz processarNota REJEITAR antes de chegar aqui — a solicitacao
  // fica VINCULADO, nao RECEBIDA, porque o recebimento nunca chegou a PROCESSADO de verdade.
  if (rec.pedido_compra_id) {
    try {
      await purchaseService.fecharSolicitacoesDoPedido(db, user, rec.pedido_compra_id);
    } catch (e) {
      console.warn('[almoxarifado-compras] Falha ao fechar solicitacoes do pedido apos processar nota:', e.message);
    }
  }

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

  // RN-03 EMENDADA (Fase 2, C4 — medido): este ramo da entrada no estoque direto para APROVADO
  // SEM passar por processarNota (ex.: recebimento de PEDIDO_COMPRA aprovado por
  // POST /recebimentos/:id/aprovar) — o gancho tem de rodar AQUI TAMBEM, senao a solicitacao
  // nunca fecha por este caminho. O ramo ACIMA que DELEGA para processarNota (linha ~668) NAO
  // chama de novo: o gancho ja rodou la (I6) — chamar aqui tambem duplicaria a tentativa, e so
  // nao duplicaria auditoria porque o `AND status='VINCULADO'` already fechou na 1a chamada.
  if (rec.pedido_compra_id) {
    try {
      await purchaseService.fecharSolicitacoesDoPedido(db, user, rec.pedido_compra_id);
    } catch (e) {
      console.warn('[almoxarifado-compras] Falha ao fechar solicitacoes do pedido apos aprovar recebimento:', e.message);
    }
  }

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

/**
 * `parseFloat` + `Number.isFinite` (e nao `Number(...)`) pelo mesmo motivo de
 * `saldoDasLinhasDoPedido`: producao pode ter `quantidade_recebida` NULL (linha anterior ao ALTER
 * da Task 1) e `10 - null` viraria `NaN` — com `NaN` a situacao derivada seria sempre 'PARCIAL' e
 * o `saldo_pendente` sairia `NaN` no JSON (que `JSON.stringify` escreve como `null`).
 */
function quantidadeFinita(valor) {
  const n = parseFloat(valor);
  return Number.isFinite(n) ? n : 0;
}

/**
 * RN-24 (Etapa 37) — a SITUACAO do pedido de compra, em UMA funcao.
 *
 * `ABERTO` quando nada chegou (INCLUSIVE o pedido cujas linhas o Compras ainda nao lancou:
 * `COUNT(itens_pedido_compra) = 0`, que a RN-24 manda manter visivel); `PARCIAL` quando
 * `0 < recebida < pedida`; `RECEBIDO` quando `pedida > 0 && recebida >= pedida`.
 *
 * `>=` e nao `>` de proposito: a IGUALDADE EXATA e o caso comum (o pedido que chegou inteiro), e
 * com `>` ele ficaria `PARCIAL` para sempre e a tela pediria para receber o que ja chegou. O
 * `pedida > 0` na mesma condicao e o que impede um pedido SEM linhas (0 de 0) de nascer
 * "RECEBIDO" — ele nunca foi recebido, so nao foi lancado.
 *
 * UMA funcao, consumida pelas DUAS rotas de leitura (lista e itens): duas copias divergiriam na
 * primeira edicao, e e a classe de bug que `divergencia.js` existe para matar neste modulo.
 */
function situacaoRecebimentoPedido(quantidadePedida, quantidadeRecebida) {
  const pedida = quantidadeFinita(quantidadePedida);
  const recebida = quantidadeFinita(quantidadeRecebida);
  if (pedida > 0 && recebida >= pedida) return 'RECEBIDO';
  if (recebida <= 0) return 'ABERTO';
  return 'PARCIAL';
}

/**
 * Os quatro campos derivados, num lugar so — e o `Math.max(0, ...)` mora AQUI, para as duas rotas.
 *
 * O clamp NAO e cosmetico: a Task 2 permite excedente autorizado e a Task 3 soma o que ENTROU no
 * estoque, entao uma linha pode terminar com `quantidade_recebida > quantidade` (medido: 12 de 10
 * no cenario (12) de `recebimentoExcedentePedido`, e duas linhas do mesmo material dividindo um
 * recebimento pela regua agregada produzem o mesmo efeito). Sem o clamp a rota devolveria
 * `saldo_pendente: -2`, a tela escreveria "Saldo pendente: -2", a linha VOLTARIA a ser oferecida
 * ao operador (o filtro da rota de itens e `saldo_pendente > 0`) e a assercao da RN-24
 * ("saldo 0 no pedido completado") ficaria falsa exatamente no caso que esta etapa CRIA.
 */
function derivarRecebimentoDoPedido(quantidadePedida, quantidadeRecebida) {
  const pedida = quantidadeFinita(quantidadePedida);
  const recebida = quantidadeFinita(quantidadeRecebida);
  return {
    quantidade_pedida: pedida,
    quantidade_recebida: recebida,
    saldo_pendente: Math.max(0, pedida - recebida),
    situacao_recebimento: situacaoRecebimentoPedido(pedida, recebida),
  };
}

async function listarPedidosCompraAux(db, { search, pendentes } = {}) {
  const tableExists = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos_compra'");
  if (!tableExists) return [];

  // A soma por pedido vem de uma SUBQUERY AGRUPADA, e nao de um `.filter()`/`reduce` em JS depois
  // da consulta, porque o filtro de `?pendentes=1` tem de rodar ANTES do `LIMIT 50` (ver abaixo)
  // — e para isso a soma precisa existir dentro do SQL.
  //
  // `material_id IS NOT NULL` e o MESMO recorte de `carregarItensPedidoCompra`: sem material nao
  // ha o que dar entrada no estoque, e e o recorte que a regua de saldo do `POST` usa. Contar
  // linhas de texto livre aqui faria a rota dizer "PARCIAL" num pedido que ja chegou inteiro.
  let sql = `SELECT p.id, p.numero, p.valor_total, p.status, p.data_pedido,
    f.razao_social as fornecedor_nome, f.cnpj as fornecedor_cnpj,
    COALESCE(i.total_pedido, 0) as total_pedido,
    COALESCE(i.soma_recebida, 0) as soma_recebida
    FROM pedidos_compra p
    LEFT JOIN fornecedores f ON p.fornecedor_id = f.id
    LEFT JOIN (SELECT pedido_id,
        SUM(COALESCE(quantidade, 0)) as total_pedido,
        SUM(COALESCE(quantidade_recebida, 0)) as soma_recebida
      FROM itens_pedido_compra WHERE material_id IS NOT NULL GROUP BY pedido_id) i
      ON i.pedido_id = p.id
    WHERE 1=1`;
  const params = [];
  if (search) {
    sql += ' AND (p.numero LIKE ? OR f.razao_social LIKE ?)';
    params.push(`%${search}%`, `%${search}%`);
  }
  // `?pendentes=1` — a clausula e a NEGACAO da derivacao, escrita no `WHERE`, e a POSICAO dela e
  // contrato, nao detalhe: esta query termina em `ORDER BY p.created_at DESC LIMIT 50`, entao
  // filtrar DEPOIS aplicaria a regua aos 50 pedidos MAIS NOVOS. Num banco onde os 50 mais novos
  // estejam quitados, `?pendentes=1` devolveria `[]` COM pedidos abertos existindo, e a tela
  // ficaria sem o unico pedido que o operador precisa receber (cenario (6) da T4).
  //
  // NAO e `saldo_pendente > 0`: o pedido cujas linhas o Compras ainda nao lancou tem total 0 e
  // saldo 0, e desapareceria — e ele e exatamente o pedido que a RN-24 manda mostrar (`ABERTO`),
  // porque e o que o operador precisa cobrar.
  const apenasPendentes = pendentes === '1' || pendentes === 'true' || pendentes === true;
  if (apenasPendentes) {
    sql += ` AND (i.soma_recebida IS NULL OR i.soma_recebida = 0
      OR i.total_pedido IS NULL OR i.total_pedido = 0
      OR i.soma_recebida < i.total_pedido)`;
  }
  sql += ' ORDER BY p.created_at DESC LIMIT 50';
  const linhas = await dbAll(db, sql, params);
  // Os campos NOVOS ficam AO LADO de `status` (o status CORE, ecoado como sempre) e nunca no lugar
  // dele: `pedidos_compra` nao e escrita por nenhuma linha desta etapa.
  return linhas.map((linha) => ({
    id: linha.id,
    numero: linha.numero,
    valor_total: linha.valor_total,
    status: linha.status,
    data_pedido: linha.data_pedido,
    fornecedor_nome: linha.fornecedor_nome,
    fornecedor_cnpj: linha.fornecedor_cnpj,
    ...derivarRecebimentoDoPedido(linha.total_pedido, linha.soma_recebida),
  }));
}

/**
 * RN-24 (Etapa 37) — as LINHAS do pedido com saldo, para a tela de recebimento (T5).
 *
 * `null` (e nao `[]`) quando o pedido NAO EXISTE: e a rota que traduz isso no 404 com a MESMA
 * literal do `POST`. Pedido que existe e esta quitado devolve `[]` com 200 — nao e erro, e a
 * informacao de que nao ha o que receber.
 *
 * Quem filtra por saldo e ESTA funcao, e isso e contrato: o client renderiza o que vem e NAO
 * refiltra, senao passam a existir duas definicoes de "linha recebivel". O recorte por
 * `material_id` vem de `saldoDasLinhasDoPedido` -> `carregarItensPedidoCompra` (linha sem material
 * nao tem o que dar entrada no estoque), que e o mesmo do resto do modulo, e a ordem por `id` vem
 * de la tambem — a mesma ordem que resolve a linha no `POST`.
 */
async function listarItensPedidoCompraAux(db, pedidoId) {
  const tableExists = await dbGet(db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name='pedidos_compra'");
  if (!tableExists) return null;
  const pedido = await dbGet(db, 'SELECT id FROM pedidos_compra WHERE id = ?', [pedidoId]);
  if (!pedido) return null;

  const linhas = await saldoDasLinhasDoPedido(db, pedido.id);
  return linhas
    .map((linha) => {
      const derivado = derivarRecebimentoDoPedido(linha.quantidade, linha.quantidade_recebida);
      return {
        // `id` e o id da LINHA do pedido (`itens_pedido_compra.id`) — e o `pedido_item_id` que o
        // client devolve no `POST`, e o que a T3 usa para somar na linha certa.
        id: linha.id,
        material_id: linha.material_id,
        material_nome: linha.material_nome,
        material_codigo: linha.material_codigo,
        codigo: linha.codigo,
        descricao: linha.descricao,
        unidade: linha.unidade,
        quantidade: derivado.quantidade_pedida,
        quantidade_recebida: derivado.quantidade_recebida,
        saldo_pendente: derivado.saldo_pendente,
        valor_unitario: linha.valor_unitario,
      };
    })
    .filter((item) => item.saldo_pendente > 0);
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
  listarItensPedidoCompraAux,
  listarFornecedoresAux,
  getRecebimento,
};
