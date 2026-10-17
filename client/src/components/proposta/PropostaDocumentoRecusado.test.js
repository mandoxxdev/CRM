/**
 * Etapa 141 (RN-141.07, C304): o servidor recusa o documento (visualização ou PDF) de proposta com desconto acima de 5% sem aprovação
 * (403 com a frase). Com `responseType: 'blob'` o JSON do erro chega dentro de um Blob, e com `'text'` como string — a tela mostrava uma
 * frase genérica fixa. Este teste monta o formulário de proposta (enviada, onde os botões aparecem) e prende que o toast mostra a frase do
 * servidor; e uma régua de fonte prende os outros pontos (lista, detalhe, editor), com controle que mostra que ela acusa o código antigo.
 *
 * O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { toast } from 'react-toastify';
import PropostaForm from './PropostaForm';
import api from '../../services/api';

const fs = require('fs');
const path = require('path');

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'usuario', nome: 'Vend' }, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const L_DOCUMENTO = 'Não é possível gerar o documento (visualização ou PDF) de uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial → Aprovações; se a proposta já saiu do rascunho, emita uma nova revisão e salve-a para pedir a aprovação.';
const erro403 = (data) => Object.assign(new Error('403'), { response: { status: 403, data } });

let container; let root;
function servidor(respostaDocumento) {
  api.get.mockImplementation((url) => {
    if (url === '/propostas/1') {
      return Promise.resolve({ data: { id: 1, numero_proposta: 'P-1', cliente_id: 3, titulo: 'T', status: 'enviada', margem_desconto: 30, valor_total: 1000, responsavel_id: 7, itens: [] } });
    }
    if (url === '/propostas/1/pdf' || url === '/propostas/1/premium') return respostaDocumento(url);
    return Promise.resolve({ data: [] });
  });
}
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function montar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/comercial/propostas/editar/1']}>
        <Routes><Route path="/comercial/propostas/editar/:id" element={<PropostaForm />} /></Routes>
      </MemoryRouter>
    );
  });
  for (let k = 0; k < 5; k++) await act(async () => { await Promise.resolve(); });
}
async function clicar(texto) {
  const b = [...container.querySelectorAll('.proposta-form-header-actions button')].find((x) => x.textContent.trim() === texto);
  expect(b).toBeTruthy();
  await act(async () => { b.click(); });
  for (let k = 0; k < 10; k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
}

test('[RN-141.07] PDF recusado (403, JSON dentro de um Blob): o toast mostra a frase do servidor', async () => {
  servidor(() => Promise.reject(erro403(new Blob([JSON.stringify({ error: L_DOCUMENTO })], { type: 'application/json' }))));
  await montar();
  await clicar('PDF');
  expect(api.get).toHaveBeenCalledWith('/propostas/1/pdf', { responseType: 'blob' });
  expect(toast.error).toHaveBeenCalledWith(L_DOCUMENTO);
});

test('[RN-141.07] Ver proposta recusado (403, JSON em texto): o toast mostra a frase do servidor', async () => {
  servidor(() => Promise.reject(erro403(JSON.stringify({ error: L_DOCUMENTO }))));
  await montar();
  await clicar('Ver proposta');
  expect(api.get).toHaveBeenCalledWith('/propostas/1/premium', { responseType: 'text' });
  expect(toast.error).toHaveBeenCalledWith(L_DOCUMENTO);
});

test('[RN-141.07] erro sem frase (rede caiu): as genéricas de sempre', async () => {
  servidor(() => Promise.reject(new Error('Network Error')));
  await montar();
  await clicar('PDF');
  await clicar('Ver proposta');
  expect(toast.error.mock.calls.map((c) => c[0])).toEqual(['Erro ao gerar PDF.', 'Erro ao abrir proposta.']);
});

// ── a régua de fonte para os outros pontos ──────────────────────────────────────────────
const fonte = (f) => fs.readFileSync(path.join(__dirname, f), 'utf8');
/**
 * Os toasts de erro dos documentos que ainda usam frase fixa ou `e.response?.data?.error` (que num Blob é undefined). O "Erro ao carregar
 * proposta." só é do documento no editor (o /premium?embed=1); no detalhe é o GET da proposta em JSON, que não muda.
 */
function pontosVelhos(src, comCarregar = true) {
  const re = comCarregar
    ? /toast\.error\((?:e(?:rr)?\.response\?\.data\?\.error \|\| )?'(Erro ao gerar PDF\.|Erro ao abrir proposta\.|Erro ao carregar proposta\.)'\)/g
    : /toast\.error\((?:e(?:rr)?\.response\?\.data\?\.error \|\| )?'(Erro ao gerar PDF\.|Erro ao abrir proposta\.)'\)/g;
  return src.match(re) || [];
}
const PONTOS = {
  'PropostasList.js': ["mensagemDoErroEmBlob(e, 'Erro ao gerar PDF.')"],
  'PropostaDetalhe.js': ["mensagemDoErroEmBlob(e, 'Erro ao abrir proposta.')", "mensagemDoErroEmBlob(e, 'Erro ao gerar PDF.')"],
  'PropostaForm.js': ["mensagemDoErroEmBlob(e, 'Erro ao abrir proposta.')", "mensagemDoErroEmBlob(e, 'Erro ao gerar PDF.')"],
  'PropostaPreviewEditavel.js': ["mensagemDoErroEmBlob(e, 'Erro ao carregar proposta.')", "mensagemDoErroEmBlob(e, 'Erro ao gerar PDF.')"],
};

test('[RN-141.07] lista, detalhe, formulário e editor leem a frase do servidor nos documentos (nenhum toast fixo sobrou)', () => {
  for (const [arq, esperados] of Object.entries(PONTOS)) {
    const src = fonte(arq);
    expect([arq, pontosVelhos(src, arq === 'PropostaPreviewEditavel.js')]).toEqual([arq, []]);
    for (const e of esperados) expect([arq, e, src.split(e).length - 1]).toEqual([arq, e, 1]);
    expect(src).toMatch(/import \{ mensagemDoErroEmBlob \} from '\.\.\/\.\.\/utils\/baixarDocumentoPedido';/);
  }
});

test('controle: a régua acusa os toasts antigos (frase fixa e o .error do Blob)', () => {
  expect(pontosVelhos("    }).catch(() => toast.error('Erro ao abrir proposta.'));")).toHaveLength(1);
  expect(pontosVelhos("      toast.error(e.response?.data?.error || 'Erro ao gerar PDF.');")).toHaveLength(1);
  expect(pontosVelhos("      toast.error('Erro ao carregar proposta.');")).toHaveLength(1);
});
