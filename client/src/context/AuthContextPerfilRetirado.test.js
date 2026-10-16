/**
 * Etapa 127 (C264, RN-06..RN-09; B818) — o perfil retirado deixa de valer na tela ao recarregar a pagina, pela fiacao REAL:
 * `AuthProvider` (boot com o `/auth/me` e `refreshUser`), `permissionsCache` (`seedPermissionsFromAuthUser`, `getEffectiveUser`)
 * e a tela de Configuracoes, que decide por `podeGravarConfigAlmox(getEffectiveUser(user))`. So a fronteira HTTP e mockada.
 *
 * Antes: o `/auth/me` mandava `perfil_almoxarifado: null` e o merge (`??`) devolvia o 'ADMINISTRADOR' guardado no
 * `localStorage` — recarregar nao resolvia, so sair e entrar.
 *
 * Executar: cd client && CI=true npx react-scripts test src/context/AuthContextPerfilRetirado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider, useAuth } from './AuthContext';
import ConfiguracoesAlmoxarifado from '../components/almoxarifado/ConfiguracoesAlmoxarifado';
import api from '../services/api';
import { fetchUserPermissions, getEffectiveUser, invalidatePermissionsCache } from '../services/permissionsCache';

jest.mock('axios', () => ({ __esModule: true, default: { defaults: { headers: { common: {} } } } }));
jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const FRASE = 'Somente leitura — cadastrar, editar, inativar e reativar famílias é do Administrador do almoxarifado ou do '
  + 'Super Administrador; peça a um deles.';
const ROL = { id: 1, codigo: 'ROL', nome: 'Rolamentos', descricao: '', parent_id: null, tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 };

// o que o servidor manda: as duas chaves SEMPRE presentes (null sem perfil) — buildAuthUserPayload em server/index.js
const payload = (over) => ({
  id: 5, nome: 'Fulano', email: 'f@x', role: 'admin', is_superadmin: false, admin_modulos: [], modulos: [],
  perfil_almoxarifado: null, perfil_frota: null, ...over,
});

let meAtual;
let container; let root; let authRef;
function Sonda() { authRef = useAuth(); return null; }

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  invalidatePermissionsCache();
  localStorage.clear();
  api.get.mockImplementation((url) => {
    if (url === '/auth/me') return Promise.resolve({ data: { user: meAtual } });
    if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: [ROL] });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); localStorage.clear(); invalidatePermissionsCache(); });

async function abrirComSessao(usuarioGuardado) {
  localStorage.setItem('token', 't');
  localStorage.setItem('user', JSON.stringify(usuarioGuardado));
  await act(async () => {
    root.render(
      <AuthProvider>
        <Sonda />
        <MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=familias']}><ConfiguracoesAlmoxarifado /></MemoryRouter>
      </AuthProvider>
    );
  });
  for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
}
const novaFamilia = () => [...container.querySelectorAll('button')].filter((b) => /Nova Família/.test(b.textContent));

describe('C264 (Etapa 127) — a sessao aberta com o perfil retirado', () => {
  test('[RN-06] administrador do sistema que tinha o perfil Administrador: ao recarregar, a aba Familias fica somente leitura', async () => {
    meAtual = payload({ perfil_almoxarifado: null });
    await abrirComSessao(payload({ perfil_almoxarifado: 'ADMINISTRADOR' }));
    expect(api.get).toHaveBeenCalledWith('/auth/me', expect.anything()); // o boot perguntou ao servidor
    expect(container.textContent).toContain('Rolamentos'); // metade positiva: a arvore esta la
    expect(container.textContent).toContain(FRASE);
    expect(novaFamilia()).toHaveLength(0);
    expect(JSON.parse(localStorage.getItem('user')).perfil_almoxarifado).toBeNull(); // e o guardado nao volta no proximo boot
  });

  test('[RN-07] controle: o servidor ainda manda ADMINISTRADOR -> os botoes continuam', async () => {
    meAtual = payload({ perfil_almoxarifado: 'ADMINISTRADOR' });
    await abrirComSessao(payload({ perfil_almoxarifado: 'ADMINISTRADOR' }));
    expect(container.textContent).toContain('Rolamentos');
    expect(novaFamilia()).toHaveLength(1);
    expect(container.textContent).not.toContain(FRASE);
  });

  test('[RN-08] usuario comum que perdeu o perfil: ao recarregar, Configuracoes mostra o acesso restrito', async () => {
    meAtual = payload({ role: 'user', perfil_almoxarifado: null });
    await abrirComSessao(payload({ role: 'user', perfil_almoxarifado: 'ADMINISTRADOR' }));
    expect(container.textContent).toContain('Acesso restrito — administrador do Almoxarifado');
    expect(novaFamilia()).toHaveLength(0);
    expect(container.textContent).not.toContain('Rolamentos');
  });

  test('[RN-08] refreshUser na sessao aberta (Minha Conta, cadastro de usuario) tambem tira o perfil', async () => {
    meAtual = payload({ perfil_almoxarifado: 'ADMINISTRADOR' });
    await abrirComSessao(payload({ perfil_almoxarifado: 'ADMINISTRADOR' }));
    expect(novaFamilia()).toHaveLength(1); // metade positiva: antes da retirada, grava
    meAtual = payload({ perfil_almoxarifado: null });
    await act(async () => { await authRef.refreshUser(); });
    for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); });
    expect(authRef.user.perfil_almoxarifado).toBeNull();
    expect(container.textContent).toContain(FRASE);
    expect(novaFamilia()).toHaveLength(0);
  });

  test('[RN-08b] o inverso (Fase 2, C1): usuario comum com o cache velho em null GANHA o perfil e passa pelo refreshUser -> o perfil novo vale', async () => {
    meAtual = payload({ id: 7, role: 'user', perfil_almoxarifado: null });
    await abrirComSessao(payload({ id: 7, role: 'user', perfil_almoxarifado: null }));
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url === '/usuarios/7/grupos'
      ? Promise.resolve({ data: { grupos: [], permissoes: [], usuario: { role: 'user', is_superadmin: false, admin_modulos: [], perfil_almoxarifado: null, perfil_frota: null } } })
      : base(url)));
    await act(async () => { await fetchUserPermissions(7); }); // o cache de 5 min com null
    expect(getEffectiveUser(authRef.user).perfil_almoxarifado).toBeNull(); // metade positiva: hoje sem perfil
    meAtual = payload({ id: 7, role: 'user', perfil_almoxarifado: 'ADMINISTRADOR' });
    await act(async () => { await authRef.refreshUser(); });
    expect(authRef.user.perfil_almoxarifado).toBe('ADMINISTRADOR');
    expect(getEffectiveUser(authRef.user).perfil_almoxarifado).toBe('ADMINISTRADOR');
  });

  test('[RN-09] o cache de permissoes (/usuarios/:id/grupos) com perfil null tira o perfil do usuario efetivo', async () => {
    api.get.mockImplementation((url) => (url === '/usuarios/7/grupos'
      ? Promise.resolve({ data: { grupos: [], permissoes: [], usuario: { role: 'user', is_superadmin: false, admin_modulos: [], perfil_almoxarifado: null, perfil_frota: null } } })
      : Promise.resolve({ data: [] })));
    const logado = { id: 7, role: 'user', perfil_almoxarifado: 'ADMINISTRADOR', perfil_frota: 'ADMIN_FROTA' };
    expect(getEffectiveUser(logado).perfil_almoxarifado).toBe('ADMINISTRADOR'); // sem cache: o logado
    await fetchUserPermissions(7);
    expect(getEffectiveUser(logado).perfil_almoxarifado).toBeNull();
    expect(getEffectiveUser(logado).perfil_frota).toBeNull();
  });
});
