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
  // frota
  ADMIN_FROTA: 'Administrador de Frota',
  MOTORISTA: 'Motorista',
  // produção
  ADMIN_PRODUCAO: 'Administrador de Produção',
  SUPERVISOR: 'Supervisor',
  OPERADOR: 'Operador',
};

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
