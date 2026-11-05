/**
 * Etapa 196 (T4; RN-196.11, RN-196.12, Fase 2 item 5) — a tela conta a PARTE da origem, nao a caixa.
 *
 * O item da requisicao traz `quantidade_origem_separacao` (numero ou null): quanto da caixa saiu do par guardado. null com
 * origem = dado antigo, vale a caixa inteira. Por defesa, a tela usa `min(parte, separado - entregue)`.
 *
 * - Entrega: o "Sai de" so parte da planejada quando a quantidade cabe na PARTE; acima dela fica automatico SEM chave (o
 *   servidor divide: a parte estrita da origem, o resto automatico). A dica "O separado pendente sai de..." segue a parte.
 * - Separacao: o comprometido no par planejado e a parte; outro par (ou automatico) sobre item com origem nao e mais troca —
 *   aviso novo (`separacao-aviso-origem-*`), sem "Motivo da troca", e o PUT nunca leva `motivo_substituicao`.
 * - Detalhe: "separado de <end> (<q> <un>)" quando ha quantidade; sem ela, como antes.
 *
 * Mock so na fronteira HTTP (services/api).
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesOrigemEmDuasVezes --watchAll=false
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

const ITEM_BASE = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 10,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
};

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};

// O caso real: 3 separados de B-02 lote L-7 e 3 no automatico — caixa 6, parte 3.
const PLANEJADA = {
  origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'B-02', lote_separacao_codigo: 'L-7',
};

// Entrega: 8 separados, 2 entregues -> caixa 6.
const paraEntregar = (extra) => ({
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{
    ...ITEM_BASE, ...PLANEJADA, quantidade_separada: 8, quantidade_entregue: 2, quantidade_atendida: 2,
    quantidade_entregavel: 6, quantidade_origem_separacao: 3, ...extra,
  }],
});

// Separacao: 5 separados (caixa 5), nada entregue, 5 ainda a separar.
const paraSeparar = (extra) => ({
  ...REQ_BASE, status: 'EM_SEPARACAO',
  itens: [{
    ...ITEM_BASE, ...PLANEJADA, quantidade_separada: 5, quantidade_entregue: 0, quantidade_atendida: 0,
    quantidade_origem_separacao: 3, ...extra,
  }],
});

const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 10 },
];

let container;
let root;
let requisicao;
let saldos;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = SALDOS;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos') return Promise.resolve({ data: saldos });
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

const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));

const clicar = async (texto) => {
  await act(async () => { botaoPorTexto(texto).click(); });
};

const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const digitar = (input, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(input, valor);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const selectEntrega = () => container.querySelector('#entrega-origem-1');
const selectSeparacao = () => container.querySelector('#separacao-origem-1');
const avisoOrigem = () => container.querySelector('#separacao-aviso-origem-1');
const dicaPendente = () => container.querySelector('#entrega-dica-pendente-1');
const linhaSeparadoDe = () => container.querySelector('[data-testid="separado-de-1"]');

const enviadoEm = (rota, chave) => {
  const chamada = api.put.mock.calls.find((c) => c[0] === `/almoxarifado/requisicoes/55/${rota}`);
  expect(chamada).toBeTruthy();
  return chamada[1][chave][0];
};

const AVISO_LOTE = 'Já separado de B-02 — lote L-7: 3 PC, que continuam saindo de lá. Esta parte sai no automático na entrega.';

describe('Etapa 196 (RN-196.11): a entrega compara com a PARTE da origem', () => {
  test('entrega com parte 3 e caixa 6 abre no automático, sem chave', async () => {
    requisicao = paraEntregar();
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(dicaPendente()).toBeTruthy();
    await clicar('✅ Confirmar Entrega');
    const item = enviadoEm('entregar', 'itens_atendidos');
    expect(item).toEqual({ item_id: 1, quantidade_atendida: 6 });
  });

  test('entregável 3 = parte 3: a planejada vem pré-selecionada', async () => {
    requisicao = paraEntregar({ quantidade_entregavel: 3 });
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('2:7');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos'))
      .toEqual({ item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 2, lote_id: 7 });
  });

  test('dado antigo (parte null): vale a caixa inteira — 6 = caixa 6 pré-seleciona a planejada', async () => {
    requisicao = paraEntregar({ quantidade_origem_separacao: null });
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('2:7');
    expect(dicaPendente()).toBeNull();
  });

  test('dica "O separado pendente sai de…" aparece acima da parte (4 > 3), mesmo com a caixa 6 cobrindo', async () => {
    requisicao = paraEntregar({ quantidade_entregavel: 4 });
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(dicaPendente()).toBeTruthy();
  });
});

describe('Etapa 196 (RN-196.11): a separação conta a parte no par planejado', () => {
  // B-02/L-7 com 8: pela parte (3) cabem 5 ali e a planejada cobre os 5 sugeridos; pela caixa (5) caberiam só 3.
  test('parte 3, saldo 8 no par: a planejada cobre os 5 e vem pré-selecionada', async () => {
    saldos = SALDOS.map((s) => (s.lote_id === 7 ? { ...s, quantidade: 8 } : s));
    requisicao = paraSeparar();
    await renderizar();
    await clicar('Ajustar Separação');
    expect(selectSeparacao().value).toBe('2:7');
    expect(avisoOrigem()).toBeNull();
  });
});

describe('Etapa 196 (RN-196.12): outro par na separação não é mais troca', () => {
  test('outro endereço: aviso novo com a parte, sem "Motivo da troca"', async () => {
    requisicao = paraSeparar();
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '1:');
    expect(avisoOrigem()).toBeTruthy();
    expect(avisoOrigem().textContent).toBe(AVISO_LOTE);
    expect(container.querySelector('#separacao-aviso-troca-1')).toBeNull();
    expect(container.querySelector('#separacao-motivo-troca-1')).toBeNull();
    expect(container.textContent).not.toContain('Motivo da troca');
    escolher(selectSeparacao(), '2:7');
    expect(avisoOrigem()).toBeNull();
  });

  test('automático: o mesmo aviso; sem lote, sem o trecho do lote; o PUT não leva motivo_substituicao', async () => {
    requisicao = paraSeparar({ lote_separacao_id: null, lote_separacao_codigo: null });
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '');
    expect(avisoOrigem().textContent)
      .toBe('Já separado de B-02: 3 PC, que continuam saindo de lá. Esta parte sai no automático na entrega.');
    await clicar('Confirmar Separação');
    const item = enviadoEm('separacao', 'itens_separados');
    expect(item).not.toHaveProperty('motivo_substituicao');
    expect(item).not.toHaveProperty('localizacao_origem_id');
  });

  test('dado antigo (parte null): o aviso mostra a caixa inteira', async () => {
    requisicao = paraSeparar({ quantidade_origem_separacao: null });
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '1:');
    expect(avisoOrigem().textContent).toContain(': 5 PC, que continuam');
  });

  test('quantidade a separar 0: sem aviso', async () => {
    requisicao = paraSeparar();
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '1:');
    expect(avisoOrigem()).toBeTruthy();
    digitar(container.querySelector('.almox-modal input.almox-count-input'), '0');
    expect(avisoOrigem()).toBeNull();
  });
});

describe('Etapa 196 (RN-196.12): "separado de" no detalhe ganha a quantidade', () => {
  test('com parte: "separado de B-02 — lote L-7 (3 PC)"', async () => {
    requisicao = paraEntregar();
    await renderizar();
    expect(linhaSeparadoDe().textContent).toBe('separado de B-02 — lote L-7 (3 PC)');
  });

  test('sem parte (dado antigo): como antes, sem quantidade', async () => {
    requisicao = paraEntregar({ quantidade_origem_separacao: null });
    await renderizar();
    expect(linhaSeparadoDe().textContent).toBe('separado de B-02 — lote L-7');
  });

  test('por defesa, parte acima da caixa mostra a caixa: min(9, 6) = 6', async () => {
    requisicao = paraEntregar({ quantidade_origem_separacao: 9 });
    await renderizar();
    expect(linhaSeparadoDe().textContent).toBe('separado de B-02 — lote L-7 (6 PC)');
  });

  test('parte fracionada no formato pt-BR', async () => {
    requisicao = paraEntregar({ quantidade_origem_separacao: 2.5 });
    await renderizar();
    expect(linhaSeparadoDe().textContent).toBe('separado de B-02 — lote L-7 (2,5 PC)');
  });
});

// Etapa 196 (Fase 5): K4 — a dica diz QUANTO sai da origem (a parte), nao "o separado pendente"; K5 — o "Motivo da troca" so
// aparece (e so vai no PUT) quando a regua do servidor da troca > 0: max(0, min(qtd, caixa) - (caixa - parte)).
describe('Etapa 196 (Fase 5): dica da parte e motivo da troca pela régua do servidor', () => {
  const campoMotivo = () => container.querySelector('#entrega-motivo-troca-1');
  const qtdEntrega = () => container.querySelector('.almox-count-input');

  test('K4: caixa 6, parte 3, um clique 6 — a dica diz "3 PC sai de B-02 — lote L-7 (o que foi separado de lá)"', async () => {
    requisicao = paraEntregar();
    await renderizar();
    await clicar('Completar Entrega');
    expect(dicaPendente().textContent).toBe('3 PC sai de B-02 — lote L-7 (o que foi separado de lá); o restante, automático. '
      + 'Se lá não houver mais essa quantidade, a entrega é recusada — escolha de onde sai.');
  });

  test('K5: caixa 6, parte 3 — outro endereço para 3 cabe na parte sem origem: sem "Motivo da troca"; para 4, aparece', async () => {
    requisicao = paraEntregar({ quantidade_entregavel: 3 });
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '1:');
    expect(campoMotivo()).toBeNull();
    escolher(selectEntrega(), '');
    expect(campoMotivo()).toBeNull();
    digitar(qtdEntrega(), '4');
    expect(campoMotivo()).toBeTruthy();
    escolher(selectEntrega(), '1:');
    expect(campoMotivo()).toBeTruthy();
  });

  test('K5: motivo digitado com 4 e a quantidade volta a 3 — o PUT não leva motivo_substituicao (o servidor daria troca 0)', async () => {
    requisicao = paraEntregar({ quantidade_entregavel: 4 });
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '1:');
    digitar(campoMotivo(), 'mais perto');
    digitar(qtdEntrega(), '3');
    expect(campoMotivo()).toBeNull();
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos'))
      .toEqual({ item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 1 });
  });

  test('K5: com 4 (troca 1) o motivo vai no PUT', async () => {
    requisicao = paraEntregar({ quantidade_entregavel: 4 });
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '1:');
    digitar(campoMotivo(), 'mais perto');
    await clicar('✅ Confirmar Entrega');
    expect(enviadoEm('entregar', 'itens_atendidos'))
      .toEqual({ item_id: 1, quantidade_atendida: 4, localizacao_origem_id: 1, motivo_substituicao: 'mais perto' });
  });
});
