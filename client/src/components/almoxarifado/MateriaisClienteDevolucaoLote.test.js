/**
 * Etapa 236 (D (235) 1; B1539 a B1541) — a janela "Devolver ao cliente" de material com controle por lote lista os lotes com saldo, apaga
 * o que não sai (bloqueado, reprovado, vencido sem liberação), escolhe sozinha só quando há um único elegível, para sem lote e manda
 * `lote_id`. Com lote e série, as séries listadas são as do lote escolhido. Até a 236 a janela dizia que pedia o lote e não enviava.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa236-devolucao-cliente-seletor-de-lote.md (RN-236.01 a .07).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisClienteDevolucaoLote --watchAll=false
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
    item(41, 'SO-LOTE', { controle_lote: 1 }),
    item(42, 'LOTE-SERIE', { controle_lote: 1, controle_serie: 1 }),
    item(43, 'UM-LOTE', { controle_lote: 1 }),
    item(44, 'SEM-NADA'),
  ],
  aplicacoes: [],
};
const lote = (id, codigo, saldo, extra) => ({
  id, codigo, saldo, data_validade: null, status: 'ATIVO', vencido: false, vencimento_liberado: false, elegivel: true, ...extra,
});
const LOTES_41 = [
  lote(10, 'L1', 3, { data_validade: '2027-01-31' }),
  lote(11, 'L2', 2.5),
  lote(12, 'LV', 1, { data_validade: '2026-10-01', vencido: true, vencimento_liberado: true }),
  lote(13, 'LB', 4, { status: 'BLOQUEADO', elegivel: false }),
  lote(14, 'LX', 1, { data_validade: '2026-09-15', vencido: true, elegivel: false }),
  lote(15, 'LR', 1, { status: 'REPROVADO', vencido: true, elegivel: false }),
];
const LOTES_42 = [lote(20, 'M1', 2), lote(21, 'M2', 1)];
const LOTES_43 = [lote(30, 'U1', 2), lote(31, 'UB', 1, { status: 'BLOQUEADO', elegivel: false })];
const livre = { lote_status: 'ATIVO', lote_esta_impedido: false, lote_vencido_sem_liberacao: false };
const SERIES_42 = [
  { id: 1, numero: 'A1', lote_id: 20, lote_codigo: 'M1', ...livre },
  { id: 2, numero: 'A2', lote_id: 20, lote_codigo: 'M1', ...livre },
  { id: 3, numero: 'B1', lote_id: 21, lote_codigo: 'M2', ...livre },
];
const rotas = {
  '/almoxarifado/materiais/41/lotes?com_saldo=1': LOTES_41,
  '/almoxarifado/materiais/42/lotes?com_saldo=1': LOTES_42,
  '/almoxarifado/materiais/43/lotes?com_saldo=1': LOTES_43,
  '/almoxarifado/materiais/42/series?status=EM_ESTOQUE': SERIES_42,
};

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais-cliente/clientes') return Promise.resolve({ data: [{ cliente_id: 1, cliente_nome: 'Cliente Alfa LTDA', materiais: 4 }] });
    if (url.includes('/materiais-cliente/posicao?cliente_id=1')) return Promise.resolve({ data: POSICAO });
    if (rotas[url]) return Promise.resolve({ data: rotas[url] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const linha = (c) => [...container.querySelectorAll('.almox-table tbody tr')].find((tr) => tr.textContent.includes(c));
const botaoDevolver = (c) => [...linha(c).querySelectorAll('button')].find((b) => b.textContent.includes('Devolver'));
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
}
async function abrir(codigo) {
  await act(async () => { root.render(<MemoryRouter><MateriaisClienteAlmoxarifado /></MemoryRouter>); });
  await esperar();
  const select = container.querySelector('.almox-filters select.almox-select');
  const setSel = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setSel.call(select, '1'); select.dispatchEvent(new Event('change', { bubbles: true })); });
  await esperar();
  await clicar(botaoDevolver(codigo));
}
const cancelar = () => clicar([...container.querySelectorAll('.almox-modal button')].find((b) => b.textContent.trim() === 'Cancelar'));
const campo = (rotulo) => [...container.querySelectorAll('.almox-modal .almox-field')]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo)).querySelector('input');
function preencher(el, v) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
async function escolherLote(valor) {
  const sel = container.querySelector('#dev-lote');
  const setSel = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setSel.call(sel, String(valor)); sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await esperar();
}
const opcoes = () => [...container.querySelectorAll('#dev-lote option')];
const opcao = (v) => container.querySelector(`#dev-lote option[value="${v}"]`);
const caixa = (id) => container.querySelector(`#dev-series input[data-serie-id="${id}"]`);
const confirmar = () => clicar([...container.querySelectorAll('button')].find((b) => b.textContent.includes('Confirmar devolução')));
const texto = (sel) => container.querySelector(sel)?.textContent || null;
async function preencherTudo(qtd) {
  preencher(campo('Quantidade'), String(qtd));
  preencher(campo('documento'), 'DEV-9');
  await esperar();
}

describe('Etapa 236 — a janela de devolução ao cliente pede o lote', () => {
  test('[RN-236.01] material com controle de lote: busca os lotes com saldo e mostra o rótulo de cada um', async () => {
    await abrir('SO-LOTE');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/41/lotes?com_saldo=1');
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/materiais/41/series'));
    expect(opcoes().map((o) => o.textContent)).toEqual([
      'Escolha o lote',
      'L1 — saldo 3 — vence 31/01/2027',
      'L2 — saldo 2,5',
      'LV — saldo 1 — vence 01/10/2026 (vencido, liberado)',
      'LB — saldo 4 — Bloqueado: não sai',
      'LX — saldo 1 — vence 15/09/2026 — Vencido: não sai',
      'LR — saldo 1 — Reprovado · Vencido: não sai',
    ]);
    expect(container.querySelector('#dev-exige-lote')).toBeNull();
  });

  test('[RN-236.01] material sem controle de lote: sem campo Lote e sem busca de lotes; o corpo de sempre', async () => {
    await abrir('SEM-NADA');
    expect(container.querySelector('#dev-lote')).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith(expect.stringContaining('/lotes'));
    await preencherTudo(2);
    await confirmar();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 44, quantidade: 2, documento_devolucao: 'DEV-9',
    });
  });

  test('[RN-236.02] o lote que não sai vem desabilitado, e a frase embaixo', async () => {
    await abrir('SO-LOTE');
    expect(['10', '11', '12'].map((v) => opcao(v).disabled)).toEqual([false, false, false]);
    expect(['13', '14', '15'].map((v) => opcao(v).disabled)).toEqual([true, true, true]);
    expect(texto('#dev-lotes-impedidos')).toBe(
      'Lotes bloqueados, reprovados ou vencidos vêm apagados: só saem depois que o lote for liberado na tela Lotes e Séries.');
  });

  test('[RN-236.02] sem lote impedido, sem a frase', async () => {
    await abrir('LOTE-SERIE');
    expect(container.querySelector('#dev-lotes-impedidos')).toBeNull();
  });

  test('[RN-236.03] dois ou mais elegíveis: nada escolhido; um só elegível: ele vem escolhido', async () => {
    await abrir('SO-LOTE');
    expect(container.querySelector('#dev-lote').value).toBe('');
    await cancelar();
    await clicar(botaoDevolver('UM-LOTE'));
    expect(container.querySelector('#dev-lote').value).toBe('30');
    await preencherTudo(1);
    await confirmar();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 43, quantidade: 1, documento_devolucao: 'DEV-9', lote_id: 30,
    });
  });

  test('[RN-236.04] lista vazia: a frase; falha da busca: o toast', async () => {
    rotas['/almoxarifado/materiais/41/lotes?com_saldo=1'] = [];
    try {
      await abrir('SO-LOTE');
      expect(texto('#dev-lote-vazio')).toBe('Nenhum lote com saldo para este material.');
      expect(opcoes()).toHaveLength(1);
    } finally { rotas['/almoxarifado/materiais/41/lotes?com_saldo=1'] = LOTES_41; }
    await cancelar();
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url.includes('/materiais/43/lotes') ? Promise.reject(new Error('x')) : original(url)));
    await clicar(botaoDevolver('UM-LOTE'));
    expect(toast.error).toHaveBeenCalledWith('Não foi possível carregar os lotes do material');
    expect(opcoes()).toHaveLength(1);
  });

  test('[RN-236.04] a lista de lotes de um material que chega atrasada não pinta a janela de outro', async () => {
    let soltar;
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais/41/lotes?com_saldo=1') return new Promise((r) => { soltar = () => r({ data: LOTES_41 }); });
      return original(url);
    });
    await abrir('SO-LOTE');
    await cancelar();
    await clicar(botaoDevolver('UM-LOTE'));
    await act(async () => { soltar(); });
    await esperar();
    expect(opcoes().map((o) => o.value)).toEqual(['', '30', '31']);
    expect(container.querySelector('#dev-lote').value).toBe('30');
  });

  test('[RN-236.05] sem lote escolhido: para no toast, sem POST; com o lote: manda lote_id numérico', async () => {
    await abrir('SO-LOTE');
    await preencherTudo(2);
    await confirmar();
    expect(toast.error).toHaveBeenCalledWith('Escolha o lote da devolução');
    expect(api.post).not.toHaveBeenCalled();
    await escolherLote(11);
    await confirmar();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 41, quantidade: 2, documento_devolucao: 'DEV-9', lote_id: 11,
    });
  });

  test('[RN-236.05] trocar de material zera o lote escolhido (Fase 2): o outro material não leva o lote do anterior', async () => {
    await abrir('SO-LOTE');
    await escolherLote(10);
    await cancelar();
    await clicar(botaoDevolver('LOTE-SERIE'));
    expect(container.querySelector('#dev-lote').value).toBe('');
    await preencherTudo(1);
    await confirmar();
    expect(toast.error).toHaveBeenCalledWith('Escolha o lote da devolução');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('[RN-236.06] lote e série: sem lote, a frase no lugar da lista; com lote, só as séries dele; manda lote_id e serie_ids', async () => {
    await abrir('LOTE-SERIE');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/42/series?status=EM_ESTOQUE');
    expect(container.querySelector('#dev-series')).toBeNull();
    expect(texto('#dev-series-escolha-lote')).toBe('Escolha o lote para ver as séries dele.');
    await escolherLote(20);
    expect(container.querySelector('#dev-series-escolha-lote')).toBeNull();
    expect([...container.querySelectorAll('#dev-series input[type="checkbox"]')].map((c) => c.dataset.serieId)).toEqual(['1', '2']);
    await preencherTudo(2);
    await clicar(caixa(1));
    await clicar(caixa(2));
    expect(texto('#dev-series-contador')).toBe('2/2 série(s) selecionada(s)');
    await confirmar();
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 42, quantidade: 2, documento_devolucao: 'DEV-9', lote_id: 20, serie_ids: [1, 2],
    });
  });

  test('[RN-236.06] trocar de lote desmarca as séries; a parada "marcadas ≠ quantidade" continua', async () => {
    await abrir('LOTE-SERIE');
    await escolherLote(20);
    await preencherTudo(1);
    await clicar(caixa(1));
    expect(texto('#dev-series-contador')).toBe('1/1 série(s) selecionada(s)');
    await escolherLote(21);
    expect([...container.querySelectorAll('#dev-series input[type="checkbox"]')].map((c) => c.dataset.serieId)).toEqual(['3']);
    expect(texto('#dev-series-contador')).toBe('0/1 série(s) selecionada(s)');
    await confirmar();
    expect(toast.error).toHaveBeenCalledWith('Selecione exatamente a quantidade de séries informada');
    expect(api.post).not.toHaveBeenCalled();
    await escolherLote(20);
    expect(caixa(1).checked).toBe(false);
  });
});
