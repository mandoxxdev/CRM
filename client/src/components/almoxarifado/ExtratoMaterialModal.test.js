/**
 * Selo de propriedade no extrato do material (Etapa 8, Task 9).
 *
 * O extrato é a tela onde se decide o que fazer com o saldo (movimentar, reservar, requisitar).
 * `GET /materiais/:id/extrato` é leitura por id — classe B da auditoria da Task 1, NÃO filtra o
 * dono de propósito, senão o extrato do material de cliente viria vazio. A contrapartida de não
 * filtrar é dizer de quem é: sem o selo, o extrato da chapa do cliente é idêntico ao da nossa.
 *
 * As duas metades andam juntas: só exigir a presença do selo seria aprovado por uma implementação
 * que o pinta em todo material.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/ExtratoMaterialModal --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ExtratoMaterialModal from './ExtratoMaterialModal';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const MATERIAL_BASE = {
  id: 5, codigo: 'CHP-005', nome: 'Chapa 3mm', categoria: 'Chapas', unidade: 'PC',
  quantidade_atual: 40, quantidade_reservada: 0, quantidade_bloqueada: 0,
  quantidade_em_inspecao: 0, quantidade_disponivel: 40, custo_medio: 25,
  controle_serie: 0, controle_lote: 0,
};

let container;
let root;
const fechar = () => {};

function mockExtrato(material) {
  api.get.mockImplementation((url) => {
    if (url === `/almoxarifado/materiais/${material.id}/extrato`) {
      return Promise.resolve({
        data: { material, saldos_localizacao: [], movimentacoes: [], reservas: [] },
      });
    }
    return Promise.resolve({ data: [] });
  });
}

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

async function renderizar(material) {
  mockExtrato(material);
  await act(async () => {
    root.render(<ExtratoMaterialModal materialId={material.id} onClose={fechar} />);
  });
}

describe('ExtratoMaterialModal — selo de propriedade', () => {
  test('extrato de material de cliente mostra o selo com a razão social', async () => {
    await renderizar({ ...MATERIAL_BASE, proprietario_cliente_id: 7, proprietario_cliente_nome: 'Cliente Alfa LTDA' });
    const selo = container.querySelector('.almox-badge-cliente');
    expect(selo).not.toBeNull();
    expect(selo.textContent).toContain('Cliente Alfa LTDA');
  });

  test('[controle positivo] extrato de material nosso não mostra selo', async () => {
    await renderizar({ ...MATERIAL_BASE, proprietario_cliente_id: null, proprietario_cliente_nome: null });
    expect(container.querySelector('.almox-badge-cliente')).toBeNull();
  });
});

/**
 * Etapa 66, RN-08 — o extrato mostrava só `motivo`; bloqueio, inventário e estorno guardam o
 * porquê em `justificativa`, que ficava escondida. Aparece abaixo quando existe e difere do
 * motivo; igual não repete.
 */
describe('ExtratoMaterialModal — justificativa no histórico (Etapa 66, RN-08)', () => {
  async function renderizarCom(movimentacoes) {
    api.get.mockImplementation((url) => {
      if (url === `/almoxarifado/materiais/${MATERIAL_BASE.id}/extrato`) {
        return Promise.resolve({
          data: { material: MATERIAL_BASE, saldos_localizacao: [], movimentacoes, reservas: [] },
        });
      }
      return Promise.resolve({ data: [] });
    });
    await act(async () => {
      root.render(<ExtratoMaterialModal materialId={MATERIAL_BASE.id} onClose={fechar} />);
    });
  }
  const mov = (over) => ({
    id: 1, tipo: 'BLOQUEIO', quantidade: 3, saldo_anterior: 40, saldo_posterior: 40,
    created_at: '2026-10-01T10:00:00Z', cancelado: 0, ...over,
  });
  const contar = (txt) => (container.querySelector('.almox-table').textContent.split(txt).length - 1);

  test('mostra a justificativa diferente do motivo', async () => {
    await renderizarCom([mov({ motivo: 'Bloqueio', justificativa: 'lote com ferrugem' })]);
    expect(contar('Bloqueio')).toBe(1);
    expect(contar('lote com ferrugem')).toBe(1);
  });

  test('não repete quando a justificativa é igual ao motivo', async () => {
    await renderizarCom([mov({ tipo: 'AJUSTE', motivo: 'contagem', justificativa: 'contagem' })]);
    expect(contar('contagem')).toBe(1);
  });
});

/**
 * Etapa 222 (C481, 1a parte; RN-222.08, B1477) — o extrato diz quanto esta em lote bloqueado, reprovado ou vencido: um cartao
 * "Em lote impedido" e uma frase, so quando `lote_impedido > 0`. O cartao Disponivel continua com o numero do servidor.
 */
describe('[RN-222.08] ExtratoMaterialModal — o lote impedido', () => {
  const FRASE_6_PC = '6 PC em lote bloqueado, reprovado ou vencido, fora o que já aparece em Bloqueado: essas peças não saem para uso até o lote ser liberado na tela Lotes e Séries.';
  const cartaoImpedido = () => container.querySelector('.almox-extrato-lote-impedido');
  const valorDoCartao = (rotulo) => {
    const card = [...container.querySelectorAll('.almox-kpi-card')]
      .find((c) => c.querySelector('.almox-kpi-label')?.textContent === rotulo);
    return card ? card.querySelector('.almox-kpi-value').textContent : null;
  };

  test('[RN-222.08] lote_impedido 6: o cartão com 6, a frase literal, e o Disponível igual ao do servidor', async () => {
    await renderizar({ ...MATERIAL_BASE, controle_lote: 1, quantidade_disponivel: 10, lote_impedido: 6 });
    expect(cartaoImpedido()).not.toBeNull();
    expect(valorDoCartao('Em lote impedido')).toBe('6');
    expect(container.textContent).toContain(FRASE_6_PC);
    expect(valorDoCartao('Disponível')).toBe('10');
  });

  test('[RN-222.11] (Fase 2) impedido maior que o Disponível: os dois números, e a frase não diz que o Disponível o contém', async () => {
    await renderizar({ ...MATERIAL_BASE, controle_lote: 1, quantidade_reservada: 8, quantidade_disponivel: 2, lote_impedido: 10 });
    expect(valorDoCartao('Disponível')).toBe('2');
    expect(valorDoCartao('Em lote impedido')).toBe('10');
    expect(container.textContent).toContain('10 PC em lote bloqueado, reprovado ou vencido, fora o que já aparece em Bloqueado:');
    expect(container.textContent).not.toContain('o Disponível ainda conta');
  });

  test('[RN-222.08] (Fase 2) o cartão novo não usa o ícone de perigo do Bloqueado', async () => {
    await renderizar({ ...MATERIAL_BASE, controle_lote: 1, lote_impedido: 6 });
    expect(cartaoImpedido().querySelector('.almox-kpi-icon.danger')).toBeNull();
    expect(cartaoImpedido().querySelector('.almox-kpi-icon.warning')).not.toBeNull();
  });

  test('[RN-222.08 b] (Fase 5) material sem unidade: a frase sem a unidade e sem espaço duplo', async () => {
    await renderizar({ ...MATERIAL_BASE, controle_lote: 1, unidade: null, lote_impedido: 6 });
    expect(container.textContent).toContain('6 em lote bloqueado, reprovado ou vencido, fora');
    expect(container.textContent).not.toContain('null em lote');
  });

  test('[RN-222.08] fracionado: o número como o servidor mandou', async () => {
    await renderizar({ ...MATERIAL_BASE, controle_lote: 1, unidade: 'KG', lote_impedido: 2.5 });
    expect(valorDoCartao('Em lote impedido')).toBe('2.5');
    expect(container.textContent).toContain('2.5 KG em lote bloqueado, reprovado ou vencido,');
  });

  test('[RN-222.08] [controle positivo] lote_impedido 0 ou ausente: nem cartão nem frase', async () => {
    await renderizar({ ...MATERIAL_BASE, controle_lote: 1, lote_impedido: 0 });
    expect(cartaoImpedido()).toBeNull();
    expect(valorDoCartao('Em lote impedido')).toBeNull();
    expect(container.textContent).not.toContain('em lote bloqueado, reprovado ou vencido');
    act(() => root.unmount());
    root = createRoot(container);
    await renderizar({ ...MATERIAL_BASE });
    expect(cartaoImpedido()).toBeNull();
    expect(container.textContent).not.toContain('em lote bloqueado, reprovado ou vencido');
    expect(valorDoCartao('Disponível')).toBe('40');
  });
});

/**
 * Etapa 224 (C528; RN-224.08, B1486) — a tabela "Saldos por localizacao" diz QUAL lote esta impedido: ao lado do codigo, so nas linhas
 * com `lote_esta_impedido === true`, as partes que valem (Bloqueado, Reprovado, Vencido em dd/mm/aaaa ou Validade a corrigir), por " · ".
 */
describe('[RN-224.08] ExtratoMaterialModal — qual lote está impedido', () => {
  const DICA = 'Este lote não sai para uso até ser liberado na tela Lotes e Séries.';
  const linha = (id, lote, extra = {}) => ({ id, material_id: 5, localizacao_id: 1, localizacao_codigo: 'Z-01', quantidade: 6,
    lote_id: lote ? id : null, lote, ...extra });
  async function renderizarSaldos(saldos) {
    const material = { ...MATERIAL_BASE, controle_lote: 1 };
    api.get.mockImplementation((url) => (url === `/almoxarifado/materiais/${material.id}/extrato`
      ? Promise.resolve({ data: { material, saldos_localizacao: saldos, movimentacoes: [], reservas: [] } })
      : Promise.resolve({ data: [] })));
    await act(async () => { root.render(<ExtratoMaterialModal materialId={material.id} onClose={fechar} />); });
  }
  const linhas = () => [...container.querySelectorAll('tr')].filter((tr) => tr.querySelector('td'));
  const doLote = (codigo) => linhas().find((tr) => tr.children[1]?.textContent.startsWith(codigo));
  const selo = (tr) => tr.querySelector('.almox-extrato-lote-situacao');

  test('[RN-224.08] as palavras de cada situação, ao lado do código, com a dica', async () => {
    await renderizarSaldos([
      linha(1, 'L1', { lote_status: 'ATIVO', lote_esta_impedido: false, lote_vencido_sem_liberacao: false }),
      linha(2, 'L2', { lote_status: 'BLOQUEADO', lote_esta_impedido: true, lote_vencido_sem_liberacao: false }),
      linha(3, 'L3', { lote_status: 'REPROVADO', lote_esta_impedido: true, lote_vencido_sem_liberacao: false }),
      linha(4, 'L4', { lote_status: 'ATIVO', lote_validade: '2026-11-12', lote_esta_impedido: true, lote_vencido_sem_liberacao: true }),
      linha(5, 'L5', { lote_status: 'BLOQUEADO', lote_validade: '2026-11-12 00:00:00', lote_esta_impedido: true, lote_vencido_sem_liberacao: true }),
      linha(6, 'L6', { lote_status: 'ATIVO', lote_validade: '31/03/2027', lote_esta_impedido: true, lote_vencido_sem_liberacao: true }),
      linha(7, 'L7', { lote_status: 'X', lote_esta_impedido: true, lote_vencido_sem_liberacao: false }),
    ]);
    expect(selo(doLote('L1'))).toBeNull();
    expect(selo(doLote('L2')).textContent).toBe('Bloqueado');
    expect(selo(doLote('L3')).textContent).toBe('Reprovado');
    expect(selo(doLote('L4')).textContent).toBe('Vencido em 12/11/2026');
    expect(selo(doLote('L5')).textContent).toBe('Bloqueado · Vencido em 12/11/2026');
    expect(selo(doLote('L6')).textContent).toBe('Validade a corrigir: 31/03/2027');
    expect(selo(doLote('L7')).textContent).toBe('Impedido');
    expect(selo(doLote('L2')).getAttribute('title')).toBe(DICA);
    expect(doLote('L2').children[1].textContent.startsWith('L2')).toBe(true);
    expect(doLote('L2').children[2].textContent).toBe('6 PC');
  });

  test('[RN-224.08] [controle positivo] sem lote_esta_impedido === true, nenhum selo; sem lote, o traço de sempre', async () => {
    await renderizarSaldos([
      linha(1, 'L1', { lote_status: 'BLOQUEADO' }),
      linha(2, 'L2', { lote_status: 'BLOQUEADO', lote_esta_impedido: 1, lote_vencido_sem_liberacao: false }),
      linha(3, 'L3', { lote_status: 'ATIVO', lote_validade: '2026-11-12', lote_esta_impedido: false, lote_vencido_sem_liberacao: false }),
      linha(4, null, { lote_status: null, lote_esta_impedido: false, lote_vencido_sem_liberacao: false }),
    ]);
    expect(container.querySelectorAll('.almox-extrato-lote-situacao').length).toBe(0);
    expect(linhas().find((tr) => tr.children[1]?.textContent === '—')).toBeTruthy();
    expect(container.textContent).not.toContain('Vencido em');
  });
});
