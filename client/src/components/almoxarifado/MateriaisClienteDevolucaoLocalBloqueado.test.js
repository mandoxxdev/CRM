/**
 * Etapa 237 (C543, B1542) — com a localização padrão do material bloqueada, a devolução ao cliente é recusada pelo servidor mesmo com a peça
 * em outro endereço. A janela "Devolver ao cliente" passa a avisar ao abrir e apaga o "Confirmar devolução"; sem o bloqueio, nada muda.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa237-devolucao-cliente-localizacao-bloqueada.md (RN-237.03 e .04).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisClienteDevolucaoLocalBloqueado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MateriaisClienteAlmoxarifado from './MateriaisClienteAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../utils/posicaoClientePdf', () => ({
  __esModule: true, gerarPosicaoClientePDF: jest.fn(), montarPosicaoClientePDF: jest.fn(),
}));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));

const item = (material_id, codigo, extra) => ({
  material_id, codigo, nome: `Mat ${codigo}`, unidade: 'UN', recebido: 5, consumido: 0, devolvido: 0, saldo: 5, saldo_disponivel: 5,
  controle_serie: 0, controle_lote: 0, ...extra,
});
const POSICAO = {
  cliente: { id: 1, razao_social: 'Cliente Alfa LTDA' },
  itens: [
    item(51, 'BLOQ', { localizacao_padrao_codigo: 'R5L-3', localizacao_padrao_bloqueada: true }),
    item(52, 'LIVRE', { localizacao_padrao_codigo: 'R1', localizacao_padrao_bloqueada: false }),
    item(53, 'ANTIGO'),
    item(54, 'LOTEBLOQ', { controle_lote: 1, localizacao_padrao_codigo: 'R5L-3', localizacao_padrao_bloqueada: true }),
    item(56, 'LOTENEG', { controle_lote: 1, permite_saldo_negativo: true, localizacao_padrao_codigo: 'R5L-3', localizacao_padrao_bloqueada: true }),
    item(55, 'SERIEBLOQ', { controle_serie: 1, localizacao_padrao_codigo: 'R5L-3', localizacao_padrao_bloqueada: true }),
  ],
  aplicacoes: [],
};

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais-cliente/clientes') return Promise.resolve({ data: [{ cliente_id: 1, cliente_nome: 'Cliente Alfa LTDA', materiais: 3 }] });
    if (url.includes('/materiais-cliente/posicao?cliente_id=1')) return Promise.resolve({ data: POSICAO });
    if (url === '/almoxarifado/materiais/54/lotes?com_saldo=1') return Promise.resolve({ data: [{ id: 7, codigo: 'L1', saldo: 5, elegivel: true }] });
    if (url === '/almoxarifado/materiais/55/series?status=EM_ESTOQUE') {
      return Promise.resolve({ data: [{ id: 91, numero: 'S1', lote_id: 7, lote_codigo: 'L1' }, { id: 92, numero: 'S2', lote_id: null, lote_codigo: null }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperar = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
const linha = (c) => [...container.querySelectorAll('.almox-table tbody tr')].find((tr) => tr.textContent.includes(c));
const botaoDevolver = (c) => [...linha(c).querySelectorAll('button')].find((b) => b.textContent.includes('Devolver'));
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperar();
}
async function abrir(codigo) {
  await act(async () => { root.render(<MemoryRouter><MateriaisClienteAlmoxarifado /></MemoryRouter>); });
  await esperar();
  const select = container.querySelector('.almox-filters select.almox-select');
  const setSel = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setSel.call(select, '1'); select.dispatchEvent(new Event('change', { bubbles: true })); });
  await esperar();
  await clicar(botaoDevolver(codigo));
}
const campo = (rotulo) => [...container.querySelectorAll('.almox-modal .almox-field')]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo)).querySelector('input');
function preencher(el, v) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true })); });
}
const botaoConfirmar = () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Confirmar devolução'));
const aviso = () => container.querySelector('#dev-loc-bloqueada');

describe('Etapa 237 — a devolução ao cliente avisa a localização padrão bloqueada', () => {
  test('[RN-237.03] padrão bloqueada: o aviso com o código e o Confirmar apagado, nenhum POST', async () => {
    await abrir('BLOQ');
    expect(aviso().textContent).toBe(
      'A localização padrão deste material (R5L-3) está bloqueada: sem escolher de onde sai, a devolução será recusada. '
      + 'Escolha em "Sai de" um endereço livre ou desbloqueie a localização.');
    preencher(campo('Quantidade'), '1');
    preencher(campo('documento'), 'DEV-1');
    await esperar();
    expect(botaoConfirmar().disabled).toBe(true);
    await clicar(botaoConfirmar());
    expect(api.post).not.toHaveBeenCalled();
  });

  test('[RN-237.04] padrão livre: sem aviso, o Confirmar envia', async () => {
    await abrir('LIVRE');
    expect(aviso()).toBeNull();
    preencher(campo('Quantidade'), '1');
    preencher(campo('documento'), 'DEV-2');
    await esperar();
    expect(botaoConfirmar().disabled).toBe(false);
    await clicar(botaoConfirmar());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes',
      { material_id: 52, quantidade: 1, documento_devolucao: 'DEV-2' });
  });

  test('[RN-237.04] posição sem os campos novos (servidor antigo): a janela é a de antes', async () => {
    await abrir('ANTIGO');
    expect(aviso()).toBeNull();
    expect(botaoConfirmar().disabled).toBe(false);
  });
});

// Etapa 239 (RN-239.06, C543 no motor): com lote o servidor confere o endereco do lote, nao a padrao — o aviso fica so para a devolucao sem lote.
describe('Etapa 239 — com lote a padrão bloqueada não barra a devolução', () => {
  const marcar = async (id) => {
    const cb = container.querySelector(`input[data-serie-id="${id}"]`);
    await clicar(cb);
  };

  test('[RN-239.06] material com controle de lote e padrão bloqueada: sem aviso, o Confirmar envia com o lote', async () => {
    await abrir('LOTEBLOQ');
    expect(aviso()).toBeNull();
    expect(container.querySelector('#dev-lote').value).toBe('7');
    preencher(campo('Quantidade'), '1');
    preencher(campo('documento'), 'DEV-3');
    await esperar();
    expect(botaoConfirmar().disabled).toBe(false);
    await clicar(botaoConfirmar());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes',
      { material_id: 54, quantidade: 1, documento_devolucao: 'DEV-3', lote_id: 7 });
  });

  test('[RN-239.06] série sem controle de lote: sem marcadas o aviso aparece; marcada a de um lote some; marcada a sem lote volta', async () => {
    await abrir('SERIEBLOQ');
    expect(aviso()).not.toBeNull();
    expect(botaoConfirmar().disabled).toBe(true);
    await marcar(91);
    expect(container.querySelector('#dev-series-lote-da-devolucao').textContent).toBe('As séries marcadas saem do lote L1.');
    expect(aviso()).toBeNull();
    expect(botaoConfirmar().disabled).toBe(false);
    await marcar(91);
    await marcar(92);
    expect(aviso()).not.toBeNull();
    expect(botaoConfirmar().disabled).toBe(true);
  });
});

describe('Etapa 239 (Fase 5) — saldo negativo permitido: o servidor confere a padrão mesmo com lote', () => {
  test('[RN-239.06] material com lote e permite_saldo_negativo: o aviso continua e o Confirmar fica apagado', async () => {
    await abrir('LOTENEG');
    expect(aviso().textContent).toContain('(R5L-3) está bloqueada');
    expect(botaoConfirmar().disabled).toBe(true);
  });
});
