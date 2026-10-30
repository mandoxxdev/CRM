/**
 * Etapa 192 (RN-192.10) — por onde o formulário de material (`MaterialAlmoxarifadoForm`) fala com o servidor e para onde ele
 * volta. O Almoxarifado usa as rotas dele; o Compras usa as portas `/compras/materiais/...` (o prefixo `/almoxarifado` exige
 * o módulo Almoxarifado, que o comprador pode não ter). As duas portas chamam os MESMOS handlers no servidor.
 *
 * Etapa 193 (RN-193.04, RN-193.05): o Compras ganhou a foto e o seletor de Proprietário (cada porta diz de onde vem a lista de
 * clientes). Saldo inicial continua fora do Compras (B72).
 */

export const ROTAS_ALMOXARIFADO = {
  modulo: 'almoxarifado',
  subtitulo: 'Almoxarifado · Cadastro de Materiais',
  api: {
    material: (id) => `/almoxarifado/materiais/${id}`,
    criar: '/almoxarifado/materiais',
    foto: (id) => `/almoxarifado/materiais/${id}/foto`,
    familias: '/almoxarifado/familias',
    almoxarifados: '/almoxarifado/almoxarifados',
    localizacoes: '/almoxarifado/localizacoes',
    proximoCodigo: '/almoxarifado/proximo-codigo',
    categorias: '/almoxarifado/categorias',
    permissoes: '/almoxarifado/minhas-permissoes',
    clientes: '/clientes',
  },
  tela: {
    lista: '/almoxarifado/materiais',
    novo: '/almoxarifado/materiais/novo',
    editar: (id) => `/almoxarifado/materiais/editar/${id}`,
  },
  foto: true,
  saldoInicial: true,
  proprietario: true,
  linksConfiguracao: true,
};

export const ROTAS_COMPRAS = {
  modulo: 'compras',
  subtitulo: 'Compras · Cadastro de Materiais',
  api: {
    material: (id) => `/compras/materiais/cadastro/${id}`,
    lista: '/compras/materiais/cadastro',
    criar: '/compras/materiais/cadastro',
    foto: (id) => `/compras/materiais/cadastro/${id}/foto`,
    inativar: (id) => `/compras/materiais/cadastro/${id}`,
    familias: '/compras/materiais/aux/familias',
    almoxarifados: '/compras/materiais/aux/almoxarifados',
    localizacoes: '/compras/materiais/aux/localizacoes',
    proximoCodigo: '/compras/materiais/aux/proximo-codigo',
    categorias: '/compras/materiais/aux/categorias',
    permissoes: '/compras/materiais/aux/minhas-permissoes',
    clientes: '/compras/materiais/aux/clientes',
  },
  tela: {
    lista: '/compras/materiais',
    novo: '/compras/materiais/novo',
    editar: (id) => `/compras/materiais/editar/${id}`,
  },
  // Etapa 193 (RN-193.04/05): foto e Proprietário também no Compras. Saldo inicial não (B72: pelo Compras não se mexe em estoque).
  foto: true,
  saldoInicial: false,
  proprietario: true,
  linksConfiguracao: false,
};
