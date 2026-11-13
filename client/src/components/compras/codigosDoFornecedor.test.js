/**
 * Etapa 213 (RN-213.04) — a célula "Código" da cotação e do pedido: o código GMP e, abaixo, o código do fornecedor escolhido.
 * O servidor é mockado só na fronteira HTTP: `GET /compras/fornecedores/:id/itens` (catálogo, com `material_id` desde a 212).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { useCodigosDoFornecedor, CelulaCodigo } from './codigosDoFornecedor';
import api from '../../services/api';

jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const CATALOGO = {
  1: [{ id: 1, material_id: 7, codigo: '45879' }, { id: 2, material_id: null, codigo: 'SOLTO' }, { id: 3, material_id: 8, codigo: '  ' }],
  2: [{ id: 4, material_id: 7, codigo: 'B-77' }],
};
const ITENS = [
  { material_id: 7, codigo: 'GMP-7', codigo_fornecedor: 'GRAVADO-7' },
  { material_id: 8, codigo: 'GMP-8', codigo_fornecedor: '' },
];

function Tabela({ fornecedorId }) {
  const codigos = useCodigosDoFornecedor(fornecedorId);
  return <table><tbody>{ITENS.map((it) => <tr key={it.material_id}><CelulaCodigo item={it} codigos={codigos} /></tr>)}</tbody></table>;
}

let container; let root;
const tick = async () => { for (let i = 0; i < 4; i += 1) await act(async () => { await Promise.resolve(); }); };
const $ = (sel) => container.querySelector(sel);
async function render(fornecedorId) { await act(async () => { root.render(<Tabela fornecedorId={fornecedorId} />); }); await tick(); }

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockImplementation((url) => {
    const m = url.match(/^\/compras\/fornecedores\/(\d+)\/itens$/);
    return m ? Promise.resolve({ data: CATALOGO[m[1]] || [] }) : Promise.reject(new Error(`url inesperada ${url}`));
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); });

describe('codigo do fornecedor na celula Codigo — Etapa 213', () => {
  test('[RN-213.04] com fornecedor: Forn.: <codigo do catalogo> abaixo do GMP; material sem codigo nao ganha a linha', async () => {
    await render('1');
    expect(api.get).toHaveBeenCalledWith('/compras/fornecedores/1/itens');
    expect($('[data-testid="codigo-fornecedor-7"]').textContent).toBe('Forn.: 45879');
    expect(container.textContent).toContain('GMP-7');
    expect($('[data-testid="codigo-fornecedor-8"]')).toBeNull();
    expect(container.textContent).toContain('GMP-8');
  });

  test('[RN-213.04] trocar o fornecedor troca o codigo', async () => {
    await render('1');
    await render('2');
    expect($('[data-testid="codigo-fornecedor-7"]').textContent).toBe('Forn.: B-77');
  });

  test('[RN-213.04] sem fornecedor (ou o catalogo falhou): mostra o codigo gravado na linha', async () => {
    await render('');
    expect(api.get).not.toHaveBeenCalled();
    expect($('[data-testid="codigo-fornecedor-7"]').textContent).toBe('Forn.: GRAVADO-7');
    api.get.mockRejectedValueOnce(new Error('rede'));
    await render('9');
    expect($('[data-testid="codigo-fornecedor-7"]').textContent).toBe('Forn.: GRAVADO-7');
    expect(container.textContent).toContain('GMP-8');
  });
});
