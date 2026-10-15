import {
  FiTarget, FiTool, FiShoppingCart, FiDollarSign, FiPackage,
  FiSettings, FiSliders, FiBriefcase, FiArchive, FiShield, FiCheckSquare,
} from 'react-icons/fi';

/**
 * A lista de módulos do sistema no CLIENTE — uma fonte só (Etapa 109, G7).
 *
 * Até a 108 a mesma lista estava escrita à mão aqui, nos cartões da seleção de módulos
 * (`TipoSelecao.todosModulos`) e nos cartões do cadastro de usuário (`UsuarioForm.todosModulos`).
 * As duas telas passaram a derivar daqui (`modulosDaSelecao`, `modulosConcediveis`) com os mesmos
 * nomes, descrições, rotas, ícones e cores — a única diferença visível é o rótulo de engenharia do
 * cadastro de usuário (o cartão e o painel de permissões dos grupos), que dizia "Engenharia" e passou a
 * dizer "Cálculos de Engenharia" (B60).
 *
 * O servidor tem a dele (`server/services/modulosSistema.js`); não compartilham código, e
 * `server/tests/api/modulosClienteServidor.api.test.js` LÊ ESTE ARQUIVO COMO TEXTO e falha se as duas
 * divergirem. Por isso as listas `MODULOS_ORDEM`, `MODULOS_CONCEDIVEIS` e
 * `MODULOS_SEM_ADMIN_DE_MODULO_NA_TELA` ficam no formato `export const NOME = [ 'a', 'b' ];` —
 * array literal, aspas simples, sem expressão.
 *
 * Outras listas parciais de módulo existem no cliente com outro propósito (rótulos de carregamento,
 * splash, prefetch, requisição de material por módulo, rotas do App, menus do Layout) — medidas na
 * Etapa 109 e fora dela (G17).
 */

// Ícone, cor, rota e as duas descrições de cada módulo com tela.
// `descricao`: a do cartão da seleção de módulos (aparece na busca); `descricaoAcesso`: a do cartão
// "Módulos de Acesso" do cadastro de usuário.
export const MODULOS_META = {
  comercial: {
    nome: 'Comercial', icon: FiTarget, rota: '/comercial',
    gradient: 'linear-gradient(135deg, #6d28d9 0%, #be185d 100%)',
    descricao: 'Vendas, propostas e oportunidades',
    descricaoAcesso: 'Gestão de vendas, propostas e oportunidades',
  },
  compras: {
    nome: 'Compras', icon: FiShoppingCart, rota: '/compras',
    gradient: 'linear-gradient(135deg, #0f766e 0%, #0891b2 100%)',
    descricao: 'Fornecedores, pedidos e cotações',
    descricaoAcesso: 'Gestão de fornecedores, pedidos e cotações',
  },
  financeiro: {
    nome: 'Financeiro', icon: FiDollarSign, rota: '/financeiro',
    gradient: 'linear-gradient(135deg, #047857 0%, #10b981 100%)',
    descricao: 'Contas, fluxo de caixa e bancos',
    descricaoAcesso: 'Contas a pagar/receber, fluxo de caixa e bancos',
  },
  operacional: {
    nome: 'Operacional', icon: FiPackage, rota: '/fabrica',
    gradient: 'linear-gradient(135deg, #1e40af 0%, #4338ca 100%)',
    descricao: 'Fábrica, OS e produção',
    descricaoAcesso: 'Gestão de projetos e atividades',
  },
  engenharia: {
    nome: 'Cálculos de Engenharia', icon: FiSliders, rota: '/engenharia',
    gradient: 'linear-gradient(135deg, #b45309 0%, #ea580c 100%)',
    descricao: 'Tampo, pressão e dimensionamento',
    descricaoAcesso: 'Cálculos e utilitários de engenharia',
  },
  engenharia_projetos: {
    nome: 'Engenharia / Projetos', icon: FiBriefcase, rota: '/engenharia-projetos',
    gradient: 'linear-gradient(135deg, #3730a3 0%, #6366f1 100%)',
    descricao: 'Solicitações e cadastros',
    descricaoAcesso: 'Solicitações (cesta), cadastro e OS (projetos)',
  },
  almoxarifado: {
    nome: 'Almoxarifado', icon: FiArchive, rota: '/almoxarifado',
    gradient: 'linear-gradient(135deg, #78350f 0%, #a16207 100%)',
    descricao: 'Materiais, estoque, requisições e conferências',
    descricaoAcesso: 'Materiais, estoque, requisições e conferências',
  },
  frota: {
    nome: 'Frota', icon: FiTool, rota: '/frota',
    gradient: 'linear-gradient(135deg, #ea580c 0%, #b91c1c 100%)',
    descricao: 'Gestão completa de veículos, manutenções e custos',
    descricaoAcesso: 'Veículos, manutenções, combustível e documentação',
  },
  todolist: {
    nome: 'TODOLIST', icon: FiCheckSquare, rota: '/todolist',
    gradient: 'linear-gradient(135deg, #0369a1 0%, #0ea5e9 100%)',
    descricao: 'Kanban de atividades e controle de programação',
    descricaoAcesso: 'Kanban de atividades e controle de programação',
  },
  administrativo: {
    nome: 'Administrativo', icon: FiSettings, rota: '/configuracoes',
    gradient: 'linear-gradient(135deg, #334155 0%, #6d28d9 100%)',
    descricao: 'Configurações do sistema',
    descricaoAcesso: 'Configurações e gestão do sistema',
  },
  admin: {
    nome: 'Admin', icon: FiShield, rota: '/admin',
    gradient: 'linear-gradient(135deg, #450a0a 0%, #991b1b 100%)',
    descricao: 'Usuários e permissões',
    descricaoAcesso: 'Gestão de usuários e permissões',
  },
};

/**
 * Concedível no cadastro de usuário mas SEM tela: nenhum cartão na seleção, nenhuma badge, nenhuma rota
 * checa esta permissão (medido na Etapa 109 — B60/G17). Mantido para o salvar do usuário continuar
 * gravando a mesma linha `permissoes.modulo = 'relatorios'`.
 */
export const MODULOS_SO_PERMISSAO = {
  relatorios: { nome: 'Relatórios', descricaoAcesso: 'Análises e relatórios executivos' },
};

/**
 * Nome do módulo na tela de acesso negado, no "Carregando ..." e no log de auditoria (Etapa 111, G17).
 * Admin é "Administração" aqui — não "Admin" como no cartão da seleção —, porque é o nome que o acesso
 * negado e o log sempre usaram (B62). O servidor tem a mesma lista (`MODULOS_SISTEMA[].nome` em
 * `server/services/modulosSistema.js`, que grava o log dos 403 das rotas); o teste cruzado
 * `modulosClienteServidor.api.test.js` lê ESTE objeto como texto e cai se divergirem — por isso ele fica no
 * formato `chave: 'Nome',` (literal, aspas simples), e confere também os `nomeModulo` do `App.js`.
 */
export const NOMES_MODULO = {
  comercial: 'Comercial',
  compras: 'Compras',
  financeiro: 'Financeiro',
  operacional: 'Operacional',
  engenharia: 'Cálculos de Engenharia',
  engenharia_projetos: 'Engenharia / Projetos',
  almoxarifado: 'Almoxarifado',
  frota: 'Frota',
  todolist: 'TODOLIST',
  administrativo: 'Administrativo',
  admin: 'Administração',
};

// Ordem de exibição das badges (menu e lista de usuários) e da barra de módulos de Configurações.
export const MODULOS_ORDEM = [
  'comercial', 'compras', 'financeiro', 'operacional', 'engenharia',
  'engenharia_projetos', 'almoxarifado', 'frota', 'todolist', 'administrativo', 'admin',
];

// Ordem dos cartões da tela de seleção de módulos (desenho daquela tela; não é a das badges).
export const MODULOS_ORDEM_SELECAO = [
  'comercial', 'frota', 'compras', 'financeiro', 'operacional', 'administrativo',
  'engenharia', 'engenharia_projetos', 'almoxarifado', 'todolist', 'admin',
];

// Os cartões "Módulos de Acesso" do cadastro de usuário, na ordem da tela.
export const MODULOS_CONCEDIVEIS = [
  'comercial', 'compras', 'financeiro', 'operacional', 'engenharia', 'engenharia_projetos',
  'almoxarifado', 'frota', 'todolist', 'relatorios', 'administrativo', 'admin',
];

// Cartões do cadastro de usuário SEM o botão "Administrador do módulo". (O servidor aceita admin de
// módulo do `admin` e descarta o do `todolist` — divergência conhecida e mantida, B60.)
export const MODULOS_SEM_ADMIN_DE_MODULO_NA_TELA = ['admin'];

/** Cartões da seleção de módulos: `{ id, modulo, nome, descricao, icon, rota, gradient }`. */
export function modulosDaSelecao() {
  return MODULOS_ORDEM_SELECAO.map((chave) => {
    const { nome, descricao, icon, rota, gradient } = MODULOS_META[chave];
    return { id: chave, modulo: chave, nome, descricao, icon, rota, gradient };
  });
}

/** Cartões do cadastro de usuário: `{ value, label, descricao, aceitaAdminDeModulo }`. */
export function modulosConcediveis() {
  return MODULOS_CONCEDIVEIS.map((chave) => {
    const meta = MODULOS_META[chave] || MODULOS_SO_PERMISSAO[chave];
    return {
      value: chave,
      label: meta.nome,
      descricao: meta.descricaoAcesso,
      aceitaAdminDeModulo: !MODULOS_SEM_ADMIN_DE_MODULO_NA_TELA.includes(chave),
    };
  });
}

// Rotas dos módulos, o prefixo mais longo primeiro ('/engenharia-projetos' antes de '/engenharia').
const ROTAS_POR_TAMANHO = Object.keys(MODULOS_META)
  .map((chave) => [MODULOS_META[chave].rota, chave])
  .sort((a, b) => b[0].length - a[0].length);

/**
 * Rota → chave do módulo (Etapa 111, G17, RN-111.07): o módulo cuja `rota` é prefixo do caminho
 * (`startsWith`, sem fronteira — '/frotas' é frota, '/administrativo' é admin, como sempre foi); nenhum → null.
 * Até a 110 o mesmo mapa estava escrito à mão no portão de rota (`ProtectedModuleRoute`), no prefetch
 * (`lazyModules`) e no menu lateral (`Layout`). Fora daqui, de propósito: a requisição de material por módulo
 * (`requisicoesMaterialConfig`, sem TODOLIST), o `ModuleSplash` e o `isProtectedModuleRoute` do `App.js` (tem /chat).
 */
export function moduloDaRota(path) {
  if (!path) return null;
  const achado = ROTAS_POR_TAMANHO.find(([rota]) => path.startsWith(rota));
  return achado ? achado[1] : null;
}

/** Módulos que o usuário acessa → admin/superadmin veem todos. */
export function modulosDoUsuario(usuario) {
  if (!usuario) return [];
  if (usuario.is_superadmin || usuario.role === 'admin') return MODULOS_ORDEM;
  const acesso = new Set(usuario.modulos || []);
  return MODULOS_ORDEM.filter((k) => acesso.has(k));
}

/**
 * Nível de acesso pela quantidade de módulos:
 *   admin/super admin → Full · 5+ (ou todos) → Premium · 3–4 → Standard · 0–2 → Basic
 */
export function nivelAcessoUsuario(usuario) {
  if (usuario && (usuario.is_superadmin || usuario.role === 'admin')) {
    return { tier: 'full', label: 'Full Access' };
  }
  const total = modulosDoUsuario(usuario).length;
  if (total > 4) return { tier: 'premium', label: 'Premium Access' };
  if (total >= 3) return { tier: 'standard', label: 'Standard Access' };
  return { tier: 'basic', label: 'Basic Access' };
}
