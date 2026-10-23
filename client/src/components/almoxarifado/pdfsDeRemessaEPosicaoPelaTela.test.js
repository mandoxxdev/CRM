/**
 * Etapa 186, T5 — integracao: resposta REAL da rota (fixture) -> tela -> gerador -> reguas, nos tres documentos.
 *
 * As fixtures `utils/__fixtures__/remessa.rota.json` e `posicaoCliente.rota.json` sao gravadas por
 * `server/tests/api/pdfsRemessaPosicaoFixture.api.test.js` (CRM_GRAVAR_FIXTURE=1) com os textos longos da Fase 0: razao social de 69
 * letras, codigo de 25, nome de 71, projeto de 80, observacao longa. Aquele teste cai se a rota mudar as chaves e ninguem regravar.
 *
 * Mockadas so as fronteiras: `services/api` (HTTP), `qrcode` e `jspdf` — este com MEDIDAS REAIS: `getTextWidth`, `splitTextToSize`,
 * `setFont` e `setFontSize` vao para um jsPDF real (A4, mm); toda chamada e gravada em `mockPdf`. Molde das rotas e do clique:
 * `components/datasDoChatDeComprasEDoAlmoxarifadoNoDiaLocal.test.js`; do gravador: `EpiAlmoxarifado.test.js`. As reguas sao copiadas
 * aqui (nao importadas de outro teste — regra da 185).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/pdfsDeRemessaEPosicaoPelaTela --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api';
import RemessasTerceirosAlmoxarifado from './RemessasTerceirosAlmoxarifado';
import MateriaisClienteAlmoxarifado from './MateriaisClienteAlmoxarifado';
import EtiquetasPdfModal from './EtiquetasPdfModal';
import REMESSA_ROTA from '../../utils/__fixtures__/remessa.rota.json';
import POSICAO_ROTA from '../../utils/__fixtures__/posicaoCliente.rota.json';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn(), patch: jest.fn(), defaults: { baseURL: '/api' } },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Ana 186', role: 'admin', email: 'a186@t' }, loading: false }),
}));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn(), warn: jest.fn() } }));
jest.mock('qrcode', () => ({ __esModule: true, default: { toDataURL: () => Promise.resolve('data:image/png;base64,QQ==') } }));
const mockPdf = [];
// Funcao comum, nao jest.fn: o CRA liga `resetMocks`.
jest.mock('jspdf', () => {
  const erroOriginal = console.error;
  console.error = () => {};
  let JsPdfReal;
  try { ({ jsPDF: JsPdfReal } = jest.requireActual('jspdf')); } finally { console.error = erroOriginal; }
  return function JsPdfGravador() {
    const medidor = new JsPdfReal({ format: 'a4', orientation: 'portrait', unit: 'mm' });
    const soMedem = { getTextWidth: true, splitTextToSize: true };
    return new Proxy({}, {
      get: (_alvo, nome) => (...args) => {
        mockPdf.push([nome, ...args]);
        if (nome === 'setFontSize' || nome === 'setFont') medidor[nome](...args);
        if (soMedem[nome]) return medidor[nome](...args);
        return undefined;
      },
    });
  };
});

// ── Reguas ──────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const MARGEM = 196;
const FUNDO = 287;
let JsPdfDoTeste;
{
  const erroOriginal = console.error;
  console.error = () => {};
  try { ({ jsPDF: JsPdfDoTeste } = jest.requireActual('jspdf')); } finally { console.error = erroOriginal; }
}
const regua = new JsPdfDoTeste({ format: 'a4', orientation: 'portrait', unit: 'mm' });
const largura = (t, fonte, estilo = 'normal') => {
  regua.setFont('helvetica', estilo);
  regua.setFontSize(fonte);
  return regua.getTextWidth(String(t));
};
const semEspacos = (s) => String(s).replace(/\s+/g, '');

function textosGravados() {
  let fonte = 16;
  let estilo = 'normal';
  let pagina = 0;
  const saida = [];
  for (const [nome, ...args] of mockPdf) {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'setFont') estilo = args[1] || 'normal';
    if (nome === 'addPage') pagina += 1;
    if (nome === 'text') {
      const [t, x, y] = args;
      const linhas = Array.isArray(t) ? t : [t];
      linhas.forEach((l, j) => saida.push({ t: String(l), x, y: y + j * fonte * 1.15 * (25.4 / 72), fonte, estilo, pagina }));
    }
  }
  return saida;
}
function textosForaDaFolha() {
  return textosGravados().filter((e) => e.x + largura(e.t, e.fonte, e.estilo) > MARGEM || e.y > FUNDO)
    .map((e) => `${e.t} (x ${e.x}, fim ${(e.x + largura(e.t, e.fonte, e.estilo)).toFixed(1)}, y ${e.y.toFixed(1)}, f${e.fonte})`);
}
// As tabelas, na ordem: uma comeca num cabecalho ('Código') depois que a anterior fechou; cabecalho repetido na pagina nova e pulado
// (pela string, nao pelo x) e termina na `line` dele; a `line` fora de cabecalho fecha a tabela. Itens pela SEQUENCIA do x.
function tabelas() {
  let fonte = 16;
  let pagina = 0;
  let dentro = false;
  let noCabecalho = false;
  let anteriorX = null;
  const saida = [];
  let atual = null;
  for (const [nome, ...args] of mockPdf) {
    if (nome === 'setFontSize') fonte = args[0];
    if (nome === 'addPage') pagina += 1;
    if (nome === 'line') {
      if (noCabecalho) { noCabecalho = false; dentro = true; anteriorX = null; continue; }
      if (dentro) { dentro = false; atual.fechada = true; }
      continue;
    }
    if (nome !== 'text') continue;
    const [t, x, y] = args;
    if (t === 'Código') {
      if (!atual || atual.fechada) { atual = { itens: [], fechada: false }; saida.push(atual); }
      noCabecalho = true;
    }
    if (noCabecalho || !dentro) continue;
    if (x === 14 && anteriorX !== 14) atual.itens.push([]);
    atual.itens[atual.itens.length - 1].push({ t: String(t), x, y, fonte, pagina });
    anteriorX = x;
  }
  return saida;
}
function celulasInvasoras(itens, colunas) {
  const fora = [];
  for (const item of itens) {
    for (const c of item) {
      const i = colunas.indexOf(c.x);
      const limite = i < 0 ? -1 : (i < colunas.length - 1 ? colunas[i + 1] - 1 : MARGEM);
      if (i < 0 || c.fonte !== 9 || c.x + largura(c.t, 9) > limite) {
        fora.push(`${c.t} (x ${c.x}, fim ${(c.x + largura(c.t, 9)).toFixed(1)}, limite ${limite})`);
      }
    }
  }
  return fora;
}
const juncaoDaColuna = (item, x) => semEspacos(item.filter((c) => c.x === x).map((c) => c.t).join(''));

// ── Tela ────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
let container; let root; let rotas;
beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPdf.length = 0;
  rotas = [];
  localStorage.clear();
  api.get.mockImplementation((url, opcoes) => {
    const r = rotas.find(([casa]) => casa(String(url), opcoes));
    return Promise.resolve({ data: r ? r[1] : [] });
  });
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function esperar(cond, ms = 4000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou: ' + container.textContent.slice(0, 400));
}
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true, button: 0 })); }); };
const montar = async (el) => { await act(async () => { root.render(<MemoryRouter initialEntries={['/']}>{el}</MemoryRouter>); }); };
const botao = (t, escopo = container) => [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
const escolher = async (select, valor) => {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setValue.call(select, String(valor)); select.dispatchEvent(new Event('change', { bubbles: true })); });
};

test('guarda: as fixtures sao as da rota com os textos longos (sem isto o cenario nao exerce a quebra)', () => {
  expect(REMESSA_ROTA.itens[0].material_codigo).toHaveLength(25);
  expect(REMESSA_ROTA.itens[0].material_nome).toHaveLength(71);
  expect(REMESSA_ROTA.proprietario_cliente_nome).toHaveLength(69);
  expect(POSICAO_ROTA.cliente.razao_social).toHaveLength(69);
  expect(POSICAO_ROTA.aplicacoes.some((a) => (a.projeto_nome || '').length === 80)).toBe(true);
});

test('[RN-186.02/.05/.09] Remessas a terceiros -> abrir -> PDF da remessa: nada invade nem sai da folha; o nome de 71 inteiro; a assinatura abaixo da observacao', async () => {
  const { itens, ...cabecalho } = REMESSA_ROTA;
  rotas.push([(u) => u.startsWith(`/almoxarifado/remessas-terceiros/${REMESSA_ROTA.id}`), REMESSA_ROTA]);
  rotas.push([(u) => u.startsWith('/almoxarifado/remessas-terceiros'), [{ ...cabecalho, vencida: 0, itens_total: itens.length }]]);
  await montar(<RemessasTerceirosAlmoxarifado />);
  await esperar(() => container.textContent.includes(REMESSA_ROTA.numero));
  const linha = [...container.querySelectorAll('.almox-remessa-lista tbody tr')].find((tr) => tr.textContent.includes(REMESSA_ROTA.numero));
  await clicar(botao('Abrir', linha));
  await esperar(() => botao('PDF da remessa'));
  mockPdf.length = 0;
  await clicar(botao('PDF da remessa'));
  expect(mockPdf.some(([n]) => n === 'save')).toBe(true);

  const [tabela] = tabelas();
  expect(tabela.itens).toHaveLength(2);
  expect(celulasInvasoras(tabela.itens, [14, 48, 126, 142, 166])).toEqual([]);
  expect(textosForaDaFolha()).toEqual([]);
  // metade positiva: o nome de 71 inteiro na juncao da coluna Material (hoje perdia 31), e em mais de uma linha
  expect(juncaoDaColuna(tabela.itens[0], 48)).toBe(semEspacos(itens[0].material_nome));
  expect(juncaoDaColuna(tabela.itens[0], 14)).toBe(semEspacos(itens[0].material_codigo));
  // e a assinatura (1a `line` de 14 a 89) abaixo da ultima linha da observacao, olhando a pagina (M6)
  const textos = textosGravados();
  const iRotulo = textos.findIndex((e) => e.t === 'Observações:');
  const obs = [];
  for (let j = iRotulo + 1; j < textos.length && textos[j].x === 14 && !/^Responsável/.test(textos[j].t); j += 1) obs.push(textos[j]);
  expect(semEspacos(obs.map((e) => e.t).join(''))).toBe(semEspacos(REMESSA_ROTA.observacoes));
  const ultima = obs[obs.length - 1];
  let pagina = 0;
  let assinatura = null;
  for (const [nome, ...args] of mockPdf) {
    if (nome === 'addPage') pagina += 1;
    if (nome === 'line' && args[0] === 14 && args[2] === 89) assinatura = { pagina, y: args[1] };
  }
  expect(assinatura).not.toBeNull();
  expect((assinatura.pagina === ultima.pagina && assinatura.y > ultima.y + 4) || assinatura.pagina > ultima.pagina).toBe(true);
});

test('[RN-186.06/.07/.08/.09] Materiais de cliente -> PDF da posicao: nada invade nem sai da folha; titulo em 2 linhas; projeto de 80 inteiro', async () => {
  const cli = POSICAO_ROTA.cliente;
  rotas.push([(u) => u.split('?')[0] === '/almoxarifado/materiais-cliente/clientes',
    [{ cliente_id: cli.id, cliente_nome: cli.razao_social, materiais: POSICAO_ROTA.itens.length, saldo_total: 25 }]]);
  rotas.push([(u) => u.includes(`/materiais-cliente/posicao?cliente_id=${cli.id}`), POSICAO_ROTA]);
  await montar(<MateriaisClienteAlmoxarifado />);
  await esperar(() => container.querySelector(`.almox-filters select.almox-select option[value="${cli.id}"]`));
  await escolher(container.querySelector('.almox-filters select.almox-select'), cli.id);
  await esperar(() => botao('PDF') && !botao('PDF').disabled);
  mockPdf.length = 0;
  await clicar(botao('PDF'));
  expect(mockPdf.some(([n]) => n === 'save')).toBe(true);

  const [itens, aplicacoes] = tabelas();
  expect(itens.itens).toHaveLength(POSICAO_ROTA.itens.length);
  expect(aplicacoes.itens).toHaveLength(POSICAO_ROTA.aplicacoes.length);
  // fix-round da Fase 5 (M-b): as colunas de itens mudaram (Un. com 14 mm)
  expect(celulasInvasoras(itens.itens, [14, 48, 100, 115, 135, 155, 175])).toEqual([]);
  expect(celulasInvasoras(aplicacoes.itens, [14, 48, 144])).toEqual([]);
  expect(textosForaDaFolha()).toEqual([]);
  // metade positiva: titulo em 2 linhas de fonte 14, com a razao inteira
  const titulo = textosGravados().filter((e) => e.fonte === 14);
  expect(titulo).toHaveLength(2);
  expect(semEspacos(titulo.map((e) => e.t).join(''))).toBe(semEspacos(`Posição de materiais — ${cli.razao_social}`));
  // o projeto de 80 inteiro na coluna Aplicado em, e o nome de 71 inteiro na coluna Material
  const projeto = POSICAO_ROTA.aplicacoes.find((a) => (a.projeto_nome || '').length === 80).projeto_nome;
  expect(aplicacoes.itens.map((item) => juncaoDaColuna(item, 48))).toContain(semEspacos(projeto));
  const nome71 = POSICAO_ROTA.itens.find((i) => i.nome.length === 71).nome;
  expect(itens.itens.map((item) => juncaoDaColuna(item, 48))).toContain(semEspacos(nome71));
});

test('[RN-186.10] EtiquetasPdfModal -> Gerar: o codigo de 22 letras vai numa linha de fonte <= 13 e o nome fica abaixo', async () => {
  const etiqueta = { codigo: 'MP-ACO-INOX-304-CH-3MM', nome: 'Chapa de aco inox 304 2B 3,00 x 1250 x 3000 mm', linhaControle: '', qrUrl: 'https://x/1' };
  await act(async () => { root.render(<EtiquetasPdfModal etiquetas={[etiqueta]} onClose={() => {}} />); });
  const gerar = [...container.querySelectorAll('.almox-modal-footer button')].find((b) => b.textContent.trim() === 'Gerar');
  await clicar(gerar);
  await esperar(() => mockPdf.some(([n]) => n === 'save'));
  const textos = textosGravados();
  const codigo = textos.filter((e) => e.t === etiqueta.codigo);
  expect(codigo).toHaveLength(1);
  expect(codigo[0].estilo).toBe('bold');
  expect(codigo[0].fonte).toBeLessThanOrEqual(13);
  expect(largura(codigo[0].t, codigo[0].fonte, 'bold')).toBeLessThanOrEqual(55); // A4 (o padrao do modal): 99 - 4 - 32 - 8
  const nome = textos.find((e) => e.estilo === 'normal' && e.fonte === 8);
  expect(nome.y).toBeGreaterThan(codigo[0].y);
});
