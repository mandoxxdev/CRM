/**
 * Etapa 130 (RN-07, B840) — no painel do recebimento em Faturamento, o item que JÁ deu entrada no estoque (a nota que entrou em
 * parte) mostra o lote, as séries e o valor unitário travados, com a frase do porquê. O servidor recusa mudar esses campos (L8/L9);
 * sem a trava na tela, a pessoa editaria, salvaria e perderia o modal inteiro numa recusa. O ICMS e a redução continuam editáveis
 * (ninguém os lê depois da entrada — B839), e o item que não entrou continua com tudo aberto.
 *
 * Disciplina do arnês de Recebimentos: URL inesperada no mock REJEITA; toda asserção negativa tem a metade positiva.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/RecebimentosItemEntrado.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RecebimentosAlmoxarifado from './RecebimentosAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const FRASE = 'Já deu entrada no estoque — lote, séries e valor unitário não mudam mais por aqui.';

const RECEBIMENTOS = [{
  id: 96, numero: 'REC-2026-096', nota_fiscal: 'NF-9600', pedido_compra_numero: null,
  fornecedor_nome: 'Aços Vale Ltda', status: 'EM_ENTRADA_NF', created_at: '2026-10-16T10:00:00Z',
}];
const COMUNS = { unidade: 'UN', quantidade_esperada: 2, quantidade_recebida: 2, valor_total: 20, valor_icms: 1, valor_ipi: 0,
  reducao_icms_percent: 0, conferencia_quantidade: 1, conferencia_descricao: 1, data_fabricacao_lote: '2026-09-01', corrida_lote: 'C1' };
const ITENS = [
  { ...COMUNS, id: 961, material_id: 31, material_codigo: 'ALM-0301', material_nome: 'Válvula Esfera', lote: 'L-ORIG',
    data_validade_lote: '2027-01-31', series: 'S1\nS2', valor_unitario: 10, entrada_estoque_em: '2026-10-16 11:00:00' },
  { ...COMUNS, id: 962, material_id: 32, material_codigo: 'ALM-0302', material_nome: 'Flange Cego', lote: 'L-B',
    data_validade_lote: '2027-02-28', series: 'T1\nT2', valor_unitario: 7, entrada_estoque_em: null },
];
const DETALHE = {
  ...RECEBIMENTOS[0], fornecedor_cnpj: null, valor_total_nota: 34, chave_nfe: null, nota_serie: '1',
  data_emissao_nf: '2026-10-16', data_entrada_nf: '2026-10-16', observacoes: null, contas_pagar_id: null, itens: ITENS,
};
const MATERIAIS = [{ id: 31, codigo: 'ALM-0301', nome: 'Válvula Esfera', controle_serie: 1 },
  { id: 32, codigo: 'ALM-0302', nome: 'Flange Cego', controle_serie: 1 }];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: RECEBIMENTOS });
    if (url === '/almoxarifado/recebimentos/96') return Promise.resolve({ data: DETALHE });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.put.mockImplementation(() => Promise.resolve({ data: { success: true } }));
  api.post.mockImplementation(() => Promise.resolve({ data: { success: true } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const blocoDo = (id) => container.querySelector(`[data-testid="item-detalhe-${id}"]`);
const campo = (bloco, sel) => bloco.querySelector(sel);
const CAMPOS_TRAVADOS = ['input[placeholder="Vlr. unit."]', 'input[placeholder="Lote"]', 'input[title="Validade do lote"]',
  'input[title="Data de fabricação do lote"]', 'input[placeholder="Corrida"]', 'textarea'];
const CAMPOS_ABERTOS = ['input[placeholder="ICMS"]', 'input[placeholder="Red. ICMS %"]'];

async function abrirDetalhe() {
  await act(async () => { root.render(<MemoryRouter><RecebimentosAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
  const linha = [...container.querySelectorAll('.almox-table tbody tr')].find((tr) => tr.textContent.includes('REC-2026-096'));
  await clicar(linha);
  await esperarEfeitos();
}

test('(a) o item que já entrou trava lote, datas, corrida, séries e valor unitário, com a frase; ICMS e redução continuam abertos', async () => {
  await abrirDetalhe();
  const entrado = blocoDo(961);
  expect(entrado).not.toBeNull();
  for (const sel of CAMPOS_TRAVADOS) {
    const el = campo(entrado, sel);
    expect(el).not.toBeNull();
    expect(el.disabled).toBe(true);
  }
  for (const sel of CAMPOS_ABERTOS) {
    const el = campo(entrado, sel);
    expect(el).not.toBeNull();
    expect(el.disabled).toBe(false);
  }
  expect(entrado.textContent).toContain(FRASE);
  // os valores gravados continuam à vista
  expect(campo(entrado, 'input[placeholder="Lote"]').value).toBe('L-ORIG');
  expect(campo(entrado, 'textarea').value).toBe('S1\nS2');
});

test('(b) o item que não entrou continua com tudo aberto e sem a frase', async () => {
  await abrirDetalhe();
  const aberto = blocoDo(962);
  expect(aberto).not.toBeNull();
  for (const sel of [...CAMPOS_TRAVADOS, ...CAMPOS_ABERTOS]) {
    const el = campo(aberto, sel);
    expect(el).not.toBeNull();
    expect(el.disabled).toBe(false);
  }
  expect(aberto.textContent).not.toContain(FRASE);
  expect(blocoDo(961).textContent).toContain(FRASE);
});

test('(d) Fase 2 I4: o Processar que falha no meio recarrega o painel — o item que entrou antes da falha aparece travado', async () => {
  // antes de processar, nenhum item entrou; o processamento da entrada do 961 e falha no 962 (a nota parcial)
  let processou = false;
  const antes = { ...DETALHE, itens: ITENS.map((i) => ({ ...i, entrada_estoque_em: null })) };
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: RECEBIMENTOS });
    if (url === '/almoxarifado/recebimentos/96') return Promise.resolve({ data: processou ? DETALHE : antes });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [] });
    if (/^\/almoxarifado\/materiais\/\d+\/sugestao-localizacao$/.test(url)) return Promise.resolve({ data: { padrao: null, sugestoes: [] } });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos/96/processar') {
      processou = true;
      // Fase 5 (r3 R38): o status REAL da falha no meio e 400 (o motor recusa a serie: medido, sonda e130r3-sonda-r38)
      return Promise.reject(Object.assign(new Error('400'), { response: { status: 400, data: { error: 'Falha no meio' } } }));
    }
    return Promise.resolve({ data: { success: true } });
  });
  await abrirDetalhe();
  expect(campo(blocoDo(961), 'input[placeholder="Lote"]').disabled).toBe(false);   // antes: nada entrou
  await clicar(botaoPorTexto('Processar Nota'));
  await clicar(container.querySelector('[data-testid="confirmar-processar"]'));
  await esperarEfeitos();
  expect(container.textContent).toContain('Falha no meio');
  expect(campo(blocoDo(961), 'input[placeholder="Lote"]').disabled).toBe(true);
  expect(blocoDo(961).textContent).toContain(FRASE);
  expect(campo(blocoDo(962), 'input[placeholder="Lote"]').disabled).toBe(false);
});

test('(e) Fase 5 r1 M1: o Processar que falha nao apaga o que foi digitado e nao salvo no item que não entrou', async () => {
  let processou = false;
  const antes = { ...DETALHE, itens: ITENS.map((i) => ({ ...i, entrada_estoque_em: null })) };
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: RECEBIMENTOS });
    if (url === '/almoxarifado/recebimentos/96') return Promise.resolve({ data: processou ? DETALHE : antes });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [] });
    if (/^\/almoxarifado\/materiais\/\d+\/sugestao-localizacao$/.test(url)) return Promise.resolve({ data: { padrao: null, sugestoes: [] } });
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos/96/processar') {
      processou = true;
      return Promise.reject(Object.assign(new Error('400'), { response: { status: 400, data: { error: 'Falha no meio' } } }));
    }
    return Promise.resolve({ data: { success: true } });
  });
  await abrirDetalhe();
  // digita (e não salva) um lote novo no 962 e no 961
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  for (const [id, valor] of [[962, 'L-DIGITADO'], [961, 'L-PERDIDO']]) {
    const el = campo(blocoDo(id), 'input[placeholder="Lote"]');
    await act(async () => { setter.call(el, valor); el.dispatchEvent(new Event('input', { bubbles: true })); });
  }
  expect(campo(blocoDo(962), 'input[placeholder="Lote"]').value).toBe('L-DIGITADO');
  await clicar(botaoPorTexto('Processar Nota'));
  await clicar(container.querySelector('[data-testid="confirmar-processar"]'));
  await esperarEfeitos();
  // o 962 (não entrou) guarda o digitado; o 961 (entrou) mostra o que o servidor tem e fica travado
  expect(campo(blocoDo(962), 'input[placeholder="Lote"]').value).toBe('L-DIGITADO');
  expect(campo(blocoDo(962), 'input[placeholder="Lote"]').disabled).toBe(false);
  expect(campo(blocoDo(961), 'input[placeholder="Lote"]').value).toBe('L-ORIG');
  expect(campo(blocoDo(961), 'input[placeholder="Lote"]').disabled).toBe(true);
});

test('(c) salvar os dados fiscais manda o eco do item que entrou (o que está gravado)', async () => {
  await abrirDetalhe();
  await clicar(botaoPorTexto('Preencher Dados da NF'));
  const form = [...container.querySelectorAll('form')].find((f) => f.textContent.includes('Salvar Dados Fiscais'));
  expect(form).not.toBeUndefined();
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperarEfeitos();
  const chamadas = api.put.mock.calls.filter(([url]) => url === '/almoxarifado/recebimentos/96/fiscal');
  expect(chamadas).toHaveLength(1);
  const it961 = chamadas[0][1].itens.find((i) => i.id === 961);
  expect(it961).toMatchObject({ lote: 'L-ORIG', data_validade_lote: '2027-01-31', data_fabricacao_lote: '2026-09-01',
    corrida_lote: 'C1', series: 'S1\nS2', valor_unitario: 10, valor_total: 20 });
  expect(chamadas[0][1].itens.find((i) => i.id === 962)).toMatchObject({ lote: 'L-B', valor_unitario: 7 });
});
