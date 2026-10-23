/**
 * Etapa 9b, Task 7 — tela "Ferramentas" (patrimônio emprestável + calibração).
 *
 * O alvo aqui e o que SO a tela pode errar: o payload de POST .../emprestar (contrato
 * congelado no design), a mensagem de recusa do backend aparecendo (RN-03), o gate de escrita
 * unico `gerenciar_ferramentas` escondendo as acoes de linha, e o painel de calibracao separando
 * vencidas de a-vencer. O motor (maquina de estados, claim atomico, auditoria) tem teste de
 * servico e de rota no servidor (toolFundacao.api.test.js, toolEmprestimo.api.test.js) — nao
 * duplicado aqui.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=FerramentasAlmoxarifado
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FerramentasAlmoxarifado from './FerramentasAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
// Permissoes: por padrao tudo liberado. mockPode troca em runtime (mesmo padrao de
// SobrasAlmoxarifado.test.js) — o gate REAL continua sendo do servidor.
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR',
    pode: (acao) => mockPode(acao),
    bloquearSeNaoPode: (acao, ev) => {
      if (mockPode(acao)) return true;
      if (ev && ev.preventDefault) ev.preventDefault();
      return false;
    },
    loading: false,
  }),
}));
const mockPdf = [];
// Funcao comum, nao jest.fn: o CRA liga `resetMocks` e apagaria a implementacao antes de cada teste (molde EpiAlmoxarifado.test.js).
// Etapa 185 (T2): o termo passa a quebrar por LARGURA (getTextWidth/splitTextToSize) — essas medidas vao para um jsPDF REAL (molde:
// EpiAlmoxarifado.test.js da 183); o resto continua gravado. O console.error do carregamento (sonda de canvas do jsdom) e calado.
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
        if (nome === 'setFontSize') medidor.setFontSize(...args);
        if (soMedem[nome]) return medidor[nome](...args);
        mockPdf.push([nome, ...args]);
        return undefined;
      },
    });
  };
});

// Etapa 180 — o termo de responsabilidade (contrato da T2 no plano da etapa).
const COLABORADORES = [
  { id: 7, nome: 'Carlos Pereira', matricula: 'M-700', setor: 'Manutenção' },
  { id: 8, nome: 'Ana Costa', matricula: 'M-800', setor: null },
];
const TEXTO_V1 = 'TEXTO PROVISÓRIO — substituir pelo termo da empresa.\nDeclaro que recebi a ferramenta em perfeito estado.';
const TEXTO_V2 = 'Declaro que recebi a ferramenta e me responsabilizo por ela (texto da empresa).';
const TERMO_V1 = { vigente: { versao: 1, texto: TEXTO_V1, criado_em: '2026-10-22T12:00:00.000Z', criado_por_nome: 'Sistema', provisorio: true },
  historico: [{ versao: 1, texto: TEXTO_V1, criado_em: '2026-10-22T12:00:00.000Z', criado_por_nome: 'Sistema', provisorio: true }] };
const TERMO_V2 = { vigente: { versao: 2, texto: TEXTO_V2, criado_em: '2026-10-22T15:00:00.000Z', criado_por_nome: 'Admin', provisorio: false },
  historico: [{ versao: 2, texto: TEXTO_V2, criado_em: '2026-10-22T15:00:00.000Z', criado_por_nome: 'Admin', provisorio: false },
    TERMO_V1.historico[0]] };
const HASH = 'c0ffee1234567890'.padEnd(64, 'b');
const TERMO_DO_EMPRESTIMO = {
  emprestimo: { id: 20, ferramenta_id: 2, ferramenta_nome: 'Paquímetro digital', codigo_patrimonio: 'FER-002', status: 'EMPRESTADA',
    data_retirada: '2026-08-01 10:00:00', data_prevista_devolucao: '2026-08-10', data_devolucao_real: null },
  termo: { numero: 'TERMO-20260801-0001', versao: 1, texto: TEXTO_V1, texto_sha256: 'd'.repeat(64), provisorio: true,
    ferramenta: { id: 2, codigo_patrimonio: 'FER-002', numero_serie: 'SN-2002', nome: 'Paquímetro digital' },
    colaborador: { id: 9, nome: 'João Silva', matricula: 'M-900', setor: 'Qualidade' },
    data_prevista_devolucao: '2026-08-10', criado_por_nome: 'Joao Almoxarife', criado_em: '2026-08-01T13:00:00.000Z' },
  evidencia: { id: 60, arquivo_url: '/api/uploads/almoxarifado/assinatura-termo-1.png?exp=1&sig=a', arquivo_sha256: 'f'.repeat(64),
    registro_sha256: HASH, confirmado_por_matricula: 1, criado_em: '2026-08-01T13:00:00.000Z', sequencia: 3 },
};
const BLOB_PNG = new Blob(['png'], { type: 'image/png' });

// Shape real de toolService.listarFerramentas: calibracao_vigente e bool|null (null quando a
// ferramenta nao exige calibracao), emprestimo_aberto e {id, colaborador_nome,
// data_prevista_devolucao}|null. exige_calibracao chega 0/1 do SQLite (contrato congelado).
const FERRAMENTAS = [
  { id: 1, codigo_patrimonio: 'FER-001', nome: 'Furadeira de bancada', tipo: 'Elétrica',
    setor_responsavel: 'Produção', status: 'DISPONIVEL', numero_serie: 'SN-1001',
    localizacao_id: 5, exige_calibracao: 0, calibracao_vigente: null, emprestimo_aberto: null },
  { id: 2, codigo_patrimonio: 'FER-002', nome: 'Paquímetro digital', tipo: 'Instrumento',
    setor_responsavel: 'Qualidade', status: 'EMPRESTADA', numero_serie: 'SN-2002',
    localizacao_id: null, exige_calibracao: 1, calibracao_vigente: true,
    emprestimo_aberto: { id: 20, colaborador_nome: 'João Silva', data_prevista_devolucao: '2026-08-10' } },
  { id: 3, codigo_patrimonio: 'FER-003', nome: 'Multímetro', tipo: 'Instrumento',
    setor_responsavel: 'Manutenção', status: 'BLOQUEADA', numero_serie: null,
    localizacao_id: null, exige_calibracao: 1, calibracao_vigente: false, emprestimo_aberto: null },
];

// GET /emprestimos (toolService.listarEmprestimos): join com ferramenta (ferramenta_nome,
// codigo_patrimonio). O emprestimo 20 tem data_prevista_devolucao NO PASSADO em relacao a
// "hoje" do teste (mockado abaixo) — prova o destaque de vencido sem precisar de filtro.
const EMPRESTIMOS = [
  { id: 20, ferramenta_id: 2, codigo_patrimonio: 'FER-002', ferramenta_nome: 'Paquímetro digital',
    colaborador_nome: 'João Silva', setor: 'Qualidade', data_retirada: '2026-08-01',
    data_prevista_devolucao: '2026-08-10', data_devolucao_real: null, status: 'EMPRESTADA', observacoes: null, tem_termo: true },
  { id: 21, ferramenta_id: 1, codigo_patrimonio: 'FER-001', ferramenta_nome: 'Furadeira de bancada',
    colaborador_nome: 'Maria Souza', setor: 'Produção', data_retirada: '2026-07-01',
    data_prevista_devolucao: '2026-07-05', data_devolucao_real: '2026-07-04', status: 'DEVOLVIDA', observacoes: null, tem_termo: false },
];

// GET /calibracoes/painel: {vencidas:[], a_vencer:[]} — FER-003 vencida, FER-002 a vencer. Os
// dois nomes NAO podem aparecer trocados de secao (o teste de painel prova isso).
//
// FER-004 e uma ferramenta que NUNCA foi calibrada — decisao do design (D3):
// `calibracaoVigente` nao acha nenhum registro, entao o backend classifica em `vencidas` mesmo
// sem `data_validade`/`dias_restantes` (os dois vem null, nao ha calibracao nenhuma para tirar
// esses numeros). O fallback generico ("Vencida", "—") tem de aguentar isso sem quebrar.
const PAINEL = {
  vencidas: [
    { id: 100, ferramenta_id: 3, codigo_patrimonio: 'FER-003', nome: 'Multímetro',
      data_validade: '2026-08-01', dias_restantes: -18 },
    { id: null, ferramenta_id: 4, codigo_patrimonio: 'FER-004', nome: 'Trena a laser',
      data_validade: null, dias_restantes: null },
  ],
  a_vencer: [{ id: 101, ferramenta_id: 2, codigo_patrimonio: 'FER-002', nome: 'Paquímetro digital',
    data_validade: '2026-09-01', dias_restantes: 13 }],
};

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  mockPdf.length = 0;
  // o que o jsdom nao tem (canvas 2D, toBlob, pointer capture) — o mesmo shim de AssinaturaCanvas.test.js
  HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
    fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
    fillRect: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(), lineTo: jest.fn(), stroke: jest.fn(),
  }));
  HTMLCanvasElement.prototype.toBlob = jest.fn(function (cb) { cb(BLOB_PNG); });
  HTMLElement.prototype.setPointerCapture = jest.fn();
  HTMLElement.prototype.releasePointerCapture = jest.fn();
  global.fetch = jest.fn().mockRejectedValue(new Error('sem rede no teste'));
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/aux/colaboradores') return Promise.resolve({ data: COLABORADORES });
    if (url === '/almoxarifado/termos/FERRAMENTA') return Promise.resolve({ data: TERMO_V1 });
    if (url === '/almoxarifado/ferramentas/emprestimos/20/termo') return Promise.resolve({ data: TERMO_DO_EMPRESTIMO });
    if (url === '/almoxarifado/ferramentas/emprestimos/20/termo/verificar') return Promise.resolve({ data: { integro: true } });
    if (url === '/almoxarifado/ferramentas') return Promise.resolve({ data: FERRAMENTAS });
    if (url === '/almoxarifado/emprestimos') return Promise.resolve({ data: EMPRESTIMOS });
    if (url === '/almoxarifado/calibracoes/painel') return Promise.resolve({ data: PAINEL });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [] });
    if (url.match(/\/ferramentas\/\d+\/manutencoes$/)) return Promise.resolve({ data: [{ id: 900, data_fim: null }] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 999 } });
  api.put.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter initialEntries={['/almoxarifado/ferramentas']}><FerramentasAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const linhasFerramentas = () => [...container.querySelectorAll('.almox-ferramenta-lista tbody tr')];
const linhasEmprestimos = () => [...container.querySelectorAll('.almox-emprestimo-lista tbody tr')];
const linhasVencidas = () => [...container.querySelectorAll('.almox-calibracao-vencidas tbody tr')];
const linhasAVencer = () => [...container.querySelectorAll('.almox-calibracao-a-vencer tbody tr')];
const texto = () => container.textContent;
function botao(t, escopo = container) {
  return [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
}
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
function preencher(el, valor) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
      : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const campo = (rotulo, raiz = '.almox-modal') => [...container.querySelectorAll(`${raiz} .almox-field`)]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo))
  ?.querySelector('input, textarea, select');

describe('FerramentasAlmoxarifado — três visões', () => {
  test('renderiza as abas Ferramentas, Empréstimos e Calibrações', async () => {
    await renderizar();
    expect(botao('Ferramentas')).toBeTruthy();
    expect(botao('Empréstimos')).toBeTruthy();
    expect(botao('Calibrações')).toBeTruthy();

    // Ferramentas (default)
    expect(container.querySelector('.almox-ferramenta-lista')).toBeTruthy();

    await clicar(botao('Empréstimos'));
    expect(container.querySelector('.almox-emprestimo-lista')).toBeTruthy();
    expect(linhasEmprestimos()).toHaveLength(EMPRESTIMOS.length);
    expect(texto()).toContain('Vencido'); // emprestimo 20: previsao no passado (RN-06/histórico)

    await clicar(botao('Calibrações'));
    expect(container.querySelector('.almox-calibracao-vencidas')).toBeTruthy();
    expect(container.querySelector('.almox-calibracao-a-vencer')).toBeTruthy();
  });
});

describe('FerramentasAlmoxarifado — lista de ferramentas', () => {
  test('lista as ferramentas do mock com código, nome e status', async () => {
    await renderizar();
    expect(linhasFerramentas()).toHaveLength(FERRAMENTAS.length);
    expect(texto()).toContain('FER-001');
    expect(texto()).toContain('Furadeira de bancada');
    expect(texto()).toContain('Disponível');
    expect(texto()).toContain('Emprestada');
    expect(texto()).toContain('Bloqueada');
  });

  test('lista vazia mostra estado vazio, não tabela em branco', async () => {
    api.get.mockImplementation((url) => (url === '/almoxarifado/ferramentas' ? Promise.resolve({ data: [] }) : Promise.resolve({ data: [] })));
    await renderizar();
    expect(linhasFerramentas()).toHaveLength(0);
    expect(texto()).toMatch(/nenhuma ferramenta/i);
  });
});

// Etapa 180 (T3): o emprestimo virou multipart com o termo assinado (RN-180.03/04). Antes a tela mandava JSON com
// `colaborador_nome` digitado — que o servidor da T2 recusa com 400 "A assinatura do colaborador é obrigatória".
const pointer = (tipo, x, y) => {
  const ev = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  return ev;
};
async function assinar() {
  const canvas = container.querySelector('.almox-modal canvas');
  act(() => { canvas.dispatchEvent(pointer('pointerdown', 10, 10)); });
  act(() => { canvas.dispatchEvent(pointer('pointermove', 40, 30)); });
  act(() => { canvas.dispatchEvent(pointer('pointerup', 40, 30)); });
  await clicar(botao('Confirmar assinatura'));
}
const $ = (sel) => container.querySelector(sel);
const rodapeModal = () => container.querySelector('.almox-modal-footer');
async function abrirEmprestimo() {
  await renderizar();
  await clicar(botao('Emprestar', linhasFerramentas()[0])); // FER-001, DISPONIVEL
}
async function preencherEmprestimo({ colaborador = '7', matricula = 'M-700', data = '2026-11-05' } = {}) {
  preencher($('#emprestimo-colaborador'), colaborador);
  if (data) preencher($('#emprestimo-data-prevista'), data);
  preencher($('#emprestimo-confirmacao-matricula'), matricula);
}
const postsEmprestar = () => api.post.mock.calls.filter(([url]) => url === '/almoxarifado/ferramentas/1/emprestar');

describe('FerramentasAlmoxarifado — emprestar (Etapa 180, termo de responsabilidade)', () => {
  test('o modal traz o colaborador do cadastro (nome e setor, sem a matrícula) e o texto VIGENTE com o selo "Texto provisório"', async () => {
    await abrirEmprestimo();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/aux/colaboradores');
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/termos/FERRAMENTA');
    expect([...$('#emprestimo-colaborador').options].map((o) => o.textContent))
      .toEqual(['Selecione...', 'Carlos Pereira (Manutenção)', 'Ana Costa']);
    expect($('.almox-termo-texto').textContent).toBe(TEXTO_V1);
    expect(container.querySelector('.almox-modal').textContent).toContain('Termo de responsabilidade — versão 1');
    expect($('.almox-modal .almox-termo-provisorio').textContent).toBe('Texto provisório');
    expect($('.almox-modal canvas')).not.toBeNull();
    // o campo digitado de antes nao existe mais
    expect(campo('Setor')).toBeFalsy();
  });

  test('sem provisório: o selo não aparece', async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/termos/FERRAMENTA' ? Promise.resolve({ data: TERMO_V2 }) : base(url, cfg)));
    await abrirEmprestimo();
    expect($('.almox-termo-texto').textContent).toBe(TEXTO_V2);
    expect($('.almox-modal .almox-termo-provisorio')).toBeNull();
  });

  test('envio: um POST multipart com os campos do contrato (termo_versao, chave, PNG em `assinatura`), sem colaborador_nome', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 31, termo: { numero: 'TERMO-20261022-0001', versao: 1, evidencia: { id: 61 } } } });
    await abrirEmprestimo();
    await preencherEmprestimo();
    preencher($('#emprestimo-observacoes'), '  caixa azul  ');
    await assinar();
    expect(container.querySelector('.almox-modal').textContent).toContain('Assinatura confirmada');
    await clicar(botao('Emprestar', rodapeModal()));
    expect(postsEmprestar()).toHaveLength(1);
    const [, corpo, cfg] = postsEmprestar()[0];
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get('colaborador_id')).toBe('7');
    expect(corpo.get('confirmacao_matricula')).toBe('M-700');
    expect(corpo.get('termo_versao')).toBe('1');
    expect(corpo.get('data_prevista_devolucao')).toBe('2026-11-05');
    expect(corpo.get('observacoes')).toBe('caixa azul');
    expect(corpo.get('chave_idempotencia')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(corpo.get('assinatura').type).toBe('image/png');
    expect(corpo.has('colaborador_nome')).toBe(false);
    expect(corpo.has('setor')).toBe(false);
    expect(cfg.headers['Content-Type']).toBe('multipart/form-data');
    expect(toast.success).toHaveBeenCalledWith('Ferramenta emprestada — termo TERMO-20261022-0001 assinado');
    expect(container.querySelector('.almox-modal')).toBeFalsy();
  });

  test('sem a matrícula digitada: a frase do servidor e nada é enviado', async () => {
    await abrirEmprestimo();
    await preencherEmprestimo({ matricula: '   ' });
    await assinar();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(postsEmprestar()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith('O colaborador deve digitar a própria matrícula para assinar o termo');
  });

  test('sem assinatura e sem colaborador: recusa na tela com a frase, sem POST', async () => {
    await abrirEmprestimo();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(toast.error).toHaveBeenLastCalledWith('Selecione o colaborador');
    await preencherEmprestimo();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(toast.error).toHaveBeenLastCalledWith('A assinatura do colaborador é obrigatória');
    expect(postsEmprestar()).toHaveLength(0);
  });

  test('409 de versão trocada: recarrega o texto (v2), pede nova assinatura, avisa — e o reenvio vai com termo_versao 2', async () => {
    let versaoNoServidor = 1;
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/termos/FERRAMENTA'
      ? Promise.resolve({ data: versaoNoServidor === 1 ? TERMO_V1 : TERMO_V2 }) : base(url, cfg)));
    api.post.mockImplementationOnce(() => {
      versaoNoServidor = 2;
      return Promise.reject({ response: { status: 409, data: { error: 'O texto do termo mudou (versão 2) — releia e assine de novo' } } });
    });
    await abrirEmprestimo();
    await preencherEmprestimo();
    await assinar();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(toast.error).toHaveBeenCalledWith('O texto do termo mudou — releia e assine de novo');
    expect($('.almox-termo-aviso').textContent).toBe('O texto do termo mudou — releia e assine de novo');
    expect($('.almox-termo-texto').textContent).toBe(TEXTO_V2);
    expect(container.querySelector('.almox-modal').textContent).toContain('versão 2');
    // a assinatura do texto velho nao vale: o canvas volta
    expect(container.querySelector('.almox-modal').textContent).not.toContain('Assinatura confirmada');
    expect($('.almox-modal canvas')).not.toBeNull();
    const chave1 = postsEmprestar()[0][1].get('chave_idempotencia');
    api.post.mockResolvedValueOnce({ data: { id: 32, termo: { numero: 'TERMO-20261022-0002', versao: 2 } } });
    await assinar();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(postsEmprestar()).toHaveLength(2);
    expect(postsEmprestar()[1][1].get('termo_versao')).toBe('2');
    expect(postsEmprestar()[1][1].get('chave_idempotencia')).not.toBe(chave1);
  });

  test.each([
    [409, 'A ferramenta não está disponível'],
    [400, 'Ferramenta com calibração vencida ou sem calibração registrada'],
    [400, 'A matrícula informada não confere com a do colaborador'],
  ])('o %i do servidor aparece literal e a janela fica aberta: %s', async (status, frase) => {
    api.post.mockRejectedValueOnce({ response: { status, data: { error: frase } } });
    await abrirEmprestimo();
    await preencherEmprestimo();
    await assinar();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(toast.error).toHaveBeenCalledWith(frase);
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
  });

  test('a rede cai sem resposta: o próximo toque reusa a MESMA chave; o 200 reutilizado avisa que não duplicou', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await abrirEmprestimo();
    await preencherEmprestimo();
    await assinar();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(toast.error).toHaveBeenCalledWith(
      'Sem resposta do servidor — o empréstimo pode ter sido registrado. Toque em "Emprestar" de novo: o reenvio não duplica.');
    api.post.mockResolvedValueOnce({ data: { id: 31, reutilizada: true, termo: { numero: 'TERMO-20261022-0001', versao: 1 } } });
    await clicar(botao('Emprestar', rodapeModal()));
    expect(postsEmprestar()).toHaveLength(2);
    expect(postsEmprestar()[1][1].get('chave_idempotencia')).toBe(postsEmprestar()[0][1].get('chave_idempotencia'));
    expect(toast.success).toHaveBeenCalledWith('Empréstimo já estava registrado (termo TERMO-20261022-0001) — o envio repetido não duplicou');
  });

  test('o texto do termo não carregou: não deixa assinar o que não mostrou', async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/termos/FERRAMENTA'
      ? Promise.reject({ response: { status: 403, data: { error: 'Sem permissão' } } }) : base(url, cfg)));
    await abrirEmprestimo();
    await preencherEmprestimo();
    await assinar();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(postsEmprestar()).toHaveLength(0);
    expect(toast.error).toHaveBeenCalledWith('O texto do termo não foi carregado — atualize e tente de novo');
  });

  test('devolver dispara POST no empréstimo aberto da ferramenta', async () => {
    await renderizar();
    const linhaEmprestada = linhasFerramentas()[1]; // FER-002, EMPRESTADA, emprestimo_aberto.id=20
    await clicar(botao('Devolver', linhaEmprestada));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/emprestimos/20/devolver', {});
  });
});

describe('FerramentasAlmoxarifado — permissão gerenciar_ferramentas', () => {
  test('usuário sem gerenciar_ferramentas não vê os botões de escrita nas linhas', async () => {
    mockPode = () => false;
    await renderizar();
    for (const linha of linhasFerramentas()) {
      expect(botao('Emprestar', linha)).toBeFalsy();
      expect(botao('Devolver', linha)).toBeFalsy();
      expect(botao('Bloquear', linha)).toBeFalsy();
      expect(botao('Ocorrência', linha)).toBeFalsy();
    }
  });

  // "Nova ferramenta" segue o padrão de Gerar retalho/Solicitar sucateamento (SobrasAlmoxarifado):
  // sempre visível, o clique é quem bloqueia via bloquearSeNaoPode. É o alvo da sabotagem —
  // tirar o guard do onClick faz o modal abrir mesmo sem permissão.
  test('"Nova ferramenta" fica visível mas o clique é bloqueado sem permissão', async () => {
    mockPode = () => false;
    await renderizar();
    expect(botao('Nova ferramenta')).toBeTruthy();
    await clicar(botao('Nova ferramenta'));
    expect(container.querySelector('.almox-modal')).toBeFalsy();
    expect(api.post).not.toHaveBeenCalled();
  });

  // Etapa 181 (Fase 5, I2): sem gerenciar_ferramentas o servidor manda o emprestimo_aberto SEM o colaborador
  // ({id, data_prevista_devolucao}). A linha mostra "Emprestada" e nenhum "com …" (nem "com undefined").
  test('emprestimo_aberto sem colaborador_nome: a linha mostra "Emprestada", sem "com …"', async () => {
    mockPode = () => false;
    const original = api.get.getMockImplementation();
    const semNome = FERRAMENTAS.map((f) => (f.emprestimo_aberto
      ? { ...f, emprestimo_aberto: { id: f.emprestimo_aberto.id, data_prevista_devolucao: f.emprestimo_aberto.data_prevista_devolucao } }
      : f));
    api.get.mockImplementation((url, ...resto) => (url === '/almoxarifado/ferramentas'
      ? Promise.resolve({ data: semNome }) : original(url, ...resto)));
    await renderizar();
    const linha = linhasFerramentas()[1]; // FER-002, EMPRESTADA
    expect(linha.textContent).toContain('Paquímetro digital');
    expect(linha.querySelector('.almox-badge').textContent).toBe('Emprestada');
    expect(linha.textContent).not.toMatch(/com /);
    expect(linha.textContent).not.toContain('undefined');
  });
});

describe('FerramentasAlmoxarifado — painel de calibrações', () => {
  test('painel separa vencidas de a-vencer', async () => {
    await renderizar();
    await clicar(botao('Calibrações'));

    expect(linhasVencidas()).toHaveLength(2); // FER-003 (numerica) + FER-004 (nunca calibrada)
    expect(linhasAVencer()).toHaveLength(1);

    const vencidasTexto = container.querySelector('.almox-calibracao-vencidas').textContent;
    const aVencerTexto = container.querySelector('.almox-calibracao-a-vencer').textContent;

    expect(vencidasTexto).toContain('FER-003');
    expect(vencidasTexto).not.toContain('FER-002');
    expect(aVencerTexto).toContain('FER-002');
    expect(aVencerTexto).not.toContain('FER-003');
  });

  // Achado da revisao (Important): ferramenta NUNCA calibrada entra em `vencidas` com
  // `data_validade`/`dias_restantes` null (design D3 — sem calibracao nenhuma para tirar esses
  // numeros). O guard `c.dias_restantes != null` (e o `c.data_validade ? ... : '—'`) tem de
  // aguentar isso sem quebrar a tela nem virar `NaN`/`null` cru na celula.
  test('calibração vencida sem data_validade/dias_restantes (nunca calibrada) renderiza com o fallback genérico', async () => {
    await renderizar();
    await clicar(botao('Calibrações'));

    expect(linhasVencidas()).toHaveLength(2);
    const linhaNuncaCalibrada = linhasVencidas().find((tr) => tr.textContent.includes('FER-004'));
    expect(linhaNuncaCalibrada).toBeTruthy();
    expect(linhaNuncaCalibrada.textContent).toContain('Trena a laser');
    expect(linhaNuncaCalibrada.textContent).toContain('—'); // coluna Validade, sem data
    expect(linhaNuncaCalibrada.querySelector('.almox-badge-vencida').textContent.trim()).toBe('Vencida');
  });
});

// Achado F4 da revisao final de branch: `new Date(str) < new Date()` compara a data prevista
// (meia-noite UTC) contra o INSTANTE atual — um emprestimo que vence HOJE aparecia "Vencido"
// horas antes da meia-noite local. O servidor (listarEmprestimos, filters.vencidos) usa
// `date(...) < date('now')`, comparacao so de data. O fix na tela precisa concordar com isso:
// data local de hoje, formatada 'YYYY-MM-DD', comparada como STRING.
describe('FerramentasAlmoxarifado — badge "Vencido" (data-only, espelha o servidor)', () => {
  test('emprestimo que vence HOJE nao aparece como Vencido', async () => {
    const hoje = new Date();
    const hojeISO = [hoje.getFullYear(), String(hoje.getMonth() + 1).padStart(2, '0'), String(hoje.getDate()).padStart(2, '0')].join('-');
    const emprestimosComVenceHoje = [
      { id: 30, ferramenta_id: 1, codigo_patrimonio: 'FER-001', ferramenta_nome: 'Furadeira de bancada',
        colaborador_nome: 'Carlos Lima', setor: 'Produção', data_retirada: hojeISO,
        data_prevista_devolucao: hojeISO, data_devolucao_real: null, status: 'EMPRESTADA', observacoes: null },
    ];
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/ferramentas') return Promise.resolve({ data: FERRAMENTAS });
      if (url === '/almoxarifado/emprestimos') return Promise.resolve({ data: emprestimosComVenceHoje });
      if (url === '/almoxarifado/calibracoes/painel') return Promise.resolve({ data: PAINEL });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
      if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [] });
      return Promise.resolve({ data: [] });
    });

    await renderizar();
    await clicar(botao('Empréstimos'));

    expect(linhasEmprestimos()).toHaveLength(1);
    expect(texto()).not.toContain('Vencido');
  });
});

// Extra barato da revisao final (F1/D9): filtro "Exige calibração" na visão Ferramentas, e a
// coluna Localização mostrando o rotulo (nao o id cru) quando a tela ja tem a localizacao
// carregada.
describe('FerramentasAlmoxarifado — extras da revisão final', () => {
  test('filtro "Exige calibração" manda ?exige_calibracao= no GET /ferramentas', async () => {
    await renderizar();
    const select = [...container.querySelectorAll('.almox-select')]
      .find((s) => s.textContent.includes('Exige calibração'));
    expect(select).toBeTruthy();

    api.get.mockClear();
    preencher(select, '1');
    await esperarEfeitos();

    const chamada = api.get.mock.calls.find((c) => c[0] === '/almoxarifado/ferramentas');
    expect(chamada[1].params.exige_calibracao).toBe('1');
  });

  test('coluna Localização mostra o rótulo, não o id cru, quando a localização está carregada', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/ferramentas') return Promise.resolve({ data: FERRAMENTAS });
      if (url === '/almoxarifado/emprestimos') return Promise.resolve({ data: EMPRESTIMOS });
      if (url === '/almoxarifado/calibracoes/painel') return Promise.resolve({ data: PAINEL });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
      if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [{ id: 5, setor: 'Almoxarifado Central', descricao: 'Prateleira A' }] });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    // FERRAMENTAS[0] (FER-001) tem localizacao_id: 5. Colunas: Código, Nome, Status, Série,
    // Localização, Calibração, Ações — a celula de Localização e a 5a (indice 4).
    const linha = linhasFerramentas().find((tr) => tr.textContent.includes('FER-001'));
    const celulaLocalizacao = linha.querySelectorAll('td')[4];
    expect(celulaLocalizacao.textContent.trim()).not.toBe('5');
    expect(celulaLocalizacao.textContent).toContain('Almoxarifado Central');
  });
});

// ── Etapa 175 — editar a ferramenta pela tela ──────────────────────────────────────────────────
describe('FerramentasAlmoxarifado — Etapa 175, editar', () => {
  const rodape = () => container.querySelector('.almox-modal-footer');
  const putsDe = (id) => api.put.mock.calls.filter(([url]) => url === `/almoxarifado/ferramentas/${id}`);
  const getsDaLista = () => api.get.mock.calls.filter(([url]) => url === '/almoxarifado/ferramentas').length;
  const exigeCalibracao = () => [...container.querySelectorAll('.almox-modal input[type="checkbox"]')][0];

  // Etapa 187 (B1242, revê a B1131): "em qualquer status" virou "salvo Baixada" — a baixada nao edita (RN-187.08d, abaixo).
  test('RN-175.01: "Editar" em toda linha, em qualquer status salvo Baixada; sem permissão, em nenhuma', async () => {
    await renderizar();
    const linhas = linhasFerramentas();
    expect(linhas).toHaveLength(3); // DISPONIVEL, EMPRESTADA, BLOQUEADA
    linhas.forEach((l) => expect(botao('Editar', l)).toBeTruthy());
    act(() => root.unmount());
    root = createRoot(container);
    mockPode = () => false;
    await renderizar();
    expect(linhasFerramentas()).toHaveLength(3);
    linhasFerramentas().forEach((l) => expect(botao('Editar', l)).toBeFalsy());
  });

  test('RN-175.02/03: abre preenchido; salvar manda os 9 campos (vazio = null), avisa, fecha e recarrega', async () => {
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0])); // FER-001
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Editar ferramenta');
    expect(campo('Código de patrimônio').value).toBe('FER-001');
    expect(campo('Nome').value).toBe('Furadeira de bancada');
    expect(campo('Tipo').value).toBe('Elétrica');
    expect(campo('Setor responsável').value).toBe('Produção');
    expect(campo('Número de série').value).toBe('SN-1001');
    expect(exigeCalibracao().checked).toBe(false);
    // localização 5 não veio na lista (o mock devolve []) — RN-175.06
    expect(campo('Localização').value).toBe('5');
    expect(campo('Localização').selectedOptions[0].textContent).toBe('Localização #5');

    preencher(campo('Nome'), 'Furadeira de bancada revisada');
    preencher(campo('Número de série'), '   ');
    const antes = getsDaLista();
    await clicar(botao('Salvar', rodape()));

    expect(putsDe(1)).toHaveLength(1);
    expect(putsDe(1)[0][1]).toEqual({
      codigo_patrimonio: 'FER-001', nome: 'Furadeira de bancada revisada', tipo: 'Elétrica',
      setor_responsavel: 'Produção', material_id: null, numero_serie: null, localizacao_id: 5,
      exige_calibracao: false, observacoes: null,
    });
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.success).toHaveBeenCalledWith('Ferramenta atualizada');
    expect(container.querySelector('.almox-modal')).toBeFalsy();
    expect(getsDaLista()).toBeGreaterThan(antes);
  });

  test('RN-175.04: nome ou código em branco recusam na tela, sem PUT', async () => {
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0]));
    preencher(campo('Nome'), '  ');
    await clicar(botao('Salvar', rodape()));
    expect(toast.error).toHaveBeenCalledWith('Informe o nome da ferramenta');
    preencher(campo('Nome'), 'Ok');
    preencher(campo('Código de patrimônio'), '');
    await clicar(botao('Salvar', rodape()));
    expect(toast.error).toHaveBeenCalledWith('Informe o código de patrimônio');
    expect(api.put).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
  });

  test('RN-175.05: o 409 do servidor aparece com a frase dele e a janela fica com o digitado', async () => {
    api.put.mockRejectedValue({ response: { status: 409, data: { error: 'Código de patrimônio já cadastrado' } } });
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0]));
    preencher(campo('Código de patrimônio'), 'FER-002');
    await clicar(botao('Salvar', rodape()));
    expect(toast.error).toHaveBeenCalledWith('Código de patrimônio já cadastrado');
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
    expect(campo('Código de patrimônio').value).toBe('FER-002');
  });

  test('RN-175.06: material gravado fora da lista aparece como "Material #77" e é mantido; exige calibração 1 vem marcado', async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/ferramentas'
      ? Promise.resolve({ data: [{ ...FERRAMENTAS[1], material_id: 77, observacoes: 'Caixa azul' }] })
      : base(url, cfg)));
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0])); // FER-002, EMPRESTADA
    expect(campo('Material do catálogo').value).toBe('77');
    expect(campo('Material do catálogo').selectedOptions[0].textContent).toBe('Material #77');
    expect(exigeCalibracao().checked).toBe(true);
    expect(campo('Observações').value).toBe('Caixa azul');
    await clicar(botao('Salvar', rodape()));
    const corpo = putsDe(2)[0][1];
    expect(corpo.material_id).toBe(77);
    expect(corpo.exige_calibracao).toBe(true);
    expect(corpo.localizacao_id).toBeNull();
    expect(corpo.observacoes).toBe('Caixa azul');
  });

  // Revisao adversarial (Fase 5): o RN-175.01 so tinha DISPONIVEL/EMPRESTADA/BLOQUEADA. Os outros
  // tres status da maquina (toolStateMachine.STATUS) tambem tem de oferecer "Editar" — um botao
  // embrulhado num `f.status === ...` passaria no teste de cima.
  test('RN-175.01 (revisão): "Editar" também em EM_MANUTENCAO, AVARIADA e PERDIDA', async () => {
    const outros = ['EM_MANUTENCAO', 'AVARIADA', 'PERDIDA'].map((status, i) => ({
      ...FERRAMENTAS[0], id: 40 + i, codigo_patrimonio: `FER-0${40 + i}`, status,
    }));
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/ferramentas'
      ? Promise.resolve({ data: outros }) : base(url, cfg)));
    await renderizar();
    const linhas = linhasFerramentas();
    expect(linhas).toHaveLength(3);
    ['FER-040', 'FER-041', 'FER-042'].forEach((cod, i) => {
      expect(linhas[i].textContent).toContain(cod);
      expect(botao('Editar', linhas[i])).toBeTruthy();
    });
    await clicar(botao('Editar', linhas[2])); // PERDIDA
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Editar ferramenta');
    expect(campo('Código de patrimônio').value).toBe('FER-042');
  });

  // Revisao adversarial (Fase 5): o RN-175.05 so provava o 409. O 404 (ferramenta excluida por
  // outra pessoa com a janela aberta) e um 400 qualquer do servidor tambem tem de chegar com a frase
  // dele — nao a generica — e a janela fica aberta.
  test.each([
    [404, 'Ferramenta não encontrada'],
    [400, 'Frase de validação que só o servidor conhece'],
  ])('RN-175.05 (revisão): o %i do servidor aparece literal e a janela fica aberta', async (status, frase) => {
    api.put.mockRejectedValue({ response: { status, data: { error: frase } } });
    await renderizar();
    await clicar(botao('Editar', linhasFerramentas()[0]));
    preencher(campo('Nome'), 'Nome digitado');
    await clicar(botao('Salvar', rodape()));
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(toast.error).toHaveBeenCalledWith(frase);
    expect(toast.error).not.toHaveBeenCalledWith('Erro ao atualizar a ferramenta');
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
    expect(campo('Nome').value).toBe('Nome digitado');
  });

  // Revisao adversarial (Fase 5): o RN-175.02 so contava o GET da lista. Marcar/desmarcar "exige
  // calibracao" muda o painel; depois de salvar, o painel tem de vir de um GET feito DEPOIS do PUT,
  // e o que ele mostra e o novo. (Hoje o painel rebusca a cada entrada na aba, e o recarregarCal()
  // do salvar e redundante — o teste prende o comportamento, nao o mecanismo.)
  test('RN-175.02 (revisão): depois de salvar, o painel de calibrações vem de um GET posterior ao PUT', async () => {
    const PAINEL_NOVO = { vencidas: [], a_vencer: [{ id: 102, ferramenta_id: 1, codigo_patrimonio: 'FER-001',
      nome: 'Furadeira de bancada', data_validade: '2026-12-01', dias_restantes: 40 }] };
    let salvou = false;
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/calibracoes/painel'
      ? Promise.resolve({ data: salvou ? PAINEL_NOVO : PAINEL }) : base(url, cfg)));
    api.put.mockImplementation(() => { salvou = true; return Promise.resolve({ data: { id: 1 } }); });
    await renderizar();
    await clicar(botao('Calibrações'));
    expect(linhasVencidas()).toHaveLength(2);
    await clicar(botao('Ferramentas'));
    await clicar(botao('Editar', linhasFerramentas()[0]));
    await act(async () => { exigeCalibracao().click(); });
    await clicar(botao('Salvar', rodape()));
    expect(putsDe(1)[0][1].exige_calibracao).toBe(true);
    await clicar(botao('Calibrações'));
    const ordemPut = api.put.mock.invocationCallOrder[0];
    const getsPainelDepois = api.get.mock.calls
      .map((c, i) => [c[0], api.get.mock.invocationCallOrder[i]])
      .filter(([url, ordem]) => url === '/almoxarifado/calibracoes/painel' && ordem > ordemPut);
    expect(getsPainelDepois.length).toBeGreaterThan(0);
    expect(linhasVencidas()).toHaveLength(0);
    expect(linhasAVencer()).toHaveLength(1);
    expect(container.querySelector('.almox-calibracao-a-vencer').textContent).toContain('FER-001');
  });

  test('o "Nova ferramenta" continua cadastrando (POST) com o botão "Cadastrar"', async () => {
    await renderizar();
    await clicar(botao('Nova ferramenta'));
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Nova ferramenta');
    preencher(campo('Código de patrimônio'), 'FER-NOVA');
    preencher(campo('Nome'), 'Serra');
    await clicar(botao('Cadastrar', rodape()));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/ferramentas', expect.objectContaining({ codigo_patrimonio: 'FER-NOVA' }));
    expect(api.put).not.toHaveBeenCalled();
  });
});

describe('FerramentasAlmoxarifado — Etapa 177, retorno da manutenção (condição e destino)', () => {
  const rodape = () => container.querySelector('.almox-modal-footer');
  const EM_MANUTENCAO = { id: 7, codigo_patrimonio: 'FER-007', nome: 'Esmerilhadeira', tipo: 'Elétrica',
    setor_responsavel: 'Produção', status: 'EM_MANUTENCAO', numero_serie: null, localizacao_id: null,
    exige_calibracao: 0, calibracao_vigente: null, emprestimo_aberto: null };
  const BAIXADA = { id: 8, codigo_patrimonio: 'FER-008', nome: 'Torquímetro', tipo: 'Instrumento',
    setor_responsavel: 'Qualidade', status: 'BAIXADA', numero_serie: null, localizacao_id: null,
    exige_calibracao: 1, calibracao_vigente: false, emprestimo_aberto: null };
  const comLista = (lista) => {
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url, ...resto) => (url === '/almoxarifado/ferramentas'
      ? Promise.resolve({ data: lista }) : original(url, ...resto)));
  };
  const putsConcluir = () => api.put.mock.calls.filter(([url]) => url === '/almoxarifado/manutencoes/900/concluir');
  const getsDe = (url) => api.get.mock.calls.filter(([u]) => u === url).length;

  async function abrirConcluir() {
    comLista([EM_MANUTENCAO]);
    await renderizar();
    await clicar(botao('Concluir manutenção', linhasFerramentas()[0]));
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Concluir manutenção');
  }

  test('RN-177.10: sem condição a tela recusa com a frase e não manda PUT; o destino nasce "Volta ao uso"', async () => {
    await abrirConcluir();
    expect(campo('Destino').value).toBe('USO');
    expect([...campo('Condição do item').options].map((o) => o.textContent))
      .toEqual(['Escolha…', 'Em condições de uso', 'Em uso com restrição', 'Inservível']);
    await clicar(botao('Concluir', rodape()));
    expect(toast.error).toHaveBeenCalledWith('Escolha a condição do item');
    expect(putsConcluir()).toHaveLength(0);
    expect(container.querySelector('.almox-modal')).toBeTruthy();
  });

  test('RN-177.02/10: condição OK + volta ao uso manda os dois, avisa e recarrega a lista e o painel', async () => {
    await abrirConcluir();
    preencher(campo('Condição do item'), 'OK');
    const lista = getsDe('/almoxarifado/ferramentas');
    const painel = getsDe('/almoxarifado/calibracoes/painel');
    await clicar(botao('Concluir', rodape()));
    expect(putsConcluir()).toHaveLength(1);
    expect(putsConcluir()[0][1]).toEqual({ condicao: 'OK', destino: 'USO' });
    expect(toast.success).toHaveBeenCalledWith('Manutenção concluída');
    expect(container.querySelector('.almox-modal')).toBeFalsy();
    expect(getsDe('/almoxarifado/ferramentas')).toBeGreaterThan(lista);
    // o painel so busca quando a aba abre; o recarregar tem de valer na proxima abertura
    await clicar(botao('Calibrações'));
    expect(getsDe('/almoxarifado/calibracoes/painel')).toBeGreaterThan(painel);
  });

  test('RN-177.03/05/10: inservível puxa o destino para a baixa; o rótulo pede o motivo e o PUT vai com ele', async () => {
    await abrirConcluir();
    preencher(campo('Condição do item'), 'INSERVIVEL');
    expect(campo('Destino').value).toBe('BAIXA');
    expect(campo('Motivo da baixa')).toBeTruthy();
    preencher(campo('Motivo da baixa'), '  Motor queimado  ');
    await clicar(botao('Concluir', rodape()));
    expect(putsConcluir()[0][1]).toEqual({ condicao: 'INSERVIVEL', destino: 'BAIXA', observacoes: 'Motor queimado' });
    expect(toast.success).toHaveBeenCalledWith('Manutenção concluída — ferramenta baixada');
  });

  test('RN-177.04/10: com restrição o rótulo pede a restrição; a recusa do servidor aparece com a frase dele e a janela fica', async () => {
    api.put.mockRejectedValue({ response: { status: 400, data: { error: 'Descreva a restrição nas observações' } } });
    await abrirConcluir();
    preencher(campo('Condição do item'), 'COM_RESTRICAO');
    expect(campo('Qual é a restrição')).toBeTruthy();
    expect(campo('Destino').value).toBe('USO');
    await clicar(botao('Concluir', rodape()));
    expect(putsConcluir()[0][1]).toEqual({ condicao: 'COM_RESTRICAO', destino: 'USO' });
    expect(toast.error).toHaveBeenCalledWith('Descreva a restrição nas observações');
    expect(toast.success).not.toHaveBeenCalled();
    expect(container.querySelector('.almox-modal')).toBeTruthy();
    expect(campo('Condição do item').value).toBe('COM_RESTRICAO');
  });

  test('RN-177.10: a baixada mostra "Baixada" e "Reverter baixa", sem Ocorrência nem Calibração (metade positiva: a em manutenção tem Ocorrência)', async () => {
    comLista([BAIXADA, EM_MANUTENCAO]);
    await renderizar();
    const [baixada, emManut] = linhasFerramentas();
    expect(baixada.textContent).toContain('Baixada');
    expect(botao('Reverter baixa', baixada)).toBeTruthy();
    expect(botao('Ocorrência', baixada)).toBeFalsy();
    expect(botao('Calibração', baixada)).toBeFalsy();
    // Etapa 187 (B1242): a baixada nao edita — era toBeTruthy (a 177 mostrava "Editar" e "Reverter baixa"); mudanca de regra, nao teste quebrado
    expect(botao('Editar', baixada)).toBeFalsy();
    expect(botao('Ocorrência', emManut)).toBeTruthy();
    expect(botao('Reverter baixa', emManut)).toBeFalsy();
    // o filtro de status oferece "Baixada"
    const filtro = container.querySelector('.almox-filters select');
    expect([...filtro.options].map((o) => o.value)).toContain('BAIXADA');
  });

  test('Fase 5: a baixada com calibração vigente mostra "—" na coluna Calibração, não "Vigente" (metade positiva: a disponível vigente mostra "Vigente")', async () => {
    const DISPONIVEL_VIGENTE = { ...EM_MANUTENCAO, id: 9, codigo_patrimonio: 'FER-009', status: 'DISPONIVEL',
      exige_calibracao: 1, calibracao_vigente: true };
    comLista([{ ...BAIXADA, calibracao_vigente: true }, DISPONIVEL_VIGENTE]);
    await renderizar();
    const [baixada, viva] = linhasFerramentas();
    const celulaCalibracao = (linha) => linha.querySelectorAll('td')[5].textContent.trim();
    expect(celulaCalibracao(baixada)).toBe('—');
    expect(celulaCalibracao(viva)).toBe('Vigente');
  });

  test('RN-177.08/10: "Reverter baixa" pede justificativa, posta na rota, avisa e recarrega a lista e o painel', async () => {
    comLista([BAIXADA]);
    await renderizar();
    await clicar(botao('Reverter baixa', linhasFerramentas()[0]));
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Reverter a baixa da ferramenta');
    const just = container.querySelector('.almox-modal textarea');
    preencher(just, 'baixa errada');
    const painel = getsDe('/almoxarifado/calibracoes/painel');
    await clicar(botao('Confirmar', rodape()) || [...rodape().querySelectorAll('button')].pop());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/ferramentas/8/reverter-baixa', { justificativa: 'baixa errada' });
    expect(toast.success).toHaveBeenCalledWith('Baixa revertida — a ferramenta voltou a ficar disponível');
    expect(container.querySelector('.almox-modal')).toBeFalsy();
    await clicar(botao('Calibrações'));
    expect(getsDe('/almoxarifado/calibracoes/painel')).toBeGreaterThan(painel);
  });
});

describe('FerramentasAlmoxarifado — termo do empréstimo (Etapa 180, RN-180.05)', () => {
  async function abrirAbaEmprestimos() {
    await renderizar();
    await clicar(botao('Empréstimos'));
  }

  test('coluna Termo: com termo, botão "Termo"; sem, "Anterior à exigência do termo"', async () => {
    await abrirAbaEmprestimos();
    const [comTermo, semTermo] = linhasEmprestimos();
    expect(botao('Termo', comTermo)).toBeTruthy();
    expect(semTermo.textContent).toContain('Anterior à exigência do termo');
    expect(botao('Termo', semTermo)).toBeFalsy();
  });

  test('"Termo" mostra o texto da versão ASSINADA, os dados da fotografia, a matrícula digitada e a assinatura', async () => {
    await abrirAbaEmprestimos();
    await clicar(botao('Termo', linhasEmprestimos()[0]));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/ferramentas/emprestimos/20/termo');
    const modal = $('.almox-termo-emprestimo');
    expect(modal.querySelector('h2').textContent).toBe('Termo TERMO-20260801-0001');
    expect(modal.querySelector('.almox-termo-texto').textContent).toBe(TEXTO_V1);
    expect(modal.querySelector('.almox-termo-provisorio')).not.toBeNull();
    expect(modal.textContent).toContain('FER-002 — Paquímetro digital · série SN-2002');
    expect(modal.textContent).toContain('João Silva · matrícula M-900 · Qualidade');
    // T4: a forma real e a flag 1 (nao a matricula) — a T3 imprimia "Matrícula digitada: 1" na tela de verdade.
    expect(modal.textContent).toContain('Matrícula confirmada pelo colaborador: Sim — digitou M-900 (confere com o cadastro)');
    expect(modal.textContent).not.toContain('Matrícula digitada');
    expect(modal.textContent).toContain('10/08/2026');
    expect(modal.textContent).toContain('C0FF-EE12-3456');
    expect(modal.querySelector('img.almox-termo-assinatura').getAttribute('src')).toContain('assinatura-termo-1.png');
  });

  test('"Verificar integridade": selo Íntegro; e Adulterado com o motivo', async () => {
    await abrirAbaEmprestimos();
    await clicar(botao('Termo', linhasEmprestimos()[0]));
    await clicar(botao('Verificar integridade'));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/ferramentas/emprestimos/20/termo/verificar');
    expect($('.almox-termo-selo').textContent).toBe('Íntegro');
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/ferramentas/emprestimos/20/termo/verificar'
      ? Promise.resolve({ data: { integro: false, motivo: 'texto do termo alterado' } }) : base(url, cfg)));
    await clicar(botao('Fechar', rodapeModal()));
    await clicar(botao('Termo', linhasEmprestimos()[0]));
    expect($('.almox-termo-selo')).toBeNull();
    await clicar(botao('Verificar integridade'));
    expect($('.almox-termo-selo').textContent).toBe('Adulterado: texto do termo alterado');
    expect($('.almox-termo-selo').className).toContain('almox-badge-critico');
  });

  test('"PDF do termo" relê o termo (URL nova da assinatura) e gera o PDF com o texto e o número', async () => {
    let leituras = 0;
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => {
      if (url === '/almoxarifado/ferramentas/emprestimos/20/termo') {
        leituras += 1;
        const ev = { ...TERMO_DO_EMPRESTIMO.evidencia, arquivo_url: `/api/uploads/almoxarifado/assinatura-termo-1.png?exp=${leituras}&sig=a` };
        return Promise.resolve({ data: { ...TERMO_DO_EMPRESTIMO, evidencia: ev } });
      }
      return base(url, cfg);
    });
    await abrirAbaEmprestimos();
    await clicar(botao('Termo', linhasEmprestimos()[0]));
    await clicar(botao('PDF do termo'));
    expect(leituras).toBe(2);
    expect(global.fetch).toHaveBeenCalledWith(expect.stringContaining('exp=2'));
    const textos = mockPdf.filter(([n]) => n === 'text').map((c) => c[1]);
    expect(textos).toContain('Termo de responsabilidade — TERMO-20260801-0001');
    expect(textos).toContain('Declaro que recebi a ferramenta em perfeito estado.');
    expect(mockPdf.find(([n]) => n === 'save')[1]).toBe('termo-TERMO-20260801-0001.pdf');
    // o fetch da assinatura falhou no teste: avisa, nao entrega calado
    expect(toast.warn).toHaveBeenCalledWith('A assinatura não pôde ser carregada e saiu como indisponível no PDF');
  });

  test('a releitura falha: não gera o PDF com a URL velha', async () => {
    await abrirAbaEmprestimos();
    await clicar(botao('Termo', linhasEmprestimos()[0]));
    api.get.mockImplementation(() => Promise.reject({ response: { status: 500, data: { error: 'Erro interno' } } }));
    await clicar(botao('PDF do termo'));
    expect(toast.error).toHaveBeenCalledWith('Erro interno');
    expect(mockPdf.find(([n]) => n === 'save')).toBeUndefined();
  });

  test('404 do termo (anterior à exigência) aparece literal e não abre a janela', async () => {
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/ferramentas/emprestimos/20/termo'
      ? Promise.reject({ response: { status: 404, data: { error: 'Este empréstimo não tem termo assinado (anterior à exigência)' } } })
      : base(url, cfg)));
    await abrirAbaEmprestimos();
    await clicar(botao('Termo', linhasEmprestimos()[0]));
    expect(toast.error).toHaveBeenCalledWith('Este empréstimo não tem termo assinado (anterior à exigência)');
    expect($('.almox-termo-emprestimo')).toBeNull();
  });

  // Etapa 185 (T3, RN-185.07/08) — integracao: tela -> resposta HTTP -> gerador -> regua de margem. Texto da versao em CAIXA ALTA (ia a
  // 210,6 mm) e "Registrado por" com 44 letras (199,9). Regua copiada (os arquivos de teste nao importam um do outro), jsPDF real.
  test('[RN-185.07/08, pela tela] "PDF do termo" com texto em CAIXA ALTA e quem registrou de 44 letras: nada passa da margem', async () => {
    const CAIXA_ALTA = 'MAIUSCULAS LARGAS NO TEXTO DO TERMO DE RESPONSABILIDADE QUE A EMPRESA FORNECEU EM CAIXA ALTA PARA DESTACAR AS '
      + 'OBRIGACOES DO COLABORADOR';
    const NOME_44 = 'Maria Aparecida dos Santos Oliveira Ferreira';
    expect(NOME_44).toHaveLength(44);
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/ferramentas/emprestimos/20/termo'
      ? Promise.resolve({ data: { ...TERMO_DO_EMPRESTIMO,
        termo: { ...TERMO_DO_EMPRESTIMO.termo, texto: CAIXA_ALTA, criado_por_nome: NOME_44 } } })
      : base(url, cfg)));
    await abrirAbaEmprestimos();
    await clicar(botao('Termo', linhasEmprestimos()[0]));
    await clicar(botao('PDF do termo'));
    expect(mockPdf.find(([n]) => n === 'save')[1]).toBe('termo-TERMO-20260801-0001.pdf');
    // eslint-disable-next-line global-require
    const { jsPDF: JsPdfReal } = jest.requireActual('jspdf');
    const medidor = new JsPdfReal({ format: 'a4', orientation: 'portrait', unit: 'mm' });
    let fonte = 16;
    const fora = [];
    const porFonte = { 9: [], 10: [] };
    for (const [nome, ...args] of mockPdf) {
      if (nome === 'setFontSize') fonte = args[0];
      if (nome === 'text') {
        medidor.setFontSize(fonte);
        const fim = args[1] + medidor.getTextWidth(String(args[0]));
        if (fim > 196 + 1e-6) fora.push([String(args[0]).slice(0, 30), fonte, Number(fim.toFixed(1))]);
        if (porFonte[fonte]) porFonte[fonte].push(String(args[0]));
      }
    }
    expect(fora).toEqual([]);
    // metade positiva: o texto saiu em 2+ linhas (fonte 10), inteiro; a linha da devolucao em 2+ linhas com o nome inteiro
    expect(porFonte[10].length).toBeGreaterThanOrEqual(2);
    expect(porFonte[10].join('').replace(/\s/g, '')).toBe(CAIXA_ALTA.replace(/\s/g, ''));
    const i = porFonte[9].findIndex((t) => t.startsWith('Devolução prevista: '));
    expect(`${porFonte[9][i]} ${porFonte[9][i + 1]}`).toContain(NOME_44);
  });
});

describe('FerramentasAlmoxarifado — abas por permissão (Etapa 180)', () => {
  test('sem gerenciar_ferramentas: a aba Empréstimos some e GET /emprestimos não é chamado (metade positiva: com, aparece)', async () => {
    mockPode = (acao) => acao !== 'gerenciar_ferramentas';
    await renderizar();
    expect(botao('Ferramentas')).toBeTruthy();
    expect(botao('Calibrações')).toBeTruthy();
    expect(botao('Empréstimos')).toBeFalsy();
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/emprestimos', expect.anything());
    act(() => root.unmount());
    root = createRoot(container);
    mockPode = () => true;
    await renderizar();
    expect(botao('Empréstimos')).toBeTruthy();
  });

  test('sem editar_termos: a aba "Texto do termo" some (metade positiva: com, aparece)', async () => {
    mockPode = (acao) => acao !== 'editar_termos';
    await renderizar();
    expect(botao('Texto do termo')).toBeFalsy();
    expect(botao('Empréstimos')).toBeTruthy();
    act(() => root.unmount());
    root = createRoot(container);
    mockPode = () => true;
    await renderizar();
    expect(botao('Texto do termo')).toBeTruthy();
  });
});

describe('FerramentasAlmoxarifado — texto do termo, administrador (Etapa 180, RN-180.02)', () => {
  const postsTermo = () => api.post.mock.calls.filter(([url]) => url === '/almoxarifado/termos/FERRAMENTA');
  async function abrirAbaTermo() {
    await renderizar();
    await clicar(botao('Texto do termo'));
  }

  test('mostra a vigente (com o selo provisório) no editor e o histórico', async () => {
    await abrirAbaTermo();
    expect(container.textContent).toContain('Versão vigente: 1');
    expect($('.almox-termo-admin .almox-termo-provisorio')).not.toBeNull();
    expect($('#termo-texto-novo').value).toBe(TEXTO_V1);
    expect(container.querySelectorAll('.almox-termo-historico tbody tr')).toHaveLength(1);
  });

  test('salvar nova versão: POST { texto, versao_base } e recarrega a vigente e o histórico', async () => {
    let salvo = false;
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/termos/FERRAMENTA'
      ? Promise.resolve({ data: salvo ? TERMO_V2 : TERMO_V1 }) : base(url, cfg)));
    api.post.mockImplementationOnce(() => { salvo = true; return Promise.resolve({ data: TERMO_V2.vigente }); });
    await abrirAbaTermo();
    preencher($('#termo-texto-novo'), TEXTO_V2);
    await clicar(botao('Salvar nova versão'));
    expect(postsTermo()).toHaveLength(1);
    expect(postsTermo()[0][1]).toEqual({ texto: TEXTO_V2, versao_base: 1 });
    expect(toast.success).toHaveBeenCalledWith('Versão 2 do termo salva — os próximos empréstimos assinam este texto');
    expect(container.textContent).toContain('Versão vigente: 2');
    expect($('.almox-termo-admin .almox-section-title .almox-termo-provisorio')).toBeNull();
    expect(container.querySelectorAll('.almox-termo-historico tbody tr')).toHaveLength(2);
  });

  test.each([
    ['   ', 'O texto do termo é obrigatório'],
    [`  ${TEXTO_V1}  `, 'O texto é igual ao da versão vigente'],
  ])('recusa na tela, com a frase do servidor, sem POST: %j', async (texto, frase) => {
    await abrirAbaTermo();
    preencher($('#termo-texto-novo'), texto);
    await clicar(botao('Salvar nova versão'));
    expect(toast.error).toHaveBeenCalledWith(frase);
    expect(postsTermo()).toHaveLength(0);
  });

  test('409 de outro administrador: a frase literal, recarrega a vigente e NÃO apaga o rascunho', async () => {
    let outroSalvou = false;
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/almoxarifado/termos/FERRAMENTA'
      ? Promise.resolve({ data: outroSalvou ? TERMO_V2 : TERMO_V1 }) : base(url, cfg)));
    api.post.mockImplementationOnce(() => {
      outroSalvou = true;
      return Promise.reject({ response: { status: 409, data: { error: 'Outra versão do termo acabou de ser salva — recarregue' } } });
    });
    await abrirAbaTermo();
    preencher($('#termo-texto-novo'), 'Meu rascunho do termo');
    await clicar(botao('Salvar nova versão'));
    expect(toast.error).toHaveBeenCalledWith('Outra versão do termo acabou de ser salva — recarregue');
    expect(container.textContent).toContain('Versão vigente: 2');
    expect($('#termo-texto-novo').value).toBe('Meu rascunho do termo');
  });
});

// ── Etapa 187 — a restrição da manutenção aparece; a baixada não edita (RN-187.08) ──────────────
// Contrato congelado no plano da 187: GET /ferramentas traz `restricao: null | { manutencao_id, observacoes, data_fim }`.
describe('FerramentasAlmoxarifado — Etapa 187, restrição da manutenção e baixada sem Editar', () => {
  const RESTRICAO = { manutencao_id: 31, observacoes: 'Só para serviço leve', data_fim: '2026-10-22 10:00:00' };
  const AVISO = 'Esta ferramenta voltou da manutenção em uso com restrição: Só para serviço leve. Confira antes de emprestar.';
  const RESTRITA = { ...FERRAMENTAS[0], restricao: RESTRICAO }; // id 1, DISPONIVEL (postsEmprestar olha o id 1)
  const SEM = { ...FERRAMENTAS[0], id: 11, codigo_patrimonio: 'FER-011', nome: 'Serra tico-tico', restricao: null };
  const BAIXADA_R = { ...FERRAMENTAS[0], id: 12, codigo_patrimonio: 'FER-012', nome: 'Lixadeira', status: 'BAIXADA', restricao: RESTRICAO };
  const comLista = (lista) => {
    const original = api.get.getMockImplementation();
    api.get.mockImplementation((url, ...resto) => (url === '/almoxarifado/ferramentas'
      ? Promise.resolve({ data: lista }) : original(url, ...resto)));
  };
  const selo = (linha) => linha.querySelector('.almox-selo-restricao');
  const aviso = () => container.querySelector('.almox-modal [role="note"]');

  test('[RN-187.08a] a restrita mostra o selo e "Restrição: …"; a sem restrição, não; sem permissão de escrita o selo continua', async () => {
    comLista([RESTRITA, SEM]);
    await renderizar();
    let [restrita, sem] = linhasFerramentas();
    expect(selo(restrita).textContent).toBe('Em uso com restrição');
    expect(restrita.textContent).toContain('Restrição: Só para serviço leve');
    expect(selo(sem)).toBeNull();
    expect(sem.textContent).not.toContain('Restrição:');
    act(() => root.unmount());
    root = createRoot(container);
    mockPode = () => false;
    await renderizar();
    [restrita, sem] = linhasFerramentas();
    expect(botao('Editar', restrita)).toBeFalsy(); // premissa: de fato sem escrita
    expect(selo(restrita).textContent).toBe('Em uso com restrição');
    expect(restrita.textContent).toContain('Restrição: Só para serviço leve');
    expect(selo(sem)).toBeNull();
  });

  test('[RN-187.08a] baixada com restricao: sem selo (metade positiva: a disponível com a mesma restricao tem)', async () => {
    comLista([BAIXADA_R, RESTRITA]);
    await renderizar();
    const [baixada, restrita] = linhasFerramentas();
    expect(baixada.textContent).toContain('Baixada');
    expect(selo(baixada)).toBeNull();
    expect(baixada.textContent).not.toContain('Restrição:');
    expect(selo(restrita)).toBeTruthy();
  });

  test('[RN-187.08b] Emprestar a restrita: o aviso literal no modal e o envio sai (um POST, não bloqueia)', async () => {
    comLista([RESTRITA, SEM]);
    api.post.mockResolvedValueOnce({ data: { id: 31, termo: { numero: 'TERMO-20261022-0009', versao: 1 } } });
    await renderizar();
    await clicar(botao('Emprestar', linhasFerramentas()[0]));
    expect(aviso().textContent).toBe(AVISO);
    await preencherEmprestimo();
    await assinar();
    await clicar(botao('Emprestar', rodapeModal()));
    expect(postsEmprestar()).toHaveLength(1);
    expect(toast.success).toHaveBeenCalledWith('Ferramenta emprestada — termo TERMO-20261022-0009 assinado');
  });

  test('[RN-187.08c] Emprestar a sem restrição: nenhum aviso (metade positiva do 08b)', async () => {
    comLista([SEM, RESTRITA]);
    await renderizar();
    await clicar(botao('Emprestar', linhasFerramentas()[0]));
    expect(container.querySelector('.almox-modal h2').textContent).toBe('Emprestar ferramenta');
    expect(aviso()).toBeNull();
    expect(container.querySelector('.almox-modal').textContent).not.toContain('em uso com restrição');
  });

  test('[RN-187.08d] a baixada sem "Editar"; DISPONIVEL, EMPRESTADA, BLOQUEADA, EM_MANUTENCAO, AVARIADA e PERDIDA com', async () => {
    const outros = ['DISPONIVEL', 'EMPRESTADA', 'BLOQUEADA', 'EM_MANUTENCAO', 'AVARIADA', 'PERDIDA'].map((status, i) => ({
      ...FERRAMENTAS[0], id: 50 + i, codigo_patrimonio: `FER-0${50 + i}`, status, restricao: null,
    }));
    comLista([{ ...BAIXADA_R, restricao: null }, ...outros]);
    await renderizar();
    const [baixada, ...vivas] = linhasFerramentas();
    expect(baixada.textContent).toContain('FER-012');
    expect(botao('Reverter baixa', baixada)).toBeTruthy(); // premissa: a linha da baixada tem acoes
    expect(botao('Editar', baixada)).toBeFalsy();
    expect(vivas).toHaveLength(6);
    vivas.forEach((l) => expect([l.textContent.slice(0, 7), !!botao('Editar', l)]).toEqual([l.textContent.slice(0, 7), true]));
  });
});
