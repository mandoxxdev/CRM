/**
 * Etapa 242 (C541) — a janela "Devolver ao cliente" avisa quando o material está reservado (para qual OS) e quanto está livre. A posição traz
 * `livre` (a régua do motor) e `reservas: [{ os, quantidade }]`. Quantidade acima do livre: aviso e Confirmar apagado (o servidor recusaria,
 * "Saldo insuficiente. Disponível: n UN").
 *
 * Plano: docs/superpowers/plans/2026-11-18-almoxarifado-etapa242-aviso-reservado-para-os.md (RN-242.02 a .04).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisClienteDevolucaoReservado --watchAll=false
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
  controle_serie: 0, controle_lote: 0, livre: 5, reservas: [], ...extra,
});
const POSICAO = {
  cliente: { id: 1, razao_social: 'Cliente Alfa LTDA' },
  itens: [
    // 5 no material: 2 para a OS 1234, 1 sem OS -> livre 2
    item(51, 'RESERVADO', { saldo_disponivel: 2, livre: 2, reservas: [{ os: '1234', quantidade: 2 }, { os: null, quantidade: 1 }] }),
    item(52, 'LIVRE'),
    // Fase 5 (achado 2): reserva de projeto, sem OS — 1 para a OS 1234, 2 para o projeto Ponte, 1 sem OS -> livre 1
    item(59, 'PROJETO', { saldo_disponivel: 1, livre: 1, reservas: [
      { os: '1234', projeto: null, quantidade: 1 }, { os: null, projeto: 'Ponte', quantidade: 2 }, { os: null, projeto: null, quantidade: 1 },
    ] }),
    // retido por bloqueio (sem reserva): livre 3
    item(53, 'BLOQUEADO', { saldo_disponivel: 3, livre: 3 }),
    // saldo negativo permitido: livre null — nada avisa, mesmo com reserva
    item(54, 'NEGATIVO', { saldo_disponivel: 0, livre: null, reservas: [{ os: '777', quantidade: 5 }] }),
    // servidor antigo (sem os campos novos)
    item(55, 'ANTIGO', { livre: undefined, reservas: undefined, saldo_disponivel: 0 }),
    // com lote: 3 no lote L1 com livre 2 (o aviso do lote da 241 cobre)
    item(56, 'COMLOTE', { controle_lote: 1, saldo_disponivel: 2, livre: 2, reservas: [{ os: '1234', quantidade: 3 }] }),
    // uma OS só
    item(57, 'UMAOS', { saldo_disponivel: 0, livre: 0, reservas: [{ os: 'OS-9', quantidade: 5 }] }),
    // saldo negativo com caixa separada: livre = físico − caixa (3), a reserva não prende — sem a frase da reserva
    item(58, 'NEGCAIXA', { saldo_disponivel: 0, livre: 3, permite_saldo_negativo: true, reservas: [{ os: '888', quantidade: 5 }] }),
  ],
  aplicacoes: [],
};
const rotas = {
  '/almoxarifado/materiais/56/lotes?com_saldo=1': [{
    id: 60, codigo: 'L1', saldo: 5, livre: 2, livre_do_material: 2, data_validade: null, status: 'ATIVO', vencido: false,
    vencimento_liberado: false, elegivel: true,
  }, {
    // um segundo lote: com dois, a janela não escolhe sozinha
    id: 61, codigo: 'L2', saldo: 0.5, livre: 0.5, livre_do_material: 2, data_validade: null, status: 'ATIVO', vencido: false,
    vencimento_liberado: false, elegivel: true,
  }],
};

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais-cliente/clientes') {
      return Promise.resolve({ data: [{ cliente_id: 1, cliente_nome: 'Cliente Alfa LTDA', materiais: 7 }] });
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
const grupo = (rotulo) => [...container.querySelectorAll('.almox-modal .almox-field')]
  .find((g) => g.querySelector('label')?.textContent.includes(rotulo));
const campo = (rotulo) => grupo(rotulo).querySelector('input');
const rotuloQtd = () => grupo('Quantidade').querySelector('label').textContent.replace(/\*$/, '');
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
const botaoConfirmar = () => [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Confirmar devolução'));
const texto = (sel) => container.querySelector(sel)?.textContent || null;
async function preencherTudo(qtd) {
  preencher(campo('Quantidade'), String(qtd));
  preencher(campo('documento'), 'DEV-242');
  await esperar();
}

describe('Etapa 242 — o aviso de material reservado na devolução ao cliente', () => {
  test('[RN-242.02] o rótulo da quantidade diz o livre só quando ele é menor que o saldo', async () => {
    await abrir('RESERVADO');
    expect(rotuloQtd()).toBe('Quantidade (saldo: 5 UN — livre 2 UN)');
  });

  test('[RN-242.02] livre igual ao saldo, null ou ausente: o rótulo de antes', async () => {
    for (const c of ['LIVRE', 'NEGATIVO', 'ANTIGO']) {
      act(() => root.unmount());
      root = createRoot(container);
      await abrir(c);
      expect(rotuloQtd()).toBe('Quantidade (saldo: 5 UN)');
    }
  });

  test('[RN-242.03] com reservas: diz para qual OS e o livre (vírgula e " e ")', async () => {
    await abrir('RESERVADO');
    expect(texto('#dev-reservado')).toBe('Reservado: 2 UN para a OS 1234 e 1 UN sem OS. Livre para devolver: 2 UN.');
  });

  test('[RN-242.03] reserva de projeto sem OS: "para o projeto", não "sem OS" (Fase 5, achado 2)', async () => {
    await abrir('PROJETO');
    expect(texto('#dev-reservado')).toBe('Reservado: 1 UN para a OS 1234, 2 UN para o projeto Ponte e 1 UN sem OS. Livre para devolver: 1 UN.');
  });

  test('[RN-242.03] uma OS só', async () => {
    await abrir('UMAOS');
    expect(texto('#dev-reservado')).toBe('Reservado: 5 UN para a OS OS-9. Livre para devolver: 0 UN.');
  });

  test('[RN-242.03] sem reservas, com livre null ou servidor antigo: sem a frase (o rótulo está lá)', async () => {
    for (const c of ['LIVRE', 'BLOQUEADO', 'NEGATIVO', 'ANTIGO']) {
      act(() => root.unmount());
      root = createRoot(container);
      await abrir(c);
      expect(container.querySelector('#dev-reservado')).toBeNull();
      expect(rotuloQtd()).toContain('Quantidade (saldo: 5 UN');
    }
  });

  test('[RN-242.04] acima do livre: aviso com a reserva e Confirmar apagado; no livre, sem aviso e envia', async () => {
    await abrir('RESERVADO');
    await preencherTudo(3);
    expect(texto('#dev-livre-nao-cobre')).toBe('Estão livres só 2 UN deste material: devolva até 2 ou libere a reserva em Reservas.');
    expect(botaoConfirmar().disabled).toBe(true);
    preencher(campo('Quantidade'), '2');
    await esperar();
    expect(container.querySelector('#dev-livre-nao-cobre')).toBeNull();
    expect(botaoConfirmar().disabled).toBe(false);
    await clicar(botaoConfirmar());
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 51, quantidade: 2, documento_devolucao: 'DEV-242',
    });
  });

  test('[RN-242.04] retido sem reserva: o aviso sem "libere a reserva"', async () => {
    await abrir('BLOQUEADO');
    await preencherTudo(4);
    expect(texto('#dev-livre-nao-cobre')).toBe('Estão livres só 3 UN deste material: devolva até 3.');
    expect(botaoConfirmar().disabled).toBe(true);
  });

  test('[RN-242.04] livre null (saldo negativo) ou servidor antigo: sem aviso e o Confirmar aceso', async () => {
    for (const c of ['NEGATIVO', 'ANTIGO']) {
      act(() => root.unmount());
      root = createRoot(container);
      await abrir(c);
      await preencherTudo(5);
      expect(container.querySelector('#dev-livre-nao-cobre')).toBeNull();
      expect(botaoConfirmar().disabled).toBe(false);
    }
  });

  test('[RN-242.03/.04] saldo negativo com caixa: sem a frase da reserva; o aviso do livre sem "libere a reserva"', async () => {
    await abrir('NEGCAIXA');
    expect(rotuloQtd()).toBe('Quantidade (saldo: 5 UN — livre 3 UN)');
    expect(container.querySelector('#dev-reservado')).toBeNull();
    await preencherTudo(4);
    expect(texto('#dev-livre-nao-cobre')).toBe('Estão livres só 3 UN deste material: devolva até 3.');
    expect(botaoConfirmar().disabled).toBe(true);
  });

  test('[RN-242.04] com lote e o aviso do lote na tela, o do material não repete', async () => {
    await abrir('COMLOTE');
    await escolherLote(60);
    await preencherTudo(3);
    expect(container.querySelector('#dev-lote-livre-nao-cobre')).not.toBeNull();
    expect(container.querySelector('#dev-livre-nao-cobre')).toBeNull();
    expect(botaoConfirmar().disabled).toBe(true);
    expect(texto('#dev-reservado')).toBe('Reservado: 3 UN para a OS 1234. Livre para devolver: 2 UN.');
  });

  test('[RN-242.04] com lote ainda não escolhido e quantidade acima do livre: o aviso do material aparece', async () => {
    await abrir('COMLOTE');
    await preencherTudo(3);
    expect(texto('#dev-livre-nao-cobre')).toBe('Estão livres só 2 UN deste material: devolva até 2 ou libere a reserva em Reservas.');
    expect(botaoConfirmar().disabled).toBe(true);
  });
});
