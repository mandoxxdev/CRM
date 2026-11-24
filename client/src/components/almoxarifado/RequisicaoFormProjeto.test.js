/**
 * Etapa 260 (item 2) — RN-260.05: o campo Projeto no formulário da requisição.
 *
 * Lista opcional ("— sem projeto —"), de `/almoxarifado/aux/projetos` (almoxarifado) ou `/requisicoes-material/aux/projetos` (fora dele).
 * Escolher uma OS cadastrada com projeto preenche e trava o projeto ("vem da OS escolhida"); OS sem projeto, ou "Digitar outro número",
 * destrava e limpa o que tinha vindo da OS. O projeto da OS fora da lista aparece como "Projeto #<id>". O resumo mostra o projeto. O envio
 * manda `projeto_id` só quando escolhido.
 * Mock só na fronteira HTTP, com o corpo do contrato do plano.
 *
 * Plano: docs/superpowers/plans/2026-11-23-almoxarifado-etapa260-fornecedores-na-busca-projeto-e-fila-agrupada.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicaoFormProjeto --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicaoForm from './RequisicaoForm';
import RequisicoesMaterialContext from './RequisicoesMaterialContext';
import api from '../../services/api';

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

const ORDENS = [
  { id: 7, numero_os: 'OS-2026-058', status: 'em_andamento', projeto_id: 31 },
  { id: 12, numero_os: 'OS-2026-061', status: 'aberta', projeto_id: null },
  { id: 15, numero_os: 'OS-2026-070', status: 'aberta', projeto_id: 99 }, // projeto fora da lista
];
const PROJETOS = [
  { id: 30, nome: 'Ampliação', status: 'ativo', cliente_id: 2, cliente_nome: 'CLIENTE B' },
  { id: 31, nome: 'Linha 2', status: 'ativo', cliente_id: 1, cliente_nome: 'CLIENTE A' },
  { id: 40, nome: 'Antigo', status: 'inativo', cliente_id: null, cliente_nome: null },
];
const MATERIAL = { id: 5, nome: 'Parafuso M8', codigo: 'PAR-08', unidade: 'UN', quantidade_atual: 40, disponibilidade: 'em_estoque' };
const CTX_FORM_MODULO = { setor: 'Comercial', moduloOrigem: 'comercial', basePath: '/comercial', label: 'Comercial', warehouseMode: false };

let falharProjetos = false;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  falharProjetos = false;
  api.get.mockImplementation((url) => {
    if (url.endsWith('/aux/ordens-servico')) return Promise.resolve({ data: ORDENS });
    if (url.endsWith('/aux/projetos')) {
      return falharProjetos ? Promise.reject({ response: { status: 500 } }) : Promise.resolve({ data: PROJETOS });
    }
    if (url === '/requisicoes-material/materiais' || url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockImplementation((url) => (url === '/requisicoes-material/disponibilidade'
    ? Promise.resolve({ data: [] })
    : Promise.resolve({ data: { id: 1, numero: 'REQ-0009', aprovacao: 'manual' } })));
});

let container; let root;
beforeEach(() => {
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
async function escolher(select, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function digitar(input, valor) {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function renderizar(ctx) {
  const arvore = (
    <MemoryRouter initialEntries={['/x/requisicoes-material/nova?material_id=5']}>
      <RequisicaoForm />
    </MemoryRouter>
  );
  await act(async () => {
    root.render(ctx ? <RequisicoesMaterialContext.Provider value={ctx}>{arvore}</RequisicoesMaterialContext.Provider> : arvore);
  });
  await esperarEfeitos();
}
async function enviar() {
  const form = container.querySelector('form');
  await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await esperarEfeitos();
}
const payloadDe = (url) => api.post.mock.calls.filter(([u]) => u === url).map(([, p]) => p);
const resumo = (rotulo) => [...container.querySelectorAll('span')].find((s) => s.textContent === rotulo)?.nextSibling?.textContent;

describe('RequisicaoForm — Projeto (Etapa 260, RN-260.05)', () => {
  test('almoxarifado: a lista vem de /almoxarifado/aux/projetos, com cliente e "(inativo)"; escolher manda projeto_id', async () => {
    await renderizar(null);
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/aux/projetos');
    const opcoes = [...$('req-projeto-select').options].map((o) => [o.value, o.textContent]);
    expect(opcoes).toEqual([['', '— sem projeto —'], ['30', 'Ampliação — CLIENTE B'], ['31', 'Linha 2 — CLIENTE A'],
      ['40', 'Antigo (inativo)']]);
    expect($('req-projeto-dica').textContent).toBe('opcional');
    await escolher($('req-projeto-select'), '30');
    expect(resumo('Projeto')).toBe('Ampliação — CLIENTE B');
    await digitar($('req-os-numero'), 'OS 1714');
    await enviar();
    const [p] = payloadDe('/almoxarifado/requisicoes');
    expect(p.projeto_id).toBe(30);
  });

  test('fora do almoxarifado: a lista vem de /requisicoes-material/aux/projetos', async () => {
    await renderizar(CTX_FORM_MODULO);
    expect(api.get).toHaveBeenCalledWith('/requisicoes-material/aux/projetos');
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/aux/projetos');
    await escolher($('req-projeto-select'), '31');
    await digitar($('req-os-numero'), 'OS 1714');
    await enviar();
    const [p] = payloadDe('/requisicoes-material');
    expect(p.projeto_id).toBe(31);
  });

  test('sem projeto escolhido: o envio não leva projeto_id', async () => {
    await renderizar(null);
    await digitar($('req-os-numero'), 'OS 1714');
    await enviar();
    const [p] = payloadDe('/almoxarifado/requisicoes');
    expect(p).toBeDefined();
    expect('projeto_id' in p).toBe(false);
    expect(resumo('Projeto')).toBe('—');
  });

  test('OS com projeto: preenche e trava ("vem da OS escolhida"); OS sem projeto destrava e limpa', async () => {
    await renderizar(null);
    await escolher($('req-projeto-select'), '30');
    await escolher($('req-os-select'), '7');
    expect($('req-projeto-select').value).toBe('31');
    expect($('req-projeto-select').disabled).toBe(true);
    expect($('req-projeto-dica').textContent).toBe('vem da OS escolhida');
    await escolher($('req-os-select'), '12');
    expect($('req-projeto-select').value).toBe('');
    expect($('req-projeto-select').disabled).toBe(false);
    expect($('req-projeto-dica').textContent).toBe('opcional');
  });

  test('"Digitar outro número" destrava e limpa o projeto da OS; o projeto escolhido à mão não é limpo por OS sem projeto', async () => {
    await renderizar(null);
    await escolher($('req-os-select'), '7');
    await escolher($('req-os-select'), '');
    expect($('req-projeto-select').value).toBe('');
    expect($('req-projeto-select').disabled).toBe(false);
    await escolher($('req-projeto-select'), '30');
    await escolher($('req-os-select'), '12');
    expect($('req-projeto-select').value).toBe('30');
  });

  test('o projeto da OS fora da lista aparece como "Projeto #<id>" e vai no envio', async () => {
    await renderizar(null);
    await escolher($('req-os-select'), '15');
    const sel = $('req-projeto-select');
    expect(sel.value).toBe('99');
    expect(sel.options[sel.selectedIndex].textContent).toBe('Projeto #99');
    await enviar();
    const [p] = payloadDe('/almoxarifado/requisicoes');
    expect([p.os_id, p.projeto_id]).toEqual([15, 99]);
  });

  test('a lista de projetos falha: o campo fica só com "— sem projeto —" e avisa; o envio continua', async () => {
    falharProjetos = true;
    await renderizar(null);
    expect([...$('req-projeto-select').options].map((o) => o.value)).toEqual(['']);
    expect($('req-projeto-dica').textContent).toBe('Não foi possível carregar os projetos.');
    await digitar($('req-os-numero'), 'OS 1714');
    await enviar();
    expect(payloadDe('/almoxarifado/requisicoes')).toHaveLength(1);
  });
});
