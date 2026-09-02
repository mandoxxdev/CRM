/**
 * Mensagem legível para o 403 de perfil dos módulos que usam `requirePermission`.
 *
 * Almoxarifado, Frota e Produção têm serviços de permissão distintos, mas o corpo do 403
 * é idêntico nos três (`server/services/{almoxarifado,frotas,producao}/permissions.js`):
 *
 *   { error: 'Sem permissão para esta operação', acao: '<snake_case>', perfil: '<PERFIL>' }
 *
 * O front descartava `acao` e `perfil` e mostrava só o `error` genérico, então o usuário
 * (e quem testa) não sabia o que faltava nem com que perfil estava entrando. Aqui viram
 * texto.
 */

// Ações escritas como continuação de "Sem permissão para ..."
const ACOES = {
  // almoxarifado
  visualizar: 'visualizar o almoxarifado',
  criar_material: 'criar material',
  editar_material: 'editar material',
  movimentar: 'movimentar estoque',
  ajustar_estoque: 'ajustar saldo de estoque',
  aprovar_requisicao: 'aprovar ou rejeitar requisição',
  separar_emitir: 'separar e entregar requisição',
  requisitar: 'criar requisição',
  receber_material: 'receber material',
  inspecionar: 'inspecionar material',
  reservar: 'reservar material',
  reservar_outra_os: 'reservar material de outra OS',
  inventario: 'fazer inventário',
  configurar: 'configurar o módulo',
  // Revisao final da Etapa 11 (achado 7, medido): faltavam no mapa — o botao "Gerar
  // solicitacoes" da tela de reposicao (bloquearSeNaoPode('gerenciar_reposicao', ...)) caia no
  // fallback de labelAcao e mostrava "gerenciar reposicao" cru. gerenciar_ferramentas e as duas
  // pernas de sucateamento (aprovar_sucateamento/aprovar_sucateamento_gestao) tinham o mesmo
  // buraco (existem em ACAO_PERFIS desde as Etapas 9/9b) — corrigidos junto.
  gerenciar_reposicao: 'gerenciar reposição e compras',
  gerenciar_ferramentas: 'gerenciar ferramentas',
  // Etapa 12, Task 4: falta no mapa reproduziria o mesmo buraco do achado 7 da Etapa 11 —
  // o botao "Reenviar"/"Processar fila agora" da tela de notificacoes cairia no fallback de
  // labelAcao e mostraria "gerenciar notificacoes" cru em vez da frase natural.
  gerenciar_notificacoes: 'gerenciar notificações',
  // Etapa 16, Task 3: sem a entrada, o gate visual da central de alertas cairia no fallback
  // de labelAcao e mostraria "ver alertas" cru (mesmo buraco do achado 7 da Etapa 11).
  ver_alertas: 'ver a central de alertas',

  // Etapa 30, fix-round da revisao adversarial: QUATRO acoes de ACAO_PERFIS nao tinham rotulo, e
  // tres delas ja tinham call site de UI — o toast mostrava a chave crua ("gerenciar plano
  // inspecao", "remessar terceiro", "conferir separacao"). E a QUARTA ocorrencia do mesmo buraco
  // nesta base (achado 7 da Etapa 11, Etapa 12 Task 4, Etapa 16 Task 3), e desta vez o cenario
  // que guarda o mapa foi reescrito para NAO deixar passar de novo: o `not.toContain('_')` de
  // antes passava com o fallback, porque o fallback tambem troca `_` por espaco.
  gerenciar_plano_inspecao: 'gerenciar o plano de inspeção',
  conferir_separacao: 'conferir a separação de requisição',
  remessar_terceiro: 'enviar material a terceiros',
  ajustar_material_cliente: 'ajustar saldo de material de cliente',

  // Etapa 32: as duas acoes de anexo. Escritas DEPOIS de ACAO_PERFIS, de proposito — o vermelho
  // deste arquivo de teste foi medido antes deste commit, e ele nomeou as duas sozinho. Isso e o
  // controle positivo de que a regua da Etapa 30 (a lista vem de ACAO_PERFIS do servidor, e o
  // criterio e PRESENCA, nao formato do texto) esta viva: a quinta ocorrencia do buraco de rotulo
  // foi barrada pela guarda em vez de descoberta por revisao.
  anexar_documento: 'anexar documento',
  remover_anexo: 'remover anexo',

  aprovar_sucateamento: 'aprovar sucateamento (almoxarifado)',
  aprovar_sucateamento_gestao: 'aprovar sucateamento (gestão)',
  // frota
  gerenciar_veiculos: 'gerenciar veículos',
  gerenciar_motoristas: 'gerenciar motoristas',
  registrar_operacoes: 'registrar operações de frota',
  aprovar_viagens: 'aprovar viagens',
  relatorios: 'ver relatórios',
  // produção
  gerenciar_ops: 'gerenciar ordens de produção',
  apontar: 'apontar produção',
  gerenciar_maquinas: 'gerenciar máquinas',
  gerenciar_roteiros: 'gerenciar roteiros',
  registrar_paradas: 'registrar paradas',
};

const PERFIS = {
  // almoxarifado
  ADMINISTRADOR: 'Administrador',
  ALMOXARIFE: 'Almoxarife',
  COMPRAS: 'Compras',
  PRODUCAO: 'Produção',
  ENGENHARIA: 'Engenharia',
  GESTOR: 'Gestor',
  CONSULTA: 'Consulta (somente leitura)',
  // Etapa 24: o perfil novo precisa entrar AQUI também, não só em PERFIS_INFO da tela de
  // atribuição. Sem esta linha o 403 de um inspetor da qualidade dizia "seu perfil é
  // QUALIDADE" — a chave crua em caixa alta —, que é o mesmo buraco do achado 7 da Etapa 11,
  // entrando pelo lado do PERFIL em vez do lado da AÇÃO. É a mensagem que ele mais vê:
  // QUALIDADE não movimenta estoque nem ajusta saldo, então esbarra no 403 com frequência.
  QUALIDADE: 'Qualidade',
  // frota
  ADMIN_FROTA: 'Administrador de Frota',
  MOTORISTA: 'Motorista',
  // produção
  ADMIN_PRODUCAO: 'Administrador de Produção',
  SUPERVISOR: 'Supervisor',
  OPERADOR: 'Operador',
};

/**
 * As chaves do mapa, para o teste poder exigir que TODA acao de `ACAO_PERFIS` (servidor) tenha
 * rotulo proprio. Exportado na Etapa 30 porque a guarda anterior — "a mensagem nao contem `_`" —
 * passava com o fallback (que tambem troca `_` por espaco) e deixou quatro acoes sem rotulo
 * chegarem a tela. Comparar o TEXTO tambem nao serve: `criar_material` tem rotulo proprio
 * ("criar material") que por acaso e igual ao fallback. O unico sinal confiavel e a presenca.
 */
export const ACOES_COM_ROTULO = Object.keys(ACOES);

export function labelAcao(acao) {
  if (!acao) return '';
  // sem tradução, mostra a chave legível em vez de sumir com a informação
  return ACOES[acao] || String(acao).replace(/_/g, ' ');
}

export function labelPerfil(perfil) {
  if (!perfil) return '';
  return PERFIS[perfil] || String(perfil);
}

/**
 * Monta a mensagem a partir do corpo do 403. Retorna null quando o payload não é um erro
 * de perfil (aí quem chama mantém a mensagem original).
 */
export function formatarErroPermissao(data) {
  if (!data || !data.acao || !data.perfil) return null;
  return `Sem permissão para ${labelAcao(data.acao)} — seu perfil é ${labelPerfil(data.perfil)}. Solicite acesso a um administrador.`;
}
