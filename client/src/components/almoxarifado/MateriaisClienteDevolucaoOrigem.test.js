/**
 * Etapa 240 (D (236) 1, B1541) — a janela "Devolver ao cliente" escolhe de onde sai ("Sai de"). Antes ela não tinha o campo: com a
 * localização padrão bloqueada, o material sem lote não era devolvível por aqui (o aviso da 237 apagava o Confirmar).
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa240-origem-devolucao-cliente.md (RN-240.01, .02, .04, .06, .07).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisClienteDevolucaoOrigem --watchAll=false
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
  material_id, codigo, nome: `Mat ${codigo}`, unidade: 'UN', recebido: 9, consumido: 0, devolvido: 0, saldo: 9, saldo_disponivel: 9,
  controle_serie: 0, controle_lote: 0, ...extra,
});
const POSICAO = {
  cliente: { id: 1, razao_social: 'Cliente Alfa LTDA' },
  itens: [
    item(61, 'SEMLOTE', { localizacao_padrao_codigo: 'R5L-3', localizacao_padrao_bloqueada: true }),
    item(62, 'COMLOTE', { controle_lote: 1 }),
    item(63, 'SERIE', { controle_serie: 1 }),
    item(64, 'FALHA'),
    item(65, 'SERIEREG', { controle_serie: 1, localizacao_padrao_codigo: 'R5L-3', localizacao_padrao_bloqueada: true }),
  ],
  aplicacoes: [],
};
const saldo = (localizacao_id, localizacao_codigo, quantidade, extra) => ({
  localizacao_id, localizacao_codigo, quantidade, lote_id: null, lote: null, localizacao_bloqueada: false, ...extra,
});
const SALDOS = {
  61: [saldo(1, 'R5L-3', 4, { localizacao_bloqueada: true }), saldo(2, 'A-01', 2), saldo(3, 'B-02', 3), saldo(null, null, 0),
    saldo(4, 'C-03', 0), saldo(5, 'D-04', 6, { lote_id: 9, lote: 'LX' })],
  62: [saldo(2, 'A-01', 3, { lote_id: 7, lote: 'L1' }), saldo(3, 'B-02', 4, { lote_id: 8, lote: 'L2' })],
  63: [saldo(2, 'A-01', 1), saldo(3, 'B-02', 2, { lote_id: 7, lote: 'L1' })],
  65: [saldo(1, 'R5L-3', 1, { localizacao_bloqueada: true }), saldo(2, 'A-01', 2)],
};

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais-cliente/clientes') return Promise.resolve({ data: [{ cliente_id: 1, cliente_nome: 'Cliente Alfa LTDA', materiais: 4 }] });
    if (url.includes('/materiais-cliente/posicao?cliente_id=1')) return Promise.resolve({ data: POSICAO });
    if (url === '/almoxarifado/materiais/62/lotes?com_saldo=1') {
      return Promise.resolve({ data: [{ id: 7, codigo: 'L1', saldo: 3, elegivel: true }, { id: 8, codigo: 'L2', saldo: 4, elegivel: true }] });
    }
    if (url === '/almoxarifado/materiais/63/series?status=EM_ESTOQUE') {
      return Promise.resolve({ data: [{ id: 91, numero: 'S1', lote_id: 7, lote_codigo: 'L1', lote_saldo_positivo: 1 }, { id: 92, numero: 'S2', lote_id: null, lote_codigo: null, lote_saldo_positivo: null }] });
    }
    if (url === '/almoxarifado/materiais/65/series?status=EM_ESTOQUE') {
      return Promise.resolve({ data: [{ id: 95, numero: 'S5', lote_id: 7, lote_codigo: 'L1', lote_saldo_positivo: 1 }] });
    }
    if (url === '/almoxarifado/estoque/64/saldos') return Promise.reject(new Error('falhou'));
    const m = url.match(/^\/almoxarifado\/estoque\/(\d+)\/saldos$/);
    if (m) return Promise.resolve({ data: SALDOS[m[1]] || [] });
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
const setSel = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
async function escolher(select, v) {
  await act(async () => { setSel.call(select, v); select.dispatchEvent(new Event('change', { bubbles: true })); });
  await esperar();
}
async function abrir(codigo) {
  await act(async () => { root.render(<MemoryRouter><MateriaisClienteAlmoxarifado /></MemoryRouter>); });
  await esperar();
  await escolher(container.querySelector('.almox-filters select.almox-select'), '1');
  await clicar(botaoDevolver(codigo));
}
const campo = (rotulo) => [...container.querySelectorAll('.almox-modal .almox-field')]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo)).querySelector('input');
function preencher(el, v) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const botaoConfirmar = () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Confirmar devolução'));
const origem = () => container.querySelector('#dev-origem');
const opcoes = () => [...origem().querySelectorAll('option')].map((o) => [o.textContent, o.disabled]);
const aviso = () => container.querySelector('#dev-loc-bloqueada');
const AVISO = 'A localização padrão deste material (R5L-3) está bloqueada: sem escolher de onde sai, a devolução será recusada. '
  + 'Escolha em "Sai de" um endereço livre ou desbloqueie a localização.';

describe('Etapa 240 — "Sai de" na devolução ao cliente', () => {
  test('[RN-240.01/.04/.06] sem lote: automático + endereços sem lote com saldo; o bloqueado vem apagado com a frase', async () => {
    await abrir('SEMLOTE');
    expect(opcoes()).toEqual([
      ['Qualquer endereço (automático)', false],
      ['R5L-3 (4) — bloqueada', true],
      ['A-01 (2)', false],
      ['B-02 (3)', false],
    ]);
    expect(origem().value).toBe('');
    expect(container.querySelector('#dev-origem-bloqueadas').textContent)
      .toBe('Endereços bloqueados vêm apagados: desbloqueie o endereço para devolver de lá.');
  });

  test('[RN-240.07] padrão bloqueada: o aviso novo e o Confirmar apagado; escolhido B-02 o aviso some e o POST leva a origem', async () => {
    await abrir('SEMLOTE');
    expect(aviso().textContent).toBe(AVISO);
    preencher(campo('Quantidade'), '3');
    preencher(campo('documento'), 'DEV-240');
    await esperar();
    expect(botaoConfirmar().disabled).toBe(true);
    await escolher(origem(), '3');
    expect(aviso()).toBeNull();
    expect(botaoConfirmar().disabled).toBe(false);
    await clicar(botaoConfirmar());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes',
      { material_id: 61, quantidade: 3, documento_devolucao: 'DEV-240', localizacao_origem_id: 3 });
  });

  test('[RN-240.02] endereço que não cobre: a frase e o Confirmar apagado; quantidade dentro do saldo libera', async () => {
    await abrir('SEMLOTE');
    await escolher(origem(), '2');
    preencher(campo('Quantidade'), '3');
    preencher(campo('documento'), 'DEV-241');
    await esperar();
    expect(container.querySelector('#dev-origem-nao-cobre').textContent).toBe('Em A-01 há só 2: devolva até 2 ou escolha outro endereço.');
    expect(botaoConfirmar().disabled).toBe(true);
    preencher(campo('Quantidade'), '2');
    await esperar();
    expect(container.querySelector('#dev-origem-nao-cobre')).toBeNull();
    expect(botaoConfirmar().disabled).toBe(false);
  });

  test('[RN-240.06] com lote: só os endereços do lote escolhido; trocar o lote volta ao automático; o POST leva lote e origem', async () => {
    await abrir('COMLOTE');
    expect(origem()).toBeNull();
    await escolher(container.querySelector('#dev-lote'), '7');
    expect(opcoes()).toEqual([['Qualquer endereço (automático)', false], ['A-01 — lote L1 (3)', false]]);
    await escolher(origem(), '2');
    await escolher(container.querySelector('#dev-lote'), '8');
    expect(origem().value).toBe('');
    expect(opcoes()).toEqual([['Qualquer endereço (automático)', false], ['B-02 — lote L2 (4)', false]]);
    await escolher(origem(), '3');
    preencher(campo('Quantidade'), '4');
    preencher(campo('documento'), 'DEV-242');
    await esperar();
    await clicar(botaoConfirmar());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes',
      { material_id: 62, quantidade: 4, documento_devolucao: 'DEV-242', lote_id: 8, localizacao_origem_id: 3 });
  });

  test('[RN-240.06] série sem controle de lote: sem marcadas, as linhas sem lote; marcada a de L1, as de L1', async () => {
    await abrir('SERIE');
    expect(opcoes()).toEqual([['Qualquer endereço (automático)', false], ['A-01 (1)', false]]);
    await clicar(container.querySelector('input[data-serie-id="91"]'));
    expect(opcoes()).toEqual([['Qualquer endereço (automático)', false], ['B-02 — lote L1 (2)', false]]);
  });

  test('[Fase 5, achado 1] série com lote L1 sem saldo no lote (regularizada): o servidor sai "sem lote" — a janela lista as sem lote e o aviso fica', async () => {
    await abrir('SERIEREG');
    await clicar(container.querySelector('input[data-serie-id="95"]'));
    expect(container.querySelector('#dev-series-lote-da-devolucao').textContent).toBe('As séries marcadas saem do lote L1.');
    expect(opcoes()).toEqual([['Qualquer endereço (automático)', false], ['R5L-3 (1) — bloqueada', true], ['A-01 (2)', false]]);
    expect(aviso().textContent).toBe(AVISO);
    preencher(campo('Quantidade'), '1');
    preencher(campo('documento'), 'DEV-244');
    await esperar();
    expect(botaoConfirmar().disabled).toBe(true);
    await escolher(origem(), '2');
    expect(aviso()).toBeNull();
    expect(botaoConfirmar().disabled).toBe(false);
  });

  test('[RN-240.01] saldos não carregaram: só o automático, a mensagem de erro, e o POST sem origem (o de antes)', async () => {
    await abrir('FALHA');
    expect(opcoes()).toEqual([['Qualquer endereço (automático)', false]]);
    expect(toast.error).toHaveBeenCalledWith('Não foi possível carregar os endereços do material');
    preencher(campo('Quantidade'), '1');
    preencher(campo('documento'), 'DEV-243');
    await esperar();
    await clicar(botaoConfirmar());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes',
      { material_id: 64, quantidade: 1, documento_devolucao: 'DEV-243' });
  });
});
