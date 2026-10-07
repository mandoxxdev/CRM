/**
 * Etapa 62 (T2, RN-03) — AJUSTE de material com série no formulário de nova movimentação.
 *
 * O ajuste é do TOTAL (sem endereço). A tela busca as séries presentes (EM_ESTOQUE + BLOQUEADA) e,
 * pela diferença `novo total − presentes`: > 0 pede os números novos (textarea, contador "{n} de
 * {d}"); < 0 pede as séries EM_ESTOQUE a baixar (caixas, contador); = 0 não pede nada. O Confirmar
 * fica desabilitado enquanto o contador não bate ou o total não é inteiro. O body leva `series`
 * (subir) ou `serie_ids` numéricos (descer), nunca os dois. Material sem série: nada muda.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MovimentacoesAjusteSerie --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
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

jest.mock('./ExtratoMaterialModal', () => ({ __esModule: true, default: () => null }));

const MATERIAIS = [
  { id: 10, codigo: 'MED-1', nome: 'Medidor serializado', unidade: 'UN', quantidade_atual: 3, controle_serie: 1 },
  { id: 20, codigo: 'CHP-1', nome: 'Chapa 3mm', unidade: 'PC', quantidade_atual: 50, controle_serie: 0 },
];
// Presentes = 2 EM_ESTOQUE + 1 BLOQUEADA = 3. Ids como string de propósito: o body leva número.
const EM_ESTOQUE = [
  { id: '101', numero: 'SN-101', status: 'EM_ESTOQUE', lote_id: null },
  { id: '102', numero: 'SN-102', status: 'EM_ESTOQUE', lote_id: null },
];
const BLOQUEADAS = [{ id: '103', numero: 'SN-103', status: 'BLOQUEADA', lote_id: null }];

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [{ id: 1, codigo: 'COR-A-03' }] });
    if (url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE') return Promise.resolve({ data: EM_ESTOQUE });
    if (url === '/almoxarifado/materiais/10/series?status=BLOQUEADA') return Promise.resolve({ data: BLOQUEADAS });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function esperar() {
  await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : elemento.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

const selects = () => [...container.querySelectorAll('.almox-modal select.almox-form-select')];
const campoQuantidade = () => container.querySelector('.almox-modal input[type="number"]');
const confirmar = () => container.querySelector('.almox-modal-footer button[type="submit"]');
const bloco = () => container.querySelector('[data-testid="ajuste-serie"]');
const contador = () => container.querySelector('[data-testid="ajuste-serie-contador"]')?.textContent.trim();
const textareaNovas = () => container.querySelector('#ajuste-serie-novas');
const caixas = () => [...container.querySelectorAll('#ajuste-serie-baixa input[type="checkbox"]')];

async function montarAjuste(materialId, quantidade) {
  await act(async () => {
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
  await esperar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
  preencher(selects()[0], String(materialId));
  preencher(selects()[1], 'AJUSTE');
  await esperar();
  await esperar();
  preencher(campoQuantidade(), quantidade);
  const motivo = [...container.querySelectorAll('.almox-modal input.almox-input')]
    .find((i) => i.previousElementSibling?.textContent?.startsWith('Motivo'));
  preencher(motivo, 'contagem');
}

async function enviar() {
  const form = container.querySelector('.almox-modal form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
}

const bodyPost = () => {
  const chamada = api.post.mock.calls.find(([url]) => url === '/almoxarifado/movimentacoes/v2');
  expect(chamada).toBeTruthy();
  return chamada[1];
};

describe('AJUSTE de material com série (RN-03)', () => {
  test('subindo (3 → 5): pede 2 números novos, trava até bater e manda `series` aparados', async () => {
    await montarAjuste(10, '5');
    expect(bloco().textContent).toContain('Material com série: o ajuste é do total, sem endereço.');
    expect(bloco().textContent).toContain('Séries presentes: 3');
    // sem destino no ajuste: nem o select nem o campo de leitura
    expect(container.querySelector('#mov-codigo-lido-destino')).toBeNull();
    expect(textareaNovas()).toBeTruthy();
    expect(caixas()).toHaveLength(0);
    expect(contador()).toBe('0 de 2');
    expect(confirmar().disabled).toBe(true);

    preencher(textareaNovas(), 'SN-201');
    expect(contador()).toBe('1 de 2');
    expect(confirmar().disabled).toBe(true);
    // o submit direto (Enter) também não passa com o contador errado
    await enviar();
    expect(api.post).not.toHaveBeenCalled();

    preencher(textareaNovas(), '  SN-201 \n\n SN-202  ');
    expect(contador()).toBe('2 de 2');
    expect(confirmar().disabled).toBe(false);
    await enviar();
    const body = bodyPost();
    expect(body).toEqual(expect.objectContaining({ material_id: 10, tipo: 'AJUSTE', quantidade: 5, series: ['SN-201', 'SN-202'] }));
    expect(body).not.toHaveProperty('serie_ids');
    expect(body).not.toHaveProperty('localizacao_destino_id');
  });

  test('descendo (3 → 1): lista só as EM_ESTOQUE para baixar, trava até bater e manda `serie_ids` numéricos', async () => {
    await montarAjuste(10, '1');
    expect(bloco().textContent).toContain('Séries presentes: 3');
    expect(textareaNovas()).toBeNull();
    const numeros = [...container.querySelectorAll('#ajuste-serie-baixa label')].map((l) => l.textContent);
    expect(numeros).toEqual(['SN-101', 'SN-102']); // a BLOQUEADA conta como presente, mas não se baixa
    expect(contador()).toBe('0 de 2');
    expect(confirmar().disabled).toBe(true);

    await act(async () => { caixas()[0].click(); });
    expect(contador()).toBe('1 de 2');
    expect(confirmar().disabled).toBe(true);
    await act(async () => { caixas()[1].click(); });
    expect(contador()).toBe('2 de 2');
    expect(confirmar().disabled).toBe(false);

    await enviar();
    const body = bodyPost();
    expect(body).toEqual(expect.objectContaining({ tipo: 'AJUSTE', quantidade: 1, serie_ids: [101, 102] }));
    expect(body).not.toHaveProperty('series');
  });

  test('zero de diferença (3 → 3): não pede séries e não manda nenhuma', async () => {
    await montarAjuste(10, '3');
    expect(bloco().textContent).toContain('Séries presentes: 3');
    expect(textareaNovas()).toBeNull();
    expect(caixas()).toHaveLength(0);
    expect(contador()).toBeUndefined();
    expect(confirmar().disabled).toBe(false);
    await enviar();
    const body = bodyPost();
    expect(body).toEqual(expect.objectContaining({ tipo: 'AJUSTE', quantidade: 3 }));
    expect(body).not.toHaveProperty('series');
    expect(body).not.toHaveProperty('serie_ids');
  });

  test('total fracionário trava o Confirmar e não pede séries', async () => {
    await montarAjuste(10, '4.5');
    expect(container.querySelector('[data-testid="ajuste-serie-inteiro"]').textContent)
      .toContain('o novo total precisa ser um número inteiro');
    expect(textareaNovas()).toBeNull();
    expect(caixas()).toHaveLength(0);
    expect(confirmar().disabled).toBe(true);
    await enviar();
    expect(api.post).not.toHaveBeenCalled();
  });

  // Review da Etapa 62: o schema só aceita AJUSTE 0 com endereço, e o ajuste de material com
  // série não aceita endereço — o servidor recusaria. A tela trava e diz como zerar.
  test('total 0: trava o Confirmar, não pede séries e mostra a dica de como zerar', async () => {
    await montarAjuste(10, '0');
    expect(container.querySelector('[data-testid="ajuste-serie-zero"]').textContent)
      .toContain('Para zerar, use Ajuste negativo com as séries.');
    expect(textareaNovas()).toBeNull();
    expect(caixas()).toHaveLength(0);
    expect(confirmar().disabled).toBe(true);
    await enviar();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('falha numa das buscas de séries: diz que não carregou, segue travado e "Tentar de novo" refaz', async () => {
    let falhar = true;
    const padrao = api.get.getMockImplementation();
    api.get.mockImplementation((url) => {
      if (falhar && url === '/almoxarifado/materiais/10/series?status=BLOQUEADA') return Promise.reject(new Error('rede'));
      return padrao(url);
    });
    await montarAjuste(10, '3');
    const erro = container.querySelector('[data-testid="ajuste-serie-erro"]');
    expect(erro).toBeTruthy();
    expect(erro.textContent).toContain('Não foi possível carregar as séries do material.');
    expect(bloco().textContent).not.toContain('Carregando');
    expect(confirmar().disabled).toBe(true);
    await enviar();
    expect(api.post).not.toHaveBeenCalled();

    falhar = false;
    const tentar = [...erro.querySelectorAll('button')].find((b) => b.textContent.includes('Tentar de novo'));
    await act(async () => { tentar.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    await esperar();
    expect(container.querySelector('[data-testid="ajuste-serie-erro"]')).toBeNull();
    expect(bloco().textContent).toContain('Séries presentes: 3');
    expect(confirmar().disabled).toBe(false);
  });

  test('servidor recusa o POST (séries mudaram): recarrega as séries presentes', async () => {
    const { toast } = require('react-toastify');
    await montarAjuste(10, '1');
    await act(async () => { caixas()[0].click(); });
    await act(async () => { caixas()[1].click(); });
    expect(confirmar().disabled).toBe(false);

    const buscasAntes = api.get.mock.calls.filter(([u]) => u === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE').length;
    // entre a carga e o POST alguém baixou a SN-102: o servidor recusa e a lista nova só tem a 101
    const padrao = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE'
      ? Promise.resolve({ data: [EM_ESTOQUE[0]] }) : padrao(url)));
    api.post.mockRejectedValue({ response: { status: 409, data: { error: 'as series do material mudaram durante o ajuste — recarregue e tente de novo' } } });
    await enviar();
    await esperar();
    expect(toast.error).toHaveBeenCalledWith('as series do material mudaram durante o ajuste — recarregue e tente de novo');
    const buscasDepois = api.get.mock.calls.filter(([u]) => u === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE').length;
    expect(buscasDepois).toBe(buscasAntes + 1);
    expect(bloco().textContent).toContain('Séries presentes: 2');
    expect(caixas()).toHaveLength(1);
    expect(contador()).toBe('0 de 1');
    expect(confirmar().disabled).toBe(true);
  });

  test('material sem série: ajuste inalterado (sem bloco, sem busca de séries, sem campo no body)', async () => {
    await montarAjuste(20, '7');
    expect(bloco()).toBeNull();
    expect(api.get.mock.calls.some(([url]) => String(url).includes('/series'))).toBe(false);
    expect(confirmar().disabled).toBe(false);
    await enviar();
    const body = bodyPost();
    expect(body).toEqual(expect.objectContaining({ material_id: 20, tipo: 'AJUSTE', quantidade: 7 }));
    expect(body).not.toHaveProperty('series');
    expect(body).not.toHaveProperty('serie_ids');
  });
});
