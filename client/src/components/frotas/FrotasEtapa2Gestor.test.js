/**
 * Frota Etapa 2 (T3) — o que muda nas telas do gestor:
 *
 *   RN-F2.09  no cadastro do motorista, o "Usuario de acesso" com perfil Consulta no Frota mostra um aviso (nao bloqueia). O aviso sai
 *             do form.usuario_id: aparece ao ABRIR um motorista ja ligado e ao TROCAR o usuario.
 *   RN-F2.14  CONSULTA nas telas de cadastro e so leitura: sem Novo, Editar, Aprovar e Excluir. Quem decide continua sendo o servidor.
 *
 * Cada negativo tem a metade positiva no mesmo arquivo (ADMIN ve os botoes; usuario MOTORISTA nao tem aviso): sem ela, o negativo
 * passaria com a tela vazia.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasEtapa2Gestor --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasEntityPage from './FrotasEntityPage';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
let mockUsuario = null;
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUsuario, logout: jest.fn() }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const AVISO_CONSULTA = 'Este usuário está com o perfil Consulta no Frota: ele vê o painel, mas não consegue registrar no portal. '
  + 'Para ele registrar, mude o perfil em Frota → Perfis de acesso.';

const ADMIN = { id: 1, nome: 'Gestor', role: 'user', is_superadmin: 0, admin_modulos: ['frota'], perfil_frota: null };
const CONSULTA = { id: 2, nome: 'Carla', role: 'user', is_superadmin: 0, admin_modulos: [], perfil_frota: 'CONSULTA' };

const MOTORISTAS = [
  { id: 1, nome: 'Jose da Silva', status: 'ativo', usuario_id: 10, telefone: '' },
  { id: 2, nome: 'Ana Lima', status: 'ativo', usuario_id: 11, telefone: '' },
];
const USUARIOS = [
  { id: 10, nome: 'jose.user', email: '', ativo: true, perfil_frota: 'CONSULTA', motorista: { id: 1, nome: 'Jose da Silva' } },
  { id: 11, nome: 'ana.user', email: '', ativo: true, perfil_frota: 'MOTORISTA', motorista: { id: 2, nome: 'Ana Lima' } },
  { id: 12, nome: 'carla.user', email: '', ativo: true, perfil_frota: 'CONSULTA', motorista: null },
];
const VIAGENS = [{ id: 4, placa: 'ABC1D23', origem: 'Fabrica', destino: 'Cliente', status: 'solicitada' }];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUsuario = ADMIN;
  api.get.mockImplementation((url) => {
    if (url === '/frotas/meta') return Promise.resolve({ data: { setores: [], statusViagem: ['solicitada'] } });
    if (url === '/frotas/motoristas') return Promise.resolve({ data: MOTORISTAS });
    if (url === '/frotas/usuarios-vinculaveis') return Promise.resolve({ data: USUARIOS });
    if (url === '/frotas/viagens') return Promise.resolve({ data: VIAGENS });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function render(entityKey) {
  await act(async () => { root.render(<MemoryRouter><FrotasEntityPage entityKey={entityKey} /></MemoryRouter>); });
  await act(async () => {});
}
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
const ROTULO_USUARIO = 'Usuário de acesso (portal do motorista)';
const grupo = (rotulo) => [...container.querySelectorAll('.frotas-form-group')]
  .find((g) => g.querySelector('label')?.textContent.trim() === rotulo);
const editarLinha = (i) => container.querySelectorAll('tbody tr')[i].querySelector('.frotas-action-btn[title="Editar"]');
const avisoDoUsuario = () => grupo(ROTULO_USUARIO).querySelector('[role="note"]');
async function escolher(select, valor) {
  await act(async () => {
    select.value = valor;
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const botaoComTexto = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(t));

describe('RN-F2.09 — aviso no motorista ligado a usuario Consulta', () => {
  test('ao ABRIR um motorista ja ligado a um usuario Consulta, o aviso aparece abaixo do select', async () => {
    await render('motoristas');
    await clicar(editarLinha(0));
    expect(grupo(ROTULO_USUARIO).querySelector('select').value).toBe('10');
    expect(avisoDoUsuario()).not.toBeNull();
    expect(avisoDoUsuario().textContent).toBe(AVISO_CONSULTA);
  });

  test('metade positiva: motorista ligado a usuario MOTORISTA nao tem aviso; trocar para um Consulta faz aparecer, e voltar some', async () => {
    await render('motoristas');
    await clicar(editarLinha(1));
    const select = grupo(ROTULO_USUARIO).querySelector('select');
    expect(select.value).toBe('11');
    expect(avisoDoUsuario()).toBeNull();
    await escolher(select, '12');
    expect(avisoDoUsuario().textContent).toBe(AVISO_CONSULTA);
    await escolher(select, '');
    expect(avisoDoUsuario()).toBeNull();
  });

  test('o aviso nao bloqueia: o Salvar continua habilitado', async () => {
    await render('motoristas');
    await clicar(editarLinha(0));
    expect(botaoComTexto('Salvar').disabled).toBe(false);
  });
});

describe('RN-F2.14 — CONSULTA so le nas telas do gestor', () => {
  test('metade positiva: ADMIN_FROTA ve Novo, Editar e Excluir em Veiculos (com uma linha)', async () => {
    api.get.mockImplementation((url) => (url === '/frotas/veiculos'
      ? Promise.resolve({ data: [{ id: 1, placa: 'ABC1D23', status: 'ativo' }] })
      : Promise.resolve({ data: [] })));
    await render('veiculos');
    expect(botaoComTexto('Novo Veículo')).toBeTruthy();
    expect(container.querySelector('.frotas-action-btn[title="Editar"]')).not.toBeNull();
    expect(container.querySelector('.frotas-action-btn[title="Excluir"]')).not.toBeNull();
  });

  test('CONSULTA em Veiculos: a linha aparece, sem Novo, Editar e Excluir', async () => {
    mockUsuario = CONSULTA;
    api.get.mockImplementation((url) => (url === '/frotas/veiculos'
      ? Promise.resolve({ data: [{ id: 1, placa: 'ABC1D23', status: 'ativo' }] })
      : Promise.resolve({ data: [] })));
    await render('veiculos');
    expect(container.querySelector('tbody').textContent).toContain('ABC1D23');
    expect(botaoComTexto('Novo Veículo')).toBeUndefined();
    expect(container.querySelector('.frotas-action-btn[title="Editar"]')).toBeNull();
    expect(container.querySelector('.frotas-action-btn[title="Excluir"]')).toBeNull();
  });

  test('metade positiva: ADMIN_FROTA ve Aprovar na viagem solicitada', async () => {
    await render('viagens');
    expect(container.querySelector('tbody').textContent).toContain('ABC1D23');
    expect(container.querySelector('.frotas-action-btn[title="Aprovar"]')).not.toBeNull();
  });

  test('CONSULTA em Viagens: a viagem solicitada aparece, sem Aprovar (nem Novo/Editar/Excluir)', async () => {
    mockUsuario = CONSULTA;
    await render('viagens');
    expect(container.querySelector('tbody').textContent).toContain('ABC1D23');
    expect(container.querySelector('.frotas-action-btn[title="Aprovar"]')).toBeNull();
    expect(container.querySelector('.frotas-action-btn')).toBeNull();
    expect(container.querySelector('.frotas-header-actions .frotas-btn-primary')).toBeNull();
  });
});
