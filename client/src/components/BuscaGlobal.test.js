/**
 * Testes da Busca Global (atalho Ctrl+K).
 *
 * O mock de `services/api` reproduz o roteamento REAL do Express:
 *   - baseURL do axios ja e '/api' (ver client/src/services/api.js)
 *   - o servidor expoe a rota em '/api/busca-global' (server/index.js)
 * Logo, o componente precisa chamar api.get('/busca-global'). Qualquer outro
 * caminho cai no catch-all do Express e devolve 404, exatamente como em producao.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import BuscaGlobal from './BuscaGlobal';
import { identificarAtalho } from '../utils/atalhosTeclado';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

// Etapa 155 (RN-155.02): a busca le o usuario e o cache de permissoes (a regua da moldura). O padrao: um usuario com o Comercial e o cache
// quente; cada cenario troca. O hasModuleAccess e o REAL (so o cache e a leitura sao controlados).
let mockUser;
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));
jest.mock('../services/permissionsCache', () => ({
  ...jest.requireActual('../services/permissionsCache'),
  getCachedUserPermissions: jest.fn(),
  fetchUserPermissions: jest.fn(),
}));
// eslint-disable-next-line import/first
import { getCachedUserPermissions, fetchUserPermissions } from '../services/permissionsCache';
// eslint-disable-next-line import/first
import { FRASE_BUSCA_SEM_MODULO, FRASE_BUSCA_FALHOU, MODULOS_DA_BUSCA_GLOBAL, podeUsarBuscaGlobal } from '../utils/buscaGlobalAcesso';

const COM_COMERCIAL = { permissoes: [{ modulo: 'comercial', permissao: 1 }], grupos: [] };
const SO_ALMOXARIFADO = { permissoes: [{ modulo: 'almoxarifado', permissao: 1 }], grupos: [] };

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// Base de dados fake usada pela rota /api/busca-global do servidor.
const LINHAS_DO_SERVIDOR = [
  { id: 7, title: 'ACME Industria Ltda', subtitle: 'Sorocaba, SP', type: 'cliente' },
  { id: 12, title: 'Proposta #2026-045', subtitle: 'ACME Industria Ltda', type: 'proposta' },
];

/**
 * Emula a tabela de rotas do Express: so responde no caminho publicado.
 * Requisicoes fora da tabela recebem 404 (catch-all de server/index.js).
 */
function servidorFake(url, config) {
  if (url === '/busca-global') {
    const q = (config && config.params && config.params.q) || '';
    if (q.trim().length < 2) return Promise.resolve({ data: [] });
    const termo = q.toLowerCase();
    return Promise.resolve({
      data: LINHAS_DO_SERVIDOR.filter(
        (r) => r.title.toLowerCase().includes(termo) || r.subtitle.toLowerCase().includes(termo)
      ),
    });
  }
  const erro = new Error(`Request failed with status code 404 (${url})`);
  erro.response = { status: 404 };
  return Promise.reject(erro);
}

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.useFakeTimers();
  jest.clearAllMocks();
  api.get.mockImplementation(servidorFake);
  mockUser = { id: 1, role: 'usuario' };
  getCachedUserPermissions.mockReturnValue(COM_COMERCIAL);
  fetchUserPermissions.mockResolvedValue(COM_COMERCIAL);
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.useRealTimers();
});

function montar(props = {}) {
  const isOpen = props.isOpen === undefined ? true : props.isOpen;
  act(() => {
    root.render(
      <MemoryRouter>
        <BuscaGlobal isOpen={isOpen} onClose={props.onClose || jest.fn()} />
      </MemoryRouter>
    );
  });
}

function digitar(texto) {
  const input = container.querySelector('.busca-global-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, texto);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  // vence o debounce de 300ms e resolve a promise da busca
  act(() => {
    jest.advanceTimersByTime(400);
  });
  return act(async () => {
    await Promise.resolve();
  });
}

describe('Atalho Ctrl+K (identificarAtalho do Layout)', () => {
  it('reconhece Ctrl+K', () => {
    expect(identificarAtalho({ ctrlKey: true, key: 'k' })).toBe('busca');
  });

  it('reconhece Ctrl+K com Caps Lock ligado (e.key === "K")', () => {
    expect(identificarAtalho({ ctrlKey: true, key: 'K' })).toBe('busca');
  });

  it('reconhece Cmd+K no macOS', () => {
    expect(identificarAtalho({ metaKey: true, key: 'k' })).toBe('busca');
  });

  it('ignora a tecla K sem modificador (nao atrapalha a digitacao)', () => {
    expect(identificarAtalho({ key: 'k' })).toBeNull();
    expect(identificarAtalho({ shiftKey: true, key: 'K' })).toBeNull();
  });

  it('mantem os demais atalhos e ignora teclas desconhecidas', () => {
    expect(identificarAtalho({ ctrlKey: true, key: 'b' })).toBe('sidebar');
    expect(identificarAtalho({ key: 'F1' })).toBe('ajuda');
    expect(identificarAtalho({ ctrlKey: true, key: '/' })).toBe('ajuda');
    expect(identificarAtalho({ ctrlKey: true, key: 'z' })).toBeNull();
    expect(identificarAtalho(null)).toBeNull();
  });
});

describe('BuscaGlobal', () => {
  it('chama o endpoint sem duplicar o prefixo /api (baseURL do axios ja tem /api)', async () => {
    montar();
    await digitar('acme');

    expect(api.get).toHaveBeenCalled();
    const urlChamada = api.get.mock.calls[0][0];
    expect(urlChamada).toBe('/busca-global');
    // guarda explicita contra a regressao '/api/api/busca-global'
    expect(urlChamada.startsWith('/api/')).toBe(false);
  });

  it('exibe os resultados devolvidos pelo servidor', async () => {
    montar();
    await digitar('acme');

    const itens = container.querySelectorAll('.busca-global-result-item');
    expect(itens.length).toBe(2);
    expect(container.textContent).toContain('ACME Industria Ltda');
    expect(container.textContent).toContain('Proposta #2026-045');
    expect(container.textContent).not.toContain('Nenhum resultado encontrado');
  });

  it('navega para a rota correta ao clicar em um resultado', async () => {
    const onClose = jest.fn();
    montar({ onClose });
    await digitar('acme');

    const primeiro = container.querySelectorAll('.busca-global-result-item')[0];
    act(() => {
      primeiro.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });

    expect(mockNavigate).toHaveBeenCalledWith('/comercial/clientes/editar/7');
    expect(onClose).toHaveBeenCalled();
  });

  it('nao oferece resultados de tipos sem rota registrada no App.js', async () => {
    api.get.mockImplementation((url) => {
      if (url !== '/busca-global') {
        const erro = new Error('404');
        erro.response = { status: 404 };
        return Promise.reject(erro);
      }
      return Promise.resolve({
        data: [
          { id: 1, title: 'Oportunidade X', subtitle: 'ACME', type: 'oportunidade' },
          { id: 7, title: 'ACME Industria Ltda', subtitle: 'Sorocaba, SP', type: 'cliente' },
        ],
      });
    });

    montar();
    await digitar('acme');

    // '/comercial/oportunidades' nao existe em App.js; exibir o item levaria o
    // usuario para a home ao clicar. O item precisa ser descartado.
    expect(container.textContent).not.toContain('Oportunidade X');
    expect(container.querySelectorAll('.busca-global-result-item').length).toBe(1);
  });
});

// ── Etapa 155 ───────────────────────────────────────────────────────────────────────────────
const chamadasDaBusca = () => api.get.mock.calls.filter(([u]) => u === '/busca-global');
const teclarEsc = () => act(() => { window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });

/** api.get da busca com promessas controladas pelo teste: cada chamada entra na fila e o teste resolve (ou rejeita) quando quiser. */
function buscaControlada() {
  const fila = [];
  api.get.mockImplementation((url, config) => {
    if (url !== '/busca-global') return servidorFake(url, config);
    return new Promise((resolve, reject) => { fila.push({ q: config.params.q, resolve, reject }); });
  });
  return fila;
}
const linha = (title) => ({ id: title.length, title, subtitle: '', type: 'cliente' });
/** digita sem resolver nada alem do atraso de 300 ms (o pedido fica em voo) */
function digitarSemResolver(texto) {
  const input = container.querySelector('.busca-global-input');
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setter.call(input, texto); input.dispatchEvent(new Event('input', { bubbles: true })); });
  act(() => { jest.advanceTimersByTime(400); });
}

describe('[RN-155.02, C364, B999] sem o Comercial a busca diz por que e nao busca', () => {
  it('o conjunto dos modulos da busca e o do servidor (o teste do servidor confere o TIPOS_DA_BUSCA_GLOBAL) e a regua e a da moldura', () => {
    expect(MODULOS_DA_BUSCA_GLOBAL).toEqual(['comercial']);
    expect(podeUsarBuscaGlobal(null, null)).toBe(true);
    expect(podeUsarBuscaGlobal({ id: 1, role: 'admin' }, SO_ALMOXARIFADO)).toBe(true);
    expect(podeUsarBuscaGlobal({ id: 1 }, null)).toBeNull();
    expect(podeUsarBuscaGlobal({ id: 1 }, SO_ALMOXARIFADO)).toBe(false);
    expect(podeUsarBuscaGlobal({ id: 1 }, COM_COMERCIAL)).toBe(true);
    // sem nenhuma linha de permissao, a moldura deixa entrar no Comercial (MODULOS_LIBERADOS_SEM_PERMISSAO_PORTAO) — a busca tambem
    expect(podeUsarBuscaGlobal({ id: 1 }, { permissoes: [] })).toBe(true);
    expect(podeUsarBuscaGlobal({ id: 1 }, { permissoes: [{ modulo: 'comercial', permissao: 0 }, { modulo: 'almoxarifado', permissao: 1 }] })).toBe(false);
  });

  it('so com o Almoxarifado: a frase, o campo desligado, nenhum pedido ao digitar, e o Esc fecha; com o Comercial, a mesma tela busca', async () => {
    getCachedUserPermissions.mockReturnValue(SO_ALMOXARIFADO);
    const onClose = jest.fn();
    montar({ onClose });
    expect(container.textContent).toContain(FRASE_BUSCA_SEM_MODULO);
    expect(container.querySelector('.busca-global-input').disabled).toBe(true);
    expect(container.textContent).not.toContain('Digite pelo menos 2 caracteres');
    await digitar('acme');
    expect(chamadasDaBusca()).toHaveLength(0);
    expect(container.textContent).not.toContain('Nenhum resultado encontrado');
    teclarEsc();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(fetchUserPermissions).not.toHaveBeenCalled();
    // a metade positiva: fecha, ganha o Comercial, reabre — busca
    montar({ onClose, isOpen: false });
    getCachedUserPermissions.mockReturnValue(COM_COMERCIAL);
    montar({ onClose });
    expect(container.textContent).not.toContain(FRASE_BUSCA_SEM_MODULO);
    expect(container.querySelector('.busca-global-input').disabled).toBe(false);
    await digitar('acme');
    expect(chamadasDaBusca()).toHaveLength(1);
    expect(container.textContent).toContain('ACME Industria Ltda');
  });

  it('cache frio (venceu em 5 min): le as permissoes ao abrir e decide — sem o Comercial, a frase e 0 buscas; com, busca; se a leitura falha, busca (falha aberto)', async () => {
    getCachedUserPermissions.mockReturnValue(null);
    fetchUserPermissions.mockResolvedValue(SO_ALMOXARIFADO);
    montar();
    await flush();
    expect(fetchUserPermissions).toHaveBeenCalledWith(1);
    expect(container.textContent).toContain(FRASE_BUSCA_SEM_MODULO);
    await digitar('acme');
    expect(chamadasDaBusca()).toHaveLength(0);

    montar({ isOpen: false });
    fetchUserPermissions.mockResolvedValue(COM_COMERCIAL);
    montar();
    await flush();
    expect(container.textContent).not.toContain(FRASE_BUSCA_SEM_MODULO);
    await digitar('acme');
    expect(chamadasDaBusca()).toHaveLength(1);

    montar({ isOpen: false });
    fetchUserPermissions.mockRejectedValue(new Error('Tempo esgotado ao carregar permissões. Tente novamente.'));
    montar();
    await flush();
    await digitar('acme');
    expect(chamadasDaBusca()).toHaveLength(2);
    expect(container.textContent).toContain('ACME Industria Ltda');
  });

  it('com a leitura das permissoes em voo, o que se digita espera (mostra "Buscando...") e busca quando ela responde', async () => {
    getCachedUserPermissions.mockReturnValue(null);
    let responder;
    fetchUserPermissions.mockReturnValue(new Promise((r) => { responder = r; }));
    montar();
    await digitar('acme');
    expect(chamadasDaBusca()).toHaveLength(0);
    expect(container.textContent).toContain('Buscando...');
    await act(async () => { responder(COM_COMERCIAL); await Promise.resolve(); });
    await act(async () => { jest.advanceTimersByTime(400); await Promise.resolve(); });
    expect(chamadasDaBusca()).toHaveLength(1);
    expect(container.textContent).toContain('ACME Industria Ltda');
  });
});

describe('[RN-155.03, C365] so a resposta do ultimo pedido aparece', () => {
  it('a resposta de "ab" chegando depois da de "abc" e descartada (e a de "abc" fica)', async () => {
    const fila = buscaControlada();
    montar();
    digitarSemResolver('ab');
    digitarSemResolver('abc');
    expect(fila.map((p) => p.q)).toEqual(['ab', 'abc']);
    await act(async () => { fila[1].resolve({ data: [linha('RESULTADO DE ABC')] }); });
    await act(async () => { fila[0].resolve({ data: [linha('RESULTADO DE AB')] }); });
    expect([...container.querySelectorAll('.busca-global-result-title')].map((x) => x.textContent)).toEqual(['RESULTADO DE ABC']);
  });

  it('a de "ab" falhando depois (o 503 repetido pelo interceptor) nao apaga a de "abc" nem mostra o erro', async () => {
    const fila = buscaControlada();
    montar();
    digitarSemResolver('ab');
    digitarSemResolver('abc');
    await act(async () => { fila[1].resolve({ data: [linha('RESULTADO DE ABC')] }); });
    await act(async () => { fila[0].reject(new Error('Banco de dados não está disponível. Tente recarregar a página.')); });
    expect(container.textContent).toContain('RESULTADO DE ABC');
    expect(container.textContent).not.toContain(FRASE_BUSCA_FALHOU);
  });

  it('o pedido que falha diz que nao foi possivel buscar (nao "Nenhum resultado"); o seguinte sem resultado volta ao "Nenhum resultado"', async () => {
    const fila = buscaControlada();
    montar();
    digitarSemResolver('ab');
    await act(async () => { fila[0].reject(new Error('Request failed with status code 503')); });
    expect(container.textContent).toContain(FRASE_BUSCA_FALHOU);
    expect(container.textContent).not.toContain('Nenhum resultado encontrado');
    digitarSemResolver('abc');
    await act(async () => { fila[1].resolve({ data: [] }); });
    expect(container.textContent).toContain('Nenhum resultado encontrado');
    expect(container.textContent).not.toContain(FRASE_BUSCA_FALHOU);
  });

  it('apagar o termo com o pedido em voo: volta "Digite pelo menos 2 caracteres" (sem "Buscando..." preso) e a resposta que chega depois nao aparece', async () => {
    const fila = buscaControlada();
    montar();
    digitarSemResolver('ab');
    expect(container.textContent).toContain('Buscando...');
    digitarSemResolver('a');
    expect(container.textContent).toContain('Digite pelo menos 2 caracteres');
    expect(container.textContent).not.toContain('Buscando...');
    await act(async () => { fila[0].resolve({ data: [linha('RESULTADO VELHO')] }); });
    expect(container.textContent).not.toContain('RESULTADO VELHO');
    expect(container.textContent).toContain('Digite pelo menos 2 caracteres');
  });

  it('fechar antes dos 300 ms nao pede nada; fechar com o pedido em voo e reabrir: a resposta que chega nao aparece', async () => {
    const fila = buscaControlada();
    montar();
    const input = container.querySelector('.busca-global-input');
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => { setter.call(input, 'ab'); input.dispatchEvent(new Event('input', { bubbles: true })); });
    act(() => { jest.advanceTimersByTime(100); });
    montar({ isOpen: false });
    act(() => { jest.advanceTimersByTime(1000); });
    expect(fila).toHaveLength(0);

    montar();
    digitarSemResolver('ab');
    expect(fila).toHaveLength(1);
    montar({ isOpen: false });
    montar();
    await act(async () => { fila[0].resolve({ data: [linha('RESULTADO DE ANTES DE FECHAR')] }); });
    expect(container.textContent).not.toContain('RESULTADO DE ANTES DE FECHAR');
    expect(container.textContent).toContain('Digite pelo menos 2 caracteres');
  });
});
