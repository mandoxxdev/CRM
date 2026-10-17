/**
 * Etapa 141 (RN-141.09; Fase 5 r3 K11/K12): o modal "Nova solicitação" de Aprovações lista as rascunhos com desconto acima de 5% e
 * esconde só a que já tem aprovação que VALE (decidida por alguém que não é quem pediu, mesmo percentual). Antes escondia a que tivesse
 * qualquer aprovação aprovada de mesmo valor — inclusive a decidida pelo próprio vendedor, que não libera mais nada (B912): a proposta
 * sumia do modal para sempre. Este monta a tela e abre o modal.
 *
 * O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Aprovacoes from './Aprovacoes';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'usuario', nome: 'Vend' } }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const prop = (id, numero, margem) => ({ id, numero_proposta: numero, margem_desconto: margem, valor_total: 1000, status: 'rascunho', cliente_nome: 'Cli' });
const PROPOSTAS = [prop(11, 'P-VALE', 20), prop(12, 'P-AUTO', 20), prop(13, 'P-SEM', 20), prop(14, 'P-OUTRO-VALOR', 20), prop(15, 'P-BAIXO', 3)];
const ap = (proposta_id, extra) => ({ id: proposta_id * 10, proposta_id, tipo: 'desconto', status: 'aprovado', valor_desconto: 20, solicitado_por: 7, ...extra });
const APROVADAS = {
  11: [ap(11, { aprovado_por: 9 })], // vale: some do modal
  12: [ap(12, { aprovado_por: 7 })], // decidida por quem pediu: continua
  13: [], // sem aprovação: continua
  14: [ap(14, { aprovado_por: 9, valor_desconto: 15 })], // outro percentual: continua
};

let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url, cfg) => {
    if (url === '/propostas') return Promise.resolve({ data: PROPOSTAS });
    if (url === '/aprovacoes' && cfg && cfg.params && cfg.params.proposta_id) return Promise.resolve({ data: APROVADAS[cfg.params.proposta_id] || [] });
    if (url === '/aprovacoes') return Promise.resolve({ data: [] });
    return Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }));
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test('[RN-141.09] o modal esconde só a proposta com aprovação que vale; a decidida por quem pediu continua na lista', async () => {
  await act(async () => { root.render(<MemoryRouter><Aprovacoes /></MemoryRouter>); });
  for (let k = 0; k < 5; k++) await act(async () => { await Promise.resolve(); });
  const botao = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Nova Solicitação'));
  expect(botao).toBeTruthy();
  await act(async () => { botao.click(); });
  for (let k = 0; k < 10; k++) await act(async () => { await new Promise((r) => setTimeout(r, 5)); });
  expect(api.get).toHaveBeenCalledWith('/propostas', { params: { status: 'rascunho' } });
  const texto = container.textContent;
  // metade positiva: as que não têm aprovação que vale estão lá
  expect(texto).toContain('P-AUTO');
  expect(texto).toContain('P-SEM');
  expect(texto).toContain('P-OUTRO-VALOR');
  // a que tem aprovação que vale some; a de 3% nunca entra
  expect(texto).not.toContain('P-VALE');
  expect(texto).not.toContain('P-BAIXO');
});
