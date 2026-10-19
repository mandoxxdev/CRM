/**
 * Etapa 159 (RN-159.04, C387) — nas Atividades, o Remover lembrete com o filtro "Todos" recarrega com todos=true (antes:
 * responsavel_id=todos, e o servidor devolvia a lista vazia). A camada de comunicacao REAL (`services/api.js`, axios real), adaptador falso.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';

jest.mock('axios', () => jest.requireActual('axios/dist/browser/axios.cjs'));
jest.mock('./CalendarioAtividades', () => ({ __esModule: true, default: () => null }));
// a mesma referencia a cada render (como o contexto de verdade) — um objeto novo por chamada recarregaria sem parar
const mockAuth = { user: { id: 3, nome: 'Vendedor 159', role: 'admin', email: 'v159@t' }, loading: false };
jest.mock('../context/AuthContext', () => ({ useAuth: () => mockAuth }));

const axios = require('axios');
const api = require('../services/api').default;
const Atividades = require('./Atividades').default;
const { paramsDoFiltro } = require('./Atividades');

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const ATIVIDADE = { id: 11, titulo: 'VISITA TECNICA 159', tipo: 'visita', status: 'pendente', prioridade: 'media', data_agendada: '2026-10-25', responsavel_id: 4, cliente_nome: 'CLIENTE 159' };
const LEMBRETE = { id: 'lembrete_42', titulo: 'Lembrete: P-42 - PROPOSTA 159', tipo: 'lembrete', origem: 'lembrete', proposta_id: 42,
  data_agendada: '2026-10-20', status: 'pendente', prioridade: 'alta', responsavel_id: 4, cliente_nome: 'CLIENTE 159' };

let pedidos; let lembreteRemovido; let container; let root;
beforeAll(() => {
  jest.spyOn(console, 'error').mockImplementation(() => {});
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'warn').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  pedidos = [];
  lembreteRemovido = false;
  api.defaults.adapter = async (config) => {
    const [caminho, consulta] = axios.getUri(config).split('?');
    const qs = new URLSearchParams(consulta || '');
    const ok = (data) => ({ status: 200, statusText: 'OK', data, headers: {}, config });
    if (caminho.endsWith('/atividades')) {
      pedidos.push(Object.fromEntries(qs));
      // o servidor de verdade: responsavel_id=todos filtra a.responsavel_id = 'todos' -> nada; todos=true -> todas
      if (qs.get('responsavel_id') === 'todos') return ok([]);
      if (qs.get('todos') === 'true') return ok(lembreteRemovido ? [ATIVIDADE] : [ATIVIDADE, LEMBRETE]);
      return ok([]);
    }
    if (caminho.endsWith('/remover-lembrete')) { lembreteRemovido = true; return ok({ message: 'ok' }); }
    if (caminho.endsWith('/usuarios/comercial')) return ok([{ id: 4, nome: 'Outro 159' }]);
    return ok([]);
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function esperar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) { if (cond()) return; await act(async () => { await pausa(20); }); }
  throw new Error('a condicao nao chegou: ' + JSON.stringify(pedidos) + ' | ' + container.textContent.slice(0, 400));
}
function escolher(sel, valor) {
  Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(sel, valor);
  sel.dispatchEvent(new Event('change', { bubbles: true }));
}
const clicar = async (el) => { await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); }); };

test('[RN-159.04] paramsDoFiltro: "todos" -> todos=true; um usuario -> responsavel_id; vazio -> nada', () => {
  expect(paramsDoFiltro('todos')).toEqual({ todos: true });
  expect(paramsDoFiltro('4')).toEqual({ responsavel_id: '4' });
  expect(paramsDoFiltro('')).toEqual({});
});

jest.setTimeout(20000);
test('[RN-159.04, C387] com "Todos", o Remover lembrete recarrega com todos=true (sem responsavel_id) e a lista continua com as atividades', async () => {
  await act(async () => { root.render(<MemoryRouter><Atividades /></MemoryRouter>); });
  const sel = await (async () => { await esperar(() => container.querySelector('.filters select.filter-select')); return container.querySelector('.filters select.filter-select'); })();
  await act(async () => { escolher(sel, 'todos'); });
  await esperar(() => container.textContent.includes('PROPOSTA 159'));
  expect(container.textContent).toContain('VISITA TECNICA 159');
  const antes = pedidos.length;
  const card = [...container.querySelectorAll('.atividade-card')].find((c) => c.textContent.includes('PROPOSTA 159'));
  await clicar(card);
  await esperar(() => container.querySelector('.btn-remover-lembrete-modal'));
  await clicar(container.querySelector('.btn-remover-lembrete-modal'));
  await clicar(container.querySelector('.btn-remover-lembrete-modal'));
  await esperar(() => lembreteRemovido && pedidos.length > antes);
  await act(async () => { await pausa(50); });
  expect(pedidos[pedidos.length - 1]).toEqual({ todos: 'true' });
  expect(pedidos.some((p) => p.responsavel_id === 'todos')).toBe(false);
  // a metade positiva: a atividade continua na lista; o lembrete removido saiu
  expect(container.textContent).toContain('VISITA TECNICA 159');
  expect(container.textContent).not.toContain('PROPOSTA 159');
});
