/**
 * Etapa 33 — a entrega é do pedido, não do item (RN-33.01, RN-33.02).
 *
 * Em `main` cada linha do pedido tinha o bloco "Entrega deste item" (chips Hoje/7/15/30 dias +
 * data livre), gravado em `itens_pedido_compra.data_entrega`. A empresa decidiu que a entrega é
 * UMA por pedido: previsão + local, numa seção própria. Este arquivo prova as três pontas da
 * tela: (a) o bloco do item sumiu; (b) existe a seção "3. Entrega" com previsão e local, e
 * "Condições" virou a 4; (c) o corpo do POST não carrega `data_entrega` por item.
 *
 * Executar: cd client && CI=true npx react-scripts test PedidoCompraForm.entrega --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PedidoCompraForm from './PedidoCompraForm';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const FORNECEDORES = [
  { id: 1, razao_social: 'TECNOPAR FIXADORES LTDA', cnpj: '54.984.382/0001-64',
    cidade: 'SAO BERNARDO DO CAMPO', estado: 'SP', endereco: 'AV. WINSTON CHURCHILL, 596',
    cep: '09720-000', telefone: '(11) 4177-2311' },
];

const OPCOES = {
  proximo_numero: '28434',
  total_materiais: 1,
  ipi: [0, 6.5],
  unidades: ['UN', 'PC'],
  condicao_pagamento: ['28 D.D.L.'],
  frete_modalidade: ['1-CIF'],
  via_transporte: ['Rodoviário'],
  transportadoras: [],
  tabelas_preco: [],
  empresa: { nome: 'GMP', endereco: 'AVENIDA ANGELO DEMARCHI, 130' },
};

const MATERIAIS = [
  { id: 10, codigo: 'MP-936', nome: 'PARAFUSO SEXTAVADO M10 X 35 INOX 304', unidade: 'PC',
    ncm: '73181500', custo_unitario: 2.191 },
];

const TOTAIS = {
  total_produtos: 2.19, total_ipi: 0, total_icms_st: 0, total_desconto: 0, valor_frete: 0,
  total_geral: 2.19,
};

let container;
let root;

const esperar = (ms) => act(() => new Promise((r) => setTimeout(r, ms)));

async function montar() {
  api.get.mockImplementation((url) => {
    if (url === '/compras/fornecedores') return Promise.resolve({ data: FORNECEDORES });
    if (url === '/compras/pedidos-aux/opcoes') return Promise.resolve({ data: OPCOES });
    if (url === '/compras/pedidos-aux/materiais') return Promise.resolve({ data: MATERIAIS });
    return Promise.reject(new Error(`GET inesperado no teste: ${url}`));
  });
  api.post.mockImplementation((url) => {
    if (url === '/compras/pedidos/calcular') {
      return Promise.resolve({ data: { totais: TOTAIS, itens: [{ valor_linha: 2.19, ipi_linha: 0 }] } });
    }
    if (url === '/compras/pedidos') return Promise.resolve({ data: { id: 1, numero: '28434' } });
    return Promise.reject(new Error(`POST inesperado no teste: ${url}`));
  });

  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/compras/pedidos/novo']}>
        <Routes>
          <Route path="/compras/pedidos/novo" element={<PedidoCompraForm />} />
          <Route path="/compras/pedidos" element={<div>lista</div>} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await esperar(0);
}

const botaoPorTexto = (texto) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent.trim().startsWith(texto));

const headings = () => Array.from(container.querySelectorAll('h2')).map((h) => h.textContent.trim());

afterEach(async () => {
  if (root) await act(async () => root.unmount());
  if (container) container.remove();
  root = null; container = null;
  jest.clearAllMocks();
});

describe('Etapa 33 — entrega do pedido, não do item', () => {
  test('(a) RN-33.01: a linha do item não oferece "Entrega deste item"', async () => {
    await montar();
    // Abre o painel de detalhes do primeiro item: é onde o bloco morava.
    const detalhes = container.querySelector('.pcf-item-detalhes');
    expect(detalhes).not.toBeNull();
    await act(async () => { detalhes.click(); });

    expect(container.textContent).not.toContain('Entrega deste item');
    expect(container.querySelector('button[title="Unidade, IPI e entrega deste item"]')).toBeNull();
    expect(container.querySelector('button[title="Unidade, IPI e observações deste item"]')).not.toBeNull();
    // O painel continua com o que sobrou: unidade, IPI e os campos livres.
    expect(container.textContent).toContain('IPI deste item');
    expect(container.textContent).toContain('Observação do item');
  });

  test('(b) RN-33.02: seção "3. Entrega" com previsão e local; "Condições" vira a 4 e "Total" a 5', async () => {
    await montar();
    const hs = headings();
    expect(hs).toContain('3. Entrega');
    expect(hs).toContain('4. Condições');
    expect(hs).toContain('5. Total');
    expect(hs).not.toContain('3. Condições');

    const entrega = Array.from(container.querySelectorAll('section.pcf-bloco'))
      .find((s) => s.querySelector('h2')?.textContent.trim() === '3. Entrega');
    expect(entrega).toBeDefined();
    const rotulos = Array.from(entrega.querySelectorAll('.pcf-chips-label')).map((l) => l.textContent.trim());
    expect(rotulos).toContain('Previsão de entrega');
    expect(rotulos).toContain('Entregar em');
    expect(rotulos.some((r) => r.startsWith('Previsão de entrega do pedido'))).toBe(false);

    const condicoes = Array.from(container.querySelectorAll('section.pcf-bloco'))
      .find((s) => s.querySelector('h2')?.textContent.trim() === '4. Condições');
    const rotCond = Array.from(condicoes.querySelectorAll('.pcf-chips-label')).map((l) => l.textContent.trim());
    expect(rotCond.some((r) => r.startsWith('Condição de pagamento'))).toBe(true);
    expect(rotCond).not.toContain('Entregar em');
    expect(rotCond.some((r) => r.startsWith('Previsão de entrega'))).toBe(false);

    // "Cobrar em" continua dentro de "Mais opções", que não é tocada (RN-33.02).
    await act(async () => { botaoPorTexto('Mais opções').click(); });
    expect(container.textContent).toContain('Cobrar em');
  });

  test('(c) RN-33.03 pelo cliente: o corpo do POST não leva data_entrega por item', async () => {
    await montar();

    await act(async () => { botaoPorTexto('Escolher fornecedor').click(); });
    await act(async () => { botaoPorTexto('TECNOPAR FIXADORES LTDA').click(); });

    await act(async () => { botaoPorTexto('Escolher material').click(); });
    await esperar(300); // debounce da busca (250 ms)
    const material = container.querySelector('.pcf-busca-item');
    expect(material).not.toBeNull();
    await act(async () => { material.click(); });
    await esperar(400); // debounce do recalcular (350 ms)

    const form = container.querySelector('form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await esperar(0);

    const chamada = api.post.mock.calls.find(([url]) => url === '/compras/pedidos');
    expect(chamada).toBeDefined();
    const [, payload] = chamada;
    expect(payload.itens).toHaveLength(1);
    expect(payload.itens[0].material_id).toBe(10);
    expect(Object.keys(payload.itens[0])).not.toContain('data_entrega');
    // O que a entrega do pedido ainda carrega: previsão e local, no cabeçalho.
    expect(Object.keys(payload)).toContain('previsao_entrega');
    expect(Object.keys(payload)).toContain('local_entrega');
  });
});
