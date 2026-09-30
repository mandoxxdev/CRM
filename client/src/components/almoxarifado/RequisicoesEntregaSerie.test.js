/**
 * Etapa 61 (RN-04) — séries no modal de entrega da requisição.
 *
 * Item de material com `controle_serie` (o detalhe não traz a flag: a tela pergunta a
 * GET /almoxarifado/materiais/:id) mostra as séries EM_ESTOQUE (GET /materiais/:id/series?status=
 * EM_ESTOQUE) como caixas de seleção; com um lote escolhido no "Sai de", só as desse lote. O
 * contador "{n} de {q}" e o confirmar só habilitam com EXATAMENTE a quantidade. O PUT leva
 * `serie_ids` numéricos.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEntregaSerie --watchAll=false
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

const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Medidor serializado',
  material_unidade: 'UN', material_foto: null, unidade: 'UN', quantidade_solicitada: 5,
  quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2, quantidade_entregavel: 3,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
};

const REQUISICAO = {
  id: 55, numero: 'REQ-055', status: 'PARCIALMENTE_ATENDIDA', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
  itens: [ITEM],
};

const SALDOS = [
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 4 },
  { id: 5, material_id: 10, localizacao_id: 3, localizacao_codigo: 'C-03', lote_id: 8, lote: 'L-8', quantidade: 2 },
];

// ids como string de propósito: o PUT tem de levar número.
const SERIES = [
  { id: '11', numero: 'SN-001', status: 'EM_ESTOQUE', lote_id: 7, localizacao_descricao: 'Prateleira A' },
  { id: '12', numero: 'SN-002', status: 'EM_ESTOQUE', lote_id: 7, localizacao_descricao: null },
  { id: '13', numero: 'SN-003', status: 'EM_ESTOQUE', lote_id: 8, localizacao_descricao: null },
  { id: '14', numero: 'SN-004', status: 'EM_ESTOQUE', lote_id: 8, localizacao_descricao: null },
];

let container;
let root;
let materialImpl;
let seriesImpl;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  materialImpl = () => Promise.resolve({ data: { id: 10, controle_serie: 1 } });
  seriesImpl = () => Promise.resolve({ data: SERIES });
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = REQUISICAO;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: REQUISICAO });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos') return Promise.resolve({ data: SALDOS });
    if (url === '/almoxarifado/materiais/10') return materialImpl();
    if (url === '/almoxarifado/materiais/10/series?status=EM_ESTOQUE') return seriesImpl();
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
const abrirModal = async () => { await act(async () => { botaoPorTexto('Completar Entrega').click(); }); };
const fecharModal = async () => {
  const modal = [...container.querySelectorAll('.almox-modal')]
    .find((m) => m.textContent.includes('Confirmar Entrega — REQ-055'));
  await act(async () => { modal.querySelector('.almox-modal-close').click(); });
};
const botaoConfirmar = () => botaoPorTexto('✅ Confirmar Entrega');
const contador = () => container.querySelector('#entrega-series-contador-1')?.textContent;
const caixas = () => [...container.querySelectorAll('#entrega-series-1 input[type="checkbox"]')];
const numerosVisiveis = () => [...container.querySelectorAll('#entrega-series-1 label')].map((l) => l.textContent);
const caixa = (id) => container.querySelector(`#entrega-series-1 input[data-serie-id="${id}"]`);
const marcar = async (id) => { await act(async () => { caixa(id).click(); }); };
const escolherOrigem = (valor) => {
  const select = container.querySelector('#entrega-origem-1');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};
const digitarQuantidade = (valor) => {
  const input = container.querySelector('.almox-modal .almox-count-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

describe('Etapa 61: séries no modal de entrega', () => {
  test('lista as séries em estoque com o endereço como dica; contador começa em 0 de 3', async () => {
    await renderizar();
    await abrirModal();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/10');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/10/series?status=EM_ESTOQUE');
    expect(numerosVisiveis()).toEqual(['SN-001 · Prateleira A', 'SN-002', 'SN-003', 'SN-004']);
    expect(contador()).toBe('0 de 3');
    expect(botaoConfirmar().disabled).toBe(true);
  });

  test('confirmar só habilita com exatamente a quantidade; acima dela as caixas travam', async () => {
    await renderizar();
    await abrirModal();
    await marcar(11);
    await marcar(12);
    expect(contador()).toBe('2 de 3');
    expect(botaoConfirmar().disabled).toBe(true);
    await marcar(13);
    expect(contador()).toBe('3 de 3');
    expect(botaoConfirmar().disabled).toBe(false);
    expect(caixa(14).disabled).toBe(true);
    // Diminuir a quantidade desfaz o "bate" — o confirmar volta a travar.
    digitarQuantidade('2');
    expect(contador()).toBe('3 de 2');
    expect(botaoConfirmar().disabled).toBe(true);
  });

  test('manda serie_ids numéricos no PUT', async () => {
    await renderizar();
    await abrirModal();
    await marcar(11);
    await marcar(13);
    await marcar(14);
    await act(async () => { botaoConfirmar().click(); });
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/requisicoes/55/entregar', expect.any(Object));
    expect(api.put.mock.calls[0][1].itens_atendidos[0]).toEqual({
      item_id: 1, quantidade_atendida: 3, serie_ids: [11, 13, 14],
    });
  });

  test('lote escolhido no "Sai de": só as séries desse lote, e as de outro lote deixam de contar', async () => {
    await renderizar();
    await abrirModal();
    await marcar(13);
    expect(contador()).toBe('1 de 3');
    escolherOrigem('2:7');
    expect(numerosVisiveis()).toEqual(['SN-001 · Prateleira A', 'SN-002']);
    expect(contador()).toBe('0 de 3');
    digitarQuantidade('2');
    await marcar(11);
    await marcar(12);
    expect(botaoConfirmar().disabled).toBe(false);
    await act(async () => { botaoConfirmar().click(); });
    expect(api.put.mock.calls[0][1].itens_atendidos[0]).toEqual({
      item_id: 1, quantidade_atendida: 2, localizacao_origem_id: 2, lote_id: 7, serie_ids: [11, 12],
    });
  });

  test('material sem controle de série: nenhuma caixa, confirmar livre, PUT sem serie_ids', async () => {
    materialImpl = () => Promise.resolve({ data: { id: 10, controle_serie: 0 } });
    await renderizar();
    await abrirModal();
    expect(container.querySelector('#entrega-series-1')).toBeNull();
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/materiais/10/series?status=EM_ESTOQUE');
    expect(botaoConfirmar().disabled).toBe(false);
    await act(async () => { botaoConfirmar().click(); });
    expect(api.put.mock.calls[0][1].itens_atendidos[0]).not.toHaveProperty('serie_ids');
  });

  test('falha ao carregar as séries: o modal diz e o confirmar fica travado', async () => {
    seriesImpl = () => Promise.reject(new Error('rede'));
    await renderizar();
    await abrirModal();
    expect(container.querySelector('#entrega-series-1').textContent)
      .toContain('Não foi possível carregar as séries deste material');
    expect(botaoConfirmar().disabled).toBe(true);
  });

  test('resposta atrasada de uma abertura anterior não pinta as séries atuais', async () => {
    let resolverPrimeira;
    const primeira = new Promise((r) => { resolverPrimeira = r; });
    const chamadas = [() => primeira, () => Promise.resolve({ data: [SERIES[3]] })];
    seriesImpl = () => chamadas.shift()();
    await renderizar();
    await abrirModal();
    await fecharModal();
    await abrirModal();
    expect(numerosVisiveis()).toEqual(['SN-004']);
    await act(async () => { resolverPrimeira({ data: SERIES }); });
    expect(numerosVisiveis()).toEqual(['SN-004']);
    expect(caixas()).toHaveLength(1);
  });
});
