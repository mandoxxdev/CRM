/**
 * Etapa 60 (RN-03/RN-04) — a divergência na separação, com motivo (opcional).
 *
 * - Modal de separação: quando a quantidade de um item fica abaixo do máximo separável que a tela
 *   conhece (maxQtdSeparacao; com "Sai de" escolhido, o mínimo entre isso e a quantidade da opção),
 *   aparece "Motivo da divergência (opcional)". Não obriga. O PUT /separacao leva
 *   `motivo_divergencia` (trim) só quando preenchido e só para item abaixo do máximo.
 * - Detalhe: o bloco "Separação (N)" lista, por rodada, as entradas divergentes:
 *   "{material}: separou {q} de {max} — {motivo}" (ou "— sem motivo informado").
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSeparacaoDivergencia --watchAll=false
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
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 5,
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

// Aprovada, nada separado: máximo separável do item = min(5 pendentes, 20 de saldo) = 5.
const APROVADA = {
  ...REQ_BASE, status: 'APROVADO',
  itens: [{ ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 }],
};

const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 4 },
];

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, separacoes, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos') return Promise.resolve({ data: SALDOS });
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

const digitar = (el, valor) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setter.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
};

const inputQtd = () => container.querySelector('.almox-modal input.almox-count-input');
const campoMotivo = () => container.querySelector('#separacao-motivo-1');
const selectSeparacao = () => container.querySelector('#separacao-origem-1');

const itemEnviado = () => {
  const chamada = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
  expect(chamada).toBeTruthy();
  return chamada[1].itens_separados[0];
};

describe('Etapa 60: motivo da divergência no modal de separação', () => {
  beforeEach(() => { requisicao = APROVADA; });

  test('no máximo não há campo; abaixo aparece com a dica; de volta ao máximo some', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    expect(inputQtd().value).toBe('5');
    expect(campoMotivo()).toBeNull();

    digitar(inputQtd(), '3');
    expect(campoMotivo()).toBeTruthy();
    expect(container.textContent).toContain('Motivo da divergência (opcional)');
    expect(container.textContent).toContain('Separando menos que o possível — conte o porquê para quem confere.');
    expect(campoMotivo().getAttribute('maxlength')).toBe('500');

    digitar(inputQtd(), '5');
    expect(campoMotivo()).toBeNull();
    expect(container.textContent).not.toContain('Motivo da divergência');
  });

  test('abaixo do máximo com motivo: manda motivo_divergencia com trim', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    digitar(inputQtd(), '3');
    digitar(campoMotivo(), '   caixa avariada na prateleira  ');
    await clicar('Confirmar Separação');
    expect(itemEnviado()).toEqual({ item_id: 1, quantidade_separada: 3, motivo_divergencia: 'caixa avariada na prateleira' });
  });

  test('abaixo do máximo sem motivo (ou só espaços): não obriga e não manda a chave', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    digitar(inputQtd(), '3');
    digitar(campoMotivo(), '    ');
    await clicar('Confirmar Separação');
    const item = itemEnviado();
    expect(item).toEqual({ item_id: 1, quantidade_separada: 3 });
    expect(item).not.toHaveProperty('motivo_divergencia');
  });

  test('motivo digitado e depois voltou ao máximo: não manda o motivo', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    digitar(inputQtd(), '2');
    digitar(campoMotivo(), 'faltou tempo');
    digitar(inputQtd(), '5');
    await clicar('Confirmar Separação');
    const item = itemEnviado();
    expect(item).toEqual({ item_id: 1, quantidade_separada: 5 });
    expect(item).not.toHaveProperty('motivo_divergencia');
  });

  test('"Sai de" com opção menor (B-02 tem 4): separar 4 não é divergência', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSeparacao(), '2:7');
    digitar(inputQtd(), '4');
    expect(campoMotivo()).toBeNull();
    await clicar('Confirmar Separação');
    const item = itemEnviado();
    expect(item).toEqual({ item_id: 1, quantidade_separada: 4, localizacao_origem_id: 2, lote_id: 7 });
    expect(item).not.toHaveProperty('motivo_divergencia');
  });

  test('"Sai de" com opção menor: abaixo dela (3 de 4) pede o motivo e manda', async () => {
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSeparacao(), '2:7');
    digitar(inputQtd(), '3');
    expect(campoMotivo()).toBeTruthy();
    digitar(campoMotivo(), 'uma peça amassada');
    await clicar('Confirmar Separação');
    expect(itemEnviado()).toEqual({
      item_id: 1, quantidade_separada: 3, localizacao_origem_id: 2, lote_id: 7, motivo_divergencia: 'uma peça amassada',
    });
  });
});

describe('Etapa 60: divergências no bloco "Separação (N)" do detalhe', () => {
  const comRodadas = (itensRodada) => ({
    ...REQ_BASE, status: 'SEPARADO',
    itens: [
      { ...ITEM_BASE, quantidade_separada: 3, quantidade_entregue: 0, quantidade_atendida: 0 },
      { ...ITEM_BASE, id: 2, material_id: 11, material_nome: 'Parafuso M8', quantidade_solicitada: 10,
        quantidade_separada: 10, quantidade_entregue: 0, quantidade_atendida: 0 },
    ],
    separacoes: [{
      id: 7, usuario_id: 99, usuario_nome: 'Almoxarife Teste', itens_tocados: itensRodada.length,
      created_at: '2026-09-30T11:00:00', itens: itensRodada,
    }],
  });

  test('divergente com motivo mostra material, quantidades e o motivo', async () => {
    requisicao = comRodadas([
      { item_id: 1, material_id: 10, quantidade: 3, maximo: 5, divergente: true, motivo_divergencia: 'caixa avariada' },
    ]);
    await renderizar();
    expect(container.textContent).toContain('Separação (1)');
    expect(container.querySelector('[data-testid="divergencia-7-1"]').textContent)
      .toBe('Chapa 3mm: separou 3 de 5 — caixa avariada');
  });

  test('divergente sem motivo diz "sem motivo informado"; entrada não divergente não aparece', async () => {
    requisicao = comRodadas([
      { item_id: 1, material_id: 10, quantidade: 3, maximo: 5, divergente: true, motivo_divergencia: null },
      { item_id: 2, material_id: 11, quantidade: 10, maximo: 10, divergente: false, motivo_divergencia: null },
    ]);
    await renderizar();
    expect(container.querySelector('[data-testid="divergencia-7-1"]').textContent)
      .toBe('Chapa 3mm: separou 3 de 5 — sem motivo informado');
    expect(container.querySelector('[data-testid="divergencia-7-2"]')).toBeNull();
    expect(container.textContent).not.toContain('Parafuso M8: separou');
  });

  test('rodada antiga (sem os campos da Etapa 60) não mostra divergência', async () => {
    requisicao = comRodadas([{ item_id: 1, material_id: 10, quantidade: 3 }]);
    await renderizar();
    expect(container.textContent).toContain('Separação (1)');
    expect(container.textContent).not.toContain('separou');
  });
});
