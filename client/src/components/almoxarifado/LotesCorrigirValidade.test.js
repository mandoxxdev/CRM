/**
 * Etapa 191 — T3: "Corrigir validade" na aba Lotes de "Lotes e Séries" (RN-191.13).
 *
 * Antes desta etapa a validade de um lote com saldo nao tinha correcao nenhuma: a 190 recusava a
 * Entrada com data diferente e mandava "pedir a correcao" a ninguem. Aqui a tela ganha o botao e o
 * modal que chamam `PUT /almoxarifado/lotes/:id/validade` (contrato congelado no plano da 191).
 * Mock so na fronteira HTTP (api) e no hook de permissoes; as respostas sao as do contrato. Os
 * textos dos avisos e dos erros vem do SERVIDOR — a tela so os repassa.
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false src/components/almoxarifado/LotesCorrigirValidade
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import LotesAlmoxarifado from './LotesAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// `mockPode` controla o que o hook responde por acao — o teste 1 nega so `inspecionar`.
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: (acao) => mockPode(acao), bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const MATERIAL = { id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' };

const LOTE_ERRADO = {
  id: 301, codigo: 'L-ERRADO', status: 'ATIVO', status_motivo: null,
  data_validade: '2025-03-10', vencido: true, vencimento_liberado: false,
  corrida: null, fornecedor_nome: 'Fornecedor A', nota_fiscal: 'NF-1', saldo: 10, elegivel: false,
};
const LOTE_SEM_VALIDADE = {
  id: 302, codigo: 'L-SEM', status: 'ATIVO', status_motivo: null,
  data_validade: null, vencido: false, vencimento_liberado: false,
  corrida: null, fornecedor_nome: 'Fornecedor B', nota_fiscal: 'NF-2', saldo: 5, elegivel: true,
};

// Literais do contrato (servidor) — a tela nao as monta, so as mostra.
const MSG_MUDOU = 'A validade do lote L-ERRADO mudou enquanto a tela estava aberta (agora 10/03/2027). Recarregue e confira antes de corrigir.';
const AVISO_VENCIDO = 'Com a validade corrigida (10/03/2024), o lote L-ERRADO está vencido: a saída para consumo fica bloqueada até liberar o vencimento.';
const AVISO_ETIQUETA = 'As etiquetas já impressas do lote L-ERRADO mostram a validade antiga (10/03/2025) — reimprima pela tela Lotes e Séries (a etiqueta do recebimento usa a data da nota).';

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
    if (url === `/almoxarifado/materiais/${MATERIAL.id}/lotes`) return Promise.resolve({ data: [LOTE_ERRADO, LOTE_SEM_VALIDADE] });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { lote: { ...LOTE_ERRADO, data_validade: '2027-03-10' }, avisos: [] } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function esperarEfeitos() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function renderizarComMaterial() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={[`/?material_id=${MATERIAL.id}`]}><LotesAlmoxarifado /></MemoryRouter>);
  });
  await esperarEfeitos();
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];
const botoesDaLinha = (i) => [...linhas()[i].querySelectorAll('.almox-btn-icon')];
const botaoCorrigir = (i) => botoesDaLinha(i).find((b) => b.getAttribute('title') === 'Corrigir validade');
const modal = () => [...container.querySelectorAll('.almox-modal')]
  .find((m) => m.querySelector('h2')?.textContent === 'Corrigir validade');
const botaoModal = (texto) => [...(modal()?.querySelectorAll('.almox-modal-footer button') || [])]
  .find((b) => b.textContent.trim() === texto);
const campoData = () => container.querySelector('#lote-validade-nova');
const campoJustificativa = () => container.querySelector('#lote-validade-justificativa');

async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

async function abrirCorrigir(i) {
  await clicar(botaoCorrigir(i));
}

async function corrigir(i, data, justificativa) {
  await abrirCorrigir(i);
  preencher(campoData(), data);
  preencher(campoJustificativa(), justificativa);
  await clicar(botaoModal('Corrigir'));
  await esperarEfeitos();
}

describe('Etapa 191 — corrigir validade do lote (tela)', () => {
  test('[RN-191.13] botao so com inspecionar', async () => {
    await renderizarComMaterial();
    expect(linhas()).toHaveLength(2);
    linhas().forEach((_, i) => {
      const b = botaoCorrigir(i);
      expect(b).toBeTruthy();
      expect(b.getAttribute('aria-label')).toBe('Corrigir validade');
    });

    act(() => root.unmount());
    root = createRoot(container);
    mockPode = (acao) => acao !== 'inspecionar';
    await renderizarComMaterial();
    expect(linhas()).toHaveLength(2);
    linhas().forEach((_, i) => {
      expect(botaoCorrigir(i)).toBeUndefined();
      // Os outros botoes continuam (o gate deles e o bloquearSeNaoPode no clique).
      const titulos = botoesDaLinha(i).map((b) => b.getAttribute('title'));
      expect(titulos).toEqual(expect.arrayContaining([
        'Mudar status (bloquear/reprovar/reativar)', 'Anexar certificado do fornecedor', 'Imprimir etiqueta deste lote',
      ]));
    });
  });

  test('[RN-191.13] modal mostra a validade atual', async () => {
    await renderizarComMaterial();
    await abrirCorrigir(0);
    expect(modal()).toBeTruthy();
    expect(modal().textContent).toContain('Lote L-ERRADO — validade atual: 10/03/2025');
    expect(modal().textContent).toContain('A validade vale para todo o saldo do lote. Se ele tinha o vencimento liberado, a liberação cai.');
    expect(campoData().getAttribute('type')).toBe('date');
    expect(campoJustificativa().getAttribute('placeholder')).toBe('Por que a validade gravada está errada? (ex.: a NF diz 03/2027)');
    await clicar(botaoModal('Cancelar'));
    expect(modal()).toBeUndefined();

    await abrirCorrigir(1);
    expect(modal().textContent).toContain('Lote L-SEM — validade atual: sem validade');
  });

  test('[RN-191.13] Corrigir desabilitado', async () => {
    await renderizarComMaterial();
    await abrirCorrigir(0);
    expect(botaoModal('Corrigir').disabled).toBe(true);
    preencher(campoJustificativa(), 'NF diz 2027');
    expect(botaoModal('Corrigir').disabled).toBe(true);
    preencher(campoData(), '2027-03-10');
    preencher(campoJustificativa(), '   ');
    expect(botaoModal('Corrigir').disabled).toBe(true);
    preencher(campoJustificativa(), 'NF diz 2027');
    expect(botaoModal('Corrigir').disabled).toBe(false);
  });

  test('[RN-191.13] payload', async () => {
    await renderizarComMaterial();
    await corrigir(0, '2027-03-10', '  NF diz 2027  ');
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/lotes/301/validade', {
      data_validade: '2027-03-10', validade_vista: '2025-03-10', justificativa: 'NF diz 2027',
    });

    await corrigir(1, '2028-01-31', 'Etiqueta do fornecedor');
    expect(api.put).toHaveBeenLastCalledWith('/almoxarifado/lotes/302/validade', {
      data_validade: '2028-01-31', validade_vista: null, justificativa: 'Etiqueta do fornecedor',
    });
  });

  test('[RN-191.13] avisos viram toast.warn persistente', async () => {
    api.put.mockResolvedValueOnce({
      data: { lote: { ...LOTE_ERRADO, data_validade: '2024-03-10' }, avisos: [AVISO_VENCIDO, AVISO_ETIQUETA] },
    });
    await renderizarComMaterial();
    const getsAntes = api.get.mock.calls.filter(([u]) => u === `/almoxarifado/materiais/${MATERIAL.id}/lotes`).length;
    await corrigir(0, '2024-03-10', 'NF diz 2024');
    expect(toast.success).toHaveBeenCalledWith('Validade do lote corrigida!');
    expect(toast.warn).toHaveBeenCalledTimes(2);
    expect(toast.warn).toHaveBeenNthCalledWith(1, AVISO_VENCIDO, { autoClose: false });
    expect(toast.warn).toHaveBeenNthCalledWith(2, AVISO_ETIQUETA, { autoClose: false });
    expect(modal()).toBeUndefined();
    const getsDepois = api.get.mock.calls.filter(([u]) => u === `/almoxarifado/materiais/${MATERIAL.id}/lotes`).length;
    expect(getsDepois).toBe(getsAntes + 1);
  });

  test('[RN-191.13] 409 mantem o modal', async () => {
    api.put.mockRejectedValueOnce({ response: { status: 409, data: { error: MSG_MUDOU } } });
    await renderizarComMaterial();
    await corrigir(0, '2027-03-10', 'NF diz 2027');
    expect(toast.error).toHaveBeenCalledWith(MSG_MUDOU);
    expect(toast.success).not.toHaveBeenCalled();
    expect(modal()).toBeTruthy();
    expect(campoData().value).toBe('2027-03-10');
    expect(campoJustificativa().value).toBe('NF diz 2027');
    expect(botaoModal('Corrigir').disabled).toBe(false);
  });

  test('[RN-191.13] erro sem corpo usa a frase padrao', async () => {
    api.put.mockRejectedValueOnce(new Error('Network Error'));
    await renderizarComMaterial();
    await corrigir(0, '2027-03-10', 'NF diz 2027');
    expect(toast.error).toHaveBeenCalledWith('Erro ao corrigir a validade do lote');
    expect(modal()).toBeTruthy();
  });
});
