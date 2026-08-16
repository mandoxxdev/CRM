/**
 * Etapa 9, Task 8 — tela "Sobras e Retalhos".
 *
 * O alvo aqui e o que SO a tela pode errar: o payload de POST /sobras/gerar-retalho (os dois modos
 * do design, decisao 2 — `baixar_original` sem default, os campos de vinculo aparecendo/sumindo
 * junto com o checkbox), e o atalho de criar o material do retalho herdando familia/dono/categoria
 * do material de origem. O motor (compensacao, guarda de dono, guarda de serie) ja tem teste de
 * servico e de rota no servidor (retalhoGeracao.api.test.js, sobras.api.test.js).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/Sobras --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import SobrasAlmoxarifado from './SobrasAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// Permissoes liberadas: o gate real e do servidor (requirePermission), testado la.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));
jest.mock('./ExtratoMaterialModal', () => ({ __esModule: true, default: () => null }));

// material_id da sobra e a ORIGEM (o que foi retalhado); material_retalho_id e o material que
// representa o pedaco no catalogo. GET /sobras nao faz JOIN com materiais (so com localizacoes) —
// a tela resolve codigo/nome/dono pelo catalogo que ela mesma carrega, mesmo padrao de
// materiaisPorId em MovimentacoesAlmoxarifado.js.
const SOBRAS = [
  { id: 1, material_id: 101, material_retalho_id: 201, dimensoes_originais: '1800x400',
    dimensoes_restantes: '900x400', peso_aproximado: 12.5, localizacao_id: 5,
    localizacao_codigo: 'A-01', status: 'DISPONIVEL', reutilizavel: 1, norma: 'A36',
    criado_por_nome: 'Maria' },
  { id: 2, material_id: 101, material_retalho_id: 202, dimensoes_restantes: '500x300',
    peso_aproximado: 5, localizacao_id: null, localizacao_codigo: null, status: 'SUCATEADA',
    reutilizavel: 0, criado_por_nome: 'João' },
];

const MATERIAIS = [
  { id: 101, codigo: 'CHP-3MM', nome: 'Chapa 3mm', unidade: 'PC', familia_id: 9,
    categoria: 'Chapas', controle_lote: 0, controle_serie: 0, proprietario_cliente_id: null },
  { id: 201, codigo: 'RET-1', nome: 'Retalho chapa 3mm', unidade: 'PC', proprietario_cliente_id: null },
  { id: 202, codigo: 'RET-2', nome: 'Retalho chapa 3mm 2', unidade: 'PC', proprietario_cliente_id: null },
];

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/sobras') return Promise.resolve({ data: SOBRAS });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url.startsWith('/almoxarifado/proximo-codigo')) return Promise.resolve({ data: { codigo: 'RET-9' } });
    return Promise.resolve({ data: [] });
  });
  api.post.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: { id: 301, codigo: 'RET-9', nome: 'Retalho novo', unidade: 'UN' } });
    }
    return Promise.resolve({ data: { sobra: { id: 3 }, movimentacao_baixa_id: 55, movimentacao_entrada_id: 56 } });
  });
  api.put.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter><SobrasAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const linhas = () => [...container.querySelectorAll('.almox-sobra-lista tbody tr')];
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
const PROTOTIPO = {
  SELECT: () => window.HTMLSelectElement.prototype,
  TEXTAREA: () => window.HTMLTextAreaElement.prototype,
};
function preencher(el, valor) {
  const proto = (PROTOTIPO[el.tagName] || (() => window.HTMLInputElement.prototype))();
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
// Checkbox: React detecta o toggle pelo evento 'click' (nao 'change') — mesmo padrao usado em
// ConfiguracoesGerais.test.js:126-128 para o switch de config.
function marcar(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'checked').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('click', { bubbles: true }));
  });
}
const campo = (rotulo, raiz = '.almox-modal') => [...container.querySelectorAll(`${raiz} .almox-field`)]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo))
  ?.querySelector('input, textarea, select');

describe('SobrasAlmoxarifado — lista', () => {
  test('lista as sobras com origem, retalho, dimensoes e status', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(SOBRAS.length);
    expect(texto()).toContain('CHP-3MM');
    expect(texto()).toContain('RET-1');
    expect(texto()).toContain('900x400');
    expect(texto()).toContain('A-01');
  });

  test('lista vazia mostra estado vazio, nao tabela em branco', async () => {
    api.get.mockImplementation((url) => (url === '/almoxarifado/sobras' ? Promise.resolve({ data: [] }) : Promise.resolve({ data: [] })));
    await renderizar();
    expect(linhas()).toHaveLength(0);
    expect(texto()).toMatch(/nenhuma sobra/i);
  });

  test('falha ao carregar avisa por toast', async () => {
    api.get.mockImplementation((url) => (url === '/almoxarifado/sobras' ? Promise.reject(new Error('boom')) : Promise.resolve({ data: [] })));
    await renderizar();
    expect(toast.error).toHaveBeenCalled();
  });
});

describe('SobrasAlmoxarifado — modal de gerar retalho', () => {
  test('abre o modal com os campos de material de origem e do retalho', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    expect(texto()).toContain('Gerar retalho');
    expect(campo('Material de origem')).toBeTruthy();
    expect(campo('Material do retalho')).toBeTruthy();
  });

  test('baixar_original comeca desmarcado e SEM os campos de vinculo da baixa', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    const checkbox = campo('Baixar o material de origem');
    expect(checkbox.checked).toBe(false);
    expect(campo('Quantidade baixada')).toBeFalsy();
  });

  test('marcar baixar_original MOSTRA quantidade baixada, e desmarcar ESCONDE de novo', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    const checkbox = campo('Baixar o material de origem');
    marcar(checkbox, true);
    expect(campo('Quantidade baixada')).toBeTruthy();
    marcar(checkbox, false);
    expect(campo('Quantidade baixada')).toBeFalsy();
  });

  test('gerar retalho no modo SEM baixa manda baixar_original:false e nao manda quantidade_baixa', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sobras/gerar-retalho', expect.objectContaining({
      material_origem_id: 101, material_retalho_id: 201, baixar_original: false,
    }));
    const body = api.post.mock.calls[0][1];
    expect(body).not.toHaveProperty('quantidade_baixa');
  });

  test('gerar retalho no modo COM baixa manda baixar_original:true e a quantidade baixada', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    marcar(campo('Baixar o material de origem'), true);
    preencher(campo('Quantidade baixada'), '30');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sobras/gerar-retalho', expect.objectContaining({
      material_origem_id: 101, material_retalho_id: 201, baixar_original: true, quantidade_baixa: 30,
    }));
  });

  test('baixar_original ligado sem quantidade baixada nao chama o servidor', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    marcar(campo('Baixar o material de origem'), true);
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test('as dimensoes preenchidas entram no payload', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    preencher(campo('Dimensões restantes'), '900x400');
    preencher(campo('Norma'), 'ASTM A36');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/sobras/gerar-retalho', expect.objectContaining({
      dimensoes_restantes: '900x400', norma: 'ASTM A36',
    }));
  });

  test('o erro do servidor aparece para o operador, com a mensagem do backend', async () => {
    api.post.mockRejectedValueOnce({ response: { data: { error: 'O material X tem controle de serie...' } } });
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    preencher(campo('Material do retalho'), '201');
    await clicar(botao('Gerar retalho', container.querySelector('.almox-modal-footer')));
    expect(toast.error).toHaveBeenCalledWith('O material X tem controle de serie...');
  });

  test('criar material do retalho herda familia, dono e categoria do material de origem', async () => {
    await renderizar();
    await clicar(botao('Gerar retalho'));
    preencher(campo('Material de origem'), '101');
    await esperarEfeitos();
    await clicar(botao('Criar material do retalho'));
    preencher(campo('Nome do novo material'), 'Retalho novo');
    await clicar(botao('Cadastrar e usar'));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/proximo-codigo?familia_id=9');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais', expect.objectContaining({
      codigo: 'RET-9', codigo_auto: 1, nome: 'Retalho novo', familia_id: 9,
      proprietario_cliente_id: null, categoria: 'Chapas',
    }));
  });
});
