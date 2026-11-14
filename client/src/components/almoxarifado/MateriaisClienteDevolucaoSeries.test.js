/**
 * Etapa 235 (D (233) 3, parte da devolução ao cliente; B1538) — a janela "Devolver ao cliente" de material com série lista as séries em
 * estoque, apaga a de lote impedido, diz de qual lote as marcadas saem, para antes de enviar com lotes diferentes ou com a quantidade de
 * séries errada, e manda `serie_ids`. Até a 235 ela pedia só quantidade e documento: material de cliente com série não era devolvível.
 * Material com controle de lote: a janela diz que pede o lote (sem seletor ainda) e não envia. Material sem série: o corpo de sempre.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa235-devolucao-cliente-lote-das-series.md (RN-235.07 a .09).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisClienteDevolucaoSeries --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MateriaisClienteAlmoxarifado from './MateriaisClienteAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../utils/posicaoClientePdf', () => ({
  __esModule: true, gerarPosicaoClientePDF: jest.fn(), montarPosicaoClientePDF: jest.fn(),
}));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));

const item = (material_id, codigo, extra) => ({
  material_id, codigo, nome: `Mat ${codigo}`, unidade: 'UN', recebido: 5, consumido: 0, devolvido: 0, saldo: 5, saldo_disponivel: 5,
  controle_serie: 0, controle_lote: 0, ...extra,
});
const POSICAO = {
  cliente: { id: 1, razao_social: 'Cliente Alfa LTDA' },
  itens: [
    item(31, 'COM-SERIE', { controle_serie: 1 }),
    item(32, 'SEM-SERIE'),
    item(33, 'COM-LOTE', { controle_serie: 1, controle_lote: 1 }),
  ],
  aplicacoes: [],
};
const livre = { lote_status: 'ATIVO', lote_esta_impedido: false, lote_vencido_sem_liberacao: false };
const SERIES = [
  { id: 1, numero: 'A1', lote_id: 10, lote_codigo: 'L1', ...livre },
  { id: 2, numero: 'B1', lote_id: 20, lote_codigo: 'L2', ...livre },
  { id: 3, numero: 'B2', lote_id: 20, lote_codigo: 'L2', ...livre },
  { id: 4, numero: 'C1', lote_id: 30, lote_codigo: 'L3', lote_status: 'BLOQUEADO', lote_esta_impedido: true, lote_vencido_sem_liberacao: false },
  { id: 5, numero: 'S1', lote_id: null, lote_codigo: null, lote_status: null, lote_esta_impedido: false, lote_vencido_sem_liberacao: false },
];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais-cliente/clientes') return Promise.resolve({ data: [{ cliente_id: 1, cliente_nome: 'Cliente Alfa LTDA', materiais: 3 }] });
    if (url.includes('/materiais-cliente/posicao?cliente_id=1')) return Promise.resolve({ data: POSICAO });
    if (url === '/almoxarifado/materiais/31/series?status=EM_ESTOQUE') return Promise.resolve({ data: SERIES });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function abrir(codigo) {
  await act(async () => { root.render(<MemoryRouter><MateriaisClienteAlmoxarifado /></MemoryRouter>); });
  await esperar();
  const select = container.querySelector('.almox-filters select.almox-select');
  const setSel = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setSel.call(select, '1'); select.dispatchEvent(new Event('change', { bubbles: true })); });
  await esperar();
  const linha = [...container.querySelectorAll('.almox-table tbody tr')].find((tr) => tr.textContent.includes(codigo));
  await clicar([...linha.querySelectorAll('button')].find((b) => b.textContent.includes('Devolver')));
}
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
}
const campo = (rotulo) => [...container.querySelectorAll('.almox-modal .almox-field')]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo)).querySelector('input');
function preencher(el, v) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const caixa = (id) => container.querySelector(`#dev-series input[data-serie-id="${id}"]`);
const marcar = (id) => clicar(caixa(id));
const confirmar = () => clicar([...container.querySelectorAll('button')].find((b) => b.textContent.includes('Confirmar devolução')));
const texto = (sel) => container.querySelector(sel)?.textContent || null;
async function preencherTudo(qtd) {
  preencher(campo('Quantidade'), String(qtd));
  preencher(campo('documento'), 'DEV-1');
  await esperar();
}

describe('Etapa 235 — a janela de devolução ao cliente lista as séries e diz o lote', () => {
  test('[RN-235.07] material com série: lista as séries em estoque e manda serie_ids', async () => {
    await abrir('COM-SERIE');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/31/series?status=EM_ESTOQUE');
    expect(container.querySelectorAll('#dev-series input[type="checkbox"]')).toHaveLength(5);
    expect(texto('#dev-series')).toContain('B1 · lote L2');
    await preencherTudo(1);
    await marcar(2);
    expect(texto('#dev-series-contador')).toBe('1/1 série(s) selecionada(s)');
    await confirmar();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 31, quantidade: 1, documento_devolucao: 'DEV-1', serie_ids: [2],
    });
  });

  test('[RN-235.07] material sem série: sem lista, o corpo de sempre (sem serie_ids)', async () => {
    await abrir('SEM-SERIE');
    expect(container.querySelector('#dev-series')).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/series'));
    await preencherTudo(2);
    await confirmar();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 32, quantidade: 2, documento_devolucao: 'DEV-1',
    });
  });

  test('[RN-235.08] a série de lote impedido vem apagada, com a situação, e a frase embaixo', async () => {
    await abrir('COM-SERIE');
    expect(caixa(4).disabled).toBe(true);
    expect(caixa(2).disabled).toBe(false);
    expect(texto('[data-serie-situacao="4"]')).toBe(' · lote L3 — Bloqueado: não sai');
    expect(texto('#dev-series-impedidas')).toBe('Séries de lote bloqueado, reprovado ou vencido vêm apagadas: só saem depois que o lote for liberado na tela Lotes e Séries.');
  });

  test('[RN-235.08] sem série impedida, sem a frase', async () => {
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url.includes('/materiais/31/series')
      ? Promise.resolve({ data: SERIES.filter((s) => !s.lote_esta_impedido) }) : original(url)));
    await abrir('COM-SERIE');
    expect(container.querySelectorAll('#dev-series input[type="checkbox"]')).toHaveLength(4);
    expect(container.querySelector('#dev-series-impedidas')).toBeNull();
  });

  test('[RN-235.09] um lote: diz de qual sai; nada marcado ou só sem lote: nenhuma frase', async () => {
    await abrir('COM-SERIE');
    expect(container.querySelector('#dev-series-lote-da-devolucao')).toBeNull();
    await marcar(2);
    await marcar(3);
    expect(texto('#dev-series-lote-da-devolucao')).toBe('As séries marcadas saem do lote L2.');
    await marcar(2);
    await marcar(3);
    await marcar(5);
    expect(container.querySelector('#dev-series-lote-da-devolucao')).toBeNull();
  });

  test('[RN-235.09] lotes diferentes: a frase e o confirmar para no toast, sem POST', async () => {
    await abrir('COM-SERIE');
    await preencherTudo(2);
    await marcar(2);
    await marcar(1);
    const frase = 'As séries marcadas são de lotes diferentes (L1, L2): faça uma devolução para cada lote.';
    expect(texto('#dev-series-lote-da-devolucao')).toBe(frase);
    await confirmar();
    expect(toast.error).toHaveBeenCalledWith(frase);
    expect(api.post).not.toHaveBeenCalled();
  });

  test('[RN-235.09] lote e sem lote: "(L2, sem lote)", sem POST', async () => {
    await abrir('COM-SERIE');
    await preencherTudo(2);
    await marcar(5);
    await marcar(2);
    await confirmar();
    expect(toast.error).toHaveBeenCalledWith('As séries marcadas são de lotes diferentes (L2, sem lote): faça uma devolução para cada lote.');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('[RN-235.09] séries marcadas diferente da quantidade: para no toast, sem POST', async () => {
    await abrir('COM-SERIE');
    await preencherTudo(2);
    await marcar(2);
    await confirmar();
    expect(toast.error).toHaveBeenCalledWith('Selecione exatamente a quantidade de séries informada');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('[RN-235.09] material com controle de lote: diz que pede o lote, sem lista e sem POST', async () => {
    await abrir('COM-LOTE');
    const frase = 'Este material tem controle por lote: a devolução pede o lote, e esta janela ainda não o oferece.';
    expect(texto('#dev-exige-lote')).toBe(frase);
    expect(container.querySelector('#dev-series')).toBeNull();
    await preencherTudo(1);
    await confirmar();
    expect(toast.error).toHaveBeenCalledWith(frase);
    expect(api.post).not.toHaveBeenCalled();
  });
});
