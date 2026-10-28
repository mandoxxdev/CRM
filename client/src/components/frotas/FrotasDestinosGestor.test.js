/**
 * Frota Etapa 8 (G5) — telas do gestor: Destinos, veiculo "Liberado para funcionarios", Viagens com Condutor e Origem GMP.
 *
 *   RN-F8.25  Veiculos: checkbox "Liberado para funcionarios" (uso_funcionarios) e a coluna Condutor mostra "Funcionarios" quando a
 *             marca esta ligada e nao ha condutor responsavel. Viagens: coluna e campo Condutor; Nova Viagem ja vem com Origem GMP.
 *   RN-F8.36  Tela Frota -> Destinos (pagina generica): Nome, Endereco, Cadastrado por, Status (Ativo/Desativado); filtro "Mostrar:
 *             Ativos/Todos" manda `inativos=1` (ajuste T-3: sem ele o destino desativado sumia para sempre); Novo/Editar/Excluir so
 *             para quem altera; Consulta so le.
 *   RN-F8.37  Viagens: Destino continua texto livre.
 *
 * Cada negativo tem a metade positiva no mesmo arquivo (molde FrotasEtapa2Gestor.test.js).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasDestinosGestor --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasEntityPage, { FrotasDestinos } from './FrotasEntityPage';
import { ENTITY_CONFIGS } from './frotasEntityConfigs';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
let mockUsuario = null;
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUsuario, logout: jest.fn() }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const ADMIN = { id: 1, nome: 'Gestor', role: 'user', is_superadmin: 0, admin_modulos: ['frota'], perfil_frota: null };
const CONSULTA = { id: 2, nome: 'Carla', role: 'user', is_superadmin: 0, admin_modulos: [], perfil_frota: 'CONSULTA' };

const DESTINOS = [
  { id: 1, nome: 'Cliente Alfa', endereco: 'Rua A, 10', ativo: 1, criado_por_id: 7, criado_por_nome: 'Jose' },
  { id: 2, nome: 'Fornecedor Beta', endereco: null, ativo: 0, criado_por_id: 1, criado_por_nome: 'Gestor' },
];
const VEICULOS = [
  { id: 1, placa: 'FUN1C10', status: 'ativo', uso_funcionarios: 1, motorista_nome: null },
  { id: 2, placa: 'SEM0C20', status: 'ativo', uso_funcionarios: 0, motorista_nome: null },
  { id: 3, placa: 'RES3P30', status: 'ativo', uso_funcionarios: 1, motorista_nome: 'Jose da Silva' },
];
const VIAGENS = [
  { id: 4, placa: 'FUN1C10', motorista_nome: null, condutor_nome: 'Marcos (Compras)', origem: 'GMP', destino: 'Cliente Alfa', status: 'em_andamento' },
  { id: 5, placa: 'SEM0C20', motorista_nome: 'Jose da Silva', condutor_nome: null, origem: 'GMP', destino: 'Oficina', status: 'concluida' },
];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUsuario = ADMIN;
  api.get.mockImplementation((url) => {
    if (url === '/frotas/meta') return Promise.resolve({ data: { setores: [], statusViagem: ['solicitada'], statusVeiculo: ['ativo'], origemPadrao: 'GMP' } });
    if (url === '/frotas/destinos') return Promise.resolve({ data: DESTINOS });
    if (url === '/frotas/veiculos') return Promise.resolve({ data: VEICULOS });
    if (url === '/frotas/viagens') return Promise.resolve({ data: VIAGENS });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 9 } });
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
const cabecalhos = () => [...container.querySelectorAll('thead th')].map((th) => th.textContent);
const linhas = () => [...container.querySelectorAll('tbody tr')];
const celula = (i, rotulo) => linhas()[i].querySelectorAll('td')[cabecalhos().indexOf(rotulo)];
const grupo = (rotulo) => [...container.querySelectorAll('.frotas-form-group')]
  .find((g) => g.querySelector('label')?.textContent.trim() === rotulo);
const botaoComTexto = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent.includes(t));
const editarLinha = (i) => linhas()[i].querySelector('.frotas-action-btn[title="Editar"]');
const digitar = (el, v) => act(() => {
  Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, v);
  el.dispatchEvent(new Event('input', { bubbles: true }));
});
const escolher = (select, v) => act(() => {
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, v);
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
async function salvar() {
  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}

describe('RN-F8.36 — tela Destinos do gestor', () => {
  test('a lista mostra Nome, Endereco, Cadastrado por e Status (Ativo / Desativado)', async () => {
    await render(<FrotasDestinos />);
    expect(api.get).toHaveBeenCalledWith('/frotas/destinos', { params: {} });
    expect(container.textContent).toContain('Destinos');
    expect(cabecalhos()).toEqual(expect.arrayContaining(['Nome', 'Endereço', 'Cadastrado por', 'Status']));
    expect(linhas()).toHaveLength(2);
    expect(celula(0, 'Nome').textContent).toBe('Cliente Alfa');
    expect(celula(0, 'Endereço').textContent).toBe('Rua A, 10');
    expect(celula(0, 'Cadastrado por').textContent).toBe('Jose');
    expect(celula(0, 'Status').querySelector('.frotas-badge-ativo').textContent).toBe('Ativo');
    expect(celula(1, 'Endereço').textContent).toBe('-');
    expect(celula(1, 'Status').querySelector('.frotas-badge-inativo').textContent).toBe('Desativado');
    // ponto 19 do plano: badge generico mostraria "1"/"0"
    expect(celula(0, 'Status').textContent).not.toBe('1');
  });

  test('filtro "Mostrar": Ativos e o padrao (sem query); Todos manda inativos=1', async () => {
    await render(<FrotasDestinos />);
    const filtro = container.querySelector('.frotas-filter-select');
    expect(filtro).not.toBeNull();
    expect([...filtro.options].map((o) => o.textContent)).toEqual(['Ativos', 'Todos']);
    expect(filtro.value).toBe('');
    api.get.mockClear();
    await escolher(filtro, '1');
    await act(async () => {});
    expect(api.get).toHaveBeenCalledWith('/frotas/destinos', { params: { inativos: '1' } });
  });

  test('metade positiva: o gestor ve Novo Destino, Editar e Excluir', async () => {
    await render(<FrotasDestinos />);
    expect(botaoComTexto('Novo Destino')).toBeTruthy();
    expect(container.querySelector('.frotas-action-btn[title="Editar"]')).not.toBeNull();
    expect(container.querySelector('.frotas-action-btn[title="Excluir"]')).not.toBeNull();
  });

  test('CONSULTA so le: a lista aparece, sem Novo, Editar e Excluir', async () => {
    mockUsuario = CONSULTA;
    await render(<FrotasDestinos />);
    expect(container.querySelector('tbody').textContent).toContain('Cliente Alfa');
    expect(botaoComTexto('Novo Destino')).toBeUndefined();
    expect(container.querySelector('.frotas-action-btn')).toBeNull();
  });

  test('Novo Destino: Nome*, Endereco e Status; salvar faz POST /frotas/destinos com o nome', async () => {
    await render(<FrotasDestinos />);
    await clicar(botaoComTexto('Novo Destino'));
    expect(grupo('Nome *').querySelector('input').required).toBe(true);
    expect(grupo('Endereço')).toBeTruthy();
    const status = grupo('Status').querySelector('select');
    expect([...status.options].map((o) => o.textContent)).toEqual(expect.arrayContaining(['Ativo', 'Desativado']));
    expect(status.value).toBe('1');
    await digitar(grupo('Nome *').querySelector('input'), 'Cliente Gama');
    await digitar(grupo('Endereço').querySelector('input'), 'Av. B, 200');
    await salvar();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, corpo] = api.post.mock.calls[0];
    expect(url).toBe('/frotas/destinos');
    expect(corpo).toEqual(expect.objectContaining({ nome: 'Cliente Gama', endereco: 'Av. B, 200' }));
    expect(String(corpo.ativo)).toBe('1');
  });

  test('Editar um desativado abre com Status Desativado; trocar para Ativo faz PUT com ativo ligado (reativar, T-3)', async () => {
    api.put.mockResolvedValue({ data: {} });
    await render(<FrotasDestinos />);
    await clicar(editarLinha(1));
    const status = grupo('Status').querySelector('select');
    expect(status.value).toBe('0');
    expect(grupo('Nome *').querySelector('input').value).toBe('Fornecedor Beta');
    await escolher(status, '1');
    await salvar();
    expect(api.put).toHaveBeenCalledTimes(1);
    const [url, corpo] = api.put.mock.calls[0];
    expect(url).toBe('/frotas/destinos/2');
    expect(String(corpo.ativo)).toBe('1');
  });
});

describe('RN-F8.25 — Veiculos: Liberado para funcionarios', () => {
  test('coluna Condutor: "Funcionarios" com a marca ligada e sem responsavel; "-" sem marca; o responsavel vence', async () => {
    await render(<FrotasEntityPage entityKey="veiculos" />);
    expect(celula(0, 'Condutor').textContent).toBe('Funcionários');
    expect(celula(1, 'Condutor').textContent).toBe('-');
    expect(celula(2, 'Condutor').textContent).toBe('Jose da Silva');
  });

  test('Novo Veiculo tem o checkbox; marcado, o corpo vai com uso_funcionarios: 1', async () => {
    await render(<FrotasEntityPage entityKey="veiculos" />);
    await clicar(botaoComTexto('Novo Veículo'));
    const item = [...container.querySelectorAll('.frotas-check-item')]
      .find((l) => l.textContent.includes('Liberado para funcionários (quem dirige varia; a saída pede o condutor)'));
    expect(item).toBeTruthy();
    const caixa = item.querySelector('input[type="checkbox"]');
    expect(caixa.checked).toBe(false);
    await digitar(grupo('Placa / Identificação *').querySelector('input'), 'NOV0A00');
    await act(async () => { caixa.click(); });
    expect(caixa.checked).toBe(true);
    await salvar();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, corpo] = api.post.mock.calls[0];
    expect(url).toBe('/frotas/veiculos');
    expect(corpo.uso_funcionarios).toBe(1);
    expect(corpo.placa).toBe('NOV0A00');
  });

  test('metade negativa: sem marcar, o corpo vai com uso_funcionarios: 0 (ponto 6 do plano)', async () => {
    await render(<FrotasEntityPage entityKey="veiculos" />);
    await clicar(botaoComTexto('Novo Veículo'));
    await digitar(grupo('Placa / Identificação *').querySelector('input'), 'NOV0A00');
    await salvar();
    expect(api.post.mock.calls[0][1].uso_funcionarios).toBe(0);
  });

  test('Editar um veiculo liberado abre com a caixa marcada', async () => {
    await render(<FrotasEntityPage entityKey="veiculos" />);
    await clicar(editarLinha(0));
    const item = [...container.querySelectorAll('.frotas-check-item')].find((l) => l.textContent.includes('Liberado para funcionários'));
    expect(item.querySelector('input[type="checkbox"]').checked).toBe(true);
  });
});

describe('RN-F8.25 / RN-F8.37 — Viagens: Condutor e Origem GMP', () => {
  test('coluna Condutor logo depois de Motorista, com o nome ou "-"', async () => {
    await render(<FrotasEntityPage entityKey="viagens" />);
    const cab = cabecalhos();
    expect(cab[cab.indexOf('Motorista') + 1]).toBe('Condutor');
    expect(celula(0, 'Condutor').textContent).toBe('Marcos (Compras)');
    expect(celula(0, 'Motorista').textContent).toBe('-');
    expect(celula(1, 'Condutor').textContent).toBe('-');
    expect(celula(1, 'Motorista').textContent).toBe('Jose da Silva');
  });

  test('Nova Viagem: campo "Condutor (funcionario)" depois de Motorista, Origem ja vem GMP e Destino continua texto', async () => {
    await render(<FrotasEntityPage entityKey="viagens" />);
    await clicar(botaoComTexto('Nova Viagem'));
    const rotulos = [...container.querySelectorAll('.frotas-form-group > label')].map((l) => l.textContent.trim());
    expect(rotulos[rotulos.indexOf('Motorista') + 1]).toBe('Condutor (funcionário)');
    expect(grupo('Condutor (funcionário)').querySelector('input').type).toBe('text');
    expect(grupo('Origem').querySelector('input').value).toBe('GMP');
    expect(grupo('Destino').querySelector('input').type).toBe('text');
    expect(grupo('Destino').querySelector('select')).toBeNull();
    await digitar(grupo('Condutor (funcionário)').querySelector('input'), 'Marcos (Compras)');
    await salvar();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][1]).toEqual(expect.objectContaining({ origem: 'GMP', condutor_nome: 'Marcos (Compras)' }));
  });

  test('getDefaultForm das viagens parte de origem GMP e condutor vazio', () => {
    const f = ENTITY_CONFIGS.viagens.getDefaultForm({});
    expect(f.origem).toBe('GMP');
    expect(f.condutor_nome).toBe('');
  });
});
