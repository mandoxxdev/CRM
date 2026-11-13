/**
 * Etapa 226 (D (224); B1492 a B1496) — o "Sai de" da separação e da entrega diz qual lote está impedido (bloqueado, reprovado ou vencido),
 * desabilita a opção (menos a planejada do próprio item), a separação não pré-seleciona lote impedido e uma frase avisa quando a opção
 * escolhida está impedida. Só tela: os campos do lote vêm na linha de saldo desde a 224 (B1484). Mock só na fronteira HTTP.
 *
 * Plano: docs/superpowers/plans/2026-11-13-almoxarifado-etapa226-sai-de-lote-impedido.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSaiDeLoteImpedido --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList, { valorSugeridoNaSeparacao } from './RequisicoesList';
import { situacaoDoLote as doExtrato } from './ExtratoMaterialModal';
import { situacaoDoLote as doUtil } from '../../utils/situacaoDoLote';
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
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));
jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const ITEM_BASE = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 5,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
};
const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-11-13T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
const APROVADA = {
  ...REQ_BASE, status: 'APROVADO',
  itens: [{ ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0 }],
};
// Já separou 1 de Z-02/L2 (a planejada): faltam 4.
const EM_SEPARACAO = {
  ...REQ_BASE, status: 'EM_SEPARACAO',
  itens: [{ ...ITEM_BASE, origem_separacao_id: 4, lote_separacao_id: 12, origem_separacao_codigo: 'Z-02', lote_separacao_codigo: 'L2',
    quantidade_origem_separacao: 1, quantidade_separada: 1, quantidade_entregue: 0, quantidade_atendida: 0 }],
};
// Separou 5 (3 de Z-02/L2), entregou 2: entrega 3, toda da planejada.
const PARCIAL_PLANEJADA = {
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{ ...ITEM_BASE, origem_separacao_id: 4, lote_separacao_id: 12, origem_separacao_codigo: 'Z-02', lote_separacao_codigo: 'L2',
    quantidade_origem_separacao: 3, quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2, quantidade_entregavel: 3 }],
};
const PARCIAL = {
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{ ...ITEM_BASE, quantidade_separada: 5, quantidade_entregue: 2, quantidade_atendida: 2, quantidade_entregavel: 3 }],
};

const BOM = { lote_status: 'ATIVO', lote_validade: null, lote_vencimento_liberado_em: null, lote_esta_impedido: false,
  lote_vencido_sem_liberacao: false };
const SEM_LOTE = { lote_status: null, lote_validade: null, lote_vencimento_liberado_em: null, lote_esta_impedido: false,
  lote_vencido_sem_liberacao: false };
const linha = (extra) => ({ material_id: 10, separado_outras: 0, lote_livre: null, lote_bloqueado: null, lote_inspecao: null, ...extra });
const A01 = linha({ id: 1, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10, sobra: 10, ...SEM_LOTE });
const XB01 = linha({ id: 2, localizacao_id: 2, localizacao_codigo: 'XB-01', lote_id: 7, lote: 'L1', quantidade: 4, sobra: 4, ...BOM });
const Z02 = (extra = {}) => linha({ id: 3, localizacao_id: 4, localizacao_codigo: 'Z-02', lote_id: 12, lote: 'L2', quantidade: 6, sobra: 6,
  ...BOM, lote_status: 'BLOQUEADO', lote_esta_impedido: true, ...extra });
const Z03 = linha({ id: 5, localizacao_id: 5, localizacao_codigo: 'Z-03', lote_id: 13, lote: 'L3', quantidade: 2, sobra: 2,
  ...BOM, lote_status: 'REPROVADO', lote_esta_impedido: true });
const SALDOS = [A01, XB01, Z02()];
const semCampos = (r) => {
  const { lote_status: _a, lote_validade: _b, lote_vencimento_liberado_em: _c, lote_esta_impedido: _d, lote_vencido_sem_liberacao: _e,
    ...resto } = r;
  return resto;
};

let container;
let root;
let requisicao;
let saldos;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = SALDOS;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, separacoes, ...lin } = requisicao;
      return Promise.resolve({ data: [lin] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') return Promise.resolve({ data: saldos });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { parcial: true } });
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
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}>
        <RequisicoesList />
      </MemoryRouter>
    );
  });
}
const botaoPorTexto = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => { await act(async () => { botaoPorTexto(texto).click(); }); };
const escolher = (select, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => { setter.call(select, valor); select.dispatchEvent(new Event('change', { bubbles: true })); });
};
const selectSeparacao = () => container.querySelector('#separacao-origem-1');
const selectEntrega = () => container.querySelector('#entrega-origem-1');
const textos = (select) => [...select.options].map((o) => o.textContent);
const desabilitadas = (select) => [...select.options].filter((o) => o.disabled).map((o) => o.value);
const FRASE_L2 = 'Lote L2: Bloqueado. Nada sai dele até o lote ser liberado na tela Lotes e Séries — escolha outro endereço.';
const FRASE_PLANEJADA_L2 = 'Já separado de Z-02 — lote L2: Bloqueado. Essa parte não sai até o lote ser liberado na tela Lotes e Séries — '
  + 'na entrega, escolha outro endereço.';

describe('Etapa 226: o "Sai de" diz qual lote está impedido', () => {
  test('[RN-226.01] separação: o lote bloqueado diz "Bloqueado: não sai"; os outros como hoje', async () => {
    requisicao = APROVADA;
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)', 'A-01 (10)', 'XB-01 — lote L1 (4)', 'Z-02 — lote L2 (6) — Bloqueado: não sai',
    ]);
  });

  test('[RN-226.02] as palavras são as do extrato (reprovado, vencido, os dois, validade a corrigir, impedido)', async () => {
    requisicao = APROVADA;
    saldos = [
      Z02({ lote_status: 'REPROVADO' }),
      linha({ id: 6, localizacao_id: 6, localizacao_codigo: 'V-01', lote_id: 14, lote: 'L4', quantidade: 1, sobra: 1, ...BOM,
        lote_validade: '2026-11-10', lote_esta_impedido: true, lote_vencido_sem_liberacao: true }),
      linha({ id: 7, localizacao_id: 7, localizacao_codigo: 'V-02', lote_id: 15, lote: 'L5', quantidade: 1, sobra: 1, ...BOM,
        lote_status: 'BLOQUEADO', lote_validade: '2026-11-10 00:00:00', lote_esta_impedido: true, lote_vencido_sem_liberacao: true }),
      linha({ id: 8, localizacao_id: 8, localizacao_codigo: 'V-03', lote_id: 16, lote: 'L6', quantidade: 1, sobra: 1, ...BOM,
        lote_validade: '31/03/2027', lote_esta_impedido: true, lote_vencido_sem_liberacao: true }),
      linha({ id: 9, localizacao_id: 9, localizacao_codigo: 'V-04', lote_id: 17, lote: 'L7', quantidade: 1, sobra: 1, ...BOM,
        lote_status: 'X', lote_esta_impedido: true }),
    ];
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao()).slice(1)).toEqual([
      'Z-02 — lote L2 (6) — Reprovado: não sai',
      'V-01 — lote L4 (1) — Vencido em 10/11/2026: não sai',
      'V-02 — lote L5 (1) — Bloqueado · Vencido em 10/11/2026: não sai',
      'V-03 — lote L6 (1) — Validade a corrigir: 31/03/2027: não sai',
      'V-04 — lote L7 (1) — Impedido: não sai',
    ]);
  });

  test('[RN-226.03] o sufixo da 218 sai da linha impedida e fica na boa; a sobra fica', async () => {
    requisicao = APROVADA;
    saldos = [
      { ...XB01, lote_livre: 3, lote_bloqueado: 1, lote_inspecao: 0 },
      Z02({ lote_livre: 3, lote_bloqueado: 1, lote_inspecao: 0, separado_outras: 1, sobra: 5 }),
    ];
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao()).slice(1)).toEqual([
      'XB-01 — lote L1 (4) — do lote podem sair 3 (1 bloqueada)',
      'Z-02 — lote L2 (sobra 5 de 6; 1 para outras) — Bloqueado: não sai',
    ]);
  });

  test('[RN-226.04] servidor sem os campos, ou lote_esta_impedido não true: o rótulo de hoje e nada desabilitado', async () => {
    requisicao = APROVADA;
    saldos = [semCampos(A01), semCampos(XB01), semCampos(Z02()), Z02({ id: 11, localizacao_id: 11, localizacao_codigo: 'Z-11',
      lote_esta_impedido: 'true' }), Z02({ id: 12, localizacao_id: 12, localizacao_codigo: 'Z-12', lote_esta_impedido: 1 })];
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textos(selectSeparacao())).toEqual([
      'Qualquer endereço (automático)', 'A-01 (10)', 'XB-01 — lote L1 (4)', 'Z-02 — lote L2 (6)', 'Z-11 — lote L2 (6)', 'Z-12 — lote L2 (6)',
    ]);
    expect(desabilitadas(selectSeparacao())).toEqual([]);
  });

  test('[RN-226.05] separação e entrega: a opção impedida vem desabilitada; as boas não', async () => {
    requisicao = APROVADA;
    await renderizar();
    await clicar('Iniciar Separação');
    expect(desabilitadas(selectSeparacao())).toEqual(['4:12']);
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = PARCIAL;
    await renderizar();
    await clicar('Completar Entrega');
    expect(textos(selectEntrega())).toEqual([
      'Qualquer endereço (automático)', 'A-01 (10)', 'XB-01 — lote L1 (4)', 'Z-02 — lote L2 (6) — Bloqueado: não sai',
    ]);
    expect(desabilitadas(selectEntrega())).toEqual(['4:12']);
  });

  test('[RN-226.06] entrega: a planejada impedida do próprio item fica habilitada; outra impedida não', async () => {
    requisicao = PARCIAL_PLANEJADA;
    saldos = [A01, Z02(), Z03];
    await renderizar();
    await clicar('Completar Entrega');
    expect(textos(selectEntrega())).toContain('Z-02 — lote L2 (6) — Bloqueado: não sai');
    expect(desabilitadas(selectEntrega())).toEqual(['5:13']);
  });

  test('[RN-226.06, Fase 2 I1] separação: a planejada impedida também vem desabilitada', async () => {
    requisicao = EM_SEPARACAO;
    saldos = [A01, Z02(), Z03];
    await renderizar();
    await clicar('Ajustar Separação');
    expect(desabilitadas(selectSeparacao())).toEqual(['4:12', '5:13']);
  });

  test('[RN-226.12, Fase 2 I2] entrega acima da parte planejada (sem escolha nem automático): a frase da planejada impedida', async () => {
    requisicao = { ...PARCIAL_PLANEJADA, itens: [{ ...PARCIAL_PLANEJADA.itens[0], quantidade_origem_separacao: 1 }] };
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('');
    expect(container.querySelector('#entrega-dica-lote-impedido-1').textContent).toBe(FRASE_PLANEJADA_L2);
    escolher(selectEntrega(), '1:');
    expect(container.querySelector('#entrega-dica-lote-impedido-1')).toBeNull();
    escolher(selectEntrega(), '');
    expect(container.querySelector('#entrega-dica-lote-impedido-1')).toBeNull();
  });

  test('[RN-226.07] separação não pré-seleciona a planejada impedida; a planejada boa sim (controle)', async () => {
    requisicao = EM_SEPARACAO;
    await renderizar();
    await clicar('Ajustar Separação');
    expect(selectSeparacao().value).toBe('');
    act(() => root.unmount());
    root = createRoot(container);
    saldos = [A01, XB01, Z02({ lote_status: 'ATIVO', lote_esta_impedido: false })];
    await renderizar();
    await clicar('Ajustar Separação');
    expect(selectSeparacao().value).toBe('4:12');
  });

  test('[RN-226.08] a sugestão da fila não pré-seleciona opção impedida', () => {
    const item = { ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0 };
    const sugestao = { pegar_em: { localizacao_id: 4, lote_id: 12, cobre: true }, pegar_em_aviso: null };
    expect(valorSugeridoNaSeparacao(item, sugestao, [Z02()], 3, 0, 0, [item])).toBe('');
    expect(valorSugeridoNaSeparacao(item, sugestao, [Z02({ lote_status: 'ATIVO', lote_esta_impedido: false })], 3, 0, 0, [item]))
      .toBe('4:12');
  });

  test('[RN-226.09] entrega pré-seleciona a planejada impedida e avisa; outra escolha tira o aviso', async () => {
    requisicao = PARCIAL_PLANEJADA;
    await renderizar();
    await clicar('Completar Entrega');
    expect(selectEntrega().value).toBe('4:12');
    expect(container.querySelector('#entrega-dica-lote-impedido-1').textContent).toBe(FRASE_L2);
    escolher(selectEntrega(), '1:');
    expect(container.querySelector('#entrega-dica-lote-impedido-1')).toBeNull();
  });

  test('[RN-226.12, Fase 2 I1] separação: a planejada impedida em automático diz que a parte separada não sai; escolhida (velha), a frase do lote', async () => {
    requisicao = EM_SEPARACAO;
    await renderizar();
    await clicar('Ajustar Separação');
    expect(container.querySelector('#separacao-dica-lote-impedido-1').textContent).toBe(FRASE_PLANEJADA_L2);
    // A opção desabilitada ainda pode estar selecionada (escolha de antes de o detalhe ser relido): a frase do lote.
    escolher(selectSeparacao(), '4:12');
    expect(container.querySelector('#separacao-dica-lote-impedido-1').textContent).toBe(FRASE_L2);
    escolher(selectSeparacao(), '1:');
    expect(container.querySelector('#separacao-dica-lote-impedido-1').textContent).toBe(FRASE_PLANEJADA_L2);
  });

  test('[RN-226.12] sem lote impedido, nenhuma frase (separação com planejada boa; entrega sem planejada)', async () => {
    requisicao = EM_SEPARACAO;
    saldos = [A01, XB01, Z02({ lote_status: 'ATIVO', lote_esta_impedido: false })];
    await renderizar();
    await clicar('Ajustar Separação');
    expect(container.querySelector('#separacao-dica-lote-impedido-1')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = PARCIAL;
    saldos = SALDOS;
    await renderizar();
    await clicar('Completar Entrega');
    expect(container.querySelector('#entrega-dica-lote-impedido-1')).toBeNull();
  });

  test('[RN-226.10] integração: a rodada da separação com a planejada impedida vai sem origem; com a planejada boa, com ela', async () => {
    const putsSeparacao = () => api.put.mock.calls.filter((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
    requisicao = EM_SEPARACAO;
    await renderizar();
    await clicar('Ajustar Separação');
    await clicar('Confirmar Separação');
    expect(putsSeparacao()).toHaveLength(1);
    const item1 = putsSeparacao()[0][1].itens_separados.find((i) => i.item_id === 1);
    expect(item1.localizacao_origem_id).toBeUndefined();
    expect(item1.lote_id).toBeUndefined();
    act(() => root.unmount());
    root = createRoot(container);
    api.put.mockClear();
    saldos = [A01, XB01, Z02({ lote_status: 'ATIVO', lote_esta_impedido: false })];
    await renderizar();
    await clicar('Ajustar Separação');
    await clicar('Confirmar Separação');
    const bom = putsSeparacao()[0][1].itens_separados.find((i) => i.item_id === 1);
    expect(bom).toMatchObject({ localizacao_origem_id: 4, lote_id: 12 });
  });

  test('[RN-226.13, Fase 5 R1] separação: com a origem num lote impedido, o aviso "continuam saindo de lá" não aparece; com ela boa, aparece', async () => {
    requisicao = EM_SEPARACAO;
    await renderizar();
    await clicar('Ajustar Separação');
    expect(selectSeparacao().value).toBe('');
    expect(container.querySelector('#separacao-dica-lote-impedido-1')).toBeTruthy();
    expect(container.querySelector('#separacao-aviso-origem-1')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    saldos = [A01, XB01, Z02({ lote_status: 'ATIVO', lote_esta_impedido: false })];
    await renderizar();
    await clicar('Ajustar Separação');
    escolher(selectSeparacao(), '');
    expect(container.querySelector('#separacao-aviso-origem-1').textContent).toContain('que continuam saindo de lá');
  });

  test('[RN-226.13, Fase 5 R2] entrega acima da parte: com a origem num lote impedido, a dica "sai de Z-02" não aparece; com ela boa, aparece', async () => {
    const acima = { ...PARCIAL_PLANEJADA, itens: [{ ...PARCIAL_PLANEJADA.itens[0], quantidade_origem_separacao: 1 }] };
    requisicao = acima;
    await renderizar();
    await clicar('Completar Entrega');
    expect(container.querySelector('#entrega-dica-lote-impedido-1')).toBeTruthy();
    expect(container.querySelector('#entrega-dica-pendente-1')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    saldos = [A01, XB01, Z02({ lote_status: 'ATIVO', lote_esta_impedido: false })];
    await renderizar();
    await clicar('Completar Entrega');
    expect(container.querySelector('#entrega-dica-pendente-1').textContent).toContain('sai de Z-02 — lote L2');
  });

  test('[RN-226.13, Fase 5 R3] a sugestão da fila num lote impedido não diz "não veio escolhida"; num lote bom com aviso, diz', async () => {
    let pegarEm = { localizacao_id: 4, lote_id: 12, localizacao_codigo: 'Z-02', lote_codigo: 'L2', quantidade_sugerida: 5, cobre: true };
    let aviso = null;
    const base = api.get.getMockImplementation();
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/requisicoes/55/sugestao-coleta') {
        return Promise.resolve({ data: { itens: [{ item_id: 1, pegar_em: pegarEm, pegar_em_aviso: aviso, pegar_em_alerta: null }] } });
      }
      return base(url);
    });
    requisicao = APROVADA;
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectSeparacao().value).toBe('');
    expect(container.querySelector('#separacao-sugestao-1')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    pegarEm = { ...pegarEm, localizacao_id: 2, lote_id: 7, localizacao_codigo: 'XB-01', lote_codigo: 'L1' };
    aviso = 'Nenhum endereço tem tudo';
    await renderizar();
    await clicar('Iniciar Separação');
    expect(container.querySelector('#separacao-sugestao-1').textContent).toContain('não veio escolhida');
  });

  test('[RN-226.07/.08, Fase 5 K] reprovado e vencido também não são pré-selecionados (planejada e sugestão), não só o bloqueado', async () => {
    const item = { ...ITEM_BASE, quantidade_separada: 0, quantidade_entregue: 0 };
    const sugestao = { pegar_em: { localizacao_id: 4, lote_id: 12, cobre: true }, pegar_em_aviso: null };
    const reprovado = Z02({ lote_status: 'REPROVADO' });
    const vencido = Z02({ lote_status: 'ATIVO', lote_validade: '2026-11-10', lote_vencido_sem_liberacao: true });
    expect(valorSugeridoNaSeparacao(item, sugestao, [reprovado], 3, 0, 0, [item])).toBe('');
    expect(valorSugeridoNaSeparacao(item, sugestao, [vencido], 3, 0, 0, [item])).toBe('');
    for (const z of [reprovado, vencido]) {
      act(() => root.unmount());
      root = createRoot(container);
      requisicao = EM_SEPARACAO;
      saldos = [A01, XB01, z];
      // eslint-disable-next-line no-await-in-loop
      await renderizar();
      // eslint-disable-next-line no-await-in-loop
      await clicar('Ajustar Separação');
      expect(selectSeparacao().value).toBe('');
      expect(container.querySelector('#separacao-dica-lote-impedido-1')).toBeTruthy();
    }
  });

  test('[RN-226.12, Fase 5 C] origem já toda entregue: nenhuma frase de "já separado"; com parte pendente, a frase (controle)', async () => {
    requisicao = { ...REQ_BASE, status: 'EM_SEPARACAO',
      itens: [{ ...ITEM_BASE, origem_separacao_id: 4, lote_separacao_id: 12, origem_separacao_codigo: 'Z-02', lote_separacao_codigo: 'L2',
        quantidade_origem_separacao: 2, quantidade_separada: 2, quantidade_entregue: 2, quantidade_atendida: 2 }] };
    await renderizar();
    await clicar('Ajustar Separação');
    expect(selectSeparacao()).toBeTruthy();
    expect(container.querySelector('#separacao-dica-lote-impedido-1')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = EM_SEPARACAO;
    await renderizar();
    await clicar('Ajustar Separação');
    expect(container.querySelector('#separacao-dica-lote-impedido-1').textContent).toBe(FRASE_PLANEJADA_L2);
  });

  test('[RN-226.06, Fase 5 A] entrega: a exceção é só do lote da planejada — outro lote impedido no mesmo endereço vem desabilitado', async () => {
    requisicao = PARCIAL_PLANEJADA;
    saldos = [A01, Z02(), Z02({ id: 20, lote_id: 99, lote: 'L9' })];
    await renderizar();
    await clicar('Completar Entrega');
    expect(desabilitadas(selectEntrega())).toEqual(['4:99']);
  });

  test('[RN-226.11] o util e o extrato são a mesma função', () => {
    expect(doUtil).toBe(doExtrato);
    expect(doUtil({ lote_status: 'BLOQUEADO', lote_esta_impedido: true })).toBe('Bloqueado');
  });
});
