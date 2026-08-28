/**
 * Etapa 16, Task 1 — registro declarativo de alertas (RN-01: fonte unica).
 *
 * Cada entrada declara a condicao (`listar`, AO VIVO — a MESMA funcao para a varredura diaria
 * e para a central da Task 2), o dedupe estavel (tabela C3 do plano), a config de dias e os
 * textos do e-mail. Entrada nova aqui = alerta novo completo (varredura + central + config),
 * sem tocar em mais nada.
 *
 * Requires LAZY de proposito: `purchaseService` requer `notificationQueueService` no topo e
 * `inspectionService` requer `stockService` (que tambem requer a fila no topo) — um require de
 * topo aqui fecharia o ciclo notificationQueueService -> alertRegistry -> purchaseService ->
 * notificationQueueService e um dos lados capturaria `{}` mid-load (mesmo motivo documentado
 * no cabecalho de notificationQueueService.js). `toolService` fica lazy por uniformidade.
 *
 * A maquina do minimo/zerado (`alertService`) NAO passa por aqui — restricao global do plano.
 */
const { dbAll, dbGet } = require('./db');
const { TRANSICOES } = require('./requisitionStateMachine');
// divergencia.js so exporta constantes/formula (sem require de servicos) — top-level seguro.
const { divergenciaRealSql } = require('./divergencia');

/**
 * Status em que uma requisicao pode estar ATRASADA — DERIVADO da maquina de estados, nunca
 * hardcodado (achado Critico da revisao do plano: a lista escrita a mao trazia 'APROVADA',
 * literal que nao existe no banco — o real e 'APROVADO' — e teste e SQL errariam JUNTOS,
 * falso-verde de producao). Ficam fora: RASCUNHO (ainda nao pedida de verdade) e os terminais
 * ENTREGUE/ENCERRADA/CANCELADO/REJEITADO (nao ha mais o que atrasar). ENCERRADA/CANCELADO/
 * REJEITADO nem sao chaves de TRANSICOES (terminais sem saida), mas ficam na lista de exclusao
 * por robustez se um dia ganharem seta.
 */
const STATUS_FORA_DO_ATRASO = ['RASCUNHO', 'ENTREGUE', 'ENCERRADA', 'CANCELADO', 'REJEITADO'];
const STATUS_REQUISICAO_ATRASAVEL = Object.keys(TRANSICOES)
  .filter((s) => !STATUS_FORA_DO_ATRASO.includes(s));

// Mesmo padrao local de purchaseService.lerConfigNumero / notificationQueueService (duplicacao
// intencional registrada la: unificar os leitores e limpeza propria, fora desta etapa).
async function lerConfigNumero(db, chave, fallback) {
  const row = await dbGet(db, 'SELECT valor FROM configuracoes_almoxarifado WHERE chave = ?', [chave]);
  const n = parseFloat(row?.valor);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

/** Resolve a janela de dias de uma entrada (null quando o alerta nao usa janela) — C2. */
async function resolverDias(db, entrada) {
  if (!entrada.configDias) return null;
  return lerConfigNumero(db, entrada.configDias.chave, entrada.configDias.default);
}

/**
 * A regua REAL do relatorio `materiais-sem-endereco`, EXTRAIDA de routes/almoxarifado/
 * extended.js para fonte unica (achado Critico 2 da revisao do plano: a primeira versao do
 * design descrevia OUTRA regua e alerta e relatorio de mesmo nome mostrariam conjuntos
 * diferentes). Comportamento identico ao do relatorio — SELECT m.*, ORDER BY m.codigo.
 *
 * Etapa 8, Task 1, classe C da auditoria: NAO filtra o dono de proposito. Enderecar material
 * do cliente e tao necessario quanto enderecar o nosso — a chapa dele precisa de prateleira
 * de verdade. Filtrar aqui esconderia trabalho real do almoxarife. (RN-07: cliente DENTRO do
 * sem-endereco, FORA de sem-consumo/excessivo.)
 */
async function listarMateriaisSemEndereco(db) {
  return dbAll(db, `
    SELECT m.* FROM materiais_almoxarifado m
    WHERE m.ativo = 1 AND m.localizacao_padrao_id IS NULL
    AND NOT EXISTS (
      SELECT 1 FROM estoque_saldo_almoxarifado s
      WHERE s.material_id = m.id AND s.localizacao_id IS NOT NULL AND s.quantidade > 0
    )
    ORDER BY m.codigo
  `);
}

/** AAAA-MM em UTC — casa com o toISOString dos testes e com o date('now') UTC do SQLite. */
function mesAtual() {
  return new Date().toISOString().slice(0, 7);
}

/** Semana ISO-8601 em UTC (o ano e o ISO do meio da semana, nao o civil — virada de ano). */
function semanaIso(agora = new Date()) {
  const d = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth(), agora.getUTCDate()));
  const diaSemana = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - diaSemana);
  const inicioAno = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  const semana = Math.ceil((((d - inicioAno) / 86400000) + 1) / 7);
  return `${d.getUTCFullYear()}-W${String(semana).padStart(2, '0')}`;
}

/**
 * created_at do SQLite vem "YYYY-MM-DD HH:MM:SS" em UTC, sem o "T" — mesma armadilha (e mesma
 * solucao) de purchaseService.antigaOuNunca: so concatena "Z" quando a string nao tem "T",
 * senao um ISO ja valido viraria "...ZZ" (Date invalido) e cairia no ramo "recente" em
 * silencio.
 */
function maisVelhoQueDias(dataStr, dias) {
  if (dataStr == null) return false;
  const s = String(dataStr);
  const iso = s.includes('T') ? s : `${s.replace(' ', 'T')}Z`;
  const t = new Date(iso).getTime();
  return Number.isFinite(t) && t < Date.now() - dias * 24 * 60 * 60 * 1000;
}

// ── Etapa 17 — os tres `listar` de evento, DUAL-MODE (correcao Importante da revisao do
// plano): com `{ dias }` filtram a janela (central + varredura de rede); com o id do fato
// (`{ inspecaoId }` / `{ recebimentoId }` / `{ conferenciaId }`) devolvem a(s) linha(s)
// daquele fato para o gancho do ato — a MESMA query nos dois modos, senao nasceriam duas
// definicoes da condicao (a classe de bug que divergencia.js mata). Exportados porque os
// ganchos da Task 2 chamam o modo por id direto.

/**
 * MATERIAL_REPROVADO (RN-03): inspecoes com `quantidade_reprovada > 0`. Janela por
 * `data_inspecao` (DATETIME UTC do SQLite — comparacao de string com datetime('now') e
 * consistente).
 */
async function listarReprovados(db, { dias, inspecaoId } = {}) {
  const filtro = inspecaoId
    ? 'AND i.id = ?'
    : `AND i.data_inspecao >= datetime('now', '-' || ? || ' days')`;
  return dbAll(db, `
    SELECT i.id AS inspecao_id, m.codigo AS material_codigo, m.nome AS material_nome,
      i.quantidade_reprovada, i.encaminhamento, r.numero AS recebimento_numero, r.nota_fiscal,
      i.data_inspecao, i.responsavel_nome
    FROM inspecoes_recebimento_almoxarifado i
    JOIN recebimentos_material_itens_almoxarifado ri ON ri.id = i.recebimento_item_id
    JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
    JOIN materiais_almoxarifado m ON m.id = ri.material_id
    WHERE i.quantidade_reprovada > 0
      ${filtro}
    ORDER BY i.data_inspecao DESC, i.id DESC`, [inspecaoId ?? dias]);
}

/**
 * DIVERGENCIA_RECEBIMENTO (RN-04): itens com quantidade recebida REGISTRADA e diferente da
 * esperada pela regua float-safe `divergenciaRealSql` (segundo consumidor SQL da formula,
 * declarado no header de divergencia.js). Janela por `COALESCE(r.updated_at, r.created_at)`
 * (achado CRITICO da revisao: `created_at` puro deixaria recebimento antigo conferido HOJE
 * fora da central E da rede de seguranca; o item nao tem timestamp proprio — limitacao
 * declarada: qualquer toque posterior no recebimento renova a presenca na central; o dedupe
 * por item segura o e-mail).
 */
async function listarDivergenciasRecebimento(db, { dias, recebimentoId } = {}) {
  const filtro = recebimentoId
    ? 'AND ri.recebimento_id = ?'
    : `AND COALESCE(r.updated_at, r.created_at) >= datetime('now', '-' || ? || ' days')`;
  return dbAll(db, `
    SELECT ri.id AS item_id, ri.recebimento_id, m.codigo AS material_codigo,
      m.nome AS material_nome, ri.quantidade_esperada, ri.quantidade_recebida,
      (ri.quantidade_recebida - ri.quantidade_esperada) AS divergencia,
      r.numero AS recebimento_numero, r.nota_fiscal
    FROM recebimentos_material_itens_almoxarifado ri
    JOIN recebimentos_material_almoxarifado r ON r.id = ri.recebimento_id
    JOIN materiais_almoxarifado m ON m.id = ri.material_id
    WHERE ri.quantidade_recebida IS NOT NULL
      AND ${divergenciaRealSql('ri.quantidade_recebida - ri.quantidade_esperada')}
      ${filtro}
    ORDER BY ri.id ASC`, [recebimentoId ?? dias]);
}

/**
 * DIVERGENCIA_INVENTARIO (RN-05): conferencias CONCLUIDO com item divergente pela MESMA regua
 * do inventario (`divergenciaRealSql('ic.divergencia')` — ABS(NULL) e NULL, entao item nao
 * contado nao conta), AGREGADO por conferencia (1 aviso, nunca por item — a exclusao de
 * AJUSTE_INVENTARIO em resolverClasseMovimentacao existe pelo mesmo motivo). SEM
 * `impacto_financeiro` no SELECT de proposito (B30: e-mail vaza para caixa de entrada; o
 * valor e gateado por `inventario` no relatorio).
 */
async function listarDivergenciaConferencia(db, { dias, conferenciaId } = {}) {
  const filtro = conferenciaId
    ? 'AND c.id = ?'
    : `AND c.data_fim >= datetime('now', '-' || ? || ' days')`;
  return dbAll(db, `
    SELECT c.id AS conferencia_id, c.numero, c.data_fim, COUNT(ic.id) AS itens_divergentes
    FROM conferencias_almoxarifado c
    JOIN itens_conferencia_almoxarifado ic ON ic.conferencia_id = c.id
    WHERE c.status = 'CONCLUIDO'
      AND ${divergenciaRealSql('ic.divergencia')}
      ${filtro}
    GROUP BY c.id
    ORDER BY c.data_fim DESC, c.id DESC`, [conferenciaId ?? dias]);
}

/**
 * C2/C3 — as 7 entradas da Etapa 16 + as 4 da Etapa 17 (as tres de evento no fim tem tambem
 * gancho no ato — `dispararAlertaRegistrado` — com o MESMO dedupe, RN-01).
 * `listar(db, { dias })` devolve as linhas cruas da condicao;
 * `dedupeChave(linha)` e estavel no mesmo estado (RN-02); `payload(linha)` e o rastro minimo
 * gravado na fila (campo aditivo ao C2 — as assercoes de teste filtram por ele, nunca por
 * total global).
 */
const ALERT_REGISTRY = Object.freeze([
  {
    chave: 'CALIBRACAO_VENCENDO',
    titulo: 'Calibração vencendo',
    descricao: 'Ferramentas com calibração vencida ou vencendo na janela configurada.',
    configDias: { chave: 'alerta_calibracao_dias', default: 30 },
    // painelCalibracoes ja inclui a ferramenta que NUNCA calibrou (data_validade null) em
    // `vencidas` — o dedupe usa 'sem-calibracao' nesse caso (nota do C3).
    listar: async (db, { dias }) => {
      const toolService = require('./toolService');
      const painel = await toolService.painelCalibracoes(db, dias);
      return [...painel.vencidas, ...painel.a_vencer];
    },
    dedupeChave: (linha) => `calibracao-${linha.id}-${linha.data_validade ?? 'sem-calibracao'}`,
    payload: (linha) => ({ ferramenta_id: linha.id }),
    assunto: (linha) => `[Almoxarifado] Calibração vencendo — ${linha.codigo_patrimonio || linha.nome}`,
    corpo: (linha) => [
      `Ferramenta: ${linha.nome}`,
      `Patrimônio: ${linha.codigo_patrimonio || '-'}`,
      `Validade da calibração: ${linha.data_validade || 'nunca calibrada'}`,
      `Dias restantes: ${linha.dias_restantes ?? '-'}`,
    ].join('\n'),
  },
  {
    chave: 'ESTOQUE_SEM_CONSUMO',
    titulo: 'Estoque sem consumo',
    descricao: 'Materiais com saldo e sem saída há mais dias que a régua configurada.',
    // Chave EXISTENTE da Etapa 11 — o seed dela ja esta no schema (NAO semear de novo).
    // estoqueParado le a mesma chave por dentro; resolverDias existe para a central exibir a
    // janela — mesmo leitor (>0, senao default), mesmo resultado.
    configDias: { chave: 'reposicao_dias_sem_consumo', default: 180 },
    // estoqueParado ja filtra ativo=1 e proprietario_cliente_id IS NULL (purchaseService:444)
    // — RN-07 (cliente fora de consumo/excesso) vem de graca aqui e no EXCESSIVO.
    listar: async (db) => {
      const purchaseService = require('./purchaseService');
      return (await purchaseService.estoqueParado(db, 'SEM_CONSUMO')).itens;
    },
    // material+mes: re-lembra 1x/mes enquanto persistir.
    dedupeChave: (linha) => `sem-consumo-${linha.material_id}-${mesAtual()}`,
    payload: (linha) => ({ material_id: linha.material_id }),
    assunto: (linha) => `[Almoxarifado] Estoque sem consumo — ${linha.codigo}`,
    corpo: (linha) => [
      `Material: ${linha.codigo} — ${linha.nome}`,
      `Quantidade: ${linha.quantidade_atual} ${linha.unidade || ''}`.trim(),
      `Última saída: ${linha.ultima_saida || 'nunca'}`,
      `Valor parado: R$ ${linha.valor_parado}`,
    ].join('\n'),
  },
  {
    chave: 'ESTOQUE_EXCESSIVO',
    titulo: 'Estoque excessivo',
    descricao: 'Materiais com saldo acima da quantidade máxima cadastrada.',
    configDias: null,
    listar: async (db) => {
      const purchaseService = require('./purchaseService');
      return (await purchaseService.estoqueParado(db, 'EXCESSO')).itens;
    },
    dedupeChave: (linha) => `excessivo-${linha.material_id}-${mesAtual()}`,
    payload: (linha) => ({ material_id: linha.material_id }),
    assunto: (linha) => `[Almoxarifado] Estoque excessivo — ${linha.codigo}`,
    corpo: (linha) => [
      `Material: ${linha.codigo} — ${linha.nome}`,
      `Quantidade atual: ${linha.quantidade_atual} ${linha.unidade || ''}`.trim(),
      `Quantidade máxima: ${linha.quantidade_maxima}`,
      `Valor parado: R$ ${linha.valor_parado}`,
    ].join('\n'),
  },
  {
    chave: 'QUARENTENA_PARADA',
    titulo: 'Quarentena parada',
    descricao: 'Itens de recebimento aguardando inspeção há mais dias que o configurado.',
    configDias: { chave: 'alerta_quarentena_dias', default: 7 },
    // data_entrada = r.created_at do recebimento (listarInspecoesPendentes) — filtro de idade
    // em JS porque a fonte e a funcao existente, nao SQL novo.
    listar: async (db, { dias }) => {
      const inspectionService = require('./inspectionService');
      const pendentes = await inspectionService.listarInspecoesPendentes(db);
      return pendentes.filter((i) => maisVelhoQueDias(i.data_entrada, dias));
    },
    // 1x por item, para sempre — o item decidido sai da fila de inspecao e da condicao.
    dedupeChave: (linha) => `quarentena-${linha.item_id}`,
    payload: (linha) => ({ item_id: linha.item_id, recebimento_id: linha.recebimento_id }),
    assunto: (linha) => `[Almoxarifado] Quarentena parada — ${linha.material_codigo}`,
    corpo: (linha) => [
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Recebimento: ${linha.recebimento_numero}${linha.nota_fiscal ? ` (NF ${linha.nota_fiscal})` : ''}`,
      `Quantidade retida: ${linha.quantidade_retida} ${linha.material_unidade || ''}`.trim(),
      `Entrada: ${linha.data_entrada}`,
    ].join('\n'),
  },
  {
    chave: 'MATERIAL_SEM_ENDERECO',
    titulo: 'Materiais sem endereço',
    descricao: 'Materiais ativos sem localização padrão e sem nenhum saldo endereçado.',
    configDias: null,
    // UMA linha AGREGADA (alerta por material seria ruido em massa) — { total, materiais: ate
    // 20 }. Condicao vazia = nenhuma linha (a central mostra total 0; a varredura nao enfileira).
    listar: async (db) => {
      const materiais = await listarMateriaisSemEndereco(db);
      if (!materiais.length) return [];
      return [{ total: materiais.length, materiais: materiais.slice(0, 20) }];
    },
    // 1 resumo por semana ISO enquanto persistir.
    dedupeChave: () => `sem-endereco-${semanaIso()}`,
    payload: (linha) => ({ total: linha.total, materiais: linha.materiais.map((m) => m.id) }),
    assunto: (linha) => `[Almoxarifado] Materiais sem endereço — ${linha.total} material(is)`,
    corpo: (linha) => [
      `Total sem endereço: ${linha.total}`,
      `Primeiros ${linha.materiais.length}:`,
      ...linha.materiais.map((m) => `- ${m.codigo} — ${m.nome}`),
    ].join('\n'),
  },
  {
    chave: 'REQUISICAO_ATRASADA',
    titulo: 'Requisição atrasada',
    descricao: 'Requisições com data de necessidade vencida e ainda não entregues.',
    configDias: null,
    // So alerta quem PREENCHEU data_necessidade (coluna opcional — limitacao declarada no
    // design). Status pelo conjunto derivado da maquina (comentario no topo do arquivo).
    listar: async (db) => {
      const placeholders = STATUS_REQUISICAO_ATRASAVEL.map(() => '?').join(',');
      return dbAll(db, `
        SELECT r.* FROM requisicoes_almoxarifado r
        WHERE r.data_necessidade IS NOT NULL
          AND date(r.data_necessidade) < date('now')
          AND COALESCE(r.ativo, 1) = 1
          AND r.status IN (${placeholders})
        ORDER BY r.data_necessidade ASC`, STATUS_REQUISICAO_ATRASAVEL);
    },
    dedupeChave: (linha) => `req-atrasada-${linha.id}`,
    payload: (linha) => ({ requisicao_id: linha.id }),
    assunto: (linha) => `[Almoxarifado] Requisição atrasada — ${linha.numero}`,
    corpo: (linha) => [
      `Requisição: ${linha.numero}`,
      `Solicitante: ${linha.solicitante_nome}`,
      `Status: ${linha.status}`,
      `Data de necessidade: ${linha.data_necessidade}`,
    ].join('\n'),
  },
  {
    chave: 'RESERVA_PARADA',
    titulo: 'Reserva parada',
    descricao: 'Reservas ativas paradas há mais dias que o configurado ou já expiradas.',
    configDias: { chave: 'alerta_reserva_parada_dias', default: 30 },
    listar: async (db, { dias }) => dbAll(db, `
      SELECT res.*, m.codigo AS material_codigo, m.nome AS material_nome, m.unidade AS material_unidade
      FROM reservas_material_almoxarifado res
      JOIN materiais_almoxarifado m ON m.id = res.material_id
      WHERE res.status = 'ATIVA'
        AND (julianday('now') - julianday(res.created_at) > ?
             OR date(res.expira_em) < date('now'))
      ORDER BY res.created_at ASC`, [dias]),
    dedupeChave: (linha) => `reserva-parada-${linha.id}`,
    payload: (linha) => ({ reserva_id: linha.id }),
    assunto: (linha) => `[Almoxarifado] Reserva parada — #${linha.id} (${linha.material_codigo})`,
    corpo: (linha) => [
      `Reserva: #${linha.id}`,
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Quantidade: ${linha.quantidade} ${linha.material_unidade || ''}`.trim(),
      `Criada em: ${linha.created_at}`,
      `Expira em: ${linha.expira_em || '-'}`,
    ].join('\n'),
  },
  // ── Etapa 17 — 4 entradas novas (C2), na ordem do plano. As tres primeiras sao de EVENTO
  // (`evento: true`, documentacional): o ato dispara na hora pelo helper e o `listar` daqui
  // segue alimentando a central E a varredura diaria como rede de seguranca (RN-01).
  {
    chave: 'MATERIAL_REPROVADO',
    titulo: 'Material reprovado',
    descricao: 'Inspeções de recebimento com quantidade reprovada na janela configurada.',
    evento: true,
    configDias: { chave: 'alerta_eventos_janela_dias', default: 7 },
    listar: (db, { dias }) => listarReprovados(db, { dias }),
    // Decisao de inspecao e imutavel — 1 aviso por inspecao, para sempre.
    dedupeChave: (linha) => `reprovado-${linha.inspecao_id}`,
    payload: (linha) => ({ inspecao_id: linha.inspecao_id }),
    assunto: (linha) => `[Almoxarifado] Material reprovado — ${linha.material_codigo}`,
    corpo: (linha) => [
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Quantidade reprovada: ${linha.quantidade_reprovada}`,
      `Encaminhamento: ${linha.encaminhamento || '-'}`,
      `Recebimento: ${linha.recebimento_numero}${linha.nota_fiscal ? ` (NF ${linha.nota_fiscal})` : ''}`,
      `Inspeção em: ${linha.data_inspecao}`,
      `Responsável: ${linha.responsavel_nome || '-'}`,
    ].join('\n'),
  },
  {
    chave: 'DIVERGENCIA_RECEBIMENTO',
    titulo: 'Divergência de recebimento',
    descricao: 'Itens recebidos com quantidade diferente da esperada na janela configurada.',
    evento: true,
    configDias: { chave: 'alerta_eventos_janela_dias', default: 7 },
    listar: (db, { dias }) => listarDivergenciasRecebimento(db, { dias }),
    // 1x por item; correcao posterior da quantidade nao re-alerta (declarado no design).
    dedupeChave: (linha) => `receb-diverg-${linha.item_id}`,
    payload: (linha) => ({ item_id: linha.item_id, recebimento_id: linha.recebimento_id }),
    assunto: (linha) => `[Almoxarifado] Divergência de recebimento — ${linha.material_codigo}`,
    corpo: (linha) => [
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Quantidade esperada: ${linha.quantidade_esperada}`,
      `Quantidade recebida: ${linha.quantidade_recebida}`,
      `Divergência: ${linha.divergencia}`,
      `Recebimento: ${linha.recebimento_numero}${linha.nota_fiscal ? ` (NF ${linha.nota_fiscal})` : ''}`,
    ].join('\n'),
  },
  {
    chave: 'DIVERGENCIA_INVENTARIO',
    titulo: 'Divergência de inventário',
    descricao: 'Conferências concluídas com itens divergentes na janela configurada.',
    evento: true,
    configDias: { chave: 'alerta_eventos_janela_dias', default: 7 },
    listar: (db, { dias }) => listarDivergenciaConferencia(db, { dias }),
    // Conferencia conclui 1x — 1 aviso agregado por conferencia (RN-05).
    dedupeChave: (linha) => `inv-diverg-${linha.conferencia_id}`,
    payload: (linha) => ({ conferencia_id: linha.conferencia_id }),
    assunto: (linha) => `[Almoxarifado] Divergência de inventário — ${linha.numero}`,
    // B30: o corpo diz o NUMERO de itens divergentes, nunca o impacto financeiro.
    corpo: (linha) => [
      `Conferência: ${linha.numero}`,
      `Concluída em: ${linha.data_fim}`,
      `Itens divergentes: ${linha.itens_divergentes}`,
    ].join('\n'),
  },
  {
    chave: 'LOTE_SEM_CERTIFICADO',
    titulo: 'Lote sem certificado',
    descricao: 'Lotes com saldo de material que exige certificado e sem arquivo anexado.',
    configDias: null,
    // Molde da subquery de saldo: varrerLotesVencendo (notificationQueueService.js:492-502;
    // filtro de saldo em JS como la). SEM o filtro `l.status='ATIVO'` do molde, DE PROPOSITO
    // (achado da revisao): o lote sem certificado NASCE `BLOQUEADO` (receiptService:471 +
    // lotService:113-136) — copiar o filtro cegaria o alerta para o caso principal. A regua e
    // `certificado_arquivo IS NULL` (lote destravado na mao sem anexo continua sem
    // certificado). Material de CLIENTE ENTRA (decisao do plano: certificado e
    // rastreabilidade do lote, nao propriedade — coerente com B29/sem-endereco).
    listar: async (db) => {
      const lotes = await dbAll(db, `
        SELECT l.id, l.id AS lote_id, l.codigo, l.status, l.material_id,
          m.codigo AS material_codigo, m.nome AS material_nome, m.unidade AS material_unidade,
          COALESCE((SELECT SUM(s.quantidade) FROM estoque_saldo_almoxarifado s WHERE s.lote_id = l.id), 0) AS saldo
        FROM lotes_almoxarifado l
        JOIN materiais_almoxarifado m ON m.id = l.material_id
        WHERE m.ativo = 1
          AND m.controle_certificado = 1
          AND l.certificado_arquivo IS NULL
        ORDER BY m.codigo, l.codigo`);
      return lotes.filter((l) => Number(l.saldo) > 0);
    },
    // RN-06: re-lembra 1x/mes enquanto o lote seguir sem certificado e com saldo.
    dedupeChave: (linha) => `sem-certificado-${linha.id}-${mesAtual()}`,
    payload: (linha) => ({ lote_id: linha.id }),
    assunto: (linha) => `[Almoxarifado] Lote sem certificado — ${linha.codigo}`,
    corpo: (linha) => [
      `Lote: ${linha.codigo}`,
      `Material: ${linha.material_codigo} — ${linha.material_nome}`,
      `Saldo: ${linha.saldo} ${linha.material_unidade || ''}`.trim(),
      `Status: ${linha.status}`,
    ].join('\n'),
  },
]);

/** Corte de linhas por alerta na central (C1) — o `total` continua sendo o numero cheio. */
const LIMITE_LINHAS_CENTRAL = 50;

/**
 * Etapa 16, Task 2 — a central de alertas (C1): avalia o registro AO VIVO, na ordem do
 * registro, e devolve `{ alertas: [...] }` para o GET /alertas/central.
 *
 * Mora AQUI (e nao na rota) porque a rota da extended vive dentro do closure de
 * `registerExtendedRoutes` e nunca e exportada — logica ali seria intestavel por unidade, o
 * mesmo motivo pelo qual toda rota do modulo delega a um service. O `registro` e INJETAVEL
 * de proposito (achado da revisao do plano): o teste do `erro:true` passa um registro com um
 * `listar` que lanca, sem sabotagem manual nao versionada.
 *
 * Erro num `listar` individual NAO derruba a central: a entrada vem
 * `{ chave, titulo, erro: true, total: 0, linhas: [] }` e as demais respondem — central
 * parcial honesta em vez de 500 total (decisao registrada no C1).
 */
async function montarCentral(db, registro = ALERT_REGISTRY) {
  const alertas = [];
  for (const entrada of registro) {
    try {
      const dias = await resolverDias(db, entrada);
      const linhas = await entrada.listar(db, { dias });
      alertas.push({
        chave: entrada.chave,
        titulo: entrada.titulo,
        descricao: entrada.descricao,
        dias,
        total: linhas.length,
        linhas: linhas.slice(0, LIMITE_LINHAS_CENTRAL),
      });
    } catch (e) {
      console.error(`Central de alertas: falha no listar de ${entrada.chave}:`, e.message);
      alertas.push({ chave: entrada.chave, titulo: entrada.titulo, erro: true, total: 0, linhas: [] });
    }
  }
  return { alertas };
}

module.exports = {
  ALERT_REGISTRY,
  resolverDias,
  listarMateriaisSemEndereco,
  STATUS_REQUISICAO_ATRASAVEL,
  montarCentral,
  // Etapa 17 — dual-mode exportado: os ganchos dos atos (Task 2) chamam o modo por id.
  listarReprovados,
  listarDivergenciasRecebimento,
  listarDivergenciaConferencia,
};
