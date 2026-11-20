/**
 * Etapa 250 (C514, B1440; RN-250.01..04) — a janela de entrega diz quantas peças do lote estão presas quando o "Sai de" é o automático.
 *
 * - Os campos vêm de GET /estoque/:id/saldos (Etapa 218, sem mudança): por linha de lote com peça presa, `lote_livre`, `lote_bloqueado`,
 *   `lote_inspecao`; nas outras, `null`. Com o "Sai de" em "Qualquer endereço (automático)" aparece
 *   "Peças presas que a entrega automática não leva: lote L1 — 1 bloqueada; …" — um lote em várias prateleiras, uma vez só.
 * - Escolhido um endereço, a frase some (o rótulo da opção já diz). Lote impedido fica fora (a opção dele diz "não sai").
 * - Servidor sem os campos: nenhuma frase. A separação não ganha a frase (o automático dela não escolhe lote).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEntregaLotePreso --watchAll=false
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
const APROVADA = {
  ...REQ_BASE, status: 'APROVADO',
  itens: [{ ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 }],
};
const PARCIAL = {
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{ ...ITEM_BASE, quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2, quantidade_entregavel: 3 }],
};
// A-01 sem lote; XB-01/L1 e XB-02/L1 (o mesmo lote em duas prateleiras: 1 bloqueada); C-03/L9 (1 bloqueada, 2 em inspeção);
// D-04/L8 impedido (bloqueado na tela Lotes e Séries, com 2 bloqueadas nele) — fica fora da frase.
const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10,
    separado_outras: 0, sobra: 10, lote_livre: null, lote_bloqueado: null, lote_inspecao: null },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'XB-01', lote_id: 7, lote: 'L1', quantidade: 4,
    separado_outras: 0, sobra: 4, lote_livre: 5, lote_bloqueado: 1, lote_inspecao: 0 },
  { id: 7, material_id: 10, localizacao_id: 5, localizacao_codigo: 'XB-02', lote_id: 7, lote: 'L1', quantidade: 2,
    separado_outras: 0, sobra: 2, lote_livre: 5, lote_bloqueado: 1, lote_inspecao: 0 },
  { id: 5, material_id: 10, localizacao_id: 3, localizacao_codigo: 'C-03', lote_id: 9, lote: 'L9', quantidade: 3,
    separado_outras: 0, sobra: 3, lote_livre: 0, lote_bloqueado: 1, lote_inspecao: 2 },
  { id: 6, material_id: 10, localizacao_id: 4, localizacao_codigo: 'D-04', lote_id: 8, lote: 'L8', quantidade: 3,
    separado_outras: 0, sobra: 3, lote_livre: 1, lote_bloqueado: 2, lote_inspecao: 0,
    lote_esta_impedido: true, lote_status: 'BLOQUEADO', lote_vencido_sem_liberacao: false },
];
const SALDOS_ANTIGOS = SALDOS.map(({ lote_livre: _a, lote_bloqueado: _b, lote_inspecao: _c, ...resto }) => resto);
const FRASE = 'Peças presas que a entrega automática não leva: lote L1 — 1 bloqueada; lote L9 — 1 bloqueada, 2 em inspeção.';

let container;
let root;
let requisicao;
let saldos;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = SALDOS;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, separacoes, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') return Promise.resolve({ data: saldos });
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
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => { await act(async () => { botaoPorTexto(texto).click(); }); };
const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => { setter.call(select, valor); select.dispatchEvent(new Event('change', { bubbles: true })); });
};
const selectEntrega = () => container.querySelector('#entrega-origem-1');
const fraseEntrega = () => container.querySelector('#entrega-dica-lote-preso-1');

describe('Etapa 250: a entrega automática diz as peças presas do lote (C514)', () => {
  test('[RN-250.01/03] automático: a frase com cada lote uma vez (L1 em duas prateleiras), sem o lote impedido L8', async () => {
    requisicao = PARCIAL;
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(fraseEntrega()).not.toBeNull();
    expect(fraseEntrega().textContent).toBe(FRASE);
  });

  test('[RN-250.02] escolhido um endereço a frase some; voltando ao automático, volta', async () => {
    requisicao = PARCIAL;
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEntrega(), '2:7');
    expect(selectEntrega().value).toBe('2:7');
    expect(fraseEntrega()).toBeNull();
    escolher(selectEntrega(), '');
    expect(fraseEntrega().textContent).toBe(FRASE);
  });

  test('[RN-250.01] plural: 2 bloqueadas num lote só, 1 em inspeção', async () => {
    requisicao = PARCIAL;
    saldos = [{ id: 8, material_id: 10, localizacao_id: 6, localizacao_codigo: 'E-05', lote_id: 11, lote: 'L3', quantidade: 6,
      separado_outras: 0, sobra: 6, lote_livre: 3, lote_bloqueado: 2, lote_inspecao: 1 }];
    await renderizar();
    await clicar('Completar Entrega');
    expect(fraseEntrega().textContent).toBe('Peças presas que a entrega automática não leva: lote L3 — 2 bloqueadas, 1 em inspeção.');
  });

  test('[RN-250.03] servidor sem os campos: nenhuma frase (a janela abriu com o "Sai de")', async () => {
    requisicao = PARCIAL;
    saldos = SALDOS_ANTIGOS;
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega()).not.toBeNull();
    expect(fraseEntrega()).toBeNull();
  });

  test('[RN-250.04] a separação não ganha a frase (o "Sai de" da separação está lá)', async () => {
    requisicao = APROVADA;
    await renderizar();
    await clicar('Iniciar Separação');
    expect(container.querySelector('#separacao-origem-1')).not.toBeNull();
    expect(container.textContent).not.toContain('Peças presas que a entrega automática não leva');
  });
});
