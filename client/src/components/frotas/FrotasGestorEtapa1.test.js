/**
 * Frota Etapa 1 (T7) — telas do gestor: usuario de acesso no motorista, colunas novas do Checklist, Origem nas Viagens e a
 * planilha exportada pelos Relatorios. So a fronteira HTTP (`api`) e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasGestorEtapa1 --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasEntityPage from './FrotasEntityPage';
import FrotasRelatorios from './FrotasRelatorios';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));

const MOTORISTAS = [
  { id: 1, nome: 'Jose da Silva', status: 'ativo', usuario_id: 10, telefone: '' },
  { id: 2, nome: 'Ana Lima', status: 'ativo', usuario_id: null, telefone: '' },
];
const USUARIOS = [
  { id: 10, nome: 'jose.user', email: 'jose@x.com', motorista: { id: 1, nome: 'Jose da Silva' } },
  { id: 11, nome: 'livre.user', email: '', motorista: null },
];
const CHECKLISTS = [
  { id: 1, data_checklist: '2026-10-23', placa: 'ABC1D23', motorista_nome: 'Jose', tipo_registro: 'saida', km: 12345, status_geral: 'PENDENCIA', aprovado: 0 },
  { id: 2, data_checklist: '2026-10-22', placa: 'ABC1D23', motorista_nome: 'Jose', tipo_registro: 'retorno', km: 12400, status_geral: 'INCOMPLETO', aprovado: 0 },
  // linha de antes da etapa: sem status_geral, so o `aprovado`
  { id: 3, data_checklist: '2026-01-01', placa: 'XYZ', motorista_nome: 'Ana', tipo_registro: null, km: null, aprovado: 1 },
];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/frotas/meta') return Promise.resolve({ data: { setores: [], statusViagem: ['solicitada'] } });
    if (url === '/frotas/motoristas') return Promise.resolve({ data: MOTORISTAS });
    if (url === '/frotas/usuarios-vinculaveis') return Promise.resolve({ data: USUARIOS });
    if (url === '/frotas/checklists') return Promise.resolve({ data: CHECKLISTS });
    if (url === '/frotas/viagens') return Promise.resolve({ data: [{ id: 4, placa: 'ABC1D23', origem: 'Fabrica', destino: 'Cliente', status: 'concluida' }] });
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

describe('Motorista: usuario de acesso', () => {
  test('select com "— nenhum —", marca quem ja esta ligado a OUTRO e nao o proprio', async () => {
    await render(<FrotasEntityPage entityKey="motoristas" />);
    // Editando a Ana (id 2): o jose.user esta ligado ao Jose -> "(ligado a Jose da Silva)"
    await clicar(editarLinha(1));
    const select = grupo('Usuário de acesso (portal do motorista)').querySelector('select');
    const textos = [...select.options].map((o) => o.textContent);
    expect(textos[0]).toBe('— nenhum —');
    expect(textos).toContain('jose.user (jose@x.com) (ligado a Jose da Silva)');
    expect(textos).toContain('livre.user');
    expect(select.value).toBe('');
  });

  test('editando o proprio Jose: o usuario dele aparece sem "(ligado a)" e "— nenhum —" envia usuario_id null', async () => {
    await render(<FrotasEntityPage entityKey="motoristas" />);
    await clicar(editarLinha(0));
    const select = grupo('Usuário de acesso (portal do motorista)').querySelector('select');
    expect(select.value).toBe('10');
    expect([...select.options].find((o) => o.value === '10').textContent).toBe('jose.user (jose@x.com)');
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, '');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(api.put).toHaveBeenCalledTimes(1);
    const [url, corpo] = api.put.mock.calls[0];
    expect(url).toBe('/frotas/motoristas/1');
    expect(corpo.usuario_id).toBeNull();
  });

  test('escolher um usuario envia o id como numero', async () => {
    await render(<FrotasEntityPage entityKey="motoristas" />);
    await clicar(editarLinha(1));
    const select = grupo('Usuário de acesso (portal do motorista)').querySelector('select');
    act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, '11');
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => {
      container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    expect(api.put.mock.calls[0][1].usuario_id).toBe(11);
  });
});

describe('Checklist: Tipo, KM e Situacao', () => {
  test('colunas novas e situacao com cor; linha antiga cai no aprovado', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    const cab = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(cab).toEqual(expect.arrayContaining(['Tipo', 'KM', 'Situação']));
    expect(cab).not.toContain('Resultado');
    const linhas = [...container.querySelectorAll('tbody tr')];
    expect(linhas[0].textContent).toContain('Saída');
    expect(linhas[0].textContent).toContain('12.345');
    expect(linhas[0].querySelector('.frotas-badge-situacao-pendencia').textContent).toBe('PENDÊNCIA');
    expect(linhas[1].textContent).toContain('Retorno');
    expect(linhas[1].querySelector('.frotas-badge-situacao-incompleto').textContent).toBe('INCOMPLETO');
    expect(linhas[2].querySelector('.frotas-badge-situacao-ok').textContent).toBe('OK');
  });

  test('"Novo Checklist" do gestor continua', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    expect([...container.querySelectorAll('button')].some((b) => b.textContent.includes('Novo Checklist'))).toBe(true);
  });
});

describe('Viagens: Origem', () => {
  test('coluna e campo Origem', async () => {
    await render(<FrotasEntityPage entityKey="viagens" />);
    expect([...container.querySelectorAll('thead th')].map((th) => th.textContent)).toContain('Origem');
    expect(container.querySelector('tbody tr').textContent).toContain('Fabrica');
    await clicar(editarLinha(0));
    expect(grupo('Origem').querySelector('input').value).toBe('Fabrica');
  });
});

describe('Relatorios: Exportar planilha', () => {
  test('baixa /frotas/exportar.xlsx como blob com o periodo da tela', async () => {
    const criar = jest.fn(() => 'blob:x');
    const revogar = jest.fn();
    window.URL.createObjectURL = criar;
    window.URL.revokeObjectURL = revogar;
    const clique = jest.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    api.get.mockImplementation((url) => {
      if (url === '/frotas/exportar.xlsx') {
        return Promise.resolve({ data: 'xlsx', headers: { 'content-disposition': 'attachment; filename="controle-de-frota-2026-10-23.xlsx"' } });
      }
      return Promise.resolve({ data: [] });
    });
    await render(<FrotasRelatorios />);
    const datas = container.querySelectorAll('input[type="date"]');
    const setar = (el, v) => act(() => {
      Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    setar(datas[0], '2026-10-01');
    setar(datas[1], '2026-10-31');
    const botao = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Exportar planilha'));
    await clicar(botao);
    expect(api.get).toHaveBeenCalledWith('/frotas/exportar.xlsx', {
      params: { data_inicio: '2026-10-01', data_fim: '2026-10-31' }, responseType: 'blob',
    });
    expect(clique).toHaveBeenCalled();
    expect(revogar).toHaveBeenCalledWith('blob:x');
    clique.mockRestore();
  });
});
