/**
 * Etapa 176, T2 (RN-176.07) — a OS no recebimento: campo "OS (opcional)" no novo recebimento, coluna na lista e campo no
 * detalhe. Contrato consumido (plano da 176, secao Execucao): `GET /almoxarifado/aux/ordens-servico?abertas=1`
 * (`id, numero_os, status, cliente_id, cliente_nome`), `os_id`/`os_numero` na lista de pedidos para recebimento, na lista
 * e no detalhe do recebimento; `POST /almoxarifado/recebimentos` com `os_id` (numero ou null; com pedido a tela nao manda).
 *
 * Mock SO na fronteira HTTP (`api`), e o fallback REJEITA URL inesperada (molde: `RecebimentosPainelPedido.test.js`).
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosOs.test.js
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
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const RECEBIMENTOS = [
  {
    id: 41, numero: 'REC-2026-041', nota_fiscal: 'NF-4100', pedido_compra_numero: null,
    fornecedor_nome: 'Cliente Alfa', status: 'RECEBIDO', created_at: '2026-10-20T11:00:00Z',
    os_id: 7, os_numero: 'OS-0007',
  },
  {
    id: 58, numero: 'REC-2026-058', nota_fiscal: 'NF-5800', pedido_compra_numero: 'PC-0099',
    fornecedor_nome: 'Parafusos Sul', status: 'RECEBIDO', created_at: '2026-10-21T08:30:00Z',
    os_id: null, os_numero: null,
  },
];
const DETALHE_41 = {
  ...RECEBIMENTOS[0], fornecedor_cnpj: null, valor_total_nota: null, chave_nfe: null, nota_serie: null,
  observacoes: null, contas_pagar_id: null, itens: [],
};

const OS_ABERTAS = [
  { id: 7, numero_os: 'OS-0007', status: 'em_andamento', cliente_id: 3, cliente_nome: 'Cliente Alfa' },
  { id: 12, numero_os: 'OS-0012', status: 'aberta', cliente_id: null, cliente_nome: null },
];

const PEDIDOS = [
  {
    id: 312, numero: 'PC-2026-312', fornecedor_nome: 'Aços Vale Ltda', fornecedor_cnpj: '11.111.111/0001-11',
    quantidade_pedida: 10, quantidade_recebida: 0, saldo_pendente: 10, situacao_recebimento: 'ABERTO',
    // OS fora da lista de abertas de proposito: a tela mostra a do PEDIDO, nao procura na lista.
    os_id: 33, os_numero: 'OS-0033',
  },
  {
    id: 313, numero: 'PC-2026-313', fornecedor_nome: 'Parafusos Sul', fornecedor_cnpj: '22.222.222/0001-22',
    quantidade_pedida: 8, quantidade_recebida: 0, saldo_pendente: 8, situacao_recebimento: 'ABERTO',
    os_id: null, os_numero: null,
  },
];
const linha = (id) => ({
  id, material_id: 9, material_nome: 'Parafuso M8', material_codigo: 'ALM-0100', codigo: 'ALM-0100',
  unidade: 'PC', quantidade: 10, quantidade_recebida: 0, saldo_pendente: 10, saldo_pendente_material: 10,
});
const MATERIAIS = [{ id: 5, codigo: 'ALM-0033', nome: 'Chapa Aco 3mm', unidade: 'KG' }];

let container; let root; let falharOs;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  falharOs = false;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: RECEBIMENTOS });
    if (url === '/almoxarifado/recebimentos/41') return Promise.resolve({ data: DETALHE_41 });
    if (/^\/almoxarifado\/recebimentos\/\d+$/.test(url)) return Promise.reject(new Error('sem detalhe'));
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/aux/ordens-servico') {
      if (falharOs) return Promise.reject(new Error('rede caiu'));
      return Promise.resolve({ data: OS_ABERTAS });
    }
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: PEDIDOS });
    if (/^\/almoxarifado\/recebimentos-aux\/pedidos-compra\/\d+\/itens$/.test(url)) {
      return Promise.resolve({ data: [linha(Number(url.split('/')[4]) * 10)] });
    }
    if (/^\/almoxarifado\/recebimentos-aux\/pedidos-compra\/\d+$/.test(url)) return Promise.reject(new Error('sem doc'));
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation(() => Promise.resolve({ data: { id: 91, numero: 'REC-2026-091' } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter><RecebimentosAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
async function selecionar(select, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await esperarEfeitos();
}
async function digitar(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await esperarEfeitos();
}
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));
const selectPorLabel = (texto) => [...container.querySelectorAll('.almox-field')]
  .find((d) => d.querySelector('label')?.textContent.includes(texto))
  ?.querySelector('select');
const campoOs = () => container.querySelector('[data-testid="receb-os"]');
const opcoes = (sel) => [...sel.querySelectorAll('option')].map((o) => [o.value, o.textContent.trim()]);
const chamadasOs = () => api.get.mock.calls.filter(([url]) => url === '/almoxarifado/aux/ordens-servico');

async function abrirNovo() { await clicar(botaoPorTexto('Novo Recebimento')); }
async function adicionarMaterial() {
  await digitar(container.querySelector('input[placeholder="Buscar material..."]'), 'Chapa');
  await clicar(botaoPorTexto('ALM-0033'));
}
async function registrar() {
  await clicar(botaoPorTexto('Registrar Recebimento'));
}

test('(a) abrir o novo recebimento carrega as OS ABERTAS (abertas=1) e o select mostra "Sem OS" + numero e cliente', async () => {
  await renderizar();
  expect(chamadasOs()).toHaveLength(0);              // so ao abrir o modal (a lista envelhece)
  await abrirNovo();
  expect(chamadasOs()).toHaveLength(1);
  expect(chamadasOs()[0][1]).toEqual({ params: { abertas: 1 } });
  const sel = campoOs();
  expect(sel).not.toBeNull();
  expect(sel.disabled).toBe(false);
  expect(opcoes(sel)).toEqual([
    ['', 'Sem OS'],
    ['7', 'OS-0007 — Cliente Alfa'],
    ['12', 'OS-0012'],                                // sem cliente: so o numero
  ]);
});

test('(b) sem pedido: escolher a OS manda os_id NUMERICO; "Sem OS" manda null', async () => {
  await renderizar();
  await abrirNovo();
  await adicionarMaterial();
  await selecionar(campoOs(), '7');
  await registrar();
  expect(api.post).toHaveBeenCalledTimes(1);
  const [url, payload] = api.post.mock.calls[0];
  expect(url).toBe('/almoxarifado/recebimentos');
  expect(payload.os_id).toBe(7);                     // numero, nao '7'
  expect(payload.pedido_compra_id).toBeNull();

  // segundo recebimento, sem OS
  await abrirNovo();
  await adicionarMaterial();
  expect(campoOs().value).toBe('');                  // o form limpo volta para "Sem OS"
  await registrar();
  expect(api.post).toHaveBeenCalledTimes(2);
  expect(api.post.mock.calls[1][1]).toHaveProperty('os_id', null);
});

test('(c) com pedido: o campo mostra a OS do pedido, fica TRAVADO e o payload nao manda os_id', async () => {
  await renderizar();
  await abrirNovo();
  await selecionar(selectPorLabel('Forma de recebimento'), 'PEDIDO_COMPRA');
  await selecionar(selectPorLabel('Número do Pedido de Compra'), '312');
  const sel = campoOs();
  expect(sel.disabled).toBe(true);
  expect(sel.value).toBe('33');
  expect(sel.options[sel.selectedIndex].textContent).toBe('OS-0033');
  await registrar();
  expect(api.post).toHaveBeenCalledTimes(1);
  const payload = api.post.mock.calls[0][1];
  expect(payload.pedido_compra_id).toBe('312');
  expect(payload).not.toHaveProperty('os_id');        // o servidor herda a OS viva do pedido (C1)
});

test('(d) com pedido SEM OS: o campo trava em "Sem OS"; voltar para a nota destrava', async () => {
  await renderizar();
  await abrirNovo();
  await selecionar(selectPorLabel('Forma de recebimento'), 'PEDIDO_COMPRA');
  await selecionar(selectPorLabel('Número do Pedido de Compra'), '313');
  expect(campoOs().disabled).toBe(true);
  expect(campoOs().options[campoOs().selectedIndex].textContent).toBe('Sem OS');
  await selecionar(selectPorLabel('Forma de recebimento'), 'NOTA_FISCAL');
  expect(campoOs().disabled).toBe(false);
  expect(campoOs().value).toBe('');
});

test('(e) a recusa literal do servidor (RN-176.04) aparece no formulario, que nao e limpo', async () => {
  const literal = 'Material ALM-0033 pertence ao cliente Cliente Beta, mas a OS OS-0007 é do cliente Cliente Alfa';
  api.post.mockImplementation(() => {
    const err = new Error('Request failed with status code 400');
    err.response = { status: 400, data: { error: literal } };
    return Promise.reject(err);
  });
  await renderizar();
  await abrirNovo();
  await adicionarMaterial();
  await selecionar(campoOs(), '7');
  await registrar();
  const alerta = container.querySelector('.almox-modal [role="alert"]');
  expect(alerta).not.toBeNull();
  expect(alerta.textContent).toBe(literal);
  expect(campoOs().value).toBe('7');
});

test('(f) a lista mostra a coluna OS (os_numero ou —) e o detalhe mostra a OS', async () => {
  await renderizar();
  const ths = [...container.querySelectorAll('.almox-table th')].map((t) => t.textContent);
  expect(ths).toContain('OS');
  expect(container.querySelectorAll('.almox-table tbody tr')).toHaveLength(2);
  expect(container.querySelector('[data-testid="receb-lista-os-41"]').textContent).toBe('OS-0007');
  expect(container.querySelector('[data-testid="receb-lista-os-58"]').textContent).toBe('—');
  await clicar(container.querySelector('.almox-table tbody tr'));
  const det = container.querySelector('[data-testid="receb-detalhe-os"]');
  expect(det).not.toBeNull();
  expect(det.textContent).toBe('OSOS-0007');
});

test('(g) a lista de OS falha: aviso discreto e o recebimento sai sem OS', async () => {
  falharOs = true;
  await renderizar();
  await abrirNovo();
  expect(container.querySelector('[data-testid="receb-os-erro"]').textContent)
    .toContain('Não foi possível carregar as OS abertas');
  expect(opcoes(campoOs())).toEqual([['', 'Sem OS']]);
  await adicionarMaterial();
  await registrar();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][1]).toHaveProperty('os_id', null);
});

test('(h) escolher a OS 7 sem pedido, trocar para pedido e voltar para a nota: a OS volta para "Sem OS" e o payload manda null', async () => {
  await renderizar();
  await abrirNovo();
  await selecionar(campoOs(), '7');
  expect(campoOs().value).toBe('7');                 // premissa: a OS foi escolhida
  await selecionar(selectPorLabel('Forma de recebimento'), 'PEDIDO_COMPRA');
  await selecionar(selectPorLabel('Forma de recebimento'), 'NOTA_FISCAL');
  expect(campoOs().disabled).toBe(false);
  expect(campoOs().value).toBe('');                  // a troca de forma limpa a OS escolhida (nao reaparece a 7)
  await adicionarMaterial();
  await registrar();
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post.mock.calls[0][1]).toHaveProperty('os_id', null);
});
