/**
 * Etapa 58 (RN-05) — "Sai de" no modal de entrega da requisição.
 *
 * O modal (aberto por "Completar Entrega" em PARCIALMENTE_ATENDIDA) oferece, por item, os endereços
 * onde o material tem saldo (GET /almoxarifado/estoque/:id/saldos, filtrado: com endereço e
 * quantidade > 0) e o campo opcional "Confirmar endereço lido" (só com origem escolhida). O PUT
 * /entregar leva localizacao_origem_id / lote_id / codigo_lido_origem SÓ quando escolhidos.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEntregaOrigem --watchAll=false
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

const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 5,
  quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2, quantidade_entregavel: 3,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
};

const REQUISICAO = {
  id: 55, numero: 'REQ-055', status: 'PARCIALMENTE_ATENDIDA', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
  itens: [ITEM],
};

// Quatro linhas de saldo: as duas do meio não são lugar de onde ir buscar (sem endereço; zerada).
const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 2, material_id: 10, localizacao_id: null, localizacao_codigo: null, lote_id: null, lote: null, quantidade: 5 },
  { id: 3, material_id: 10, localizacao_id: 3, localizacao_codigo: 'C-03', lote_id: null, lote: null, quantidade: 0 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 4 },
];

const URL_ETIQUETA = `https://crm.gmp.ind.br/almoxarifado/mapa?loc=2&codigo=${encodeURIComponent('A&B#1+2')}`;

let container;
let root;
let saldosImpl;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldosImpl = () => Promise.resolve({ data: SALDOS });
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = REQUISICAO;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: REQUISICAO });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos') return saldosImpl();
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

const abrirModal = async () => {
  await act(async () => { botaoPorTexto('Completar Entrega').click(); });
};

const fecharModal = async () => {
  const modal = [...container.querySelectorAll('.almox-modal')]
    .find((m) => m.textContent.includes('Confirmar Entrega — REQ-055'));
  await act(async () => { modal.querySelector('.almox-modal-close').click(); });
};

const selectOrigem = () => container.querySelector('#entrega-origem-1');
const campoLeitura = () => container.querySelector('#entrega-codigo-lido-1');
const textosOpcoes = () => [...selectOrigem().options].map((o) => o.textContent);

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

const confirmar = async () => {
  await act(async () => { botaoPorTexto('✅ Confirmar Entrega').click(); });
};

const itemEnviado = () => {
  expect(api.put).toHaveBeenCalledWith('/almoxarifado/requisicoes/55/entregar', expect.any(Object));
  return api.put.mock.calls[0][1].itens_atendidos[0];
};

describe('Etapa 58: "Sai de" no modal de entrega', () => {
  test('opções: só endereço com saldo positivo; rótulo com e sem lote', async () => {
    await renderizar();
    await abrirModal();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/estoque/10/saldos');
    expect(textosOpcoes()).toEqual([
      'Qualquer endereço (automático)',
      'A-01 (10)',
      'B-02 — lote L-7 (4)',
    ]);
  });

  test('escolher endereço com lote manda origem e lote numéricos', async () => {
    await renderizar();
    await abrirModal();
    escolher(selectOrigem(), '2:7');
    await confirmar();
    expect(itemEnviado()).toEqual({ item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 2, lote_id: 7 });
  });

  test('escolher endereço sem lote manda a origem e não manda lote_id', async () => {
    await renderizar();
    await abrirModal();
    escolher(selectOrigem(), '1:');
    await confirmar();
    expect(itemEnviado()).toEqual({ item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 1 });
  });

  test('"Qualquer endereço (automático)" não manda nenhuma das chaves', async () => {
    await renderizar();
    await abrirModal();
    await confirmar();
    const item = itemEnviado();
    expect(item).toEqual({ item_id: 1, quantidade_atendida: 3 });
    expect(item).not.toHaveProperty('localizacao_origem_id');
    expect(item).not.toHaveProperty('lote_id');
    expect(item).not.toHaveProperty('codigo_lido_origem');
  });

  test('leitura da URL da etiqueta vira o código', async () => {
    await renderizar();
    await abrirModal();
    escolher(selectOrigem(), '2:7');
    digitar(campoLeitura(), URL_ETIQUETA);
    await confirmar();
    expect(itemEnviado()).toEqual({
      item_id: 1, quantidade_atendida: 3, localizacao_origem_id: 2, lote_id: 7, codigo_lido_origem: 'A&B#1+2',
    });
  });

  test('leitura desabilitada sem origem; voltar para automático limpa e não manda a leitura', async () => {
    await renderizar();
    await abrirModal();
    expect(campoLeitura().disabled).toBe(true);
    escolher(selectOrigem(), '1:');
    expect(campoLeitura().disabled).toBe(false);
    digitar(campoLeitura(), 'A-01');
    escolher(selectOrigem(), '');
    expect(campoLeitura().disabled).toBe(true);
    expect(campoLeitura().value).toBe('');
    await confirmar();
    expect(itemEnviado()).toEqual({ item_id: 1, quantidade_atendida: 3 });
  });

  test('busca de saldos falhando: só a opção automática, e a entrega segue', async () => {
    saldosImpl = () => Promise.reject(new Error('rede'));
    await renderizar();
    await abrirModal();
    expect(textosOpcoes()).toEqual(['Qualquer endereço (automático)']);
    await confirmar();
    expect(itemEnviado()).toEqual({ item_id: 1, quantidade_atendida: 3 });
  });

  test('resposta atrasada de uma abertura anterior não sobrescreve as opções atuais', async () => {
    let resolverPrimeira;
    const primeira = new Promise((r) => { resolverPrimeira = r; });
    const chamadas = [
      () => primeira,
      () => Promise.resolve({ data: [SALDOS[3]] }),
    ];
    saldosImpl = () => chamadas.shift()();
    await renderizar();
    await abrirModal();
    await fecharModal();
    await abrirModal();
    expect(textosOpcoes()).toEqual(['Qualquer endereço (automático)', 'B-02 — lote L-7 (4)']);
    await act(async () => { resolverPrimeira({ data: [SALDOS[0]] }); });
    expect(textosOpcoes()).toEqual(['Qualquer endereço (automático)', 'B-02 — lote L-7 (4)']);
  });
});

describe('Etapa 58: a entrega do botão principal também pode escolher de onde sai', () => {
  const EM_SEPARACAO = { ...REQUISICAO, status: 'EM_SEPARACAO', itens: [{ ...ITEM, quantidade_entregue: 0, quantidade_atendida: 0, quantidade_entregavel: 5 }] };
  beforeEach(() => {
    const anterior = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url === '/almoxarifado/requisicoes/55'
      ? Promise.resolve({ data: EM_SEPARACAO }) : anterior(url)));
  });

  test('"Entregar escolhendo de onde sai…" abre o modal com "Sai de"; o principal continua direto e sem origem', async () => {
    await renderizar();
    const secundario = container.querySelector('[data-testid="entregar-escolhendo-origem"]');
    expect(secundario).toBeTruthy();
    await act(async () => { secundario.click(); });
    expect(selectOrigem()).toBeTruthy();
    escolher(selectOrigem(), [...selectOrigem().options].find((o) => o.textContent === 'A-01 (10)').value);
    await confirmar();
    const enviado = api.put.mock.calls[0][1].itens_atendidos[0];
    expect(enviado.localizacao_origem_id).toBe(1);
  });

  test('o botão principal segue sendo um clique, sem modal e sem origem', async () => {
    await renderizar();
    await act(async () => { botaoPorTexto('Confirmar Entrega e Baixar Estoque').click(); });
    expect(selectOrigem()).toBeNull();
    const enviado = api.put.mock.calls[0][1].itens_atendidos[0];
    expect(enviado).not.toHaveProperty('localizacao_origem_id');
  });
});
