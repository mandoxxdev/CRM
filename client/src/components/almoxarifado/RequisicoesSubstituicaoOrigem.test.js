/**
 * Etapa 63 (RN-01/03) — a substituição da origem separada na entrega.
 *
 * - Modal de entrega, item com origem planejada (separado > entregue): quando o "Sai de" difere da
 *   planejada (outro endereço; mesmo endereço com outro lote quando a planejada tem lote) ou o item
 *   vai com `origem_automatica` (escolhido ou marcado pela tela), aparece "Motivo da troca
 *   (opcional)". O PUT /entregar leva `motivo_substituicao` (trim) SÓ preenchido e SÓ nesses casos.
 * - Acima do separado pendente, sem escolha: "Qualquer endereço" sem chave e a dica "O separado
 *   pendente sai de ...; o restante, automático." (o servidor divide a baixa).
 * - Detalhe: bloco "Substituições" com o que foi separado, de onde saiu, motivo, quem e quando.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSubstituicaoOrigem --watchAll=false
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

// 5 separados de B-02 lote L-7, 2 entregues, 3 entregáveis (= pendente separado).
const PLANEJADA = {
  origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'B-02', lote_separacao_codigo: 'L-7',
};
const parcial = (extra, req = {}) => ({
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA', ...req,
  itens: [{
    ...ITEM_BASE, quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2,
    quantidade_entregavel: 3, ...extra,
  }],
});

// B-02 tem dois lotes (L-7 é o planejado, L-8 não); A-01 sem lote.
const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 4 },
  { id: 5, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 8, lote: 'L-8', quantidade: 6 },
];

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos') return Promise.resolve({ data: SALDOS });
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
const campoMotivo = () => container.querySelector('#entrega-motivo-troca-1');
const dicaPendente = () => container.querySelector('#entrega-dica-pendente-1');

const itemEnviado = () => {
  const chamada = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/entregar');
  expect(chamada).toBeTruthy();
  return chamada[1].itens_atendidos[0];
};

describe('Etapa 63: "Motivo da troca" no modal de entrega', () => {
  test('na planejada não aparece; outro endereço aparece com rótulo e dica; voltar à planejada some', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('2:7');
    expect(campoMotivo()).toBeNull();
    expect(container.textContent).not.toContain('Motivo da troca');

    escolher(selectEntrega(), '1:');
    expect(campoMotivo()).toBeTruthy();
    expect(container.querySelector('label[for="entrega-motivo-troca-1"]').textContent).toBe('Motivo da troca (opcional)');
    expect(container.textContent).toContain('Saindo de onde não foi separado — conte o porquê.');
    expect(campoMotivo().maxLength).toBe(500);

    escolher(selectEntrega(), '2:7');
    expect(campoMotivo()).toBeNull();
  });

  test('mesmo endereço com outro lote (planejada tem lote) é troca', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '2:8');
    expect(campoMotivo()).toBeTruthy();
  });

  test('planejada sem lote: o mesmo endereço em qualquer lote não é troca', async () => {
    requisicao = parcial({ ...PLANEJADA, lote_separacao_id: null, lote_separacao_codigo: null });
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '2:8');
    expect(campoMotivo()).toBeNull();
    escolher(selectEntrega(), '1:');
    expect(campoMotivo()).toBeTruthy();
  });

  test('"Qualquer endereço" escolhido pelo usuário (origem_automatica) é troca', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '');
    expect(campoMotivo()).toBeTruthy();
  });

  test('planejada fora das opções: automático marcado pela tela é troca', async () => {
    requisicao = parcial({ ...PLANEJADA, origem_separacao_id: 9, lote_separacao_id: null, origem_separacao_codigo: 'Z-09', lote_separacao_codigo: null });
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(campoMotivo()).toBeTruthy();
  });

  test('item sem planejada: nenhum motivo, em nenhuma escolha', async () => {
    requisicao = parcial({});
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '1:');
    expect(campoMotivo()).toBeNull();
    escolher(selectEntrega(), '');
    expect(campoMotivo()).toBeNull();
  });
});

describe('Etapa 63: motivo_substituicao no PUT /entregar', () => {
  test('troca com motivo: vai com trim', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '1:');
    digitar(campoMotivo(), '  lote L-7 vencido  ');
    await clicar('✅ Confirmar Entrega');
    expect(itemEnviado()).toEqual({
      item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 1, motivo_substituicao: 'lote L-7 vencido',
    });
  });

  test('automático com motivo: vai junto de origem_automatica', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '');
    digitar(campoMotivo(), 'B-02 bloqueado');
    await clicar('✅ Confirmar Entrega');
    expect(itemEnviado()).toEqual({
      item_id: 1, quantidade_atendida: 3, origem_automatica: true, motivo_substituicao: 'B-02 bloqueado',
    });
  });

  test('troca com motivo só de espaços: não vai a chave', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '1:');
    digitar(campoMotivo(), '   ');
    await clicar('✅ Confirmar Entrega');
    expect(itemEnviado()).not.toHaveProperty('motivo_substituicao');
  });

  test('motivo digitado e depois volta à planejada: não vai a chave', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '1:');
    digitar(campoMotivo(), 'mudei de ideia');
    escolher(selectEntrega(), '2:7');
    await clicar('✅ Confirmar Entrega');
    expect(itemEnviado()).toEqual({ item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 2, lote_id: 7 });
  });
});

// 7 separados, 2 entregues → pendente separado 5; entregável 6 passa dele.
describe('Etapa 63: acima do separado pendente o servidor divide a baixa', () => {
  const acimaDoPendente = (entregavel) => parcial({
    ...PLANEJADA, quantidade_solicitada: 10, quantidade_separada: 7, quantidade_entregavel: entregavel,
  });

  test('entregável 6 > pendente 5: automático sem chave, dica e nenhum motivo', async () => {
    requisicao = acimaDoPendente(6);
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(dicaPendente()).toBeTruthy();
    expect(dicaPendente().textContent).toBe('O separado pendente sai de B-02 — lote L-7; o restante, automático. Se lá não houver mais o separado, a entrega é recusada — escolha de onde sai.');
    expect(campoMotivo()).toBeNull();
    await clicar('✅ Confirmar Entrega');
    const item = itemEnviado();
    expect(item).toEqual({ item_id: 1, quantidade_atendida: 6 });
  });

  test('entregável 5 = pendente 5: planejada pré-selecionada, sem dica', async () => {
    requisicao = acimaDoPendente(5);
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('2:7');
    expect(dicaPendente()).toBeNull();
  });

  test('acima do pendente, escolher outro endereço tira a dica e pede o motivo', async () => {
    requisicao = acimaDoPendente(6);
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '1:');
    expect(dicaPendente()).toBeNull();
    expect(campoMotivo()).toBeTruthy();
  });
});

describe('Etapa 63: "Substituições" no detalhe', () => {
  const SUBS = [
    { id: 1, item_id: 1, material_codigo: 'MAT-1', quantidade: 3, planejada_codigo: 'B-02', planejada_lote: 'L-7',
      saiu_codigo: 'A-01', saiu_lote: null, automatica: 0, motivo: 'lote vencido', usuario_nome: 'Ana', em: '2026-10-01T09:00:00' },
    { id: 2, item_id: 1, material_codigo: 'MAT-1', quantidade: 2, planejada_codigo: 'B-02', planejada_lote: null,
      saiu_codigo: null, saiu_lote: 'L-8', automatica: 1, motivo: null, usuario_nome: 'Bruno', em: '2026-10-01T10:00:00' },
  ];

  test('com motivo, sem motivo e automático; quem e quando', async () => {
    requisicao = parcial(PLANEJADA, { substituicoes: SUBS });
    await renderizar();
    const bloco = container.querySelector('[data-testid="substituicoes-origem"]');
    expect(bloco).toBeTruthy();
    expect(bloco.textContent).toContain('Substituições (2)');
    expect(container.querySelector('[data-testid="substituicao-texto-1"]').textContent)
      .toBe('MAT-1: 3 — separado de B-02 — lote L-7 · saiu de A-01 · lote vencido');
    expect(container.querySelector('[data-testid="substituicao-texto-2"]').textContent)
      .toBe('MAT-1: 2 — separado de B-02 · saiu de automático — lote L-8');
    expect(container.querySelector('[data-testid="substituicao-1"]').textContent).toContain('Ana');
    expect(container.querySelector('[data-testid="substituicao-2"]').textContent).toContain('Bruno');
    expect(container.querySelector('[data-testid="substituicao-1"]').textContent).toContain('Ana · 01/10/26');
  });

  test('chave ausente (detalhe antigo): o bloco não aparece', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    expect(container.querySelector('[data-testid="substituicoes-origem"]')).toBeNull();
  });

  test('lista vazia: o bloco não aparece', async () => {
    requisicao = parcial(PLANEJADA, { substituicoes: [] });
    await renderizar();
    expect(container.querySelector('[data-testid="substituicoes-origem"]')).toBeNull();
    expect(container.textContent).not.toContain('Substituições');
  });
});
