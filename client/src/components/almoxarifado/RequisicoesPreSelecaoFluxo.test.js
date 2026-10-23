/**
 * Etapa 189 (T4, tela) — o fluxo inteiro pela tela, com o mock HTTP COM ESTADO (o detalhe devolvido depois do PUT da separação traz a
 * planejada gravada):
 *
 *  6. "Iniciar Separação" -> a janela de separação abre com o "Sai de" no par sugerido -> confirmar -> o PUT leva o par ->
 *     "Entregar escolhendo de onde sai…" -> a janela de entrega abre com a planejada escolhida (Etapa 59) -> confirmar -> o PUT da
 *     entrega sai do MESMO par, sem `origem_automatica`, sem `motivo_substituicao`; nenhum aviso de troca na tela. É a fiação que o
 *     servidor (T4, RN-189.08) não prova. (O plano dizia "Separar e entregar": o ramo `entregaAposSeparar` de "Completar Entrega" só é
 *     alcançável sem nada entregável, e o botão só aparece com algo entregável — ver a Execução da T4. A entrega de um clique não manda
 *     origem e sai da planejada no servidor: o caso 1 do T4 do servidor.)
 *  7. A fila -> "Imprimir lista de coleta" -> o gerador REAL (sem mock de listaColetaPdf; jspdf com o gravador) salva
 *     `lista-coleta-<numero>.pdf` com os endereços na ordem de `ordem_coleta`.
 *
 * Plano: docs/superpowers/plans/2026-10-23-almoxarifado-etapa189-lista-de-coleta-e-pre-selecao-do-sai-de.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesPreSelecaoFluxo --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
import FilaSeparacao from './FilaSeparacao';
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

// O jsPDF real mede; toda chamada é gravada (molde: utils/posicaoClientePdf.test.js). Função comum: o CRA liga `resetMocks`.
const mockPdf = [];
jest.mock('jspdf', () => {
  const erroOriginal = console.error;
  console.error = () => {};
  let JsPdfReal;
  try { ({ jsPDF: JsPdfReal } = jest.requireActual('jspdf')); } finally { console.error = erroOriginal; }
  return function JsPdfGravador() {
    const medidor = new JsPdfReal({ format: 'a4', orientation: 'portrait', unit: 'mm' });
    const soMedem = { getTextWidth: true, splitTextToSize: true };
    return new Proxy({}, {
      get: (_alvo, nome) => (...args) => {
        mockPdf.push([nome, ...args]);
        if (nome === 'setFontSize') medidor.setFontSize(...args);
        if (soMedem[nome]) return medidor[nome](...args);
        return undefined;
      },
    });
  };
});

const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
// 5 pedidos, nada separado.
const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', material_unidade: 'PC', material_foto: null, unidade: 'PC',
  quantidade_solicitada: 5, quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0, quantidade_entregavel: 0,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
};
const SALDOS = [
  { id: 1, material_id: 10, localizacao_id: 1, localizacao_codigo: 'A-01', lote_id: null, lote: null, quantidade: 10 },
  { id: 4, material_id: 10, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L-7', quantidade: 6 },
];
const SUGESTAO = {
  requisicao_id: 55,
  itens: [{ item_id: 1, separavel: 5, pegar_em_aviso: null, pegar_em_alerta: null,
    pegar_em: { localizacao_id: 2, localizacao_codigo: 'B-02', caminho: 'ALM / B-02', lote_id: 7, lote_codigo: 'L-7',
      lote_validade: '2026-11-10', quantidade_no_endereco: 6, quantidade_sugerida: 5, cobre: true } }],
  ordem_coleta: [],
};

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPdf.length = 0;
  requisicao = { ...REQ_BASE, status: 'APROVADO', itens: [{ ...ITEM }] };
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos') return Promise.resolve({ data: SALDOS });
    if (url === '/almoxarifado/requisicoes/55/sugestao-coleta') return Promise.resolve({ data: SUGESTAO });
    return Promise.resolve({ data: [] });
  });
  // O servidor com estado: a separação com o par grava a planejada (RN-189.08); a entrega dá baixa.
  api.put.mockImplementation((url, corpo) => {
    if (url === '/almoxarifado/requisicoes/55/separacao') {
      const linha = corpo.itens_separados[0];
      const planejada = linha.localizacao_origem_id
        ? { origem_separacao_id: linha.localizacao_origem_id, lote_separacao_id: linha.lote_id ?? null,
          origem_separacao_codigo: linha.localizacao_origem_id === 2 ? 'B-02' : 'A-01', lote_separacao_codigo: linha.lote_id ? 'L-7' : null }
        : {};
      requisicao = { ...requisicao, status: 'EM_SEPARACAO',
        itens: [{ ...requisicao.itens[0], quantidade_separada: linha.quantidade_separada, quantidade_entregavel: linha.quantidade_separada,
          ...planejada }] };
      return Promise.resolve({ data: {} });
    }
    return Promise.resolve({ data: { parcial: false } });
  });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const botaoPorTexto = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => {
  const b = botaoPorTexto(texto);
  if (!b) throw new Error(`botao "${texto}" nao encontrado`);
  await act(async () => { b.click(); });
};
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

test('[T4 tela, RN-189.08] Iniciar Separação -> Entregar escolhendo de onde sai: separa do par pré-selecionado e a entrega sai dele, sem troca', async () => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}>
        <RequisicoesList />
      </MemoryRouter>
    );
  });
  await clicar('Iniciar Separação');
  await flush();
  expect(container.querySelector('#separacao-origem-1').value).toBe('2:7');
  await clicar('Confirmar Separação');
  await flush();
  const sep = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/separacao');
  expect(sep[1].itens_separados[0]).toEqual({ item_id: 1, quantidade_separada: 5, localizacao_origem_id: 2, lote_id: 7 });
  await clicar('Entregar escolhendo de onde sai');
  await flush();
  // a janela de entrega abriu com a planejada escolhida
  const selEntrega = container.querySelector('#entrega-origem-1');
  expect(selEntrega).not.toBeNull();
  expect(selEntrega.value).toBe('2:7');
  expect(container.querySelector('#entrega-motivo-troca-1')).toBeNull();
  await clicar('✅ Confirmar Entrega');
  const ent = api.put.mock.calls.find((c) => c[0] === '/almoxarifado/requisicoes/55/entregar');
  expect(ent).toBeDefined();
  const item = ent[1].itens_atendidos[0];
  expect(item).toEqual({ item_id: 1, quantidade_atendida: 5, localizacao_origem_id: 2, lote_id: 7 });
  expect(item).not.toHaveProperty('origem_automatica');
  expect(item).not.toHaveProperty('motivo_substituicao');
});

test('[T4 tela, RN-189.10/13] fila -> Imprimir lista de coleta: o gerador real salva lista-coleta-<numero>.pdf com os endereços na ordem da coleta', async () => {
  const it = (id, cod, loc) => ({ item_id: id, material_id: id, material_codigo: cod, material_nome: `Nome ${cod}`, unidade: 'PC',
    a_separar: 2, separavel: 2, a_entregar: 0, entregavel: 0, disponivel: 9, origem_separacao_codigo: null, lote_separacao_codigo: null,
    material_critico: false, pegar_em_aviso: null, pegar_em_alerta: null,
    pegar_em: { localizacao_id: id, localizacao_codigo: loc, caminho: `ALM / ${loc}`, lote_id: null, lote_codigo: null, lote_validade: null,
      quantidade_no_endereco: 9, quantidade_sugerida: 2, cobre: true } });
  // itens na ordem do pedido (ZC, ZA, ZB); a ordem de coleta é ZA, ZB, ZC
  const itens = [it(1, 'M-C', 'ZC-01'), it(2, 'M-A', 'ZA-01'), it(3, 'M-B', 'ZB-01')];
  const parada = (x) => ({ item_id: x.item_id, material_codigo: x.material_codigo, localizacao_id: x.pegar_em.localizacao_id,
    localizacao_codigo: x.pegar_em.localizacao_codigo, caminho: x.pegar_em.caminho, lote_codigo: null, quantidade_sugerida: 2 });
  const fila = [{ id: 7, numero: 'REQ-007', status: 'APROVADO', urgencia: 'NORMAL', data_necessidade: null, solicitante_nome: 'Maria',
    setor: 'Produção', created_at: '2026-10-23 10:00:00', etapas: ['SEPARAR'], acionavel: true, conferencia_pendente: false, separadores: [],
    posso_conferir: false, itens, ordem_coleta: [parada(itens[1]), parada(itens[2]), parada(itens[0])] }];
  api.get.mockImplementation((url) => Promise.resolve({ data: url === '/almoxarifado/fila-separacao' ? fila : [] }));
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/fila-separacao']}>
        <FilaSeparacao />
      </MemoryRouter>
    );
  });
  await flush();
  const chamadasAntes = api.get.mock.calls.length;
  await act(async () => { container.querySelector('[data-testid="fila-imprimir-7"]').click(); });
  expect(api.get.mock.calls.length).toBe(chamadasAntes);
  expect(mockPdf.filter(([n]) => n === 'save').map(([, nome]) => nome)).toEqual(['lista-coleta-REQ-007.pdf']);
  const enderecos = mockPdf.filter(([n, t]) => n === 'text' && /^Z[ABC]-01/.test(String(t))).map(([, t]) => String(t).slice(0, 5));
  expect(enderecos).toEqual(['ZA-01', 'ZB-01', 'ZC-01']);
});
