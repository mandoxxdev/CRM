/**
 * Preço do item do catálogo editável (pedido do Comercial, 24/11/2026: "na parte de preço ele já puxa do cadastro, ok! Porém devo
 * poder mudar manualmente"). Baixar abaixo da tabela é desconto do item e segue a regra de aprovação da proposta (acima de 5%:
 * rascunho + Aprovações). O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PropostaForm, { descontoDoItem, reaisPorUnidade } from './PropostaForm';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'usuario', nome: 'Vend' }, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const proposta = {
  id: 1, numero_proposta: 'P-1', cliente_id: 3, titulo: 'T', status: 'enviada', margem_desconto: 0, valor_total: 1000, responsavel_id: 7,
  itens: [{ id: 11, proposta_id: 1, descricao: 'PROJETO CONCEITUAL', quantidade: 1, unidade: 'UN', valor_unitario: 1000, valor_total: 1000,
    codigo_produto: '110-01-PCT-01', familia_produto: 'PROJETO CONCEITUAL - TINTAS', preco_tabela: 1000, acessorios: '[]' }],
};

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url) => (url === '/propostas/1' ? Promise.resolve({ data: proposta }) : Promise.resolve({ data: [] })));
  api.put.mockResolvedValue({ data: { message: 'ok' } });
  api.post.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function montar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/comercial/propostas/editar/1']}>
        <Routes>
          <Route path="/comercial/propostas/editar/:id" element={<PropostaForm />} />
          <Route path="/comercial/propostas" element={<div>lista</div>} />
        </Routes>
      </MemoryRouter>
    );
  });
  for (let k = 0; k < 5; k++) await act(async () => { await Promise.resolve(); });
}
const campoPreco = () => container.querySelector('input[aria-label="Valor unitário"]');
async function digitarPreco(v) {
  const el = campoPreco();
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(el, String(v));
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function salvar() {
  await act(async () => {
    container.querySelector('#proposta-form-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  for (let k = 0; k < 6; k++) await act(async () => { await Promise.resolve(); });
  return api.put.mock.calls.find(([url]) => url === '/propostas/1')[1];
}

test('o item do catalogo tem o preco EDITAVEL, com a tabela de referencia', async () => {
  await montar();
  expect(campoPreco()).not.toBeNull();
  expect(campoPreco().value).toBe('1.000,00');
  expect(container.textContent).toContain('Tabela:');
});

test('subir o preco: grava o valor novo, sem desconto e sem mexer no status', async () => {
  await montar();
  await digitarPreco('1.500,00');
  const corpo = await salvar();
  expect(Number(corpo.itens[0].valor_unitario)).toBe(1500);
  expect(corpo.itens[0]).toMatchObject({ valor_total: 1500, desconto_percentual: 0 });
  expect(corpo.margem_desconto).toBe(0);
  expect(api.post.mock.calls.some(([url]) => url === '/aprovacoes')).toBe(false);
});

test('baixar ate 5% da tabela: grava, desconto do item registrado, sem aprovacao', async () => {
  await montar();
  await digitarPreco('960,00');
  const corpo = await salvar();
  expect(Number(corpo.itens[0].valor_unitario)).toBe(960);
  expect(corpo.itens[0].desconto_percentual).toBe(4);
  expect(api.post.mock.calls.some(([url]) => url === '/aprovacoes')).toBe(false);
});

test('baixar mais de 5% da tabela: pede aprovacao — nao passa por fora da regra — e NAO vira desconto geral (sem desconto duplo)', async () => {
  proposta.status = 'rascunho';
  await montar();
  await digitarPreco('800,00');
  expect(container.textContent).toContain('exige aprovação');
  const corpo = await salvar();
  expect(Number(corpo.itens[0].valor_unitario)).toBe(800);
  expect(corpo.itens[0].desconto_percentual).toBe(20);
  expect(corpo.margem_desconto).toBe(0); // o documento NAO desconta de novo sobre o total
  expect(corpo.status).toBe('rascunho');
  expect(api.post.mock.calls.some(([url]) => url === '/aprovacoes')).toBe(true);
  proposta.status = 'enviada';
});

test('descontoDoItem: so item do catalogo abaixo da tabela; tabela zero (servico) nunca e desconto', () => {
  expect(descontoDoItem({ manual: false, preco_tabela: 100, valor_unitario: 90 })).toBe(10);
  expect(descontoDoItem({ manual: false, preco_tabela: 100, valor_unitario: 120 })).toBe(0);
  expect(descontoDoItem({ manual: false, preco_tabela: 0, valor_unitario: 139870 })).toBe(0);
  expect(descontoDoItem({ manual: true, preco_tabela: 100, valor_unitario: 1 })).toBe(0);
});

// 25/11/2026 (print "Valor Total dos Servicos US$ 0,00"): ao REABRIR a proposta o item do catalogo voltava ao preco de tabela e o
// valor digitado sumia — no Projeto Conceitual (tabela 0) o salvar seguinte gravava 0 e o documento saia zerado. Os testes acima
// digitam e salvam na mesma abertura; estes reabrem o que foi gravado.
test('reabrir: o valor digitado num item de tabela ZERO (servico) continua o digitado, e salvar sem mexer grava o mesmo', async () => {
  const antes = proposta.itens[0];
  proposta.itens[0] = { ...antes, valor_unitario: 23550, valor_total: 23550, preco_tabela: 0 };
  await montar();
  expect(campoPreco().value).toBe('23.550,00');
  const corpo = await salvar();
  expect(Number(corpo.itens[0].valor_unitario)).toBe(23550);
  expect(corpo.itens[0].valor_total).toBe(23550);
  expect(corpo.valor_total).toBe(23550);
  proposta.itens[0] = antes;
});

test('reabrir: o valor baixado abaixo da tabela continua o baixado, com o desconto do item', async () => {
  const antes = proposta.itens[0];
  proposta.itens[0] = { ...antes, valor_unitario: 960, valor_total: 960, preco_tabela: 1000 };
  await montar();
  expect(campoPreco().value).toBe('960,00');
  const corpo = await salvar();
  expect(Number(corpo.itens[0].valor_unitario)).toBe(960);
  expect(corpo.itens[0].desconto_percentual).toBe(4);
  proposta.itens[0] = antes;
});

test('reabrir: item de catalogo SEM valor gravado ainda usa a tabela (proposta antiga)', async () => {
  const antes = proposta.itens[0];
  proposta.itens[0] = { ...antes, valor_unitario: null, valor_total: null, preco_tabela: 1000 };
  await montar();
  expect(campoPreco().value).toBe('1.000,00');
  proposta.itens[0] = antes;
});

// 25/11/2026: proposta em dolar — o cadastro mostrava R$ e comparava o valor em US$ com a tabela em reais ("76% abaixo").
test('em dolar: valores na moeda da proposta, tabela em reais com a conversao, e desconto contra a tabela convertida', async () => {
  const antes = { ...proposta };
  Object.assign(proposta, { moeda: 'USD', taxa_cambio: 5, status: 'rascunho' });
  proposta.itens = [{ ...antes.itens[0], valor_unitario: 190, valor_total: 190, preco_tabela: 1000 }];
  await montar();
  const texto = container.textContent.replace(/\u00a0/g, ' '); // o Intl separa US$ do numero com espaco fixo
  expect(texto).toContain('US$ 190,00');
  expect(texto).toContain('Tabela: R$ 1.000,00 (≈ US$ 200,00)');
  expect(texto).toContain('5,00% abaixo'); // 190 contra 200, nao contra 1000
  expect(texto).not.toContain('exige aprovação');
  const corpo = await salvar();
  expect(corpo.itens[0].desconto_percentual).toBe(5);
  expect(api.post.mock.calls.some(([url]) => url === '/aprovacoes')).toBe(false);
  Object.keys(proposta).forEach((k) => delete proposta[k]);
  Object.assign(proposta, antes);
});

test('reaisPorUnidade e descontoDoItem com cotacao: BRL e 1; sem cotacao nao compara', () => {
  expect(reaisPorUnidade('BRL', '')).toBe(1);
  expect(reaisPorUnidade('USD', '5,8573')).toBe(5.8573);
  expect(reaisPorUnidade('USD', '5.8573')).toBe(5.8573);
  expect(reaisPorUnidade('EUR', '')).toBeNull();
  expect(descontoDoItem({ manual: false, preco_tabela: 1000, valor_unitario: 150 }, 5)).toBe(25);
  expect(descontoDoItem({ manual: false, preco_tabela: 1000, valor_unitario: 150 }, null)).toBe(0);
});

// 25/11/2026 ("nao consigo digitar o valor aqui"): o campo era type="number" e, no Chrome em pt-BR, "23.550,00" virava 23,55 (o
// ponto lido como decimal). Agora e o campo de valor do resto do sistema (utils/moeda.js): os digitos entram pela direita.
test('o valor unitario aceita o formato brasileiro: 23.550,00 fica 23.550,00 (e so digitos entram como centavos)', async () => {
  await montar();
  expect(campoPreco().type).toBe('text');
  expect(campoPreco().value).toBe('1.000,00');
  await digitarPreco('23.550,00');
  expect(campoPreco().value).toBe('23.550,00');
  const corpo = await salvar();
  expect(Number(corpo.itens[0].valor_unitario)).toBe(23550);
  expect(corpo.itens[0].valor_total).toBe(23550);
});
