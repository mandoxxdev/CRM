/**
 * Etapa 59 (RN-05) — "Sai de" na separação, a origem planejada na entrega e "separado de X" no detalhe.
 *
 * - Modal de separação: por item, as mesmas opções da entrega (GET /almoxarifado/estoque/:id/saldos,
 *   com endereço e quantidade > 0). O PUT /separacao leva localizacao_origem_id / lote_id SÓ quando
 *   escolhidos (lote só se a linha tem lote).
 * - Modal de entrega: item com origem planejada (origem_separacao_id + lote_separacao_id, com
 *   separado > entregue) vem pré-selecionado com ela. "Qualquer endereço (automático)" num item com
 *   planejada manda `origem_automatica: true`; planejada fora das opções → automático + a mesma chave.
 *   Quantidade a entregar acima de separado - entregue → automático sem chave (o servidor aplica a
 *   planejada até o pendente). Busca de saldos falhando → opção "Planejada da separação" selecionada.
 * - Detalhe: "separado de {codigo}[ — lote {lote}]" só enquanto separado > entregue.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSeparacaoOrigem --watchAll=false
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

// Para separar: aprovada, nada separado ainda.
const APROVADA = {
  ...REQ_BASE, status: 'APROVADO',
  itens: [{ ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 }],
};

// Para entregar: 5 separados de B-02 lote L-7, 2 entregues, 3 entregáveis.
const PLANEJADA = {
  origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'B-02', lote_separacao_codigo: 'L-7',
};
const parcial = (extra) => ({
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{
    ...ITEM_BASE, quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2,
    quantidade_entregavel: 3, ...extra,
  }],
});

const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 2, material_id: 10, localizacao_id: null, localizacao_codigo: null, lote_id: null, lote: null, quantidade: 5 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 4 },
];

let container;
let root;
let requisicao;
let saldosImpl;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldosImpl = () => Promise.resolve({ data: SALDOS });
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos') return saldosImpl();
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

const selectSeparacao = () => container.querySelector('#separacao-origem-1');
const selectEntrega = () => container.querySelector('#entrega-origem-1');

const enviadoEm = (rota, chave) => {
  expect(api.put).toHaveBeenCalledWith(`/almoxarifado/requisicoes/55/${rota}`, expect.any(Object));
  const chamada = api.put.mock.calls.find((c) => c[0] === `/almoxarifado/requisicoes/55/${rota}`);
  return chamada[1][chave][0];
};

describe('Etapa 59: "Sai de" no modal de separação', () => {
  beforeEach(() => { requisicao = APROVADA; });

  test('opções iguais às da entrega (com e sem lote)', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/estoque/10/saldos');
    expect([...selectSeparacao().options].map((o) => o.textContent)).toEqual([
      'Qualquer endereço (automático)',
      'A-01 (10)',
      'B-02 — lote L-7 (4)',
    ]);
  });

  test('escolher endereço com lote manda origem e lote numéricos', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSeparacao(), '2:7');
    await clicar('Confirmar Separação');
    expect(enviadoEm('separacao', 'itens_separados'))
      .toEqual({ item_id: 1, quantidade_separada: 5, localizacao_origem_id: 2, lote_id: 7 });
  });

  test('escolher endereço sem lote não manda lote_id', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSeparacao(), '1:');
    await clicar('Confirmar Separação');
    expect(enviadoEm('separacao', 'itens_separados'))
      .toEqual({ item_id: 1, quantidade_separada: 5, localizacao_origem_id: 1 });
  });

  test('"Qualquer endereço (automático)" não manda nenhuma das chaves', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    await clicar('Confirmar Separação');
    const item = enviadoEm('separacao', 'itens_separados');
    expect(item).toEqual({ item_id: 1, quantidade_separada: 5 });
    expect(item).not.toHaveProperty('localizacao_origem_id');
    expect(item).not.toHaveProperty('lote_id');
  });
});

describe('Etapa 59: a entrega parte da origem planejada na separação', () => {
  test('pré-seleciona a planejada; confirmar sem mexer manda a planejada', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('2:7');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos'))
      .toEqual({ item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 2, lote_id: 7 });
  });

  test('escolher "automático" num item com planejada manda origem_automatica: true', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos'))
      .toEqual({ item_id: 1, quantidade_atendida: 3, origem_automatica: true });
  });

  test('planejada fora das opções (sem saldo ali): automático selecionado e origem_automatica: true', async () => {
    requisicao = parcial({ ...PLANEJADA, origem_separacao_id: 9, lote_separacao_id: null, origem_separacao_codigo: 'Z-09', lote_separacao_codigo: null });
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos'))
      .toEqual({ item_id: 1, quantidade_atendida: 3, origem_automatica: true });
  });

  test('busca de saldos falhando: "Planejada da separação" selecionada, confirmar não manda chave', async () => {
    saldosImpl = () => Promise.reject(new Error('rede'));
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    const sel = selectEntrega();
    expect(sel.value).toBe('__planejada__');
    expect(sel.options[sel.selectedIndex].textContent).toBe('Planejada da separação (B-02)');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos')).toEqual({ item_id: 1, quantidade_atendida: 3 });
  });

  test('busca de saldos falhando: escolher "automático" é troca real e manda origem_automatica: true', async () => {
    saldosImpl = () => Promise.reject(new Error('rede'));
    requisicao = parcial(PLANEJADA);
    await renderizar();
    await clicar('Completar Entrega');
    // O beco sem saída era o select já estar em "" — no navegador, escolher a mesma opção não
    // dispara change (o jsdom dispara, então a precondição abaixo é que prova a troca real).
    expect(selectEntrega().value).toBe('__planejada__');
    escolher(selectEntrega(), '');
    expect(selectEntrega().value).toBe('');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos'))
      .toEqual({ item_id: 1, quantidade_atendida: 3, origem_automatica: true });
  });
});

// Revisão da Etapa 59: o servidor só aplica a planejada até `separado - entregue`. Aqui 7 separados,
// 2 entregues → pendente separado 5; a entregável vem do servidor (6 passa do pendente, 5 não).
describe('Etapa 59 (revisão): a pré-seleção da planejada respeita o pendente separado', () => {
  const acimaDoPendente = (entregavel) => parcial({
    ...PLANEJADA, quantidade_solicitada: 10, quantidade_separada: 7, quantidade_entregavel: entregavel,
  });

  test('entregável 6 > pendente 5: automático e nenhuma chave de origem', async () => {
    requisicao = acimaDoPendente(6);
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    await clicar('✅ Confirmar Entrega');
    const item = enviadoEm('entregar', 'itens_atendidos');
    expect(item).toEqual({ item_id: 1, quantidade_atendida: 6 });
    expect(item).not.toHaveProperty('origem_automatica');
    expect(item).not.toHaveProperty('localizacao_origem_id');
  });

  test('entregável 5 = pendente 5: a planejada vem pré-selecionada', async () => {
    requisicao = acimaDoPendente(5);
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('2:7');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos'))
      .toEqual({ item_id: 1, quantidade_atendida: 5, localizacao_origem_id: 2, lote_id: 7 });
  });
});

describe('Etapa 59: "separado de" no detalhe', () => {
  test('mostra endereço e lote enquanto separado > entregue', async () => {
    requisicao = parcial(PLANEJADA);
    await renderizar();
    const linha = container.querySelector('[data-testid="separado-de-1"]');
    expect(linha).toBeTruthy();
    expect(linha.textContent).toBe('separado de B-02 — lote L-7');
  });

  test('sem lote, só o endereço', async () => {
    requisicao = parcial({ ...PLANEJADA, lote_separacao_id: null, lote_separacao_codigo: null });
    await renderizar();
    expect(container.querySelector('[data-testid="separado-de-1"]').textContent).toBe('separado de B-02');
  });

  test('some quando tudo o que foi separado já foi entregue', async () => {
    requisicao = parcial({ ...PLANEJADA, quantidade_entregue: 5, quantidade_atendida: 5, quantidade_solicitada: 8 });
    await renderizar();
    expect(container.querySelector('[data-testid="separado-de-1"]')).toBeNull();
    expect(container.textContent).not.toContain('separado de');
  });
});
