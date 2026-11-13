/**
 * Etapa 214 (RN-214.03) — o quadro "Histórico de preços" da seção Fornecedores deste material.
 * O servidor é mockado só na fronteira HTTP: `GET /compras/materiais/cadastro/:id/historico-precos`.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import HistoricoDePrecos, { LITERAL_SEM_HISTORICO } from './HistoricoDePrecos';
import api from '../../services/api';

jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const LINHAS = [
  { origem: 'pedido', documento_id: 5, linha_id: 1, numero: 'PC-0005', data: '2026-11-12', status: 'pendente', fornecedor_id: 1, fornecedor_nome: 'Alfa', quantidade: 3, unidade: 'KG', valor_unitario: 45.9 },
  { origem: 'cotacao', documento_id: 8, linha_id: 2, numero: 'COT-8', data: '2026-11-01', status: 'aprovado', fornecedor_id: 1, fornecedor_nome: 'Alfa', quantidade: 2, unidade: 'KG', valor_unitario: 47 },
  { origem: 'cotacao', documento_id: 9, linha_id: 3, numero: 'COT-9', data: '2026-10-20', status: 'rejeitado', fornecedor_id: 2, fornecedor_nome: 'Beta Metais SA', quantidade: 2, unidade: 'KG', valor_unitario: 50 },
];

let container; let root;
const tick = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
const $ = (sel) => container.querySelector(sel);
async function render() { await act(async () => { root.render(<HistoricoDePrecos materialId={7} />); }); await tick(); }

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: LINHAS });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('HistoricoDePrecos — Etapa 214', () => {
  test('[RN-214.03] lista data, fornecedor, origem com numero, quantidade e preco, na ordem do servidor', async () => {
    await render();
    expect(api.get).toHaveBeenCalledWith('/compras/materiais/cadastro/7/historico-precos');
    const p = $('[data-testid="historico-pedido-5"]').textContent;
    expect(p).toContain('12/11/2026');
    expect(p).toContain('Alfa');
    expect(p).toContain('Pedido PC-0005');
    expect(p).toContain('3 KG');
    expect(p).toMatch(/45,90/);
    expect($('[data-testid="historico-cotacao-9"]').textContent).toContain('Cotação COT-9 (rejeitada)');
    const ordem = [...container.querySelectorAll('tbody tr')].map((tr) => tr.getAttribute('data-testid'));
    expect(ordem).toEqual(['historico-pedido-5', 'historico-cotacao-8', 'historico-cotacao-9']);
  });

  test('[RN-214.03] o filtro por fornecedor mostra so as linhas dele', async () => {
    await render();
    const sel = $('[data-testid="historico-filtro-fornecedor"]');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set.call(sel, '2');
      sel.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect($('[data-testid="historico-cotacao-9"]')).not.toBeNull();
    expect($('[data-testid="historico-pedido-5"]')).toBeNull();
  });

  test('[RN-214.03] sem linhas: a frase literal (e o quadro esta la)', async () => {
    api.get.mockResolvedValue({ data: [] });
    await render();
    expect($('[data-testid="historico-de-precos"]').textContent).toContain('Histórico de preços');
    expect($('[data-testid="historico-vazio"]').textContent).toBe(LITERAL_SEM_HISTORICO);
    expect(LITERAL_SEM_HISTORICO).toBe('Nenhum preço cotado ou comprado para este material ainda.');
  });
});
