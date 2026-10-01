/**
 * Etapa 64 (T2): a tela da fila de separação.
 *
 * O que se prova: a tela não reordena o que o servidor ordenou; cada etapa vira um chip com o
 * rótulo combinado; o não acionável fica num grupo "Aguardando"; quem separou é avisado de que
 * não confere; "Abrir" leva a /almoxarifado/requisicoes?id=; vazio e 403 são estados distintos.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/FilaSeparacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import FilaSeparacao from './FilaSeparacao';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const item = (over = {}) => ({
  item_id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', unidade: 'PC',
  a_separar: 0, separavel: 0, a_entregar: 0, disponivel: 0,
  origem_separacao_codigo: null, lote_separacao_codigo: null, material_critico: 0, ...over,
});

const req = (over = {}) => ({
  id: 1, numero: 'REQ-1', status: 'APROVADO', urgencia: 'NORMAL', data_necessidade: null,
  solicitante_nome: 'Maria', setor: 'Produção', created_at: '2026-09-30 10:00:00',
  etapas: ['SEPARAR'], acionavel: true, conferencia_pendente: false, separadores: [],
  posso_conferir: true, itens: [item()], ...over,
});

// A ordem do servidor NÃO é a alfabética nem a de id — de propósito, para que um sort na tela
// apareça.
const FILA = [
  req({
    id: 30, numero: 'REQ-030', urgencia: 'CRITICO', data_necessidade: '2026-10-05',
    etapas: ['SEPARAR', 'ENTREGAR'],
    itens: [item({ item_id: 301, a_separar: 5, separavel: 3, a_entregar: 2, disponivel: 3,
      origem_separacao_codigo: 'A-01', lote_separacao_codigo: 'L-77' })],
  }),
  req({ id: 10, numero: 'REQ-010', urgencia: 'URGENTE', etapas: ['APROVACAO_VALOR'] }),
  req({
    id: 20, numero: 'REQ-020', status: 'EM_SEPARACAO', etapas: ['CONFERIR'], conferencia_pendente: true,
    posso_conferir: false, separadores: [{ id: 7, nome: 'João Almox' }],
  }),
  req({ id: 25, numero: 'REQ-025', status: 'PRONTA_PARA_RETIRADA', etapas: ['REABRIR_SEPARACAO'] }),
  req({ id: 5, numero: 'REQ-005', status: 'AGUARDANDO_COMPRA', etapas: ['AGUARDANDO_SALDO'], acionavel: false }),
  req({ id: 4, numero: 'REQ-004', status: 'AGUARDANDO_COMPRA', etapas: ['AGUARDANDO_SALDO'], acionavel: false }),
];

let container;
let root;
let local;

const SondaLocal = () => {
  local = useLocation();
  return null;
};

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const montar = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/fila-separacao']}>
        <SondaLocal />
        <Routes>
          <Route path="/almoxarifado/fila-separacao" element={<FilaSeparacao />} />
          <Route path="/almoxarifado/requisicoes" element={<div data-testid="tela-requisicoes" />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await flush();
};

const q = (sel) => container.querySelector(sel);
const qa = (sel) => Array.from(container.querySelectorAll(sel));
const numeros = (sel) => qa(`${sel} [data-testid="fila-numero"]`).map((n) => n.textContent);

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  local = null;
  api.get.mockReset();
  api.get.mockResolvedValue({ data: FILA });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test('carrega a fila ao montar e preserva a ordem do servidor (acionáveis e Aguardando)', async () => {
  await montar();
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/fila-separacao');
  expect(numeros('[data-testid="fila-acionaveis"]')).toEqual(['REQ-030', 'REQ-010', 'REQ-020', 'REQ-025']);
  expect(numeros('[data-testid="fila-aguardando"]')).toEqual(['REQ-005', 'REQ-004']);
});

test('um chip por etapa, com o rótulo combinado', async () => {
  await montar();
  const r30 = q('[data-testid="fila-req-30"]');
  expect(r30.querySelector('[data-testid="fila-etapa-SEPARAR"]').textContent).toBe('Separar');
  expect(r30.querySelector('[data-testid="fila-etapa-ENTREGAR"]').textContent).toBe('Entregar');
  expect(q('[data-testid="fila-req-10"] [data-testid="fila-etapa-APROVACAO_VALOR"]').textContent)
    .toBe('Aguardando aprovação de valor');
  expect(q('[data-testid="fila-req-5"] [data-testid="fila-etapa-AGUARDANDO_SALDO"]').textContent)
    .toBe('Aguardando saldo');
  expect(q('[data-testid="fila-req-25"] [data-testid="fila-etapa-REABRIR_SEPARACAO"]').textContent)
    .toBe('Separar de novo para conferir');
  // urgência, data e item
  expect(r30.querySelector('[data-testid="fila-urgencia"]').textContent).toBe('Crítico');
  expect(r30.textContent).toContain('Necessário em 05/10/2026');
  expect(q('[data-testid="fila-item-301"]').textContent).toBe(
    'MAT-1 — Chapa 3mm: a separar 5 PC (separável agora 3) · a entregar 2 PC · disponível 3 · separado de A-01 — L-77'
  );
});

test('grupo Aguardando só com as não acionáveis', async () => {
  await montar();
  const grupo = q('[data-testid="fila-aguardando"]');
  expect(grupo).not.toBeNull();
  expect(grupo.querySelector('h2').textContent).toBe('Aguardando');
  expect(grupo.querySelector('[data-testid="fila-req-30"]')).toBeNull();
  expect(q('[data-testid="fila-acionaveis"] [data-testid="fila-req-5"]')).toBeNull();
});

test('quem separou é avisado no chip Conferir; quem pode conferir vê só "Conferir"', async () => {
  api.get.mockResolvedValue({
    data: [
      FILA[2],
      req({ id: 21, numero: 'REQ-021', status: 'EM_SEPARACAO', etapas: ['CONFERIR'], conferencia_pendente: true, posso_conferir: true }),
    ],
  });
  await montar();
  expect(q('[data-testid="fila-req-20"] [data-testid="fila-etapa-CONFERIR"]').textContent)
    .toBe('Conferir — você separou, peça a outra pessoa');
  expect(q('[data-testid="fila-req-20"] [data-testid="fila-separadores"]').textContent)
    .toBe('Separado por: João Almox');
  expect(q('[data-testid="fila-req-21"] [data-testid="fila-etapa-CONFERIR"]').textContent).toBe('Conferir');
});

test('Abrir navega para /almoxarifado/requisicoes?id=', async () => {
  await montar();
  await act(async () => {
    q('[data-testid="fila-abrir-20"]').click();
  });
  expect(local.pathname).toBe('/almoxarifado/requisicoes');
  expect(local.search).toBe('?id=20');
  expect(q('[data-testid="tela-requisicoes"]')).not.toBeNull();
});

test('fila vazia mostra o estado vazio', async () => {
  api.get.mockResolvedValue({ data: [] });
  await montar();
  expect(q('[data-testid="fila-vazia"]').textContent).toContain('Nada para separar ou entregar agora.');
  expect(q('[data-testid="fila-sem-permissao"]')).toBeNull();
});

test('403 vira painel de permissão, não fila vazia', async () => {
  api.get.mockRejectedValue({
    response: { status: 403, data: { error: 'Sem permissão para esta operação', acao: 'separar_emitir', perfil: 'PRODUCAO' } },
  });
  await montar();
  const painel = q('[data-testid="fila-sem-permissao"]');
  expect(painel).not.toBeNull();
  expect(painel.textContent).toContain('Você não tem permissão para a fila de separação.');
  expect(q('[data-testid="fila-vazia"]')).toBeNull();
});

test('erro de servidor mostra a mensagem; Atualizar recarrega', async () => {
  api.get.mockRejectedValueOnce({ response: { status: 500, data: { error: 'Falha X' } } });
  await montar();
  expect(q('[data-testid="fila-erro"]').textContent).toContain('Falha X');
  await act(async () => { q('[data-testid="fila-atualizar"]').click(); });
  await flush();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(q('[data-testid="fila-erro"]')).toBeNull();
  expect(q('[data-testid="fila-req-30"]')).not.toBeNull();
});
