/**
 * Etapa 126 (C261, RN-11; Fase 2 M5) — o formulário de material só manda "cadastre em Configurações" a quem o servidor deixa cadastrar
 * família e localização (`podeGravarConfigAlmox`). O administrador do sistema sem perfil abria Configurações e recebia 403 ao cadastrar;
 * agora vê "solicite a um administrador", como o resto.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MaterialFormDicaConfiguracoes --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MaterialAlmoxarifadoForm from './MaterialAlmoxarifadoForm';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
let mockUser = null;
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUser }) }));

const ADMIN_SISTEMA = { id: 5, nome: 'Admin do sistema', role: 'admin' };
const ADM_PERFIL = { id: 4, nome: 'Adm', role: 'user', perfil_almoxarifado: 'ADMINISTRADOR' };

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  // nenhuma familia, nenhuma localizacao: as duas dicas aparecem
  api.get.mockImplementation(() => Promise.resolve({ data: [] }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function renderNovo(user) {
  mockUser = user;
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/materiais/novo']}>
        <Routes><Route path="/almoxarifado/materiais/novo" element={<MaterialAlmoxarifadoForm />} /></Routes>
      </MemoryRouter>,
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}
const link = (href) => container.querySelector(`a[href="${href}"]`);

describe('C261 (Etapa 126) — RN-11: a dica do formulário de material', () => {
  test('[RN-11] administrador do sistema: "solicite a um administrador" nas duas, sem link para Configurações', async () => {
    await renderNovo(ADMIN_SISTEMA);
    expect(container.textContent).toContain('Nenhuma família cadastrada');
    expect(container.textContent).toContain('Nenhuma localização cadastrada');
    expect((container.textContent.match(/solicite a um administrador/g) || []).length).toBe(2);
    expect(link('/almoxarifado/configuracoes?tab=familias')).toBeNull();
    expect(link('/almoxarifado/configuracoes?tab=localizacoes')).toBeNull();
  });
  test('[RN-11] perfil Administrador: os dois links, o de localização para a aba Localizações', async () => {
    await renderNovo(ADM_PERFIL);
    expect(link('/almoxarifado/configuracoes?tab=familias')).not.toBeNull();
    expect(link('/almoxarifado/configuracoes?tab=localizacoes')).not.toBeNull();
    expect(container.textContent).not.toContain('solicite a um administrador');
  });
});
