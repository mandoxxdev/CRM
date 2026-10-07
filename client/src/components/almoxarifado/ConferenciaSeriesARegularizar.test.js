/**
 * Etapa 62 (T2, RN-02) — aviso de séries a regularizar na conclusão do inventário.
 *
 * PUT /almoxarifado/conferencias/:id/concluir responde `series_a_regularizar: [{ material_id,
 * codigo, fisico, presentes }]`. Não vazio: a lista de conferências mostra um aviso PERSISTENTE
 * (não só toast) com um link por material para Lotes e Séries (aba SERIES). Vazio ou ausente:
 * nenhum aviso.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/ConferenciaSeriesARegularizar --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConferenciaEstoque from './ConferenciaEstoque';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const CONFERENCIAS = [
  { id: 1, numero: 'CONF-0001', status: 'ABERTO', responsavel_nome: 'Ana Souza', data_inicio: '2026-09-30T10:00:00Z', data_fim: null },
];
const CONFERENCIA_ABERTA = {
  id: 1, numero: 'CONF-0001', status: 'ABERTO', modo_cego: false, tolerancia_percentual: 2,
  itens: [
    { id: 10, material_id: 100, material_codigo: 'MED-1', material_nome: 'Medidor', unidade: 'UN',
      localizacao: null, almoxarifado_codigo: null, quantidade_sistema: 3, quantidade_contada: 5,
      divergencia: 2, recontagem_necessaria: false, recontado: 0 },
  ],
};

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/conferencias') return Promise.resolve({ data: CONFERENCIAS });
    if (url === '/almoxarifado/conferencias/1') return Promise.resolve({ data: CONFERENCIA_ABERTA });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t) || (b.title && b.title.includes(t)));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
}
function preencher(el, valor) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const campo = (rotulo) => [...container.querySelectorAll('.almox-modal .almox-field')]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo))
  ?.querySelector('input, textarea, select');
const aviso = () => container.querySelector('[data-testid="aviso-series-a-regularizar"]');

async function concluir() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/almoxarifado/conferencias']}><ConferenciaEstoque /></MemoryRouter>);
  });
  await esperar();
  await clicar(botao('Abrir'));
  await clicar(botao('Concluir Conferência'));
  preencher(campo('Justificativa do ajuste'), 'Ajuste conforme contagem física');
  await clicar(botao('Confirmar', container.querySelector('.almox-modal-footer')));
}

describe('conclusão do inventário: séries a regularizar (RN-02)', () => {
  test('com lista: aviso persistente com físico, presentes e link para Lotes e Séries', async () => {
    api.put.mockResolvedValue({ data: {
      success: true, ajustesAplicados: 2, impactoFinanceiro: 10,
      series_a_regularizar: [
        { material_id: 100, codigo: 'MED-1', fisico: 5, presentes: 3 },
        { material_id: 101, codigo: 'MED-2', fisico: 0, presentes: 2 },
      ],
    } });
    await concluir();
    const el = aviso();
    expect(el).toBeTruthy();
    expect(el.textContent).toContain('Estes materiais com série ficaram com séries presentes diferentes do físico — regularize em Lotes e Séries');
    const itens = [...el.querySelectorAll('li')].map((li) => li.textContent.replace(/\s+/g, ' ').trim());
    expect(itens).toEqual(['MED-1 (físico 5, presentes 3)', 'MED-2 (físico 0, presentes 2)']);
    const links = [...el.querySelectorAll('a')].map((a) => a.getAttribute('href'));
    expect(links).toEqual([
      '/almoxarifado/lotes?material_id=100&aba=SERIES',
      '/almoxarifado/lotes?material_id=101&aba=SERIES',
    ]);
    // abre em nova aba: o aviso vive so em state, e navegar nesta aba o perderia (e aos outros materiais)
    for (const a of el.querySelectorAll('a')) {
      expect(a.getAttribute('target')).toBe('_blank');
      expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    }
    // persistente: continua na tela depois de outros renders (ex.: Atualizar a lista)
    await clicar(botao('Atualizar'));
    expect(aviso()).toBeTruthy();
    // e some só quando o operador fecha
    await clicar(botao('Fechar aviso', aviso()));
    expect(aviso()).toBeNull();
  });

  test('lista vazia: nenhum aviso', async () => {
    api.put.mockResolvedValue({ data: { success: true, ajustesAplicados: 1, impactoFinanceiro: 5, series_a_regularizar: [] } });
    await concluir();
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/conferencias/1/concluir', expect.any(Object));
    expect(aviso()).toBeNull();
  });

  test('resposta sem o campo (servidor antigo): nenhum aviso', async () => {
    api.put.mockResolvedValue({ data: { success: true, ajustesAplicados: 1, impactoFinanceiro: 5 } });
    await concluir();
    expect(api.put).toHaveBeenCalled();
    expect(aviso()).toBeNull();
  });
});
