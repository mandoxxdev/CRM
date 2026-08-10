/**
 * Livro de movimentações — quais linhas oferecem o botão de estorno.
 *
 * Achado do review final da Etapa 5: `podeEstornar` só excluía ESTORNO/RESERVA/LIBERACAO_RESERVA,
 * então o botão aparecia HABILITADO nas linhas de quarentena/inspeção. Não é cosmético: antes da
 * correção do servidor, clicar nele gravava uma linha ESTORNO e marcava a original cancelada SEM
 * reverter `quantidade_em_inspecao` — o livro afirmava uma reversão que nunca aconteceu. Com o
 * servidor recusando, o botão só entregaria um 400. Nos dois casos a tela não pode oferecê-lo.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado --watchAll=false
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

// Permissões liberadas: o alvo aqui é a regra da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

jest.mock('./ExtratoMaterialModal', () => ({
  __esModule: true,
  default: () => null,
}));

const movimento = (id, tipo) => ({
  id, tipo, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', unidade: 'PC',
  quantidade: 10, saldo_anterior: 100, saldo_posterior: tipo === 'SAIDA' ? 90 : 100,
  usuario_nome: 'Maria', created_at: '2026-08-08T10:00:00Z', cancelado: 0,
});

// Uma linha de cada tipo cujo estorno o servidor recusa, mais uma SAIDA de controle: sem ela o
// teste passaria com um `podeEstornar` que devolvesse false para tudo.
const MOVIMENTOS = [
  movimento(1, 'SAIDA'),
  movimento(2, 'QUARENTENA'),
  movimento(3, 'LIBERACAO_INSPECAO'),
  movimento(4, 'REPROVACAO_INSPECAO'),
  movimento(5, 'DECISAO_INSPECAO'),
  movimento(6, 'RESERVA'),
  movimento(7, 'LIBERACAO_RESERVA'),
  { ...movimento(8, 'ESTORNO'), quantidade: 10 },
];

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/movimentacoes') return Promise.resolve({ data: MOVIMENTOS });
    if (url === '/almoxarifado/materiais') {
      return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC' }] });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true } });
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

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];

/** Índice da linha (na ordem de MOVIMENTOS) tem botão de estorno? */
const temBotaoEstorno = (i) => !!linhas()[i]
  .querySelector('.almox-btn-icon.danger');

describe('MovimentacoesAlmoxarifado — botão de estorno por tipo', () => {
  test('oferece estorno numa SAIDA comum', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(MOVIMENTOS.length);
    expect(temBotaoEstorno(0)).toBe(true);
  });

  test('não oferece estorno nos tipos de quarentena/inspeção (reversão é pela tela de Inspeções)', async () => {
    await renderizar();
    // índices 1..4 = QUARENTENA, LIBERACAO_INSPECAO, REPROVACAO_INSPECAO, DECISAO_INSPECAO
    [1, 2, 3, 4].forEach((i) => {
      expect(`${MOVIMENTOS[i].tipo}: ${temBotaoEstorno(i)}`).toBe(`${MOVIMENTOS[i].tipo}: false`);
    });
  });

  test('continua sem oferecer estorno em reserva e em estorno', async () => {
    await renderizar();
    [5, 6, 7].forEach((i) => {
      expect(`${MOVIMENTOS[i].tipo}: ${temBotaoEstorno(i)}`).toBe(`${MOVIMENTOS[i].tipo}: false`);
    });
  });
});

/**
 * Task 9 (Etapa 6): SUCATA e PERDA foram isentas da guarda de vencimento na Task 3 para que
 * material vencido pudesse ser descartado, mas até aqui nenhuma das duas era selecionável no
 * formulário — a regra "vencido não fica preso" era verdadeira da API e falsa da tela.
 */
async function abrirModalNovaMovimentacao() {
  await renderizar();
  const botaoNova = [...container.querySelectorAll('.almox-header-actions button')]
    .find((b) => b.textContent.includes('Nova Movimentação'));
  await act(async () => { botaoNova.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

/** Um "tick" de macrotarefa: garante que a busca de lotes (efeito assíncrono) já rodou. */
async function esperarEfeitos() {
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

function seletorTipo() {
  return [...container.querySelectorAll('.almox-modal select.almox-form-select')][1];
}

describe('MovimentacoesAlmoxarifado — SUCATA e PERDA no seletor de tipo', () => {
  test('SUCATA e PERDA aparecem como opção no seletor de tipo', async () => {
    await abrirModalNovaMovimentacao();
    const valores = [...seletorTipo().querySelectorAll('option')].map((o) => o.value);
    expect(valores).toEqual(expect.arrayContaining(['SUCATA', 'PERDA']));
  });

  test('AJUSTE_NEGATIVO não é oferecido (é tipo interno; AJUSTE puro cobre a correção de contagem)', async () => {
    await abrirModalNovaMovimentacao();
    const valores = [...seletorTipo().querySelectorAll('option')].map((o) => o.value);
    expect(valores).not.toContain('AJUSTE_NEGATIVO');
  });

  test('Sucata mostra os campos que uma saída precisa: localização de origem e lote por seleção (não texto livre)', async () => {
    await abrirModalNovaMovimentacao();
    const selectMaterial = container.querySelector('.almox-modal select.almox-form-select');
    preencher(selectMaterial, '10');
    preencher(seletorTipo(), 'SUCATA');
    await esperarEfeitos();

    const rotulos = [...container.querySelectorAll('.almox-modal .almox-field label')].map((l) => l.textContent);
    expect(rotulos).toEqual(expect.arrayContaining(['Localização de origem']));

    const campoLote = container.querySelector('#mov-lote');
    expect(campoLote.tagName).toBe('SELECT'); // não input de texto — motor não inventa lote numa saída
  });

  test('Perda também exige motivo (é o campo que carrega a justificativa da baixa)', async () => {
    await abrirModalNovaMovimentacao();
    preencher(seletorTipo(), 'PERDA');
    const rotuloMotivo = [...container.querySelectorAll('.almox-modal .almox-field label')]
      .find((l) => l.textContent.startsWith('Motivo'));
    expect(rotuloMotivo.textContent).toContain('*');
  });
});
