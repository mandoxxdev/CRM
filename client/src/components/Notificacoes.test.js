/**
 * Etapa 154 (RN-154.03) — o clique numa notificacao do sino abre a proposta DENTRO do Comercial.
 *
 * O sino (desenhado no painel do indice de /comercial) leva o lembrete a tela da proposta. A rota do client e
 * /comercial/propostas/editar/:id (App.js, dentro do bloco /comercial); o endereco sem o prefixo caia na rota inexistente.
 * O modal de lembrete das Atividades leva ao mesmo lugar (Fase 2 M-4) — conferido pelo fonte.
 */
import React, { act } from 'react';
import fs from 'fs';
import path from 'path';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import Notificacoes from './Notificacoes';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn() },
}));

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({
  ...jest.requireActual('react-router-dom'),
  useNavigate: () => mockNavigate,
}));

// o corpo que o GET /api/notificacoes devolve (server/index.js: os lembretes das propostas do usuario)
const LEMBRETE = {
  id: 42, tipo: 'lembrete_proposta', titulo: 'Lembrete: E154-0042', mensagem: 'ligar para o cliente', data: '2026-10-19',
  prioridade: 'hoje', proposta_id: 42, cliente_nome: 'CLIENTE 154', numero_proposta: 'E154-0042',
};

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  jest.spyOn(console, 'log').mockImplementation(() => {});
  api.get.mockImplementation((url) => (url === '/notificacoes' ? Promise.resolve({ data: [LEMBRETE] }) : Promise.reject(new Error(`404 ${url}`))));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  console.log.mockRestore();
});

// o bloco da rota /comercial no App.js, e as rotas filhas dele
function rotasDoComercial() {
  const app = fs.readFileSync(path.join(__dirname, '..', 'App.js'), 'utf8');
  const ini = app.indexOf('path="/comercial"');
  expect(ini).toBeGreaterThan(-1);
  const fim = app.indexOf('</Route>', ini);
  return [...app.slice(ini, fim).matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
}

test('RN-154.03: o clique no lembrete abre /comercial/propostas/editar/<id>, uma rota montada dentro de /comercial', async () => {
  await act(async () => {
    root.render(<MemoryRouter><Notificacoes /></MemoryRouter>);
  });
  expect(api.get).toHaveBeenCalledWith('/notificacoes');
  // o numero do sino conta o lembrete de hoje (a metade que prova que a notificacao chegou a tela)
  expect(container.querySelector('.notificacoes-badge').textContent).toBe('1');
  await act(async () => { container.querySelector('.notificacoes-bell').click(); });
  const item = container.querySelector('.notificacao-item');
  expect(item.textContent).toContain('Lembrete: E154-0042');
  await act(async () => { item.click(); });
  expect(mockNavigate).toHaveBeenCalledTimes(1);
  const destino = mockNavigate.mock.calls[0][0];
  expect(destino).toBe('/comercial/propostas/editar/42');
  // e o destino casa uma rota filha de /comercial no App.js (propostas/editar/:id)
  const filho = destino.replace(/^\/comercial\//, '');
  const casa = rotasDoComercial().some((r) => new RegExp(`^${r.replace(/:[A-Za-z_]\w*/g, '[^/]+')}$`).test(filho));
  expect(casa).toBe(true);
});

test('RN-154.03 (Fase 2 M-4): o modal de lembrete das Atividades leva ao mesmo endereco', () => {
  const src = fs.readFileSync(path.join(__dirname, 'Atividades.js'), 'utf8');
  const navs = [...src.matchAll(/navigate\(`([^`]*propostas\/editar[^`]*)`\)/g)].map((m) => m[1]);
  expect(navs).toEqual(['/comercial/propostas/editar/${modalLembrete.proposta_id}']);
});
