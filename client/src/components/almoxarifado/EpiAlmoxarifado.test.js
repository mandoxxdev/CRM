/**
 * Etapa 178 (T2) — tela "Entrega de EPI". Mock so na fronteira HTTP (services/api) e no que o jsdom nao tem (canvas 2D, toBlob,
 * pointer capture — o mesmo shim de AssinaturaCanvas.test.js) e no binario do jspdf (gravador de chamadas).
 *
 * O alvo e o que SO a tela pode errar: o multipart do POST (campos do contrato congelado + o arquivo `assinatura` PNG), o aviso
 * de CA vencido/ausente ANTES de enviar (com o texto literal do servidor), a quantidade inteira, a assinatura obrigatoria, o
 * erro do servidor aparecendo, o codigo de verificacao no sucesso, o selo do "Verificar integridade" e a ficha (colaborador
 * excluido marcado + PDF). O servico (hash, trigger, motor) tem teste no servidor (T1).
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=EpiAlmoxarifado
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import EpiAlmoxarifado from './EpiAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), defaults: { baseURL: '/api' } },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ALMOXARIFE',
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
// Funcao comum, nao jest.fn: o CRA liga `resetMocks` e apagaria a implementacao antes de cada teste.
jest.mock('jspdf', () => function JsPdfGravador() {
  return new Proxy({}, { get: (_alvo, nome) => (...args) => { mockPdf.push([nome, ...args]); } });
});

const COLABORADORES = [
  { id: 7, nome: 'Maria Souza', matricula: 'M-100', setor: 'Caldeiraria' },
  { id: 8, nome: 'Pedro Lima', matricula: null, setor: 'Usinagem' },
];
// O GET /materiais devolve todos; a tela mostra so os `is_epi` (bool calculado pelo servidor, contrato congelado).
const MATERIAIS = [
  { id: 3, codigo: 'EPI-LUV-01', nome: 'Luva de vaqueta', is_epi: true, ca_numero: '12345', ca_validade: '2030-12-31' },
  { id: 4, codigo: 'EPI-OCU-01', nome: 'Óculos de proteção', is_epi: 1, ca_numero: '55555', ca_validade: '2020-01-15' },
  { id: 5, codigo: 'EPI-CAP-01', nome: 'Capacete', is_epi: true, ca_numero: null, ca_validade: null },
  { id: 9, codigo: 'CHP-001', nome: 'Chapa 3mm', is_epi: false, ca_numero: null, ca_validade: null },
];
const HASH = 'c0ffee1234567890'.padEnd(64, 'a');
const ENTREGAS = [
  { id: 11, numero: 'EPI-20261022-0001', criado_em: '2026-10-23T01:30:00.000Z', colaborador_id: 7, colaborador_nome: 'Maria Souza',
    matricula: 'M-100', material_id: 3, material_codigo: 'EPI-LUV-01', material_nome: 'Luva de vaqueta', ca_numero: '12345',
    ca_validade: '2030-12-31', quantidade: 2, tamanho: 'G', motivo: 'TROCA', entregue_por_nome: 'Joao Almoxarife' },
  { id: 12, numero: 'EPI-20261020-0003', criado_em: '2026-10-20T13:00:00.000Z', colaborador_id: 99, colaborador_nome: 'Ex Colaborador',
    matricula: 'M-999', material_id: 3, material_codigo: 'EPI-LUV-01', material_nome: 'Luva de vaqueta', ca_numero: '12345',
    ca_validade: '2030-12-31', quantidade: 1, tamanho: null, motivo: null, entregue_por_nome: 'Joao Almoxarife' },
];
const FICHA_EXCLUIDO = {
  colaborador: { id: 99, nome: 'Ex Colaborador', matricula: 'M-999', setor: 'Pintura', cpf_mascarado: '***.***.***-09', excluido: true },
  entregas: [{ ...ENTREGAS[1], arquivo_url: '/api/uploads/almoxarifado/assinatura-epi-12.png?exp=1&sig=a', registro_sha256: HASH }],
};
const BLOB_PNG = new Blob(['png'], { type: 'image/png' });

let container; let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  mockPdf.length = 0;
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
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
    if (url === '/almoxarifado/epi/entregas') return Promise.resolve({ data: ENTREGAS });
    if (url === '/almoxarifado/epi/entregas/11/verificar') return Promise.resolve({ data: { integro: true } });
    if (url === '/almoxarifado/epi/entregas/12/verificar') return Promise.resolve({ data: { integro: false, motivo: 'arquivo alterado' } });
    if (url === '/almoxarifado/epi/ficha/99') return Promise.resolve({ data: FICHA_EXCLUIDO });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({
    data: { id: 50, numero: 'EPI-20261022-0009', movimentacao_id: 700,
      evidencia: { id: 60, arquivo_url: '/api/uploads/almoxarifado/a.png', arquivo_sha256: 'f'.repeat(64), registro_sha256: HASH,
        criado_em: '2026-10-22T15:00:00.000Z' } },
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function renderizar() {
  await act(async () => { root.render(<MemoryRouter initialEntries={['/almoxarifado/epi']}><EpiAlmoxarifado /></MemoryRouter>); });
  await esperarEfeitos();
}
const texto = () => container.textContent;
const botao = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
function preencher(el, valor) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
    : el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const pointer = (tipo, x, y) => {
  const ev = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y });
  Object.defineProperty(ev, 'pointerId', { value: 1 });
  return ev;
};
async function assinar() {
  const canvas = container.querySelector('canvas');
  act(() => { canvas.dispatchEvent(pointer('pointerdown', 10, 10)); });
  act(() => { canvas.dispatchEvent(pointer('pointermove', 40, 30)); });
  act(() => { canvas.dispatchEvent(pointer('pointerup', 40, 30)); });
  await clicar(botao('Confirmar assinatura'));
}
const $ = (sel) => container.querySelector(sel);
const opcoes = (sel) => [...$(sel).querySelectorAll('option')].map((o) => o.textContent.trim());

async function preencherValido({ material = '3', quantidade = '2' } = {}) {
  preencher($('#epi-colaborador'), '7');
  preencher($('#epi-material'), material);
  preencher($('#epi-quantidade'), quantidade);
}

describe('Nova entrega', () => {
  test('colaborador vem da lista aux (nome — matrícula) e o EPI so dos materiais is_epi', async () => {
    await renderizar();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/aux/colaboradores');
    expect(opcoes('#epi-colaborador')).toEqual(['Selecione...', 'Maria Souza — M-100', 'Pedro Lima']);
    const epis = opcoes('#epi-material');
    expect(epis).toContain('EPI-LUV-01 — Luva de vaqueta (CA 12345)');
    expect(epis).toContain('EPI-CAP-01 — Capacete');
    expect(epis.some((o) => o.includes('CHP-001'))).toBe(false);
  });

  test('o EPI escolhido mostra CA e validade', async () => {
    await renderizar();
    preencher($('#epi-material'), '3');
    expect($('.almox-epi-ca').textContent).toBe('CA: 12345 · validade: 31/12/2030');
    expect($('.almox-epi-aviso-ca')).toBeNull();
  });

  test('CA vencido: avisa ao escolher, com o texto do servidor, e nao envia', async () => {
    await renderizar();
    await preencherValido({ material: '4' });
    expect($('.almox-epi-aviso-ca').textContent).toContain('O CA 55555 do EPI EPI-OCU-01 venceu em 15/01/2020');
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('O CA 55555 do EPI EPI-OCU-01 venceu em 15/01/2020');
  });

  test('CA ausente: avisa e nao envia', async () => {
    await renderizar();
    await preencherValido({ material: '5' });
    expect($('.almox-epi-aviso-ca').textContent).toContain('EPI EPI-CAP-01 sem número de CA cadastrado');
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(api.post).not.toHaveBeenCalled();
  });

  test('quantidade nao inteira: recusa com a frase do servidor e nao envia', async () => {
    await renderizar();
    await preencherValido({ quantidade: '1.5' });
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('Quantidade de EPI deve ser inteira');
  });

  test('sem assinatura: recusa e nao envia', async () => {
    await renderizar();
    await preencherValido();
    await clicar(botao('Registrar entrega'));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('A assinatura do colaborador é obrigatória');
  });

  test('envio: um POST multipart com os campos do contrato e o PNG em `assinatura`; sucesso mostra numero e codigo', async () => {
    await renderizar();
    await preencherValido();
    preencher($('#epi-tamanho'), 'G');
    preencher($('#epi-motivo'), 'TROCA');
    preencher($('#epi-observacao'), 'luva rasgada');
    await assinar();
    expect(texto()).toContain('Assinatura confirmada');
    await clicar(botao('Registrar entrega'));
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, corpo] = api.post.mock.calls[0];
    expect(url).toBe('/almoxarifado/epi/entregas');
    expect(corpo).toBeInstanceOf(FormData);
    expect(corpo.get('colaborador_id')).toBe('7');
    expect(corpo.get('material_id')).toBe('3');
    expect(corpo.get('quantidade')).toBe('2');
    expect(corpo.get('tamanho')).toBe('G');
    expect(corpo.get('motivo')).toBe('TROCA');
    expect(corpo.get('observacao')).toBe('luva rasgada');
    expect(corpo.get('assinatura').type).toBe('image/png');
    const sucesso = $('.almox-epi-sucesso');
    expect(sucesso.textContent).toContain('EPI-20261022-0009');
    expect(sucesso.textContent).toContain('C0FF-EE12-3456');
    expect($('.almox-epi-codigo').getAttribute('title')).toBe(HASH);
    // o formulario volta limpo, com o canvas de novo
    expect($('#epi-colaborador').value).toBe('');
    expect(container.querySelector('canvas')).not.toBeNull();
  });

  test('erro do servidor aparece literal', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Colaborador Maria Souza não está ativo' } } });
    await renderizar();
    await preencherValido();
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(toast.error).toHaveBeenCalledWith('Colaborador Maria Souza não está ativo');
    expect($('.almox-epi-sucesso')).toBeNull();
  });

  test('perfil sem entregar_epi: avisa na aba e o clique nao envia', async () => {
    mockPode = (acao) => acao !== 'entregar_epi';
    await renderizar();
    expect(texto()).toContain('Seu perfil não registra entrega de EPI');
    await preencherValido();
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('Entregas', () => {
  test('lista com filtros; a data e o dia de Brasilia', async () => {
    await renderizar();
    await clicar(botao('Entregas'));
    const linhas = [...container.querySelectorAll('.almox-epi-lista tbody tr')];
    expect(linhas).toHaveLength(2);
    expect(linhas[0].textContent).toContain('22/10/2026'); // 01:30Z de 23/10 = 22h30 de 22/10
    expect(linhas[0].textContent).toContain('Maria Souza — M-100');
    preencher(container.querySelector('select[aria-label="Filtrar por colaborador"]'), '7');
    preencher(container.querySelector('input[aria-label="De"]'), '2026-10-01');
    await esperarEfeitos();
    const ultima = api.get.mock.calls.filter(([u]) => u === '/almoxarifado/epi/entregas').pop();
    expect(ultima[1]).toEqual({ params: { colaborador_id: '7', de: '2026-10-01' } });
  });

  test('Verificar integridade: selo Íntegro e Adulterado com o motivo', async () => {
    await renderizar();
    await clicar(botao('Entregas'));
    const [l1, l2] = [...container.querySelectorAll('.almox-epi-lista tbody tr')];
    await clicar([...l1.querySelectorAll('button')].find((b) => b.textContent.includes('Verificar integridade')));
    await clicar([...l2.querySelectorAll('button')].find((b) => b.textContent.includes('Verificar integridade')));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/epi/entregas/11/verificar');
    const selos = [...container.querySelectorAll('.almox-epi-selo')].map((s) => s.textContent);
    expect(selos).toEqual(['Íntegro', 'Adulterado: arquivo alterado']);
    expect(container.querySelectorAll('.almox-epi-selo.almox-badge-critico')).toHaveLength(1);
  });
});

describe('Ficha por colaborador', () => {
  test('aberta pela linha: colaborador excluido marcado, entregas com hash, e o PDF sai', async () => {
    await renderizar();
    await clicar(botao('Entregas'));
    const linha = [...container.querySelectorAll('.almox-epi-lista tbody tr')][1];
    await clicar([...linha.querySelectorAll('button')].find((b) => b.textContent.includes('Ficha')));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/epi/ficha/99');
    expect($('.almox-epi-excluido').textContent).toBe('Excluído do cadastro');
    expect(texto()).toContain('CPF: ***.***.***-09');
    const linhas = [...container.querySelectorAll('.almox-epi-ficha-lista tbody tr')];
    expect(linhas).toHaveLength(1);
    expect(linhas[0].textContent).toContain('20/10/2026');
    expect(linhas[0].querySelector('img').getAttribute('src')).toBe(FICHA_EXCLUIDO.entregas[0].arquivo_url);
    await clicar(botao('Gerar PDF'));
    await esperarEfeitos();
    const save = mockPdf.find(([n]) => n === 'save');
    expect(save[1]).toBe('ficha-epi-ex-colaborador.pdf');
    expect(mockPdf.filter(([n]) => n === 'text').some(([, t]) => String(t).includes(HASH))).toBe(true);
  });

  // Etapa 178 (T3): a `arquivo_url` e assinada por ~15 min (o servidor mede: exp - agora = 900 s). A ficha aberta ha mais tempo dava
  // 404 no fetch do PDF e o documento da NR-6 saia sem as assinaturas, sem erro nenhum. "Gerar PDF" rele a ficha (URLs novas).
  test('Gerar PDF rele a ficha e busca a assinatura pela URL NOVA (a da tela pode ter expirado)', async () => {
    let leituras = 0;
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/aux/colaboradores') return Promise.resolve({ data: COLABORADORES });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
      if (url === '/almoxarifado/epi/entregas') return Promise.resolve({ data: ENTREGAS });
      if (url === '/almoxarifado/epi/ficha/99') {
        leituras += 1;
        const sig = leituras === 1 ? 'velha' : 'nova';
        return Promise.resolve({ data: { ...FICHA_EXCLUIDO, entregas: [{ ...FICHA_EXCLUIDO.entregas[0],
          arquivo_url: `/api/uploads/almoxarifado/assinatura-epi-12.png?exp=1&sig=${sig}` }] } });
      }
      return Promise.resolve({ data: [] });
    });
    // so a URL nova abre; a velha (expirada) e o 404 do servidor
    global.fetch = jest.fn((url) => Promise.resolve(String(url).includes('sig=nova')
      ? { ok: true, blob: () => Promise.resolve(new Blob(['png'], { type: 'image/png' })) }
      : { ok: false, status: 404 }));
    await renderizar();
    await clicar(botao('Entregas'));
    const linha = [...container.querySelectorAll('.almox-epi-lista tbody tr')][1];
    await clicar([...linha.querySelectorAll('button')].find((b) => b.textContent.includes('Ficha')));
    await clicar(botao('Gerar PDF'));
    await esperarEfeitos();
    expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/epi/ficha/99')).toHaveLength(2);
    expect(global.fetch).toHaveBeenCalledWith('/api/uploads/almoxarifado/assinatura-epi-12.png?exp=1&sig=nova');
    expect(mockPdf.some(([n]) => n === 'addImage')).toBe(true);
    expect(mockPdf.some(([n]) => n === 'save')).toBe(true);
    expect(toast.warn).not.toHaveBeenCalled();
  });

  test('Gerar PDF: assinatura que nao abre -> o PDF sai com a lacuna marcada E a tela avisa (nao em silencio)', async () => {
    await renderizar();
    await clicar(botao('Entregas'));
    const linha = [...container.querySelectorAll('.almox-epi-lista tbody tr')][1];
    await clicar([...linha.querySelectorAll('button')].find((b) => b.textContent.includes('Ficha')));
    await clicar(botao('Gerar PDF'));
    await esperarEfeitos();
    expect(mockPdf.some(([n]) => n === 'save')).toBe(true);
    expect(toast.warn).toHaveBeenCalledWith('1 assinatura não pôde ser carregada e saiu como indisponível no PDF');
  });

  test('Gerar PDF: a releitura da ficha falha -> nao gera PDF com URLs velhas, mostra o erro', async () => {
    let leituras = 0;
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/aux/colaboradores') return Promise.resolve({ data: COLABORADORES });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
      if (url === '/almoxarifado/epi/entregas') return Promise.resolve({ data: ENTREGAS });
      if (url === '/almoxarifado/epi/ficha/99') {
        leituras += 1;
        return leituras === 1 ? Promise.resolve({ data: FICHA_EXCLUIDO })
          : Promise.reject({ response: { status: 500, data: { error: 'banco fora' } } });
      }
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await clicar(botao('Entregas'));
    const linha = [...container.querySelectorAll('.almox-epi-lista tbody tr')][1];
    await clicar([...linha.querySelectorAll('button')].find((b) => b.textContent.includes('Ficha')));
    await clicar(botao('Gerar PDF'));
    await esperarEfeitos();
    expect(mockPdf.some(([n]) => n === 'save')).toBe(false);
    expect(toast.error).toHaveBeenCalledWith('banco fora');
  });

  test('ficha inexistente: a frase do servidor', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/aux/colaboradores') return Promise.resolve({ data: COLABORADORES });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
      if (url === '/almoxarifado/epi/ficha/8') return Promise.reject({ response: { status: 404, data: { error: 'Colaborador #8 não encontrado' } } });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await clicar(botao('Ficha por colaborador'));
    preencher(container.querySelector('select[aria-label="Colaborador da ficha"]'), '8');
    await esperarEfeitos();
    expect(toast.error).toHaveBeenCalledWith('Colaborador #8 não encontrado');
  });
});
