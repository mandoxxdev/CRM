/**
 * Etapa 231 (C532; B1517 a B1520) — a entrega não pré-escolhe a origem da separação que ficou num lote impedido: a janela abre em "Escolha de
 * onde sai", a opção do lote impedido vem apagada e o Confirmar Entrega espera a escolha; o botão de um clique vem apagado com a frase. A
 * situação do lote vem na linha de saldo (224) e, para o botão e a busca que falhou, no detalhe (B1517). Mock só na fronteira HTTP.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa231-entrega-origem-lote-impedido.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEntregaOrigemImpedida --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));
jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-11-13T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
// O detalhe com a situação do lote da separação (B1517); `impedido` liga o campo.
const SIT_BOA = { lote_separacao_status: 'ATIVO', lote_separacao_validade: null, lote_separacao_esta_impedido: false,
  lote_separacao_vencido_sem_liberacao: false };
const SIT_BLOQ = { ...SIT_BOA, lote_separacao_status: 'BLOQUEADO', lote_separacao_esta_impedido: true };
// Separou 5 (3 de Z-02/L2), entregou 2: entrega 3, toda da planejada.
const item = (extra = {}) => ({
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 5,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: 4, lote_separacao_id: 12, origem_separacao_codigo: 'Z-02', lote_separacao_codigo: 'L2',
  quantidade_origem_separacao: 3, quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2, quantidade_entregavel: 3,
  ...SIT_BLOQ, ...extra,
});
const PARCIAL = (extra) => ({ ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA', itens: [item(extra)] });
// Um clique: separado 3 de Z-02/L2, nada entregue.
const SEPARANDO = (status, extra) => ({ ...REQ_BASE, status,
  itens: [item({ quantidade_separada: 3, quantidade_entregue: 0, quantidade_atendida: 0, ...extra })] });

const BOM = { lote_status: 'ATIVO', lote_validade: null, lote_vencimento_liberado_em: null, lote_esta_impedido: false,
  lote_vencido_sem_liberacao: false };
const SEM_LOTE = { lote_status: null, lote_validade: null, lote_vencimento_liberado_em: null, lote_esta_impedido: false,
  lote_vencido_sem_liberacao: false };
const linha = (extra) => ({ material_id: 10, separado_outras: 0, lote_livre: null, lote_bloqueado: null, lote_inspecao: null, ...extra });
const A01 = linha({ id: 1, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10, sobra: 10, ...SEM_LOTE });
const XB01 = linha({ id: 2, localizacao_id: 2, localizacao_codigo: 'XB-01', lote_id: 7, lote: 'L1', quantidade: 4, sobra: 4, ...BOM });
const Z02 = (extra = {}) => linha({ id: 3, localizacao_id: 4, localizacao_codigo: 'Z-02', lote_id: 12, lote: 'L2', quantidade: 6, sobra: 6,
  ...BOM, lote_status: 'BLOQUEADO', lote_esta_impedido: true, ...extra });
const Z02_BOM = () => Z02({ lote_status: 'ATIVO', lote_esta_impedido: false });

let container;
let root;
let requisicao;
let saldos;
let saldosFalham;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = [A01, XB01, Z02()];
  saldosFalham = false;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, separacoes, ...lin } = requisicao;
      return Promise.resolve({ data: [lin] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') {
      return saldosFalham ? Promise.reject(new Error('falhou')) : Promise.resolve({ data: saldos });
    }
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { parcial: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}>
        <RequisicoesList />
      </MemoryRouter>
    );
  });
}
async function remontar() {
  act(() => root.unmount());
  root = createRoot(container);
  await renderizar();
}
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => { await act(async () => { botaoPorTexto(texto).click(); }); };
const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => { setter.call(select, valor); select.dispatchEvent(new Event('change', { bubbles: true })); });
};
const digitar = (input, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setter.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const selectEntrega = () => container.querySelector('#entrega-origem-1');
const textos = (select) => [...select.options].map((o) => o.textContent);
const desabilitadas = (select) => [...select.options].filter((o) => o.disabled).map((o) => o.value);
const confirmarJanela = () => botaoPorTexto('Confirmar Entrega');
const umClique = () => botaoPorTexto('Confirmar Entrega e Baixar Estoque');
const fraseItem = () => container.querySelector('#entrega-dica-lote-impedido-1');
const fraseUmClique = () => container.querySelector('#entrega-direta-lote-impedido');
const FRASE_PLANEJADA_L2 = 'Já separado de Z-02 — lote L2: Bloqueado. Essa parte não sai até o lote ser liberado na tela Lotes e Séries — '
  + 'na entrega, escolha outro endereço.';
const OPCAO_ESCOLHER = 'Escolha de onde sai (o lote da separação não sai)';
const FRASE_UM_CLIQUE = (sit) => `Chapa 3mm: separado de Z-02 — lote L2 (${sit}). A entrega direta sairia de lá e seria recusada — use `
  + '"Entregar escolhendo de onde sai…".';

describe('Etapa 231: a entrega não pré-escolhe a origem num lote impedido', () => {
  test('[RN-231.02] a janela abre em "Escolha de onde sai", a opção da planejada impedida vem apagada e a frase aparece', async () => {
    requisicao = PARCIAL();
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('__escolher__');
    expect(textos(selectEntrega())).toEqual([
      OPCAO_ESCOLHER, 'Qualquer endereço (automático)', 'A-01 (10)', 'XB-01 — lote L1 (4)', 'Z-02 — lote L2 (6) — Bloqueado: não sai',
    ]);
    expect(desabilitadas(selectEntrega())).toEqual(['4:12']);
    expect(fraseItem().textContent).toBe(FRASE_PLANEJADA_L2);
  });

  test('[RN-231.02 controle] com L2 ATIVO a janela abre na planejada, sem a opção nova nem frase', async () => {
    requisicao = PARCIAL(SIT_BOA);
    saldos = [A01, XB01, Z02_BOM()];
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('4:12');
    expect(textos(selectEntrega())).not.toContain(OPCAO_ESCOLHER);
    expect(fraseItem()).toBeNull();
    expect(confirmarJanela().disabled).toBe(false);
  });

  test('[RN-231.03] o Confirmar Entrega espera a escolha; XB-01/L1 manda a origem; "Qualquer endereço" manda automático', async () => {
    requisicao = PARCIAL();
    await renderizar();
    await clicar('Completar Entrega');
    expect(confirmarJanela().disabled).toBe(true);
    expect(confirmarJanela().getAttribute('title')).toBe('Escolha de onde sai cada item com o lote da separação impedido');
    escolher(selectEntrega(), '2:7');
    expect(confirmarJanela().disabled).toBe(false);
    expect(fraseItem()).toBeNull();
    expect(textos(selectEntrega())).not.toContain(OPCAO_ESCOLHER);
    await act(async () => { confirmarJanela().click(); });
    const [url, corpo] = api.put.mock.calls.find(([u]) => u.endsWith('/entregar'));
    expect(url).toBe('/almoxarifado/requisicoes/55/entregar');
    expect(corpo.itens_atendidos).toEqual([{ item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 2, lote_id: 7 }]);
  });

  test('[RN-231.03] "Qualquer endereço" escolhido manda origem_automatica; quantidade 0 libera o Confirmar', async () => {
    requisicao = PARCIAL();
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '');
    expect(confirmarJanela().disabled).toBe(false);
    await act(async () => { confirmarJanela().click(); });
    const [, corpo] = api.put.mock.calls.find(([u]) => u.endsWith('/entregar'));
    expect(corpo.itens_atendidos[0]).toMatchObject({ item_id: 1, quantidade_atendida: 3, origem_automatica: true });
    expect(corpo.itens_atendidos[0].localizacao_origem_id).toBeUndefined();
    await remontar();
    await clicar('Completar Entrega');
    expect(confirmarJanela().disabled).toBe(true);
    const qtd = container.querySelector('.almox-count-input');
    digitar(qtd, '0');
    expect(confirmarJanela().disabled).toBe(false);
  });

  test('[RN-231.04] acima da parte também abre em "Escolha de onde sai"; com L2 ATIVO, "" (o de hoje)', async () => {
    requisicao = PARCIAL({ quantidade_origem_separacao: 1 });
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('__escolher__');
    expect(fraseItem().textContent).toBe(FRASE_PLANEJADA_L2);
    expect(confirmarJanela().disabled).toBe(true);
    requisicao = PARCIAL({ quantidade_origem_separacao: 1, ...SIT_BOA });
    saldos = [A01, XB01, Z02_BOM()];
    await remontar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(confirmarJanela().disabled).toBe(false);
  });

  test('[RN-231.05] a busca de saldos falhou: o detalhe decide (impedido -> "Escolha de onde sai"; bom -> "Planejada da separação")', async () => {
    saldosFalham = true;
    requisicao = PARCIAL();
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('__escolher__');
    expect(textos(selectEntrega())).not.toContain('Planejada da separação (Z-02)');
    expect(fraseItem().textContent).toBe(FRASE_PLANEJADA_L2);
    expect(confirmarJanela().disabled).toBe(true);
    requisicao = PARCIAL(SIT_BOA);
    await remontar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('__planejada__');
    expect(textos(selectEntrega())).toContain('Planejada da separação (Z-02)');
    expect(fraseItem()).toBeNull();
  });

  test('[RN-231.06] o botão de um clique vem apagado e diz por quê; "Entregar escolhendo" continua; com L2 bom, como antes', async () => {
    requisicao = SEPARANDO('EM_SEPARACAO');
    await renderizar();
    expect(umClique().disabled).toBe(true);
    expect(fraseUmClique().textContent).toBe(FRASE_UM_CLIQUE('Bloqueado'));
    expect(botaoPorTexto('Entregar escolhendo de onde sai').disabled).toBe(false);
    requisicao = SEPARANDO('EM_SEPARACAO', SIT_BOA);
    await remontar();
    expect(umClique().disabled).toBe(false);
    expect(fraseUmClique()).toBeNull();
  });

  test('[RN-231.06] em PRONTA_PARA_RETIRADA o mesmo', async () => {
    requisicao = SEPARANDO('PRONTA_PARA_RETIRADA');
    await renderizar();
    expect(umClique().disabled).toBe(true);
    expect(fraseUmClique().textContent).toBe(FRASE_UM_CLIQUE('Bloqueado'));
    requisicao = SEPARANDO('PRONTA_PARA_RETIRADA', SIT_BOA);
    await remontar();
    expect(umClique().disabled).toBe(false);
  });

  test('[RN-231.07] a parte da planejada já entregue (parte 0): o botão habilitado e a janela sem "Escolha de onde sai"', async () => {
    requisicao = SEPARANDO('EM_SEPARACAO', { quantidade_origem_separacao: 0 });
    await renderizar();
    expect(umClique().disabled).toBe(false);
    expect(fraseUmClique()).toBeNull();
    requisicao = PARCIAL({ quantidade_origem_separacao: 0 });
    await remontar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).not.toBe('__escolher__');
    expect(textos(selectEntrega())).not.toContain(OPCAO_ESCOLHER);
    expect(fraseItem()).toBeNull(); // Fase 2 (M4): "essa parte não sai" seria falso com a parte já entregue
  });

  test('[RN-231.03, Fase 2 M3] antes das linhas de saldo chegarem, o detalhe segura o Confirmar; com L2 bom, não', async () => {
    let soltar;
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/requisicoes') {
        const { itens, separacoes, ...lin } = requisicao;
        return Promise.resolve({ data: [lin] });
      }
      if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
      if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') return new Promise((r) => { soltar = r; });
      return Promise.resolve({ data: [] });
    });
    requisicao = PARCIAL();
    await renderizar();
    await clicar('Completar Entrega');
    expect(typeof soltar).toBe('function');
    expect(confirmarJanela().disabled).toBe(true);
    requisicao = PARCIAL(SIT_BOA);
    await remontar();
    await clicar('Completar Entrega');
    expect(confirmarJanela().disabled).toBe(false);
  });

  // Fase 5 (revisão de testes, achados 3 a 5): dois itens, item sem quantidade e as linhas de saldo discordando do detalhe.
  const ITEM2_BOM = { id: 2, material_id: 11, material_codigo: 'MAT-2', material_nome: 'Parafuso M8', origem_separacao_id: null,
    lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null, quantidade_origem_separacao: null,
    ...SIT_BOA, lote_separacao_status: null, lote_separacao_esta_impedido: false };
  test('[RN-231.06, Fase 5] dois itens, um impedido e um bom: o um clique apagado só com a frase do impedido; a janela espera', async () => {
    const r = SEPARANDO('EM_SEPARACAO');
    requisicao = { ...r, itens: [r.itens[0], { ...r.itens[0], ...ITEM2_BOM }] };
    await renderizar();
    expect(umClique().disabled).toBe(true);
    expect(fraseUmClique().textContent).toBe(FRASE_UM_CLIQUE('Bloqueado'));
    const p = PARCIAL();
    requisicao = { ...p, itens: [{ ...p.itens[0], ...ITEM2_BOM }, p.itens[0]] };
    await remontar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('__escolher__');
    expect(confirmarJanela().disabled).toBe(true);
  });
  test('[RN-231.06, Fase 5] o item impedido sem quantidade a entregar não apaga o um clique dos outros', async () => {
    const r = SEPARANDO('EM_SEPARACAO');
    requisicao = { ...r, itens: [{ ...r.itens[0], quantidade_entregavel: 0, saldo_entregavel: 0 }, { ...r.itens[0], ...ITEM2_BOM }] };
    await renderizar();
    expect(umClique()).toBeTruthy();
    expect(umClique().disabled).toBe(false);
    expect(fraseUmClique()).toBeNull();
  });
  test('[RN-231.02, Fase 5] detalhe e linhas discordando: qualquer um dos dois impedido segura ("Escolha de onde sai", a frase, o Confirmar)', async () => {
    requisicao = PARCIAL();
    saldos = [A01, XB01, Z02_BOM()];
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('__escolher__');
    expect(fraseItem().textContent).toBe(FRASE_PLANEJADA_L2);
    expect(confirmarJanela().disabled).toBe(true);
    requisicao = PARCIAL(SIT_BOA);
    saldos = [A01, XB01, Z02()];
    await remontar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('__escolher__');
    expect(confirmarJanela().disabled).toBe(true);
  });

  // Fase 5 (revisão do fluxo, reproduzido): o lote bloqueado com a janela aberta — o detalhe é relido ao voltar para a aba, as linhas não.
  const voltarParaAba = async () => { await act(async () => { window.dispatchEvent(new Event('focus')); }); };
  test('[RN-231.03, Fase 5] janela aberta na planejada boa; o lote é bloqueado e o detalhe relido -> o Confirmar espera e a frase aparece', async () => {
    requisicao = PARCIAL(SIT_BOA);
    saldos = [A01, XB01, Z02_BOM()];
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('4:12');
    expect(confirmarJanela().disabled).toBe(false);
    requisicao = PARCIAL();
    await voltarParaAba();
    expect(confirmarJanela().disabled).toBe(true);
    expect(fraseItem().textContent).toBe(FRASE_PLANEJADA_L2);
    escolher(selectEntrega(), '2:7');
    expect(confirmarJanela().disabled).toBe(false);
  });
  test('[RN-231.04, Fase 5] acima da parte (em branco, sem automático); o lote é bloqueado e o detalhe relido -> o Confirmar espera', async () => {
    requisicao = PARCIAL({ quantidade_origem_separacao: 1, ...SIT_BOA });
    saldos = [A01, XB01, Z02_BOM()];
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(confirmarJanela().disabled).toBe(false);
    requisicao = PARCIAL({ quantidade_origem_separacao: 1 });
    await voltarParaAba();
    expect(confirmarJanela().disabled).toBe(true);
    expect(fraseItem().textContent).toBe(FRASE_PLANEJADA_L2);
    escolher(selectEntrega(), '');
    expect(confirmarJanela().disabled).toBe(false);
  });

  test('[RN-231.08] as palavras são as do extrato (reprovado, vencido)', async () => {
    requisicao = SEPARANDO('EM_SEPARACAO', { lote_separacao_status: 'REPROVADO' });
    await renderizar();
    expect(fraseUmClique().textContent).toBe(FRASE_UM_CLIQUE('Reprovado'));
    requisicao = SEPARANDO('EM_SEPARACAO', { lote_separacao_status: 'ATIVO', lote_separacao_validade: '2026-11-10',
      lote_separacao_vencido_sem_liberacao: true });
    await remontar();
    expect(fraseUmClique().textContent).toBe(FRASE_UM_CLIQUE('Vencido em 10/11/2026'));
  });
});
