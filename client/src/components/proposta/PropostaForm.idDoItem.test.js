/**
 * Etapa 142 (RN-142.01, C298; Fase 2 C1): o formulário guarda o `id` de cada item gravado e o manda no salvar — é o que diz ao servidor
 * qual dos itens iguais o vendedor tirou. A Fase 0 tinha dito que o estado já guardava o `id`; não guardava (o carregamento monta o item
 * campo a campo). Este teste monta o formulário: GET com dois itens do mesmo produto → tira o PRIMEIRO → salvar → o corpo do PUT leva
 * só o segundo, com o id dele; o item incluído na tela vai sem `id`.
 *
 * O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PropostaForm from './PropostaForm';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'usuario', nome: 'Vend' }, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const item = (id, extra = {}) => ({
  id, proposta_id: 1, descricao: 'BOMBA P', quantidade: 1, unidade: 'UN', valor_unitario: 100, valor_total: 100,
  codigo_produto: 'P142', familia_produto: 'FAM', preco_tabela: 100, acessorios: '[]', ...extra,
});
const proposta = {
  id: 1, numero_proposta: 'P-1', cliente_id: 3, titulo: 'T', status: 'rascunho', margem_desconto: 0,
  valor_total: 200, responsavel_id: 7, itens: [item(11, { tag: 'A' }), item(12, { tag: 'B' })],
};

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    if (url === '/propostas/1') return Promise.resolve({ data: proposta });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { message: 'ok' } });
  api.post.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

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
const botoesRemoverItem = () => [...container.querySelectorAll('button[aria-label="Remover item"]')];
async function salvar() {
  await act(async () => {
    container.querySelector('#proposta-form-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  for (let k = 0; k < 5; k++) await act(async () => { await Promise.resolve(); });
  const chamada = api.put.mock.calls.find(([url]) => url === '/propostas/1');
  expect(chamada).toBeTruthy();
  return JSON.parse(JSON.stringify(chamada[1]));
}

test('[RN-142.01] salvar sem mexer: cada item vai com o id gravado', async () => {
  await montar();
  expect(botoesRemoverItem()).toHaveLength(2);
  const corpo = await salvar();
  expect(corpo.itens.map((i) => i.id)).toEqual([11, 12]);
});

test('[RN-142.01] C298: tirar o PRIMEIRO de dois iguais -> o corpo leva só o segundo, com o id 12', async () => {
  await montar();
  await act(async () => { botoesRemoverItem()[0].click(); });
  expect(botoesRemoverItem()).toHaveLength(1);
  const corpo = await salvar();
  expect(corpo.itens).toHaveLength(1);
  expect(corpo.itens[0]).toMatchObject({ id: 12, codigo_produto: 'P142' });
});

// Fase 5 (r3 S42): o item incluído pelo catálogo nasce sem `id` — o id do PRODUTO não pode ir como id de item gravado (com o mesmo
// número de um item gravado do mesmo produto, o item novo "roubaria" o par dele no servidor).
test('[RN-142.01] o item do catálogo vai sem id, mesmo com o id do produto igual ao de um item gravado', async () => {
  // eslint-disable-next-line global-require
  const { produtoParaItem } = require('./PropostaForm');
  const novo = produtoParaItem({ id: 11, codigo: 'P142', nome: 'BOMBA P', preco_base: 100 });
  expect(Object.prototype.hasOwnProperty.call(novo, 'id')).toBe(false);
  expect(novo).toMatchObject({ codigo_produto: 'P142', descricao: 'BOMBA P' });
});
