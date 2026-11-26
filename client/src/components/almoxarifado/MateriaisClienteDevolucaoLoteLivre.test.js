/**
 * Etapa 241 (C542) — a janela "Devolver ao cliente" diz o livre do lote. A lista de lotes traz `livre` = min(saldo, livre do material): a
 * reserva é do material, não do lote, e de nenhum lote sai mais que o livre. O rótulo mostra o livre quando ele é menor que o saldo; a frase
 * explica; com o lote escolhido e a quantidade acima do livre, aviso e Confirmar apagado (o servidor recusaria, "Saldo insuficiente").
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa241-livre-no-seletor-de-lote.md (RN-241.02 a .04).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisClienteDevolucaoLoteLivre --watchAll=false
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
  material_id, codigo, nome: `Mat ${codigo}`, unidade: 'UN', recebido: 5, consumido: 0, devolvido: 0, saldo: 5, saldo_disponivel: 2,
  controle_serie: 0, controle_lote: 1, ...extra,
});
const POSICAO = {
  cliente: { id: 1, razao_social: 'Cliente Alfa LTDA' },
  itens: [item(51, 'RESERVADO'), item(52, 'LIVRE'), item(53, 'BLOQLOTE', { saldo: 8, saldo_disponivel: 6 })],
  aplicacoes: [],
};
const lote = (id, codigo, saldo, livre, extra) => ({
  id, codigo, saldo, livre, livre_do_material: livre, data_validade: null, status: 'ATIVO', vencido: false, vencimento_liberado: false,
  elegivel: true, ...extra,
});
// RESERVADO: 5 no material, 3 reservados -> livre do material 2. L1 com 3 (livre 2), L2 com 2 (livre 2 = saldo).
const LOTES_51 = [lote(60, 'L1', 3, 2), lote(61, 'L2', 2, 2)];
// LIVRE: nada reservado — livre igual ao saldo; e um lote com livre null (saldo negativo permitido).
const LOTES_52 = [lote(70, 'K1', 3, 3), lote(71, 'K2', 2, null, { livre_do_material: null })];
const rotas = {
  '/almoxarifado/materiais/51/lotes?com_saldo=1': LOTES_51,
  '/almoxarifado/materiais/52/lotes?com_saldo=1': LOTES_52,
  // Etapa 264: L1 4 com 2 bloqueadas no lote (o livre ja as desconta), L2 4 livre.
  '/almoxarifado/materiais/53/lotes?com_saldo=1': [lote(80, 'M1', 4, 2, { bloqueado_no_lote: 2, livre_do_material: 6 }), lote(81, 'M2', 4, 4, { bloqueado_no_lote: 0, livre_do_material: 6 })],
};

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais-cliente/clientes') {
      return Promise.resolve({ data: [{ cliente_id: 1, cliente_nome: 'Cliente Alfa LTDA', materiais: 2 }] });
    }
    if (url.includes('/materiais-cliente/posicao?cliente_id=1')) return Promise.resolve({ data: POSICAO });
    if (rotas[url]) return Promise.resolve({ data: rotas[url] });
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
async function escolherLote(valor) {
  const sel = container.querySelector('#dev-lote');
  const setSel = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { setSel.call(sel, String(valor)); sel.dispatchEvent(new Event('change', { bubbles: true })); });
  await esperar();
}
const opcao = (v) => container.querySelector(`#dev-lote option[value="${v}"]`);
const botaoConfirmar = () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Confirmar devolução'));
const texto = (sel) => container.querySelector(sel)?.textContent || null;
async function preencherTudo(qtd) {
  preencher(campo('Quantidade'), String(qtd));
  preencher(campo('documento'), 'DEV-241');
  await esperar();
}
const FRASE = 'Livre é o que não está reservado nem retido no material (a reserva é do material, não do lote): '
  + 'de nenhum lote sai mais que o livre.';

describe('Etapa 241 — o livre do lote na devolução ao cliente', () => {
  test('[RN-241.02] o rótulo diz o livre só quando ele é menor que o saldo', async () => {
    await abrir('RESERVADO');
    expect(opcao('60').textContent).toBe('L1 — saldo 3 — livre 2');
    expect(opcao('61').textContent).toBe('L2 — saldo 2');
  });

  test('[RN-241.02/.03] sem reserva (livre = saldo) ou livre null: o rótulo de antes e sem a frase', async () => {
    await abrir('LIVRE');
    expect(opcao('70').textContent).toBe('K1 — saldo 3');
    expect(opcao('71').textContent).toBe('K2 — saldo 2');
    expect(container.querySelector('#dev-lote-livre')).toBeNull();
    expect(container.querySelector('#dev-lote')).not.toBeNull(); // a metade positiva: o seletor está lá
  });

  test('[RN-241.03] com algum lote de livre menor que o saldo, a frase aparece', async () => {
    await abrir('RESERVADO');
    expect(texto('#dev-lote-livre')).toBe(FRASE);
  });

  test('[RN-241.04] lote escolhido e quantidade acima do livre: aviso e Confirmar apagado; no livre, sem aviso e envia', async () => {
    await abrir('RESERVADO');
    await escolherLote(60);
    await preencherTudo(3);
    expect(texto('#dev-lote-livre-nao-cobre')).toBe('Do lote L1 estão livres só 2: devolva até 2 ou libere a reserva do material.');
    expect(botaoConfirmar().disabled).toBe(true);
    preencher(campo('Quantidade'), '2');
    await esperar();
    expect(container.querySelector('#dev-lote-livre-nao-cobre')).toBeNull();
    expect(botaoConfirmar().disabled).toBe(false);
    await clicar(botaoConfirmar());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 51, quantidade: 2, documento_devolucao: 'DEV-241', lote_id: 60,
    });
  });

  test('[RN-241.04] lote com livre igual ao saldo: a quantidade acima não ganha o aviso do livre (a recusa é a do saldo do lote)', async () => {
    await abrir('RESERVADO');
    await escolherLote(61);
    await preencherTudo(3);
    expect(container.querySelector('#dev-lote-livre-nao-cobre')).toBeNull();
    expect(container.querySelector('#dev-lote')).not.toBeNull();
    expect(botaoConfirmar().disabled).toBe(false);
  });
});

// Etapa 264 (RN-264.05, B1623; Fase 2 achado 3): com peça bloqueada no lote, as duas frases não mandam liberar uma reserva que não existe.
describe('Etapa 264 — as peças bloqueadas no lote na devolução ao cliente', () => {
  test('[RN-264.05] a frase do livre cita o bloqueado no lote; acima do livre, "escolha outro lote"', async () => {
    await abrir('BLOQLOTE');
    expect(opcao('80').textContent).toBe('M1 — saldo 4 — livre 2');
    expect(texto('#dev-lote-livre')).toBe('Livre é o que não está reservado nem retido no material, nem bloqueado no próprio lote '
      + '(quarentena, reprovação ou com terceiro): de nenhum lote sai mais que o livre.');
    await escolherLote(80);
    await preencherTudo(3);
    expect(texto('#dev-lote-livre-nao-cobre')).toBe('Do lote M1 estão livres só 2 (2 bloqueadas no lote): devolva até 2 ou escolha outro lote.');
    expect(botaoConfirmar().disabled).toBe(true);
  });
});
