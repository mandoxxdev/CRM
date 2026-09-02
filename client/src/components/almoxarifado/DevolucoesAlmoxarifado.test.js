/**
 * Etapa 7, Task 7 — tela de devoluções.
 *
 * A rota POST /devolucoes existia desde sempre sem nenhuma tela: só era alcançável por chamada
 * direta à API. Estes testes cobrem as duas regras de UX que o design marca como essenciais — a
 * sugestão condição→destino (que existe SÓ na tela; o backend aceita qualquer combinação) e o
 * limite de quantidade pelo saldo devolvível da entrega escolhida — mais o caminho avulso, que é
 * o que impede a tela de travar quem devolve material sem registro de saída.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/DevolucoesAlmoxarifado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import DevolucoesAlmoxarifado from './DevolucoesAlmoxarifado';
import api from '../../services/api';

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

const MATERIAL = { id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', controle_lote: 0, controle_serie: 0 };
const MATERIAL_LOTE = { id: 11, codigo: 'MAT-2', nome: 'Perfil L', unidade: 'PC', controle_lote: 1, controle_serie: 0 };
const MATERIAL_SERIE = { id: 12, codigo: 'MAT-3', nome: 'Motor 5cv', unidade: 'PC', controle_lote: 0, controle_serie: 1 };

const SAIDA_COM_SALDO = {
  id: 501, tipo: 'SAIDA_PRODUCAO', quantidade: 10, quantidade_devolvida: 3, saldo_devolvivel: 7,
  created_at: '2026-08-10T10:00:00Z', lote_id: null, lote: null,
  requisicao_id: 77, requisicao_numero: 'REQ-77', os_id: null, projeto_id: null,
  usuario_nome: 'Maria', series: [],
};
const SAIDA_ZERADA = {
  id: 502, tipo: 'SAIDA', quantidade: 4, quantidade_devolvida: 4, saldo_devolvivel: 0,
  created_at: '2026-08-09T10:00:00Z', lote_id: null, lote: null,
  requisicao_id: null, requisicao_numero: null, os_id: null, projeto_id: null,
  usuario_nome: 'João', series: [],
};
const DEVOLUCOES = [{
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  quantidade: 3, motivo: 'SOBRA_PROJETO', condicao: 'BOA', destino: 'ESTOQUE',
  movimentacao_saida_id: 501, responsavel_nome: 'Maria', created_at: '2026-08-11T10:00:00Z',
}];

let container;
let root;
let saidasDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saidasDoBanco = [SAIDA_COM_SALDO, SAIDA_ZERADA];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL, MATERIAL_LOTE, MATERIAL_SERIE] });
    if (url === '/almoxarifado/devolucoes') return Promise.resolve({ data: DEVOLUCOES });
    if (url.startsWith('/almoxarifado/devolucoes/saidas-elegiveis')) return Promise.resolve({ data: saidasDoBanco });
    if (url.includes('/lotes')) {
      return Promise.resolve({ data: [{ id: 90, codigo: 'L-1', status: 'ATIVO', saldo: 12, elegivel: true }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 9 } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter><DevolucoesAlmoxarifado /></MemoryRouter>);
  });
}

async function esperarEfeitos() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function abrirModal() {
  await renderizar();
  await esperarEfeitos();
  const botao = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Devolução'));
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

const campo = (id) => container.querySelector(`#${id}`);

async function escolherMaterial(id) {
  preencher(campo('dev-material'), String(id));
  await esperarEfeitos();
}

describe('DevolucoesAlmoxarifado — lista', () => {
  test('lista as devoluções com material, destino e a saída de origem', async () => {
    await renderizar();
    await esperarEfeitos();
    const linha = container.querySelector('.almox-table tbody tr');
    expect(linha.textContent).toContain('MAT-1');
    expect(linha.textContent).toContain('Estoque');
    expect(linha.textContent).toContain('501');
  });
});

describe('DevolucoesAlmoxarifado — sugestão condição→destino', () => {
  test('Boa sugere Estoque, Suspeita sugere Quarentena, Danificada sugere Sucata', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);

    preencher(campo('dev-condicao'), 'BOA');
    expect(campo('dev-destino').value).toBe('ESTOQUE');
    preencher(campo('dev-condicao'), 'SUSPEITA');
    expect(campo('dev-destino').value).toBe('QUARENTENA');
    preencher(campo('dev-condicao'), 'DANIFICADA');
    expect(campo('dev-destino').value).toBe('SUCATA');
  });

  test('a sugestão não trava: o operador troca o destino e a condição não o desfaz', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-condicao'), 'DANIFICADA');
    preencher(campo('dev-destino'), 'RETRABALHO');
    expect(campo('dev-destino').value).toBe('RETRABALHO');
  });
});

describe('DevolucoesAlmoxarifado — saída de origem e limite de quantidade', () => {
  test('oferece as saídas do material e desabilita a já devolvida por inteiro', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    const opcoes = [...campo('dev-saida').querySelectorAll('option')];
    const zerada = opcoes.find((o) => o.value === '502');
    expect(opcoes.find((o) => o.value === '501').disabled).toBe(false);
    expect(zerada.disabled).toBe(true);
    expect(zerada.textContent).toMatch(/devolvid/i);
  });

  test('escolhida a saída, a quantidade fica limitada ao saldo devolvível', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-saida'), '501');
    expect(campo('dev-quantidade').getAttribute('max')).toBe('7');
  });

  test('quantidade acima do devolvível não chega a ser enviada', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-saida'), '501');
    preencher(campo('dev-quantidade'), '9');
    preencher(campo('dev-motivo'), 'SOBRA_PROJETO');
    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(api.post).not.toHaveBeenCalled();
  });

  test('devolução avulsa (sem saída) é permitida e não manda movimentacao_saida_id', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL.id);
    preencher(campo('dev-quantidade'), '2');
    preencher(campo('dev-motivo'), 'NAO_UTILIZADO');
    preencher(campo('dev-condicao'), 'BOA');
    const form = container.querySelector('.almox-modal form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });

    expect(api.post).toHaveBeenCalledWith('/almoxarifado/devolucoes', expect.objectContaining({
      material_id: 10, quantidade: 2, motivo: 'NAO_UTILIZADO', destino: 'ESTOQUE',
    }));
    expect(api.post.mock.calls[0][1]).not.toHaveProperty('movimentacao_saida_id');
  });
});

describe('DevolucoesAlmoxarifado — lote e série', () => {
  test('lote herdado da saída aparece em leitura, sem seletor', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, lote_id: 90, lote: 'L-1' }];
    await abrirModal();
    await escolherMaterial(MATERIAL_LOTE.id);
    preencher(campo('dev-saida'), '501');
    await esperarEfeitos();
    expect(container.querySelector('.almox-modal').textContent).toContain('L-1');
    expect(campo('dev-lote')).toBeNull();
  });

  test('sem lote a herdar, material com controle de lote ganha seletor', async () => {
    await abrirModal();
    await escolherMaterial(MATERIAL_LOTE.id);
    await esperarEfeitos();
    expect(campo('dev-lote')).not.toBeNull();
    expect([...campo('dev-lote').querySelectorAll('option')].map((o) => o.textContent).join(' ')).toContain('L-1');
  });

  test('material com série: checkboxes das séries entregues naquela saída', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, series: [{ id: 1, numero: 'SN-1', status: 'ENTREGUE' }, { id: 2, numero: 'SN-2', status: 'ENTREGUE' }] }];
    await abrirModal();
    await escolherMaterial(MATERIAL_SERIE.id);
    preencher(campo('dev-saida'), '501');
    await esperarEfeitos();
    const numeros = [...container.querySelectorAll('.almox-modal input[type="checkbox"]')].map((c) => c.value);
    expect(numeros).toEqual(['SN-1', 'SN-2']);
  });

  // Decisão 10: a tela EXPLICA o caminho de dois passos em vez de deixar o envio falhar.
  test('destino Sucata em material com série não oferece as séries e explica o caminho', async () => {
    saidasDoBanco = [{ ...SAIDA_COM_SALDO, series: [{ id: 1, numero: 'SN-1', status: 'ENTREGUE' }] }];
    await abrirModal();
    await escolherMaterial(MATERIAL_SERIE.id);
    preencher(campo('dev-saida'), '501');
    preencher(campo('dev-destino'), 'SUCATA');
    await esperarEfeitos();
    expect(container.querySelectorAll('.almox-modal input[type="checkbox"]')).toHaveLength(0);
    expect(container.querySelector('.almox-modal').textContent).toMatch(/Movimenta/);
  });
});
