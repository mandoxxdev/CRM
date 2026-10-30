/**
 * Etapa 192 (RN-192.10) — por onde o formulário de material (`MaterialAlmoxarifadoForm`) fala com o servidor e para onde ele
 * volta. O Almoxarifado usa as rotas dele; o Compras usa as portas `/compras/materiais/...` (o prefixo `/almoxarifado` exige
 * o módulo Almoxarifado, que o comprador pode não ter). As duas portas chamam os MESMOS handlers no servidor.
 *
 * Etapa 193 (RN-193.01, RN-193.04, RN-193.05): o cadastro é SÓ do Compras. O Almoxarifado só consulta
 * (`ROTAS_ALMOXARIFADO_CONSULTA`: a ficha "Ver", tudo desligado, sem salvar); o servidor recusa o PUT, o DELETE e a foto do
 * almoxarifado (403 `O cadastro de material é feito em Compras → Materiais.`). O Compras ganhou a foto e o seletor de Proprietário. Saldo inicial continua
 * fora do Compras (B72).
 */

/**
 * O aviso da lista e da ficha do Almoxarifado (texto do plano, RN-193.01). O 403 do servidor diz o mesmo no singular
 * ("O cadastro de material é feito em Compras → Materiais.", `MSG_CADASTRO_NO_COMPRAS`), e a tela mostra o do servidor quando ele recusa.
 */
export const AVISO_CADASTRO_NO_COMPRAS = 'O cadastro de materiais é feito em Compras → Materiais.';

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
    ver: (id) => `/almoxarifado/materiais/ver/${id}`,
  },
  foto: true,
  saldoInicial: true,
  proprietario: true,
  linksConfiguracao: true,
};

/**
 * Etapa 193 (RN-193.01): a ficha "Ver" do Almoxarifado — o MESMO formulário (`somenteLeitura`), com o fieldset desligado.
 * Escolhido em vez de uma ficha de leitura nova: mostra os mesmos campos, na mesma ordem, sem uma segunda cópia que divergiria
 * a cada campo novo. A quantidade atual aparece (desligada, como na edição); o dono aparece pelo nome do detalhe (sem pedir
 * `/clientes`); a foto aparece sem o envio; sem atalhos para Configurações.
 */
export const ROTAS_ALMOXARIFADO_CONSULTA = {
  ...ROTAS_ALMOXARIFADO,
  subtitulo: 'Almoxarifado · Materiais (somente consulta)',
  somenteLeitura: true,
  proprietario: false,
  linksConfiguracao: false,
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
