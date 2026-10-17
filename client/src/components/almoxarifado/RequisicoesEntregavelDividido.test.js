/**
 * Etapa 135 (feature 05, D (127), RN-06) — a janela de entrega divide o entregável entre itens do mesmo material (irmãos) pela conta
 * da 127: a parte própria de cada item (`saldo_entregavel_proprio` — a caixa e a reserva dele) não é dividida; o que passa dela sai do
 * mesmo livre para todos os irmãos (`saldo_entregavel` é o teto do item sozinho).
 *
 * Antes, cada irmão abria com o próprio máximo: dois itens na segunda rodada (já entregues em parte) com 2 livres abriam 2 e 2, e o
 * servidor baixava o primeiro e recusava o segundo. Servidor sem os campos: nada é dividido (a conta de antes).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEntregavelDividido --watchAll=false
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
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));
jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

// S2 da Fase 0: solicitado 4, separado 2, entregue 2 (segunda rodada), 2 livres no material, sem reserva.
const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', material_unidade: 'PC', material_foto: null,
  unidade: 'PC', quantidade_solicitada: 4, quantidade_separada: 2, quantidade_entregue: 2, quantidade_atendida: 2,
  saldo_atual: 2, localizacao_nome: null, almoxarifado_nome: null, origem_separacao_id: null, lote_separacao_id: null,
  origem_separacao_codigo: null, lote_separacao_codigo: null, material_critico: 0,
  quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 0,
};
const REQ = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', solicitante_id: 99, solicitante_nome: 'Almoxarife Teste',
  setor: 'Produção', justificativa: 'Teste', criado_em: '2026-10-16T10:00:00', data_necessidade: null, projeto_id: null,
  projeto_nome: null, os_id: null, os_referencia: null, centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};

let container; let root; let requisicao;
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
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}><RequisicoesList /></MemoryRouter>);
  });
}
const botao = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => {
  const b = botao(texto);
  if (!b) throw new Error(`botao "${texto}" nao encontrado`);
  await act(async () => { b.click(); });
};
const inputs = () => [...container.querySelectorAll('.almox-modal input.almox-count-input')];
const digitar = async (input, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const enviado = () => {
  const c = api.put.mock.calls.find((x) => x[0] === '/almoxarifado/requisicoes/55/entregar');
  return c ? c[1].itens_atendidos.map((i) => ({ item_id: i.item_id, quantidade_atendida: i.quantidade_atendida })) : null;
};
const recriar = () => { act(() => root.unmount()); root = createRoot(container); api.put.mockClear(); };

describe('Etapa 135 (RN-06) — a janela de entrega divide o livre entre irmãos', () => {
  test('[135 RN-06] segunda rodada dos dois, 2 livres: "Completar Entrega" abre 2 e vazio, e manda só o primeiro', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_ATENDIDA', itens: [{ ...ITEM, id: 1 }, { ...ITEM, id: 2 }] };
    await renderizar();
    await clicar('Completar Entrega');
    expect(inputs().map((i) => i.value)).toEqual(['2', '']);
    expect(inputs().map((i) => i.max)).toEqual(['2', '0']);
    await clicar('✅ Confirmar Entrega');
    expect(enviado()).toEqual([{ item_id: 1, quantidade_atendida: 2 }]);
  });

  test('[135 RN-06] digitar 1 no primeiro libera 1 para o segundo (o máximo do campo)', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_ATENDIDA', itens: [{ ...ITEM, id: 1 }, { ...ITEM, id: 2 }] };
    await renderizar();
    await clicar('Completar Entrega');
    await digitar(inputs()[0], '1');
    expect(inputs().map((i) => i.max)).toEqual(['2', '1']);
    await digitar(inputs()[1], '1');
    expect(inputs()[0].max).toBe('1');
    await clicar('✅ Confirmar Entrega');
    expect(enviado()).toEqual([{ item_id: 1, quantidade_atendida: 1 }, { item_id: 2, quantidade_atendida: 1 }]);
  });

  test('[135 RN-06] o "Confirmar Entrega e Baixar Estoque" (um clique) e o "Entregar escolhendo de onde sai…" dividem', async () => {
    requisicao = { ...REQ, status: 'EM_SEPARACAO', itens: [{ ...ITEM, id: 1 }, { ...ITEM, id: 2 }] };
    await renderizar();
    await clicar('Confirmar Entrega e Baixar Estoque');
    expect(enviado()).toEqual([{ item_id: 1, quantidade_atendida: 2 }]);
    recriar();
    await renderizar();
    await clicar('Entregar escolhendo de onde sai');
    expect(inputs().map((i) => i.value)).toEqual(['2', '']);
  });

  test('[135 RN-06] a parte própria não é dividida: o primeiro com 1 próprio + 1 livre, o segundo só livre — abre 2 e 0; com o primeiro em 1, o segundo pode 1', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_ATENDIDA', itens: [
      { ...ITEM, id: 1, quantidade_entregue: 1, quantidade_atendida: 1, quantidade_separada: 1, quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 1 },
      { ...ITEM, id: 2, quantidade_entregavel: 1, saldo_entregavel: 1, saldo_entregavel_proprio: 0 },
    ] };
    await renderizar();
    await clicar('Completar Entrega');
    expect(inputs().map((i) => i.value)).toEqual(['2', '']);
    expect(inputs()[1].max).toBe('0');
    await digitar(inputs()[0], '1');
    expect(inputs()[1].max).toBe('1');
  });

  test('[135 RN-06] reservados (nada a dividir) e servidor sem os campos: abre cada um com o seu máximo, como antes', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_ATENDIDA', itens: [
      { ...ITEM, id: 1, quantidade_separada: 4, quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 2 },
      { ...ITEM, id: 2, quantidade_separada: 3, quantidade_entregue: 0, quantidade_atendida: 0, quantidade_entregavel: 3, saldo_entregavel: 3, saldo_entregavel_proprio: 3 },
    ] };
    await renderizar();
    await clicar('Completar Entrega');
    expect(inputs().map((i) => i.value)).toEqual(['2', '3']);
    recriar();
    const semCampos = ({ saldo_entregavel: _a, saldo_entregavel_proprio: _b, ...resto }) => resto; // eslint-disable-line no-unused-vars
    requisicao = { ...REQ, status: 'PARCIALMENTE_ATENDIDA', itens: [semCampos({ ...ITEM, id: 1 }), semCampos({ ...ITEM, id: 2 })] };
    await renderizar();
    await clicar('Completar Entrega');
    expect(inputs().map((i) => i.value)).toEqual(['2', '2']);
  });
});
