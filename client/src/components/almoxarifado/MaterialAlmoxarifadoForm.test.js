/**
 * Seção "Propriedade" do cadastro de material (Etapa 8, Task 5 — decisão 8 do design).
 *
 * É AQUI que o material de cliente nasce: não existe tela separada de "material de cliente", ele
 * é material normal com dono (`proprietario_cliente_id`). O que este teste prende:
 *
 *  1. `proprietario_cliente_id` é NÚMERO ou null, nunca uma flag. O padrão `=== 1` / `!!valor`
 *     usado nos checkboxes de controle deste mesmo formulário NÃO vale aqui — e o teste usa de
 *     propósito um cliente de id 1 na edição, que é exatamente o valor onde a confusão passaria
 *     despercebida.
 *  2. O payload manda `null` explícito, nunca `''`, quando o usuário escolhe "GMP (estoque
 *     próprio)". `''` cai no ramo "ausente" da coerção do servidor (numFromForm) e o PUT
 *     PRESERVARIA o dono antigo — ou seja, tirar o dono de um material não funcionaria, em
 *     silêncio, que é o oposto do que o usuário pediu.
 *
 * As duas metades andam juntas: só provar que escolher um cliente manda o número aprovaria uma
 * implementação que nunca consegue limpar o dono.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MaterialAlmoxarifadoForm --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import MaterialAlmoxarifadoForm from './MaterialAlmoxarifadoForm';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', role: 'admin', is_superadmin: 1 } }),
}));

const FAMILIA = { id: 5, codigo: 'CHP', nome: 'Chapas', parent_id: null, ativo: 1 };
// Cliente de id 1 de propósito: é o valor que uma comparação `=== 1` (o padrão das flags deste
// formulário) trataria como "ligado" e faria o select cair no ramo errado.
const CLIENTE_UM = { id: 1, razao_social: 'Cliente Alfa LTDA', nome_fantasia: 'Alfa' };
const CLIENTE_DOIS = { id: 2, razao_social: 'Cliente Beta SA', nome_fantasia: 'Beta' };

const MATERIAL_DO_CLIENTE = {
  id: 77, codigo: 'CHP-002', nome: 'Chapa 3mm do cliente', familia_id: 5,
  unidade: 'PC', categoria: 'CONSUMÍVEL', quantidade_atual: 10,
  proprietario_cliente_id: 1,
};

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/clientes') return Promise.resolve({ data: [CLIENTE_UM, CLIENTE_DOIS] });
    if (url === '/almoxarifado/familias') return Promise.resolve({ data: [FAMILIA] });
    if (url === '/almoxarifado/proximo-codigo') return Promise.resolve({ data: { codigo: 'CHP-999' } });
    if (url.startsWith('/almoxarifado/materiais/')) return Promise.resolve({ data: MATERIAL_DO_CLIENTE });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 99 } });
  api.put.mockResolvedValue({ data: { id: 77 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function esperarEfeitos() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function renderizarNovo() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/materiais/novo?familia_id=5']}>
        <Routes><Route path="/almoxarifado/materiais/novo" element={<MaterialAlmoxarifadoForm />} /></Routes>
      </MemoryRouter>,
    );
  });
  await esperarEfeitos();
}

async function renderizarEdicao() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/materiais/77/editar']}>
        <Routes><Route path="/almoxarifado/materiais/:id/editar" element={<MaterialAlmoxarifadoForm />} /></Routes>
      </MemoryRouter>,
    );
  });
  await esperarEfeitos();
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

const proprietario = () => container.querySelector('#material-proprietario');

async function submeter() {
  const form = container.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

async function preencherObrigatorios() {
  preencher(container.querySelector('input[placeholder="PAR-001"]'), 'CHP-100');
  preencher(container.querySelector('input[placeholder="Nome completo do material"]'), 'Chapa 3mm');
}

describe('MaterialAlmoxarifadoForm — seção Propriedade', () => {
  test('a seção existe, o default é GMP e os clientes carregados viram opções', async () => {
    await renderizarNovo();
    expect(container.textContent).toContain('Propriedade');
    const select = proprietario();
    expect(select).not.toBeNull();
    expect(select.value).toBe('');
    const opcoes = [...select.querySelectorAll('option')].map((o) => o.textContent);
    expect(opcoes[0]).toContain('GMP');
    expect(opcoes).toContain('Cliente Alfa LTDA');
    expect(opcoes).toContain('Cliente Beta SA');
  });

  test('sem escolher dono, o payload manda null explicito (nunca string vazia)', async () => {
    await renderizarNovo();
    await preencherObrigatorios();
    await submeter();
    expect(api.post).toHaveBeenCalled();
    const payload = api.post.mock.calls[0][1];
    expect(payload.proprietario_cliente_id).toBeNull();
    expect(payload.proprietario_cliente_id).not.toBe('');
  });

  test('escolhido um cliente, o payload manda o id como NUMERO', async () => {
    await renderizarNovo();
    await preencherObrigatorios();
    preencher(proprietario(), '2');
    await submeter();
    const payload = api.post.mock.calls[0][1];
    expect(payload.proprietario_cliente_id).toBe(2);
  });

  test('a falha ao carregar /clientes nao quebra o cadastro — sobra so a opcao GMP', async () => {
    // /clientes e rota core, fora do modulo: quem nao tem acesso a Clientes ainda precisa
    // conseguir cadastrar material proprio.
    api.get.mockImplementation((url) => {
      if (url === '/clientes') return Promise.reject(new Error('403'));
      if (url === '/almoxarifado/familias') return Promise.resolve({ data: [FAMILIA] });
      if (url === '/almoxarifado/proximo-codigo') return Promise.resolve({ data: { codigo: 'CHP-999' } });
      return Promise.resolve({ data: [] });
    });
    await renderizarNovo();
    expect([...proprietario().querySelectorAll('option')]).toHaveLength(1);
    await preencherObrigatorios();
    await submeter();
    expect(api.post).toHaveBeenCalled();
  });
});

describe('MaterialAlmoxarifadoForm — edição de material com dono', () => {
  test('o select carrega o cliente do material (id 1 nao vira booleano)', async () => {
    await renderizarEdicao();
    expect(proprietario().value).toBe('1');
  });

  test('trocar para GMP manda null explicito no PUT — e o que LIMPA o dono', async () => {
    // Com '' em vez de null, o servidor trata a chave como ausente (numFromForm) e PRESERVA o
    // dono antigo: o material continuaria sendo do cliente, sem nenhum erro na tela.
    await renderizarEdicao();
    preencher(proprietario(), '');
    await submeter();
    expect(api.put).toHaveBeenCalled();
    expect(api.put.mock.calls[0][1].proprietario_cliente_id).toBeNull();
  });

  test('trocar de cliente manda o novo id no PUT', async () => {
    await renderizarEdicao();
    preencher(proprietario(), '2');
    await submeter();
    expect(api.put.mock.calls[0][1].proprietario_cliente_id).toBe(2);
  });
});
