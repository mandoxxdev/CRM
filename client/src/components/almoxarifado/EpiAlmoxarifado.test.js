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

async function preencherValido({ material = '3', quantidade = '2', matricula = 'M-100' } = {}) {
  preencher($('#epi-colaborador'), '7');
  preencher($('#epi-material'), material);
  preencher($('#epi-quantidade'), quantidade);
  preencher($('#epi-confirmacao-matricula'), matricula);
}

describe('Nova entrega', () => {
  // Fase 5: o seletor mostra nome e setor, SEM a matricula — e ela que o colaborador digita para confirmar.
  test('colaborador vem da lista aux (nome (setor), sem a matricula) e o EPI so dos materiais is_epi', async () => {
    await renderizar();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/aux/colaboradores');
    expect(opcoes('#epi-colaborador')).toEqual(['Selecione...', 'Maria Souza (Caldeiraria)', 'Pedro Lima (Usinagem)']);
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
    expect(corpo.get('confirmacao_matricula')).toBe('M-100');
    expect(corpo.get('chave_idempotencia')).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
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

  // Fase 5 (importante 5): as leituras tambem exigem entregar_epi — sem ela a tela so avisa e nao chama nada (cada GET seria 403).
  test('perfil sem entregar_epi: so o aviso; nenhuma chamada, nenhuma aba, nenhum formulario', async () => {
    mockPode = (acao) => acao !== 'entregar_epi';
    await renderizar();
    expect(texto()).toContain('Seu perfil não acessa a entrega de EPI');
    expect(api.get).not.toHaveBeenCalled();
    expect(botao('Registrar entrega')).toBeUndefined();
    expect(botao('Entregas')).toBeUndefined();
    expect($('#epi-colaborador')).toBeNull();
  });

  test('Fase 5: sem a matricula digitada -> a frase do servidor e nao envia', async () => {
    await renderizar();
    await preencherValido({ matricula: '  ' });
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith('O colaborador deve digitar a própria matrícula para confirmar o recebimento');
  });

  test('Fase 5 (M2): a rede cai sem resposta -> o proximo toque reusa a MESMA chave; resposta de erro ou formulario mexido -> chave nova', async () => {
    api.post
      .mockRejectedValueOnce(new Error('Network Error'))
      .mockRejectedValueOnce({ response: { status: 400, data: { error: 'A matrícula informada não confere com a do colaborador' } } })
      .mockRejectedValueOnce(new Error('Network Error'));
    await renderizar();
    await preencherValido();
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(toast.error).toHaveBeenLastCalledWith(
      'Sem resposta do servidor — a entrega pode ter sido registrada. Toque em "Registrar entrega" de novo: o reenvio não duplica.');
    await clicar(botao('Registrar entrega')); // reenvio: mesma chave -> 400 (o servidor respondeu)
    expect(toast.error).toHaveBeenLastCalledWith('A matrícula informada não confere com a do colaborador');
    await clicar(botao('Registrar entrega')); // depois de resposta: chave nova -> cai a rede
    preencher($('#epi-confirmacao-matricula'), 'M-100 '); // mexer no formulario troca a chave
    await clicar(botao('Registrar entrega'));
    const chaves = api.post.mock.calls.map(([, fd]) => fd.get('chave_idempotencia'));
    expect(chaves).toHaveLength(4);
    expect(chaves[1]).toBe(chaves[0]);
    expect(chaves[2]).not.toBe(chaves[1]);
    expect(chaves[3]).not.toBe(chaves[2]);
  });

  test('Fase 5 (M2): o servidor devolve a entrega ja gravada (200, reutilizada) -> avisa que nao duplicou', async () => {
    api.post.mockResolvedValueOnce({ status: 200, data: { id: 50, numero: 'EPI-20261022-0009', movimentacao_id: 700, reutilizada: true,
      evidencia: { id: 60, registro_sha256: HASH } } });
    await renderizar();
    await preencherValido();
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(toast.success).toHaveBeenCalledWith('Entrega EPI-20261022-0009 já estava registrada — o envio repetido não duplicou');
  });

  test('Fase 5 (M5): 413 -> a frase do modulo literal', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 413, data: { error: 'Arquivo grande demais (máximo 2 MB)' } } });
    await renderizar();
    await preencherValido();
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(toast.error).toHaveBeenCalledWith('Arquivo grande demais (máximo 2 MB)');
    expect($('.almox-epi-sucesso')).toBeNull();
  });

  test('Fase 5 (M5): 500 da compensacao que falhou -> o texto do servidor (a saida FICOU, com o numero) e o formulario nao some', async () => {
    const msg = 'Não foi possível gravar a entrega de EPI e a saída do estoque NÃO pôde ser desfeita: a movimentação #700 '
      + '(EPI-X1) ficou registrada sem evidência de entrega. A assinatura foi preservada no servidor. Avise o administrador antes de '
      + 'entregar de novo. (falha; busy)';
    api.post.mockRejectedValueOnce({ response: { status: 500, data: { error: msg } } });
    await renderizar();
    await preencherValido();
    await assinar();
    await clicar(botao('Registrar entrega'));
    expect(toast.error).toHaveBeenCalledWith(msg);
    expect($('.almox-epi-sucesso')).toBeNull();
    expect($('#epi-colaborador').value).toBe('7');
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

  test('Fase 5: Verificar cadeia -> integra; com problema, a lista (#sequencia numero: motivo)', async () => {
    let vez = 0;
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url, ...resto) => {
      if (url === '/almoxarifado/evidencias/cadeia/verificar') {
        vez += 1;
        return Promise.resolve({ data: vez === 1
          ? { integra: true, total: 2, cabeca: { sequencia: 2, registro_sha256: HASH }, problemas: [] }
          : { integra: false, total: 2, cabeca: null, problemas: [{ sequencia: 2, evidencia_id: null, numero: null, motivo: 'registro apagado' }] } });
      }
      return base(url, ...resto);
    });
    await renderizar();
    await clicar(botao('Entregas'));
    await clicar(botao('Verificar cadeia'));
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/evidencias/cadeia/verificar');
    expect($('.almox-epi-cadeia').textContent).toContain('Cadeia íntegra — 2 registros');
    await clicar(botao('Verificar cadeia'));
    expect($('.almox-epi-cadeia').textContent).toContain('Cadeia com problema — 1 ocorrência');
    expect($('.almox-epi-cadeia').textContent).toContain('#2: registro apagado');
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

// Etapa 183 (T3, RN-183.03/04/05) — a ficha na tela mostra a matricula confirmada e o aparelho de cada entrega, pelo MESMO descritor
// do PDF (montarFichaEpi). Ficha mockada na fronteira HTTP com o JSON do contrato da T1.
describe('Ficha: matricula confirmada e aparelho (Etapa 183)', () => {
  const UA_60 = 'Mozilla/5.0 (Linux; Android 13; SM-X200) AppleWebKit/537.36Z';
  const FICHA_183 = {
    colaborador: { id: 7, nome: 'Maria Souza', matricula: 'M-200', setor: 'Caldeiraria', cpf_mascarado: '***.***.***-01', excluido: false },
    entregas: [
      { ...ENTREGAS[0], arquivo_url: '/api/uploads/almoxarifado/assinatura-epi-11.png?exp=1&sig=a', registro_sha256: HASH,
        confirmado_por_matricula: 1, user_agent: UA_60 },
      { ...ENTREGAS[0], id: 13, numero: 'EPI-20260101-0001', criado_em: '2026-01-01T13:00:00.000Z', arquivo_url: null,
        registro_sha256: HASH, confirmado_por_matricula: null, user_agent: null },
    ],
  };
  async function abrirFicha() {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/aux/colaboradores') return Promise.resolve({ data: COLABORADORES });
      if (url === '/almoxarifado/materiais') return Promise.resolve({ data: MATERIAIS });
      if (url === '/almoxarifado/epi/ficha/7') return Promise.resolve({ data: FICHA_183 });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await clicar(botao('Ficha por colaborador'));
    preencher(container.querySelector('select[aria-label="Colaborador da ficha"]'), '7');
    await esperarEfeitos();
    const cabecalhos = [...container.querySelectorAll('.almox-epi-ficha-lista thead th')].map((th) => th.textContent.trim());
    const linhas = [...container.querySelectorAll('.almox-epi-ficha-lista tbody tr')];
    const celula = (linha, cab) => linhas[linha].querySelectorAll('td')[cabecalhos.indexOf(cab)];
    return { cabecalhos, linhas, celula };
  }

  test('[RN-183.03] cabecalhos novos; a entrega diz "digitou M-100" enquanto o topo diz "Matrícula: M-200"', async () => {
    const { cabecalhos, linhas, celula } = await abrirFicha();
    expect(cabecalhos).toEqual(expect.arrayContaining(['Matrícula confirmada', 'Aparelho']));
    expect(linhas).toHaveLength(2);
    expect(texto()).toContain('Matrícula: M-200');
    expect(celula(0, 'Matrícula confirmada').textContent).toBe('Sim — digitou M-100 (confere com o cadastro)');
  });

  test('[RN-183.03] nenhuma celula da confirmacao mostra a flag crua "1"', async () => {
    const { linhas, celula } = await abrirFicha();
    linhas.forEach((_, i) => expect(celula(i, 'Matrícula confirmada').textContent.trim()).not.toBe('1'));
  });

  test('[RN-183.05] entrega antiga -> "Não registrada" e "Não registrado"', async () => {
    const { celula } = await abrirFicha();
    expect(celula(1, 'Matrícula confirmada').textContent).toBe('Não registrada');
    expect(celula(1, 'Aparelho').textContent).toBe('Não registrado');
  });

  test('[RN-183.04] aparelho de 60 caracteres -> 40 + "…" na celula e o texto inteiro no title', async () => {
    expect(UA_60).toHaveLength(60);
    const { celula } = await abrirFicha();
    const td = celula(0, 'Aparelho');
    expect(td.textContent).toBe(`${UA_60.slice(0, 40)}…`);
    expect(td.getAttribute('title')).toBe(UA_60);
  });
});
