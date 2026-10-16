/**
 * Etapa 127 (feature 05, C265, RN-17/RN-18; B819, B821) — o modal divide o separável entre itens do mesmo material só pelo que
 * passa da RESERVA PRÓPRIA de cada um.
 *
 * O detalhe traz `saldo_separavel` (o teto do item sozinho) e, desde esta etapa, `saldo_separavel_reserva` (a parte dele que é
 * reserva própria ainda fora da caixa — não é dividida). Antes, o modal tirava do segundo item TUDO o que o primeiro separava:
 * com dois itens reservados 4 + 4 abria 4 e 0, e a porta aceitava 4 + 4. Agora tira só `max(0, q - propria)` de cada irmão.
 * Servidor antigo (sem o campo): a parte própria é 0 — a conta de antes.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSeparavelDividido --watchAll=false
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

const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', material_unidade: 'PC', material_foto: null,
  unidade: 'PC', quantidade_solicitada: 4, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0,
  saldo_atual: 4, localizacao_nome: null, almoxarifado_nome: null, origem_separacao_id: null, lote_separacao_id: null,
  origem_separacao_codigo: null, lote_separacao_codigo: null,
};
const REQ = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', solicitante_id: 99, solicitante_nome: 'Almoxarife Teste',
  setor: 'Produção', justificativa: 'Teste', criado_em: '2026-10-16T10:00:00', data_necessidade: null, projeto_id: null,
  projeto_nome: null, os_id: null, os_referencia: null, centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
const MOTIVO = 'Motivo da divergência (opcional)';

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
const clicar = async (texto) => { await act(async () => { botao(texto).click(); }); };
const inputs = () => [...container.querySelectorAll('.almox-modal input.almox-count-input')];
const digitar = async (input, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { setter.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const enviado = () => api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/separacao')[1].itens_separados;

describe('Etapa 127 (C265) — o modal divide só o que passa da reserva própria', () => {
  test('[127 RN-17] C2 reservados 4 + 4: abre com 4 e 4 (antes 4 e 0) e manda os dois', async () => {
    requisicao = { ...REQ, status: 'TOTALMENTE_RESERVADA', itens: [
      { ...ITEM, id: 1, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 4 },
      { ...ITEM, id: 2, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 4 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['4', '4']);
    expect(container.textContent).not.toContain(MOTIVO);
    await clicar('Confirmar Separação');
    expect(enviado()).toEqual([{ item_id: 1, quantidade_separada: 4 }, { item_id: 2, quantidade_separada: 4 }]);
  });

  test('[127 RN-17] C3 reserva 4 no primeiro, livre 2: abre com 4 e 2 (antes 4 e 0)', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_RESERVADA', itens: [
      { ...ITEM, id: 1, saldo_separavel: 6, quantidade_separavel: 4, saldo_separavel_reserva: 4 },
      { ...ITEM, id: 2, saldo_separavel: 2, quantidade_separavel: 2, saldo_separavel_reserva: 0 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['4', '2']);
  });

  test('[127 RN-17] C1 sem reserva (controle): abre com 4 e 0, como antes; sem o campo (servidor antigo), o mesmo', async () => {
    requisicao = { ...REQ, status: 'APROVADO', itens: [
      { ...ITEM, id: 1, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 0 },
      { ...ITEM, id: 2, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 0 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['4', '0']);
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = { ...REQ, status: 'TOTALMENTE_RESERVADA', itens: [
      { ...ITEM, id: 1, saldo_separavel: 4, quantidade_separavel: 4 },
      { ...ITEM, id: 2, saldo_separavel: 4, quantidade_separavel: 4 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['4', '0']);
  });

  test('[127 RN-17] o motivo da divergência: C3 com o segundo em 1 pede o porquê (máximo 2); C2 com o primeiro em 4 não tira do segundo', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_RESERVADA', itens: [
      { ...ITEM, id: 1, saldo_separavel: 6, quantidade_separavel: 4, saldo_separavel_reserva: 4 },
      { ...ITEM, id: 2, saldo_separavel: 2, quantidade_separavel: 2, saldo_separavel_reserva: 0 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    expect(container.textContent).not.toContain(MOTIVO); // metade positiva logo abaixo: aparece quando cai abaixo do maximo
    await digitar(inputs()[1], '1');
    expect(container.textContent).toContain(MOTIVO);
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = { ...REQ, status: 'TOTALMENTE_RESERVADA', itens: [
      { ...ITEM, id: 1, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 4 },
      { ...ITEM, id: 2, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 4 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    await digitar(inputs()[1], '3');
    // o segundo em 3 com maximo 4 (a reserva dele) -> pede o motivo; se o primeiro tirasse dele, o maximo seria 0 e nao pediria
    expect(container.querySelectorAll('textarea[id^="separacao-motivo-"]')).toHaveLength(1);
    expect(container.querySelector('textarea#separacao-motivo-2')).not.toBeNull();
  });

  // Fase 2 (M2): a formula exata — o irmao que passa do pote nao tira da reserva propria do item (sabotagem C2 da Etapa 127).
  test('[127 RN-17] o irmão acima do livre não come a reserva própria: C3 com o segundo em 3 e o primeiro em 3,5 -> o primeiro pede o porquê (máximo 4)', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_RESERVADA', itens: [
      { ...ITEM, id: 1, saldo_separavel: 6, quantidade_separavel: 4, saldo_separavel_reserva: 4 },
      { ...ITEM, id: 2, saldo_separavel: 2, quantidade_separavel: 2, saldo_separavel_reserva: 0 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    await digitar(inputs()[1], '3');
    expect(container.querySelector('textarea#separacao-motivo-1')).toBeNull(); // metade: o primeiro em 4 = o maximo, sem motivo
    await digitar(inputs()[0], '3.5');
    expect(container.querySelector('textarea#separacao-motivo-1')).not.toBeNull();
  });

  // Fase 5 (r3): o irmao abaixo da propria nao devolve ao livre; a propria nao conta duas vezes; tres irmaos acumulam.
  test('[127 RN-17, Fase 5 r3] C3 com o primeiro em 2 (abaixo da propria): o segundo continua com maximo 2', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_RESERVADA', itens: [
      { ...ITEM, id: 1, saldo_separavel: 6, quantidade_separavel: 4, saldo_separavel_reserva: 4 },
      { ...ITEM, id: 2, saldo_separavel: 2, quantidade_separavel: 2, saldo_separavel_reserva: 0 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    await digitar(inputs()[0], '2');
    await digitar(inputs()[1], '1');
    expect(container.querySelector('textarea#separacao-motivo-2')).not.toBeNull();
    await digitar(inputs()[1], '3');
    expect(container.querySelector('textarea#separacao-motivo-2')).toBeNull();
  });

  test('[127 RN-17, Fase 5 r3] a propria nao conta duas vezes: pedidos 6 e 4 (6 com reserva 4, 2 livres) -> abre 6 e 0; com o segundo em 2, o maximo do primeiro e 4', async () => {
    requisicao = { ...REQ, status: 'PARCIALMENTE_RESERVADA', itens: [
      { ...ITEM, id: 1, quantidade_solicitada: 6, saldo_separavel: 6, quantidade_separavel: 6, saldo_separavel_reserva: 4 },
      { ...ITEM, id: 2, quantidade_solicitada: 4, saldo_separavel: 2, quantidade_separavel: 2, saldo_separavel_reserva: 0 },
    ] };
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['6', '0']);
    await digitar(inputs()[1], '2');
    await digitar(inputs()[0], '3');
    expect(container.querySelector('textarea#separacao-motivo-1')).not.toBeNull();
    await digitar(inputs()[0], '5');
    expect(container.querySelector('textarea#separacao-motivo-1')).toBeNull();
  });

  test('[127 RN-17, Fase 5 r3] tres irmaos de 2 com 5 livres: abre 2, 2 e 1', async () => {
    requisicao = { ...REQ, status: 'APROVADO', itens: [1, 2, 3].map((id) => (
      { ...ITEM, id, quantidade_solicitada: 2, saldo_separavel: 5, quantidade_separavel: 2, saldo_separavel_reserva: 0 })) };
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['2', '2', '1']);
  });

  test('[127 RN-18, Fase 5 r3] o aviso "chegou" com tres irmaos de 2 e 5 livres: 2, 2 e 1', async () => {
    requisicao = { ...REQ, status: 'AGUARDANDO_ESTOQUE', itens: [1, 2, 3].map((id) => (
      { ...ITEM, id, quantidade_solicitada: 2, saldo_separavel: 5, quantidade_separavel: 2, saldo_separavel_reserva: 0 })) };
    await renderizar();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Dá para separar agora: 2 PC de Chapa 3mm; 2 PC de Chapa 3mm; 1 PC de Chapa 3mm.');
  });

  // Fase 2 (M1): o aviso "chegou" so aparece em Aguard. Estoque/Compra, onde a parte propria e 0 — a conta nova nao muda o que se ve.
  test('[127 RN-18] o aviso "chegou" (controle): sem reserva, 4 livres, dois itens de 4 -> só o primeiro, 4', async () => {
    requisicao = { ...REQ, status: 'AGUARDANDO_ESTOQUE', itens: [
      { ...ITEM, id: 1, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 0 },
      { ...ITEM, id: 2, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 0 },
    ] };
    await renderizar();
    await act(async () => { await Promise.resolve(); });
    expect(container.textContent).toContain('Dá para separar agora: 4 PC de Chapa 3mm.');
  });
});
