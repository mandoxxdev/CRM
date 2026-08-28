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

/**
 * C2/C3 — as 7 entradas. `listar(db, { dias })` devolve as linhas cruas da condicao;
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
};
