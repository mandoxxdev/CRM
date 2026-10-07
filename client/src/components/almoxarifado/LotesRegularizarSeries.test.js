/**
 * Etapa 61 (RN-06) — regularização das séries na aba Séries de Lotes e Séries.
 *
 * Material com controle de série cujas séries presentes (EM_ESTOQUE + BLOQUEADA) diferem do físico
 * (quantidade_atual, relido por GET /almoxarifado/materiais/:id) mostra o aviso "Séries presentes:
 * {p} · Físico: {f}" e, para quem pode `ajustar_estoque`, o formulário: físico > presentes →
 * números a cadastrar (um por linha); presentes > físico → caixas das presentes a baixar. POST
 * /materiais/:id/series/regularizar { cadastrar | baixar, justificativa } (mínimo 5 caracteres).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/LotesRegularizarSeries --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LotesAlmoxarifado from './LotesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: (a) => mockPode(a), bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const MATERIAL = { id: 10, codigo: 'MAT-1', nome: 'Medidor', unidade: 'UN' };
const SERIES = [
  { id: 501, numero: 'SN-1', status: 'EM_ESTOQUE', lote_codigo: null, localizacao_descricao: null },
  { id: 502, numero: 'SN-2', status: 'BLOQUEADA', lote_codigo: null, localizacao_descricao: null },
  { id: 503, numero: 'SN-3', status: 'ENTREGUE', lote_codigo: null, localizacao_descricao: null },
  { id: 504, numero: 'SN-4', status: 'EM_ESTOQUE', lote_codigo: null, localizacao_descricao: null },
];

let container;
let root;
let materialDetalhe;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  // 3 presentes (SN-1, SN-2 bloqueada, SN-4); SN-3 entregue não conta.
  materialDetalhe = { ...MATERIAL, controle_serie: 1, quantidade_atual: 5 };
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
    if (url === '/almoxarifado/materiais/10') return Promise.resolve({ data: materialDetalhe });
    if (url === '/almoxarifado/materiais/10/series') return Promise.resolve({ data: SERIES });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { cadastradas: 1, baixadas: 0 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/lotes?material_id=10&aba=SERIES']}>
        <LotesAlmoxarifado />
      </MemoryRouter>
    );
  });
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

const aviso = () => container.querySelector('#series-divergencia');
const formulario = () => container.querySelector('#series-regularizar');
const botao = () => container.querySelector('#regularizar-confirmar');
const digitar = (el, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const cadastrar = (v) => digitar(container.querySelector('#regularizar-cadastrar'), v);
const justificar = (v) => digitar(container.querySelector('#regularizar-justificativa'), v);
const marcar = async (id) => {
  await act(async () => { container.querySelector(`#series-regularizar input[data-serie-id="${id}"]`).click(); });
};
const clicarRegularizar = async () => { await act(async () => { botao().click(); }); };

describe('Etapa 61: regularização das séries', () => {
  test('aviso só quando presentes ≠ físico', async () => {
    materialDetalhe = { ...MATERIAL, controle_serie: 1, quantidade_atual: 3 };
    await renderizar();
    expect(aviso()).toBeNull();
  });

  test('material sem controle de série não mostra aviso, mesmo com diferença', async () => {
    materialDetalhe = { ...MATERIAL, controle_serie: 0, quantidade_atual: 9 };
    await renderizar();
    expect(aviso()).toBeNull();
  });

  test('físico > presentes: aviso com os números e cadastrar manda os números aparados', async () => {
    await renderizar();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/10');
    expect(aviso().textContent).toContain('Séries presentes: 3 · Físico: 5');
    expect(formulario().textContent).toContain('até 2');
    cadastrar('  SN-9  \n\n SN-10\n');
    justificar('Inventario de setembro');
    expect(botao().disabled).toBe(false);
    const getsAntes = api.get.mock.calls.filter(([u]) => u === '/almoxarifado/materiais/10/series').length;
    await clicarRegularizar();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais/10/series/regularizar', {
      cadastrar: ['SN-9', 'SN-10'], justificativa: 'Inventario de setembro',
    });
    // Recarrega depois do sucesso.
    const getsDepois = api.get.mock.calls.filter(([u]) => u === '/almoxarifado/materiais/10/series').length;
    expect(getsDepois).toBeGreaterThan(getsAntes);
  });

  test('Fase 5: lote das séries cadastradas vai como lote_id só quando escolhido; dica de reativar', async () => {
    const getBase = api.get.getMockImplementation();
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais/10/lotes') return Promise.resolve({ data: [{ id: 77, codigo: 'L-77', status: 'LIBERADO' }] });
      return getBase(url);
    });
    await renderizar();
    expect(formulario().textContent).toContain('Para reativar uma série baixada por engano, informe o número dela.');
    const select = container.querySelector('#regularizar-lote');
    expect([...select.options].map((o) => o.textContent)).toEqual(['Sem lote', 'L-77']);
    // Sem escolher: o corpo não leva lote_id.
    cadastrar('SN-9');
    justificar('Inventario de setembro');
    await clicarRegularizar();
    expect(api.post).toHaveBeenLastCalledWith('/almoxarifado/materiais/10/series/regularizar', {
      cadastrar: ['SN-9'], justificativa: 'Inventario de setembro',
    });
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    // Escolhido: lote_id numérico.
    cadastrar('SN-10');
    justificar('Inventario de setembro');
    act(() => {
      const s = container.querySelector('#regularizar-lote');
      s.value = '77';
      s.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await clicarRegularizar();
    expect(api.post).toHaveBeenLastCalledWith('/almoxarifado/materiais/10/series/regularizar', {
      cadastrar: ['SN-10'], justificativa: 'Inventario de setembro', lote_id: 77,
    });
  });

  test('cadastrar acima da diferença bloqueia', async () => {
    await renderizar();
    cadastrar('A\nB\nC');
    justificar('Inventario de setembro');
    expect(botao().disabled).toBe(true);
  });

  test('presentes > físico: baixar manda os ids das séries marcadas (até a diferença)', async () => {
    materialDetalhe = { ...MATERIAL, controle_serie: 1, quantidade_atual: 1 };
    await renderizar();
    expect(aviso().textContent).toContain('Séries presentes: 3 · Físico: 1');
    expect(container.querySelector('#regularizar-cadastrar')).toBeNull();
    // Só as presentes são oferecidas — a entregue não.
    const oferecidas = [...formulario().querySelectorAll('input[type="checkbox"]')].map((c) => c.getAttribute('data-serie-id'));
    expect(oferecidas).toEqual(['501', '502', '504']);
    await marcar(502);
    await marcar(504);
    expect(formulario().querySelector('input[data-serie-id="501"]').disabled).toBe(true);
    justificar('Series sairam antes da etapa 61');
    await clicarRegularizar();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais/10/series/regularizar', {
      baixar: [502, 504], justificativa: 'Series sairam antes da etapa 61',
    });
  });

  test('justificativa curta bloqueia e avisa', async () => {
    await renderizar();
    cadastrar('SN-9');
    justificar('abc ');
    expect(botao().disabled).toBe(true);
    expect(formulario().textContent).toContain('pelo menos 5 caracteres');
    await clicarRegularizar();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('erro do servidor aparece no formulário', async () => {
    api.post.mockRejectedValue({ response: { data: { error: 'serie SN-9 ja existe neste material' } } });
    await renderizar();
    cadastrar('SN-9');
    justificar('Inventario de setembro');
    await clicarRegularizar();
    expect(container.querySelector('#regularizar-erro').textContent).toBe('serie SN-9 ja existe neste material');
    expect(formulario()).not.toBeNull();
  });

  test('sem permissão de ajustar estoque: aviso aparece, formulário não', async () => {
    mockPode = (acao) => acao !== 'ajustar_estoque';
    await renderizar();
    expect(aviso().textContent).toContain('Séries presentes: 3 · Físico: 5');
    expect(formulario()).toBeNull();
  });
});
