/**
 * Menu lateral: qual módulo a rota mostra (Etapa 111, G17, RN-111.07).
 *
 * Escrito ANTES de `Layout.getActiveModuleFromPath` passar a ler `moduloDaRota`: a tabela de
 * `constants/moduloDaRota.test.js`, com o comercial e o que não é módulo (`/chat`, `/minha-conta`, `/`) indo
 * para `crm` (o menu do comercial), como sempre.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/Layout.modulo --watchAll=false
 */
import { getActiveModuleFromPath } from './Layout';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(() => Promise.resolve({ data: {} })), post: jest.fn() },
}));
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: null, logout: jest.fn() }) }));
jest.mock('../services/permissionsCache', () => ({
  fetchUserPermissions: jest.fn(() => Promise.resolve({ grupos: [] })),
  getCachedUserPermissions: () => ({ grupos: [] }),
  getEffectiveUser: (u) => u,
  seedPermissionsFromAuthUser: jest.fn(),
}));
jest.mock('../routes/lazyModules', () => ({ prefetchRoute: jest.fn() }));

// A mesma tabela de constants/moduloDaRota.test.js (copiada: importar aquele arquivo rodaria os testes dele aqui).
const TABELA_ROTAS = [
  ['/comercial', 'comercial'], ['/comercial/clientes', 'comercial'], ['/frota', 'frota'], ['/frota/veiculos', 'frota'],
  ['/frotas', 'frota'], ['/todolist', 'todolist'], ['/compras', 'compras'], ['/compras/pedidos?aba=2', 'compras'],
  ['/financeiro', 'financeiro'], ['/fabrica/ordens-servico', 'operacional'], ['/configuracoes', 'administrativo'],
  ['/configuracoes/almoxarifado', 'administrativo'], ['/admin', 'admin'], ['/admin/usuarios', 'admin'],
  ['/administrativo', 'admin'], ['/engenharia-projetos', 'engenharia_projetos'],
  ['/engenharia-projetos/os', 'engenharia_projetos'], ['/engenharia', 'engenharia'], ['/engenharia/tampo', 'engenharia'],
  ['/engenhariaX', 'engenharia'], ['/almoxarifado/requisicoes', 'almoxarifado'], ['/chat', null], ['/', null],
  ['/minha-conta', null], ['', null],
];

test('RN-111.07 Layout.getActiveModuleFromPath: a tabela de sempre, com comercial e o resto em "crm"', () => {
  const esperado = TABELA_ROTAS.map(([p, m]) => [p, m === 'comercial' || m === null ? 'crm' : m]);
  const visto = TABELA_ROTAS.map(([p]) => [p, getActiveModuleFromPath(p)]);
  expect(visto).toEqual(esperado);
});
