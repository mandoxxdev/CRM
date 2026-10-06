/**
 * Etapa 36, T3 (RN-36.05) — `ConfiguracoesProducao` com e sem `embedded`.
 *
 * A tela passa a ser renderizada DENTRO da aba "Operacional" de /configuracoes. Embutida, ela
 * nao pode trazer o `ProducaoPageHeader` (h1 "Configurações — Produção" + subtitulo) nem o
 * wrapper `.producao-page` (padding, max-width e o rodape de 72px do mobile).
 *
 * O botao "Novo motivo" morava nas acoes do header — sem header, ele sumiria. A decisao foi um
 * caminho de render so: o botao vai para o cabecalho do card "Motivos de parada" NOS DOIS MODOS,
 * e `embedded` apenas suprime o header da pagina. Dois caminhos (botao no header OU no card)
 * seriam duas telas para manter.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/producao/ConfiguracoesProducao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ConfiguracoesProducao from './ConfiguracoesProducao';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const MOTIVOS = [
  { id: 1, descricao: 'Troca de ferramenta', categoria: 'setup', tipo: 'planejada' },
  { id: 2, descricao: 'Falta de material', categoria: 'material', tipo: 'nao_planejada' },
];

let container;
let root;

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  api.get.mockResolvedValue({ data: MOTIVOS });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function render(embedded) {
  await act(async () => {
    root.render(embedded ? <ConfiguracoesProducao embedded /> : <ConfiguracoesProducao />);
  });
}

const botaoNovoMotivo = () => [...container.querySelectorAll('button')]
  .find(b => /Novo motivo/.test(b.textContent));

test('sem a prop, a tela e a de hoje: header da pagina e wrapper .producao-page', async () => {
  await render(false);

  expect(container.firstElementChild.classList.contains('producao-page')).toBe(true);
  expect(container.querySelector('.producao-embedded')).toBeNull();
  const header = container.querySelector('.producao-header');
  expect(header).not.toBeNull();
  expect(header.querySelector('h1').textContent).toBe('Configurações — Produção');
  expect(api.get).toHaveBeenCalledWith('/producao/motivos-parada');
  expect(container.textContent).toContain('Troca de ferramenta');
});

test('o botao "Novo motivo" mora no cabecalho do card "Motivos de parada", nao no header da pagina', async () => {
  await render(false);

  const botao = botaoNovoMotivo();
  expect(botao).not.toBeUndefined();
  const card = botao.closest('.producao-card');
  expect(card).not.toBeNull();
  expect(card.querySelector('h3').textContent).toBe('Motivos de parada');
  expect(botao.closest('.producao-header')).toBeNull();
  expect(container.querySelector('.producao-header-actions')).toBeNull();
});

test('com embedded, some o header da pagina e o wrapper vira .producao-embedded — o botao continua no card', async () => {
  await render(true);

  expect(container.firstElementChild.classList.contains('producao-embedded')).toBe(true);
  expect(container.querySelector('.producao-page')).toBeNull();
  expect(container.querySelector('.producao-header')).toBeNull();
  expect(container.querySelector('h1')).toBeNull();
  expect(container.textContent).not.toContain('Configurações — Produção');

  const botao = botaoNovoMotivo();
  expect(botao).not.toBeUndefined();
  expect(botao.closest('.producao-card')).not.toBeNull();
  expect(container.textContent).toContain('Falta de material');
});

test('o botao movido continua abrindo o modal de novo motivo', async () => {
  await render(true);

  expect(container.querySelector('.producao-modal')).toBeNull();
  await act(async () => { botaoNovoMotivo().click(); });
  const modal = container.querySelector('.producao-modal');
  expect(modal).not.toBeNull();
  expect(modal.querySelector('h2').textContent).toBe('Novo motivo');
});
