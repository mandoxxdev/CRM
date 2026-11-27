/**
 * Tela da proposta mais limpa (27/11/2026: "to achando ela feia e confusa, muita informação"). Só layout: o essencial e os itens primeiro,
 * número e status no topo, o ocasional recolhido (abre sozinho quando já tem algo). O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PropostaForm from './PropostaForm';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'usuario', nome: 'Vend' }, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const base = {
  id: 1, numero_proposta: '006-01-AD-2026-REV00', cliente_id: 3, cliente_nome: 'FALCAO TINTAS SA', titulo: 'T', status: 'enviada',
  margem_desconto: 0, valor_total: 0, responsavel_id: 7, probabilidade: 40, itens: [],
};
let proposta;
let container; let root;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  proposta = { ...base };
  api.get.mockImplementation((url) => (url === '/propostas/1' ? Promise.resolve({ data: proposta }) : Promise.resolve({ data: [] })));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

async function montar(rota = '/comercial/propostas/editar/1') {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={[rota]}>
        <Routes>
          <Route path="/comercial/propostas/editar/:id" element={<PropostaForm />} />
          <Route path="/comercial/propostas/nova" element={<PropostaForm />} />
        </Routes>
      </MemoryRouter>
    );
  });
  for (let k = 0; k < 6; k++) await act(async () => { await Promise.resolve(); });
}
const bloco = (titulo) => [...container.querySelectorAll('details.proposta-form-recolhivel')].find((d) => d.querySelector('summary').textContent.includes(titulo));
const posicao = (el) => [...container.querySelectorAll('*')].indexOf(el);

test('ordem: cliente e titulo, depois os itens, depois as condicoes, depois os recolhidos', async () => {
  await montar();
  const cliente = container.querySelector('#proposta-cliente');
  const itens = container.querySelector('.proposta-form-section-itens');
  const condicoes = container.querySelector('#proposta-condicoes');
  const fora = bloco('Proposta para fora do Brasil');
  const acompanhamento = bloco('Acompanhamento e lembrete');
  expect(cliente && itens && condicoes && fora && acompanhamento).toBeTruthy();
  expect(posicao(cliente)).toBeLessThan(posicao(itens));
  expect(posicao(itens)).toBeLessThan(posicao(condicoes));
  expect(posicao(condicoes)).toBeLessThan(posicao(fora));
  expect(posicao(fora)).toBeLessThan(posicao(acompanhamento));
  expect(container.querySelector('input[readonly]')).toBeNull(); // o numero nao e mais um campo cinza no meio dos campos
});

test('numero e status no topo; numero vazio diz quando sai', async () => {
  await montar();
  const chips = [...container.querySelectorAll('.proposta-form-chip')].map((c) => c.textContent);
  expect(chips).toEqual(['Nº 006-01-AD-2026-REV00', 'Enviada']);
  await act(async () => root.unmount());
  root = createRoot(container);
  await montar('/comercial/propostas/nova');
  expect(container.querySelector('.proposta-form-chip').textContent).toBe('Nº sai ao escolher o cliente');
});

test('proposta em real e sem lembrete: os dois blocos recolhidos, com o resumo de uma linha', async () => {
  await montar();
  expect(bloco('Proposta para fora do Brasil').open).toBe(false);
  expect(bloco('Acompanhamento e lembrete').open).toBe(false);
  expect(bloco('Proposta para fora do Brasil').querySelector('.proposta-form-resumo').textContent).toBe('Só português · Real (R$)');
  expect(bloco('Acompanhamento e lembrete').querySelector('.proposta-form-resumo').textContent).toBe('Enviada · 40% de chance');
});

test('ja preenchido abre sozinho: em dolar, o de fora do Brasil; com lembrete, o acompanhamento', async () => {
  proposta = { ...base, moeda: 'USD', taxa_cambio: 5, lembrete_data: '2026-12-10', lembrete_mensagem: 'ligar' };
  await montar();
  expect(bloco('Proposta para fora do Brasil').open).toBe(true);
  expect(bloco('Acompanhamento e lembrete').open).toBe(true);
});

test('perdida: o acompanhamento abre a forca (o motivo e obrigatorio e nao pode ficar escondido)', async () => {
  proposta = { ...base, status: 'rejeitada', motivo_nao_venda: '' };
  await montar();
  const ac = bloco('Acompanhamento e lembrete');
  expect(ac.open).toBe(true);
  expect(ac.querySelector('#proposta-motivo')).not.toBeNull();
});

test('nenhum campo sumiu: os do cadastro antigo continuam na tela', async () => {
  await montar();
  for (const sel of ['#proposta-cliente', '#proposta-titulo', '#proposta-tipo', '#proposta-responsavel', '#proposta-descricao', '#proposta-condicoes',
    '#proposta-prazo', '#proposta-garantia', '#proposta-idioma', '#proposta-moeda', '#proposta-incoterm', '#proposta-incoterm-local', '#proposta-status',
    '#proposta-probabilidade', '#proposta-familia', '#proposta-origem', '#proposta-fechamento', '#proposta-lembrete-data', '#proposta-lembrete-msg']) {
    expect(container.querySelector(sel)).not.toBeNull();
  }
});
