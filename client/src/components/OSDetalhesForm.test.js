/**
 * Etapa 81 (RN-81.05) — o PDF da OS so sai pela rota autenticada.
 *
 * Antes: "VER PDF" era um `<a href>` e "Gerar PDF" um `window.open(url)`, os dois para
 * `/uploads/ordens-servico/...` com `:5000` fixo — servido por `express.static` SEM LOGIN, com nome
 * adivinhavel (`OS_<numero>_<ms>.pdf`). Agora as duas acoes baixam por
 * `api.get('/operacional/ordens-servico/:id/pdf', { responseType: 'blob' })` (Bearer no header) e
 * mostram o blob numa aba.
 *
 * O que so este arquivo mede:
 *  - "Gerar PDF" abre a aba NO CLIQUE, antes de a geracao (Puppeteer, segundos) resolver: aberta
 *    depois, sai da janela de ativacao do navegador e o bloqueador de pop-up a engole (F8 da
 *    revisao do plano). O teste segura o `api.post` pendente e afirma o `window.open` ja feito;
 *  - a URL e o `responseType: 'blob'` da chamada (sem o blob, o axios tentaria ler o PDF como
 *    JSON/texto e a aba mostraria lixo);
 *  - o 404 chega como Blob (responseType blob embrulha ate o JSON do erro): a mensagem do servidor
 *    tem de sair de dentro do blob para o toast, e a aba vazia e fechada;
 *  - bloqueador ativo (`window.open` devolve null): o PDF foi gerado, o toast manda clicar em
 *    VER PDF — e o botao tem de existir, mesmo quando a OS nao tinha `pdf_url` antes.
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false src/components/OSDetalhesForm
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../services/api';
import { toast } from 'react-toastify';
import OSDetalhesForm from './OSDetalhesForm';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
  ToastContainer: () => null,
}));

const URL_PDF = '/operacional/ordens-servico/77/pdf';
const OS_COM_PDF = { id: 77, numero_os: 'OS-2026-077', status: 'pendente', pdf_url: '/uploads/ordens-servico/OS_OS-2026-077_1.pdf' };
const OS_SEM_PDF = { id: 77, numero_os: 'OS-2026-077', status: 'pendente', pdf_url: null };

let container;
let root;
let janela;
let abrirOriginal;

function adiado() {
  let resolve;
  let reject;
  const promessa = new Promise((res, rej) => { resolve = res; reject = rej; });
  return { promessa, resolve, reject };
}

async function esperar(condicao, tentativas = 50) {
  for (let i = 0; i < tentativas; i += 1) {
    if (condicao()) return;
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
  throw new Error('condicao nao foi atingida');
}

function botao(texto) {
  return Array.from(container.querySelectorAll('button')).find((b) => b.textContent.includes(texto));
}

async function montar(os) {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <OSDetalhesForm os={os} onClose={() => {}} />
      </MemoryRouter>,
    );
  });
  await esperar(() => api.get.mock.calls.some(([url]) => url === '/operacional/ordens-servico/77/itens'));
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  // jsdom nao implementa URL.createObjectURL/revokeObjectURL.
  window.URL.createObjectURL = jest.fn(() => 'blob:mock-pdf-os');
  window.URL.revokeObjectURL = jest.fn();
  janela = { location: { href: '' }, close: jest.fn() };
  abrirOriginal = window.open;
  window.open = jest.fn(() => janela);
  // Itens da OS no mount: lista vazia (e sem proposta_id nao busca proposta).
  api.get.mockImplementation((url) => {
    if (url === '/operacional/ordens-servico/77/itens') return Promise.resolve({ data: [] });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  window.open = abrirOriginal;
});

function pdfResolve() {
  api.get.mockImplementation((url, opcoes) => {
    if (url === '/operacional/ordens-servico/77/itens') return Promise.resolve({ data: [] });
    if (url === URL_PDF) return Promise.resolve({ data: new Blob(['%PDF-1.4'], { type: 'application/pdf' }), headers: {} });
    return Promise.reject(new Error(`GET inesperado: ${url} ${JSON.stringify(opcoes)}`));
  });
}

test('(a) VER PDF: GET autenticado com responseType blob e o blob na aba aberta no clique; sem :5000', async () => {
  pdfResolve();
  await montar(OS_COM_PDF);
  expect(container.innerHTML).not.toContain(':5000');
  expect(container.querySelector('a[href*="uploads"]')).toBeNull();

  await act(async () => { botao('VER PDF').click(); });
  await esperar(() => janela.location.href !== '');

  expect(window.open).toHaveBeenCalledWith('', '_blank');
  expect(api.get).toHaveBeenCalledWith(URL_PDF, { responseType: 'blob' });
  expect(janela.location.href).toBe('blob:mock-pdf-os');
  const blobEntregue = window.URL.createObjectURL.mock.calls[0][0];
  expect(blobEntregue.type).toBe('application/pdf');
  expect(janela.close).not.toHaveBeenCalled();
  expect(toast.error).not.toHaveBeenCalled();
});

test('(b) Gerar PDF: window.open acontece ANTES de a geracao resolver; depois o blob vai para a aba', async () => {
  pdfResolve();
  const geracao = adiado();
  api.post.mockImplementation(() => geracao.promessa);
  await montar(OS_COM_PDF);

  await act(async () => { botao('REGENERAR PDF').click(); });

  // A geracao ainda nao resolveu e a aba JA foi aberta: e isto que mantem a ativacao do clique.
  expect(api.post).toHaveBeenCalledWith('/operacional/ordens-servico/77/gerar-pdf');
  expect(window.open).toHaveBeenCalledTimes(1);
  expect(window.open).toHaveBeenCalledWith('', '_blank');
  expect(api.get).not.toHaveBeenCalledWith(URL_PDF, expect.anything());

  await act(async () => { geracao.resolve({ data: { pdf_url: '/uploads/ordens-servico/OS_x.pdf' } }); });
  await esperar(() => janela.location.href !== '');

  expect(api.get).toHaveBeenCalledWith(URL_PDF, { responseType: 'blob' });
  expect(janela.location.href).toBe('blob:mock-pdf-os');
  expect(toast.success).toHaveBeenCalledWith('PDF gerado e salvo com sucesso!');
  expect(window.open).toHaveBeenCalledTimes(1);
});

test('(c) 404 em Blob: a mensagem do servidor vai para o toast e a aba vazia e fechada', async () => {
  api.get.mockImplementation((url) => {
    if (url === '/operacional/ordens-servico/77/itens') return Promise.resolve({ data: [] });
    const corpo = new Blob([JSON.stringify({ error: 'PDF da OS não encontrado' })], { type: 'application/json' });
    return Promise.reject(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404, data: corpo } }));
  });
  await montar(OS_COM_PDF);

  await act(async () => { botao('VER PDF').click(); });
  await esperar(() => toast.error.mock.calls.length > 0);

  expect(toast.error).toHaveBeenCalledWith('PDF da OS não encontrado');
  expect(janela.close).toHaveBeenCalledTimes(1);
  expect(janela.location.href).toBe('');
});

test('(d) Gerar PDF com 404 no download: toast com a mensagem do servidor e aba fechada', async () => {
  api.get.mockImplementation((url) => {
    if (url === '/operacional/ordens-servico/77/itens') return Promise.resolve({ data: [] });
    const corpo = new Blob([JSON.stringify({ error: 'PDF da OS não encontrado' })], { type: 'application/json' });
    return Promise.reject(Object.assign(new Error('404'), { response: { status: 404, data: corpo } }));
  });
  api.post.mockResolvedValue({ data: { pdf_url: '/uploads/ordens-servico/OS_x.pdf' } });
  await montar(OS_COM_PDF);

  await act(async () => { botao('REGENERAR PDF').click(); });
  await esperar(() => toast.error.mock.calls.length > 0);

  expect(toast.error).toHaveBeenCalledWith('PDF da OS não encontrado');
  expect(janela.close).toHaveBeenCalledTimes(1);
  expect(toast.success).not.toHaveBeenCalled();
});

test('(e) falha na geracao: fecha a aba e mostra o erro do servidor', async () => {
  pdfResolve();
  api.post.mockRejectedValue({ response: { status: 500, data: { error: 'Falha no Puppeteer' } } });
  await montar(OS_COM_PDF);

  await act(async () => { botao('REGENERAR PDF').click(); });
  await esperar(() => toast.error.mock.calls.length > 0);

  expect(toast.error).toHaveBeenCalledWith('Falha no Puppeteer');
  expect(janela.close).toHaveBeenCalledTimes(1);
  expect(api.get).not.toHaveBeenCalledWith(URL_PDF, expect.anything());
});

test('(f) bloqueador de pop-up na geracao: toast manda clicar em VER PDF, e o botao aparece', async () => {
  pdfResolve();
  window.open = jest.fn(() => null);
  api.post.mockResolvedValue({ data: { pdf_url: '/uploads/ordens-servico/OS_x.pdf' } });
  await montar(OS_SEM_PDF);
  expect(botao('VER PDF')).toBeUndefined();

  await act(async () => { botao('GERAR PDF').click(); });
  await esperar(() => toast.success.mock.calls.length > 0);

  expect(toast.success).toHaveBeenCalledWith('PDF gerado — clique em VER PDF');
  expect(api.get).not.toHaveBeenCalledWith(URL_PDF, expect.anything());
  expect(toast.error).not.toHaveBeenCalled();
  expect(botao('VER PDF')).toBeDefined();
});
