/**
 * Etapa 55 (T2) — o código proposto pelo assistente de nova localização e pelo Mover vem do
 * SERVIDOR (`GET /almoxarifado/localizacoes/proximo-codigo`), que conta as localizações inativas.
 *
 * O defeito: o gerador local só vê `GET /localizacoes` (que filtra ativo = 1). Com SND-01 ativa e
 * SND-02 desativada, ele propunha SND-02 — o POST reativava a antiga em silêncio (a "nova" herdava
 * histórico e saldo) e o Mover estourava UNIQUE com 500 cru na tela.
 *
 * Por isso as fixtures abaixo são montadas para que o gerador local e a rota DISCORDEM
 * (local = SND-02, rota = SND-03): um teste que passasse com o código local provaria nada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/LocalizacaoProximoCodigo --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ConfiguracoesAlmoxarifado from './ConfiguracoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', perfil_almoxarifado: 'ADMINISTRADOR' } }),
}));

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

const ROTA_PROXIMO = '/almoxarifado/localizacoes/proximo-codigo';

// Só ativas, como a rota real devolve. SND-02 existe no banco, mas desativada — não aparece aqui.
const LOCS = [
  { id: 1, codigo: 'SND-01', setor: 'Sonda', parent_id: null, tipo: 'Prateleira', almoxarifado_id: 1, ativo: 1 },
  { id: 2, codigo: 'OUT-01', setor: 'Outro', parent_id: null, tipo: 'Prateleira', almoxarifado_id: 1, ativo: 1 },
];
const SETORES = [
  { id: 1, nome: 'Sonda', tipo: 'area', codigo_prefixo: 'SND', ativo: 1 },
  { id: 2, nome: 'Outro', tipo: 'area', codigo_prefixo: 'OUT', ativo: 1 },
];

let container;
let root;
let proximoImpl;
let metaImpl;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  proximoImpl = () => Promise.resolve({ data: { codigo: 'SND-03' } });
  // Meta como os mocks antigos: SEM areas_especiais (o bloco "Etapa 68" troca).
  metaImpl = () => Promise.resolve({ data: { localizacoes_tipos: [], tipos: [] } });
  api.get.mockImplementation((url) => {
    if (url === ROTA_PROXIMO) return proximoImpl();
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: LOCS });
    if (url === '/almoxarifado/setores') return Promise.resolve({ data: SETORES });
    if (url === '/almoxarifado/meta/tipos-material') return metaImpl();
    if (url === '/almoxarifado/almoxarifados') return Promise.resolve({ data: [{ id: 1, codigo: 'ALM-01', nome: 'Geral', ativo: 1 }] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 99 } });
  api.put.mockResolvedValue({ data: { success: true } });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const flush = async () => { await act(async () => { await new Promise(r => setTimeout(r, 0)); }); };

async function renderAba() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/configuracoes?tab=localizacoes']}>
        <ConfiguracoesAlmoxarifado />
      </MemoryRouter>
    );
  });
  await flush();
}

const botao = (re) => [...container.querySelectorAll('button')].find(b => re.test(b.textContent));
const clicar = async (el) => {
  expect(el).toBeTruthy();
  await act(async () => { el.click(); });
  await flush();
};

const chamadasProximo = () => api.get.mock.calls.filter(([url]) => url === ROTA_PROXIMO);

// Assistente até a confirmação (passo 5), posição raiz no setor Sonda.
async function assistenteAteConfirmacao() {
  await renderAba();
  await clicar(botao(/Nova Localização/));
  await clicar(botao(/Próximo/));                       // passo 1: almoxarifado único pré-selecionado
  await clicar(botao(/^.*Sonda/));                       // passo 2: setor
  await clicar(botao(/Próximo/));
  await clicar(botao(/Posição raiz/));                   // passo 3
  await clicar(botao(/Próximo/));
  const codigoPasso4 = container.querySelector('input[readonly]')?.value;
  await clicar(botao(/Próximo/));                        // passo 4 -> 5
  return codigoPasso4;
}

test('(a) a prévia mostra o código que a rota devolveu, não o do gerador local', async () => {
  const codigoPasso4 = await assistenteAteConfirmacao();
  expect(codigoPasso4).toBe('SND-03');
  expect(container.textContent).toContain('SND-03');
  // O gerador local, que só vê ativas, daria SND-02 — o código da desativada.
  expect(container.textContent).not.toContain('SND-02');
  const [, cfg] = chamadasProximo().slice(-1)[0];
  expect(cfg.params).toEqual({ setor: 'Sonda' });        // raiz: sem parent_id
});

test('(b) o POST manda somente_novo: true e o código mostrado, sem buscar de novo', async () => {
  await assistenteAteConfirmacao();
  const buscasAntes = chamadasProximo().length;
  await clicar(botao(/Confirmar cadastro/));
  expect(api.post).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.post.mock.calls[0];
  expect(rota).toBe('/almoxarifado/localizacoes');
  expect(corpo.somente_novo).toBe(true);
  expect(corpo.codigo).toBe('SND-03');
  expect(chamadasProximo().length).toBe(buscasAntes);
});

test('(c) 409 do servidor: a mensagem aparece e o código é buscado de novo', async () => {
  await assistenteAteConfirmacao();
  const buscasAntes = chamadasProximo().length;
  const msg = 'O código SND-03 pertence a uma localização desativada — gere outro código';
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: msg } } });
  proximoImpl = () => Promise.resolve({ data: { codigo: 'SND-04' } });
  await clicar(botao(/Confirmar cadastro/));
  expect(container.textContent).toContain(msg);
  expect(chamadasProximo().length).toBe(buscasAntes + 1);
  expect(container.textContent).toContain('SND-04');

  // E a nova tentativa grava o código novo que a prévia passou a mostrar.
  await clicar(botao(/Confirmar cadastro/));
  expect(api.post.mock.calls[1][1].codigo).toBe('SND-04');
});

test('(d) rota falhando: a tela cai no gerador local e não fica sem proposta', async () => {
  proximoImpl = () => Promise.reject(new Error('Network Error'));
  const codigoPasso4 = await assistenteAteConfirmacao();
  expect(codigoPasso4).toBe('SND-02');
  const confirmar = botao(/Confirmar cadastro/);
  expect(confirmar.disabled).toBe(false);
  await clicar(confirmar);
  expect(api.post.mock.calls[0][1].codigo).toBe('SND-02');
  expect(api.post.mock.calls[0][1].somente_novo).toBe(true);
});

test('(d2) rota caída + 409: o fallback NÃO repropõe o código recusado (sem laço)', async () => {
  proximoImpl = () => Promise.reject(new Error('Network Error'));
  await assistenteAteConfirmacao();
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'O código SND-02 pertence a uma localização desativada — gere outro código' } } });
  await clicar(botao(/Confirmar cadastro/));
  expect(api.post.mock.calls[0][1].codigo).toBe('SND-02');
  // Fase 5: sem a lista de recusados, o gerador local (que não vê inativas) propunha SND-02 de novo.
  await clicar(botao(/Confirmar cadastro/));
  expect(api.post.mock.calls[1][1].codigo).toBe('SND-03');
});

test('enquanto o código carrega, confirmar fica desabilitado', async () => {
  let resolver;
  await assistenteAteConfirmacao();
  proximoImpl = () => new Promise(r => { resolver = r; });
  api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'recusado' } } });
  await clicar(botao(/Confirmar cadastro/));
  expect(botao(/Confirmar cadastro/).disabled).toBe(true);
  await act(async () => { resolver({ data: { codigo: 'SND-05' } }); });
  await flush();
  expect(botao(/Confirmar cadastro/).disabled).toBe(false);
});

test('(e) Mover envia excluir_id e grava o código da rota', async () => {
  proximoImpl = () => Promise.resolve({ data: { codigo: 'SND-07' } });
  await renderAba();
  const linha = [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes('OUT-01'));
  await clicar(linha.querySelector('button[title="Mover"]'));
  await clicar(botao(/^.*Sonda/));                       // passo 1: novo setor
  await clicar(botao(/Próximo/));
  await clicar(botao(/Posição raiz/));                   // passo 2
  await clicar(botao(/Próximo/));
  expect(container.textContent).toContain('SND-07');
  const [, cfg] = chamadasProximo().slice(-1)[0];
  expect(cfg.params).toEqual({ setor: 'Sonda', excluir_id: 2 });

  await clicar(botao(/Confirmar movimentação/));
  expect(api.put).toHaveBeenCalledTimes(1);
  const [rota, corpo] = api.put.mock.calls[0];
  expect(rota).toBe('/almoxarifado/localizacoes/2');
  expect(corpo.codigo).toBe('SND-07');
});

test('(e2) Mover com erro do servidor mostra a mensagem e busca outro código', async () => {
  proximoImpl = () => Promise.resolve({ data: { codigo: 'SND-07' } });
  await renderAba();
  const linha = [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes('OUT-01'));
  await clicar(linha.querySelector('button[title="Mover"]'));
  await clicar(botao(/^.*Sonda/));
  await clicar(botao(/Próximo/));
  await clicar(botao(/Posição raiz/));
  await clicar(botao(/Próximo/));
  api.put.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Código já existe (localização desativada)' } } });
  proximoImpl = () => Promise.resolve({ data: { codigo: 'SND-08' } });
  await clicar(botao(/Confirmar movimentação/));
  expect(container.textContent).toContain('Código já existe (localização desativada)');
  expect(container.textContent).toContain('SND-08');
});

// ── Etapa 68 (T5) — o assistente conhece as áreas especiais ─────────────────────────────────────
describe('Etapa 68: áreas especiais no assistente', () => {
  const TIPOS_LOC = [
    'Almoxarifado', 'Rua', 'Prateleira', 'Gaveta', 'Box', 'Área externa', 'Área de corte',
    'Área de montagem', 'Área de elétrica', 'Área de pintura', 'Área de expedição',
    'Área de materiais do cliente', 'Área de quarentena/inspeção', 'Área de sucata', 'Área de devoluções',
  ];
  const AREAS = [
    { tipo: 'Área de quarentena/inspeção', chave: 'QUARENTENA', descricao: 'q' },
    { tipo: 'Área de expedição', chave: 'EXPEDICAO', descricao: 'e' },
    { tipo: 'Área de materiais do cliente', chave: 'MATERIAIS_CLIENTE', descricao: 'c' },
    { tipo: 'Área de sucata', chave: 'SUCATA', descricao: 's' },
    { tipo: 'Área de devoluções', chave: 'DEVOLUCOES', descricao: 'd' },
  ];
  const comAreas = () => Promise.resolve({ data: { localizacoes_tipos: TIPOS_LOC, tipos: [], areas_especiais: AREAS } });

  const selectTipoArea = () => {
    const label = [...container.querySelectorAll('label')].find(l => /Tipo de área/.test(l.textContent));
    return label ? label.parentElement.querySelector('select') : null;
  };
  const opcoes = (sel) => [...sel.querySelectorAll('option')].map(o => o.value);
  const escolher = async (sel, valor) => {
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      setter.call(sel, valor);
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
  };

  // Assistente até o passo 4 (Detalhes), posição raiz no setor Sonda.
  async function ateDetalhesRaiz() {
    await renderAba();
    await clicar(botao(/Nova Localização/));
    await clicar(botao(/Próximo/));
    await clicar(botao(/^.*Sonda/));
    await clicar(botao(/Próximo/));
    await clicar(botao(/Posição raiz/));
    await clicar(botao(/Próximo/));
  }

  test('(f) raiz: o select oferece as áreas de areas_especiais além dos 6 de sempre, e o POST manda a escolhida', async () => {
    metaImpl = comAreas;
    await ateDetalhesRaiz();
    const sel = selectTipoArea();
    expect(sel).toBeTruthy();
    const ops = opcoes(sel);
    ['Prateleira', 'Gaveta', 'Box', 'Rua', 'Almoxarifado', 'Área externa'].forEach(t => expect(ops).toContain(t));
    AREAS.forEach(a => expect(ops).toContain(a.tipo));
    // Só as áreas do registro: tipo comum fora dos 6 (ex.: Área de corte) continua fora da raiz.
    expect(ops).not.toContain('Área de corte');
    await escolher(sel, 'Área de sucata');
    await clicar(botao(/Próximo/));
    await clicar(botao(/Confirmar cadastro/));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][1].tipo).toBe('Área de sucata');
    expect(api.post.mock.calls[0][1].parent_id).toBeNull();
  });

  test('(g) escolheu área na raiz e voltou para posição filha: o filho NÃO leva o rótulo da área', async () => {
    metaImpl = comAreas;
    await ateDetalhesRaiz();
    await escolher(selectTipoArea(), 'Área de sucata');
    await clicar(botao(/Voltar/));                         // passo 4 -> 3
    await clicar(botao(/Dentro de uma estrutura existente/));
    const pai = [...container.querySelectorAll('select')].find(s => [...s.options].some(o => o.value === '1'));
    await escolher(pai, '1');                              // SND-01
    await clicar(botao(/Próximo/));
    expect(selectTipoArea()).toBeNull();                   // filho não escolhe tipo
    await clicar(botao(/Próximo/));
    await clicar(botao(/Confirmar cadastro/));
    expect(api.post).toHaveBeenCalledTimes(1);
    const corpo = api.post.mock.calls[0][1];
    expect(corpo.parent_id).toBe(1);
    expect(corpo.tipo).not.toBe('Área de sucata');
    expect(corpo.tipo).toBe('Prateleira');
  });

  test('(h) meta sem areas_especiais (servidor anterior): a raiz oferece os 6 de sempre e nada quebra', async () => {
    await ateDetalhesRaiz();
    const ops = opcoes(selectTipoArea());
    expect(ops).toEqual(expect.arrayContaining(['Prateleira', 'Gaveta', 'Box', 'Rua', 'Almoxarifado', 'Área externa']));
    expect(ops).not.toContain('Área de sucata');
    expect(ops).not.toContain('Área de devoluções');
  });

  test('(i) recusa do servidor ("Tipo de localização inválido") aparece na tela, literal', async () => {
    metaImpl = comAreas;
    await ateDetalhesRaiz();
    await escolher(selectTipoArea(), 'Área de devoluções');
    await clicar(botao(/Próximo/));
    const msg = 'Tipo de localização inválido: Área de devoluções';
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: msg } } });
    await clicar(botao(/Confirmar cadastro/));
    expect(container.textContent).toContain(msg);
  });

  test('(j) Editar localização de tipo legado (fora da lista): o select mostra o tipo atual e o PUT o manda de volta', async () => {
    metaImpl = comAreas;
    const LEGADA = { id: 3, codigo: 'LEG-01', setor: 'Sonda', parent_id: null, tipo: 'Depósito antigo', almoxarifado_id: 1, ativo: 1 };
    const getOriginal = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/localizacoes'
      ? Promise.resolve({ data: [...LOCS, LEGADA] }) : getOriginal(url, cfg)));
    await renderAba();
    const linha = [...container.querySelectorAll('tr')].find(tr => tr.textContent.includes('LEG-01'));
    await clicar(linha.querySelector('button[title="Editar"]'));
    const sel = selectTipoArea();
    expect(sel.value).toBe('Depósito antigo');
    expect(opcoes(sel)).toContain('Área de sucata');       // Editar oferece a lista inteira
    await clicar(botao(/^\s*Salvar\s*$/));
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][0]).toBe('/almoxarifado/localizacoes/3');
    expect(api.put.mock.calls[0][1].tipo).toBe('Depósito antigo');
  });
});
