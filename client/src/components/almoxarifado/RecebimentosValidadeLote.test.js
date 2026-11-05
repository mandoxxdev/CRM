/**
 * Etapa 194 (T2, RN-194.08) — a validade do lote no modal "Processar nota fiscal".
 *
 * Antes de processar, o servidor manda em cada item `avisos_validade_lote: string[]` (a prévia: a data
 * da nota diverge da do lote, o lote vai receber a da nota, a nota traz o mesmo lote com duas datas...).
 * A tela mostra cada aviso embaixo do material, sem travar o Confirmar. Depois de processar, cada
 * `avisos_validade` da resposta vira um toast.warn que NÃO some sozinho. Os textos vêm do servidor:
 * a tela repassa, não monta — as literais abaixo são as do contrato (lotService.MSG_VALIDADE).
 *
 * Molde: RecebimentosProcessarDestino.test.js (mock só na fronteira HTTP; URL inesperada rejeita).
 *
 * Executar:
 *   cd client && CI=true npx react-scripts test --watchAll=false \
 *     src/components/almoxarifado/RecebimentosValidadeLote.test.js
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RecebimentosAlmoxarifado from './RecebimentosAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';

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

// Literais do contrato (PREVIA_DIVERGENTE com o fim da Fase 2 item 5; PREVIA_DUAS_NA_NOTA; NOTA_DIVERGENTE;
// AVISO_PREENCHIDA da 190).
const PREVIA_DIVERGENTE = 'O lote L-77 já tem validade 31/03/2027, e a nota informa 30/06/2027. Ao processar, a validade do lote '
  + 'é mantida — confira a data da nota em Dados fiscais; se a do lote está errada, corrija-a em Lotes e Séries → "Corrigir validade".'
  + ' A etiqueta do recebimento sai com a data da nota — imprima a do lote em Lotes e Séries.';
const PREVIA_DUAS = 'Esta nota traz o lote L-77 com validades diferentes (31/03/2027, 30/06/2027). O lote fica com uma só — '
  + 'confira as datas em Dados fiscais antes de processar.';
const NOTA_DIVERGENTE = 'O lote L-77 já tinha validade 31/03/2027; a nota informou 30/06/2027. A validade do lote foi mantida — '
  + 'se a da nota é a certa, corrija-a em Lotes e Séries → "Corrigir validade".'
  + ' A etiqueta do recebimento sai com a data da nota — imprima a do lote em Lotes e Séries.';
const AVISO_PREENCHIDA = 'O lote L-88 não tinha validade; ela foi gravada agora (30/06/2030) e vale também para o saldo que já estava nele.';

const RECEBIMENTOS = [{
  id: 194, numero: 'REC-2026-194', nota_fiscal: 'NF-19400', pedido_compra_numero: null,
  fornecedor_nome: 'Aços Vale Ltda', status: 'ENCAMINHADO_FATURAMENTO', created_at: '2026-11-05T10:00:00Z',
}];

// 1941: dois avisos; 1942: lista vazia; 1943: servidor antigo, SEM o campo.
const ITENS = [
  { id: 1941, material_id: 41, material_codigo: 'ALM-0401', material_nome: 'Resina', unidade: 'L',
    quantidade_esperada: 10, quantidade_recebida: 10, entrada_estoque_em: null, lote: 'L-77',
    avisos_validade_lote: [PREVIA_DIVERGENTE, PREVIA_DUAS] },
  { id: 1942, material_id: 42, material_codigo: 'ALM-0402', material_nome: 'Catalisador', unidade: 'L',
    quantidade_esperada: 2, quantidade_recebida: 2, entrada_estoque_em: null, lote: null,
    avisos_validade_lote: [] },
  { id: 1943, material_id: 43, material_codigo: 'ALM-0403', material_nome: 'Solvente', unidade: 'L',
    quantidade_esperada: 3, quantidade_recebida: 3, entrada_estoque_em: null },
];

const DETALHE = {
  ...RECEBIMENTOS[0], fornecedor_cnpj: null, valor_total_nota: 1000, chave_nfe: null,
  nota_serie: '1', observacoes: null, contas_pagar_id: null, itens: ITENS,
};

let container; let root; let respostaProcessar;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  respostaProcessar = { success: true, status: 'PROCESSADO', contas_pagar_id: 77 };
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/recebimentos') return Promise.resolve({ data: RECEBIMENTOS });
    if (url === '/almoxarifado/recebimentos/194') return Promise.resolve({ data: DETALHE });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/pedidos-compra') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/recebimentos-aux/fornecedores') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/anexos') return Promise.resolve({ data: [] });
    if (url === '/almoxarifado/localizacoes') return Promise.resolve({ data: [] });
    if (/^\/almoxarifado\/materiais\/\d+\/sugestao-localizacao$/.test(url)) {
      // com padrão: nenhum aviso-padrao, para o modal só ter os avisos de validade
      return Promise.resolve({ data: { padrao: { localizacao_id: 1, codigo: 'A-01', recusa: null, inativa: false }, sugestoes: [] } });
    }
    return Promise.reject(new Error(`URL inesperada no teste: ${url}`));
  });
  api.post.mockImplementation((url) => (url === '/almoxarifado/recebimentos/194/processar'
    ? Promise.resolve({ data: respostaProcessar })
    : Promise.reject(new Error(`POST inesperado no teste: ${url}`))));
  api.put.mockImplementation(() => Promise.resolve({ data: { success: true } }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

const esperarEfeitos = async () => { await act(async () => { await new Promise((r) => setTimeout(r, 0)); }); };
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));
const modal = () => container.querySelector('[data-testid="modal-processar"]');
const avisosDo = (itemId) => [...container.querySelectorAll(`[data-testid="aviso-validade-${itemId}"]`)]
  .map((d) => d.textContent);
const confirmar = () => container.querySelector('[data-testid="confirmar-processar"]');

async function abrirModal() {
  await act(async () => {
    root.render(<MemoryRouter><RecebimentosAlmoxarifado /></MemoryRouter>);
  });
  await esperarEfeitos();
  const linha = [...container.querySelectorAll('.almox-table tbody tr')]
    .find((tr) => tr.textContent.includes('REC-2026-194'));
  await clicar(linha);
  await clicar(botaoPorTexto('Processar Nota'));
  await esperarEfeitos();
}

describe('[RN-194.08] validade do lote no modal Processar', () => {
  test('(i) dois avisos da prévia aparecem embaixo do material, um div por aviso, e o Confirmar segue habilitado', async () => {
    await abrirModal();
    expect(modal()).not.toBeNull();
    expect(avisosDo(1941)).toEqual([PREVIA_DIVERGENTE, PREVIA_DUAS]);
    // embaixo do MATERIAL: no mesmo <td> do código/nome
    const td = container.querySelector('[data-testid="processar-item-1941"] td');
    expect(td.textContent).toContain('ALM-0401');
    expect(td.querySelectorAll('[data-testid="aviso-validade-1941"]')).toHaveLength(2);
    expect(confirmar().disabled).toBe(false);
  });

  test('(ii) item com lista vazia e item sem o campo (servidor antigo) não mostram aviso', async () => {
    await abrirModal();
    expect(avisosDo(1941)).toHaveLength(2);           // metade positiva no mesmo cenário
    expect(avisosDo(1942)).toEqual([]);
    expect(avisosDo(1943)).toEqual([]);
    expect(container.querySelector('[data-testid="processar-item-1943"]')).not.toBeNull();
    expect(container.querySelectorAll('[data-testid^="aviso-validade-"]')).toHaveLength(2);
  });

  test('(iii) avisos_validade da resposta viram toast.warn persistentes, em ordem, depois do sucesso', async () => {
    respostaProcessar = { success: true, status: 'PROCESSADO', contas_pagar_id: 77,
      avisos_validade: [NOTA_DIVERGENTE, AVISO_PREENCHIDA] };
    await abrirModal();
    await clicar(confirmar());
    expect(toast.success).toHaveBeenCalledWith('Nota processada — estoque atualizado e conta a pagar gerada!');
    expect(toast.warn).toHaveBeenCalledTimes(2);
    expect(toast.warn).toHaveBeenNthCalledWith(1, NOTA_DIVERGENTE, { autoClose: false });
    expect(toast.warn).toHaveBeenNthCalledWith(2, AVISO_PREENCHIDA, { autoClose: false });
    const ordemSucesso = toast.success.mock.invocationCallOrder[0];
    expect(toast.warn.mock.invocationCallOrder.every((o) => o > ordemSucesso)).toBe(true);
  });

  test('(iv) resposta sem avisos_validade: só o sucesso, nenhum toast.warn', async () => {
    await abrirModal();
    await clicar(confirmar());
    expect(toast.success).toHaveBeenCalledTimes(1);
    expect(toast.warn).not.toHaveBeenCalled();
  });
});
