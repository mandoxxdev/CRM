/**
 * Configuração de requisições de material por módulo/setor
 */
export const MODULOS_REQUISICAO = {
  comercial: {
    setor: 'Comercial',
    moduloOrigem: 'comercial',
    basePath: '/comercial',
    label: 'Comercial',
  },
  compras: {
    setor: 'Compras',
    moduloOrigem: 'compras',
    basePath: '/compras',
    label: 'Compras',
  },
  financeiro: {
    setor: 'Financeiro',
    moduloOrigem: 'financeiro',
    basePath: '/financeiro',
    label: 'Financeiro',
  },
  operacional: {
    setor: 'Produção',
    moduloOrigem: 'operacional',
    basePath: '/fabrica',
    label: 'Operacional / Fábrica',
  },
  engenharia: {
    setor: 'Engenharia',
    moduloOrigem: 'engenharia',
    basePath: '/engenharia',
    label: 'Engenharia',
  },
  engenharia_projetos: {
    setor: 'Engenharia / Projetos',
    moduloOrigem: 'engenharia_projetos',
    basePath: '/engenharia-projetos',
    label: 'Engenharia / Projetos',
  },
  almoxarifado: {
    setor: 'Almoxarifado',
    moduloOrigem: 'almoxarifado',
    basePath: '/almoxarifado',
    label: 'Almoxarifado',
    warehouseMode: true,
  },
  administrativo: {
    setor: 'Administrativo',
    moduloOrigem: 'administrativo',
    basePath: '/configuracoes',
    label: 'Administrativo',
  },
  admin: {
    setor: 'Administrativo',
    moduloOrigem: 'admin',
    basePath: '/admin',
    label: 'Administração',
  },
  frota: {
    setor: 'Manutenção',
    moduloOrigem: 'frota',
    basePath: '/frota',
    label: 'Frota / Manutenção',
  },
};

export const MENU_REQUISICAO_ITEMS = (basePath) => [
  { path: `${basePath}/requisicoes-material/nova`, icon: 'FiClipboard', label: 'Solicitar Material' },
  { path: `${basePath}/requisicoes-material`, icon: 'FiList', label: 'Minhas Requisições' },
];

export function getModuloFromPath(pathname) {
  if (pathname.startsWith('/fabrica')) return 'operacional';
  if (pathname.startsWith('/compras')) return 'compras';
  if (pathname.startsWith('/financeiro')) return 'financeiro';
  if (pathname.startsWith('/admin')) return 'admin';
  if (pathname.startsWith('/configuracoes')) return 'administrativo';
  if (pathname.startsWith('/engenharia-projetos')) return 'engenharia_projetos';
  if (pathname.startsWith('/engenharia')) return 'engenharia';
  if (pathname.startsWith('/almoxarifado')) return 'almoxarifado';
  if (pathname.startsWith('/frota')) return 'frota';
  if (pathname.startsWith('/comercial')) return 'comercial';
  return null;
}

export function getRequisicaoConfig(pathname) {
  const modulo = getModuloFromPath(pathname);
  return modulo ? MODULOS_REQUISICAO[modulo] : null;
}
