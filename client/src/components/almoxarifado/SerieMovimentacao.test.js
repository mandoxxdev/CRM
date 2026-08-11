/**
 * Números de série na movimentação manual (Etapa 6b — Task 8).
 *
 * O backend (Tasks 1-7) já exige/efetiva séries no motor e expõe
 * `GET /almoxarifado/materiais/:id/series?status=EM_ESTOQUE` e o payload v2 aceita `series`
 * (array de strings, ENTRADA) e `serie_ids` (array de números, SAÍDA/SUCATA/PERDA). Esta task dá
 * à tela de Movimentações os campos que alimentam esses dois formatos: textarea com gerador de
 * sequência na entrada (série nasce aqui, texto livre — como o `lote` da Task 7), seletor de
 * checkboxes na saída (série é escolhida de uma já existente, nunca digitada — mesma razão do
 * `lote_id`: o motor não inventa série numa saída).
 *
 * Molde: `LoteSeletor.test.js` — mesmo padrão createRoot + act + querySelector (sem
 * @testing-library/react, que não está instalado neste projeto), renderizando a tela-pai
 * MovimentacoesAlmoxarifado inteira.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/SerieMovimentacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas: o alvo aqui é o comportamento da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

jest.mock('./ExtratoMaterialModal', () => ({
  __esModule: true,
  default: () => null,
}));

const MATERIAL_COM_SERIE = { id: 1, codigo: 'M-1', nome: 'Motor elétrico', unidade: 'PC', quantidade_atual: 50, controle_serie: 1 };
const MATERIAL_SEM_SERIE = { id: 1, codigo: 'M-1', nome: 'Parafuso', unidade: 'PC', quantidade_atual: 50, controle_serie: 0 };

let container;
let root;
let materiaisDoBanco;
let seriesDoBanco;
let lotesDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  materiaisDoBanco = [MATERIAL_COM_SERIE];
  seriesDoBanco = [];
  lotesDoBanco = [];
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url.includes('/series')) return Promise.resolve({ data: seriesDoBanco });
    if (url.includes('/lotes')) return Promise.resolve({ data: lotesDoBanco });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: materiaisDoBanco });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
}

function preencher(elemento, valor) {
  let proto;
  if (elemento.tagName === 'SELECT') proto = window.HTMLSelectElement.prototype;
  else if (elemento.tagName === 'TEXTAREA') proto = window.HTMLTextAreaElement.prototype;
  else proto = window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

/** Clique real (não atribuição de `.checked`): jsdom já cuida de alternar o estado e disparar
 * `click`+`change` como um navegador faria, e é isso que o handler React (`e.target.checked`)
 * enxerga corretamente — a mesma técnica de setter nativo usada em `preencher` para inputs de
 * texto não é necessária aqui porque não estamos definindo `value`, e sim simulando a interação
 * inteira do usuário. */
function marcarCheckbox(elemento, marcado) {
  if (elemento.checked === marcado) return;
  act(() => {
    elemento.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
  });
}

/** Um "tick" de macrotarefa: garante que a cadeia de microtarefas do fetch (lotes/séries) já
 * rodou antes de checar o DOM. */
async function esperarEfeitos() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Abre o modal, escolhe o material e o tipo pedido — os campos de série só existem depois
 * disso. Mesmo fluxo de LoteSeletor.test.js / MovimentacoesAlmoxarifado.test.js. */
async function abrirComMaterialETipo(tipo) {
  await renderizar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

  const selectMaterial = container.querySelector('.almox-modal select.almox-form-select');
  preencher(selectMaterial, '1');
  const selectTipo = seletorTipo();
  preencher(selectTipo, tipo);
  await esperarEfeitos();
}

function seletorTipo() {
  return [...container.querySelectorAll('.almox-modal select.almox-form-select')][1];
}

/** Acha o `.almox-field` cujo <label> bate com a regex — os blocos de série (textarea de
 * entrada e checkboxes de saída) não usam `almox-label`, então o texto é o único jeito de
 * diferenciá-los de Observações (também é `.almox-textarea`, rótulo diferente). */
function campoPorLabel(regex) {
  return [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((f) => regex.test(f.querySelector('label')?.textContent || ''));
}

function quantidadeInput() {
  return campoPorLabel(/Quantidade|Novo Saldo/).querySelector('input');
}

function motivoInput() {
  return campoPorLabel(/^Motivo/).querySelector('input');
}

function submeter() {
  const form = container.querySelector('.almox-modal form');
  return act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

describe('série na movimentação — entrada (textarea + gerador)', () => {
  test('ENTRADA com controle_serie mostra textarea e contador N/quantidade', async () => {
    await abrirComMaterialETipo('ENTRADA');
    preencher(quantidadeInput(), '3');
    const campo = campoPorLabel(/Números de série/);
    expect(campo).toBeTruthy();
    preencher(campo.querySelector('textarea'), 'GMP-1\nGMP-2');
    expect(campoPorLabel(/Números de série/).querySelector('small').textContent).toBe('2/3 série(s)');
  });

  test('gerar sequencia preenche a textarea (prefixo GMP-, inicio 5, qtd 3 -> GMP-5..GMP-7)', async () => {
    await abrirComMaterialETipo('ENTRADA');
    preencher(quantidadeInput(), '3');
    const campo = campoPorLabel(/Números de série/);
    const inputs = [...campo.querySelectorAll('input')];
    const prefixoInput = inputs.find((i) => (i.placeholder || '').includes('Prefixo'));
    const inicioInput = inputs.find((i) => (i.placeholder || '').includes('inicial'));
    preencher(prefixoInput, 'GMP-');
    preencher(inicioInput, '5');
    const botaoGerar = [...campo.querySelectorAll('button')].find((b) => b.textContent.includes('Gerar sequência'));
    await act(async () => { botaoGerar.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
    expect(campoPorLabel(/Números de série/).querySelector('textarea').value).toBe('GMP-5\nGMP-6\nGMP-7');
  });

  test('submit de entrada envia payload.series como array de linhas', async () => {
    await abrirComMaterialETipo('ENTRADA');
    preencher(quantidadeInput(), '2');
    const campo = campoPorLabel(/Números de série/);
    preencher(campo.querySelector('textarea'), 'GMP-1\nGMP-2');

    await submeter();
    await esperarEfeitos();

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/movimentacoes/v2', expect.objectContaining({
      series: ['GMP-1', 'GMP-2'],
    }));
  });
});

describe('série na movimentação — saída (checkboxes de EM_ESTOQUE)', () => {
  test('SAIDA lista series EM_ESTOQUE como checkboxes e envia serie_ids', async () => {
    seriesDoBanco = [
      { id: 501, numero: 'GMP-10', lote_id: 5, lote_codigo: 'L5', status: 'EM_ESTOQUE' },
      { id: 502, numero: 'GMP-11', lote_id: null, lote_codigo: null, status: 'EM_ESTOQUE' },
    ];
    await abrirComMaterialETipo('SAIDA');
    const campo = campoPorLabel(/Séries a entregar/);
    expect(campo).toBeTruthy();
    const checkboxes = [...campo.querySelectorAll('input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(2);

    marcarCheckbox(checkboxes[0], true);
    preencher(quantidadeInput(), '1');
    preencher(motivoInput(), 'Consumo em produção');

    await submeter();
    await esperarEfeitos();

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/movimentacoes/v2', expect.objectContaining({
      serie_ids: [501],
    }));
  });

  // Fix round 1 (review da Task 8): o filtro por lote no JSX só esconde o checkbox — sem o
  // efeito que sincroniza `form.serie_ids` com o que está visível, a série marcada de um lote
  // continuava no payload depois de trocar para outro lote (`{lote_id: 8, serie_ids: [501]}`,
  // série do lote 5 com lote_id 8). A contagem sozinha não pega isso (1 marcada = 1 esperada,
  // mesmo sendo a série errada) — só o conteúdo do array está errado.
  test('trocar o lote selecionado limpa series marcadas que saem do filtro', async () => {
    seriesDoBanco = [
      { id: 501, numero: 'GMP-10', lote_id: 5, lote_codigo: 'L5', status: 'EM_ESTOQUE' },
      { id: 502, numero: 'GMP-20', lote_id: 8, lote_codigo: 'L8', status: 'EM_ESTOQUE' },
    ];
    lotesDoBanco = [
      { id: 5, codigo: 'L5', status: 'ATIVO', saldo: 10, vencido: false, elegivel: true },
      { id: 8, codigo: 'L8', status: 'ATIVO', saldo: 10, vencido: false, elegivel: true },
    ];
    await abrirComMaterialETipo('SAIDA');

    // FEFO pré-seleciona o lote 5 (primeiro elegível da lista) — só a série desse lote aparece.
    const seletorLote = container.querySelector('#mov-lote');
    expect(seletorLote.value).toBe('5');
    let campoSaida = campoPorLabel(/Séries a entregar/);
    let checkboxes = [...campoSaida.querySelectorAll('input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(1);
    marcarCheckbox(checkboxes[0], true);
    expect(campoPorLabel(/Séries a entregar/).querySelector('small').textContent).toMatch(/^1\//);

    // Troca o lote para 8: a série 501 (do lote 5) sai do filtro — e não pode sobreviver
    // escondida em form.serie_ids.
    preencher(seletorLote, '8');
    await esperarEfeitos();

    campoSaida = campoPorLabel(/Séries a entregar/);
    checkboxes = [...campoSaida.querySelectorAll('input[type="checkbox"]')];
    expect(checkboxes).toHaveLength(1); // só a do lote 8 aparece agora
    expect(checkboxes[0].checked).toBe(false); // nenhuma marcação sobrou escondida
    expect(campoSaida.querySelector('small').textContent).toMatch(/^0\//);

    // Marca a série do lote 8 (a única visível) e confirma que o payload leva só ela.
    marcarCheckbox(checkboxes[0], true);
    preencher(quantidadeInput(), '1');
    preencher(motivoInput(), 'Consumo em produção');

    await submeter();
    await esperarEfeitos();

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/movimentacoes/v2', expect.objectContaining({
      lote_id: 8,
      serie_ids: [502],
    }));
  });
});

describe('série na movimentação — troca de tipo e material sem controle', () => {
  test('trocar o tipo limpa series e serie_ids (nao vazam para outro tipo)', async () => {
    seriesDoBanco = [{ id: 501, numero: 'GMP-10', lote_id: null, lote_codigo: null, status: 'EM_ESTOQUE' }];
    await abrirComMaterialETipo('ENTRADA');
    preencher(campoPorLabel(/Números de série/).querySelector('textarea'), 'GMP-1\nGMP-2');

    preencher(seletorTipo(), 'SAIDA');
    await esperarEfeitos();

    // O bloco de entrada some — nenhuma série de texto sobrevive escondida no estado.
    expect(campoPorLabel(/Números de série/)).toBeUndefined();
    const campoSaida = campoPorLabel(/Séries a entregar/);
    marcarCheckbox(campoSaida.querySelector('input[type="checkbox"]'), true);

    preencher(seletorTipo(), 'ENTRADA');
    await esperarEfeitos();

    expect(campoPorLabel(/Números de série/).querySelector('textarea').value).toBe('');
  });

  test('material sem controle_serie nao mostra nada de serie', async () => {
    materiaisDoBanco = [MATERIAL_SEM_SERIE];
    await abrirComMaterialETipo('ENTRADA');
    expect(campoPorLabel(/Números de série/)).toBeUndefined();

    preencher(seletorTipo(), 'SAIDA');
    await esperarEfeitos();
    expect(campoPorLabel(/Séries a/)).toBeUndefined();
  });
});
