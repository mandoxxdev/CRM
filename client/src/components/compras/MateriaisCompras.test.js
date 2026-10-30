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
 * Etapa 193 (RN-193.01..05): o cadastro passou a ser SÓ do Compras. O Compras ganhou foto, Proprietário (lista mínima
 * `/compras/materiais/aux/clientes`) e Inativar/Reativar (os testes do Inativar/Reativar que eram da lista do Almoxarifado,
 * Etapa 113, vieram para cá com as URLs do Compras); o Almoxarifado ficou com a ficha "Ver" (só leitura) e os caminhos antigos
 * de novo/editar levam à lista e à ficha.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/compras/MateriaisCompras --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import MateriaisCompras, { AVISO_SEM_ACESSO } from './MateriaisCompras';
import MaterialAlmoxarifadoForm from '../almoxarifado/MaterialAlmoxarifadoForm';
import { ROTAS_COMPRAS, AVISO_CADASTRO_NO_COMPRAS } from '../almoxarifado/rotasCadastroMaterial';
import { MaterialVer, EditarMaterialVirouVer, NovoMaterialVirouLista } from '../almoxarifado/MaterialSoConsulta';
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
const CLIENTES = [{ id: 12, razao_social: 'CLIENTE X LTDA' }, { id: 13, razao_social: 'CLIENTE Y SA' }];

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
    if (url === '/compras/materiais/aux/clientes') return Promise.resolve({ data: CLIENTES });
    if (url === '/almoxarifado/materiais/77') return Promise.resolve({ data: MATERIAL });
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
          <Route path="/almoxarifado/materiais" element={<div data-testid="lista-almox" />} />
          <Route path="/almoxarifado/materiais/ver/:id" element={<MaterialVer />} />
          <Route path="/almoxarifado/materiais/novo" element={<NovoMaterialVirouLista />} />
          <Route path="/almoxarifado/materiais/editar/:id" element={<EditarMaterialVirouVer />} />
        </Routes>
      </MemoryRouter>,
    );
  });
  await esperar();
}

const urlsChamadas = () => [...api.get.mock.calls, ...api.post.mock.calls, ...api.put.mock.calls, ...api.delete.mock.calls]
  .map((c) => c[0]);
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
    // RN-192.11: o aviso diz o caminho de quem administra o Compras. RN-193.03: e não cita mais os perfis do Almoxarifado.
    expect(AVISO_SEM_ACESSO).toContain('administrador do módulo Compras');
    expect(AVISO_SEM_ACESSO).not.toMatch(/Almoxarife|Engenharia|Almoxarifado/);
  });

  test('RN-192.11: o administrador do Compras (perfil de almoxarifado PRODUCAO) vê a lista e o Novo', async () => {
    mockarGets({ perfil: 'PRODUCAO', acoes: { criar_material: true, editar_material: true } });
    await renderizar('/compras/materiais');
    expect(container.textContent).toContain('VLV-001');
    expect(container.querySelector('a[href="/compras/materiais/novo"]')).not.toBeNull();
  });
});

describe('Compras → Materiais — o formulário do Almoxarifado pelas portas do Compras', () => {
  test('novo: com foto (RN-193.04) e sem saldo inicial; o POST vai ao Compras sem quantidade_atual e volta para a lista do Compras', async () => {
    await renderizar('/compras/materiais/novo');
    expect(container.textContent).toContain('Foto do Produto');
    expect(container.querySelector('input[type="file"]')).not.toBeNull();
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

  test('editar (RN-193.04): escolher a foto envia pela porta do Compras', async () => {
    api.post.mockResolvedValue({ data: { foto: 'f.png', foto_url: '/api/uploads/almoxarifado/f.png' } });
    await renderizar('/compras/materiais/editar/77');
    const input = container.querySelector('input[type="file"]');
    const arquivo = new File(['x'], 'f.png', { type: 'image/png' });
    Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
    await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
    await esperar();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][0]).toBe('/compras/materiais/cadastro/77/foto');
    expect(urlsDoAlmoxarifado()).toEqual([]);
  });

  // Etapa 193 (RN-193.05): o dono so se define no cadastro (a sobra e a remessa copiam o da origem), e o cadastro e so do
  // Compras — o seletor voltou, com a lista minima da porta do Compras. `GET /clientes` (que exige Comercial/Almoxarifado/
  // Operacional, a razao da X6) continua sem ser pedido.
  test('editar (RN-193.05): o Proprietário é um seletor com a lista do Compras; não pede /clientes; o PUT leva o dono', async () => {
    const comDono = { ...MATERIAL, proprietario_cliente_id: 12, proprietario_cliente_nome: 'CLIENTE X LTDA' };
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => {
      if (url === '/compras/materiais/cadastro/77') return Promise.resolve({ data: comDono });
      if (url === '/clientes') return Promise.reject({ response: { status: 403, data: { error: 'Acesso negado ao módulo' } } });
      return base(url, cfg);
    });
    await renderizar('/compras/materiais/editar/77');
    expect(urlsChamadas()).not.toContain('/clientes');
    expect(urlsChamadas()).toContain('/compras/materiais/aux/clientes');
    const seletor = container.querySelector('#material-proprietario');
    expect(seletor).not.toBeNull();
    expect([...seletor.options].map((o) => o.textContent)).toEqual(['GMP (estoque próprio)', 'CLIENTE X LTDA', 'CLIENTE Y SA']);
    expect(seletor.value).toBe('12');
    preencher(seletor, '13');
    await submeter();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][1].proprietario_cliente_id).toBe(13);
    expect(container.textContent).not.toContain('O proprietário é definido no Almoxarifado.');
  });

  test('novo (RN-193.05): o seletor começa em "GMP (estoque próprio)" e não pede /clientes', async () => {
    await renderizar('/compras/materiais/novo');
    expect(container.querySelector('#material-proprietario').value).toBe('');
    expect(urlsChamadas()).not.toContain('/clientes');
  });
});

// Etapa 193 (RN-193.04): Inativar e Reativar vieram da lista do Almoxarifado (Etapa 113, RN-07/RN-08 e Fase 5) para a lista do
// Compras, com as mesmas mensagens e o mesmo comportamento — so as URLs mudaram (DELETE e PUT da porta do Compras).
describe('Compras → Materiais — Inativar e Reativar (RN-193.04)', () => {
  const { toast } = require('react-toastify');
  const INATIVO = { ...MATERIAL, id: 21, codigo: 'INA-001', nome: 'Valvula inativa', ativo: 0 };
  const INATIVO_NULL = { ...MATERIAL, id: 22, codigo: 'INA-002', nome: 'Valvula legado', ativo: null };
  const E1 = 'Não é possível inativar o material VLV-001: o saldo físico é 4. Material inativo não pode ser movimentado, '
    + 'então esse saldo ficaria preso. Antes de inativar, zere o saldo com uma Saída ou um Ajuste.';
  const FAMILIA_INATIVA = 'Família inativa — não é possível vincular novos itens';
  let confirmOriginal;
  beforeEach(() => {
    confirmOriginal = window.confirm; window.confirm = jest.fn(() => true);
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => {
      if (url === '/compras/materiais/cadastro' && cfg?.params?.status === 'inativo') {
        return Promise.resolve({ data: [INATIVO, INATIVO_NULL] });
      }
      return base(url, cfg);
    });
  });
  afterEach(() => { window.confirm = confirmOriginal; });
  const listas = () => api.get.mock.calls.filter(([u]) => u === '/compras/materiais/cadastro').length;
  const filtrarInativos = async () => {
    const select = container.querySelector('[data-testid="filtro-situacao"]');
    expect([...select.options].map((o) => [o.value, o.textContent])).toEqual([['', 'Ativos'], ['inativo', 'Inativos']]);
    preencher(select, 'inativo');
    await esperar();
  };
  const clicar = async (testid) => {
    const b = container.querySelector(`[data-testid="${testid}"]`);
    expect(b).not.toBeNull();
    await act(async () => { b.click(); });
    await esperar();
  };

  test('o filtro "Inativos" manda status=inativo; a linha inativa (0 e NULL) tem Reativar e não Inativar; a ativa ao contrário', async () => {
    await renderizar('/compras/materiais');
    expect(container.querySelector('[data-testid="inativar-material-77"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="reativar-material-77"]')).toBeNull();
    await filtrarInativos();
    const chamadas = api.get.mock.calls.filter(([u]) => u === '/compras/materiais/cadastro');
    expect(chamadas[chamadas.length - 1][1]).toEqual({ params: { status: 'inativo' } });
    for (const id of [21, 22]) {
      expect(container.querySelector(`[data-testid="reativar-material-${id}"]`)).not.toBeNull();
      expect(container.querySelector(`[data-testid="inativar-material-${id}"]`)).toBeNull();
    }
  });

  test('Inativar: DELETE da porta do Compras, "Material inativado" e recarrega a lista', async () => {
    api.delete.mockResolvedValue({ data: { success: true } });
    await renderizar('/compras/materiais');
    const antes = listas();
    await clicar('inativar-material-77');
    expect(window.confirm).toHaveBeenCalledWith('Inativar o material "Valvula gaveta"?');
    expect(api.delete).toHaveBeenCalledWith('/compras/materiais/cadastro/77');
    expect(toast.success).toHaveBeenCalledWith('Material inativado');
    expect(listas()).toBe(antes + 1);
    expect(urlsDoAlmoxarifado()).toEqual([]);
  });

  test('Inativar recusado (saldo): o toast mostra a mensagem do servidor, literal; sem mensagem, o texto genérico', async () => {
    api.delete.mockRejectedValueOnce({ response: { status: 400, data: { error: E1 } } });
    await renderizar('/compras/materiais');
    await clicar('inativar-material-77');
    expect(toast.error).toHaveBeenCalledWith(E1);
    expect(toast.success).not.toHaveBeenCalled();
    api.delete.mockRejectedValueOnce(new Error('Network Error'));
    await clicar('inativar-material-77');
    expect(toast.error).toHaveBeenLastCalledWith('Erro ao inativar material');
  });

  test('Reativar: PUT { ativo: 1 } da porta do Compras, "Material reativado" e recarrega', async () => {
    api.put.mockResolvedValue({ data: { id: 21, ativo: 1 } });
    await renderizar('/compras/materiais');
    await filtrarInativos();
    const antes = listas();
    await clicar('reativar-material-21');
    expect(window.confirm).toHaveBeenCalledWith('Reativar o material "Valvula inativa"?');
    expect(api.put).toHaveBeenCalledWith('/compras/materiais/cadastro/21', { ativo: 1 });
    expect(toast.success).toHaveBeenCalledWith('Material reativado');
    expect(listas()).toBe(antes + 1);
  });

  test('Reativar recusado (família inativa) mostra a mensagem; sem mensagem, "Erro ao reativar material"', async () => {
    api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: FAMILIA_INATIVA } } });
    await renderizar('/compras/materiais');
    await filtrarInativos();
    await clicar('reativar-material-22');
    expect(toast.error).toHaveBeenCalledWith(FAMILIA_INATIVA);
    api.put.mockRejectedValueOnce(new Error('Network Error'));
    await clicar('reativar-material-22');
    expect(toast.error).toHaveBeenLastCalledWith('Erro ao reativar material');
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('[controle] confirm cancelado: nem DELETE nem PUT', async () => {
    window.confirm = jest.fn(() => false);
    await renderizar('/compras/materiais');
    await clicar('inativar-material-77');
    await filtrarInativos();
    await clicar('reativar-material-21');
    expect(api.delete).not.toHaveBeenCalled();
    expect(api.put).not.toHaveBeenCalled();
  });
});

// Etapa 193 (RN-193.01): no Almoxarifado o formulário é só a ficha "Ver" — nada se edita nem se salva.
describe('Almoxarifado → Materiais: a ficha "Ver" e os caminhos antigos (RN-193.01)', () => {
  test('ver: tudo desligado, sem Salvar, sem envio de foto, com o aviso; o dono pelo nome, sem pedir /clientes', async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => {
      if (url === '/almoxarifado/materiais/77') {
        return Promise.resolve({ data: { ...MATERIAL, proprietario_cliente_id: 12, proprietario_cliente_nome: 'CLIENTE X LTDA' } });
      }
      return base(url, cfg);
    });
    await renderizar('/almoxarifado/materiais/ver/77');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais/77');
    expect(container.querySelector('[data-testid="material-somente-leitura"]').textContent).toBe(AVISO_CADASTRO_NO_COMPRAS);
    expect(container.querySelector('[data-testid="material-form-campos"]').disabled).toBe(true);
    expect(container.querySelector('input[placeholder="Nome completo do material"]').value).toBe('Valvula gaveta');
    expect(container.querySelector('button[type="submit"]')).toBeNull();
    expect(container.querySelector('input[type="file"]')).toBeNull();
    expect(container.textContent).not.toMatch(/Atualizar Material|Cadastrar Material|Editar Material/);
    expect(container.querySelector('[data-testid="material-proprietario-somente-leitura"]').textContent).toContain('CLIENTE X LTDA');
    expect(urlsChamadas()).not.toContain('/clientes');
    // Mesmo que o formulário seja submetido (Enter num campo), nada é gravado.
    await submeter();
    expect(api.put).not.toHaveBeenCalled();
    expect(api.post).not.toHaveBeenCalled();
  });

  test('favorito antigo /almoxarifado/materiais/editar/77 leva à ficha Ver do mesmo material', async () => {
    await renderizar('/almoxarifado/materiais/editar/77');
    expect(local.pathname).toBe('/almoxarifado/materiais/ver/77');
    expect(container.querySelector('[data-testid="material-somente-leitura"]')).not.toBeNull();
  });

  test('favorito antigo /almoxarifado/materiais/novo (com ?familia_id) leva à lista do Almoxarifado, sem formulário', async () => {
    await renderizar('/almoxarifado/materiais/novo?familia_id=5');
    expect(local.pathname).toBe('/almoxarifado/materiais');
    expect(container.querySelector('[data-testid="lista-almox"]')).not.toBeNull();
    expect(container.querySelector('form')).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
});
