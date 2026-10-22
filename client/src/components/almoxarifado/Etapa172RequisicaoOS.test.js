/**
 * Etapa 172, T3 (RN-172.07 + emenda C2): a cesta (fluxo padrao de 8+ modulos) nao mandava OS e todo envio
 * voltava 400 "Informe o número da OS…" desde a RN-A (Etapa 33, 16/09) — provado por execucao na T0
 * (`server/tests/api/cestaEnviaRequisicao.api.test.js`). A cesta e o RequisicaoForm ganham:
 *  - texto "Número da OS *" obrigatorio no envio (cesta: mensagem junto do campo, MESMO texto do servidor);
 *  - seletor OPCIONAL "OS cadastrada": escolher preenche o texto com o numero_os e trava (readOnly);
 *    "Digitar outro número" (valor '') limpa o seletor e destrava;
 *  - payload `os_referencia` (texto aparado) e `os_id` (numero ou null);
 *  - lista de OS: `/requisicoes-material/aux/ordens-servico` (cesta e form fora do almoxarifado) ou
 *    `/almoxarifado/aux/ordens-servico` (form em warehouseMode). Falhar nao bloqueia o envio.
 * Mock so na fronteira HTTP (`services/api`), com o corpo do contrato congelado: [{ id, numero_os, status }].
 *
 * Executar: cd client && CI=true npx react-scripts test --watchAll=false --testPathPattern=Etapa172
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicaoMaterialCesta from './RequisicaoMaterialCesta';
import RequisicaoForm from './RequisicaoForm';
import RequisicoesMaterialContext from './RequisicoesMaterialContext';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Fulano' } }),
}));

const MSG_SERVIDOR = 'Informe o número da OS: toda saída de material precisa estar vinculada a uma OS';
const ORDENS = [
  { id: 7, numero_os: 'OS-2026-058', status: 'em_andamento' },
  { id: 12, numero_os: 'OS-2026-061', status: 'aberta' },
];
const MATERIAL = {
  id: 5, nome: 'Parafuso M8', codigo: 'PAR-08', unidade: 'UN', quantidade_atual: 40, disponibilidade: 'em_estoque',
};
const CTX_CESTA = {
  setor: 'Comercial', moduloOrigem: 'comercial', basePath: '/comercial', label: 'Comercial',
  tipoSetor: 'administrativo', useCesta: true, warehouseMode: false,
};
const CTX_FORM_MODULO = {
  setor: 'Comercial', moduloOrigem: 'comercial', basePath: '/comercial', label: 'Comercial', warehouseMode: false,
};

let falharLista = false;
function mockarApi() {
  api.get.mockImplementation((url) => {
    if (url === '/requisicoes-material/aux/ordens-servico' || url === '/almoxarifado/aux/ordens-servico') {
      return falharLista ? Promise.reject({ response: { status: 500, data: { error: 'boom' } } })
        : Promise.resolve({ data: ORDENS });
    }
    if (url === '/requisicoes-material/materiais' || url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [MATERIAL] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockImplementation((url) => (url === '/requisicoes-material/disponibilidade'
    ? Promise.resolve({ data: [] })
    : Promise.resolve({ data: { id: 1, numero: 'REQ-0009', aprovacao: 'manual' } })));
}

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  falharLista = false;
  mockarApi();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => {
  for (let i = 0; i < 3; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  }
};
const $ = (id) => container.querySelector(`[data-testid="${id}"]`);
const botao = (t) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === t);
async function clicar(b) {
  await act(async () => { b.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
async function digitar(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function escolher(select, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
const postsCriacao = (url) => api.post.mock.calls.filter(([u]) => u === url);

// ---------------------------------------------------------------------------------------------- cesta
async function renderizarCesta() {
  await act(async () => {
    root.render(
      <MemoryRouter>
        <RequisicoesMaterialContext.Provider value={CTX_CESTA}>
          <RequisicaoMaterialCesta />
        </RequisicoesMaterialContext.Provider>
      </MemoryRouter>,
    );
  });
  await esperarEfeitos();
  await clicar(botao('Adicionar'));
}
const enviarCesta = () => clicar(botao('Enviar solicitação'));

describe('Cesta — número da OS (Etapa 172, RN-172.07)', () => {
  test('busca a lista em /requisicoes-material/aux/ordens-servico e mostra as OS no seletor', async () => {
    await renderizarCesta();
    expect(api.get).toHaveBeenCalledWith('/requisicoes-material/aux/ordens-servico');
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/aux/ordens-servico');
    const opcoes = [...$('cesta-os-select').options].map((o) => [o.value, o.textContent]);
    expect(opcoes[0]).toEqual(['', 'Digitar outro número']);
    expect(opcoes.slice(1).map(([v]) => v)).toEqual(['7', '12']);
    expect(opcoes[1][1]).toContain('OS-2026-058');
  });

  test('sem OS: não envia e mostra junto do campo o MESMO texto do servidor', async () => {
    await renderizarCesta();
    await digitar($('cesta-os-numero'), '   ');
    await enviarCesta();
    expect(postsCriacao('/requisicoes-material')).toHaveLength(0);
    expect($('cesta-os-erro').textContent).toBe(MSG_SERVIDOR);
    // junto do campo, nao toast perdido
    expect($('cesta-os-erro').closest('.engc-obs')).toBe($('cesta-os-numero').closest('.engc-obs'));
    expect(toast.error).not.toHaveBeenCalled();
    // digitar limpa a mensagem
    await digitar($('cesta-os-numero'), 'O');
    expect($('cesta-os-erro')).toBeNull();
  });

  test('texto livre: envia os_referencia aparado e os_id null', async () => {
    await renderizarCesta();
    await digitar($('cesta-os-numero'), '  MANUT 22  ');
    await enviarCesta();
    const posts = postsCriacao('/requisicoes-material');
    expect(posts).toHaveLength(1);
    expect(posts[0][1].os_referencia).toBe('MANUT 22');
    expect(posts[0][1].os_id).toBeNull();
    expect(posts[0][1].itens).toEqual([{ material_id: 5, quantidade: 1 }]);
  });

  test('seletor: preenche o texto com numero_os, trava, e manda os_id numérico', async () => {
    await renderizarCesta();
    await escolher($('cesta-os-select'), '7');
    expect($('cesta-os-numero').value).toBe('OS-2026-058');
    expect($('cesta-os-numero').readOnly).toBe(true);
    await enviarCesta();
    const posts = postsCriacao('/requisicoes-material');
    expect(posts).toHaveLength(1);
    expect(posts[0][1].os_id).toBe(7);
    expect(typeof posts[0][1].os_id).toBe('number');
    expect(posts[0][1].os_referencia).toBe('OS-2026-058');
  });

  test('"Digitar outro número" limpa o seletor, destrava o texto e zera os_id', async () => {
    await renderizarCesta();
    await escolher($('cesta-os-select'), '12');
    expect($('cesta-os-numero').readOnly).toBe(true);
    await escolher($('cesta-os-select'), '');
    expect($('cesta-os-select').value).toBe('');
    expect($('cesta-os-numero').readOnly).toBe(false);
    expect($('cesta-os-numero').value).toBe('');
    await digitar($('cesta-os-numero'), 'OS 1714');
    await enviarCesta();
    const posts = postsCriacao('/requisicoes-material');
    expect(posts).toHaveLength(1);
    expect(posts[0][1].os_id).toBeNull();
    expect(posts[0][1].os_referencia).toBe('OS 1714');
  });

  test('lista falha: aviso discreto e o texto continua enviando', async () => {
    falharLista = true;
    await renderizarCesta();
    expect($('cesta-os-aviso')).not.toBeNull();
    expect($('cesta-os-select').options).toHaveLength(1);
    expect(toast.error).not.toHaveBeenCalled();
    await digitar($('cesta-os-numero'), 'OS 1714');
    await enviarCesta();
    const posts = postsCriacao('/requisicoes-material');
    expect(posts).toHaveLength(1);
    expect(posts[0][1]).toEqual(expect.objectContaining({ os_referencia: 'OS 1714', os_id: null }));
  });
});

// ---------------------------------------------------------------------------------------- formulario
async function renderizarForm(ctx) {
  const arvore = (
    <MemoryRouter initialEntries={['/x/requisicoes-material/nova?material_id=5']}>
      <RequisicaoForm />
    </MemoryRouter>
  );
  await act(async () => {
    root.render(ctx
      ? <RequisicoesMaterialContext.Provider value={ctx}>{arvore}</RequisicoesMaterialContext.Provider>
      : arvore);
  });
  await esperarEfeitos();
}
async function enviarForm() {
  const form = container.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperarEfeitos();
}

describe('RequisicaoForm — OS cadastrada opcional (Etapa 172)', () => {
  test('warehouseMode: a lista vem de /almoxarifado/aux/ordens-servico; seletor preenche, trava e manda os_id', async () => {
    await renderizarForm(null); // sem provider = config do almoxarifado (warehouseMode)
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/aux/ordens-servico');
    expect(api.get).not.toHaveBeenCalledWith('/requisicoes-material/aux/ordens-servico');
    await escolher($('req-os-select'), '7');
    expect($('req-os-numero').value).toBe('OS-2026-058');
    expect($('req-os-numero').readOnly).toBe(true);
    await enviarForm();
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/almoxarifado/requisicoes');
    expect(payload.os_id).toBe(7);
    expect(payload.os_referencia).toBe('OS-2026-058');
  });

  test('fora do almoxarifado: a lista vem de /requisicoes-material/aux/ordens-servico', async () => {
    await renderizarForm(CTX_FORM_MODULO);
    expect(api.get).toHaveBeenCalledWith('/requisicoes-material/aux/ordens-servico');
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/aux/ordens-servico');
    await escolher($('req-os-select'), '12');
    await enviarForm();
    const posts = postsCriacao('/requisicoes-material');
    expect(posts).toHaveLength(1);
    expect(posts[0][1].os_id).toBe(12);
    expect(posts[0][1].os_referencia).toBe('OS-2026-061');
  });

  test('"Digitar outro número" destrava e zera os_id; texto vai aparado', async () => {
    await renderizarForm(null);
    await escolher($('req-os-select'), '7');
    await escolher($('req-os-select'), '');
    expect($('req-os-numero').readOnly).toBe(false);
    expect($('req-os-numero').value).toBe('');
    await digitar($('req-os-numero'), ' MANUT 22 ');
    await enviarForm();
    const payload = api.post.mock.calls[0][1];
    expect(payload.os_id).toBeNull();
    expect(payload.os_referencia).toBe('MANUT 22');
  });

  test('sem OS: não envia e o toast tem o texto do servidor', async () => {
    await renderizarForm(null);
    await enviarForm();
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalledWith(MSG_SERVIDOR);
  });

  test('lista falha: aviso discreto e o texto continua enviando', async () => {
    falharLista = true;
    await renderizarForm(null);
    expect($('req-os-aviso')).not.toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
    await digitar($('req-os-numero'), 'OS 1714');
    await enviarForm();
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][1]).toEqual(expect.objectContaining({ os_referencia: 'OS 1714', os_id: null }));
  });
});

// ------------------------------------------------------------------- rascunho (Fase 5 da Etapa 172)
// A RN-A e cobrada no ENVIO e pulada no rascunho (igual ao servidor). Sem esta asercao, a guarda
// `!salvarRascunho &&` podia virar `!osReferencia.trim()` e o rascunho sem OS ficaria travado no
// cliente sem nenhum teste vermelho (controle positivo: remover `!salvarRascunho &&` → vermelho).
describe('Rascunho em warehouseMode — OS vazia não bloqueia; OS escolhida vai junto (Etapa 172, Fase 5)', () => {
  const CTX_CESTA_ALMOX = { ...CTX_CESTA, warehouseMode: true };

  test('cesta: OS vazia + "Salvar rascunho" faz UM POST com salvar_rascunho true e os_id null', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <RequisicoesMaterialContext.Provider value={CTX_CESTA_ALMOX}>
            <RequisicaoMaterialCesta />
          </RequisicoesMaterialContext.Provider>
        </MemoryRouter>,
      );
    });
    await esperarEfeitos();
    await clicar(botao('Adicionar'));
    expect($('cesta-os-numero').value).toBe('');
    await clicar(botao('Salvar rascunho'));
    const posts = postsCriacao('/requisicoes-material');
    expect(posts).toHaveLength(1);
    expect(posts[0][1]).toEqual(expect.objectContaining({ salvar_rascunho: true, os_id: null, os_referencia: '' }));
    expect($('cesta-os-erro')).toBeNull();
  });

  // Substitui a parte regex do 0b de server/tests/api/cestaEnviaRequisicao (fiacao lida do fonte).
  test('cesta fora do warehouseMode: sem botão de rascunho; o envio é UM POST em /requisicoes-material', async () => {
    await renderizarCesta();
    expect(botao('Salvar rascunho')).toBeUndefined();
    expect(botao('Enviar solicitação')).toBeDefined();
    await digitar($('cesta-os-numero'), 'OS 1714');
    await enviarCesta();
    expect(postsCriacao('/requisicoes-material')).toHaveLength(1);
    expect(postsCriacao('/requisicoes-material')[0][1].salvar_rascunho).toBe(false);
  });

  test('cesta: rascunho com OS selecionada manda os_id', async () => {
    await act(async () => {
      root.render(
        <MemoryRouter>
          <RequisicoesMaterialContext.Provider value={CTX_CESTA_ALMOX}>
            <RequisicaoMaterialCesta />
          </RequisicoesMaterialContext.Provider>
        </MemoryRouter>,
      );
    });
    await esperarEfeitos();
    await clicar(botao('Adicionar'));
    await escolher($('cesta-os-select'), '7');
    await clicar(botao('Salvar rascunho'));
    const posts = postsCriacao('/requisicoes-material');
    expect(posts).toHaveLength(1);
    expect(posts[0][1]).toEqual(expect.objectContaining({ salvar_rascunho: true, os_id: 7, os_referencia: 'OS-2026-058' }));
  });

  test('RequisicaoForm: OS vazia + "Salvar Rascunho" faz UM POST com salvar_rascunho true e os_id null', async () => {
    await renderizarForm(null);
    expect($('req-os-numero').value).toBe('');
    await clicar(botao('Salvar Rascunho'));
    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, payload] = api.post.mock.calls[0];
    expect(url).toBe('/almoxarifado/requisicoes');
    expect(payload).toEqual(expect.objectContaining({ salvar_rascunho: true, os_id: null }));
    expect(toast.error).not.toHaveBeenCalledWith(MSG_SERVIDOR);
  });

  test('RequisicaoForm: rascunho com OS selecionada manda os_id', async () => {
    await renderizarForm(null);
    await escolher($('req-os-select'), '12');
    await clicar(botao('Salvar Rascunho'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post.mock.calls[0][1]).toEqual(expect.objectContaining({
      salvar_rascunho: true, os_id: 12, os_referencia: 'OS-2026-061',
    }));
  });
});
