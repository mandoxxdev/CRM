/**
 * Etapa 95 (T3, RN-03) — a tela usa o número do servidor para o máximo separável.
 *
 * O detalhe (T1) traz `saldo_separavel` por item: o TETO da porta da separação (o físico menos o que
 * está na caixa sem reserva dos outros itens/requisições, e a própria caixa). A tela limita o modal por
 * ele (`saldo_separavel ?? saldo_atual` — servidor antigo cai no saldo_atual, como antes), e itens do
 * mesmo material dividem esse número no pré-preenchimento, na ordem do pedido (senão o M4 abre 4 + 4 e
 * a porta recusa o segundo).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSeparacaoTeto --watchAll=false
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
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 6,
  quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0,
  saldo_atual: 4, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
};

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-10-09T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, separacoes, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
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

const inputsQtd = () => [...container.querySelectorAll('.almox-modal input.almox-count-input')];

describe('Etapa 95 (T3): o modal de separação usa o separável do servidor', () => {
  test('[95 RN-03] C1: 4 na caixa, físico 4, separável 0 — o item some do modal e "Confirmar Separação" fica desabilitado', async () => {
    requisicao = {
      ...REQ_BASE, status: 'EM_SEPARACAO',
      itens: [{ ...ITEM_BASE, quantidade_separada: 4, saldo_separavel: 0, quantidade_separavel: 0 }],
    };
    await renderizar();
    await clicar('Ajustar Separação');
    expect(inputsQtd()).toHaveLength(0);
    expect(container.textContent).toContain('Nenhum item com estoque disponível para separação.');
    expect(botaoPorTexto('Confirmar Separação').disabled).toBe(true);
  });

  test('[95 RN-03] C2: separável 1 com saldo 4 — o input abre com 1 e max=1', async () => {
    requisicao = {
      ...REQ_BASE, status: 'APROVADO',
      itens: [{ ...ITEM_BASE, quantidade_solicitada: 3, saldo_separavel: 1, quantidade_separavel: 1 }],
    };
    await renderizar();
    await clicar('Iniciar Separação');
    const [input] = inputsQtd();
    expect(input.value).toBe('1');
    expect(input.getAttribute('max')).toBe('1');
    await clicar('Confirmar Separação');
    const chamada = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
    expect(chamada[1].itens_separados).toEqual([{ item_id: 1, quantidade_separada: 1 }]);
  });

  test('[95 RN-02] M4: dois itens do mesmo material, separável 4 cada — abre com 4 e 0 (dividem na ordem do pedido)', async () => {
    requisicao = {
      ...REQ_BASE, status: 'APROVADO',
      itens: [
        { ...ITEM_BASE, id: 1, quantidade_solicitada: 4, saldo_separavel: 4, quantidade_separavel: 4 },
        { ...ITEM_BASE, id: 2, quantidade_solicitada: 4, saldo_separavel: 4, quantidade_separavel: 4 },
      ],
    };
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputsQtd().map((i) => i.value)).toEqual(['4', '0']);
    await clicar('Confirmar Separação');
    const chamada = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
    expect(chamada[1].itens_separados).toEqual([{ item_id: 1, quantidade_separada: 4 }]);
  });

  test('[95 RN-03] servidor antigo (sem saldo_separavel): cai no saldo_atual, como antes', async () => {
    requisicao = {
      ...REQ_BASE, status: 'APROVADO',
      itens: [{ ...ITEM_BASE, quantidade_solicitada: 5, saldo_atual: 2 }],
    };
    await renderizar();
    await clicar('Iniciar Separação');
    const [input] = inputsQtd();
    expect(input.value).toBe('2');
    expect(input.getAttribute('max')).toBe('2');
  });
});
