/**
 * Etapa 192 (RN-192.10) — por onde o formulário de material (`MaterialAlmoxarifadoForm`) fala com o servidor e para onde ele
 * volta. O Almoxarifado usa as rotas dele; o Compras usa as portas `/compras/materiais/...` (o prefixo `/almoxarifado` exige
 * o módulo Almoxarifado, que o comprador pode não ter). As duas portas chamam os MESMOS handlers no servidor.
 *
 * No Compras ficam de fora, de propósito: foto, saldo inicial e os atalhos para Configurações do Almoxarifado
 * (excluir e movimentar nem aparecem no formulário).
 */
export const ROTAS_ALMOXARIFADO = {
  modulo: 'almoxarifado',
  subtitulo: 'Almoxarifado · Cadastro de Materiais',
  api: {
    material: (id) => `/almoxarifado/materiais/${id}`,
    criar: '/almoxarifado/materiais',
    familias: '/almoxarifado/familias',
    almoxarifados: '/almoxarifado/almoxarifados',
    localizacoes: '/almoxarifado/localizacoes',
    proximoCodigo: '/almoxarifado/proximo-codigo',
    categorias: '/almoxarifado/categorias',
    permissoes: '/almoxarifado/minhas-permissoes',
  },
  tela: {
    lista: '/almoxarifado/materiais',
    novo: '/almoxarifado/materiais/novo',
    editar: (id) => `/almoxarifado/materiais/editar/${id}`,
  },
  foto: true,
  saldoInicial: true,
  linksConfiguracao: true,
};

export const ROTAS_COMPRAS = {
  modulo: 'compras',
  subtitulo: 'Compras · Cadastro de Materiais',
  api: {
    material: (id) => `/compras/materiais/cadastro/${id}`,
    lista: '/compras/materiais/cadastro',
    criar: '/compras/materiais/cadastro',
    familias: '/compras/materiais/aux/familias',
    almoxarifados: '/compras/materiais/aux/almoxarifados',
    localizacoes: '/compras/materiais/aux/localizacoes',
    proximoCodigo: '/compras/materiais/aux/proximo-codigo',
    categorias: '/compras/materiais/aux/categorias',
    permissoes: '/compras/materiais/aux/minhas-permissoes',
  },
  tela: {
    lista: '/compras/materiais',
    novo: '/compras/materiais/novo',
    editar: (id) => `/compras/materiais/editar/${id}`,
  },
  foto: false,
  saldoInicial: false,
  linksConfiguracao: false,
};
