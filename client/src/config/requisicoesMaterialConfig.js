/**
 * Configuração de requisições de material por módulo/setor
 */
/** Módulos que usam catálogo em cesta (escritório/admin) em vez do formulário industrial */
export const MODULOS_CESTA = ['administrativo', 'admin', 'comercial'];

/** Apenas estes setores usam catálogo industrial (chão de fábrica) */
export const TIPO_SETOR_INDUSTRIAL = 'industrial';
export const TIPO_SETOR_ADMINISTRATIVO = 'administrativo';

export const MODULOS_REQUISICAO = {
  comercial: {
    setor: 'Comercial',
    moduloOrigem: 'comercial',
    basePath: '/comercial',
    label: 'Comercial',
    tipoSetor: TIPO_SETOR_ADMINISTRATIVO,
    useCesta: true,
  },
  compras: {
    setor: 'Compras',
    moduloOrigem: 'compras',
    basePath: '/compras',
    label: 'Compras',
    tipoSetor: TIPO_SETOR_ADMINISTRATIVO,
  },
  financeiro: {
    setor: 'Financeiro',
    moduloOrigem: 'financeiro',
    basePath: '/financeiro',
    label: 'Financeiro',
    tipoSetor: TIPO_SETOR_ADMINISTRATIVO,
  },
  operacional: {
    setor: 'Produção',
    moduloOrigem: 'operacional',
    basePath: '/fabrica',
    label: 'Operacional / Fábrica',
    tipoSetor: TIPO_SETOR_INDUSTRIAL,
  },
  engenharia: {
    setor: 'Engenharia',
    moduloOrigem: 'engenharia',
    basePath: '/engenharia',
    label: 'Engenharia',
    tipoSetor: TIPO_SETOR_ADMINISTRATIVO,
  },
  engenharia_projetos: {
    setor: 'Engenharia / Projetos',
    moduloOrigem: 'engenharia_projetos',
    basePath: '/engenharia-projetos',
    label: 'Engenharia / Projetos',
    tipoSetor: TIPO_SETOR_ADMINISTRATIVO,
  },
  almoxarifado: {
    setor: 'Almoxarifado',
    moduloOrigem: 'almoxarifado',
    basePath: '/almoxarifado',
    label: 'Almoxarifado',
    tipoSetor: TIPO_SETOR_ADMINISTRATIVO,
    warehouseMode: true,
  },
  administrativo: {
    setor: 'Administrativo',
    moduloOrigem: 'administrativo',
    basePath: '/configuracoes',
    label: 'Administrativo',
    tipoSetor: TIPO_SETOR_ADMINISTRATIVO,
    useCesta: true,
  },
  admin: {
    setor: 'Administrativo',
    moduloOrigem: 'admin',
    basePath: '/admin',
    label: 'Administração',
    tipoSetor: TIPO_SETOR_ADMINISTRATIVO,
    useCesta: true,
  },
  frota: {
    setor: 'Manutenção',
    moduloOrigem: 'frota',
    basePath: '/frota',
    label: 'Frota / Manutenção',
    tipoSetor: TIPO_SETOR_INDUSTRIAL,
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

export function resolveTipoSetor(moduloKey, overrides = {}) {
  if (moduloKey && overrides[moduloKey]) return overrides[moduloKey];
  return MODULOS_REQUISICAO[moduloKey]?.tipoSetor || TIPO_SETOR_ADMINISTRATIVO;
}

export function buildModuloRequisicaoConfig(moduloKey, overrides = {}) {
  const base = MODULOS_REQUISICAO[moduloKey];
  if (!base) return null;
  const tipoSetor = resolveTipoSetor(moduloKey, overrides);
  return {
    ...base,
    tipoSetor,
    useCesta: tipoSetor !== TIPO_SETOR_INDUSTRIAL,
  };
}

export function applyTipoOverridesToConfig(config, overrides = {}) {
  if (!config) return config;
  const moduloKey = config.moduloOrigem;
  const tipoSetor = resolveTipoSetor(moduloKey, overrides);
  return {
    ...config,
    tipoSetor,
    useCesta: tipoSetor !== TIPO_SETOR_INDUSTRIAL,
  };
}

export function getRequisicaoConfig(pathname) {
  const modulo = getModuloFromPath(pathname);
  return modulo ? MODULOS_REQUISICAO[modulo] : null;
}

export function usesCestaFlow(moduloKey, overrides = null) {
  if (!moduloKey) return false;
  if (overrides) {
    return resolveTipoSetor(moduloKey, overrides) !== TIPO_SETOR_INDUSTRIAL;
  }
  return MODULOS_CESTA.includes(moduloKey) || !!MODULOS_REQUISICAO[moduloKey]?.useCesta;
}
