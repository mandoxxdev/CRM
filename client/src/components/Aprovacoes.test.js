/**
 * Etapa 140 (RN-140.11/12a, C302): a tela de Aprovações só mostra Aprovar e Rejeitar onde o servidor diz que quem está logado pode
 * decidir (`pode_decidir` do GET /aprovacoes). Antes os botões apareciam para qualquer um em pedido pendente — inclusive para quem pediu,
 * e o servidor aceitava. Falha aberto: sem o campo, mostra (quem decide é o PUT, que recusa com a frase).
 *
 * O mock de `services/api` é só a fronteira HTTP (o contrato congelado no plano da Etapa 140).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Aprovacoes, { podeDecidirNaTela } from './Aprovacoes';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'usuario', nome: 'Vend' } }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const base = { proposta_id: 1, numero_proposta: 'P-1', valor_desconto: 12, valor_total: 1000, valor_com_desconto: 880, valor_desconto_rs: 120,
  created_at: '2026-10-17 10:00:00', solicitado_por: 7, solicitado_por_nome: 'Vend', cliente_nome: 'Cli' };
const LINHAS = [
  { ...base, id: 1, status: 'pendente', pode_decidir: true },
  { ...base, id: 2, status: 'pendente', pode_decidir: false },
  { ...base, id: 3, status: 'pendente' }, // servidor antigo, sem o campo
  { ...base, id: 4, status: 'aprovado', pode_decidir: false },
];

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url) => (url === '/aprovacoes'
    ? Promise.resolve({ data: LINHAS })
    : Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }))));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function montar() {
  await act(async () => {
    root.render(<MemoryRouter><Aprovacoes /></MemoryRouter>);
  });
  await act(async () => { await Promise.resolve(); });
}
test('[RN-140.12a] a regra da tela: pendente e pode_decidir diferente de false', () => {
  expect(podeDecidirNaTela({ status: 'pendente', pode_decidir: true })).toBe(true);
  expect(podeDecidirNaTela({ status: 'pendente', pode_decidir: false })).toBe(false);
  expect(podeDecidirNaTela({ status: 'pendente' })).toBe(true); // falha aberto
  expect(podeDecidirNaTela({ pode_decidir: true })).toBe(true); // status ausente conta como pendente (como a tela sempre fez)
  expect(podeDecidirNaTela({ status: 'aprovado', pode_decidir: true })).toBe(false);
  expect(podeDecidirNaTela({ status: 'rejeitado' })).toBe(false);
  expect(podeDecidirNaTela(null)).toBe(false);
});

test('[RN-140.12a] na lista, Aprovar e Rejeitar só nas linhas em que o servidor diz que pode decidir', async () => {
  await montar();
  const linhas = [...container.querySelectorAll('tbody tr')];
  expect(linhas).toHaveLength(4);
  const botoes = linhas.map((tr) => [!!tr.querySelector('button[title="Aprovar"]'), !!tr.querySelector('button[title="Rejeitar"]')]);
  expect(botoes).toEqual([[true, true], [false, false], [true, true], [false, false]]);
});

test('[RN-140.12a] no modal de um pedido que não pode decidir: sem Aprovar nem motivo de rejeição, com o aviso de quem decide', async () => {
  await montar();
  const linhas = [...container.querySelectorAll('tbody tr')];
  await act(async () => { linhas[1].querySelector('button[title="Ver detalhes"]').click(); });
  expect(container.querySelector('.textarea-rejeicao')).toBeNull();
  expect([...container.querySelectorAll('.modal-actions button')].map((b) => b.textContent.trim())).toEqual(['Fechar']);
  expect(container.querySelector('[data-testid="aguardando-aprovador"]').textContent).toMatch(/Quem pediu e o responsável da proposta não decidem/);
});

test('[RN-140.12a] no modal de um pedido que pode decidir: Aprovar e o motivo, e o PUT não manda mais aprovado_por', async () => {
  api.put.mockResolvedValue({ data: { message: 'ok', id: 1, status: 'aprovado' } });
  await montar();
  const linhas = [...container.querySelectorAll('tbody tr')];
  await act(async () => { linhas[0].querySelector('button[title="Ver detalhes"]').click(); });
  expect(container.querySelector('.textarea-rejeicao')).not.toBeNull();
  expect(container.querySelector('[data-testid="aguardando-aprovador"]')).toBeNull();
  const aprovar = [...container.querySelectorAll('.modal-actions button')].find((b) => b.textContent.includes('Aprovar'));
  await act(async () => { aprovar.click(); });
  expect(api.put).toHaveBeenCalledWith('/aprovacoes/1', { status: 'aprovado' });
});

test('[RN-140.03] Fase 5 r3 H5: o Rejeitar manda só o status e o motivo (o servidor grava quem está logado)', async () => {
  api.put.mockResolvedValue({ data: { message: 'ok', id: 1, status: 'rejeitado' } });
  await montar();
  const linhas = [...container.querySelectorAll('tbody tr')];
  await act(async () => { linhas[0].querySelector('button[title="Ver detalhes"]').click(); });
  const caixa = container.querySelector('.textarea-rejeicao');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set;
    setter.call(caixa, 'caro demais');
    caixa.dispatchEvent(new Event('input', { bubbles: true }));
  });
  const rejeitar = [...container.querySelectorAll('.modal-actions button')].find((b) => b.textContent.includes('Confirmar Rejeição'));
  expect(rejeitar).toBeTruthy();
  await act(async () => { rejeitar.click(); });
  expect(api.put).toHaveBeenCalledWith('/aprovacoes/1', { status: 'rejeitado', motivo_rejeicao: 'caro demais' });
});
