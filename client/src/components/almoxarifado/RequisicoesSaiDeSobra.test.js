/**
 * Etapa 201 (T3; RN-201.06/07/08 com a Fase 2) — o "Sai de" mostra o que sobra depois do separado para outras requisições.
 *
 * - As duas janelas pedem `GET /almoxarifado/estoque/:id/saldos?requisicao_id=<a requisição aberta>` (RN-201.07).
 * - Rótulo (L1 da Fase 2, a sobra primeiro): com `separado_outras > 1e-9`, "XB-01 — lote L1 (sobra 2 de 6; 4 para outras)"; na
 *   SEPARAÇÃO a sobra também desconta o que esta requisição já guardou no par ("…, 1 desta)"); a entrega não desconta. Sem separado de
 *   outras, ou resposta sem o campo (servidor antigo): o rótulo de hoje, "XB-01 — lote L1 (6)".
 * - A régua da tela na separação usa a sobra (RN-201.08): separar a sobra inteira não pede motivo de divergência; a planejada que a
 *   sobra não cobre abre em automático.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSaiDeSobra --watchAll=false
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
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 5,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
};

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};

// Aprovada, nada separado: máximo separável do item = min(5 pendentes, 20 de saldo) = 5.
const APROVADA = {
  ...REQ_BASE, status: 'APROVADO',
  itens: [{ ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 }],
};
// Já separou 1 de XB-01/L1 (pendente, parte 1): faltam 4 a separar.
const PLANEJADA = {
  origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'XB-01', lote_separacao_codigo: 'L1',
  quantidade_origem_separacao: 1,
};
const EM_SEPARACAO = {
  ...REQ_BASE, status: 'EM_SEPARACAO',
  itens: [{ ...ITEM_BASE, ...PLANEJADA, quantidade_separada: 1, quantidade_entregue: 0, quantidade_atendida: 0 }],
};
// Entrega: 5 separados de XB-01/L1, 2 entregues, 3 entregáveis.
const PARCIAL = {
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{
    ...ITEM_BASE, ...PLANEJADA, quantidade_origem_separacao: 3, quantidade_separada: 5, quantidade_entregue: 2,
    quantidade_atendida: 2, quantidade_entregavel: 3,
  }],
};

// A resposta nova (T1): A-01 sem separado; XB-01/L1 6 com 4 de outras; C-03/L9 3 com 1 de outra.
const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10,
    separado_outras: 0, sobra: 10 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'XB-01', lote_id: 7, lote: 'L1', quantidade: 6,
    separado_outras: 4, sobra: 2 },
  { id: 5, material_id: 10, localizacao_id: 3, localizacao_codigo: 'C-03', lote_id: 9, lote: 'L9', quantidade: 3,
    separado_outras: 1, sobra: 2 },
];
// O servidor antigo: as mesmas linhas sem os campos.
const SALDOS_ANTIGOS = SALDOS.map(({ separado_outras: _o, sobra: _s, ...resto }) => resto);

let container;
let root;
let requisicao;
let saldos;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = SALDOS;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, separacoes, ...linha } = requisicao;
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
const digitar = (el, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};
const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const inputQtd = () => container.querySelector('.almox-modal input.almox-count-input');
const campoMotivo = () => container.querySelector('#separacao-motivo-1');
const selectSeparacao = () => container.querySelector('#separacao-origem-1');
const selectEntrega = () => container.querySelector('#entrega-origem-1');
const textos = (select) => [...select.options].map((o) => o.textContent);
const itemEnviado = () => {
  const chamada = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
  expect(chamada).toBeTruthy();
  return chamada[1].itens_separados[0];
};

describe('Etapa 201: o "Sai de" da separação mostra o que sobra', () => {
  beforeEach(() => { requisicao = APROVADA; });

  test('[RN-201.07] a janela de separação pede os saldos com requisicao_id', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/estoque/10/saldos?requisicao_id=55');
  });

  test('[RN-201.06] rótulo com a sobra primeiro: 4 e 1 para outras; sem separado de outras, o de hoje', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)',
      'A-01 (10)',
      'XB-01 — lote L1 (sobra 2 de 6; 4 para outras)',
      'C-03 — lote L9 (sobra 2 de 3; 1 para outras)',
    ]);
  });

  test('[RN-201.06] resposta sem os campos (servidor antigo): o rótulo de hoje, letra por letra', async () => {
    saldos = SALDOS_ANTIGOS;
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)', 'A-01 (10)', 'XB-01 — lote L1 (6)', 'C-03 — lote L9 (3)',
    ]);
  });

  test('[RN-201.08] separar a sobra inteira (2 de XB-01) não pede motivo; abaixo dela pede; o payload não leva motivo', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSeparacao(), '2:7');
    digitar(inputQtd(), '1');
    expect(campoMotivo()).toBeTruthy();
    digitar(inputQtd(), '2');
    expect(campoMotivo()).toBeNull();
    await clicar('Confirmar Separação');
    expect(itemEnviado()).toEqual({ item_id: 1, quantidade_separada: 2, localizacao_origem_id: 2, lote_id: 7 });
  });

  test('[RN-201.08 compat] servidor sem `sobra`: a régua de hoje (separar 2 de 6 pede motivo)', async () => {
    saldos = SALDOS_ANTIGOS;
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSeparacao(), '2:7');
    digitar(inputQtd(), '2');
    expect(campoMotivo()).toBeTruthy();
  });
});

describe('Etapa 201 (Fase 2): a separação desconta o que esta requisição já guardou no par', () => {
  beforeEach(() => { requisicao = EM_SEPARACAO; });

  test('[RN-201.06] já separou 1 de XB-01/L1: "sobra 1 de 6; 4 para outras, 1 desta"', async () => {
    await renderizar();
    await clicar('Ajustar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)',
      'A-01 (10)',
      'XB-01 — lote L1 (sobra 1 de 6; 4 para outras, 1 desta)',
      'C-03 — lote L9 (sobra 2 de 3; 1 para outras)',
    ]);
  });

  // Fase 5 (B1349): só a própria no par — o rótulo mostra a sobra (a recusa física do servidor é físico − jaPedido: "O saldo em
  // XB-01 (5)…"), não o físico; com um fio de outras (0,000001) a frase não pula de número.
  test('[RN-201.06 Fase 5] só a própria no par (outras 0): "sobra 5 de 6; 1 desta"; sem outras e sem própria, o de hoje', async () => {
    saldos = SALDOS.map((s) => (s.localizacao_id === 2 ? { ...s, separado_outras: 0, sobra: 6 } : s));
    await renderizar();
    await clicar('Ajustar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)',
      'A-01 (10)',
      'XB-01 — lote L1 (sobra 5 de 6; 1 desta)',
      'C-03 — lote L9 (sobra 2 de 3; 1 para outras)',
    ]);
  });

  test('[RN-201.06 Fase 5] um fio de outras (0,000001) não pula: "sobra 4.999999 de 6; 0.000001 para outras, 1 desta"', async () => {
    saldos = SALDOS.map((s) => (s.localizacao_id === 2 ? { ...s, separado_outras: 0.000001, sobra: 5.999999 } : s));
    await renderizar();
    await clicar('Ajustar Separação');
    expect(textos(selectSeparacao())[2]).toBe('XB-01 — lote L1 (sobra 4.999999 de 6; 0.000001 para outras, 1 desta)');
  });

  test('[RN-201.08] a planejada que a sobra não cobre (1 contra 4) abre em automático', async () => {
    await renderizar();
    await clicar('Ajustar Separação');
    expect(inputQtd().value).toBe('4');
    expect(selectSeparacao().value).toBe('');
  });

  test('[RN-201.08 compat] servidor sem `sobra`: a planejada cobre (6 - 1) e abre nela, como hoje', async () => {
    saldos = SALDOS_ANTIGOS;
    await renderizar();
    await clicar('Ajustar Separação');
    expect(selectSeparacao().value).toBe('2:7');
  });
});

describe('Etapa 201: o "Sai de" da entrega mostra o que sobra (sem descontar a própria)', () => {
  beforeEach(() => { requisicao = PARCIAL; });

  test('[RN-201.07/06] a entrega pede com requisicao_id e rotula sem "desta"', async () => {
    await renderizar();
    await clicar('Completar Entrega');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/estoque/10/saldos?requisicao_id=55');
    expect(textos(selectEntrega())).toEqual([
      'Qualquer endereço (automático)',
      'A-01 (10)',
      'XB-01 — lote L1 (sobra 2 de 6; 4 para outras)',
      'C-03 — lote L9 (sobra 2 de 3; 1 para outras)',
    ]);
  });
});

// Fase 5 (item 3): `propriaNoPar` além do caso trivial. XB-01 sem lote, 10 no físico, 4 de outras (sobra 6). Item 1: caixa 5 com parte 1
// no par (os outros 4 vieram de outro endereço); item 2, do mesmo material: caixa 2, parte 2 no par; item 3, de OUTRO material, também
// planejado em XB-01 sem lote. A C1 desconta 1 + 2 = 3 (o `pedidoSeparacao` soma a PARTE dos itens do material no par): sobra 6 − 3 = 3.
// Trocar a parte pela caixa (pendenteSeparado) daria 5 + 2 = 7 desta; tirar o filtro de material, 1 + 2 + 1 = 4.
const NO_PAR = { origem_separacao_id: 2, lote_separacao_id: null, origem_separacao_codigo: 'XB-01', lote_separacao_codigo: null };
const DOIS_ITENS_NO_PAR = {
  ...REQ_BASE, status: 'EM_SEPARACAO',
  itens: [
    { ...ITEM_BASE, ...NO_PAR, quantidade_solicitada: 8, quantidade_separada: 5, quantidade_origem_separacao: 1,
      quantidade_entregue: 0, quantidade_atendida: 0 },
    { ...ITEM_BASE, ...NO_PAR, id: 2, quantidade_solicitada: 4, quantidade_separada: 2, quantidade_origem_separacao: 2,
      quantidade_entregue: 0, quantidade_atendida: 0 },
    { ...ITEM_BASE, ...NO_PAR, id: 3, material_id: 11, material_codigo: 'MAT-2', material_nome: 'Parafuso', quantidade_solicitada: 3,
      quantidade_separada: 1, quantidade_origem_separacao: 1, quantidade_entregue: 0, quantidade_atendida: 0 },
  ],
};
const SALDOS_SEM_LOTE = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10,
    separado_outras: 0, sobra: 10 },
  { id: 6, material_id: 10, localizacao_id: 2, localizacao_codigo: 'XB-01', lote_id: null, lote: null, quantidade: 10,
    separado_outras: 4, sobra: 6 },
];

describe('Etapa 201 (Fase 5): a própria no par é a PARTE dos itens DO MATERIAL', () => {
  beforeEach(() => { requisicao = DOIS_ITENS_NO_PAR; saldos = SALDOS_SEM_LOTE; });

  test('[RN-201.06 Fase 5] parte 1 de caixa 5 + irmão com 2 no par (+ outro material no par): "sobra 3 de 10; 4 para outras, 3 desta"', async () => {
    await renderizar();
    await clicar('Ajustar Separação');
    const esperado = 'XB-01 (sobra 3 de 10; 4 para outras, 3 desta)';
    expect(textos(selectSeparacao())).toEqual(['Qualquer endereço (automático)', 'A-01 (10)', esperado]);
    expect(textos(container.querySelector('#separacao-origem-2'))[2]).toBe(esperado);
  });
});
