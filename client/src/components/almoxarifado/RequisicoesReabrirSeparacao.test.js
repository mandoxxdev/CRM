/**
 * Etapa 94 (T2c, Fase 2 B1/B460 e M1/B463) — o legado com tudo separado tem gesto na tela, e o 409 V1 recarrega.
 *
 * - Antes da 94 a alçada de valor reavaliada depois da separação deixava requisições "Aguardando aprovação de
 *   valor" com material na caixa; aprovadas por valor, voltavam a *Totalmente Reservada* com tudo separado. O
 *   servidor aceita "Iniciar Separação" sem quantidade (vai a *Em Separação* e segue para a entrega), mas a tela
 *   desabilitava "Confirmar Separação" (todo item com `maxQtdSeparacao <= 0`) e a fila não listava a requisição.
 *   Agora, status pré-separação com algum item separado > entregue (`separacaoAReabrir`, espelho da máquina do
 *   servidor): o botão fica habilitado e diz "Reabrir separação", e confirmar manda `itens_separados: []`.
 * - O 409 da separação (V1 da 94: o status mudou enquanto a alçada era conferida; X1 da 93: outra separação
 *   venceu) fecha o modal e recarrega o detalhe e a lista. Um 400 mantém o modal (corrigir e tentar de novo).
 * - A fila mostra a etapa nova `RETOMAR_SEPARACAO` como "Reabrir separação".
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesReabrirSeparacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
import FilaSeparacao from './FilaSeparacao';
import { STATUS_PRE_SEPARACAO, separacaoAReabrir } from './requisicaoLabels';
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
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 4,
  saldo_atual: 8, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
};
const REQ = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', status: 'TOTALMENTE_RESERVADA',
  solicitante_id: 7, solicitante_nome: 'Maria', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
const comItem = (over) => ({ ...REQ, itens: [{ ...ITEM, ...over }] });

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { success: true, status: 'EM_SEPARACAO' } });
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
  const b = botaoPorTexto(texto);
  expect(b).toBeTruthy();
  await act(async () => { b.click(); });
};
const modalAberto = () => !!container.querySelector('.almox-modal') && container.textContent.includes('Separar Materiais');
const getsDe = (url) => api.get.mock.calls.filter((c) => c[0] === url).length;

describe('Etapa 94 — Reabrir separação (o legado com tudo na caixa)', () => {
  test('(a) TOTALMENTE_RESERVADA com 4 de 4 separados: o botão diz "Reabrir separação", está habilitado e manda itens_separados: []', async () => {
    requisicao = comItem({ quantidade_separada: 4, quantidade_entregue: 0, quantidade_atendida: 0 });
    await renderizar();
    await clicar('Iniciar Separação');
    expect(modalAberto()).toBe(true);
    const b = botaoPorTexto('Reabrir separação');
    expect(b).toBeTruthy();
    expect(b.disabled).toBe(false);
    expect(botaoPorTexto('Confirmar Separação')).toBeFalsy();
    expect(container.textContent).toContain('Todo o material desta requisição já está separado');
    await clicar('Reabrir separação');
    const chamada = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
    expect(chamada).toBeTruthy();
    expect(chamada[1]).toEqual({ itens_separados: [] });
  });

  test('(a) o mesmo com 4 separados e 2 entregues', async () => {
    requisicao = comItem({ quantidade_separada: 4, quantidade_entregue: 2, quantidade_atendida: 2, saldo_atual: 6 });
    await renderizar();
    await clicar('Iniciar Separação');
    const b = botaoPorTexto('Reabrir separação');
    expect(b).toBeTruthy();
    expect(b.disabled).toBe(false);
  });

  test('(b) controle: TOTALMENTE_RESERVADA sem nada separado e sem saldo -> "Confirmar Separação" desabilitado, sem "Reabrir"', async () => {
    requisicao = comItem({ quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0, saldo_atual: 0 });
    await renderizar();
    await clicar('Iniciar Separação');
    const b = botaoPorTexto('Confirmar Separação');
    expect(b).toBeTruthy();
    expect(b.disabled).toBe(true);
    expect(botaoPorTexto('Reabrir separação')).toBeFalsy();
    expect(container.textContent).toContain('Nenhum item com estoque disponível para separação.');
  });
});

describe('Etapa 94 — 409 na separação fecha o modal e recarrega (B463)', () => {
  const erro = (status, msg) => Object.assign(new Error(msg), { response: { status, data: { error: msg } } });

  test('(c) 409 V1: o modal fecha e o detalhe e a lista são recarregados', async () => {
    requisicao = comItem({ quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 });
    api.put.mockRejectedValue(erro(409, 'A requisição mudou de status enquanto a alçada de valor era conferida (agora CANCELADO); recarregue e confira antes de separar.'));
    await renderizar();
    await clicar('Iniciar Separação');
    const detalheAntes = getsDe('/almoxarifado/requisicoes/55');
    const listaAntes = getsDe('/almoxarifado/requisicoes');
    await clicar('Confirmar Separação');
    await act(async () => { await Promise.resolve(); });
    expect(modalAberto()).toBe(false);
    expect(getsDe('/almoxarifado/requisicoes/55')).toBeGreaterThan(detalheAntes);
    expect(getsDe('/almoxarifado/requisicoes')).toBeGreaterThan(listaAntes);
  });

  test('(c) controle: um 400 mantém o modal aberto', async () => {
    requisicao = comItem({ quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 });
    api.put.mockRejectedValue(erro(400, 'Quantidade inválida'));
    await renderizar();
    await clicar('Iniciar Separação');
    await clicar('Confirmar Separação');
    expect(modalAberto()).toBe(true);
  });
});

describe('Etapa 94 — a fila e o predicado', () => {
  test('(d) a fila mostra RETOMAR_SEPARACAO como "Reabrir separação"', async () => {
    api.get.mockResolvedValue({
      data: [{
        id: 77, numero: 'REQ-077', status: 'TOTALMENTE_RESERVADA', urgencia: 'NORMAL', data_necessidade: null,
        solicitante_nome: 'Maria', setor: 'Produção', created_at: '2026-09-30 10:00:00',
        etapas: ['RETOMAR_SEPARACAO'], acionavel: true, conferencia_pendente: false, separadores: [],
        posso_conferir: true,
        itens: [{ item_id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa', unidade: 'PC',
          a_separar: 0, separavel: 0, a_entregar: 4, entregavel: 4, disponivel: 8, material_critico: false }],
      }],
    });
    await act(async () => {
      root.render(<MemoryRouter initialEntries={['/almoxarifado/fila-separacao']}><FilaSeparacao /></MemoryRouter>);
    });
    await act(async () => { await Promise.resolve(); await Promise.resolve(); });
    expect(container.textContent).toContain('Reabrir separação');
    expect(container.textContent).not.toContain('RETOMAR_SEPARACAO');
  });

  test('(e) a lista e o predicado do cliente são os do servidor (requisitionStateMachine)', () => {
    // eslint-disable-next-line global-require, import/no-unresolved
    const servidor = require('../../../../server/services/almoxarifado/requisitionStateMachine');
    // Guarda da guarda: import quebrado viria vazio e o toEqual compararia nada com nada.
    expect(servidor.STATUS_PRE_SEPARACAO).toContain('TOTALMENTE_RESERVADA');
    expect([...STATUS_PRE_SEPARACAO].sort()).toEqual([...servidor.STATUS_PRE_SEPARACAO].sort());
    const todos = [...new Set([...Object.keys(servidor.TRANSICOES), 'AGUARDANDO_APROVACAO_VALOR', 'REJEITADO', 'CANCELADO', 'ENCERRADA'])];
    const casos = [
      [{ quantidade_separada: 4, quantidade_entregue: 0 }],
      [{ quantidade_separada: 4, quantidade_entregue: 2 }],
      [{ quantidade_separada: 4, quantidade_entregue: null, quantidade_atendida: 2 }],
      [{ quantidade_separada: 2, quantidade_entregue: 2 }],
      [{ quantidade_separada: 0 }],
    ];
    casos.forEach((itens) => {
      todos.forEach((s) => {
        expect([s, separacaoAReabrir(s, itens)]).toEqual([s, servidor.separacaoAReabrir(s, itens)]);
      });
    });
  });
});
