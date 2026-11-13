/**
 * Etapa 218 (T5; RN-218.12, B1449, Fase 2 item 8) — o "Sai de" mostra quanto pode sair do LOTE com peça presa.
 *
 * - O servidor manda, por linha de lote com peça presa (quarentena, reprovação, terceiro, inspeção), `lote_livre`, `lote_bloqueado`,
 *   `lote_inspecao`; nas outras linhas, `null`. O rótulo acrescenta "— do lote podem sair 3 (1 bloqueada)"; sem o campo, nada muda.
 * - Na separação, o máximo da tela fica limitado por `lote_livre` menos o que esta requisição já guardou no lote: separar o que pode
 *   sair do lote não pede motivo de divergência.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesLoteLivre --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList, { valorSugeridoNaSeparacao } from './RequisicoesList';
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
const APROVADA = {
  ...REQ_BASE, status: 'APROVADO',
  itens: [{ ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 }],
};
// Já separou 1 de XB-01/L1 (parte 1): faltam 4.
const EM_SEPARACAO = {
  ...REQ_BASE, status: 'EM_SEPARACAO',
  itens: [{ ...ITEM_BASE, origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'XB-01', lote_separacao_codigo: 'L1',
    quantidade_origem_separacao: 1, quantidade_separada: 1, quantidade_entregue: 0, quantidade_atendida: 0 }],
};
const PARCIAL = {
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{ ...ITEM_BASE, quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2, quantidade_entregavel: 3 }],
};
// A-01 sem lote (null); XB-01/L1 4 com 1 bloqueada (podem 3); C-03/L9 3 com 1 bloqueada e 2 em inspeção (podem 0).
const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10,
    separado_outras: 0, sobra: 10, lote_livre: null, lote_bloqueado: null, lote_inspecao: null },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'XB-01', lote_id: 7, lote: 'L1', quantidade: 4,
    separado_outras: 0, sobra: 4, lote_livre: 3, lote_bloqueado: 1, lote_inspecao: 0 },
  { id: 5, material_id: 10, localizacao_id: 3, localizacao_codigo: 'C-03', lote_id: 9, lote: 'L9', quantidade: 3,
    separado_outras: 0, sobra: 3, lote_livre: 0, lote_bloqueado: 1, lote_inspecao: 2 },
];
const SALDOS_ANTIGOS = SALDOS.map(({ lote_livre: _a, lote_bloqueado: _b, lote_inspecao: _c, ...resto }) => resto);

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
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => { await act(async () => { botaoPorTexto(texto).click(); }); };
const digitar = (el, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setter.call(el, valor); el.dispatchEvent(new Event('input', { bubbles: true })); });
};
const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => { setter.call(select, valor); select.dispatchEvent(new Event('change', { bubbles: true })); });
};
const inputQtd = () => container.querySelector('.almox-modal input.almox-count-input');
const campoMotivo = () => container.querySelector('#separacao-motivo-1');
const selectSeparacao = () => container.querySelector('#separacao-origem-1');
const selectEntrega = () => container.querySelector('#entrega-origem-1');
const textos = (select) => [...select.options].map((o) => o.textContent);

describe('Etapa 218: o "Sai de" diz quanto pode sair do lote com peça presa', () => {
  test('[RN-218.12] separação: rótulo com "— do lote podem sair 3 (1 bloqueada)"; sem peça presa, o de antes', async () => {
    requisicao = APROVADA;
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)',
      'A-01 (10)',
      'XB-01 — lote L1 (4) — do lote podem sair 3 (1 bloqueada)',
      'C-03 — lote L9 (3) — do lote podem sair 0 (1 bloqueada, 2 em inspeção)',
    ]);
  });

  test('[RN-218.12] servidor sem os campos: o rótulo de antes, letra por letra', async () => {
    requisicao = APROVADA;
    saldos = SALDOS_ANTIGOS;
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)', 'A-01 (10)', 'XB-01 — lote L1 (4)', 'C-03 — lote L9 (3)',
    ]);
  });

  test('[B1449] o máximo da tela é o que pode sair do lote: separar 3 de XB-01/L1 não pede motivo; 2 pede', async () => {
    requisicao = APROVADA;
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSeparacao(), '2:7');
    digitar(inputQtd(), '3');
    expect(campoMotivo()).toBeNull();
    digitar(inputQtd(), '2');
    expect(campoMotivo()).toBeTruthy();
  });

  test('[Fase 2 item 8] a guarda desta requisição no lote sai do teto: já guardou 1 no L1 -> separar 2 não pede motivo; 1 pede', async () => {
    requisicao = EM_SEPARACAO;
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '2:7');
    digitar(inputQtd(), '2');
    expect(campoMotivo()).toBeNull();
    digitar(inputQtd(), '1');
    expect(campoMotivo()).toBeTruthy();
  });

  test('[RN-218.12] entrega: o mesmo sufixo no "Sai de"', async () => {
    requisicao = PARCIAL;
    await renderizar();
    await clicar('Completar Entrega');
    expect(textos(selectEntrega())).toEqual([
      'Qualquer endereço (automático)',
      'A-01 (10)',
      'XB-01 — lote L1 (4) — do lote podem sair 3 (1 bloqueada)',
      'C-03 — lote L9 (3) — do lote podem sair 0 (1 bloqueada, 2 em inspeção)',
    ]);
  });

  test('[Fase 5, B1449] a guarda de OUTRO item desta requisição no lote também sai do teto (itensDaReq): irmão guardou 1 no L1 -> teto 2', async () => {
    requisicao = {
      ...REQ_BASE, status: 'EM_SEPARACAO',
      itens: [
        { ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 },
        { ...ITEM_BASE, id: 2, quantidade_solicitada: 1, origem_separacao_id: 3, lote_separacao_id: 7, origem_separacao_codigo: 'C-03',
          lote_separacao_codigo: 'L1', quantidade_origem_separacao: 1, quantidade_separada: 1, quantidade_entregue: 0, quantidade_atendida: 0 },
      ],
    };
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '2:7');
    digitar(inputQtd(), '2');
    expect(campoMotivo()).toBeNull();
    digitar(inputQtd(), '1');
    expect(campoMotivo()).toBeTruthy();
  });

  test('[Fase 5, B1449] a sugestão da fila não pré-seleciona o lote que não cobre (valorSugeridoNaSeparacao)', () => {
    const item = { ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0 };
    const sugestao = { pegar_em: { localizacao_id: 2, lote_id: 7, cobre: true }, pegar_em_aviso: null };
    expect(valorSugeridoNaSeparacao(item, sugestao, SALDOS, 4, 0, 0, [item])).toBe('');
    expect(valorSugeridoNaSeparacao(item, sugestao, SALDOS, 3, 0, 0, [item])).toBe('2:7');
  });

  test('[Fase 5, B1449] rótulo: "pode" no singular, "bloqueadas" no plural e o sufixo também no formato com sobra', async () => {
    requisicao = APROVADA;
    saldos = [{ id: 6, material_id: 10, localizacao_id: 4, localizacao_codigo: 'D-04', lote_id: 8, lote: 'L8', quantidade: 4,
      separado_outras: 1, sobra: 3, lote_livre: 1, lote_bloqueado: 2, lote_inspecao: 0 }];
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)', 'D-04 — lote L8 (sobra 3 de 4; 1 para outras) — do lote pode sair 1 (2 bloqueadas)',
    ]);
  });

});
