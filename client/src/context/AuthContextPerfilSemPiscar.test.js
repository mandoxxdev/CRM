/**
 * Etapa 128 (T5, RN-22..RN-24) — o perfil retirado nao pisca na sessao aberta (D (127), r2): quando a busca de
 * `/usuarios/:id/grupos` do PROPRIO usuario grava o cache, o `AuthProvider` regrava o usuario do contexto (e o `localStorage`)
 * com o mesmo merge de `getEffectiveUser`. Antes: a tela que relia o cache escondia os botoes e, 5 minutos depois (o cache
 * vencido), o usuario velho do contexto os devolvia. Fiacao REAL (`AuthProvider`, `permissionsCache`, a tela de Configuracoes);
 * so o HTTP mockado.
 *
 * Executar: cd client && CI=true npx react-scripts test src/context/AuthContextPerfilSemPiscar --watchAll=false
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

const RESTRITO = 'Acesso restrito — administrador do Almoxarifado';
const ROL = { id: 1, codigo: 'ROL', nome: 'Rolamentos', descricao: '', parent_id: null, tipo_uso: 'ambos', ativo: 1, qtd_itens: 0 };
const CINCO_MIN = 5 * 60 * 1000;

const payload = (over) => ({
  id: 7, nome: 'Fulano', email: 'f@x', role: 'user', is_superadmin: false, admin_modulos: [], modulos: [],
  perfil_almoxarifado: 'ADMINISTRADOR', perfil_frota: null, ...over,
});
const grupos = (usuario) => ({ data: { grupos: [], permissoes: [], usuario } });
const USUARIO_SEM = { role: 'user', is_superadmin: false, admin_modulos: [], perfil_almoxarifado: null, perfil_frota: null };
const USUARIO_COM = { ...USUARIO_SEM, perfil_almoxarifado: 'ADMINISTRADOR' };

let porUrl;
let container; let root; let authRef; let renders;
function Sonda() { authRef = useAuth(); renders += 1; return null; }

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  invalidatePermissionsCache();
  localStorage.clear();
  renders = 0;
  porUrl = {};
  api.get.mockImplementation((url) => {
    if (url === '/auth/me') return Promise.resolve({ data: { user: payload() } });
    if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: [ROL] });
    if (porUrl[url]) return Promise.resolve(porUrl[url]());
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  jest.restoreAllMocks();
  act(() => root.unmount());
  container.remove();
  localStorage.clear();
  invalidatePermissionsCache();
});

async function abrir() {
  localStorage.setItem('token', 't');
  localStorage.setItem('user', JSON.stringify(payload()));
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
const assentar = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };

describe('D (127) r2 (Etapa 128) — o perfil retirado nao volta quando o cache de permissoes vence', () => {
  test('[RN-22] usuario comum perdeu o perfil: a busca do cache tira, e 5 min depois continua tirado (nao pisca)', async () => {
    await abrir();
    expect(novaFamilia()).toHaveLength(1); // metade positiva: com o perfil, grava
    porUrl['/usuarios/7/grupos'] = () => grupos(USUARIO_SEM);
    await act(async () => { await fetchUserPermissions(7); });
    await assentar();
    expect(authRef.user.perfil_almoxarifado).toBeNull();
    expect(getEffectiveUser(authRef.user).perfil_almoxarifado).toBeNull();
    expect(container.textContent).toContain(RESTRITO);
    expect(JSON.parse(localStorage.getItem('user')).perfil_almoxarifado).toBeNull();
    // o cache vence: o getEffectiveUser cai no usuario do contexto — que agora e o novo
    const agora = Date.now();
    jest.spyOn(Date, 'now').mockReturnValue(agora + CINCO_MIN + 1);
    expect(getEffectiveUser(authRef.user).perfil_almoxarifado).toBeNull();
    await act(async () => { authRef.applyFreshUser({ ...authRef.user }); }); // qualquer re-render da tela
    await assentar();
    expect(container.textContent).toContain(RESTRITO);
    expect(novaFamilia()).toHaveLength(0);
  });

  test('[RN-22] o inverso: quem ganhou o perfil na sessao aberta passa a ver os botoes quando o cache chega', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/auth/me') return Promise.resolve({ data: { user: payload({ perfil_almoxarifado: null }) } });
      if (url === '/almoxarifado/familias?ativo=all') return Promise.resolve({ data: [ROL] });
      if (url === '/usuarios/7/grupos') return Promise.resolve(grupos(USUARIO_COM));
      return Promise.resolve({ data: [] });
    });
    localStorage.setItem('token', 't');
    localStorage.setItem('user', JSON.stringify(payload({ perfil_almoxarifado: null })));
    await act(async () => {
      root.render(<AuthProvider><Sonda /><MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=familias']}><ConfiguracoesAlmoxarifado /></MemoryRouter></AuthProvider>);
    });
    await assentar();
    expect(container.textContent).toContain(RESTRITO); // metade positiva: sem perfil
    await act(async () => { await fetchUserPermissions(7); });
    await assentar();
    expect(authRef.user.perfil_almoxarifado).toBe('ADMINISTRADOR');
    expect(novaFamilia()).toHaveLength(1);
  });

  test('[RN-23] a busca de OUTRO usuario (tela de cadastro) nao muda o contexto do logado', async () => {
    await abrir();
    porUrl['/usuarios/99/grupos'] = () => grupos(USUARIO_SEM);
    await act(async () => { await fetchUserPermissions(99); });
    await assentar();
    expect(authRef.user.perfil_almoxarifado).toBe('ADMINISTRADOR');
    expect(novaFamilia()).toHaveLength(1);
    expect(JSON.parse(localStorage.getItem('user')).perfil_almoxarifado).toBe('ADMINISTRADOR');
  });

  test('[RN-24] a busca com os mesmos perfis nao troca o usuario do contexto nem reescreve o localStorage', async () => {
    await abrir();
    const antes = authRef.user;
    const rendersAntes = renders;
    const gravar = jest.spyOn(Storage.prototype, 'setItem');
    porUrl['/usuarios/7/grupos'] = () => grupos({ ...USUARIO_COM, is_superadmin: false, admin_modulos: [] });
    await act(async () => { await fetchUserPermissions(7); });
    await assentar();
    expect(authRef.user).toBe(antes);
    expect(renders).toBe(rendersAntes);
    expect(gravar.mock.calls.filter(([k]) => k === 'user')).toHaveLength(0);
    // metade positiva: com perfil diferente, regrava (o mesmo caminho)
    invalidatePermissionsCache(7);
    porUrl['/usuarios/7/grupos'] = () => grupos(USUARIO_SEM);
    await act(async () => { await fetchUserPermissions(7); });
    await assentar();
    expect(authRef.user).not.toBe(antes);
    expect(gravar.mock.calls.filter(([k]) => k === 'user')).toHaveLength(1);
  });

  test('[RN-22] usuario inativo (usuario: null no cache) nao mexe no contexto', async () => {
    await abrir();
    porUrl['/usuarios/7/grupos'] = () => ({ data: { grupos: [], permissoes: [], usuario: null } });
    await act(async () => { await fetchUserPermissions(7); });
    await assentar();
    expect(authRef.user.perfil_almoxarifado).toBe('ADMINISTRADOR');
  });

  test('[RN-22] depois do logout, a busca que chega nao recria o usuario', async () => {
    await abrir();
    let soltar;
    porUrl['/usuarios/7/grupos'] = () => new Promise((resolve) => { soltar = () => resolve(grupos(USUARIO_SEM).data); });
    api.get.mockImplementation((url) => (url === '/usuarios/7/grupos'
      ? new Promise((resolve) => { soltar = () => resolve(grupos(USUARIO_SEM)); })
      : Promise.resolve({ data: [] })));
    const emVoo = fetchUserPermissions(7);
    await act(async () => { authRef.logout(); });
    await act(async () => { soltar(); await emVoo; });
    await assentar();
    expect(authRef.user).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
  });
});
