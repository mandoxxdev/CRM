/**
 * Seletor de lote na movimentação de saída (Etapa 6 — Task 7).
 *
 * O backend (Tasks 5/6) já cria o lote no recebimento e devolve, por lote, `saldo`, `vencido`
 * (derivado de data_validade < hoje) e `elegivel` (ATIVO e não vencido, OU vencido com
 * `vencimento_liberado`). A lista chega em ordem FEFO — elegíveis primeiro, validade crescente.
 * Estes testes cobrem o que a tela de Movimentações faz com essa lista: sugerir o primeiro
 * elegível sem travar o operador nele, e não deixar selecionar um lote que o motor recusaria.
 *
 * Adaptação em relação ao brief: o teste original usa `@testing-library/react`
 * (render/screen/waitFor/fireEvent), que não está instalado neste projeto (só
 * eslint-plugin-testing-library, transitivo do react-scripts — não @testing-library/react em
 * si). Os testes já existentes deste diretório (Reservas/Inspeções/Movimentações) usam
 * createRoot + act + querySelector; este arquivo segue o mesmo padrão para não introduzir uma
 * dependência nova. Também segue a nota do brief: o form exige material e tipo SAÍDA
 * selecionados antes do campo de lote aparecer, então o teste faz esses passos primeiro (mesmo
 * fluxo de MovimentacoesAlmoxarifado.test.js: abrir o modal, preencher, disparar change).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/LoteSeletor --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas: o alvo aqui é o comportamento da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

jest.mock('./ExtratoMaterialModal', () => ({
  __esModule: true,
  default: () => null,
}));

const MATERIAL = { id: 1, codigo: 'M-1', nome: 'Chapa', unidade: 'KG', quantidade_atual: 55 };

// Mesmos três lotes do brief: dois elegíveis (CEDO vence antes de TARDE) e um REPROVADO — não
// elegível por status, não por vencimento.
const LOTES = [
  { id: 10, codigo: 'CEDO', data_validade: '2030-01-01', status: 'ATIVO', saldo: 40, vencido: false, elegivel: true },
  { id: 11, codigo: 'TARDE', data_validade: '2031-01-01', status: 'ATIVO', saldo: 10, vencido: false, elegivel: true },
  { id: 12, codigo: 'REPROVADO-1', data_validade: '2029-01-01', status: 'REPROVADO', saldo: 5, vencido: false, elegivel: false },
];

// Carry-forward desta task: um lote vencido COM liberação registrada é elegível (o motor aceita
// a saída) e um vencido SEM liberação não é. `disabled` tem que seguir `elegivel`, nunca
// `vencido` sozinho — senão a tela barra um lote que o backend aceitaria, ou libera um que não
// deveria.
const LOTES_VENCIMENTO = [
  { id: 20, codigo: 'VENC-LIBERADO', data_validade: '2020-01-01', status: 'ATIVO', saldo: 8, vencido: true, vencimento_liberado: true, elegivel: true },
  { id: 21, codigo: 'VENC-BLOQUEADO', data_validade: '2019-01-01', status: 'ATIVO', saldo: 3, vencido: true, vencimento_liberado: false, elegivel: false },
];

let container;
let root;
let lotesDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  lotesDoBanco = LOTES;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url.includes('/lotes')) return Promise.resolve({ data: lotesDoBanco });
    if (url === '/almoxarifado/materiais') return Promise.resolve({ data: [MATERIAL] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1 } });
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
    root.render(<MemoryRouter><MovimentacoesAlmoxarifado /></MemoryRouter>);
  });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

/** Um "tick" de macrotarefa: garante que a cadeia de microtarefas do fetch de lotes (a
 * chamada + o `.then` que chama setLotes/setForm) já rodou antes de checar o DOM. */
async function esperarEfeitos() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

/** Abre o modal, escolhe o material e o tipo SAÍDA — o campo de lote só existe depois disso
 * (nota do brief: adaptar o teste em vez de criar prop nova). Segue o setup de
 * MovimentacoesAlmoxarifado.test.js (createRoot + act, sem @testing-library/react). */
async function abrirComMaterialESaida() {
  await renderizar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

  const selectMaterial = container.querySelector('.almox-modal select.almox-form-select');
  preencher(selectMaterial, '1');
  const selectTipo = [...container.querySelectorAll('.almox-modal select.almox-form-select')][1];
  preencher(selectTipo, 'SAIDA');
  await esperarEfeitos();
}

function seletorLote() {
  return container.querySelector('#mov-lote');
}

function opcaoPorTexto(regex) {
  return [...seletorLote().querySelectorAll('option')].find((o) => regex.test(o.textContent));
}

describe('seletor de lote na saida', () => {
  test('o lote que vence primeiro vem pre-selecionado (FEFO como sugestao)', async () => {
    await abrirComMaterialESaida();
    const seletor = seletorLote();
    expect(seletor).not.toBeNull();
    expect(seletor.value).toBe('10');
  });

  test('lote nao elegivel aparece desabilitado, com o motivo', async () => {
    await abrirComMaterialESaida();
    const opcao = opcaoPorTexto(/REPROVADO-1/);
    expect(opcao.disabled).toBe(true);
    expect(opcao.textContent).toMatch(/reprovado/i);
  });

  test('o operador pode trocar o lote sugerido', async () => {
    await abrirComMaterialESaida();
    const seletor = seletorLote();
    preencher(seletor, '11');
    expect(seletor.value).toBe('11');
  });
});

describe('elegibilidade do lote vencido (carry-forward da Task 7)', () => {
  beforeEach(() => { lotesDoBanco = LOTES_VENCIMENTO; });

  test('lote vencido com liberacao registrada aparece selecionavel, nao desabilitado por vencido sozinho', async () => {
    await abrirComMaterialESaida();
    const opcao = opcaoPorTexto(/VENC-LIBERADO/);
    // Se o disabled seguisse `vencido` em vez de `elegivel`, este lote (elegivel:true) apareceria
    // barrado mesmo o motor aceitando a saida contra ele — a tela mentiria para o operador.
    expect(opcao.disabled).toBe(false);
    expect(opcao.textContent).toMatch(/vencido.*liberado/i);
  });

  test('lote vencido sem liberacao continua desabilitado, e o rotulo nao afirma liberacao que nao houve', async () => {
    await abrirComMaterialESaida();
    const opcao = opcaoPorTexto(/VENC-BLOQUEADO/);
    expect(opcao.disabled).toBe(true);
    expect(opcao.textContent).toMatch(/vencido/i);
    expect(opcao.textContent).not.toMatch(/liberado/i);
  });
});
