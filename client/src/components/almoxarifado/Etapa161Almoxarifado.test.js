/**
 * Etapa 161 (T5) — o navegador do Almoxarifado:
 * - RN-161.02 (C396): as listas so mostram a resposta (e o erro, e o fim do carregando) do ULTIMO pedido;
 * - RN-161.03 (C396): os Relatorios — trocar de relatorio invalida a consulta em voo; o export usa o tipo e os params da ultima consulta
 *   bem-sucedida do relatorio aberto; o nome do arquivo leva o dia local;
 * - RN-161.06 (C397): o `created_at` (UTC sem fuso) aparece na hora local;
 * - RN-161.08 (C399): o Evento das Notificacoes = os 10 fixos + os da rota nova (falha aberta);
 * - RN-161.09 (C399): o seletor de fornecedores procura no servidor (Recebimento e Remessas);
 * - RN-161.11 (C400): o QR mostra so aquele material;
 * - RN-161.12 (C400): trocar o filtro do Recebimento recarrega so a lista.
 * O `api` simulado na fronteira HTTP (a rota `/notificacoes/eventos` e a busca de fornecedores contra o contrato congelado do plano).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api';
import { toast } from 'react-toastify';
import MovimentacoesAlmoxarifado from './MovimentacoesAlmoxarifado';
import RequisicoesList from './RequisicoesList';
import RecebimentosAlmoxarifado from './RecebimentosAlmoxarifado';
import ReservasAlmoxarifado from './ReservasAlmoxarifado';
import InspecoesAlmoxarifado from './InspecoesAlmoxarifado';
import NaoConformidadesAlmoxarifado from './NaoConformidadesAlmoxarifado';
import AlmoxarifadoDashboard from './AlmoxarifadoDashboard';
import RelatoriosAlmoxarifado from './RelatoriosAlmoxarifado';
import NotificacoesAlmoxarifado from './NotificacoesAlmoxarifado';
import RemessasTerceirosAlmoxarifado from './RemessasTerceirosAlmoxarifado';
import MateriaisAlmoxarifado from './MateriaisAlmoxarifado';
import ExtratoMaterialModal from './ExtratoMaterialModal';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => {
  const user = { id: 1, nome: 'Admin', role: 'admin', perfil_almoxarifado: 'ADMINISTRADOR' };
  return { useAuth: () => ({ user }) };
});
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));
jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

global.IS_REACT_ACT_ENVIRONMENT = true;
const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
const esperar = async (ms) => { await act(async () => { await pausa(ms); }); };
let container; let root;
beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
beforeEach(() => {
  api.get.mockReset();
  api.post.mockReset();
  toast.error.mockClear();
  window.URL.createObjectURL = jest.fn(() => 'blob:mock-url');
  window.URL.revokeObjectURL = jest.fn();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function montar(el, entrada = '/') {
  await act(async () => { root.render(<MemoryRouter initialEntries={[entrada]}>{el}</MemoryRouter>); });
  for (let i = 0; i < 6; i++) await act(async () => { await pausa(0); });
}
async function digitar(input, valor) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  await act(async () => { set.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
  for (let i = 0; i < 4; i++) await act(async () => {});
}
async function escolher(select, valor) {
  const set = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => { set.call(select, valor); select.dispatchEvent(new Event('change', { bubbles: true })); });
  for (let i = 0; i < 4; i++) await act(async () => {});
}
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  for (let i = 0; i < 4; i++) await act(async () => { await pausa(0); });
}
const botao = (t, escopo = container) => [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(t));
const texto = () => container.textContent;
const carregando = () => container.querySelector('.skeleton-table, [class*="skeleton"]');
/** Dois valores do select diferentes do atual (e do vazio). */
const doisValores = (select) => [...select.options].map((o) => o.value).filter((v) => v !== '' && v !== select.value).slice(0, 2);
const falhaHttp = (msg) => Object.assign(new Error(msg), { response: { status: 500, data: { error: msg } } });

// ---------------------------------------------------------------------------------------------------------------------------------
// RN-161.02 — as listas. Cada uma com a resposta lenta do anterior e a falha do anterior que chega depois.
// ---------------------------------------------------------------------------------------------------------------------------------

const ESTOQUE = [
  { id: 1, codigo: 'MAT-A', nome: 'Material A', unidade: 'UN', quantidade_atual: 5, quantidade_disponivel: 5 },
  { id: 2, codigo: 'MAT-B', nome: 'Material B', unidade: 'UN', quantidade_atual: 5, quantidade_disponivel: 5 },
  { id: 3, codigo: 'MAT-C', nome: 'Material C', unidade: 'UN', quantidade_atual: 5, quantidade_disponivel: 5 },
];

const LISTAS = [
  {
    nome: 'Movimentacoes',
    el: () => <MovimentacoesAlmoxarifado />,
    entrada: '/almoxarifado/movimentacoes',
    url: '/almoxarifado/movimentacoes',
    chave: 'tipo',
    debounce: 300,
    select: () => container.querySelector('.almox-filters select.almox-select'),
    linha: (marca) => [{ id: 7, tipo: 'ENTRADA', material_id: 1, material_nome: marca, quantidade: 1, unidade: 'UN', created_at: '2026-10-19 12:00:00', saldo_anterior: 0, saldo_posterior: 1 }],
  },
  {
    nome: 'Requisicoes',
    el: () => <RequisicoesList />,
    entrada: '/almoxarifado/requisicoes',
    url: '/almoxarifado/requisicoes',
    chave: 'status',
    select: () => [...container.querySelectorAll('select.almox-select')].find((s) => [...s.options].some((o) => o.textContent === 'Todos os status')),
    linha: (marca) => [{ id: 55, numero: marca, status: 'PENDENTE', urgencia: 'NORMAL', solicitante_id: 1, solicitante_nome: 'Fulano', total_itens: 1, valor_total: 0, created_at: '2026-10-19 12:00:00' }],
  },
  {
    nome: 'Recebimentos',
    el: () => <RecebimentosAlmoxarifado />,
    url: '/almoxarifado/recebimentos',
    chave: 'status',
    select: () => [...container.querySelectorAll('select.almox-select')].find((s) => [...s.options].some((o) => o.textContent === 'Todos os status')),
    linha: (marca) => [{ id: 9, numero: 'REC-9', nota_fiscal: marca, status: 'PENDENTE', created_at: '2026-10-19 12:00:00' }],
  },
  {
    nome: 'Reservas',
    el: () => <ReservasAlmoxarifado />,
    url: '/almoxarifado/reservas',
    chave: 'status',
    select: () => container.querySelector('.almox-filters select.almox-select'),
    linha: (marca) => [{ id: 4, material_id: 1, material_nome: marca, material_codigo: 'MAT-A', quantidade: 1, quantidade_reservada: 1, status: 'ATIVA', created_at: '2026-10-19 12:00:00' }],
  },
  {
    nome: 'Inspecoes (pendentes)',
    el: () => <InspecoesAlmoxarifado />,
    url: '/almoxarifado/inspecoes/pendentes',
    chave: 'material_id',
    select: () => container.querySelector('.almox-filters select.almox-select'),
    linha: (marca) => [{ id: 3, material_id: 1, material_nome: marca, material_codigo: 'MAT-A', quantidade: 1, created_at: '2026-10-19 12:00:00' }],
  },
  {
    nome: 'Inspecoes (historico)',
    el: () => <InspecoesAlmoxarifado />,
    url: '/almoxarifado/inspecoes/historico',
    chave: 'material_id',
    antes: async () => { await clicar(botao('Histórico')); },
    select: () => container.querySelector('.almox-filters select.almox-select'),
    linha: (marca) => [{ id: 3, material_id: 1, material_nome: marca, material_codigo: 'MAT-A', quantidade: 1, decisao: 'APROVADO', decidido_em: '2026-10-19 12:00:00' }],
  },
  {
    nome: 'Nao conformidades',
    el: () => <NaoConformidadesAlmoxarifado />,
    url: '/almoxarifado/nao-conformidades',
    chave: 'status',
    select: () => container.querySelector('select[aria-label="Filtrar por status"]'),
    linha: (marca) => ({ itens: [{ id: 2, numero: marca, material_nome: 'Material A', status: 'ABERTA', origem: 'INSPECAO', quantidade: 1, created_at: '2026-10-19 12:00:00' }] }),
  },
];

function mockDasListas(cfg, alvo, modo) {
  api.get.mockImplementation(async (url, c) => {
    if (url === cfg.url) {
      const v = String((c && c.params && c.params[cfg.chave]) ?? '');
      alvo.pedidos.push(v);
      if (alvo.vA !== undefined && v === alvo.vA) {
        if (modo === 'lento') { await pausa(600); return { data: cfg.linha('RESPOSTA-VELHA-161') }; }
        await pausa(500); throw falhaHttp('FALHA-DO-ANTERIOR-161');
      }
      if (alvo.vB !== undefined && v === alvo.vB) {
        if (modo === 'falha') await pausa(800);
        return { data: cfg.linha('RESPOSTA-ULTIMA-161') };
      }
      return { data: cfg.linha('ABERTURA-161') };
    }
    if (url === '/almoxarifado/estoque' || url === '/almoxarifado/materiais') return { data: ESTOQUE };
    return { data: [] };
  });
}

describe.each(LISTAS)('[RN-161.02, C396] $nome', (cfg) => {
  test('a resposta lenta do pedido anterior nao troca a lista do ultimo', async () => {
    const alvo = { pedidos: [] };
    mockDasListas(cfg, alvo, 'lento');
    await montar(cfg.el(), cfg.entrada);
    if (cfg.antes) await cfg.antes();
    await esperar((cfg.debounce || 0) + 50);
    expect(texto()).toContain('ABERTURA-161'); // metade positiva: a lista aparece
    const [vA, vB] = doisValores(cfg.select());
    Object.assign(alvo, { vA, vB });
    await escolher(cfg.select(), vA);
    await esperar((cfg.debounce || 0) + 50); // sai o pedido de A (lento)
    await escolher(cfg.select(), vB);
    await esperar((cfg.debounce || 0) + 50); // sai o de B, que responde na hora
    expect(texto()).toContain('RESPOSTA-ULTIMA-161');
    await esperar(650); // chega o de A
    expect(alvo.pedidos).toContain(vA);
    expect(texto()).toContain('RESPOSTA-ULTIMA-161');
    expect(texto()).not.toContain('RESPOSTA-VELHA-161');
  });

  test('a falha do pedido anterior que chega depois nao mostra erro, e o carregando so sai com o ultimo', async () => {
    const alvo = { pedidos: [] };
    mockDasListas(cfg, alvo, 'falha');
    await montar(cfg.el(), cfg.entrada);
    if (cfg.antes) await cfg.antes();
    await esperar((cfg.debounce || 0) + 50);
    const [vA, vB] = doisValores(cfg.select());
    Object.assign(alvo, { vA, vB });
    await escolher(cfg.select(), vA);
    await esperar((cfg.debounce || 0) + 50); // sai A (falha em 500 ms)
    await escolher(cfg.select(), vB);
    await esperar((cfg.debounce || 0) + 50); // sai B (responde em 800 ms)
    await esperar(550); // A falhou; B ainda em voo
    expect(alvo.pedidos).toContain(vA);
    expect(toast.error).not.toHaveBeenCalled();
    expect(texto()).not.toContain('FALHA-DO-ANTERIOR-161');
    expect(carregando()).toBeTruthy();
    await esperar(800);
    expect(texto()).toContain('RESPOSTA-ULTIMA-161');
    expect(carregando()).toBeFalsy();
    expect(toast.error).not.toHaveBeenCalled();
  });
});

describe('[RN-161.02, C396] Painel do Almoxarifado — trocar o periodo', () => {
  const MAIS = (marca) => [{ material_id: 1, nome: marca, codigo: 'MAT-A', total_consumido: 3, unidade: 'UN' }];
  function mockPainel(modo) {
    let n = 0;
    api.get.mockImplementation(async (url) => {
      if (url === '/almoxarifado/relatorios/materiais-mais-consumidos') {
        n += 1;
        if (n === 1) return { data: MAIS('ABERTURA-161') };
        if (n === 2) {
          if (modo === 'lento') { await pausa(600); return { data: MAIS('RESPOSTA-VELHA-161') }; }
          await pausa(600); throw falhaHttp('o anterior caiu');
        }
        return { data: MAIS('RESPOSTA-ULTIMA-161') };
      }
      if (url === '/almoxarifado/relatorios/indicadores') throw falhaHttp('sem indicadores');
      if (url === '/almoxarifado/dashboard/requisicoes') return { data: { abertas: [] } };
      if (url === '/almoxarifado/dashboard') return { data: {} };
      return { data: [] };
    });
  }
  const selectPeriodo = () => [...container.querySelectorAll('select')].find((s) => [...s.options].some((o) => o.value === '90'));
  test.each(['lento', 'falha'])('o pedido anterior (%s) que chega depois nao troca os materiais mais consumidos', async (modo) => {
    mockPainel(modo);
    await montar(<AlmoxarifadoDashboard />, '/almoxarifado');
    await esperar(20);
    expect(texto()).toContain('ABERTURA-161');
    const [vA, vB] = doisValores(selectPeriodo());
    await escolher(selectPeriodo(), vA);
    await esperar(50);
    await escolher(selectPeriodo(), vB || '30');
    await esperar(50);
    expect(texto()).toContain('RESPOSTA-ULTIMA-161');
    await esperar(650);
    expect(texto()).toContain('RESPOSTA-ULTIMA-161');
    expect(texto()).not.toContain('RESPOSTA-VELHA-161');
  });
});

// ---------------------------------------------------------------------------------------------------------------------------------
// RN-161.03 — Relatorios.
// ---------------------------------------------------------------------------------------------------------------------------------

const LISTA_RELATORIOS = [
  { tipo: 'estoque-atual', titulo: 'Estoque atual', categoria: 'Estoque', params: [], exportavel: true, limite: null, nota: null, colunas: [{ chave: 'codigo', rotulo: 'Código' }] },
  {
    tipo: 'materiais-mais-consumidos', titulo: 'Materiais mais consumidos', categoria: 'Movimentações',
    params: [{ nome: 'data_inicio', rotulo: 'Data início', tipo: 'date', obrigatorio: false }],
    exportavel: true, limite: 10, nota: null, colunas: [{ chave: 'codigo', rotulo: 'Código' }],
  },
];
describe('[RN-161.03, C396] Relatorios: trocar de relatorio invalida a consulta em voo', () => {
  function mockRelatorios(modoA) {
    api.get.mockImplementation(async (url) => {
      if (url === '/almoxarifado/relatorios') return { data: { relatorios: LISTA_RELATORIOS } };
      if (url === '/almoxarifado/relatorios/estoque-atual') {
        await pausa(600);
        if (modoA === 'falha') throw falhaHttp('FALHA-DE-A-161');
        return { data: [{ codigo: 'LINHA-DE-A-161' }] };
      }
      if (url === '/almoxarifado/relatorios/materiais-mais-consumidos') return { data: [{ codigo: 'LINHA-DE-B-161' }] };
      if (url.endsWith('/export')) return { data: new Blob(['x']) };
      throw new Error(`inesperado: ${url}`);
    });
  }
  const abrir = async (tipo) => clicar(container.querySelector(`[data-testid="menu-relatorio-${tipo}"]`));

  test('a resposta de A nao aparece sob B, o Consultar de B vale na hora, e o export pede B com os params da consulta de B', async () => {
    mockRelatorios('lento');
    await montar(<RelatoriosAlmoxarifado />, '/almoxarifado/relatorios');
    await abrir('estoque-atual');
    await clicar(botao('Consultar')); // A em voo (600 ms)
    await abrir('materiais-mais-consumidos');
    await digitar(container.querySelector('#param-data_inicio'), '2026-10-01');
    const consultar = botao('Consultar');
    expect(consultar.disabled).toBe(false); // o Consultar de B vale na hora
    await clicar(consultar);
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/relatorios/materiais-mais-consumidos', { params: { data_inicio: '2026-10-01' } });
    expect(texto()).toContain('LINHA-DE-B-161');
    await esperar(650); // chega A
    expect(texto()).toContain('LINHA-DE-B-161');
    expect(texto()).not.toContain('LINHA-DE-A-161');
    await clicar(botao('Exportar XLSX'));
    const exports = api.get.mock.calls.filter(([u]) => u.endsWith('/export'));
    expect(exports).toEqual([['/almoxarifado/relatorios/materiais-mais-consumidos/export', { params: { data_inicio: '2026-10-01' }, responseType: 'blob' }]]);
  });

  test('a falha de A que chega depois de trocar para B nao mostra o erro de A', async () => {
    mockRelatorios('falha');
    await montar(<RelatoriosAlmoxarifado />, '/almoxarifado/relatorios');
    await abrir('estoque-atual');
    await clicar(botao('Consultar'));
    await abrir('materiais-mais-consumidos');
    expect(texto()).not.toContain('Consultando...'); // o carregando de A saiu com a troca
    await esperar(650); // A falha agora
    expect(api.get.mock.calls.map(([u]) => u)).toContain('/almoxarifado/relatorios/estoque-atual');
    expect(toast.error).not.toHaveBeenCalled();
    expect(texto()).not.toContain('FALHA-DE-A-161');
    await clicar(botao('Consultar')); // metade positiva: B consulta e mostra
    expect(texto()).toContain('LINHA-DE-B-161');
  });
});
