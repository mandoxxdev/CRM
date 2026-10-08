/**
 * Etapa 81 (RN-81.05) — o contrato anexo do template so sai pela rota autenticada.
 *
 * Antes: as duas telas tinham `<a href="/api/uploads/contrato/<arquivo>">`, servido por
 * `express.static` SEM LOGIN. Agora o link vira botao que baixa por
 * `api.get('/proposta-template/contrato-anexo/<arquivo>', { responseType: 'blob' })` (Bearer no
 * header) + `<a download>`. As duas telas usam o mesmo util (`baixarContratoAnexo`) para a URL nao
 * divergir — por isso um arquivo de teste para as duas.
 *
 * Erro: o 404 chega como Blob e a mensagem do servidor ("Contrato não encontrado") tem de sair de
 * dentro dele. As duas telas avisam por `alert()`, como o resto de cada componente (medido:
 * `ConfigTemplateProposta.js` e `PreviewPropostaEditavel.js` nao usam toast).
 *
 * `ConfigTemplateProposta` ainda carrega tudo por `axios` cru (Bearer manual): o mock de `axios`
 * abaixo e so para a tela montar; a chamada nova e por `api` — e o teste afirma que o download
 * NAO passou pelo axios cru (sem o interceptor, iria sem token e daria 401).
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false src/components/ContratoAnexoDownload
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import axios from 'axios';
import api from '../services/api';
import ConfigTemplateProposta from './ConfigTemplateProposta';
import PreviewPropostaEditavel from './PreviewPropostaEditavel';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn(), defaults: {} },
}));
jest.mock('axios', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const ARQUIVO = 'contrato_1759900000000_Contrato_Padrao.docx';
const URL_CONTRATO = `/proposta-template/contrato-anexo/${ARQUIVO}`;

let container;
let root;
let cliques;

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

function contratoResolve(headers = { 'content-disposition': `attachment; filename="${ARQUIVO}"` }) {
  return (url) => {
    if (url === '/proposta-template') return Promise.resolve({ data: { contrato_anexo_url: ARQUIVO } });
    if (url === URL_CONTRATO) return Promise.resolve({ data: new Blob(['PK-docx']), headers });
    return Promise.resolve({ data: [] });
  };
}

function contrato404(url) {
  if (url === '/proposta-template') return Promise.resolve({ data: { contrato_anexo_url: ARQUIVO } });
  if (url === URL_CONTRATO) {
    const corpo = new Blob([JSON.stringify({ error: 'Contrato não encontrado' })], { type: 'application/json' });
    return Promise.reject(Object.assign(new Error('Request failed with status code 404'), { response: { status: 404, data: corpo } }));
  }
  return Promise.resolve({ data: [] });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  window.URL.createObjectURL = jest.fn(() => 'blob:mock-contrato');
  window.URL.revokeObjectURL = jest.fn();
  window.alert = jest.fn();
  cliques = [];
  jest.spyOn(window.HTMLAnchorElement.prototype, 'click').mockImplementation(function registrar() {
    cliques.push({ download: this.download, href: this.getAttribute('href') });
  });
  // A tela de configuracao carrega o template e as listas por axios cru.
  axios.get.mockImplementation((url) => {
    if (url === '/api/proposta-template') return Promise.resolve({ data: { formato_numero_proposta: 'PROPOSTA {numero}', contrato_anexo_url: ARQUIVO } });
    return Promise.resolve({ data: [] });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.restoreAllMocks();
});

async function montarConfig() {
  await act(async () => {
    root.render(<MemoryRouter><ConfigTemplateProposta /></MemoryRouter>);
  });
  await esperar(() => !!botao(ARQUIVO));
}

async function montarPreview() {
  await act(async () => {
    root.render(<PreviewPropostaEditavel proposta={{}} formData={{}} itens={[]} onClose={() => {}} />);
  });
  await esperar(() => !!botao('Baixar contrato'));
}

describe('ConfigTemplateProposta', () => {
  test('(a) o nome do contrato e um botao que baixa por api com responseType blob — sem link estatico', async () => {
    api.get.mockImplementation(contratoResolve());
    await montarConfig();
    expect(container.querySelector('a[href*="uploads/contrato"]')).toBeNull();

    await act(async () => { botao(ARQUIVO).click(); });
    await esperar(() => cliques.length > 0);

    expect(api.get).toHaveBeenCalledWith(URL_CONTRATO, { responseType: 'blob' });
    expect(axios.get).not.toHaveBeenCalledWith(expect.stringContaining('contrato-anexo/'), expect.anything());
    expect(cliques).toEqual([{ download: ARQUIVO, href: 'blob:mock-contrato' }]);
    expect(window.alert).not.toHaveBeenCalled();
  });

  test('(b) 404 em Blob: alert com a mensagem do servidor', async () => {
    api.get.mockImplementation(contrato404);
    await montarConfig();

    await act(async () => { botao(ARQUIVO).click(); });
    await esperar(() => window.alert.mock.calls.length > 0);

    expect(window.alert).toHaveBeenCalledWith('Erro: Contrato não encontrado');
    expect(cliques).toEqual([]);
  });

  test('(e) nome com espaco (arquivo legado) vai codificado na URL — encodeURIComponent, nao cru', async () => {
    // O multer atual troca espaco por `_`, mas o servidor aceita espaco no nome (NOME_CONTRATO)
    // para arquivos gravados antes: cru, o espaco quebraria a URL / casaria outro arquivo.
    const comEspaco = 'contrato_1759900000000_Contrato Padrao.docx';
    axios.get.mockImplementation((url) => {
      if (url === '/api/proposta-template') return Promise.resolve({ data: { formato_numero_proposta: 'PROPOSTA {numero}', contrato_anexo_url: comEspaco } });
      return Promise.resolve({ data: [] });
    });
    api.get.mockImplementation(() => Promise.resolve({ data: new Blob(['PK-docx']), headers: {} }));
    await act(async () => {
      root.render(<MemoryRouter><ConfigTemplateProposta /></MemoryRouter>);
    });
    await esperar(() => !!botao(comEspaco));

    await act(async () => { botao(comEspaco).click(); });
    await esperar(() => cliques.length > 0);

    expect(api.get).toHaveBeenCalledWith(
      '/proposta-template/contrato-anexo/contrato_1759900000000_Contrato%20Padrao.docx', { responseType: 'blob' });
    expect(cliques).toEqual([{ download: comEspaco, href: 'blob:mock-contrato' }]);
  });
});

describe('PreviewPropostaEditavel', () => {
  test('(c) "Baixar contrato (anexo)" baixa por api com responseType blob; sem cabecalho o nome e o arquivo', async () => {
    api.get.mockImplementation(contratoResolve({}));
    await montarPreview();
    expect(container.querySelector('a[href*="uploads/contrato"]')).toBeNull();

    await act(async () => { botao('Baixar contrato').click(); });
    await esperar(() => cliques.length > 0);

    expect(api.get).toHaveBeenCalledWith(URL_CONTRATO, { responseType: 'blob' });
    expect(cliques).toEqual([{ download: ARQUIVO, href: 'blob:mock-contrato' }]);
    expect(window.alert).not.toHaveBeenCalled();
  });

  test('(d) 404 em Blob: alert com a mensagem do servidor', async () => {
    api.get.mockImplementation(contrato404);
    await montarPreview();

    await act(async () => { botao('Baixar contrato').click(); });
    await esperar(() => window.alert.mock.calls.length > 0);

    expect(window.alert).toHaveBeenCalledWith('Erro: Contrato não encontrado');
    expect(cliques).toEqual([]);
  });
});
