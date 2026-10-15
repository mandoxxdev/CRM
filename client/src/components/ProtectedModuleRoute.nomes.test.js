/**
 * Portão de rota do módulo — o nome do módulo na tela de acesso negado (Etapa 111, G17, RN-111.05).
 *
 * Escrito ANTES de `ProtectedModuleRoute` passar a ler `NOMES_MODULO` de `constants/modulosMeta.js`, verde no
 * código antigo: o nome que aparece quando a rota não passa `nomeModulo` (o fallback; as rotas do `App.js` passam
 * o mesmo nome literal — o teste cruzado do servidor confere as duas) e o que vai para o log pelo `AcessoNegado`.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/ProtectedModuleRoute.nomes --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ProtectedModuleRoute, { resetModuleSplashSession } from './ProtectedModuleRoute';
import { NOMES_MODULO } from '../constants/modulosMeta';

let mockUser;
jest.mock('../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser, loading: false }) }));
jest.mock('../services/permissionsCache', () => ({
  fetchUserPermissions: jest.fn(),
  getCachedUserPermissions: jest.fn(),
  hasModuleAccess: jest.fn(),
  seedPermissionsFromAuthUser: jest.fn(),
}));
jest.mock('./AcessoNegado', () => ({ modulo, nomeModulo }) => (
  <div data-testid="negado" data-modulo={modulo}>{nomeModulo}</div>
));
// A splash termina na hora: o que interessa é a tela depois dela.
jest.mock('./SplashScreen', () => {
  const R = require('react');
  return ({ onComplete }) => { R.useEffect(() => { onComplete(); }, [onComplete]); return null; };
});
jest.mock('./LazyPage', () => ({ RouteLoading: () => null }));

const { getCachedUserPermissions, hasModuleAccess } = require('../services/permissionsCache');

global.IS_REACT_ACT_ENVIRONMENT = true;

// Os nomes de sempre (lidos de ProtectedModuleRoute.nomesModulos e do App.js até a Etapa 110).
const ESPERADO = {
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

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  resetModuleSplashSession();
  mockUser = { id: 7, nome: 'Usuário Comum', role: 'usuario' };
  getCachedUserPermissions.mockImplementation(() => ({ permissoes: [{ modulo: 'outro', permissao: 1 }] }));
  hasModuleAccess.mockImplementation(() => false);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function negado(modulo) {
  await act(async () => {
    root.render(
      <MemoryRouter><ProtectedModuleRoute modulo={modulo}><p>dentro</p></ProtectedModuleRoute></MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  return container.querySelector('[data-testid="negado"]');
}

test('RN-111.05 sem nomeModulo, o acesso negado mostra o nome de sempre de cada um dos 11 módulos', async () => {
  const visto = {};
  for (const modulo of Object.keys(ESPERADO)) {
    resetModuleSplashSession();
    const el = await negado(modulo);
    visto[modulo] = el ? el.textContent : '(sem tela de acesso negado)';
  }
  expect(visto).toEqual(ESPERADO);
  expect(container.textContent).not.toContain('dentro');
});

test('RN-111.05 o nomeModulo passado pela rota continua valendo sobre o da lista', async () => {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <ProtectedModuleRoute modulo="almoxarifado" nomeModulo="Nome da Rota"><p>dentro</p></ProtectedModuleRoute>
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  expect(container.querySelector('[data-testid="negado"]').textContent).toBe('Nome da Rota');
});

test('RN-111.04 NOMES_MODULO tem os 11 nomes de sempre (o servidor confere os dele contra estes)', () => {
  expect(NOMES_MODULO).toEqual(ESPERADO);
});
