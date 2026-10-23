/**
 * Frota Etapa 1 — Fase 5 (revisao adversarial), achados de fronteira front x back:
 *
 *   Fase5-10  motorista ligado a usuario DESATIVADO: o select mostrava "— nenhum —" e o form guardava o id (todo salvar dava 400).
 *             Agora o usuario ligado aparece rotulado "(inativo)" — so no form do motorista que o tem.
 *   Fase5-11  alerta do tipo checklist no painel: nao e vencimento — mostra a data do registro, nunca "Vencido ha N dia(s)".
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasFase5 --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasEntityPage from './FrotasEntityPage';
import FrotasDashboard from './FrotasDashboard';
import api from '../../services/api';
import { fetchFrotasDashboard } from '../../utils/frotasApi';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Gestor', role: 'admin', admin_modulos: [] }, logout: jest.fn() }),
}));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));
jest.mock('../../utils/frotasApi', () => ({
  ...jest.requireActual('../../utils/frotasApi'),
  fetchFrotasDashboard: jest.fn(),
  baixarPlanilhaFrota: jest.fn(),
  mensagemDoServidor: jest.fn(),
}));

const MOTORISTAS = [
  { id: 1, nome: 'Jose da Silva', status: 'ativo', usuario_id: 5, telefone: '' },
  { id: 2, nome: 'Ana Lima', status: 'ativo', usuario_id: null, telefone: '' },
];
const USUARIOS = [
  { id: 5, nome: 'saiu.da.empresa', email: 'saiu@x.com', ativo: false, motorista: { id: 1, nome: 'Jose da Silva' } },
  { id: 11, nome: 'livre.user', email: '', ativo: true, motorista: null },
];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/frotas/meta') return Promise.resolve({ data: { setores: [] } });
    if (url === '/frotas/motoristas') return Promise.resolve({ data: MOTORISTAS });
    if (url === '/frotas/usuarios-vinculaveis') return Promise.resolve({ data: USUARIOS });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function render(el) {
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  await act(async () => {});
}
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
const grupo = (rotulo) => [...container.querySelectorAll('.frotas-form-group')]
  .find((g) => g.querySelector('label')?.textContent.trim() === rotulo);
const editarLinha = (i) => container.querySelectorAll('tbody tr')[i].querySelector('.frotas-action-btn[title="Editar"]');
const selectUsuario = () => grupo('Usuário de acesso (portal do motorista)').querySelector('select');

describe('Fase5-10 motorista ligado a usuario desativado', () => {
  test('o select mostra o usuario ligado com "(inativo)" e salvar manda o mesmo id', async () => {
    await render(<FrotasEntityPage entityKey="motoristas" />);
    await clicar(editarLinha(0));
    const select = selectUsuario();
    expect(select.value).toBe('5');
    expect([...select.options].find((o) => o.value === '5').textContent).toBe('saiu.da.empresa (saiu@x.com) (inativo)');
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(api.put.mock.calls[0][0]).toBe('/frotas/motoristas/1');
    expect(api.put.mock.calls[0][1].usuario_id).toBe(5);
  });

  test('no form de OUTRO motorista o usuario inativo nao e oferecido', async () => {
    await render(<FrotasEntityPage entityKey="motoristas" />);
    await clicar(editarLinha(1));
    const valores = [...selectUsuario().options].map((o) => o.value);
    expect(valores).not.toContain('5');
    expect(valores).toContain('11');
  });
});

describe('Fase5-11 alerta de checklist no painel', () => {
  test('checklist mostra a data do registro, sem "Vencido"; documento continua com os dias', async () => {
    fetchFrotasDashboard.mockResolvedValue({
      alertas: [
        { tipo: 'checklist', severidade: 'alto', titulo: 'Checklist com pendência — ABC1D23', descricao: 'Falha: Freios', data: '2026-10-20', dias_restantes: -3 },
        { tipo: 'documento', severidade: 'critico', titulo: 'CRLV — ABC1D23', descricao: 'CRLV', data: '2026-10-20', dias_restantes: -3 },
      ],
    });
    await render(<FrotasDashboard />);
    const itens = [...container.querySelectorAll('.frotas-alert-item')];
    expect(itens).toHaveLength(2);
    const ck = itens.find((i) => i.textContent.includes('Checklist com pendência'));
    expect(ck.textContent).not.toMatch(/Vencido|restantes/);
    expect(ck.textContent).toContain('Registrado em 20/10/2026');
    const doc = itens.find((i) => i.textContent.includes('CRLV'));
    expect(doc.textContent).toContain('Vencido há 3 dia(s)');
  });
});
