/**
 * Schema initialization and migrations for almoxarifado v3
 */

const { dbRun, dbGet, dbAll } = require('./db');

const CATEGORIAS_SEED = [
  'Aço carbono', 'Aço inox', 'Chapas', 'Tubos', 'Perfis estruturais', 'Barras e eixos',
  'Componentes usinados', 'Motores elétricos', 'Redutores', 'Bombas', 'Válvulas', 'Conexões',
  'Pneumática', 'Hidráulica', 'Elétrica', 'Automação', 'Sensores e instrumentos', 'Rolamentos',
  'Retentores', 'Elementos de fixação', 'Solda e consumíveis', 'Pintura', 'EPIs', 'Ferramentas',
  'Materiais de montagem', 'Materiais fornecidos pelo cliente', 'Sucata e sobras reaproveitáveis',
];

const TIPOS_MATERIAL_ENUM = [
  'chapa', 'tubo', 'perfil', 'barra', 'motor', 'redutor', 'rolamento', 'valvula', 'conexao',
  'sensor', 'painel_eletrico', 'componente_pneumatico', 'tinta', 'consumivel', 'epi',
  'ferramenta', 'item_montagem', 'item_comprado', 'item_fabricado', 'item_cliente',
];

const TIPOS_LOCALIZACAO = [
  'Almoxarifado', 'Rua', 'Prateleira', 'Gaveta', 'Box', 'Área externa', 'Área de corte',
  'Área de montagem', 'Área de elétrica', 'Área de pintura', 'Área de expedição',
  'Área de materiais do cliente', 'Área de quarentena/inspeção',
];

const UNIDADES_SEED = [
  ['UN', 'Unidade'], ['KG', 'Quilograma'], ['M', 'Metro'], ['M2', 'Metro quadrado'],
  ['M3', 'Metro cúbico'], ['L', 'Litro'], ['PC', 'Peça'], ['CX', 'Caixa'], ['RL', 'Rolo'],
  ['PAR', 'Par'], ['TON', 'Tonelada'], ['MM', 'Milímetro'],
];

const SETORES_REQUISICAO = [
  'Engenharia', 'Produção', 'Caldeiraria', 'Usinagem', 'Elétrica', 'Automação',
  'Montagem', 'Pintura', 'Expedição', 'Assistência técnica', 'Obras externas',
];

// Etapa 3 (design 2026-08-05, seção "Dados"): tipo único de requisição — usado em
// filtros, exibição e na regra do emergencial (EMERGENCIAL exige justificativa).
const TIPOS_REQUISICAO = [
  'CONSUMO', 'ORDEM_PRODUCAO', 'ORDEM_SERVICO', 'PROJETO', 'MONTAGEM',
  'INSTALACAO_EXTERNA', 'ASSISTENCIA_TECNICA', 'MANUTENCAO', 'DESENVOLVIMENTO',
  'ADMINISTRATIVO', 'EMERGENCIAL', 'FERRAMENTA', 'EPI', 'MATERIAL_CLIENTE',
];

const TIPOS_MOVIMENTO = [
  'ENTRADA_COMPRA', 'ENTRADA_MANUAL', 'ENTRADA_DEVOLUCAO', 'SAIDA_PRODUCAO',
  'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'TRANSFERENCIA', 'RESERVA', 'LIBERACAO_RESERVA',
  'BLOQUEIO', 'DESBLOQUEIO', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'SUCATA', 'PERDA', 'RETRABALHO',
  // Etapa 8, decisao 9: devolver ao cliente e SAIDA — o material sai do predio de volta para quem
  // e dele. NAO CONFUNDIR com a devolucao da Etapa 7 (tela /almoxarifado/devolucoes, tipo
  // ENTRADA_DEVOLUCAO), onde o material VOLTA para o estoque. Sao movimentos de direcoes OPOSTAS
  // com nomes parecidos — e a confusao mais provavel de quem ler este codigo depois.
  // Passa pelo motor de proposito: assim lote, serie e endereco funcionam, que e justamente o
  // que a ilha de materiais de cliente nao dava.
  'DEVOLUCAO_CLIENTE',
  // Etapa 5 — quarentena. Simetria de BLOQUEIO/DESBLOQUEIO: mexem em coluna de retencao
  // sem tocar o fisico, porque o material esta no galpao o tempo todo.
  'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO',
  // Etapa 5, correcao de review: uma decisao de inspecao pode aprovar parte e reprovar parte do
  // MESMO retido. LIBERACAO_INSPECAO + REPROVACAO_INSPECAO como duas chamadas independentes
  // abrem uma janela entre elas onde uma decisao concorrente pode consumir o em_inspecao pela
  // metade — DECISAO_INSPECAO baixa o retido inteiro e soma a parte reprovada em bloqueada no
  // MESMO UPDATE (ver stockService.js).
  'DECISAO_INSPECAO',
  // Etapa 8b: os quatro tipos da remessa a terceiros. Dois PARES com naturezas diferentes:
  //  - REMESSA_TERCEIRO / RETORNO_TERCEIRO sao RETENCAO (entram em TIPOS_RETENCAO abaixo): mexem
  //    so em quantidade_em_terceiros. quantidade_atual NAO muda porque o material continua sendo
  //    nosso — ele so nao esta no predio.
  //  - PERDA_TERCEIRO / CONSUMO_TERCEIRO sao SAIDA de verdade: baixam quantidade_atual E
  //    quantidade_em_terceiros no MESMO UPDATE. Sao o destino obrigatorio do que nao voltou
  //    (decisao 4 do design): PERDA_TERCEIRO = sumiu/foi danificado la; CONSUMO_TERCEIRO = virou
  //    cavaco, refugo de processo.
  //
  // Por que NAO reusar PERDA/SUCATA para a baixa: os dois estao em ownerRules.TIPOS_SAIDA_COM_DONO,
  // entao encerrar a remessa de uma chapa DE CLIENTE perdida no galvanizador passaria a exigir OS
  // ou projeto daquele cliente — que pode nao existir, e que a decisao 5 justamente isenta. E PERDA
  // baixaria so quantidade_atual, deixando quantidade_em_terceiros preso: o saldo orfao que a
  // decisao 4 existe para evitar.
  'REMESSA_TERCEIRO', 'RETORNO_TERCEIRO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO',
  // Etapa 8c (decisao 2 do design): o credito das pecas cortadas. E ENTRADA de verdade — credita
  // quantidade_atual e aceita custo_unitario, alimentando o custo medio pelo caminho que ja existe.
  //
  // Por que NAO reusar ENTRADA_MANUAL, em ordem de gravidade:
  //  1. DONO: ENTRADA_MANUAL nao tem logica de proprietario. A peca cortada de uma chapa do cliente
  //     X e do cliente X, e a Etapa 8 inteira existe para essa garantia nao depender de alguem
  //     lembrar. A guarda que impede converter material de cliente em patrimonio da GMP
  //     (ownerRules.assertMesmoDonoNaTransformacao) so tem onde se pendurar com tipo proprio.
  //  2. LIVRO: no extrato, ENTRADA_MANUAL faz a peca parecer ter aparecido do nada — o motivo real
  //     ("veio da chapa tal, remessa tal") some.
  //  3. ESTORNO: cancelar uma entrada manual nao sabe que existe uma baixa de chapa do outro lado.
  //
  // NAO entra em TIPOS_RETENCAO: se entrasse, o motor pularia o bloco fisico (a skip-list deriva de
  // TIPOS_RETENCAO) e a peca nunca seria creditada — com a movimentacao aparecendo no livro do
  // mesmo jeito, que e o pior modo de falhar desta etapa.
  'RETORNO_TRANSFORMACAO',
  // Etapa 9, Task 2: o credito do retalho/sobra aproveitavel gerado por um evento de corte. E'
  // ENTRADA de verdade — credita quantidade_atual — mas por um caminho DIFERENTE de
  // RETORNO_TRANSFORMACAO acima, porque a origem e' diferente: aquele nasce de uma remessa a
  // terceiro (galvanizador cortando chapa fora do predio); este nasce de um corte feito AQUI,
  // dentro do proprio almoxarifado, registrado pelo evento composto que a Task 3 constroi.
  //
  // Por que NAO reusar ENTRADA (nem ENTRADA_MANUAL), em ordem de gravidade:
  //  1. CUSTO: ENTRADA_MANUAL aceita custo_unitario e alimenta o custo medio (stockService.js,
  //     mesmo caminho de RETORNO_TRANSFORMACAO). O retalho tem de entrar a custo ZERO — mesmo
  //     tratamento conservador que TIPOS_RESULTADO.SOBRA ja recebe na transformacao (decisao 4 do
  //     design da 8c, comentario acima): o patrimonio nunca infla, e se o retalho for vendido como
  //     sucata um dia aparece como GANHO, nunca como perda inventada. Um tipo que reusa o caminho
  //     de custo de ENTRADA_MANUAL deixaria essa garantia dependendo de quem chama lembrar de
  //     nunca passar custo_unitario — exatamente o tipo de "aviso nao e mecanismo" que
  //     movementTypes.js documenta.
  //  2. LIVRO: no extrato, ENTRADA_MANUAL faz o retalho parecer ter aparecido do nada — a chapa
  //     que o originou, e a requisicao/OS onde a sobra ficou, somem.
  //  3. EMISSOR UNICO: so o evento composto do retalho (Task 3) pode emitir este tipo — por isso
  //     ele e' DEDICADO (TIPOS_DEDICADOS abaixo), nunca aceito pela rota generica de movimentacao.
  //     ENTRADA_MANUAL e' publica (qualquer POST na v2 com o gate `movimentar` cria uma), e um
  //     retalho tem de nascer sempre vinculado a origem que o evento composto registra.
  'ENTRADA_RETALHO',
  'ENTRADA', 'SAIDA', 'AJUSTE', 'DEVOLUCAO', 'ESTORNO',
  // Etapa 10: o ajuste que a conclusao da conferencia de inventario emite. Semantica IDENTICA a
  // AJUSTE (valor absoluto, ver stockService) — tipo SEPARADO so para poder ser DEDICADO
  // (TIPOS_DEDICADOS abaixo): a rota generica de Movimentacoes nunca aceita, so a conclusao da
  // conferencia (routes/almoxarifado.js) chama o motor direto com este tipo. Resolve a lacuna
  // nomeada desde a Etapa 7/8/8b (docs/almoxarifado-novidades-por-etapa.md, itens B1-B3): o
  // ajuste da conferencia passa a ter a MESMA guarda de retencao do AJUSTE avulso, em vez de
  // gravar por fora do motor sem validacao nenhuma.
  'AJUSTE_INVENTARIO',
];

// Tipos de RETENCAO: nao mexem no fisico (quantidade_atual), so nas colunas de retencao de
// materiais_almoxarifado (reservada/bloqueada/em_inspecao). Cada um tem um SERVICO dono, com o
// gate de permissao proprio e o registro paralelo que da lastro ao numero:
//   RESERVA / LIBERACAO_RESERVA        -> criarReserva/liberarReserva (`reservar`) + reservas_material_almoxarifado
//   BLOQUEIO / DESBLOQUEIO             -> inspectionService (`ajustar_estoque`), exige justificativa
//   QUARENTENA                         -> receiptService.aprovarRecebimento (`receber_material`) + retido no item
//   LIBERACAO_/REPROVACAO_/DECISAO_INSPECAO -> inspectionService.decidirInspecao (`inspecionar`) + inspecoes_recebimento
//   REMESSA_TERCEIRO / RETORNO_TERCEIRO -> thirdPartyService (`remessar_terceiro`)
//                                          + remessas/itens/retornos_remessa_item
// Por isso a rota generica de movimentacao NAO pode aceita-los (ver TIPOS_MOVIMENTO_ROTA em
// schemas.js): entrar por ela pula o gate certo E o registro paralelo, deixando o numero da
// coluna sem nada por tras.
//
// Etapa 8b: esta lista tambem DERIVA a skip-list do bloco fisico do motor (stockService.js). Ate
// a 8b as duas existiam em paralelo, letra por letra iguais (esta + TRANSFERENCIA), e todo tipo
// de retencao novo tinha de ser lembrado nos DOIS lugares — esquecer o segundo fazia o tipo cair
// no bloco fisico em silencio.
const TIPOS_RETENCAO = [
  'RESERVA', 'LIBERACAO_RESERVA',
  'BLOQUEIO', 'DESBLOQUEIO',
  'QUARENTENA', 'LIBERACAO_INSPECAO', 'REPROVACAO_INSPECAO', 'DECISAO_INSPECAO',
  'REMESSA_TERCEIRO', 'RETORNO_TERCEIRO',
];

// Tipos que exigem ROTA DEDICADA e por isso NAO entram na rota generica de movimentacao (mesma
// logica de TIPOS_RETENCAO acima, motivo diferente):
//   DEVOLUCAO_CLIENTE -> POST /materiais-cliente/devolucoes (gate `movimentar` + guarda do dono)
// Ele exige numero de documento de devolucao, que MovimentacaoSchema nao tem como campo
// obrigatorio, e so vale para material com proprietario. Entrar pela v2 significaria ou tornar o
// documento obrigatorio para todos os tipos (quebra tudo), ou fazer o motor validar campo que so
// existe para UM tipo (regra de um tipo espalhada pelo motor inteiro). A v2 tem gate `movimentar`,
// o mais amplo do modulo: aceitar o tipo la tornaria decorativas as exigencias proprias da rota
// dedicada — bastaria mandar {tipo:'DEVOLUCAO_CLIENTE'} para a v2 e sair material de cliente sem
// documento nenhum.
//   PERDA_TERCEIRO / CONSUMO_TERCEIRO -> PUT /remessas-terceiros/:id/encerrar (gate
//     `remessar_terceiro`). Sao SAIDA, entao nao sao pegos por TIPOS_RETENCAO — precisam ser
//     barrados aqui explicitamente. Aceita-los na v2 (gate `movimentar`, o mais amplo do modulo)
//     permitiria baixar material que esta no terceiro sem remessa nenhuma por tras, e sem o
//     destino/justificativa que o encerramento exige — o numero de quantidade_em_terceiros
//     ficaria sem nada que o explique. Mesmo criterio de DEVOLUCAO_CLIENTE: o tipo tem exigencias
//     proprias que a v2 tornaria decorativas.
//   RETORNO_TRANSFORMACAO -> POST /remessas-terceiros/:id/transformacoes (gate
//     `remessar_terceiro`). Mesmo criterio dos outros tres: aceita-lo na v2 (gate `movimentar`, o
//     mais amplo do modulo) permitiria criar peca cortada SEM remessa nenhuma por tras e SEM baixar
//     chapa alguma — estoque do nada, exatamente o que a mensagem de recusa da 8b dizia querer
//     evitar. Entrar aqui ja o tira da rota generica: TIPOS_MOVIMENTO_ROTA e DERIVADO desta lista
//     (schemas.js:54-56), nao ha segunda lista a lembrar.
//   ENTRADA_RETALHO (Etapa 9, Task 2) -> so o evento composto do retalho (Task 3) o emite. Mesmo
//     criterio de RETORNO_TRANSFORMACAO: aceita-lo na v2 (gate `movimentar`, o mais amplo do
//     modulo) permitiria creditar retalho do NADA — sem a chapa de origem baixada do outro lado,
//     sem o vinculo com a sobra e sem a guarda de dono que o evento composto carrega (retalho tem
//     de ter o MESMO dono da origem). Entrar aqui ja o tira da rota generica, pelo mesmo mecanismo
//     de derivacao — nao ha segunda lista a editar em schemas.js.
//   SUCATA (Etapa 9, Task 5) -> ate aqui era o unico tipo de descarte aceito na v2 (PERDA
//     continua, olhar abaixo). A spec 15 (retalhos e sucatas) exige um teste que hoje e
//     IMPOSSIVEL de escrever: "sucatear sem dupla aprovacao falha". Com SUCATA aberto na v2 —
//     gate `movimentar`, o mais amplo do modulo — bastava mandar {tipo:'SUCATA'} para sucatear
//     sem passar pela rota de sucateamento (Task 6/7), que e onde a dupla aprovacao vai morar:
//     a exigencia ficaria decorativa antes mesmo de existir. Mesmo precedente de DEVOLUCAO na
//     Etapa 7 (saiu do FORMULARIO, nao deste array — DEVOLUCAO comum nunca esteve aqui) e de
//     DEVOLUCAO_CLIENTE nesta mesma lista: o tipo ganhou exigencia propria (aprovacao dupla) que
//     so a rota dedicada pode cobrar. Os emissores legitimos (returnService, destino SUCATA da
//     devolucao; e o servico de sucateamento da Task 6/7) chamam stockService.registrarMovimentacao
//     DIRETO, por fora da v2 — TIPOS_DEDICADOS so gira a porta HTTP generica, nao o motor. PERDA
//     fica de fora desta lista de proposito: nao tem processo de aprovacao dupla na spec 15, e
//     tirar os dois juntos sem necessidade reduziria o formulario sem ganho nenhum.
//   AJUSTE_INVENTARIO (Etapa 10) -> so a conclusao da conferencia de inventario (Task 2) emite
//     este tipo, chamando stockService.registrarMovimentacao DIRETO, por fora da v2. Mesmo
//     criterio de SUCATA logo acima: aceita-lo na v2 (gate `movimentar`, o mais amplo do modulo)
//     bastaria mandar {tipo:'AJUSTE_INVENTARIO'} para gravar um ajuste "homologado por
//     conferencia" sem conferencia nenhuma por tras — a exigencia de que o valor venha de uma
//     contagem revisada ficaria decorativa.
const TIPOS_DEDICADOS = ['DEVOLUCAO_CLIENTE', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO',
  'RETORNO_TRANSFORMACAO', 'ENTRADA_RETALHO', 'SUCATA', 'AJUSTE_INVENTARIO'];

/**
 * Classificacao da linha de resultado de uma TRANSFORMACAO (Etapa 8c, decisao 8 do design).
 *
 * PECA  — recebe o rateio do custo da chapa (decisao 4).
 * SOBRA — entra a custo ZERO, o tratamento conservador que ERP da a retalho: o patrimonio nunca
 *         infla, e se a sobra for vendida como sucata um dia, aparece como GANHO e nunca como
 *         perda inventada.
 *
 * O que "virou cavaco" NAO e resultado e nao tem linha: e a diferenca entre o consumido e o que
 * voltou, e ela ja esta baixada pelo CONSUMO_TERCEIRO da chapa. Nao precisa de destino novo em
 * DESTINOS_ENCERRAMENTO.
 *
 * Lista literal repetida em dois lugares diverge na primeira mudanca — e daqui que o Zod
 * (ResultadoTransformacaoSchema) e o servico (thirdPartyService.registrarTransformacao) leem.
 */
const TIPOS_RESULTADO = ['PECA', 'SOBRA'];

/**
 * Estados possiveis de uma sobra (Etapa 9, Task 1). Lista literal repetida em dois lugares
 * diverge na primeira mudanca — SobraUpdateSchema (Zod) le daqui, nao de um enum proprio, mesmo
 * criterio usado acima para TIPOS_RESULTADO.
 *
 * DISPONIVEL — pode ser consumida por outra requisicao/OS.
 * CONSUMIDA  — ja foi usada inteira (saiu do catalogo de sobras disponiveis).
 * SUCATEADA  — descartada como sucata, nao volta a ficar disponivel.
 */
const STATUS_SOBRA = ['DISPONIVEL', 'CONSUMIDA', 'SUCATEADA'];

const FAMILIAS_SEED = [
  ['PAR', 'Parafusos e Porcas', 'Elementos de fixação — parafusos, porcas e arruelas'],
  ['ROL', 'Rolamentos', 'Rolamentos e mancais'],
  ['VAL', 'Válvulas', 'Válvulas pneumáticas e hidráulicas'],
];

const SETORES_ALMOX_SEED = [
  ['Bancada', 'GAV', 'bancada', 1],
  ['Corredor A', 'A', 'corredor', 2],
  ['Corredor B', 'B', 'corredor', 3],
  ['Corredor C', 'C', 'corredor', 4],
  ['Área de Segurança', 'EPI', 'area', 5],
  ['Área de Ferramentas', 'FERR', 'area', 6],
  ['Área Externa', 'EXT', 'area', 7],
  ['Almoxarifado Principal', 'ALM', 'area', 8],
];

// Migrado de routes/almoxarifado.js (diff de segurança — Task 3): seed de tipos de
// material que só existia no callback do CREATE TABLE da rota.
const TIPOS_MATERIAL_ALMOX_SEED = [
  ['EPI', 'Equipamento de Proteção Individual', '🦺', '#f59e0b', 1, 1, 1, 1],
  ['Ferramenta', 'Ferramentas e utensílios controlados', '🔧', '#8b5cf6', 0, 1, 0, 1],
  ['Consumível', 'Materiais de uso contínuo', '📦', '#4facfe', 0, 0, 0, 0],
  ['Insumo', 'Matéria-prima e insumos de produção', '⚗️', '#1aa34a', 0, 0, 0, 0],
  ['Embalagem', 'Materiais de embalagem', '📫', '#06b6d4', 0, 0, 0, 0],
  ['Manutenção', 'Peças e materiais de manutenção', '⚙️', '#ef4444', 0, 0, 0, 0],
  ['Escritório', 'Material de escritório e papelaria', '📝', '#6b7280', 0, 0, 0, 0],
  ['Limpeza', 'Produtos de higiene e limpeza', '🧹', '#22c55e', 0, 0, 0, 0],
];

// Migrado de routes/almoxarifado.js (diff de segurança — Task 3): seed de localizações
// padrão que só existia no callback do CREATE TABLE da rota.
const LOCALIZACOES_ALMOX_SEED = [
  ['A-01', 'Prateleira A, Coluna 1', 'Corredor A'],
  ['A-02', 'Prateleira A, Coluna 2', 'Corredor A'],
  ['B-01', 'Prateleira B, Coluna 1', 'Corredor B'],
  ['B-02', 'Prateleira B, Coluna 2', 'Corredor B'],
  ['GAV-01', 'Gaveta 1', 'Bancada'],
  ['GAV-02', 'Gaveta 2', 'Bancada'],
  ['EPI', 'Armário de EPIs', 'Área de Segurança'],
  ['FERR', 'Painel de Ferramentas', 'Área de Ferramentas'],
];

async function safeAlter(db, sql) {
  try {
    await dbRun(db, sql);
  } catch (e) {
    if (/duplicate column name/i.test(e.message)) return;
    console.error('[almoxarifado-schema] ALTER falhou:', sql.trim().slice(0, 80), '—', e.message);
    throw e;
  }
}

/** Base tables from almoxarifado.js — ensure they exist before v3 migrations (avoids startup race). */
async function ensureBaseTables(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS materiais_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria TEXT DEFAULT 'OUTROS',
    unidade TEXT DEFAULT 'UN',
    foto TEXT,
    localizacao TEXT,
    quantidade_atual REAL DEFAULT 0,
    quantidade_minima REAL DEFAULT 0,
    quantidade_maxima REAL DEFAULT 0,
    custo_unitario REAL DEFAULT 0,
    fornecedor_principal TEXT,
    codigo_fornecedor TEXT,
    ncm TEXT,
    especificacoes TEXT,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS movimentacoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    quantidade REAL NOT NULL,
    saldo_anterior REAL NOT NULL,
    saldo_posterior REAL NOT NULL,
    motivo TEXT,
    referencia TEXT,
    observacoes TEXT,
    usuario_id INTEGER,
    usuario_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS conferencias_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    status TEXT DEFAULT 'ABERTO',
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    data_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_fim DATETIME,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_conferencia_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    conferencia_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantidade_sistema REAL NOT NULL,
    quantidade_contada REAL,
    divergencia REAL,
    ajustado INTEGER DEFAULT 0,
    observacoes TEXT,
    FOREIGN KEY (conferencia_id) REFERENCES conferencias_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS configuracoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chave TEXT UNIQUE NOT NULL,
    valor TEXT,
    descricao TEXT,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_by TEXT
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS tipos_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    descricao TEXT,
    icone TEXT DEFAULT '📦',
    cor TEXT DEFAULT '#4facfe',
    requer_assinatura INTEGER DEFAULT 0,
    requer_termo INTEGER DEFAULT 0,
    is_epi INTEGER DEFAULT 0,
    is_controlado INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS localizacoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    descricao TEXT,
    setor TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS requisicoes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    solicitante_id INTEGER NOT NULL,
    solicitante_nome TEXT NOT NULL,
    departamento TEXT,
    os_referencia TEXT,
    urgencia TEXT DEFAULT 'NORMAL',
    status TEXT DEFAULT 'PENDENTE',
    observacoes TEXT,
    justificativa_urgencia TEXT,
    aprovador_id INTEGER,
    aprovador_nome TEXT,
    data_aprovacao DATETIME,
    data_entrega DATETIME,
    rejeicao_motivo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_requisicao_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisicao_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantidade_solicitada REAL NOT NULL,
    quantidade_atendida REAL DEFAULT 0,
    observacoes TEXT,
    FOREIGN KEY (requisicao_id) REFERENCES requisicoes_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);
}

const MIGRATION_CRIAR_ALMOXARIFADO_GERAL = 'criar_almoxarifado_geral';

/**
 * Ledger de migração: cria o almoxarifado "ALM-GERAL" (idempotente via INSERT OR IGNORE)
 * e vincula a ele todas as localizações ainda sem almoxarifado_id — incluindo as seedadas
 * no próprio initSchema. Roda uma única vez (marcada em schema_migrations_almoxarifado);
 * chamadas seguintes do initSchema são no-op. Segue o padrão de migrateHistoricoNullableMaterial.
 */
async function migrateCriarAlmoxarifadoGeral(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?',
    [MIGRATION_CRIAR_ALMOXARIFADO_GERAL]);
  if (applied) return;

  const tableRow = await dbGet(db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='localizacoes_almoxarifado'`);
  if (!tableRow) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_CRIAR_ALMOXARIFADO_GERAL]);
    return;
  }

  await dbRun(db, `INSERT OR IGNORE INTO almoxarifados (codigo, nome, descricao)
    VALUES ('ALM-GERAL', 'Almoxarifado Geral', 'Almoxarifado padrão criado automaticamente na migração inicial')`);
  const geral = await dbGet(db, `SELECT id FROM almoxarifados WHERE codigo = 'ALM-GERAL'`);
  if (geral) {
    await dbRun(db, 'UPDATE localizacoes_almoxarifado SET almoxarifado_id = ? WHERE almoxarifado_id IS NULL', [geral.id]);
  }

  // OR IGNORE: no boot há duas chamadas de initSchema em paralelo (routes/almoxarifado.js:56
  // fire-and-forget + extended.js runInitSchemaWithRetry) que podem interlear num DB fresco —
  // ambas passam pelo `if (applied) return;` acima antes de qualquer uma commitar a marca, então
  // a perdedora bateria numa violação de PK aqui. Com OR IGNORE ela é auto-curativa e silenciosa
  // (a vencedora já persistiu a marca; a corrida não perde nem duplica o vínculo/ALM-GERAL).
  await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
    [MIGRATION_CRIAR_ALMOXARIFADO_GERAL]);
  console.log('✅ Migração criar_almoxarifado_geral aplicada (ALM-GERAL criado e localizações vinculadas)');
}

const MIGRATION_BACKFILL_ITEM_EM_INSPECAO = 'backfill_quantidade_em_inspecao_item';

/**
 * Backfill (correcao de review, Etapa 5): `quantidade_em_inspecao` em
 * `recebimentos_material_itens_almoxarifado` nasceu com DEFAULT 0. Num banco onde a Task 3/4 ja
 * rodou ANTES desta coluna existir, um item retido em quarentena fica com 0 na coluna nova
 * enquanto o pool do material (`materiais_almoxarifado.quantidade_em_inspecao`) ainda segura a
 * retencao — o item some da fila (`listarInspecoesPendentes`) e `decidirInspecao` recusa com 400
 * mesmo havendo saldo retido esperando por ele. So sai por SQL cru sem este backfill.
 *
 * Criterio: para cada item, soma as movimentacoes `QUARENTENA` que citam o MESMO
 * (`recebimento_id`, `material_id`) do item — e exatamente isso que `darEntradaEstoque` grava
 * quando o item retem. So aplica quando esse par e INEQUIVOCO (exatamente um item daquele
 * recebimento tem aquele material) — se dois itens do MESMO recebimento compartilharem o MESMO
 * material (incomum: um recebimento normalmente tem um item por material), a movimentacao nao
 * carrega `recebimento_item_id` para desambiguar quem reteve o que, e esses casos ficam de fora
 * (permanecem em 0 — limitacao conhecida, documentada no relatório da task, não um critério
 * inventado). Itens que já têm decisão registrada (linha em
 * `inspecoes_recebimento_almoxarifado`) NÃO recebem backfill: já foram decididos por um caminho
 * anterior que baixou o pool do material por conta própria, então continuar em 0 está correto.
 *
 * Idempotente pelo ledger (roda uma única vez) — mas o próprio UPDATE também é seguro de
 * reexecutar: a cláusula `NOT EXISTS` já exclui itens legitimamente decididos.
 */
async function migrateBackfillItemQuantidadeEmInspecao(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?',
    [MIGRATION_BACKFILL_ITEM_EM_INSPECAO]);
  if (applied) return;

  const colInfo = await dbGet(db,
    `SELECT name FROM pragma_table_info('recebimentos_material_itens_almoxarifado') WHERE name = 'quantidade_em_inspecao'`);
  if (!colInfo) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_BACKFILL_ITEM_EM_INSPECAO]);
    return;
  }

  const result = await dbRun(db, `
    UPDATE recebimentos_material_itens_almoxarifado
    SET quantidade_em_inspecao = (
      SELECT SUM(mov.quantidade) FROM movimentacoes_almoxarifado mov
      WHERE mov.tipo = 'QUARENTENA'
        AND mov.recebimento_id = recebimentos_material_itens_almoxarifado.recebimento_id
        AND mov.material_id = recebimentos_material_itens_almoxarifado.material_id
    )
    WHERE COALESCE(quantidade_em_inspecao, 0) = 0
      AND EXISTS (
        SELECT 1 FROM movimentacoes_almoxarifado mov
        WHERE mov.tipo = 'QUARENTENA'
          AND mov.recebimento_id = recebimentos_material_itens_almoxarifado.recebimento_id
          AND mov.material_id = recebimentos_material_itens_almoxarifado.material_id
      )
      AND NOT EXISTS (
        SELECT 1 FROM inspecoes_recebimento_almoxarifado insp
        WHERE insp.recebimento_item_id = recebimentos_material_itens_almoxarifado.id
      )
      AND 1 = (
        SELECT COUNT(*) FROM recebimentos_material_itens_almoxarifado ri2
        WHERE ri2.recebimento_id = recebimentos_material_itens_almoxarifado.recebimento_id
          AND ri2.material_id = recebimentos_material_itens_almoxarifado.material_id
      )
  `);

  await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
    [MIGRATION_BACKFILL_ITEM_EM_INSPECAO]);
  if (result.changes > 0) {
    console.log(`✅ Migração backfill_quantidade_em_inspecao_item aplicada (${result.changes} item(ns) retroativo(s))`);
  }
}

const MIGRATION_HISTORICO_NULLABLE = 'alertas_historico_nullable_material';

async function migrateHistoricoNullableMaterial(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?',
    [MIGRATION_HISTORICO_NULLABLE]);
  if (applied) return;

  const tableRow = await dbGet(db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='alertas_estoque_historico_almoxarifado'`);
  if (!tableRow) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_HISTORICO_NULLABLE]);
    return;
  }

  const histMaterialCol = await dbGet(db,
    `SELECT "notnull" as nn FROM pragma_table_info('alertas_estoque_historico_almoxarifado') WHERE name = 'material_id'`);
  if (!histMaterialCol || histMaterialCol.nn !== 1) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_HISTORICO_NULLABLE]);
    return;
  }

  await dbRun(db, 'PRAGMA foreign_keys=OFF');
  try {
    await dbRun(db, `CREATE TABLE alertas_estoque_historico_almoxarifado_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER,
      canal TEXT NOT NULL,
      destinatario TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'ENVIADO',
      erro TEXT,
      teste INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
    )`);
    await dbRun(db, `INSERT INTO alertas_estoque_historico_almoxarifado_new
      (id, material_id, canal, destinatario, status, erro, teste, created_at)
      SELECT id, material_id, canal, destinatario, status, erro, teste, created_at
      FROM alertas_estoque_historico_almoxarifado`);
    await dbRun(db, 'DROP TABLE alertas_estoque_historico_almoxarifado');
    await dbRun(db, 'ALTER TABLE alertas_estoque_historico_almoxarifado_new RENAME TO alertas_estoque_historico_almoxarifado');
    await dbRun(db, 'INSERT INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_HISTORICO_NULLABLE]);
    console.log('✅ Migração alertas_estoque_historico (material_id nullable) aplicada');
  } finally {
    await dbRun(db, 'PRAGMA foreign_keys=ON');
  }
}

const MIGRATION_SALDO_LOTE_ID = 'estoque_saldo_lote_id_e_sem_retencao';

/**
 * Reconstroi estoque_saldo_almoxarifado (Etapa 6):
 *   - `lote TEXT` -> `lote_id INTEGER` (FK para lotes_almoxarifado);
 *   - remove quantidade_reservada/bloqueada/em_inspecao (nunca tiveram escritor);
 *   - troca a UNIQUE de tabela pelo indice com COALESCE.
 *
 * Reconstruir e seguro porque a sonda no dump de producao (2026-08-09) achou 3 linhas, todas com
 * lote IS NULL, e zero lotes em texto livre — nao ha dado a converter. Segue o padrao de
 * migrateHistoricoNullableMaterial.
 */
async function migrateSaldoLoteId(db) {
  await dbRun(db, `CREATE TABLE IF NOT EXISTS schema_migrations_almoxarifado (
    id TEXT PRIMARY KEY,
    applied_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const applied = await dbGet(db,
    'SELECT 1 as ok FROM schema_migrations_almoxarifado WHERE id = ?', [MIGRATION_SALDO_LOTE_ID]);
  if (applied) return;

  const tabela = await dbGet(db,
    `SELECT name FROM sqlite_master WHERE type='table' AND name='estoque_saldo_almoxarifado'`);
  const colLoteTexto = tabela && await dbGet(db,
    `SELECT name FROM pragma_table_info('estoque_saldo_almoxarifado') WHERE name = 'lote'`);

  // Banco novo (CREATE TABLE acima ja nasceu na forma nova) ou tabela ausente: nada a fazer.
  if (!tabela || !colLoteTexto) {
    await dbRun(db, 'INSERT OR IGNORE INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_SALDO_LOTE_ID]);
    return;
  }

  await dbRun(db, 'PRAGMA foreign_keys=OFF');
  try {
    await dbRun(db, `CREATE TABLE estoque_saldo_almoxarifado_new (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      material_id INTEGER NOT NULL,
      localizacao_id INTEGER,
      lote_id INTEGER,
      quantidade REAL DEFAULT 0,
      custo_medio REAL DEFAULT 0,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
      FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id),
      FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id)
    )`);

    // Converte o texto livre em lote de verdade. Em producao isto nao move nenhuma linha (zero
    // lotes em texto), mas bancos de desenvolvimento podem ter — e perder o dado em silencio
    // seria pior do que a coluna morta que estamos removendo.
    const comTexto = await dbAll(db,
      `SELECT DISTINCT material_id, TRIM(lote) as codigo FROM estoque_saldo_almoxarifado
       WHERE lote IS NOT NULL AND TRIM(lote) <> ''`);
    for (const linha of comTexto) {
      await dbRun(db,
        `INSERT OR IGNORE INTO lotes_almoxarifado (material_id, codigo, observacoes)
         VALUES (?,?,'Migrado do texto livre em 2026-08-09 (Etapa 6)')`,
        [linha.material_id, linha.codigo]);
    }

    // Soma ao consolidar: se duas linhas duplicadas existirem (a UNIQUE antiga nao impedia com
    // NULL), somar preserva o saldo; descartar uma delas perderia quantidade.
    await dbRun(db, `INSERT INTO estoque_saldo_almoxarifado_new
      (material_id, localizacao_id, lote_id, quantidade, custo_medio, updated_at)
      SELECT s.material_id, s.localizacao_id, l.id,
             SUM(s.quantidade), MAX(COALESCE(s.custo_medio,0)), MAX(s.updated_at)
      FROM estoque_saldo_almoxarifado s
      LEFT JOIN lotes_almoxarifado l
        ON l.material_id = s.material_id AND l.codigo = TRIM(s.lote)
      GROUP BY s.material_id, COALESCE(s.localizacao_id,0), COALESCE(l.id,0)`);

    await dbRun(db, 'DROP TABLE estoque_saldo_almoxarifado');
    await dbRun(db, 'ALTER TABLE estoque_saldo_almoxarifado_new RENAME TO estoque_saldo_almoxarifado');
    await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_saldo_almox_chave
      ON estoque_saldo_almoxarifado(material_id, COALESCE(localizacao_id,0), COALESCE(lote_id,0))`);
    await dbRun(db, 'INSERT INTO schema_migrations_almoxarifado (id) VALUES (?)',
      [MIGRATION_SALDO_LOTE_ID]);
    console.log('✅ Migração estoque_saldo (lote_id + sem colunas de retenção) aplicada');
  } finally {
    await dbRun(db, 'PRAGMA foreign_keys=ON');
  }
}

async function initSchema(db) {
  await ensureBaseTables(db);

  // ── Categorias ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS categorias_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT NOT NULL,
    parent_id INTEGER,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (parent_id) REFERENCES categorias_material_almoxarifado(id)
  )`);

  const catCount = await dbGet(db, 'SELECT COUNT(*) as c FROM categorias_material_almoxarifado');
  if (catCount.c === 0) {
    for (const nome of CATEGORIAS_SEED) {
      await dbRun(db, 'INSERT INTO categorias_material_almoxarifado (nome) VALUES (?)', [nome]);
    }
  }

  // ── Famílias de material ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS familias_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    categoria_id INTEGER,
    tipo_uso TEXT DEFAULT 'ambos',
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES categorias_material_almoxarifado(id)
  )`);

  const famCount = await dbGet(db, 'SELECT COUNT(*) as c FROM familias_material_almoxarifado');
  if (famCount.c === 0) {
    for (const [codigo, nome, descricao] of FAMILIAS_SEED) {
      await dbRun(db,
        'INSERT INTO familias_material_almoxarifado (codigo, nome, descricao) VALUES (?,?,?)',
        [codigo, nome, descricao]);
    }
  }

  // Subfamílias (Etapa 2, Task 3): NULL = família raiz; preenchido = subfamília.
  // Máximo 2 níveis (subfamília não pode ter filhos) — validado na rota, não no schema.
  await safeAlter(db, 'ALTER TABLE familias_material_almoxarifado ADD COLUMN parent_id INTEGER REFERENCES familias_material_almoxarifado(id)');

  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN familia_id INTEGER REFERENCES familias_material_almoxarifado(id)');

  // ── Unidades de medida ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS unidades_medida_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    sigla TEXT UNIQUE NOT NULL,
    descricao TEXT,
    ativo INTEGER DEFAULT 1
  )`);
  const umCount = await dbGet(db, 'SELECT COUNT(*) as c FROM unidades_medida_almoxarifado');
  if (umCount.c === 0) {
    for (const [sigla, desc] of UNIDADES_SEED) {
      await dbRun(db, 'INSERT INTO unidades_medida_almoxarifado (sigla, descricao) VALUES (?,?)', [sigla, desc]);
    }
  }

  // ── Extend materiais ──
  const materialCols = [
    'subcategoria_id INTEGER',
    'descricao_tecnica TEXT',
    'categoria_id INTEGER',
    'localizacao_padrao_id INTEGER',
    'fornecedor_id INTEGER',
    'tipo_material TEXT',
    'material_critico INTEGER DEFAULT 0',
    'controle_lote INTEGER DEFAULT 0',
    'controle_certificado INTEGER DEFAULT 0',
    'quantidade_reservada REAL DEFAULT 0',
    'quantidade_bloqueada REAL DEFAULT 0',
    'quantidade_em_inspecao REAL DEFAULT 0',
    'custo_medio REAL DEFAULT 0',
    'permite_saldo_negativo INTEGER DEFAULT 0',
    'subfamilia_id INTEGER',

    // ── Cadastro completo de material (Etapa 2, Task 4) ──
    'fabricante TEXT',
    'codigo_fabricante TEXT',
    'peso_unitario REAL',
    'dimensoes TEXT',
    'material_construtivo TEXT',
    'norma TEXT',
    'marca TEXT',
    'modelo TEXT',
    'aplicacao TEXT',
    'ponto_reposicao REAL',
    'lote_economico REAL',
    'controle_serie INTEGER DEFAULT 0',
    'controle_validade INTEGER DEFAULT 0',
    'controle_corrida INTEGER DEFAULT 0',
    'requer_inspecao INTEGER DEFAULT 0',
    'requer_foto INTEGER DEFAULT 0',
    'classe_abc TEXT',
    'unidade_compra TEXT',
    'fator_conversao_compra REAL',
    'unidade_consumo TEXT',
    'fator_conversao_consumo REAL',
  ];
  for (const col of materialCols) await safeAlter(db, `ALTER TABLE materiais_almoxarifado ADD COLUMN ${col}`);

  // ── Colunas que existiam SÓ em routes/almoxarifado.js (diff de segurança — Task 3,
  // unificação de DDL). Confirmado ausentes aqui antes da remoção do DDL duplicado. ──
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN tipo_material_id INTEGER REFERENCES tipos_material_almoxarifado(id)');
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN ponto_pedido REAL DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN prazo_reposicao_dias INTEGER DEFAULT 0');

  // Etapa 8: proprietario_cliente_id — o dono do material mora na linha do MATERIAL, nao na
  // linha de saldo. NULL = material nosso; preenchido = material de cliente.
  //
  // Por que na linha do material e nao no saldo: o disponivel deriva de
  // materiais_almoxarifado.quantidade_atual, um escalar POR MATERIAL
  // (stockService.getSaldoDisponivel). Repartir propriedade dentro do saldo faria esse escalar
  // misturar donos, e toda guarda de "saldo insuficiente" viraria cirurgia no nucleo do motor.
  // Razao semantica, igualmente forte: a chapa do Cliente X tem certificado e corrida proprios e
  // NAO pode ser trocada pela do Cliente Y — duas linhas de catalogo e o modelo correto.
  // Custo aceito: o catalogo ganha uma linha por cliente do mesmo item fisico.
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN proprietario_cliente_id INTEGER REFERENCES clientes(id)');
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_materiais_almox_proprietario
    ON materiais_almoxarifado (proprietario_cliente_id)`);

  // Etapa 8b (decisao 2 do design): a QUARTA coluna de retencao. Material no galvanizador continua
  // sendo nosso (quantidade_atual nao muda) mas nao esta disponivel para sair — igual as outras
  // tres. O QUE A DIFERENCIA DAS OUTRAS TRES, e isto decide a conferencia de inventario:
  // reservada/bloqueada/em_inspecao sao estados ADMINISTRATIVOS de material que ESTA na prateleira
  // e TEM de ser contado; `quantidade_em_terceiros` e a unica que significa "nao esta no predio".
  // Por isso so ela sai do esperado da contagem (routes/almoxarifado.js, POST /conferencias).
  // Quem "uniformizar as quatro" aqui quebra a contagem de inventario.
  //
  // A conta do disponivel que a consome mora em UM lugar so — services/almoxarifado/
  // availabilitySql.js. Ate esta etapa ela estava replicada a mao em 13 queries de 8 arquivos,
  // e acrescentar a coluna em 12 delas nao quebraria nada: o sistema so passaria a recusar pela
  // funcao e aceitar pelo SQL, com o numero errado em silencio.
  await safeAlter(db, 'ALTER TABLE materiais_almoxarifado ADD COLUMN quantidade_em_terceiros REAL DEFAULT 0');

  // ── Seed de tipos_material_almoxarifado (só existia no callback do CREATE TABLE da
  // rota — diff de segurança Task 3). Protegido por try/catch: alguns harnesses de teste
  // pré-criam essa tabela com um subconjunto mínimo de colunas (id, nome); nesses casos o
  // seed é ignorado silenciosamente, sem quebrar o restante do initSchema. ──
  try {
    const tiposCount = await dbGet(db, 'SELECT COUNT(*) as c FROM tipos_material_almoxarifado');
    if (tiposCount.c === 0) {
      for (const [nome, descricao, icone, cor, assinatura, termo, epi, controlado] of TIPOS_MATERIAL_ALMOX_SEED) {
        await dbRun(db,
          `INSERT INTO tipos_material_almoxarifado
           (nome, descricao, icone, cor, requer_assinatura, requer_termo, is_epi, is_controlado)
           VALUES (?,?,?,?,?,?,?,?)`,
          [nome, descricao, icone, cor, assinatura, termo, epi, controlado]);
      }
    }
  } catch (e) { /* tabela com schema mínimo (harness de teste) — seed ignorado com segurança */
    console.warn('[almoxarifado-schema] Seed ignorado:', e.message);
  }

  // ── Almoxarifados (entidade raiz — multi-almoxarifado) ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS almoxarifados (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    descricao TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Extend localizações ──
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN tipo TEXT DEFAULT \'Almoxarifado\'');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN almoxarifado_id INTEGER REFERENCES almoxarifados(id)');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN parent_id INTEGER');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_x REAL');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN pos_y REAL');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN largura REAL DEFAULT 120');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN altura REAL DEFAULT 80');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN subgrupo TEXT');
  // Restrições de endereço (Etapa 2, Task 2): localização bloqueada rejeita qualquer uso como
  // origem OU destino de movimento; tipos_material_permitidos (JSON array de strings, NULL =
  // sem restrição) só é avaliado quando a localização é destino. Ver validarLocalizacaoParaMovimento
  // em stockService.js.
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN bloqueada INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE localizacoes_almoxarifado ADD COLUMN tipos_material_permitidos TEXT');

  // ── Seed de localizacoes_almoxarifado (só existia no callback do CREATE TABLE da
  // rota — diff de segurança Task 3). Protegido por try/catch pelo mesmo motivo do
  // seed de tipos_material_almoxarifado acima. ──
  try {
    const locCount = await dbGet(db, 'SELECT COUNT(*) as c FROM localizacoes_almoxarifado');
    if (locCount.c === 0) {
      for (const [cod, desc, setor] of LOCALIZACOES_ALMOX_SEED) {
        await dbRun(db, 'INSERT INTO localizacoes_almoxarifado (codigo, descricao, setor) VALUES (?,?,?)', [cod, desc, setor]);
      }
    }
  } catch (e) { /* tabela com schema mínimo (harness de teste) — seed ignorado com segurança */
    console.warn('[almoxarifado-schema] Seed ignorado:', e.message);
  }

  // ── Migração: cria ALM-GERAL e vincula localizações existentes (incl. as seedadas acima) ──
  await migrateCriarAlmoxarifadoGeral(db);

  // ── Setores e áreas do almoxarifado ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS setores_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nome TEXT UNIQUE NOT NULL,
    codigo_prefixo TEXT NOT NULL,
    tipo TEXT NOT NULL DEFAULT 'area',
    ordem INTEGER DEFAULT 0,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  const setorCount = await dbGet(db, 'SELECT COUNT(*) as c FROM setores_almoxarifado');
  if (setorCount.c === 0) {
    for (const [nome, prefixo, tipo, ordem] of SETORES_ALMOX_SEED) {
      await dbRun(db,
        'INSERT INTO setores_almoxarifado (nome, codigo_prefixo, tipo, ordem) VALUES (?,?,?,?)',
        [nome, prefixo, tipo, ordem]);
    }
  }

  // ── Estoque por localização/lote ──
  // Etapa 6: `lote TEXT` virou `lote_id` (FK). As tres colunas de retencao que existiam aqui
  // (reservada/bloqueada/em_inspecao) foram REMOVIDAS: nada no sistema jamais escreveu nelas, a
  // soma era sempre 0, e manter coluna sem escritor e o padrao que ja causou tres bugs neste
  // modulo. A retencao mora exclusivamente em materiais_almoxarifado.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS estoque_saldo_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    localizacao_id INTEGER,
    lote_id INTEGER,
    quantidade REAL DEFAULT 0,
    custo_medio REAL DEFAULT 0,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
    FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id),
    FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id)
  )`);
  // O CREATE UNIQUE INDEX (idx_saldo_almox_chave) NAO vem aqui em seguida de propósito: numa base
  // já existente esta CREATE TABLE IF NOT EXISTS é no-op (a tabela já existe na forma ANTIGA, sem
  // `lote_id`), e criar o índice antes de migrateSaldoLoteId reconstruir a tabela quebraria o
  // boot com "no such column: lote_id". O índice é criado mais abaixo, depois da migração —
  // dentro da própria migração para quem reconstrói, e pela linha após a chamada para quem já
  // nasceu na forma nova.

  // ── Lotes (Etapa 6) ──
  // `VENCIDO` NAO e status: vencimento e derivado de data_validade < date('now'), calculado na
  // leitura. Gravar exigiria um cron para virar o status a meia-noite e criaria um estado que
  // diverge da data quando o cron falhasse — mais uma coluna mentindo. Derivado nao diverge.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS lotes_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    codigo TEXT NOT NULL,
    fornecedor_id INTEGER,
    fornecedor_nome TEXT,
    corrida TEXT,
    data_fabricacao DATE,
    data_validade DATE,
    certificado_arquivo TEXT,
    certificado_em DATETIME,
    certificado_por INTEGER,
    status TEXT NOT NULL DEFAULT 'ATIVO',
    status_motivo TEXT,
    recebimento_id INTEGER,
    recebimento_item_id INTEGER,
    nota_fiscal TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_por INTEGER,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(material_id, codigo),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // Etapa 6, Task 3b: liberacao de vencimento para uso. A tabela ja existe em producao desde a
  // Task 1 — por isso ALTER, nao CREATE TABLE. `vencido` continua 100% derivado de data_validade
  // (isVencido, em lotService); estas tres colunas nao mudam esse calculo, so registram QUEM
  // liberou o uso de um lote vencido, QUANDO e POR QUE — um fato datado e assinado, nao um
  // "desvencimento". Ver lotService.liberarVencimento e a guarda em stockService.
  await safeAlter(db, 'ALTER TABLE lotes_almoxarifado ADD COLUMN vencimento_liberado_em DATETIME');
  await safeAlter(db, 'ALTER TABLE lotes_almoxarifado ADD COLUMN vencimento_liberado_por INTEGER');
  await safeAlter(db, 'ALTER TABLE lotes_almoxarifado ADD COLUMN vencimento_liberado_motivo TEXT');

  // Migração de estoque_saldo_almoxarifado (lote_id + sem colunas de retenção) — precisa rodar
  // DEPOIS do CREATE TABLE de lotes_almoxarifado acima, porque reconstrução insere lotes nele.
  await migrateSaldoLoteId(db);
  // Índice idempotente: no-op se a migração acima já criou (banco antigo reconstruído); cria de
  // fato quando a tabela já nasceu na forma nova (banco novo, migração saiu pelo early-return).
  await dbRun(db, `CREATE UNIQUE INDEX IF NOT EXISTS idx_saldo_almox_chave
    ON estoque_saldo_almoxarifado(material_id, COALESCE(localizacao_id,0), COALESCE(lote_id,0))`);

  // Etapa 6b: series_almoxarifado — registro de posse por unidade fisica (1 linha = 1
  // unidade). NAO existe serie_id em estoque_saldo_almoxarifado (decisao de design da 6b):
  // o saldo agregado continua em quantidade_atual + estoque_saldo; o invariante
  // COUNT(series presentes) == quantidade_atual e coberto por teste
  // (tests/helpers/serieInvariante.js).
  await dbRun(db, `CREATE TABLE IF NOT EXISTS series_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    numero TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'EM_ESTOQUE',
    status_motivo TEXT,
    lote_id INTEGER,
    localizacao_id INTEGER,
    recebimento_id INTEGER,
    recebimento_item_id INTEGER,
    movimentacao_entrada_id INTEGER,
    movimentacao_saida_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    created_por INTEGER,
    updated_at DATETIME,
    UNIQUE (material_id, numero),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id),
    FOREIGN KEY (lote_id) REFERENCES lotes_almoxarifado(id),
    FOREIGN KEY (localizacao_id) REFERENCES localizacoes_almoxarifado(id)
  )`);
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_series_almox_material_status
    ON series_almoxarifado (material_id, status)`);

  // ── Extend movimentações ──
  const movCols = [
    'localizacao_origem_id INTEGER',
    'localizacao_destino_id INTEGER',
    'lote TEXT',
    'lote_id INTEGER',
    'unidade TEXT',
    'projeto_id INTEGER',
    'os_id INTEGER',
    'cliente_id INTEGER',
    'documento_vinculado TEXT',
    'justificativa TEXT',
    'cancelado INTEGER DEFAULT 0',
    'cancelado_por INTEGER',
    'cancelado_em DATETIME',
    'cancelamento_motivo TEXT',
    'movimento_estorno_id INTEGER',
    'reserva_id INTEGER',
    'recebimento_id INTEGER',
    'requisicao_id INTEGER',
  ];
  for (const col of movCols) await safeAlter(db, `ALTER TABLE movimentacoes_almoxarifado ADD COLUMN ${col}`);

  // ── Reservas ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS reservas_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    quantidade REAL NOT NULL,
    quantidade_utilizada REAL DEFAULT 0,
    projeto_id INTEGER,
    os_id INTEGER,
    os_referencia TEXT,
    cliente_id INTEGER,
    equipamento TEXT,
    submontagem TEXT,
    status TEXT DEFAULT 'ATIVA',
    solicitante_id INTEGER,
    solicitante_nome TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // Etapa 4 — prazo da reserva e rastro da liberação.
  // `expira_em` é a data limite do hold: o job POST /reservas/processar-expiracao devolve ao
  // disponível tudo que passou dessa data (reserva sem a coluna preenchida nunca expira).
  // O trio liberado_* responde "quem soltou, quando e por quê" — sem ele a liberação
  // (e a expiração) só existia como movimentação, sem dono na própria reserva.
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN data_necessidade DATE');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN expira_em DATE');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN liberado_por INTEGER');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN liberado_em DATETIME');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN motivo_liberacao TEXT');

  // Etapa 4 — vínculo da reserva com a requisição que a originou (ligação 04→07).
  // `requisicao_id`/`item_requisicao_id` são o que permite à entrega achar a reserva DAQUELE
  // item e consumi-la (stockService.registrarMovimentacao com reserva_id) em vez de disputar
  // o disponível geral — sem esse vínculo a reserva da aprovação seria um hold contra a
  // própria requisição. `origem` separa o que nasceu do fluxo (REQUISICAO) do que alguém
  // reservou à mão (MANUAL): só a primeira pode ser consumida automaticamente pela entrega.
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN requisicao_id INTEGER');
  await safeAlter(db, 'ALTER TABLE reservas_material_almoxarifado ADD COLUMN item_requisicao_id INTEGER');
  await safeAlter(db, "ALTER TABLE reservas_material_almoxarifado ADD COLUMN origem TEXT DEFAULT 'MANUAL'");

  // ── Recebimentos ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS recebimentos_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    pedido_compra_id INTEGER,
    nota_fiscal TEXT,
    fornecedor_id INTEGER,
    fornecedor_nome TEXT,
    data_recebimento DATETIME DEFAULT CURRENT_TIMESTAMP,
    status TEXT DEFAULT 'RECEBIDO',
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS recebimentos_material_itens_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recebimento_id INTEGER NOT NULL,
    material_id INTEGER NOT NULL,
    quantidade_esperada REAL NOT NULL,
    quantidade_recebida REAL,
    conferencia_quantidade INTEGER DEFAULT 0,
    conferencia_descricao INTEGER DEFAULT 0,
    lote TEXT,
    observacoes TEXT,
    FOREIGN KEY (recebimento_id) REFERENCES recebimentos_material_almoxarifado(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS inspecoes_recebimento_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recebimento_item_id INTEGER NOT NULL,
    conforme INTEGER DEFAULT 1,
    divergencia_quantidade INTEGER DEFAULT 0,
    divergencia_dimensional INTEGER DEFAULT 0,
    certificado_ausente INTEGER DEFAULT 0,
    dano_fisico INTEGER DEFAULT 0,
    material_incorreto INTEGER DEFAULT 0,
    acao TEXT,
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    data_inspecao DATETIME DEFAULT CURRENT_TIMESTAMP,
    observacoes TEXT,
    FOREIGN KEY (recebimento_item_id) REFERENCES recebimentos_material_itens_almoxarifado(id)
  )`);

  // Etapa 5 — a decisao da inspecao passa a ter quantidade, porque "aprovar parcialmente" e
  // requisito original (secao 9). `encaminhamento` registra o destino pretendido do material
  // reprovado (requisito "Solicitar devolucao ao fornecedor / analise da Engenharia /
  // substituicao"); a SAIDA em si e da feature 12.
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN quantidade_aprovada REAL');
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN quantidade_reprovada REAL');
  await safeAlter(db, 'ALTER TABLE inspecoes_recebimento_almoxarifado ADD COLUMN encaminhamento TEXT');

  const recebCols = [
    "tipo_recebimento TEXT DEFAULT 'NOTA_FISCAL'",
    'fornecedor_cnpj TEXT',
    'pedido_compra_numero TEXT',
    'nota_serie TEXT',
    'data_emissao_nf DATE',
    'data_entrada_nf DATE',
    'cfop_nota TEXT',
    'cfop_entrada TEXT',
    'chave_nfe TEXT',
    'base_icms REAL DEFAULT 0',
    'valor_icms REAL DEFAULT 0',
    'valor_produtos REAL DEFAULT 0',
    'frete REAL DEFAULT 0',
    'desconto REAL DEFAULT 0',
    'outras_despesas REAL DEFAULT 0',
    'valor_ipi REAL DEFAULT 0',
    'valor_total_nota REAL DEFAULT 0',
    'compras_responsavel_id INTEGER',
    'compras_responsavel_nome TEXT',
    'compras_data DATETIME',
    'faturamento_responsavel_id INTEGER',
    'faturamento_responsavel_nome TEXT',
    'faturamento_data DATETIME',
    'contas_pagar_id INTEGER',
    'etapa_atual TEXT DEFAULT \'ALMOXARIFADO\'',
  ];
  for (const col of recebCols) await safeAlter(db, `ALTER TABLE recebimentos_material_almoxarifado ADD COLUMN ${col}`);

  const recebItemCols = [
    'valor_unitario REAL DEFAULT 0',
    'valor_total REAL DEFAULT 0',
    'valor_icms REAL DEFAULT 0',
    'valor_ipi REAL DEFAULT 0',
    'reducao_icms_percent REAL DEFAULT 0',
    // Etapa 5, correcao de review: quanto DESTE item especifico esta retido em quarentena.
    // Antes a inspecao inferia o retido de quantidade_recebida (que conferirRecebimento pode
    // sobrescrever sem guarda) e a fila filtrava por quantidade_em_inspecao do MATERIAL (um pool
    // compartilhado entre itens de recebimentos diferentes). Rastrear por item e o mesmo rigor
    // da Etapa 4, que vinculou a reserva ao item via item_requisicao_id.
    'quantidade_em_inspecao REAL DEFAULT 0',
    // Etapa 6: o lote nasce aqui. `lote` TEXT ja existia e vira o codigo digitado na conferencia;
    // estes quatro completam o que a NF traz e o lote precisa. `data_fabricacao_lote` entrou no
    // review final: `lotes_almoxarifado.data_fabricacao` existia desde a Task 1 e NINGUEM a
    // escrevia — coluna sem escritor, exatamente o padrao que esta etapa veio combater. Ou ganhava
    // escritor, ou saia; ganhou (tela do recebimento -> item -> lote).
    'lote_id INTEGER',
    'data_validade_lote DATE',
    'data_fabricacao_lote DATE',
    'corrida_lote TEXT',
    // Etapa 6, review final: marca de idempotencia da entrada no estoque. `darEntradaEstoque`
    // reclama o item aqui (UPDATE ... WHERE entrada_estoque_em IS NULL) ANTES de mover saldo, e
    // pula quem ja entrou. Sem isto, uma nota que falhava no meio podia ser reprocessada e
    // creditava DE NOVO os itens que ja tinham entrado (reproduzido: 10 viraram 20).
    'entrada_estoque_em DATETIME',
    // Etapa 6b, Task 6: numeros de serie da NF para este item, um por linha (texto livre, igual
    // ao campo `lote`). `darEntradaEstoque` faz o parse e declara `exigeSerie` ao motor; o motor
    // e quem cria/reativa as linhas em series_almoxarifado. Este texto e so o que o operador
    // digitou — a fonte de verdade de "quais series existem" continua sendo series_almoxarifado.
    'series TEXT',
  ];
  for (const col of recebItemCols) await safeAlter(db, `ALTER TABLE recebimentos_material_itens_almoxarifado ADD COLUMN ${col}`);
  await migrateBackfillItemQuantidadeEmInspecao(db);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_pedido_compra (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    pedido_id INTEGER NOT NULL,
    material_id INTEGER,
    codigo TEXT,
    descricao TEXT,
    quantidade REAL NOT NULL DEFAULT 1,
    valor_unitario REAL DEFAULT 0,
    unidade TEXT DEFAULT 'UN',
    FOREIGN KEY (pedido_id) REFERENCES pedidos_compra(id),
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // ── Devoluções ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS devolucoes_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    quantidade REAL NOT NULL,
    motivo TEXT NOT NULL,
    condicao TEXT,
    destino TEXT DEFAULT 'ESTOQUE',
    origem_os_id INTEGER,
    origem_projeto_id INTEGER,
    responsavel_id INTEGER,
    responsavel_nome TEXT,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // Etapa 7: vinculo da devolucao a entrega que ela desfaz, e o lote que voltou. Via safeAlter
  // porque a tabela ja existe em producao. `movimentacao_saida_id` e o que permite validar
  // "nao devolver mais do que foi entregue" e dar rastro; `lote_id` e o lote herdado da saida
  // (ou informado a mao numa devolucao avulsa) — sem ele, o saldo devolvido de material
  // controlado ficava preso: entrava com lote NULL e a saida seguinte, que exige lote, nao
  // achava nenhum.
  await safeAlter(db, 'ALTER TABLE devolucoes_material_almoxarifado ADD COLUMN movimentacao_saida_id INTEGER');
  await safeAlter(db, 'ALTER TABLE devolucoes_material_almoxarifado ADD COLUMN lote_id INTEGER');

  // ── Etapa 8b: remessas para terceiros ──────────────────────────────────────────────────────
  // fornecedor_id e INTEGER SOLTO + fornecedor_nome espelhado, SEM FK. Padrao do modulo
  // (lotes_almoxarifado, recebimentos_material_almoxarifado) e a razao e concreta: `fornecedores`
  // e criada em server/index.js, NAO por este initSchema, e por isso pode nao existir — uma FK
  // aqui faria a criacao da tabela falhar. O nome espelhado tambem preserva o documento se o
  // fornecedor for renomeado depois.
  //
  // proprietario_cliente_id: quando a chapa que vai galvanizar e de um CLIENTE, a remessa e
  // isenta da guarda de OS/projeto (ownerRules.TIPOS_ISENTOS_DONO) — mas com contrapartida
  // OBRIGATORIA: o dono fica registrado aqui e o documento de remessa nomeia o cliente. Sem isso
  // a isencao viraria um caminho para material de cliente sair do predio sem rastro de
  // propriedade, o oposto do que a Etapa 8 construiu. Nao se cria conceito novo: e o mesmo
  // proprietario_cliente_id de materiais_almoxarifado.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS remessas_terceiro_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    numero TEXT UNIQUE NOT NULL,
    fornecedor_id INTEGER,
    fornecedor_nome TEXT,
    tipo_servico TEXT,
    os_id INTEGER,
    projeto_id INTEGER,
    pedido_compra_id INTEGER,
    proprietario_cliente_id INTEGER,
    proprietario_cliente_nome TEXT,
    prazo_previsto DATE,
    status TEXT NOT NULL DEFAULT 'ABERTA',
    observacoes TEXT,
    criado_por INTEGER,
    criado_por_nome TEXT,
    enviado_em DATETIME,
    enviado_por INTEGER,
    encerrado_em DATETIME,
    encerrado_por INTEGER,
    encerramento_destino TEXT,
    encerramento_justificativa TEXT,
    cancelado_em DATETIME,
    cancelado_por INTEGER,
    cancelamento_motivo TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // `enviado_em` no ITEM (nao so no cabecalho) e o claim de idempotencia do envio, no molde
  // exato de recebimentos_material_itens_almoxarifado.entrada_estoque_em: de duas execucoes
  // (reprocessamento, dois cliques em "Enviar") so uma casa `enviado_em IS NULL` e move estoque.
  // A Etapa 7 mostrou o custo de nao ter isso: reprocessar nota com falha no meio duplicava
  // estoque.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS itens_remessa_terceiro_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remessa_id INTEGER NOT NULL REFERENCES remessas_terceiro_almoxarifado(id),
    material_id INTEGER NOT NULL REFERENCES materiais_almoxarifado(id),
    quantidade REAL NOT NULL,
    quantidade_retornada REAL DEFAULT 0,
    lote_id INTEGER,
    peso REAL,
    observacoes TEXT,
    enviado_em DATETIME,
    movimentacao_envio_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // O retorno e uma LISTA DE RESULTADOS, nao um escalar "quantidade que voltou" (decisao 7 do
  // design). Na 8b `material_id` e SEMPRE igual ao material do item enviado; na Etapa 8c
  // (transformacao chapa -> pecas cortadas + sobra) ele passa a poder ser OUTRO, e o vinculo de
  // rastreabilidade item enviado -> resultado ja existe. Modelar como escalar agora obrigaria a
  // 8c a reescrever a tabela.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS retornos_remessa_item_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    remessa_id INTEGER NOT NULL REFERENCES remessas_terceiro_almoxarifado(id),
    item_remessa_id INTEGER NOT NULL REFERENCES itens_remessa_terceiro_almoxarifado(id),
    material_id INTEGER NOT NULL REFERENCES materiais_almoxarifado(id),
    quantidade REAL NOT NULL,
    lote_id INTEGER,
    nota_fiscal TEXT,
    observacoes TEXT,
    movimentacao_id INTEGER,
    recebido_por INTEGER,
    recebido_por_nome TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Etapa 8c: a linha de resultado passa a saber que TIPO de resultado ela e ────────────────
  //
  // Ate a 8b todo resultado tinha material_id igual ao do item enviado — o retorno era do MESMO
  // material (tratamento termico, pintura, galvanizacao). Na transformacao (corte, dobra,
  // usinagem) sai UMA chapa e voltam 40 pecas e uma sobra: material diferente, unidade diferente,
  // e custo que precisa ser rateado.
  //
  // safeAlter e nao recriacao de tabela: as linhas ja gravadas nascem com NULL nas tres colunas, e
  // NULL AQUI SIGNIFICA ALGUMA COISA — "retorno simples, nao e transformacao". Nao e buraco de
  // migracao: e o valor correto, e e o que permite separar os dois mundos com
  // `WHERE tipo_resultado IS NOT NULL` sem tabela nova e sem backfill.
  //
  // tipo_resultado: 'PECA' | 'SOBRA' (TIPOS_RESULTADO) | NULL. E a CLASSIFICACAO DA LINHA que
  //   decide o rateio (decisao 4 e 8 do design): PECA recebe rateio, SOBRA entra a ZERO. A sobra
  //   nao e material especial — e material normal, com codigo e cadastro, e a categoria
  //   'Sucata e sobras reaproveitáveis' ja existe no CATEGORIAS_SEED deste arquivo.
  //   Por que a sobra entra a zero: chapa de R$ 1.000 -> 40 pecas + 1 sobra que e um terco da
  //   chapa; rateando por quantidade em 41 linhas a sobra carrega 2,4% do valor e as pecas ficam
  //   ~40% caras. A sobra e UMA linha e uma FATIA GRANDE — e ela que envenena a media.
  //
  // custo_unitario_aplicado: o custo POR UNIDADE que foi creditado NESTA linha, no momento em que
  //   ela foi criada. NAO e o custo atual do material (esse muda a cada entrada seguinte) — e o
  //   registro do que o rateio decidiu, e e o unico lugar onde ele fica auditavel, porque
  //   movimentacoes_almoxarifado NAO TEM coluna de custo (decisao 10 do design: acrescenta-la
  //   exigiria decidir baixa valorizada/CMV para o modulo inteiro).
  //
  // movimentacao_consumo_id: aponta para a movimentacao CONSUMO_TERCEIRO que baixou a chapa.
  //   Espelha `movimentacao_id`, que ja existe e aponta para o CREDITO desta linha. Um aponta para
  //   a entrada da peca, o outro para a baixa da chapa — os dois lados da mesma transformacao.
  //   E ELE E O AGRUPADOR DO EVENTO: as N linhas de uma transformacao compartilham o mesmo valor.
  //   E por isso que NAO existe coluna `quantidade_consumida` nem `custo_servico` aqui: uma
  //   transformacao e um EVENTO COM N LINHAS e esta tabela nao tem cabecalho de evento; grava-los
  //   em cada linha faria qualquer SUM() ingenuo contar o mesmo consumo N vezes. O cabecalho ja
  //   existe — e a propria movimentacao CONSUMO_TERCEIRO, cuja `quantidade` E o consumo.
  await safeAlter(db, 'ALTER TABLE retornos_remessa_item_almoxarifado ADD COLUMN tipo_resultado TEXT');
  await safeAlter(db, 'ALTER TABLE retornos_remessa_item_almoxarifado ADD COLUMN custo_unitario_aplicado REAL');
  await safeAlter(db, 'ALTER TABLE retornos_remessa_item_almoxarifado ADD COLUMN movimentacao_consumo_id INTEGER');

  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_remessa_terceiro_status ON remessas_terceiro_almoxarifado(status)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_remessa_terceiro_prazo ON remessas_terceiro_almoxarifado(prazo_previsto)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_itens_remessa_terceiro ON itens_remessa_terceiro_almoxarifado(remessa_id)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_retornos_remessa_item ON retornos_remessa_item_almoxarifado(item_remessa_id)');
  // O agrupador do evento (todas as N linhas de uma transformacao compartilham o mesmo
  // movimentacao_consumo_id): sem indice, "quais linhas sairam desta baixa de chapa" e varredura
  // da tabela inteira de resultados.
  await dbRun(db, `CREATE INDEX IF NOT EXISTS idx_retornos_remessa_consumo
    ON retornos_remessa_item_almoxarifado(movimentacao_consumo_id)`);

  // ── Sobras/Scrap ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS sobras_material_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER,
    tipo_material TEXT,
    dimensoes_originais TEXT,
    dimensoes_restantes TEXT,
    espessura REAL,
    material_descricao TEXT,
    peso_aproximado REAL,
    localizacao_id INTEGER,
    projeto_origem_id INTEGER,
    os_origem_id INTEGER,
    reutilizavel INTEGER DEFAULT 1,
    status TEXT DEFAULT 'DISPONIVEL',
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Etapa 9, Task 1: sobra ganha rastro de retalhamento ─────────────────────────────────────
  //
  // `material_id` (coluna original, acima) passa a ser lida como material de ORIGEM a partir
  // daqui: o material do qual a sobra foi retalhada. NULL continua significando sobra legada,
  // criada antes desta etapa, sem material de origem rastreado — nao e buraco de migracao, e o
  // valor correto para o que existia antes.
  //
  // norma/diametro/largura/comprimento: dimensoes ESTRUTURADAS da sobra (perfil, chapa, barra).
  //   `dimensoes_originais`/`dimensoes_restantes` (texto livre, colunas ja existentes) continuam
  //   existindo — estas colunas SOMAM para permitir filtro e ordenacao, nao substituem o texto.
  // foto: caminho do upload, no mesmo molde das outras evidencias fotograficas do modulo.
  // criado_por_id/criado_por_nome: quem gerou a sobra. Ausentes ate aqui porque o `user` de
  //   atualizarSobra (e o `criarSobra` da rota aposentada) era parametro morto — nunca gravado.
  //   E o retrato exato da pendencia nomeada na spec 23: unico servico de cauda do modulo sem
  //   rastreabilidade de autor.
  // lote_origem_id: o lote do material de origem, quando ele controla lote — sem isso a sobra de
  //   um lote com certificado perderia o vinculo ao ser gerada.
  // material_retalho_id: o material CADASTRADO que representa esta sobra no catalogo — a sobra
  //   tambem e um material normal, como a linha SOBRA da transformacao da Etapa 8c (ver
  //   TIPOS_RESULTADO acima).
  // movimentacao_baixa_id / movimentacao_entrada_id: os dois lados do evento de retalhamento no
  //   livro — a baixa do material de origem e a entrada do material_retalho_id gerado. Mesmo
  //   raciocinio do par de movimentacoes que retornos_remessa_item_almoxarifado.movimentacao_id /
  //   movimentacao_consumo_id usa acima: um evento, duas pontas, dois fios para auditar.
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN norma TEXT');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN diametro REAL');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN largura REAL');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN comprimento REAL');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN foto TEXT');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN criado_por_id INTEGER');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN criado_por_nome TEXT');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN lote_origem_id INTEGER');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN material_retalho_id INTEGER');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN movimentacao_baixa_id INTEGER');
  await safeAlter(db, 'ALTER TABLE sobras_material_almoxarifado ADD COLUMN movimentacao_entrada_id INTEGER');

  // ── Etapa 9, Task 6: sucateamento e um PROCESSO, nao uma baixa solta ────────────────────────
  //
  // Ate a Etapa 9 sucatear era escolher `SUCATA` no formulario generico de movimentacao: um clique
  // de quem tem `movimentar` apagava material do patrimonio sem ninguem mais saber. A Task 5 fechou
  // aquela porta (SUCATA entrou em TIPOS_DEDICADOS) e esta tabela e o que passa a existir no lugar:
  // solicitacao -> duas assinaturas segregadas -> baixa emitida pelo motor -> destino final.
  //
  // AS DUAS PERNAS DE APROVACAO SAO COLUNAS, NAO ESTADOS (decisao 9 do design, e o docstring de
  // scrapDisposalStateMachine.js explica por que). Cada perna guarda id + nome + hora, porque
  // "quem assinou" e a pergunta que a dupla aprovacao existe para responder — e um status unico
  // nao responde. O `status` so vira APROVADO quando a SEGUNDA assinatura chega, decidido pelo
  // CASE do claim em scrapDisposalService.aprovar (UPDATE unico guardado no WHERE).
  //
  // lote_id: obrigatorio NO SERVICO quando o material tem controle_lote — a exigencia depende de
  //   uma coluna do MATERIAL, que o DDL nao tem como olhar. Sem ele, a baixa da segunda assinatura
  //   seria recusada pelo motor com as duas assinaturas ja gastas.
  // sobra_id: sucatear um retalho REGISTRADO (a linha de sobras_material_almoxarifado da Task 1/3).
  //   NULL e o caso comum — sucata que nunca foi retalho.
  // justificativa NOT NULL: o motor EXIGE justificativa em SUCATA (movementRules.REGRAS_VINCULO).
  //   Ela nasce obrigatoria aqui para a recusa acontecer na SOLICITACAO, e nao na segunda
  //   assinatura, quando ja custou duas pessoas.
  // projeto_origem_id / os_origem_id: o vinculo. Opcionais para material NOSSO e OBRIGATORIOS para
  //   material de cliente — SUCATA esta em ownerRules.TIPOS_SAIDA_COM_DONO, entao a baixa exige OS
  //   ou projeto DO DONO. Quem recusa (na solicitacao, com a mensagem da propria guarda) e
  //   scrapDisposalService.solicitar.
  // movimentacao_sucata_id: a baixa emitida na 2a aprovacao. NULL com status APROVADO NAO e estado
  //   alcancavel — se o motor recusar, o servico compensa o claim e o processo volta a SOLICITADO.
  // valor_venda / comprovante_arquivo / destino_registrado_*: o destino final (VENDIDA|DESCARTADA),
  //   registrado DEPOIS da baixa. `valor_venda` alimenta o relatorio financeiro de sucata
  //   (decisao 10), que cruza estas linhas com os lancamentos SUCATA do livro.
  //
  // SEM FK para materiais/lotes/sobras, seguindo o padrao das tabelas vizinhas desta etapa
  // (sobras_material_almoxarifado, devolucoes_material_almoxarifado): o modulo usa INTEGER solto
  // e valida no servico, onde a mensagem de erro pode ensinar o caminho em vez de estourar
  // SQLITE_CONSTRAINT.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS sucateamentos_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    lote_id INTEGER,
    sobra_id INTEGER,
    quantidade REAL NOT NULL,
    classificacao TEXT,
    peso_estimado REAL,
    projeto_origem_id INTEGER,
    os_origem_id INTEGER,
    justificativa TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'SOLICITADO',
    solicitante_id INTEGER,
    solicitante_nome TEXT,
    aprovador_almox_id INTEGER,
    aprovador_almox_nome TEXT,
    aprovado_almox_em DATETIME,
    aprovador_gestao_id INTEGER,
    aprovador_gestao_nome TEXT,
    aprovado_gestao_em DATETIME,
    rejeitado_por_id INTEGER,
    rejeitado_por_nome TEXT,
    motivo_rejeicao TEXT,
    rejeitado_em DATETIME,
    movimentacao_sucata_id INTEGER,
    valor_venda REAL,
    comprovante_arquivo TEXT,
    destino_registrado_por_id INTEGER,
    destino_registrado_por_nome TEXT,
    destino_registrado_em DATETIME,
    observacoes TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // A fila de pendencias e a tela: "o que esta esperando a minha assinatura" filtra por status.
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_sucateamento_status ON sucateamentos_almoxarifado(status)');
  await dbRun(db, 'CREATE INDEX IF NOT EXISTS idx_sucateamento_material ON sucateamentos_almoxarifado(material_id)');

  // ── Ferramentas ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ferramentas_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo_patrimonio TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    tipo TEXT,
    setor_responsavel TEXT,
    status TEXT DEFAULT 'DISPONIVEL',
    material_id INTEGER,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS emprestimos_ferramenta_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL,
    colaborador_id INTEGER,
    colaborador_nome TEXT NOT NULL,
    setor TEXT,
    data_retirada DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_prevista_devolucao DATETIME,
    data_devolucao_real DATETIME,
    status TEXT DEFAULT 'EMPRESTADA',
    observacoes TEXT,
    FOREIGN KEY (ferramenta_id) REFERENCES ferramentas_almoxarifado(id)
  )`);

  await dbRun(db, `CREATE TABLE IF NOT EXISTS calibracoes_ferramenta_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL,
    data_calibracao DATE NOT NULL,
    data_validade DATE NOT NULL,
    certificado_path TEXT,
    observacoes TEXT,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ferramenta_id) REFERENCES ferramentas_almoxarifado(id)
  )`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS manutencoes_ferramenta_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL,
    descricao TEXT NOT NULL,
    data_inicio DATETIME DEFAULT CURRENT_TIMESTAMP,
    data_fim DATETIME,
    observacoes TEXT,
    usuario_id INTEGER,
    FOREIGN KEY (ferramenta_id) REFERENCES ferramentas_almoxarifado(id)
  )`);
  await dbRun(db, `CREATE TABLE IF NOT EXISTS ocorrencias_ferramenta_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ferramenta_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    descricao TEXT NOT NULL,
    responsavel_colaborador_id INTEGER,
    responsavel_nome TEXT,
    foto_path TEXT,
    usuario_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ferramenta_id) REFERENCES ferramentas_almoxarifado(id)
  )`);
  await safeAlter(db, 'ALTER TABLE ferramentas_almoxarifado ADD COLUMN numero_serie TEXT');
  await safeAlter(db, 'ALTER TABLE ferramentas_almoxarifado ADD COLUMN localizacao_id INTEGER');
  await safeAlter(db, 'ALTER TABLE ferramentas_almoxarifado ADD COLUMN exige_calibracao INTEGER DEFAULT 0');

  // ── Materiais do cliente ──
  // ── APOSENTADA na Etapa 8 (decisao 4 do design, 2026-08-12) ──────────────────────────────────
  // NAO tem escritor nem leitor no codigo: o clientMaterialService.js foi removido e as tres rotas
  // /materiais-cliente sairam junto (Task 7). Material de cliente virou material normal com dono
  // (materiais_almoxarifado.proprietario_cliente_id).
  //
  // Por que o CREATE TABLE continua aqui em vez de um DROP: a medicao de "0 linhas" foi feita no
  // banco de DESENVOLVIMENTO, e apagar tabela com base em medicao que nao cobre producao nao tem
  // volta. O CREATE IF NOT EXISTS e inofensivo (cria vazia num banco novo, nao toca num existente).
  //
  // Quem for remover de vez: (1) confirme em PRODUCAO
  //     SELECT COUNT(*) AS total,
  //            SUM(CASE WHEN ativo = 1 THEN 1 ELSE 0 END) AS ativos
  //       FROM materiais_cliente_almoxarifado;
  // (2) se houver linha, migre para materiais_almoxarifado + movimentacao de entrada ANTES — o
  // `descricao` e texto livre sem FK, entao a migracao e assistida, nao automatica; (3) so entao
  // o DROP. As rotas de escrita ja sairam nos dois cenarios: eram o caminho sem guarda.
  await dbRun(db, `CREATE TABLE IF NOT EXISTS materiais_cliente_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cliente_id INTEGER NOT NULL,
    projeto_id INTEGER,
    os_id INTEGER,
    descricao TEXT NOT NULL,
    nota_remessa TEXT,
    quantidade_recebida REAL DEFAULT 0,
    quantidade_consumida REAL DEFAULT 0,
    quantidade_saldo REAL DEFAULT 0,
    unidade TEXT DEFAULT 'UN',
    localizacao_id INTEGER,
    observacoes TEXT,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Anexos ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS anexos_documento_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entidade TEXT NOT NULL,
    entidade_id INTEGER NOT NULL,
    tipo TEXT NOT NULL,
    arquivo_path TEXT NOT NULL,
    nome_original TEXT,
    uploaded_by INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Auditoria ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS auditoria_log_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    entidade TEXT NOT NULL,
    entidade_id INTEGER,
    acao TEXT NOT NULL,
    usuario_id INTEGER,
    usuario_nome TEXT,
    dados_anteriores TEXT,
    dados_novos TEXT,
    justificativa TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Solicitações de compra (integração futura) ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS solicitacoes_compra_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER NOT NULL,
    quantidade REAL NOT NULL,
    motivo TEXT DEFAULT 'ESTOQUE_MINIMO',
    projeto_id INTEGER,
    os_id INTEGER,
    cliente_id INTEGER,
    status TEXT DEFAULT 'PENDENTE',
    pedido_compra_id INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  // ── Alertas de estoque mínimo ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS alertas_estoque_material_almoxarifado (
    material_id INTEGER PRIMARY KEY,
    estado_estoque TEXT DEFAULT 'ACIMA',
    ultimo_alerta_enviado DATETIME,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);
  await safeAlter(db, "ALTER TABLE alertas_estoque_material_almoxarifado ADD COLUMN estado_estoque TEXT DEFAULT 'ACIMA'");

  await dbRun(db, `CREATE TABLE IF NOT EXISTS alertas_estoque_historico_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    material_id INTEGER,
    canal TEXT NOT NULL,
    destinatario TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ENVIADO',
    erro TEXT,
    teste INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (material_id) REFERENCES materiais_almoxarifado(id)
  )`);

  await migrateHistoricoNullableMaterial(db);

  // ── Perfis de usuário no almoxarifado ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS perfil_almoxarifado_usuario (
    usuario_id INTEGER PRIMARY KEY,
    perfil TEXT NOT NULL DEFAULT 'PRODUCAO',
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);

  // ── Setores requisitantes e permissões de material ──
  const { ensureSetoresRequisicao } = require('./sectorMaterialService');
  await ensureSetoresRequisicao(db);

  // ── Extend requisições ──
  const reqCols = [
    'projeto_id INTEGER', 'cliente_id INTEGER', 'equipamento TEXT',
    'prioridade TEXT DEFAULT \'NORMAL\'', 'data_necessidade DATE', 'setor TEXT',
    'justificativa TEXT', 'modulo_origem TEXT',
  ];
  for (const col of reqCols) await safeAlter(db, `ALTER TABLE requisicoes_almoxarifado ADD COLUMN ${col}`);

  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN ativo INTEGER DEFAULT 1');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN ultimo_lembrete_enviado DATETIME');

  // ── Liberação por valor ──
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN valor_total REAL DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN requer_aprovacao_valor INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN aprovador_valor_id INTEGER');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN aprovador_valor_nome TEXT');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN data_aprovacao_valor DATETIME');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN rejeicao_valor_motivo TEXT');

  // ── Etapa 3 (Task 1): tipo de requisição, centro de custo, local de entrega,
  // confirmação de recebimento (pelo solicitante) e encerramento (perfil aprovar_requisicao). ──
  await safeAlter(db, "ALTER TABLE requisicoes_almoxarifado ADD COLUMN tipo_requisicao TEXT DEFAULT 'CONSUMO'");
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN centro_custo_id INTEGER');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN local_entrega TEXT');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN recebimento_confirmado_por INTEGER');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN recebimento_confirmado_em DATETIME');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN encerrado_por INTEGER');
  await safeAlter(db, 'ALTER TABLE requisicoes_almoxarifado ADD COLUMN encerrado_em DATETIME');

  await dbRun(db, `CREATE TABLE IF NOT EXISTS requisicao_lembretes_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    requisicao_id INTEGER NOT NULL,
    destinatario TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'ENVIADO',
    erro TEXT,
    dias_aguardando INTEGER,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (requisicao_id) REFERENCES requisicoes_almoxarifado(id)
  )`);

  // ── Atendimento parcial por item ──
  await safeAlter(db, 'ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_separada REAL DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE itens_requisicao_almoxarifado ADD COLUMN quantidade_entregue REAL DEFAULT 0');
  await dbRun(db, `UPDATE itens_requisicao_almoxarifado
    SET quantidade_entregue = quantidade_atendida
    WHERE COALESCE(quantidade_entregue, 0) = 0 AND COALESCE(quantidade_atendida, 0) > 0`);

  // ── Extend conferências (inventário) ──
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN tipo TEXT DEFAULT \'GERAL\'');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN projeto_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN localizacao_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN aprovador_id INTEGER');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN aprovador_nome TEXT');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN justificativa_ajuste TEXT');
  // Etapa 10 (Task 1 — so as colunas; Task 2 as usa): modo_cego (RN-01/RN-02) esconde
  // quantidade_sistema/divergencia de quem conta e nao tem `ajustar_estoque`, enquanto a
  // conferencia esta ABERTO. tolerancia_percentual (RN-01) e lida de
  // configuracoes_almoxarifado.tolerancia_inventario_percentual NA CRIACAO da conferencia e
  // gravada aqui — uma mudanca na config global depois nao muda o criterio de uma conferencia ja
  // em andamento. recontado (itens_conferencia_almoxarifado) marca a SEGUNDA vez que o item
  // recebe quantidade_contada (RN-04): libera a conclusao mesmo com divergencia acima da
  // tolerancia (RN-05), qualquer que seja o novo valor — a segunda contagem e a segunda chance,
  // nao mais uma rodada sujeita ao mesmo limiar.
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN modo_cego INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN tolerancia_percentual REAL');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN recontado INTEGER DEFAULT 0');

  // Etapa 10b (Task 1 — só as colunas; quem as usa são as Tasks 1-3): escopo_descricao (RN-01)
  // guarda a descrição legível do escopo com que a conferência foi criada; dupla_contagem
  // (RN-03) exige recontagem por OUTRA pessoa; impacto_financeiro (RN-05) persiste na
  // conclusão o que a Etapa 10 calculava e jogava fora. Autoria por item (RN-04): primeira
  // contagem preenche contado_por_*, cada contagem seguinte sobrescreve recontado_por_*.
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN escopo_descricao TEXT');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN dupla_contagem INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE conferencias_almoxarifado ADD COLUMN impacto_financeiro REAL');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN contado_por_id INTEGER');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN contado_por_nome TEXT');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN recontado_por_id INTEGER');
  await safeAlter(db, 'ALTER TABLE itens_conferencia_almoxarifado ADD COLUMN recontado_por_nome TEXT');

  // ── Config defaults ──
  const configs = [
    // Migrado de routes/almoxarifado.js (diff de segurança — Task 3): chaves base que só
    // existiam no callback do CREATE TABLE da rota.
    ['aprovacao_automatica', '0', 'Aprovar requisições automaticamente sem revisão'],
    ['limite_aprovacao_auto', '5', 'Quantidade máxima para aprovação automática por item'],
    ['notificar_estoque_critico', '1', 'Enviar alerta quando estoque atingir mínimo'],
    ['prazo_atendimento_horas', '24', 'Prazo padrão para atendimento de requisições (horas)'],
    ['prefixo_requisicao', 'REQ', 'Prefixo do número de requisição'],
    ['prefixo_material', 'ALM', 'Prefixo do código de material'],
    ['requer_justificativa_urgente', '1', 'Exigir justificativa para requisições urgentes'],
    ['inspecao_material_critico', '1', 'Exigir inspeção para materiais críticos no recebimento'],
    ['permite_saldo_negativo_global', '0', 'Permitir saldo negativo (global)'],
    ['perfil_padrao', 'PRODUCAO', 'Perfil padrão para novos usuários no almoxarifado'],
    ['alertas_estoque_notificar_email', '1', 'Habilita alertas de estoque mínimo por e-mail'],
    ['alertas_estoque_notificar_whatsapp', '0', 'Habilita alertas de estoque mínimo por WhatsApp'],
    ['alertas_estoque_emails', '[]', 'Lista de e-mails para notificação de estoque mínimo'],
    ['alertas_estoque_whatsapp_numeros', '[]', 'Lista de números WhatsApp para notificação de estoque mínimo'],
    ['alertas_estoque_intervalo_verificacao_horas', '4', 'Intervalo sugerido de verificação de alertas (horas)'],
    ['alertas_estoque_debounce_segundos', '60', 'Debounce anti-duplicata na mesma operação (segundos; 0=desligado)'],
    ['alertas_app_url', 'https://systemgmp.online', 'URL base do sistema para links nos alertas (e-mail e WhatsApp)'],
    ['alertas_smtp_host', '', 'Servidor SMTP para alertas de estoque'],
    ['alertas_smtp_port', '587', 'Porta SMTP para alertas de estoque'],
    ['alertas_smtp_user', '', 'Usuário SMTP para alertas de estoque'],
    ['alertas_smtp_pass', '', 'Senha SMTP para alertas de estoque'],
    ['alertas_smtp_from', '', 'E-mail remetente dos alertas de estoque'],
    ['alertas_smtp_secure', '0', 'Usar TLS/SSL no SMTP dos alertas (1=sim)'],
    ['alertas_whatsapp_webhook_url', '', 'URL do webhook WhatsApp para alertas de estoque'],
    ['alertas_whatsapp_api_key', '', 'Token/chave API opcional do webhook WhatsApp'],
    ['requisicoes_notificar_email', '1', 'Habilita notificação por e-mail de novas requisições de material'],
    ['requisicoes_notificar_emails', '[]', 'Lista de e-mails para notificação de requisições (vazio = usa alertas_estoque_emails)'],
    ['compras_notificar_emails', '[]', 'E-mails do setor de Compras para solicitações automáticas de compra (itens sem estoque)'],
    ['requisicoes_lembrete_ativo', '1', 'Habilita lembretes diários por e-mail para requisições pendentes'],
    ['requisicoes_lembrete_intervalo_horas', '24', 'Intervalo mínimo entre lembretes da mesma requisição (horas)'],
    ['liberacao_valor_ativo', '0', 'Habilita aprovação de alto valor em requisições de material'],
    ['liberacao_valor_limite', '500', 'Valor máximo (R$) para liberação automática sem aprovação extra'],
    ['liberacao_valor_aprovadores', '[]', 'IDs dos usuários aprovadores de alto valor (JSON)'],
    // Etapa 10 (achado da revisão final de branch): sem a linha semeada, a chave nunca existe —
    // PUT /configuracoes só grava chave já semeada ("grava apenas chave que já existe"), então
    // GET /conferencias/tolerancia_inventario_percentual sempre voltava undefined e
    // toleranciaEfetiva() caía no fallback fixo 2, silenciosamente, mesmo que um admin tentasse
    // configurar outro valor pela tela.
    ['tolerancia_inventario_percentual', '2', 'Tolerância padrão (%) de divergência no inventário antes de exigir recontagem'],
  ];
  for (const [chave, valor, desc] of configs) {
    await dbRun(db, 'INSERT OR IGNORE INTO configuracoes_almoxarifado (chave, valor, descricao) VALUES (?,?,?)', [chave, valor, desc]);
  }
  // Lixo deixado pelo PUT /almoxarifado/configuracoes antigo: a tela mandava o corpo embrulhado
  // em `{ configuracoes: [...] }` e a rota fazia Object.entries dele, gravando UMA linha de
  // chave 'configuracoes' com valor "[object Object],[object Object]". Nenhum leitor procura
  // essa chave — ela só suja a listagem de configurações. Não é chave semeada nem lida por
  // ninguém, então o DELETE não tem como levar junto configuração legítima.
  await dbRun(db, "DELETE FROM configuracoes_almoxarifado WHERE chave = 'configuracoes'");

  // ── Centros de custo ──
  await dbRun(db, `CREATE TABLE IF NOT EXISTS centros_custo_almoxarifado (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT UNIQUE NOT NULL,
    nome TEXT NOT NULL,
    ativo INTEGER DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )`);
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN centro_custo_id INTEGER');
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN emergencial INTEGER DEFAULT 0');
  await safeAlter(db, 'ALTER TABLE movimentacoes_almoxarifado ADD COLUMN regularizacao_pendente INTEGER DEFAULT 0');

  console.log('✅ Schema almoxarifado v3 inicializado');
}

module.exports = {
  initSchema,
  safeAlter,
  CATEGORIAS_SEED,
  FAMILIAS_SEED,
  SETORES_ALMOX_SEED,
  TIPOS_MATERIAL_ALMOX_SEED,
  LOCALIZACOES_ALMOX_SEED,
  TIPOS_MATERIAL_ENUM,
  TIPOS_LOCALIZACAO,
  UNIDADES_SEED,
  SETORES_REQUISICAO,
  TIPOS_MOVIMENTO,
  TIPOS_RETENCAO,
  TIPOS_DEDICADOS,
  TIPOS_RESULTADO,
  TIPOS_REQUISICAO,
  STATUS_SOBRA,
};
