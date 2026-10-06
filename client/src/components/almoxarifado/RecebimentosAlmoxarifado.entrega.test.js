/**
 * Etapa 33 (RN-33.04) — o recebimento contra pedido não mostra mais a coluna "Entrega" por item.
 *
 * A data de entrega por item deixou de existir no pedido de compra (a entrega é do pedido:
 * previsão + local). A tabela de itens do painel "Por Pedido de Compra" tinha uma coluna que
 * agora só mostraria "—" em toda linha; ela sai, e a previsão do pedido continua no bloco
 * "Condições do pedido" do cabeçalho.
 *
 * Executar: cd client && CI=true npx react-scripts test RecebimentosAlmoxarifado.entrega --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RecebimentosAlmoxarifado from './RecebimentosAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// jspdf pede canvas 2D no carregamento do módulo e o jsdom não tem; as etiquetas não são o
// alvo deste teste.
jest.mock('../../utils/etiquetasPdf', () => ({
  FORMATOS_ETIQUETA: [],
  gerarEtiquetasPDF: jest.fn(),
  montarEtiquetasDoRecebimento: jest.fn(() => []),
}));

const PEDIDO = {
  id: 7, numero: '28433', status: 'pendente', data_pedido: '2025-12-16',
  previsao_entrega: '2025-12-18', condicao_pagamento: '28 D.D.L.',
  frete_modalidade: '2-Contratação do Frete por conta de Terceiros', via_transporte: 'Rodoviário',
  local_entrega: 'AVENIDA ANGELO DEMARCHI, 130', observacoes: '',
  fornecedor: { nome: 'TECNOPAR FIXADORES LTDA', cnpj: '54.984.382/0001-64', origem: 'snapshot' },
  totais: { total_produtos: 28.48, total_ipi: 1.85, total_icms_st: 0, total_desconto: 0,
    valor_frete: 0, total_geral: 30.33 },
  itens: [
    { id: 1, item_numero: 1, material_id: 10, codigo: 'MP-936',
      descricao: 'PARAFUSO SEXTAVADO M10 X 35 INOX 304', ncm: '73181500', quantidade: 13,
      unidade: 'PC', valor_unitario: 2.191, ipi_percentual: 6.5, valor_linha: 28.48,
      material_nome: 'Parafuso', recebivel: true },
  ],
  itens_sem_material: 0,
};

let container;
let root;

const esperar = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

async function montarComPedidoAberto() {
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') {
      return Promise.resolve({ data: [{ id: 7, numero: '28433', fornecedor_nome: 'TECNOPAR' }] });
    }
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra/7') return Promise.resolve({ data: PEDIDO });
    return Promise.reject(new Error(`GET inesperado no teste: ${url}`));
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/recebimentos']}>
        <RecebimentosAlmoxarifado />
      </MemoryRouter>,
    );
  });
  await esperar(0);

  const novo = Array.from(container.querySelectorAll('button'))
    .find((b) => b.textContent.includes('Novo Recebimento'));
  expect(novo).toBeDefined();
  await act(async () => { novo.click(); });

  // Os filtros da lista também são `select.almox-select`: o alvo é o select DENTRO do modal.
  const modal = container.querySelector('.almox-modal-body');
  expect(modal).not.toBeNull();
  const tipo = Array.from(modal.querySelectorAll('select'))
    .find((s) => Array.from(s.options).some((o) => o.value === 'PEDIDO_COMPRA'));
  expect(tipo).toBeDefined();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(tipo, 'PEDIDO_COMPRA');
    tipo.dispatchEvent(new Event('change', { bubbles: true }));
  });

  const pedidoSel = Array.from(modal.querySelectorAll('select'))
    .find((s) => Array.from(s.options).some((o) => o.value === '7'));
  expect(pedidoSel).toBeDefined();
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(pedidoSel, '7');
    pedidoSel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await esperar(0);
}

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  if (container) container.remove();
  root = null; container = null;
  jest.clearAllMocks();
});

describe('Etapa 33 — recebimento contra pedido', () => {
  test('RN-33.04: a tabela de itens do pedido não tem a coluna "Entrega"; a previsão fica no cabeçalho', async () => {
    await montarComPedidoAberto();

    const painel = container.querySelector('.ped-rec-painel');
    expect(painel).not.toBeNull();

    const cabecalhos = Array.from(painel.querySelectorAll('table thead th')).map((th) => th.textContent.trim());
    expect(cabecalhos).toContain('Código');
    expect(cabecalhos).toContain('Total');
    expect(cabecalhos).not.toContain('Entrega');

    const celulas = Array.from(painel.querySelectorAll('table tbody tr')[0].querySelectorAll('td'));
    expect(celulas).toHaveLength(cabecalhos.length);

    // A entrega continua visível onde ela é do pedido: "Previsão de entrega" no cabeçalho.
    expect(painel.textContent).toContain('Previsão de entrega');
    expect(painel.textContent).toContain('18/12/2025');
  });
});
