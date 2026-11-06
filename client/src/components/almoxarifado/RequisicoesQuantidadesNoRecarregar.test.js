/**
 * Etapa 195 (C454) — com a janela de separação ou de entrega aberta, voltar para a aba recarrega o detalhe e as quantidades digitadas
 * ficam como foram digitadas. Antes, `aplicarDetalhe` repunha sempre o inicial: o digitado 3 virava 5.
 *
 * Plano: docs/superpowers/plans/2026-11-05-almoxarifado-etapa195-quantidades-da-separacao.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesQuantidadesNoRecarregar --watchAll=false
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
  unidade: 'PC', quantidade_solicitada: 5, saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
  quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0,
};
const REQ = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', solicitante_id: 99, solicitante_nome: 'Almoxarife Teste',
  setor: 'Produção', justificativa: 'Teste', criado_em: '2026-11-05T10:00:00', data_necessidade: null, projeto_id: null,
  projeto_nome: null, os_id: null, os_referencia: null, centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
const comItens = (status, itens) => ({ ...REQ, status, itens: itens.map((extra, i) => ({ ...ITEM, id: i + 1, ...extra })) });
const SALDOS = [{ id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 20 }];

let container; let root; let requisicao;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') return Promise.resolve({ data: SALDOS });
    return Promise.resolve({ data: [] });
  });
  api.put.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes/55/aprovar') {
      requisicao = { ...requisicao, status: 'APROVADO', itens: requisicao.itens.map((i) => ({ ...i, quantidade_solicitada: 4 })) };
    }
    return Promise.resolve({ data: { parcial: true } });
  });
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
const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => { setter.call(select, valor); select.dispatchEvent(new Event('change', { bubbles: true })); });
};
const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 10)); }); };
const cargasDoDetalhe = () => api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/requisicoes/55').length;
const voltarParaAba = async () => {
  await act(async () => { document.dispatchEvent(new Event('visibilitychange')); });
  await esperar();
};
const focarJanela = async () => {
  await act(async () => { window.dispatchEvent(new Event('focus')); });
  await esperar();
};
const textoDoModal = () => container.querySelector('.almox-modal').textContent;
const enviadoNaSeparacao = () => {
  const c = api.put.mock.calls.find((x) => x[0] === '/almoxarifado/requisicoes/55/separacao');
  return c ? c[1].itens_separados : null;
};
const enviadoNaEntrega = () => {
  const c = api.put.mock.calls.find((x) => x[0] === '/almoxarifado/requisicoes/55/entregar');
  return c ? c[1].itens_atendidos.map((i) => ({ item_id: i.item_id, quantidade_atendida: i.quantidade_atendida })) : null;
};

describe('Etapa 195 — as quantidades digitadas na janela não voltam ao inicial ao recarregar', () => {
  test('[RN-195.01/02] separação aberta, digita 3, volta para a aba -> recarrega, continua 3 e manda 3', async () => {
    expect(document.visibilityState).toBe('visible'); // premissa: senão o listener não recarrega e o teste não prova nada
    requisicao = comItens('APROVADO', [{}]);
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['5']);
    await digitar(inputs()[0], '3');
    const antes = cargasDoDetalhe();
    requisicao = { ...requisicao, itens: requisicao.itens.map((i) => ({ ...i, saldo_atual: 18 })) };
    await voltarParaAba();
    expect(cargasDoDetalhe()).toBe(antes + 1);
    expect(textoDoModal()).toContain('Saldo: 18'); // metade positiva: o detalhe novo foi aplicado
    expect(inputs().map((i) => i.value)).toEqual(['3']);
    await clicar('Confirmar Separação');
    expect(enviadoNaSeparacao()).toEqual([{ item_id: 1, quantidade_separada: 3 }]);
  });

  test('[RN-195.01] o mesmo com o foco da janela', async () => {
    requisicao = comItens('APROVADO', [{}]);
    await renderizar();
    await clicar('Iniciar Separação');
    await digitar(inputs()[0], '2');
    const antes = cargasDoDetalhe();
    await focarJanela();
    expect(cargasDoDetalhe()).toBe(antes + 1);
    expect(inputs().map((i) => i.value)).toEqual(['2']);
  });

  test('[RN-195.03] outra pessoa separa o item 2 no meio -> o item 1 continua digitado e o item 2, fora da janela, não vai', async () => {
    requisicao = comItens('APROVADO', [{}, { material_id: 20, material_codigo: 'MAT-2', quantidade_solicitada: 1 }]);
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['5', '1']);
    await digitar(inputs()[0], '3');
    requisicao = { ...requisicao, itens: requisicao.itens.map((i) => (i.id === 2 ? { ...i, quantidade_separada: 1 } : i)) };
    await focarJanela();
    expect(inputs().map((i) => i.value)).toEqual(['3']); // o item 2 saiu da janela
    await clicar('Confirmar Separação');
    expect(enviadoNaSeparacao()).toEqual([{ item_id: 1, quantidade_separada: 3 }]);
  });

  test('[RN-195.03] item que saiu da janela e voltou na mesma abertura -> volta com o inicial (decidido de novo), o outro continua', async () => {
    requisicao = comItens('APROVADO', [{}, { material_id: 20, material_codigo: 'MAT-2', quantidade_solicitada: 2 }]);
    await renderizar();
    await clicar('Iniciar Separação');
    await digitar(inputs()[0], '3');
    await digitar(inputs()[1], '1');
    requisicao = { ...requisicao, itens: requisicao.itens.map((i) => (i.id === 2 ? { ...i, quantidade_separada: 2 } : i)) };
    await focarJanela();
    expect(inputs().map((i) => i.value)).toEqual(['3']);
    requisicao = { ...requisicao, itens: requisicao.itens.map((i) => (i.id === 2 ? { ...i, quantidade_separada: 0 } : i)) };
    await focarJanela();
    expect(inputs().map((i) => i.value)).toEqual(['3', '2']);
  });

  test('[RN-195.03, B1310] digitado 4 com máximo 5; outra pessoa separa 3 (máximo 2) -> o campo continua 4, sem limitar em silêncio', async () => {
    requisicao = comItens('APROVADO', [{}]);
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputs().map((i) => i.value)).toEqual(['5']);
    await digitar(inputs()[0], '4');
    requisicao = { ...requisicao, itens: requisicao.itens.map((i) => ({ ...i, quantidade_separada: 3 })) };
    await focarJanela();
    expect(textoDoModal()).toContain('Já separado: 3'); // metade positiva: o detalhe novo (máximo 2) foi aplicado
    expect(inputs().map((i) => i.value)).toEqual(['4']);
  });

  test('[RN-195.06] "Sai de" escolhido e quantidade digitada -> os dois continuam depois de recarregar', async () => {
    requisicao = comItens('APROVADO', [{}]);
    await renderizar();
    await clicar('Iniciar Separação');
    await esperar();
    const select = container.querySelector('#separacao-origem-1');
    escolher(select, '1:');
    await digitar(inputs()[0], '4');
    await voltarParaAba();
    expect(container.querySelector('#separacao-origem-1').value).toBe('1:');
    expect(inputs().map((i) => i.value)).toEqual(['4']);
    await clicar('Confirmar Separação');
    expect(enviadoNaSeparacao()).toEqual([{ item_id: 1, quantidade_separada: 4, localizacao_origem_id: 1 }]);
  });

  test('[RN-195.04] entrega aberta, digita 1, volta para a aba -> continua 1 e manda 1', async () => {
    requisicao = comItens('PARCIALMENTE_ATENDIDA', [{
      quantidade_solicitada: 4, quantidade_separada: 2, quantidade_entregue: 2, quantidade_atendida: 2, saldo_atual: 2,
      quantidade_entregavel: 2, saldo_entregavel: 2, saldo_entregavel_proprio: 0, material_critico: 0,
    }]);
    await renderizar();
    await clicar('Completar Entrega');
    expect(inputs().map((i) => i.value)).toEqual(['2']);
    await digitar(inputs()[0], '1');
    const antes = cargasDoDetalhe();
    requisicao = { ...requisicao, itens: requisicao.itens.map((i) => ({ ...i, saldo_atual: 7 })) };
    await voltarParaAba();
    expect(cargasDoDetalhe()).toBe(antes + 1);
    expect(textoDoModal()).toContain('Saldo: 7');
    expect(inputs().map((i) => i.value)).toEqual(['1']);
    await clicar('✅ Confirmar Entrega');
    expect(enviadoNaEntrega()).toEqual([{ item_id: 1, quantidade_atendida: 1 }]);
  });

  test('[RN-195.05] janela fechada: "Aprovar e Separar" recarrega e abre com o inicial do detalhe novo (4), não o velho (5)', async () => {
    requisicao = comItens('PENDENTE', [{}]);
    await renderizar();
    await clicar('Aprovar e Separar');
    await esperar();
    expect(textoDoModal()).toContain('Solicitado: 4');
    expect(inputs().map((i) => i.value)).toEqual(['4']);
  });
});
