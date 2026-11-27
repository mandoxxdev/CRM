/**
 * Etapa 270 (T3; RN-270.04, RN-270.16, RN-270.17) — separar de duas prateleiras, a tela.
 *
 * O item do detalhe traz `partes_separacao` (as OUTRAS prateleiras de onde a caixa foi separada, já limitadas pelo servidor; a origem do
 * item é a 1ª). Detalhe: "separado de B-02 — lote L-7 (3 PC) · A-01 (2 PC)". Entrega sem "Sai de": a dica diz quanto sai de cada uma.
 * Separação: escolhido outro endereço, o aviso diz que a parte fica anotada e sai de lá na entrega. Sem outras partes: tudo como antes.
 *
 * Mock so na fronteira HTTP (services/api). Molde: RequisicoesOrigemEmDuasVezes.test.js.
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesDuasPrateleiras --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
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

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));

jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const ITEM_BASE = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 10,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
};

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};

// O caso real: 3 separados de B-02 lote L-7 e 3 no automatico — caixa 6, parte 3.
const PLANEJADA = {
  origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'B-02', lote_separacao_codigo: 'L-7',
};

// Entrega: 8 separados, 2 entregues -> caixa 6.
const paraEntregar = (extra) => ({
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{
    ...ITEM_BASE, ...PLANEJADA, quantidade_separada: 8, quantidade_entregue: 2, quantidade_atendida: 2,
    quantidade_entregavel: 6, quantidade_origem_separacao: 3, ...extra,
  }],
});

// Separacao: 5 separados (caixa 5), nada entregue, 5 ainda a separar.
const paraSeparar = (extra) => ({
  ...REQ_BASE, status: 'EM_SEPARACAO',
  itens: [{
    ...ITEM_BASE, ...PLANEJADA, quantidade_separada: 5, quantidade_entregue: 0, quantidade_atendida: 0,
    quantidade_origem_separacao: 3, ...extra,
  }],
});

const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 10 },
];

let container;
let root;
let requisicao;
let saldos;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = SALDOS;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') return Promise.resolve({ data: saldos });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { parcial: true } });
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
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}>
        <RequisicoesList />
      </MemoryRouter>
    );
  });
}

const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));

const clicar = async (texto) => {
  await act(async () => { botaoPorTexto(texto).click(); });
};

const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const digitar = (input, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const selectEntrega = () => container.querySelector('#entrega-origem-1');
const selectSeparacao = () => container.querySelector('#separacao-origem-1');
const avisoOrigem = () => container.querySelector('#separacao-aviso-origem-1');
const dicaPendente = () => container.querySelector('#entrega-dica-pendente-1');
const linhaSeparadoDe = () => container.querySelector('[data-testid="separado-de-1"]');

const enviadoEm = (rota, chave) => {
  const chamada = api.put.mock.calls.find((c) => c[0] === `/almoxarifado/requisicoes/55/${rota}`);
  expect(chamada).toBeTruthy();
  return chamada[1][chave][0];
};

const OUTRA_A = { localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote_codigo: null, quantidade: 2 };

describe('Etapa 270 (RN-270.04): o detalhe mostra todas as prateleiras', () => {
  test('origem B-02/L-7 3 + A-01 2: "separado de B-02 — lote L-7 (3 PC) · A-01 (2 PC)"', async () => {
    requisicao = paraEntregar({ partes_separacao: [OUTRA_A] });
    await renderizar();
    expect(linhaSeparadoDe().textContent).toBe('separado de B-02 — lote L-7 (3 PC) · A-01 (2 PC)');
  });

  test('o mesmo par da origem nas outras partes soma numa entrada só', async () => {
    requisicao = paraEntregar({ partes_separacao: [{ ...OUTRA_A, localizacao_codigo: 'B-02', lote_codigo: 'L-7', quantidade: 1 }] });
    await renderizar();
    expect(linhaSeparadoDe().textContent).toBe('separado de B-02 — lote L-7 (4 PC)');
  });

  test('origem já entregue (sem origem) com A-01 na caixa: "separado de A-01 (2 PC)"', async () => {
    requisicao = paraEntregar({ origem_separacao_id: null, origem_separacao_codigo: null, lote_separacao_id: null,
      lote_separacao_codigo: null, quantidade_origem_separacao: null, partes_separacao: [OUTRA_A] });
    await renderizar();
    expect(linhaSeparadoDe().textContent).toBe('separado de A-01 (2 PC)');
  });

  test('partes_separacao vazia: a frase de antes, byte a byte', async () => {
    requisicao = paraEntregar({ partes_separacao: [] });
    await renderizar();
    expect(linhaSeparadoDe().textContent).toBe('separado de B-02 — lote L-7 (3 PC)');
  });
});

describe('Etapa 270 (RN-270.16): a dica da entrega diz de onde sai cada parte', () => {
  test('caixa 6 = B-02/L-7 3 + A-01 2 + 1: entrega 6 sem chave, a dica nomeia as duas e o automático', async () => {
    requisicao = paraEntregar({ partes_separacao: [OUTRA_A] });
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(dicaPendente().textContent).toBe('3 PC sai de B-02 — lote L-7 (o que foi separado de lá); 2 PC de A-01, se ainda estiverem lá; '
      + 'o restante, automático. Se em B-02 — lote L-7 não houver mais essa quantidade, a entrega é recusada — escolha de onde sai.');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos')).toEqual({ item_id: 1, quantidade_atendida: 6 });
  });

  test('entrega 4: 3 da origem e 1 de A-01, sem "o restante"', async () => {
    requisicao = paraEntregar({ partes_separacao: [OUTRA_A], quantidade_entregavel: 4 });
    await renderizar();
    await clicar('Completar Entrega');
    expect(dicaPendente().textContent).toBe('3 PC sai de B-02 — lote L-7 (o que foi separado de lá); 1 PC de A-01, se ainda estiverem lá. '
      + 'Se em B-02 — lote L-7 não houver mais essa quantidade, a entrega é recusada — escolha de onde sai.');
  });

  test('sem origem e só A-01 na caixa: "Sai 2 PC de A-01, se ainda estiverem lá (o que foi separado de lá); o restante, automático."', async () => {
    requisicao = paraEntregar({ origem_separacao_id: null, origem_separacao_codigo: null, lote_separacao_id: null,
      lote_separacao_codigo: null, quantidade_origem_separacao: null, partes_separacao: [OUTRA_A] });
    await renderizar();
    await clicar('Completar Entrega');
    expect(dicaPendente().textContent).toBe('Sai 2 PC de A-01, se ainda estiverem lá (o que foi separado de lá); o restante, automático.');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos')).toEqual({ item_id: 1, quantidade_atendida: 6 });
  });

  test('escolhido um "Sai de": a dica das partes some (o servidor não as aplica)', async () => {
    requisicao = paraEntregar({ partes_separacao: [OUTRA_A] });
    await renderizar();
    await clicar('Completar Entrega');
    expect(dicaPendente()).toBeTruthy();
    escolher(selectEntrega(), '1:');
    expect(dicaPendente()).toBeNull();
  });
});

describe('Etapa 270 (RN-270.17): o aviso da separação com outro endereço', () => {
  test('escolhido A-01 sobre a origem B-02/L-7: a parte fica anotada e sai de lá', async () => {
    requisicao = paraSeparar();
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '1:');
    expect(avisoOrigem().textContent).toBe('Já separado de B-02 — lote L-7: 3 PC, que continuam saindo de lá. Esta parte fica anotada '
      + 'como separada de A-01 e sai de lá na entrega, se ainda estiver lá (senão, no automático).');
  });

  test('automático: a frase de antes', async () => {
    requisicao = paraSeparar();
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '');
    expect(avisoOrigem().textContent).toBe('Já separado de B-02 — lote L-7: 3 PC, que continuam saindo de lá. Esta parte sai no automático na entrega.');
  });
});
