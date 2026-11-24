/**
 * Proposta para fora do Brasil (specs/proposta-bilingue/README.md, RN-BI.01/08/09): idioma, moeda e incoterm no formulário.
 * O servidor já gravava as três colunas; faltava a tela. O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PropostaForm from './PropostaForm';
import api from '../../services/api';
import { separarIncoterm, montarIncoterm, idiomaDoBanco, moedaDoBanco } from './idiomaProposta';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'usuario', nome: 'Vend' }, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const item = { id: 11, proposta_id: 1, descricao: 'MASSEIRA', quantidade: 1, unidade: 'UN', valor_unitario: 100, valor_total: 100,
  codigo_produto: 'M1', familia_produto: 'FAM', preco_tabela: 100, acessorios: '[]' };
const base = { id: 1, numero_proposta: 'P-1', cliente_id: 3, titulo: 'T', status: 'rascunho', margem_desconto: 0, valor_total: 100,
  responsavel_id: 7, itens: [item] };

let container; let root; let proposta;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  proposta = { ...base };
  api.get.mockImplementation((url) => (url === '/propostas/1' ? Promise.resolve({ data: proposta }) : Promise.resolve({ data: [] })));
  api.put.mockResolvedValue({ data: { message: 'ok' } });
  api.post.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function montar() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/comercial/propostas/editar/1']}>
        <Routes>
          <Route path="/comercial/propostas/editar/:id" element={<PropostaForm />} />
          <Route path="/comercial/propostas" element={<div>lista</div>} />
        </Routes>
      </MemoryRouter>
    );
  });
  for (let k = 0; k < 5; k++) await act(async () => { await Promise.resolve(); });
}
async function salvar() {
  await act(async () => {
    container.querySelector('#proposta-form-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
  for (let k = 0; k < 5; k++) await act(async () => { await Promise.resolve(); });
  const chamada = api.put.mock.calls.find(([url]) => url === '/propostas/1');
  expect(chamada).toBeTruthy();
  return chamada[1];
}
// Mudança de valor como o React enxerga (o setter nativo + evento), para select e input controlados.
async function mudar(sel, valor) {
  const el = container.querySelector(sel);
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const val = (sel) => container.querySelector(sel).value;

test('[RN-BI.01] proposta antiga, sem os campos: a tela mostra só português, real e sem incoterm, e salva isso', async () => {
  await montar();
  expect(val('#proposta-idioma')).toBe('pt-BR');
  expect(val('#proposta-moeda')).toBe('BRL');
  expect(val('#proposta-incoterm')).toBe('');
  expect(val('#proposta-incoterm-local')).toBe('');
  const corpo = await salvar();
  expect(corpo).toMatchObject({ idioma: 'pt-BR', moeda: 'BRL', incoterm: '' });
});

test('[RN-BI.01/08/09] proposta gravada em inglês, dólar e FOB: a tela mostra o que está gravado e devolve igual', async () => {
  proposta = { ...base, idioma: 'en', moeda: 'USD', incoterm: 'FOB – Porto de Santos' };
  await montar();
  expect(val('#proposta-idioma')).toBe('en');
  expect(val('#proposta-moeda')).toBe('USD');
  expect(val('#proposta-incoterm')).toBe('FOB');
  expect(val('#proposta-incoterm-local')).toBe('Porto de Santos');
  const corpo = await salvar();
  expect(corpo).toMatchObject({ idioma: 'en', moeda: 'USD', incoterm: 'FOB – Porto de Santos' });
});

test('[RN-BI.09] escolher espanhol, euro, CIF e digitar o local letra a letra (com espaços) salva "CIF – Porto de Valencia"', async () => {
  await montar();
  await mudar('#proposta-idioma', 'es');
  await mudar('#proposta-moeda', 'EUR');
  await mudar('#proposta-incoterm', 'CIF');
  // Cada tecla soma ao que o CAMPO mostra (como o usuário digita) — não a uma variável do teste. Somando a uma variável, o
  // teste passava com o defeito de cortar o espaço final (controle positivo de 24/11/2026): o espaço sumido voltava na tecla seguinte.
  for (const letra of 'Porto de Valencia') await mudar('#proposta-incoterm-local', val('#proposta-incoterm-local') + letra);
  expect(val('#proposta-incoterm-local')).toBe('Porto de Valencia');
  const corpo = await salvar();
  expect(corpo).toMatchObject({ idioma: 'es', moeda: 'EUR', incoterm: 'CIF – Porto de Valencia' });
});

test('[RN-BI.09] incoterm: separar e montar são inversos; código desconhecido fica no local; vazio é vazio', () => {
  expect(separarIncoterm('FOB – Porto de Santos')).toEqual({ codigo: 'FOB', local: 'Porto de Santos' });
  expect(separarIncoterm('fob - Santos')).toEqual({ codigo: 'FOB', local: 'Santos' });
  expect(separarIncoterm('EXW')).toEqual({ codigo: 'EXW', local: '' });
  expect(separarIncoterm('Porto de Santos')).toEqual({ codigo: '', local: 'Porto de Santos' });
  expect(separarIncoterm('')).toEqual({ codigo: '', local: '' });
  expect(montarIncoterm('fob', 'Santos')).toBe('FOB – Santos');
  expect(montarIncoterm('FOB', '   ')).toBe('FOB');
  expect(montarIncoterm('', '')).toBe('');
  expect(montarIncoterm('', 'Santos')).toBe('Santos');
  for (const s of ['FOB – Porto de Santos', 'EXW', 'DAP – Buenos Aires ']) expect(montarIncoterm(separarIncoterm(s).codigo, separarIncoterm(s).local)).toBe(s);
  expect(idiomaDoBanco('fr')).toBe('pt-BR');
  expect(moedaDoBanco(null)).toBe('BRL');
});
