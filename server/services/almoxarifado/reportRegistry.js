/**
 * Etapa 13, Task 1 — RN-01: registro unico de relatorios do almoxarifado.
 *
 * ── Por que este arquivo existe ────────────────────────────────────────────────────────────────
 *
 * O dispatcher `GET /api/almoxarifado/relatorios/:tipo` (routes/almoxarifado/extended.js) tinha
 * 17 chaves com gate por EXCECAO — so 2 delas (`inventario-divergencias`, `solicitacoes-compra`)
 * ganharam checagem de permissao, e as duas entraram por achado de revisao final (Etapa 10b e
 * Etapa 11), nao por design. "Relatorio novo esquece o gate" e uma classe de defeito estrutural.
 * Este registro obriga toda chave a DECLARAR `acao` (nem que seja `null` explicito) e o
 * dispatcher passa a resolver o gate por aqui — apagar a checagem vira apagar uma linha do
 * registro, nao esquecer um `if`.
 *
 * ── Metadados PUROS, sem `fn` ──────────────────────────────────────────────────────────────────
 *
 * Este arquivo NAO importa nenhum service do almoxarifado de proposito: `fn` fica `null` aqui e e
 * LIGADA em extended.js (`RELATORIOS[chave].fn = ...`), que ja importa todos os services. Duas
 * razoes: (1) evita ciclo de require; (2) a Task 3 (tela) e qualquer consumidor de METADADOS
 * (lista, formulario de parametros, colunas de export) pode importar este arquivo sem carregar
 * nenhum service do modulo.
 *
 * extended.js valida na SUBIDA (throw, nao passa em silencio):
 *   (a) toda chave deste registro recebeu uma `fn` ligada;
 *   (b) toda chave do mapa `reports` (que enumera as funcoes reais) existe neste registro —
 *       sem este par inverso, um relatorio poderia ficar SERVIVEL e FORA da lista/gate, que e
 *       exatamente a classe que este registro existe para matar.
 *
 * ── Campos de cada entrada ─────────────────────────────────────────────────────────────────────
 *   titulo:      string, rotulo humano para a tela.
 *   categoria:   'Estoque' | 'Movimentações' | 'Gestão' | 'Terceiros e clientes'.
 *   acao:        string de ACAO_PERFIS (gate) OU `null` EXPLICITO ("qualquer usuario do modulo",
 *                decisao, nao esquecimento). Os 2 gates ATUAIS ficam identicos ao codigo de hoje
 *                (comportamento preservado — apertar gate de relatorio existente e letra B):
 *                  inventario-divergencias -> 'inventario' (achado 10b)
 *                  solicitacoes-compra     -> 'gerenciar_reposicao' (achado 11)
 *   exportavel:  true|false. false quando a funcao devolve OBJETO (nao array) — o xlsx explode
 *                com TypeError em payload nao-array. Hoje sao 2: materiais-cliente (devolve
 *                { cliente, itens, aplicacoes }) e sucata-financeiro (devolve
 *                { periodo, movimentacoes, vendas, totais, por_classificacao, nota }).
 *   limite:      number|null. Teto que a query do proprio relatorio ja aplica via LIMIT — o
 *                export HERDA esse teto (nao ha paginacao separada); a tela avisa "mostrando os
 *                primeiros N" quando `linhas.length === limite`.
 *   params:      [{ nome, rotulo, tipo: 'date'|'number'|'text', obrigatorio }] — os NOMES REAIS
 *                que a funcao ligada em extended.js consome da querystring (ex.: sucata-financeiro
 *                usa `de`/`ate`, NAO `data_inicio`/`data_fim` — nome errado nao da erro, e
 *                IGNORADO e devolve o periodo inteiro parecendo filtrado).
 *   colunas:     [{ chave, rotulo }] | null. OBRIGATORIA quando exportavel:true (o export projeta
 *                as linhas por ela ANTES do json_to_sheet — nunca passa o array cru, que a lib
 *                MUTA com push). `null` quando exportavel:false.
 *   fn:          null aqui, ligada em extended.js.
 */
const RELATORIOS = {
  'estoque-atual': {
    titulo: 'Estoque atual',
    categoria: 'Estoque',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'codigo', rotulo: 'Código' },
      { chave: 'nome', rotulo: 'Nome' },
      { chave: 'categoria', rotulo: 'Categoria' },
      { chave: 'unidade', rotulo: 'Unidade' },
      { chave: 'quantidade_atual', rotulo: 'Quantidade atual' },
      { chave: 'disponivel', rotulo: 'Disponível' },
      { chave: 'valor_total', rotulo: 'Valor total' },
    ],
    fn: null,
  },
  'abaixo-minimo': {
    titulo: 'Materiais abaixo do mínimo',
    categoria: 'Estoque',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'codigo', rotulo: 'Código' },
      { chave: 'nome', rotulo: 'Nome' },
      { chave: 'categoria', rotulo: 'Categoria' },
      { chave: 'unidade', rotulo: 'Unidade' },
      { chave: 'quantidade_atual', rotulo: 'Quantidade atual' },
      { chave: 'quantidade_minima', rotulo: 'Quantidade mínima' },
    ],
    fn: null,
  },
  'materiais-bloqueados': {
    titulo: 'Materiais bloqueados',
    categoria: 'Estoque',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'codigo', rotulo: 'Código' },
      { chave: 'nome', rotulo: 'Nome' },
      { chave: 'categoria', rotulo: 'Categoria' },
      { chave: 'quantidade_bloqueada', rotulo: 'Quantidade bloqueada' },
    ],
    fn: null,
  },
  'materiais-sem-endereco': {
    titulo: 'Materiais sem endereço',
    categoria: 'Estoque',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'codigo', rotulo: 'Código' },
      { chave: 'nome', rotulo: 'Nome' },
      { chave: 'categoria', rotulo: 'Categoria' },
      { chave: 'quantidade_atual', rotulo: 'Quantidade atual' },
    ],
    fn: null,
  },
  'sobras-disponiveis': {
    titulo: 'Sobras disponíveis',
    categoria: 'Estoque',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'material_descricao', rotulo: 'Material' },
      { chave: 'norma', rotulo: 'Norma' },
      { chave: 'dimensoes_restantes', rotulo: 'Dimensões restantes' },
      { chave: 'status', rotulo: 'Status' },
      { chave: 'localizacao_codigo', rotulo: 'Localização' },
      { chave: 'created_at', rotulo: 'Data' },
    ],
    fn: null,
  },
  'historico-movimentacoes': {
    titulo: 'Histórico de movimentações',
    categoria: 'Movimentações',
    acao: null,
    exportavel: true,
    nota: "Mostra as 500 movimentações mais recentes do filtro.",
    // Fase 2, I5: a query do proprio relatorio ja tem LIMIT 500 (reportService.js) — o export
    // herda esse teto, nunca refaz a query sem limite.
    limite: 500,
    params: [
      { nome: 'material_id', rotulo: 'Material', tipo: 'number', obrigatorio: false },
      { nome: 'tipo', rotulo: 'Tipo de movimento', tipo: 'text', obrigatorio: false },
      { nome: 'data_inicio', rotulo: 'Data início', tipo: 'date', obrigatorio: false },
      { nome: 'data_fim', rotulo: 'Data fim', tipo: 'date', obrigatorio: false },
    ],
    colunas: [
      { chave: 'material_codigo', rotulo: 'Código' },
      { chave: 'material_nome', rotulo: 'Material' },
      { chave: 'tipo', rotulo: 'Tipo' },
      { chave: 'quantidade', rotulo: 'Quantidade' },
      { chave: 'saldo_posterior', rotulo: 'Saldo após' },
      { chave: 'referencia', rotulo: 'Referência' },
      { chave: 'created_at', rotulo: 'Data' },
    ],
    fn: null,
  },
  'reservado-os': {
    titulo: 'Reservas por OS',
    categoria: 'Movimentações',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    // Fase 2, M8: os_id NAO e obrigatorio — sem ele o relatorio devolve todas as reservas ATIVAS
    // hoje (comportamento atual); obrigar seria mudanca de comportamento disfarcada.
    params: [
      { nome: 'os_id', rotulo: 'OS', tipo: 'number', obrigatorio: false },
    ],
    colunas: [
      { chave: 'material_codigo', rotulo: 'Código' },
      { chave: 'material_nome', rotulo: 'Material' },
      { chave: 'quantidade', rotulo: 'Quantidade reservada' },
      { chave: 'os_id', rotulo: 'OS' },
      { chave: 'os_referencia', rotulo: 'Referência OS' },
      { chave: 'status', rotulo: 'Status' },
      { chave: 'created_at', rotulo: 'Criado em' },
    ],
    fn: null,
  },
  'consumo-os': {
    titulo: 'Consumo por OS',
    categoria: 'Movimentações',
    // Régua ESTREITA (só SAIDA*, declarado no Global Constraints do plano — não unificar com a
    // régua de `indicadores`, que usa TIPOS_SAIDA inteiro; a tela mostra a nota no rodapé).
    acao: null,
    exportavel: true,
    nota: "Conta apenas saídas diretas (SAIDA, SAIDA_PRODUCAO, SAIDA_MONTAGEM, SAIDA_ASSISTENCIA) — régua histórica deste relatório; o indicador de giro conta todo débito de patrimônio.",
    limite: null,
    params: [
      { nome: 'os_id', rotulo: 'OS', tipo: 'number', obrigatorio: false },
      { nome: 'data_inicio', rotulo: 'Data início', tipo: 'date', obrigatorio: false },
      { nome: 'data_fim', rotulo: 'Data fim', tipo: 'date', obrigatorio: false },
    ],
    colunas: [
      { chave: 'codigo', rotulo: 'Código' },
      { chave: 'nome', rotulo: 'Material' },
      { chave: 'total_consumido', rotulo: 'Total consumido' },
      { chave: 'os_id', rotulo: 'OS' },
    ],
    fn: null,
  },
  'consumo-periodo': {
    titulo: 'Consumo por período',
    categoria: 'Movimentações',
    acao: null,
    exportavel: true,
    nota: "Conta os tipos de saída SAIDA* — régua histórica deste relatório; o indicador de giro conta todo débito de patrimônio.",
    limite: null,
    params: [
      { nome: 'data_inicio', rotulo: 'Data início', tipo: 'date', obrigatorio: false },
      { nome: 'data_fim', rotulo: 'Data fim', tipo: 'date', obrigatorio: false },
      { nome: 'projeto_id', rotulo: 'Projeto', tipo: 'number', obrigatorio: false },
      { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'number', obrigatorio: false },
    ],
    colunas: [
      { chave: 'categoria', rotulo: 'Categoria' },
      { chave: 'nome', rotulo: 'Material' },
      { chave: 'total', rotulo: 'Total consumido' },
      { chave: 'projeto_id', rotulo: 'Projeto' },
      { chave: 'cliente_id', rotulo: 'Cliente' },
    ],
    fn: null,
  },
  'materiais-mais-consumidos': {
    titulo: 'Materiais mais consumidos',
    categoria: 'Movimentações',
    acao: null,
    exportavel: true,
    nota: "Top 10 por quantidade, contando apenas saídas diretas (SAIDA, SAIDA_PRODUCAO, SAIDA_MONTAGEM, SAIDA_ASSISTENCIA).",
    // Fase 2, I5: LIMIT 10 na query (reportService.js) — declarado para a tela avisar.
    limite: 10,
    params: [
      { nome: 'data_inicio', rotulo: 'Data início', tipo: 'date', obrigatorio: false },
      { nome: 'data_fim', rotulo: 'Data fim', tipo: 'date', obrigatorio: false },
    ],
    colunas: [
      { chave: 'codigo', rotulo: 'Código' },
      { chave: 'nome', rotulo: 'Material' },
      { chave: 'unidade', rotulo: 'Unidade' },
      { chave: 'total_consumido', rotulo: 'Total consumido' },
    ],
    fn: null,
  },
  'recebimentos-pendentes': {
    titulo: 'Recebimentos pendentes',
    categoria: 'Gestão',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'numero', rotulo: 'Número' },
      { chave: 'nota_fiscal', rotulo: 'Nota fiscal' },
      { chave: 'fornecedor_nome', rotulo: 'Fornecedor' },
      { chave: 'status', rotulo: 'Status' },
      { chave: 'data_recebimento', rotulo: 'Data de recebimento' },
    ],
    fn: null,
  },
  'inventario-divergencias': {
    titulo: 'Divergências de inventário',
    categoria: 'Gestão',
    // Revisao final da Etapa 10b: expunha quantidade_sistema/divergencia de conferencia
    // CONCLUIDA para qualquer usuario do modulo — mesmo gate do relatorio de acuracidade.
    acao: 'inventario',
    exportavel: true,
    nota: "Mostra as 500 divergências mais recentes de conferências CONCLUÍDAS.",
    // Fase 2, I5: LIMIT 500 na query (reportService.js).
    limite: 500,
    params: [],
    colunas: [
      { chave: 'codigo', rotulo: 'Código' },
      { chave: 'material_nome', rotulo: 'Material' },
      { chave: 'conferencia_numero', rotulo: 'Conferência' },
      { chave: 'quantidade_sistema', rotulo: 'Qtd sistema' },
      { chave: 'quantidade_contada', rotulo: 'Qtd contada' },
      { chave: 'divergencia', rotulo: 'Divergência' },
      { chave: 'ajustado', rotulo: 'Ajustado' },
    ],
    fn: null,
  },
  'solicitacoes-compra': {
    titulo: 'Solicitações de compra',
    categoria: 'Gestão',
    // Revisao final da Etapa 11: expunha o pipeline de compra inteiro (PENDENTE + VINCULADO)
    // sem gate — a acao que decide compra e quem pode ver o relatorio dela.
    acao: 'gerenciar_reposicao',
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'material_codigo', rotulo: 'Código' },
      { chave: 'material_nome', rotulo: 'Material' },
      { chave: 'quantidade', rotulo: 'Quantidade' },
      { chave: 'motivo', rotulo: 'Motivo' },
      { chave: 'status', rotulo: 'Status' },
      { chave: 'created_at', rotulo: 'Criado em' },
    ],
    fn: null,
  },
  'sucata-financeiro': {
    titulo: 'Sucata — financeiro',
    categoria: 'Gestão',
    acao: null,
    // Devolve OBJETO ({ periodo, movimentacoes, vendas, totais, por_classificacao, nota }), nao
    // array — export tabular nao existe para este relatorio (Fase 2, C1).
    exportavel: false,
    nota: null,
    limite: null,
    // Nomes REAIS (Fase 2, I6): `de`/`ate`, NAO data_inicio/data_fim — nome errado e ignorado e
    // devolve o periodo inteiro parecendo filtrado.
    params: [
      { nome: 'de', rotulo: 'De', tipo: 'date', obrigatorio: false },
      { nome: 'ate', rotulo: 'Até', tipo: 'date', obrigatorio: false },
    ],
    colunas: null,
    fn: null,
  },
  'ferramentas-emprestadas': {
    titulo: 'Ferramentas emprestadas',
    categoria: 'Gestão',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'codigo_patrimonio', rotulo: 'Patrimônio' },
      { chave: 'nome', rotulo: 'Ferramenta' },
      { chave: 'colaborador_nome', rotulo: 'Colaborador' },
      { chave: 'setor', rotulo: 'Setor' },
      { chave: 'data_retirada', rotulo: 'Retirada em' },
      { chave: 'status', rotulo: 'Status' },
    ],
    fn: null,
  },
  'epi-colaborador': {
    titulo: 'EPI por colaborador',
    categoria: 'Gestão',
    acao: null,
    exportavel: true,
    nota: null,
    limite: null,
    params: [],
    colunas: [
      { chave: 'colaborador_nome', rotulo: 'Colaborador' },
      { chave: 'setor', rotulo: 'Setor' },
      { chave: 'ferramenta', rotulo: 'EPI' },
      { chave: 'data_retirada', rotulo: 'Retirada em' },
    ],
    fn: null,
  },
  'materiais-cliente': {
    titulo: 'Posição por cliente',
    categoria: 'Terceiros e clientes',
    acao: null,
    // Devolve OBJETO ({ cliente, itens, aplicacoes }), nao array — export tabular nao existe
    // para este relatorio (Fase 2, C1).
    exportavel: false,
    nota: null,
    limite: null,
    // Unico param obrigatorio de verdade da etapa (clienteEstoqueService.posicaoPorCliente
    // devolve 400 'informe o cliente_id' sem ele).
    params: [
      { nome: 'cliente_id', rotulo: 'Cliente', tipo: 'number', obrigatorio: true },
    ],
    colunas: null,
    fn: null,
  },
  'indicadores': {
    titulo: 'Indicadores gerenciais',
    categoria: 'Gestão',
    // D5 (Etapa 13): gate null, IGUAL ao dashboard hoje — o valorTotalEstoque ja e visivel a
    // todo usuario do modulo; gate novo seria regra nova sem pedido. Reversivel (uma linha).
    acao: null,
    // Devolve OBJETO (giro/cobertura/rupturas/valor_por_grupo/atendimento_requisicoes), nao
    // array — mesma razao de materiais-cliente/sucata-financeiro (Fase 2 da Task 1, C1).
    exportavel: false,
    // A regua de cada bloco, para a tela nao deixar implicito (RN-05): giro e APROXIMACAO
    // declarada (consumo na janela / valor do estoque ATUAL — nao ha snapshot historico);
    // cobertura e a MEDIANA (materiais sem consumo na janela ficam de fora, contados a parte);
    // rupturas olham o saldo FISICO (nao o disponivel — 100% reservado nao aparece) e so contam
    // TIPOS_SAIDA ou AJUSTE_INVENTARIO (tipos neutros como LIBERACAO_RESERVA nao mexem no saldo
    // fisico); atendimento so considera requisicao com ENTREGA COMPLETA, sem filtro de janela.
    // Revisao da Task 2 (I-2): a nota e o UNICO canal desta informacao ate a tela — os desvios
    // DECLARADOS (atendimento sem janela; rupturas por evento fisico; cliente/inativo fora)
    // estavam so em comentario JS, que nao chega ao usuario.
    nota: 'Giro: valor consumido na janela dividido pelo valor do estoque ATUAL '
      + '(aproximação declarada — não há histórico de estoque). Cobertura pela MEDIANA dos '
      + 'materiais com consumo na janela (os sem consumo são contados à parte). Rupturas: '
      + 'materiais próprios e ativos cujo saldo FÍSICO tocou zero por saída ou ajuste de '
      + 'inventário na janela — material 100% reservado não conta, e material inativado sai do '
      + 'histórico. Tempo de atendimento: só requisições com entrega COMPLETA, de TODO o '
      + 'histórico (sem janela). Materiais de clientes ficam fora de todos os blocos. Janela '
      + 'padrão: a mesma da Reposição (config; 90 dias de fábrica). Esta régua de consumo é '
      + 'MAIS LARGA que a dos relatórios de consumo (que contam só saídas diretas); mediana 0 '
      + 'significa que nenhum material teve consumo na janela.',
    limite: null,
    params: [
      { nome: 'janela_dias', rotulo: 'Janela (dias)', tipo: 'number', obrigatorio: false },
    ],
    colunas: null,
    fn: null,
  },
  'custo-por-projeto': {
    titulo: 'Custo por projeto',
    categoria: 'Gestão',
    // D6 (Etapa 14): gate gerenciar_reposicao — dado de custo/pipeline de compra, mesmo racional
    // de solicitacoes-compra. NASCE fechado (reversivel em uma linha; contraste deliberado com a
    // licao B18 da E13 — "abrir expoe mais do que parece").
    acao: 'gerenciar_reposicao',
    exportavel: true,
    // A NOTA e o UNICO canal desta informacao ate a tela existir (mesmo padrao de `indicadores`).
    nota: 'Consumido soma as saídas (TIPOS_SAIDA) com projeto associado; devolvido soma as '
      + 'devoluções (ENTRADA_DEVOLUCAO/DEVOLUCAO — DEVOLUCAO_CLIENTE é saída e não entra, apesar '
      + 'do nome). O custo aplicado é o ATUAL do material (custoUnitarioSql), retroativo: o livro '
      + 'não guarda custo por movimento, então um período fechado muda de valor quando chega NF '
      + 'nova. Materiais de clientes ficam fora (patrimônio alheio) e movimentação sem projeto '
      + 'também (o relatório é por projeto — o total geral do valor consumido é o indicador de '
      + 'giro, régua distinta, em Indicadores gerenciais). Projeto não cadastrado aparece como '
      + '"Projeto #<id>".',
    limite: null,
    params: [
      { nome: 'data_inicio', rotulo: 'Data início', tipo: 'date', obrigatorio: false },
      { nome: 'data_fim', rotulo: 'Data fim', tipo: 'date', obrigatorio: false },
    ],
    colunas: [
      { chave: 'projeto_id', rotulo: 'Projeto (id)' },
      { chave: 'projeto_nome', rotulo: 'Projeto' },
      { chave: 'consumido', rotulo: 'Consumido' },
      { chave: 'devolvido', rotulo: 'Devolvido' },
      { chave: 'liquido', rotulo: 'Líquido' },
      { chave: 'movimentacoes', rotulo: 'Movimentações' },
    ],
    fn: null,
  },
};

module.exports = { RELATORIOS };
