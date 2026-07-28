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
  act(() => {
    root.render(
      <MemoryRouter>
        <BuscaGlobal isOpen onClose={props.onClose || jest.fn()} />
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
