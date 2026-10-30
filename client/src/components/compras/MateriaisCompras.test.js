/**
 * Etapa 192 (RN-192.10) — Compras → Materiais: a lista e o MESMO formulário do Almoxarifado, pelas portas do Compras.
 *
 * O que este teste prende:
 *  1. a tela do Compras só fala com `/compras/...` — nenhum GET/POST/PUT em `/almoxarifado/...` (o prefixo exige o módulo
 *     Almoxarifado, que o comprador pode não ter; um endereço esquecido daria 403 calado em produção);
 *  2. no Compras o formulário não mostra foto nem saldo inicial e não manda `quantidade_atual`; volta para /compras/materiais;
 *  3. sem permissão (minhas-permissoes do Compras), a lista não é pedida e a tela diz o que falta;
 *  4. o formulário do Almoxarifado continua nas rotas dele (o padrão de `rotas`).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/compras/MateriaisCompras --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import MateriaisCompras, { AVISO_SEM_ACESSO } from './MateriaisCompras';
import MaterialAlmoxarifadoForm from '../almoxarifado/MaterialAlmoxarifadoForm';
import { ROTAS_COMPRAS } from '../almoxarifado/rotasCadastroMaterial';
import { invalidarAlmoxPermissoes } from '../../hooks/useAlmoxPermissoes';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 9, nome: 'Comprador', role: 'usuario' } }),
}));

const FAMILIA = { id: 5, codigo: 'VLV', nome: 'Valvulas', parent_id: null, ativo: 1 };
const MATERIAL = { id: 77, codigo: 'VLV-001', nome: 'Valvula gaveta', familia_id: 5, familia_nome: 'Valvulas', unidade: 'PC',
  categoria: 'Valvulas', ncm: '8481.80.00', quantidade_atual: 4 };
const PODE = { perfil: 'ALMOXARIFE', acoes: { criar_material: true, editar_material: true } };
const NAO_PODE = { perfil: 'PRODUCAO', acoes: { criar_material: false, editar_material: false } };

let container;
let root;
let local;

function Onde() {
  local = useLocation();
  return null;
}

function mockarGets(permissoes) {
  api.get.mockImplementation((url) => {
    if (url === '/compras/materiais/aux/minhas-permissoes') return Promise.resolve({ data: permissoes });
    if (url === '/compras/materiais/cadastro') return Promise.resolve({ data: [MATERIAL] });
    if (url === '/compras/materiais/cadastro/77') return Promise.resolve({ data: MATERIAL });
    if (url === '/compras/materiais/aux/familias') return Promise.resolve({ data: [FAMILIA] });
    if (url === '/compras/materiais/aux/categorias') return Promise.resolve({ data: [{ id: 1, nome: 'Valvulas' }] });
    if (url === '/compras/materiais/aux/proximo-codigo') return Promise.resolve({ data: { codigo: 'VLV-002' } });
    if (url === '/almoxarifado/familias') return Promise.resolve({ data: [FAMILIA] });
    if (url === '/almoxarifado/categorias') return Promise.resolve({ data: [{ id: 1, nome: 'Valvulas' }] });
    return Promise.resolve({ data: [] });
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  invalidarAlmoxPermissoes();
  mockarGets(PODE);
  api.post.mockResolvedValue({ data: { id: 99 } });
  api.put.mockResolvedValue({ data: { id: 77 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
  jest.clearAllMocks();
});

async function esperar() {
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); await Promise.resolve(); });
  }
}

async function renderizar(caminho) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[caminho]}>
        <Onde />
        <Routes>
          <Route path="/compras/materiais" element={<MateriaisCompras />} />
          <Route path="/compras/materiais/novo" element={<MaterialAlmoxarifadoForm rotas={ROTAS_COMPRAS} />} />
          <Route path="/compras/materiais/editar/:id" element={<MaterialAlmoxarifadoForm rotas={ROTAS_COMPRAS} />} />
          <Route path="/almoxarifado/materiais/novo" element={<MaterialAlmoxarifadoForm />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await esperar();
}

const urlsChamadas = () => [...api.get.mock.calls, ...api.post.mock.calls, ...api.put.mock.calls].map((c) => c[0]);
const urlsDoAlmoxarifado = () => urlsChamadas().filter((u) => String(u).startsWith('/almoxarifado'));

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function submeter() {
  const form = container.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
}

describe('Compras → Materiais — a lista', () => {
  test('lista pela porta do Compras e o Editar abre o formulário do Compras', async () => {
    await renderizar('/compras/materiais');
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/cadastro', { params: {} });
    expect(container.textContent).toContain('VLV-001');
    expect(container.textContent).toContain('8481.80.00');
    expect(container.querySelector('a[href="/compras/materiais/novo"]')).not.toBeNull();
    await act(async () => { container.querySelector('[data-testid="editar-material-77"]').click(); });
    expect(local.pathname).toBe('/compras/materiais/editar/77');
    expect(urlsDoAlmoxarifado()).toEqual([]);
  });

  test('sem permissão: não pede a lista e diz o que falta', async () => {
    mockarGets(NAO_PODE);
    await renderizar('/compras/materiais');
    expect(container.querySelector('[data-testid="materiais-compras-sem-acesso"]').textContent).toContain(AVISO_SEM_ACESSO);
    expect(urlsChamadas()).not.toContain('/compras/materiais/cadastro');
    expect(container.querySelector('a[href="/compras/materiais/novo"]')).toBeNull();
    // RN-192.11: o aviso diz o caminho de quem administra o Compras.
    expect(AVISO_SEM_ACESSO).toContain('administrador do módulo Compras');
  });

  test('RN-192.11: o administrador do Compras (perfil de almoxarifado PRODUCAO) vê a lista e o Novo', async () => {
    mockarGets({ perfil: 'PRODUCAO', acoes: { criar_material: true, editar_material: true } });
    await renderizar('/compras/materiais');
    expect(container.textContent).toContain('VLV-001');
    expect(container.querySelector('a[href="/compras/materiais/novo"]')).not.toBeNull();
  });
});

describe('Compras → Materiais — o formulário do Almoxarifado pelas portas do Compras', () => {
  test('novo: sem foto e sem saldo inicial; o POST vai ao Compras sem quantidade_atual e volta para a lista do Compras', async () => {
    await renderizar('/compras/materiais/novo');
    expect(container.textContent).not.toContain('Foto do Produto');
    expect(container.textContent).not.toContain('Saldo Inicial');
    expect(container.textContent).toContain('Compras · Cadastro de Materiais');
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/aux/proximo-codigo', { params: {} });
    preencher(container.querySelector('input[placeholder="Nome completo do material"]'), 'Valvula esfera');
    const familia = [...container.querySelectorAll('select')].find((s) => s.textContent.includes('Selecione a família'));
    preencher(familia, '5');
    preencher(container.querySelector('#material-categoria'), 'Valvulas');
    await submeter();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/compras/materiais/cadastro');
    expect(payload).not.toHaveProperty('quantidade_atual');
    expect(local.pathname).toBe('/compras/materiais');
    expect(urlsDoAlmoxarifado()).toEqual([]);
  });

  test('editar: lê e grava pela porta do Compras', async () => {
    await renderizar('/compras/materiais/editar/77');
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/cadastro/77');
    await submeter();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][0]).toBe('/compras/materiais/cadastro/77');
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('ativo');
    expect(urlsDoAlmoxarifado()).toEqual([]);
  });

  // Fase 5 (X6): `GET /clientes` exige Comercial/Almoxarifado/Operacional — o comprador so com o Compras tomava erro no
  // seletor "Proprietário". No Compras o dono e so mostrado (o do cadastro), nao trocado, e a lista de clientes nao e pedida.
  test('editar (X6): o Proprietário é só leitura no Compras — não pede /clientes e o PUT não leva proprietario_cliente_id', async () => {
    const comDono = { ...MATERIAL, proprietario_cliente_id: 12, proprietario_cliente_nome: 'CLIENTE X LTDA' };
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => {
      if (url === '/compras/materiais/cadastro/77') return Promise.resolve({ data: comDono });
      if (url === '/clientes') return Promise.reject({ response: { status: 403, data: { error: 'Acesso negado ao módulo' } } });
      return base(url, cfg);
    });
    await renderizar('/compras/materiais/editar/77');
    expect(urlsChamadas()).not.toContain('/clientes');
    expect(container.querySelector('#material-proprietario')).toBeNull();
    const dono = container.querySelector('[data-testid="material-proprietario-somente-leitura"]');
    expect(dono.textContent).toContain('CLIENTE X LTDA');
    expect(container.textContent).toContain('O proprietário é definido no Almoxarifado.');
    await submeter();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][1]).not.toHaveProperty('proprietario_cliente_id');
  });

  test('novo (X6): sem dono, o Compras mostra "GMP (estoque próprio)" e não pede /clientes', async () => {
    await renderizar('/compras/materiais/novo');
    expect(container.querySelector('[data-testid="material-proprietario-somente-leitura"]').textContent)
      .toContain('GMP (estoque próprio)');
    expect(urlsChamadas()).not.toContain('/clientes');
  });

  test('no Almoxarifado o seletor Proprietário continua e pede /clientes', async () => {
    await renderizar('/almoxarifado/materiais/novo');
    expect(container.querySelector('#material-proprietario')).not.toBeNull();
    expect(urlsChamadas()).toContain('/clientes');
  });

  test('no Almoxarifado o formulário continua nas rotas dele, com foto e saldo inicial', async () => {
    await renderizar('/almoxarifado/materiais/novo');
    expect(container.textContent).toContain('Foto do Produto');
    expect(container.textContent).toContain('Saldo Inicial');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/familias');
    expect(urlsChamadas().filter((u) => String(u).startsWith('/compras'))).toEqual([]);
  });
});
