/**
 * Etapa 65 (RN-03/RN-04 + CRÍTICO 2 da Fase 2) — a troca de origem na separação.
 *
 * - Detalhe: a linha de "Substituições" com momento SEPARACAO não diz "saiu de" (nada saiu do estoque):
 *   "COD: Q já separados de A[ — lote L] · nova separação DESTINO — a origem anterior deixou de valer[ · motivo]".
 *   Linha ENTREGA (ou sem momento) = o texto da Etapa 63, intacto.
 * - Modal de separar: item com planejada e separado pendente abre com a planejada pré-selecionada no
 *   "Sai de" (se o par exato está entre as opções); senão, automático. "Sai de" diferente da planejada
 *   pela régua da separação (mesmo endereço E mesmo lote; sem lote só casa com sem lote) → aviso + "Motivo da
 *   troca (opcional)", que vai como motivo_substituicao só quando há troca.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesTrocaSeparacao --watchAll=false
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
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
};

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};

// 5 separados de B-02 lote L-7, nada entregue; 5 ainda a separar (ajustar a separação).
const PLANEJADA = {
  origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'B-02', lote_separacao_codigo: 'L-7',
};
const SEM_LOTE = { lote_separacao_id: null, lote_separacao_codigo: null };
const emSeparacao = (extra, req = {}) => ({
  ...REQ_BASE, status: 'EM_SEPARACAO', ...req,
  itens: [{ ...ITEM_BASE, quantidade_separada: 5, quantidade_entregue: 0, quantidade_atendida: 0, ...extra }],
});

// B-02 tem dois lotes (L-7 planejado, L-8 não); A-01 sem lote. Fase 5: L-7 tem 10 — os 5 já
// separados continuam no saldo (separar não move estoque) e 5 livres; com 4 a fixture era impossível
// e o servidor recusaria o PUT que o teste aprovava.
const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 10 },
  { id: 5, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 8, lote: 'L-8', quantidade: 6 },
];

const AVISO_LOTE = 'A origem da separação anterior (B-02 — lote L-7) deixa de valer: o que já está separado passa a sair automático na entrega.';

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
  api.put.mockResolvedValue({ data: {} });
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

const selectSeparacao = () => container.querySelector('#separacao-origem-1');
const quantidadeSeparacao = () => container.querySelector('.almox-modal input.almox-count-input');
const aviso = () => container.querySelector('#separacao-aviso-troca-1');
const campoMotivo = () => container.querySelector('#separacao-motivo-troca-1');

const itemEnviado = () => {
  const chamada = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
  expect(chamada).toBeTruthy();
  return chamada[1].itens_separados[0];
};

const abrirSeparacao = async (extra) => {
  requisicao = emSeparacao(extra);
  await renderizar();
  await clicar('Ajustar Separação');
};

describe('Etapa 65 (RN-03): "Substituições" diz quando a troca foi na separação', () => {
  const sub = (extra) => ({
    item_id: 1, material_codigo: 'MAT-1', quantidade: 5, planejada_codigo: 'B-02', planejada_lote: 'L-7',
    saiu_codigo: null, saiu_lote: null, automatica: 0, motivo: null, usuario_nome: 'Ana',
    em: '2026-10-01T09:00:00', momento: 'SEPARACAO', ...extra,
  });
  const SUBS = [
    sub({ id: 1, saiu_codigo: 'A-01', motivo: 'B-02 interditado' }),
    sub({ id: 2, saiu_codigo: 'B-02', saiu_lote: 'L-8', planejada_lote: null }),
    sub({ id: 3, saiu_lote: 'L-8' }),
    sub({ id: 4, automatica: 1, quantidade: 3 }),
    sub({ id: 5, automatica: 0 }),
    sub({ id: 6, momento: 'ENTREGA', quantidade: 3, saiu_codigo: 'A-01', motivo: 'lote vencido' }),
    sub({ id: 7, momento: undefined, quantidade: 2, planejada_lote: null, saiu_lote: 'L-8', automatica: 1 }),
  ];
  const texto = (id) => container.querySelector(`[data-testid="substituicao-texto-${id}"]`).textContent;

  test('SEPARACAO nas quatro saídas; ENTREGA e sem momento com o texto de antes', async () => {
    requisicao = emSeparacao(PLANEJADA, { substituicoes: SUBS });
    await renderizar();
    expect(texto(1)).toBe('MAT-1: 5 já separados de B-02 — lote L-7 · nova separação de A-01 — a origem anterior deixou de valer · B-02 interditado');
    expect(texto(2)).toBe('MAT-1: 5 já separados de B-02 · nova separação de B-02 — lote L-8 — a origem anterior deixou de valer');
    expect(texto(3)).toBe('MAT-1: 5 já separados de B-02 — lote L-7 · nova separação do lote L-8 — a origem anterior deixou de valer');
    expect(texto(4)).toBe('MAT-1: 3 já separados de B-02 — lote L-7 · nova separação sem origem (automática) — a origem anterior deixou de valer');
    expect(texto(5)).toBe('MAT-1: 5 já separados de B-02 — lote L-7 · nova separação de mais de uma origem — a origem anterior deixou de valer');
    expect(texto(6)).toBe('MAT-1: 3 — separado de B-02 — lote L-7 · saiu de A-01 · lote vencido');
    expect(texto(7)).toBe('MAT-1: 2 — separado de B-02 · saiu de automático — lote L-8');
    for (const id of [1, 2, 3, 4, 5]) expect(texto(id)).not.toContain('saiu de');
  });
});

describe('Etapa 65 (CRÍTICO 2): o "Sai de" da separação parte da planejada', () => {
  test('planejada com lote nas opções: vem pré-selecionada e vai no PUT', async () => {
    await abrirSeparacao(PLANEJADA);
    expect(selectSeparacao().value).toBe('2:7');
    expect(aviso()).toBeNull();
    await clicar('Confirmar Separação');
    const item = itemEnviado();
    expect(item).toMatchObject({ item_id: 1, localizacao_origem_id: 2, lote_id: 7 });
    expect(item).not.toHaveProperty('motivo_substituicao');
  });

  test('planejada sem lote: a opção do endereço sem lote, se existir', async () => {
    saldos = [...SALDOS, { id: 6, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: null, lote: null, quantidade: 10 }];
    await abrirSeparacao({ ...PLANEJADA, ...SEM_LOTE });
    expect(selectSeparacao().value).toBe('2:');
  });

  // Fase 5 (IMPORTANTE): a planejada só tem o que já está na caixa (5 separados, saldo 5 em L-7) — o
  // servidor recusaria "O saldo em B-02 (0) não cobre a quantidade (5)". Não pré-seleciona: automático,
  // com o aviso de troca; e com saldo parcial (7: só 2 livres para 5 sugeridos), também não.
  test('planejada que não cobre a quantidade sugerida: automático, com o aviso', async () => {
    saldos = SALDOS.map((s) => (s.lote_id === 7 ? { ...s, quantidade: 5 } : s));
    await abrirSeparacao(PLANEJADA);
    expect(selectSeparacao().value).toBe('');
    expect(aviso()).toBeTruthy();
    await clicar('Confirmar Separação');
    expect(itemEnviado()).not.toHaveProperty('localizacao_origem_id');
  });

  test('planejada com saldo livre parcial (2 de 5): automático', async () => {
    saldos = SALDOS.map((s) => (s.lote_id === 7 ? { ...s, quantidade: 7 } : s));
    await abrirSeparacao(PLANEJADA);
    expect(selectSeparacao().value).toBe('');
  });

  // Contrato revisto na Fase 5: planejada sem lote só casa com a opção sem lote — pegar um lote do
  // endereço seria uma troca (o servidor apaga a planejada e registra).
  test('planejada sem lote e o endereço só com lotes: automático (um lote ali seria troca)', async () => {
    await abrirSeparacao({ ...PLANEJADA, ...SEM_LOTE });
    expect(selectSeparacao().value).toBe('');
    expect(aviso()).toBeTruthy();
  });

  test('planejada fora das opções (sem saldo lá): automático', async () => {
    await abrirSeparacao({ ...PLANEJADA, origem_separacao_id: 9, origem_separacao_codigo: 'Z-09', ...SEM_LOTE });
    expect(selectSeparacao().value).toBe('');
  });

  test('planejada com lote e só outro lote no endereço: automático', async () => {
    saldos = SALDOS.filter((s) => s.lote_id !== 7);
    await abrirSeparacao(PLANEJADA);
    expect(selectSeparacao().value).toBe('');
  });

  test('sem planejada: automático, sem aviso', async () => {
    await abrirSeparacao({});
    expect(selectSeparacao().value).toBe('');
    expect(aviso()).toBeNull();
    expect(campoMotivo()).toBeNull();
  });

  test('planejada já toda entregue (sem pendente): automático, sem aviso', async () => {
    await abrirSeparacao({ ...PLANEJADA, quantidade_entregue: 5, quantidade_atendida: 5 });
    expect(selectSeparacao().value).toBe('');
    expect(aviso()).toBeNull();
  });
});

describe('Etapa 65 (RN-04): aviso e motivo da troca na separação', () => {
  test('trocar o "Sai de" mostra o aviso e o motivo; voltar ao mesmo par some', async () => {
    await abrirSeparacao(PLANEJADA);
    escolher(selectSeparacao(), '1:');
    expect(aviso()).toBeTruthy();
    expect(aviso().textContent).toBe(AVISO_LOTE);
    expect(campoMotivo()).toBeTruthy();
    expect(container.querySelector('label[for="separacao-motivo-troca-1"]').textContent).toBe('Motivo da troca (opcional)');
    expect(campoMotivo().maxLength).toBe(500);

    escolher(selectSeparacao(), '2:7');
    expect(aviso()).toBeNull();
    expect(campoMotivo()).toBeNull();
  });

  test('mesmo endereço, outro lote (planejada com lote) é troca', async () => {
    await abrirSeparacao(PLANEJADA);
    escolher(selectSeparacao(), '2:8');
    expect(aviso()).toBeTruthy();
  });

  test('"Qualquer endereço (automático)" é troca', async () => {
    await abrirSeparacao(PLANEJADA);
    escolher(selectSeparacao(), '');
    expect(aviso()).toBeTruthy();
  });

  test('planejada sem lote: lote do mesmo endereço É troca (aviso sem lote); a opção sem lote não', async () => {
    saldos = [...SALDOS, { id: 6, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: null, lote: null, quantidade: 10 }];
    await abrirSeparacao({ ...PLANEJADA, ...SEM_LOTE });
    expect(selectSeparacao().value).toBe('2:');
    expect(aviso()).toBeNull();
    escolher(selectSeparacao(), '2:8');
    expect(aviso()).toBeTruthy();
    expect(aviso().textContent).toBe('A origem da separação anterior (B-02) deixa de valer: o que já está separado passa a sair automático na entrega.');
    escolher(selectSeparacao(), '2:');
    expect(aviso()).toBeNull();
  });

  test('quantidade a separar 0: sem aviso', async () => {
    await abrirSeparacao(PLANEJADA);
    escolher(selectSeparacao(), '1:');
    expect(aviso()).toBeTruthy();
    digitar(quantidadeSeparacao(), '0');
    expect(aviso()).toBeNull();
  });

  test('troca com motivo: vai com trim no PUT', async () => {
    await abrirSeparacao(PLANEJADA);
    escolher(selectSeparacao(), '1:');
    digitar(campoMotivo(), '  B-02 interditado  ');
    await clicar('Confirmar Separação');
    expect(itemEnviado()).toEqual({
      item_id: 1, quantidade_separada: 5, localizacao_origem_id: 1, motivo_substituicao: 'B-02 interditado',
    });
  });

  test('troca com motivo só de espaços: não vai a chave', async () => {
    await abrirSeparacao(PLANEJADA);
    escolher(selectSeparacao(), '1:');
    digitar(campoMotivo(), '   ');
    await clicar('Confirmar Separação');
    expect(itemEnviado()).not.toHaveProperty('motivo_substituicao');
  });

  test('motivo digitado e depois volta à planejada: não vai a chave', async () => {
    await abrirSeparacao(PLANEJADA);
    escolher(selectSeparacao(), '1:');
    digitar(campoMotivo(), 'mudei de ideia');
    escolher(selectSeparacao(), '2:7');
    await clicar('Confirmar Separação');
    const item = itemEnviado();
    expect(item).toMatchObject({ localizacao_origem_id: 2, lote_id: 7 });
    expect(item).not.toHaveProperty('motivo_substituicao');
  });

  test('reabrir o modal limpa o motivo', async () => {
    await abrirSeparacao(PLANEJADA);
    escolher(selectSeparacao(), '1:');
    digitar(campoMotivo(), 'esquecido');
    await act(async () => { container.querySelector('.almox-modal-footer .btn-almox-secondary').click(); });
    expect(selectSeparacao()).toBeNull();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '1:');
    expect(campoMotivo().value).toBe('');
  });
});
