/**
 * Etapa 173 — o F2 (e o botão "Novo fornecedor") abre a ficha COMPLETA do fornecedor numa janela,
 * sem sair do pedido de compra, da cotação ou do grupo homologado. Cada cenário cita a RN do plano
 * docs/superpowers/plans/2026-10-22-almoxarifado-etapa173-f2-abre-o-cadastro-do-fornecedor.md.
 *
 * O servidor é mockado na fronteira HTTP (`services/api`), como nas suítes da 34, 39 e 41: a rota
 * de fornecedor não mudou e tem régua própria (`comprasFornecedor.api.test.js`). O alvo é o que só a
 * tela pode errar — a janela, a seleção do novo, o pedido que NÃO pode ser enviado junto.
 *
 * A janela é um portal no <body>: as consultas dela vão em `document`, não em `container`.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=FornecedorF2
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PedidoCompraForm from './PedidoCompraForm';
import CotacaoForm from './CotacaoForm';
import FornecedoresDoGrupo from '../FornecedoresDoGrupo';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), patch: jest.fn(), delete: jest.fn(), defaults: { baseURL: '/api' } },
}));
jest.mock('react-toastify', () => ({
  toast: Object.assign(jest.fn(), { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() }),
}));

// O 312 não é o primeiro da lista de propósito (molde da 38): um <select> que caísse no primeiro
// option passaria por acidente. O novo é o 777.
const FORNECEDORES = [
  { id: 355, razao_social: 'Parafusos Sul', status: 'ativo' },
  { id: 312, razao_social: 'Aços Vale Ltda', status: 'ativo' },
];
const GRUPOS = [{ id: 7, nome: 'Insumos' }, { id: 8, nome: 'Peças' }];
const MATERIAIS = [{ id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm', unidade: 'KG' }];
const NOVO_ID = 777;
// A recusa REAL da rota (server/routes/compras/fornecedores.js, `recusaDoGrupoNovo`), escrita aqui e
// não importada: o grupo pode ser desativado com a janela aberta (achado 2 da Fase 2).
const LITERAL_GRUPO_DESATIVADO = 'Grupo desativado — reative o grupo em Fornecedores homologados antes de vincular fornecedores';

const PEDIDO_418 = {
  id: 418, numero: 'PC-2026-418', fornecedor_id: 312, fornecedor_nome: 'Aços Vale Ltda', valor_total: 315,
  data_pedido: '2026-09-10', previsao_entrega: '2026-09-25', status: 'aprovado', observacoes: '',
  teve_recebimento: 0,
  itens: [{ id: 4181, material_id: 907, codigo: 'ALM-0907', descricao: 'Chapa Aço 3mm', unidade: 'KG',
    quantidade: 9, valor_unitario: 35, quantidade_recebida: 0 }],
};
const COTACAO_50 = {
  id: 50, numero: 'COT-50', fornecedor_id: 312, data_cotacao: '2026-10-01', validade: '2026-10-30',
  valor_total: 100, status: 'em_analise', observacoes: '', itens: [], pedido_id: null, pedido_numero: null,
};

let container; let root;
// Por cenário: o que o GET de cada recurso devolve (uma Promise pendente segura a resposta).
let respostaFornecedores; let detalhe418; let cotacao50;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  respostaFornecedores = () => Promise.resolve({ data: FORNECEDORES });
  detalhe418 = () => Promise.resolve({ data: PEDIDO_418 });
  cotacao50 = () => Promise.resolve({ data: COTACAO_50 });
  api.get.mockImplementation((url) => {
    if (url === '/compras/fornecedores') return respostaFornecedores();
    if (url === '/compras/grupos') return Promise.resolve({ data: GRUPOS });
    if (url === '/compras/pedidos/418') return detalhe418();
    if (url === '/compras/cotacoes/50') return cotacao50();
    if (url === '/compras/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/compras/pedidos-aux/opcoes') return Promise.resolve({ data: {} });
    if (url === '/compras/aux/ordens-servico') return Promise.resolve({ data: [] });
    if (url === '/compras/grupos/7') return Promise.resolve({ data: { id: 7, nome: 'Insumos', ativo: 1 } });
    if (url === '/compras/grupos/7/fornecedores') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  api.post.mockImplementation((url, corpo) => {
    if (url === '/compras/fornecedores') {
      return Promise.resolve({ data: { id: NOVO_ID, razao_social: corpo.razao_social, nome_fantasia: null, grupo_id: null } });
    }
    if (url === '/compras/pedidos/calcular') return Promise.resolve({ data: { itens: [], totais: {} } });
    if (url === '/compras/pedidos') return Promise.resolve({ data: { id: 640, numero: 'PC-2026-640' } });
    return Promise.reject(new Error(`POST inesperado: ${url}`));
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.querySelectorAll('.busca-global-overlay').forEach((el) => el.remove());
});

const flush = () => new Promise((r) => setTimeout(r, 0));
const esperar = async () => { await act(async () => { await flush(); await flush(); }); };

async function renderEm(caminho) {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[caminho]}>
        <Routes>
          <Route path="/compras/pedidos" element={<div data-testid="lista-pedidos">LISTA</div>} />
          <Route path="/compras/pedidos/novo" element={<PedidoCompraForm />} />
          <Route path="/compras/pedidos/editar/:id" element={<PedidoCompraForm />} />
          <Route path="/compras/cotacoes" element={<div data-testid="lista-cotacoes">LISTA</div>} />
          <Route path="/compras/cotacoes/nova" element={<CotacaoForm />} />
          <Route path="/compras/cotacoes/editar/:id" element={<CotacaoForm />} />
          <Route path="/compras/fornecedores-homologados/grupo/:grupoId" element={<FornecedoresDoGrupo />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await esperar();
}

const porTestId = (id) => document.querySelector(`[data-testid="${id}"]`);
const janela = () => document.querySelector('[role="dialog"]');
const janelas = () => document.querySelectorAll('[role="dialog"]');
const campoDaJanela = (nome) => janela()?.querySelector(`[data-testid="fornecedor-${nome}"]`);

async function teclar(key, extra = {}, alvo = document.body) {
  await act(async () => {
    alvo.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...extra }));
  });
  await esperar();
}
async function clicar(el) {
  if (!el) throw new Error('elemento nao existe');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); });
  await esperar();
}
const setNative = (el, valor) => {
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
};
async function digitar(el, valor) {
  if (!el) throw new Error('campo nao existe');
  await act(async () => {
    setNative(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
  await esperar();
}
async function salvarJanela() {
  const form = janela().querySelector('form.fornecedor-form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperar();
}
const postsDe = (url) => api.post.mock.calls.filter(([u]) => u === url);
const opcoesDo = (select) => [...select.querySelectorAll('option')].map((o) => o.textContent);

/* ── Pedido de compra ─────────────────────────────────────────────────────────────────────────── */

describe('Etapa 173 — pedido de compra', () => {
  test('RN-173.01: F2 com o foco num campo do pedido abre a ficha COMPLETA, e o F2 não chega ao navegador', async () => {
    await renderEm('/compras/pedidos/novo');
    expect(janela()).toBeNull();
    const evento = new KeyboardEvent('keydown', { key: 'F2', bubbles: true, cancelable: true });
    await act(async () => { porTestId('pedido-fornecedor').dispatchEvent(evento); });
    await esperar();
    expect(evento.defaultPrevented).toBe(true);
    expect(janela()).not.toBeNull();
    expect(janela().getAttribute('aria-modal')).toBe('true');
    expect(janela().textContent).toContain('Novo fornecedor');
    ['razao', 'fantasia', 'cnpj', 'ie', 'grupo', 'contato', 'telefone', 'telefone-vendedor', 'email', 'cep',
      'endereco', 'cidade', 'estado'].forEach((c) => expect(campoDaJanela(c)).not.toBeNull());
    // o cursor já está na razão social
    expect(document.activeElement).toBe(campoDaJanela('razao'));
  });

  test('RN-173.02: o botão "Novo fornecedor (F2)" abre a mesma janela', async () => {
    await renderEm('/compras/pedidos/novo');
    expect(porTestId('pedido-novo-fornecedor').textContent).toMatch(/Novo fornecedor/);
    expect(porTestId('pedido-novo-fornecedor').getAttribute('type')).toBe('button');
    await clicar(porTestId('pedido-novo-fornecedor'));
    expect(janela()).not.toBeNull();
    expect(postsDe('/compras/pedidos')).toHaveLength(0);
  });

  test('RN-173.03 + integração (T5): salva na janela, o novo fica escolhido no topo, os itens ficam, e o pedido sai com o fornecedor novo', async () => {
    await renderEm('/compras/pedidos/novo');
    // O pedido já está VÁLIDO antes do F2 (fornecedor 312 + um item): se o submit da janela subisse
    // para o <form> do pedido, ele seria enviado com o 312. Com o pedido incompleto o próprio
    // handleSubmit recusaria e o vazamento passaria calado.
    // Há DUAS proteções: a janela é renderizada fora do <form> do pedido na árvore do React, e a
    // ficha para a propagação do submit. Medido (Fase 3): tirar só uma não derruba este cenário;
    // tirar as duas derruba (o React leva o submit pelo portal até o onSubmit do form pai).
    await digitar(porTestId('pedido-fornecedor'), '312');
    await digitar(porTestId('busca-material'), 'CHAPA');
    await clicar(porTestId('botao-buscar-material'));
    await clicar(porTestId('adicionar-material-907'));
    await digitar(porTestId('qtd-item-907'), '4');
    await digitar(porTestId('valor-item-907'), '25');

    await teclar('F2');
    await digitar(campoDaJanela('razao'), 'ACME NOVA LTDA');
    await digitar(campoDaJanela('cidade'), 'Campinas');
    await salvarJanela();

    // o POST do fornecedor saiu com as 13 chaves; o do PEDIDO não (achado 1 da Fase 2)
    expect(postsDe('/compras/fornecedores')).toHaveLength(1);
    expect(Object.keys(postsDe('/compras/fornecedores')[0][1]).sort()).toEqual([
      'cep', 'cidade', 'cnpj', 'contato', 'email', 'endereco', 'estado', 'grupo_id', 'inscricao_estadual',
      'nome_fantasia', 'razao_social', 'telefone', 'telefone_vendedor',
    ]);
    expect(postsDe('/compras/pedidos')).toHaveLength(0);
    expect(janela()).toBeNull();
    expect(porTestId('lista-pedidos')).toBeNull();
    const select = porTestId('pedido-fornecedor');
    expect(select.value).toBe(String(NOVO_ID));
    expect(opcoesDo(select)[1]).toBe('ACME NOVA LTDA');
    expect(toast.success).toHaveBeenCalledWith('Fornecedor ACME NOVA LTDA cadastrado e escolhido no pedido');
    expect(porTestId('qtd-item-907').value).toBe('4');

    // o último gesto: salvar o pedido leva o fornecedor novo
    await act(async () => {
      porTestId('form-pedido-compra').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    });
    await esperar();
    expect(postsDe('/compras/pedidos')).toHaveLength(1);
    const corpo = postsDe('/compras/pedidos')[0][1];
    expect(corpo.fornecedor_id).toBe(NOVO_ID);
    expect(corpo.itens).toHaveLength(1);
    expect(corpo.itens[0].material_id).toBe(907);
  });

  test('RN-173.04: Esc e × fecham sem gravar; clique no fundo NÃO fecha e o digitado fica', async () => {
    await renderEm('/compras/pedidos/novo');
    await teclar('F2');
    await digitar(campoDaJanela('razao'), 'MEIO PREENCHIDO');
    await clicar(porTestId('fornecedor-modal-fundo'));
    expect(janela()).not.toBeNull();
    expect(campoDaJanela('razao').value).toBe('MEIO PREENCHIDO');

    await teclar('Escape', {}, campoDaJanela('razao'));
    expect(janela()).toBeNull();

    await teclar('F2');
    await clicar(janela().querySelector('[aria-label="Fechar"]'));
    expect(janela()).toBeNull();
    expect(postsDe('/compras/fornecedores')).toHaveLength(0);
    expect(porTestId('pedido-fornecedor').value).toBe('');
  });

  test('RN-173.04: Esc com o foco FORA da janela (a busca global por cima) não fecha a ficha', async () => {
    await renderEm('/compras/pedidos/novo');
    await teclar('F2');
    const busca = document.createElement('input');
    document.body.appendChild(busca);
    await teclar('Escape', {}, busca);
    expect(janela()).not.toBeNull();
    busca.remove();
  });

  test('RN-173.04: "Cancelar" fecha sem gravar e o pedido fica como estava', async () => {
    await renderEm('/compras/pedidos/novo');
    await digitar(porTestId('pedido-fornecedor'), '312');
    await teclar('F2');
    await digitar(campoDaJanela('razao'), 'DESISTI LTDA');
    const cancelar = [...janela().querySelectorAll('button')].find((b) => b.textContent.trim() === 'Cancelar');
    await clicar(cancelar);
    expect(janela()).toBeNull();
    expect(postsDe('/compras/fornecedores')).toHaveLength(0);
    expect(porTestId('pedido-fornecedor').value).toBe('312');
  });

  test('RN-173.04 (Fase 5): ao fechar, o foco volta ao campo de onde o F2 foi apertado', async () => {
    await renderEm('/compras/pedidos/novo');
    const select = porTestId('pedido-fornecedor');
    act(() => { select.focus(); });
    await teclar('F2', {}, select);
    expect(document.activeElement).toBe(campoDaJanela('razao'));
    await teclar('Escape', {}, campoDaJanela('razao'));
    expect(janela()).toBeNull();
    expect(document.activeElement).toBe(select);
  });

  test('RN-173.04 (Fase 5): o Tab não sai da janela — do último volta ao primeiro, e Shift+Tab do primeiro vai ao último', async () => {
    await renderEm('/compras/pedidos/novo');
    await teclar('F2');
    const focaveis = [...janela().querySelectorAll('button, input, select')].filter((el) => !el.disabled);
    const primeiro = focaveis[0];
    const ultimo = focaveis[focaveis.length - 1];
    expect(primeiro.getAttribute('aria-label')).toBe('Fechar');
    expect(ultimo.textContent).toMatch(/Salvar/);

    act(() => { ultimo.focus(); });
    await teclar('Tab', {}, ultimo);
    expect(document.activeElement).toBe(primeiro);

    await teclar('Tab', { shiftKey: true }, primeiro);
    expect(document.activeElement).toBe(ultimo);

    // foco que escapou para o pedido (ex.: clique) volta para dentro no próximo Tab
    const doPedido = porTestId('pedido-fornecedor');
    act(() => { doPedido.focus(); });
    await teclar('Tab', {}, doPedido);
    expect(janela().contains(document.activeElement)).toBe(true);
  });

  test('RN-173.06 (Fase 5): com o guia de ajuda "?" aberto, o F2 não abre a ficha atrás dele', async () => {
    await renderEm('/compras/pedidos/novo');
    const guia = document.createElement('div');
    guia.className = 'help-guide-overlay';
    document.body.appendChild(guia);
    await teclar('F2');
    expect(janela()).toBeNull();
    guia.remove();
    await teclar('F2');
    expect(janela()).not.toBeNull();
  });

  test('RN-173.06: F2 de novo, F2 segurado e F2 com modificador não abrem outra janela', async () => {
    await renderEm('/compras/pedidos/novo');
    await teclar('F2', { repeat: true });
    expect(janela()).toBeNull();
    await teclar('F2', { ctrlKey: true });
    await teclar('F2', { shiftKey: true });
    await teclar('F2', { altKey: true });
    expect(janela()).toBeNull();
    await teclar('F2');
    await teclar('F2');
    expect(janelas()).toHaveLength(1);
  });

  test('RN-173.06: com a busca global aberta por cima, o F2 não abre a ficha escondida atrás dela', async () => {
    await renderEm('/compras/pedidos/novo');
    const busca = document.createElement('div');
    busca.className = 'busca-global-overlay';
    document.body.appendChild(busca);
    await teclar('F2');
    expect(janela()).toBeNull();
    busca.remove();
    await teclar('F2');
    expect(janela()).not.toBeNull();
  });

  test('RN-173.07: a recusa do servidor aparece DENTRO da janela, que fica aberta com o digitado', async () => {
    api.post.mockImplementation((url) => (url === '/compras/fornecedores'
      ? Promise.reject({ response: { status: 400, data: { error: LITERAL_GRUPO_DESATIVADO } } })
      : Promise.reject(new Error(`POST inesperado: ${url}`))));
    await renderEm('/compras/pedidos/novo');
    await teclar('F2');
    await digitar(campoDaJanela('razao'), 'ACME NOVA LTDA');
    await digitar(campoDaJanela('grupo'), '7');
    await salvarJanela();
    expect(janela()).not.toBeNull();
    expect(janela().querySelector('[role="alert"]').textContent).toBe(LITERAL_GRUPO_DESATIVADO);
    expect(campoDaJanela('razao').value).toBe('ACME NOVA LTDA');
    expect(porTestId('pedido-fornecedor').value).toBe('');
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('RN-173.07: razão vazia recusa na janela com a literal e não faz POST', async () => {
    await renderEm('/compras/pedidos/novo');
    await teclar('F2');
    await salvarJanela();
    expect(janela().querySelector('[role="alert"]').textContent).toBe('Razão social é obrigatória');
    expect(postsDe('/compras/fornecedores')).toHaveLength(0);
    expect(postsDe('/compras/pedidos')).toHaveLength(0);
  });

  test('RN-173.05: pedido já recebido — sem botão e o F2 não abre', async () => {
    detalhe418 = () => Promise.resolve({ data: { ...PEDIDO_418, teve_recebimento: 1 } });
    await renderEm('/compras/pedidos/editar/418');
    expect(porTestId('pedido-fornecedor').disabled).toBe(true);
    expect(porTestId('pedido-novo-fornecedor')).toBeNull();
    await teclar('F2');
    expect(janela()).toBeNull();
  });

  test('RN-173.05: METADE POSITIVA — pedido editável abre pelo F2', async () => {
    await renderEm('/compras/pedidos/editar/418');
    expect(porTestId('pedido-novo-fornecedor')).not.toBeNull();
    await teclar('F2');
    expect(janela()).not.toBeNull();
  });

  test('RN-173.05: com o pedido ainda carregando o F2 não abre (o "só status" ainda não chegou)', async () => {
    let soltar;
    detalhe418 = () => new Promise((r) => { soltar = () => r({ data: { ...PEDIDO_418, teve_recebimento: 1 } }); });
    await renderEm('/compras/pedidos/editar/418');
    await teclar('F2');
    expect(janela()).toBeNull();
    await act(async () => { soltar(); });
    await esperar();
    await teclar('F2');
    expect(janela()).toBeNull();
  });

  test('RN-173.03: a lista inicial que chega DEPOIS do cadastro não apaga o novo do <select>', async () => {
    let soltar;
    respostaFornecedores = () => new Promise((r) => { soltar = () => r({ data: FORNECEDORES }); });
    await renderEm('/compras/pedidos/novo');
    await clicar(porTestId('pedido-novo-fornecedor'));
    await digitar(campoDaJanela('razao'), 'ACME NOVA LTDA');
    await salvarJanela();
    expect(porTestId('pedido-fornecedor').value).toBe(String(NOVO_ID));
    await act(async () => { soltar(); });
    await esperar();
    const select = porTestId('pedido-fornecedor');
    expect(select.value).toBe(String(NOVO_ID));
    expect(opcoesDo(select)).toEqual(['Selecione o fornecedor', 'ACME NOVA LTDA', 'Parafusos Sul', 'Aços Vale Ltda']);
  });
});

/* ── Cotação ──────────────────────────────────────────────────────────────────────────────────── */

describe('Etapa 173 — cotação', () => {
  test('RN-173.01/03: F2 na cotação nova abre a ficha; salvar escolhe o novo e não envia a cotação', async () => {
    await renderEm('/compras/cotacoes/nova');
    // cotação já válida (número + fornecedor 312): um submit que vazasse da janela a enviaria
    await digitar(porTestId('cotacao-numero'), 'COT-99');
    await digitar(porTestId('cotacao-fornecedor'), '312');
    await teclar('F2');
    expect(janela()).not.toBeNull();
    await digitar(campoDaJanela('razao'), 'COTA NOVA LTDA');
    await salvarJanela();
    expect(janela()).toBeNull();
    expect(porTestId('cotacao-fornecedor').value).toBe(String(NOVO_ID));
    expect(postsDe('/compras/cotacoes')).toHaveLength(0);
    expect(porTestId('lista-cotacoes')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Fornecedor COTA NOVA LTDA cadastrado e escolhido na cotação');
  });

  test('RN-173.05: cotação que já virou pedido — sem botão e o F2 não abre', async () => {
    cotacao50 = () => Promise.resolve({ data: { ...COTACAO_50, pedido_id: 640, pedido_numero: 'PC-2026-640' } });
    await renderEm('/compras/cotacoes/editar/50');
    expect(porTestId('cotacao-convertida')).not.toBeNull();
    expect(porTestId('cotacao-novo-fornecedor')).toBeNull();
    await teclar('F2');
    expect(janela()).toBeNull();
  });

  test('RN-173.05: METADE POSITIVA — cotação editável tem o botão', async () => {
    await renderEm('/compras/cotacoes/editar/50');
    expect(porTestId('cotacao-novo-fornecedor')).not.toBeNull();
  });
});

/* ── Grupo homologado ─────────────────────────────────────────────────────────────────────────── */

describe('Etapa 173 — grupo homologado (RN-173.08)', () => {
  const botaoNovo = () => [...container.querySelectorAll('button')].find((b) => /Novo fornecedor/.test(b.textContent));

  test('"Novo fornecedor" abre a ficha COMPLETA com o grupo do lugar, travado — não mais o modal de 3 campos', async () => {
    await renderEm('/compras/fornecedores-homologados/grupo/7');
    await clicar(botaoNovo());
    expect(janela()).not.toBeNull();
    expect(campoDaJanela('cep')).not.toBeNull();
    expect(campoDaJanela('telefone-vendedor')).not.toBeNull();
    expect(campoDaJanela('grupo').value).toBe('7');
    expect(campoDaJanela('grupo').disabled).toBe(true);
    // o modal antigo (razão, fantasia e CNPJ por placeholder) não existe mais
    expect(document.querySelector('input[placeholder="Razão social"]')).toBeNull();
  });

  test('salvar manda grupo_id 7, avisa e recarrega a lista do grupo', async () => {
    await renderEm('/compras/fornecedores-homologados/grupo/7');
    const cargasAntes = api.get.mock.calls.filter(([u]) => u === '/compras/grupos/7/fornecedores').length;
    await clicar(botaoNovo());
    await digitar(campoDaJanela('razao'), 'HOMOLOGADA LTDA');
    await salvarJanela();
    expect(postsDe('/compras/fornecedores')).toHaveLength(1);
    expect(postsDe('/compras/fornecedores')[0][1].grupo_id).toBe('7');
    expect(toast.success).toHaveBeenCalledWith('Fornecedor cadastrado e vinculado ao grupo');
    expect(janela()).toBeNull();
    const cargasDepois = api.get.mock.calls.filter(([u]) => u === '/compras/grupos/7/fornecedores').length;
    expect(cargasDepois).toBe(cargasAntes + 1);
  });

  test('F2 abre a mesma ficha; com o modal "Vincular fornecedor" aberto, não', async () => {
    await renderEm('/compras/fornecedores-homologados/grupo/7');
    await teclar('F2');
    expect(janela()).not.toBeNull();
    await clicar(janela().querySelector('[aria-label="Fechar"]'));

    await clicar([...container.querySelectorAll('button')].find((b) => /Vincular fornecedor/.test(b.textContent)));
    expect(container.querySelector('.modal-grupo-overlay')).not.toBeNull();
    await teclar('F2');
    expect(janela()).toBeNull();
  });
});
