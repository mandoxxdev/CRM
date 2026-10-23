/**
 * Etapa 64 (T2): a tela da fila de separação.
 *
 * O que se prova: a tela não reordena o que o servidor ordenou; cada etapa vira um chip com o
 * rótulo combinado; o não acionável fica num grupo "Aguardando"; quem separou é avisado de que
 * não confere; "Abrir" leva a /almoxarifado/requisicoes?id=; vazio e 403 são estados distintos.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/FilaSeparacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route, useLocation } from 'react-router-dom';
import FilaSeparacao from './FilaSeparacao';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

const item = (over = {}) => ({
  item_id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', unidade: 'PC',
  a_separar: 0, separavel: 0, a_entregar: 0, entregavel: 0, disponivel: 0,
  origem_separacao_codigo: null, lote_separacao_codigo: null, material_critico: 0, ...over,
});

const req = (over = {}) => ({
  id: 1, numero: 'REQ-1', status: 'APROVADO', urgencia: 'NORMAL', data_necessidade: null,
  solicitante_nome: 'Maria', setor: 'Produção', created_at: '2026-09-30 10:00:00',
  etapas: ['SEPARAR'], acionavel: true, conferencia_pendente: false, separadores: [],
  posso_conferir: true, itens: [item()], ...over,
});

// A ordem do servidor NÃO é a alfabética nem a de id — de propósito, para que um sort na tela
// apareça.
const FILA = [
  req({
    id: 30, numero: 'REQ-030', urgencia: 'CRITICO', data_necessidade: '2026-10-05',
    etapas: ['SEPARAR', 'ENTREGAR'],
    itens: [item({ item_id: 301, a_separar: 5, separavel: 3, a_entregar: 2, entregavel: 1, disponivel: 3,
      origem_separacao_codigo: 'A-01', lote_separacao_codigo: 'L-77' })],
  }),
  req({
    id: 20, numero: 'REQ-020', status: 'EM_SEPARACAO', etapas: ['CONFERIR'], conferencia_pendente: true,
    posso_conferir: false, separadores: [{ id: 7, nome: 'João Almox' }],
  }),
  req({ id: 25, numero: 'REQ-025', status: 'PRONTA_PARA_RETIRADA', etapas: ['REABRIR_SEPARACAO'] }),
  // APROVACAO_VALOR vem da avaliacao ao vivo e o servidor manda acionavel: false (Fase 5); na
  // ordem do servidor fica entre as nao acionaveis, a frente por ser URGENTE.
  req({ id: 10, numero: 'REQ-010', urgencia: 'URGENTE', etapas: ['APROVACAO_VALOR'], acionavel: false }),
  req({ id: 5, numero: 'REQ-005', status: 'AGUARDANDO_COMPRA', etapas: ['AGUARDANDO_SALDO'], acionavel: false }),
  req({ id: 4, numero: 'REQ-004', status: 'AGUARDANDO_COMPRA', etapas: ['AGUARDANDO_SALDO'], acionavel: false }),
];

let container;
let root;
let local;

const SondaLocal = () => {
  local = useLocation();
  return null;
};

const flush = async () => {
  await act(async () => { await Promise.resolve(); await Promise.resolve(); });
};

const montar = async () => {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/fila-separacao']}>
        <SondaLocal />
        <Routes>
          <Route path="/almoxarifado/fila-separacao" element={<FilaSeparacao />} />
          <Route path="/almoxarifado/requisicoes" element={<div data-testid="tela-requisicoes" />} />
        </Routes>
      </MemoryRouter>
    );
  });
  await flush();
};

const q = (sel) => container.querySelector(sel);
const qa = (sel) => Array.from(container.querySelectorAll(sel));
const numeros = (sel) => qa(`${sel} [data-testid="fila-numero"]`).map((n) => n.textContent);

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  local = null;
  api.get.mockReset();
  api.get.mockResolvedValue({ data: FILA });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test('carrega a fila ao montar e preserva a ordem do servidor (acionáveis e Aguardando)', async () => {
  await montar();
  expect(api.get).toHaveBeenCalledWith('/almoxarifado/fila-separacao');
  expect(numeros('[data-testid="fila-acionaveis"]')).toEqual(['REQ-030', 'REQ-020', 'REQ-025']);
  expect(numeros('[data-testid="fila-aguardando"]')).toEqual(['REQ-010', 'REQ-005', 'REQ-004']);
});

test('um chip por etapa, com o rótulo combinado', async () => {
  await montar();
  const r30 = q('[data-testid="fila-req-30"]');
  expect(r30.querySelector('[data-testid="fila-etapa-SEPARAR"]').textContent).toBe('Separar');
  expect(r30.querySelector('[data-testid="fila-etapa-ENTREGAR"]').textContent).toBe('Entregar');
  expect(q('[data-testid="fila-req-10"] [data-testid="fila-etapa-APROVACAO_VALOR"]').textContent)
    .toBe('Aguardando aprovação de valor');
  expect(q('[data-testid="fila-req-5"] [data-testid="fila-etapa-AGUARDANDO_SALDO"]').textContent)
    .toBe('Aguardando saldo');
  expect(q('[data-testid="fila-req-25"] [data-testid="fila-etapa-REABRIR_SEPARACAO"]').textContent)
    .toBe('Separar de novo para conferir');
  // urgência, data e item
  expect(r30.querySelector('[data-testid="fila-urgencia"]').textContent).toBe('Crítico');
  expect(r30.textContent).toContain('Necessário em 05/10/2026');
  expect(q('[data-testid="fila-item-301"]').textContent).toBe(
    'MAT-1 — Chapa 3mm: a separar 5 PC (separável agora 3) · a entregar 2 PC (entregável agora 1) · disponível 3 · separado de A-01 — L-77'
  );
});

test('grupo Aguardando só com as não acionáveis', async () => {
  await montar();
  const grupo = q('[data-testid="fila-aguardando"]');
  expect(grupo).not.toBeNull();
  expect(grupo.querySelector('h2').textContent).toBe('Aguardando');
  expect(grupo.querySelector('[data-testid="fila-req-30"]')).toBeNull();
  expect(q('[data-testid="fila-acionaveis"] [data-testid="fila-req-5"]')).toBeNull();
  // aprovacao de valor pendente nao e trabalho do almoxarife: vai para Aguardando, com o chip.
  expect(grupo.querySelector('[data-testid="fila-req-10"] [data-testid="fila-etapa-APROVACAO_VALOR"]')).not.toBeNull();
  expect(q('[data-testid="fila-acionaveis"] [data-testid="fila-req-10"]')).toBeNull();
});

test('CONFERENCIA_SEM_SAIDA vira chip "peça ao administrador" no grupo Aguardando', async () => {
  api.get.mockResolvedValue({
    data: [
      req({
        id: 26, numero: 'REQ-026', status: 'PRONTA_PARA_RETIRADA', etapas: ['CONFERENCIA_SEM_SAIDA'],
        acionavel: false, conferencia_pendente: true,
      }),
    ],
  });
  await montar();
  const chip = q('[data-testid="fila-aguardando"] [data-testid="fila-req-26"] [data-testid="fila-etapa-CONFERENCIA_SEM_SAIDA"]');
  expect(chip).not.toBeNull();
  expect(chip.textContent).toBe('Conferência pendente — peça ao administrador');
  expect(q('[data-testid="fila-acionaveis"]')).toBeNull();
});

test('item a entregar mostra o entregável agora (separado limitado ao disponível)', async () => {
  api.get.mockResolvedValue({
    data: [
      req({
        id: 40, numero: 'REQ-040', status: 'PRONTA_PARA_RETIRADA', etapas: ['AGUARDANDO_SALDO'], acionavel: false,
        itens: [item({ item_id: 401, a_entregar: 4, entregavel: 0, disponivel: 0 })],
      }),
      req({
        id: 41, numero: 'REQ-041', status: 'PRONTA_PARA_RETIRADA', etapas: ['ENTREGAR'],
        itens: [item({ item_id: 411, a_entregar: 4, entregavel: 2.5, disponivel: 2.5 })],
      }),
    ],
  });
  await montar();
  expect(q('[data-testid="fila-item-401"]').textContent)
    .toBe('MAT-1 — Chapa 3mm: a entregar 4 PC (entregável agora 0) · disponível 0');
  expect(q('[data-testid="fila-item-411"]').textContent)
    .toBe('MAT-1 — Chapa 3mm: a entregar 4 PC (entregável agora 2,5) · disponível 2,5');
});

test('quem separou é avisado no chip Conferir; quem pode conferir vê só "Conferir"', async () => {
  api.get.mockResolvedValue({
    data: [
      FILA.find((r) => r.id === 20),
      req({ id: 21, numero: 'REQ-021', status: 'EM_SEPARACAO', etapas: ['CONFERIR'], conferencia_pendente: true, posso_conferir: true }),
    ],
  });
  await montar();
  expect(q('[data-testid="fila-req-20"] [data-testid="fila-etapa-CONFERIR"]').textContent)
    .toBe('Conferir — você separou, peça a outra pessoa');
  expect(q('[data-testid="fila-req-20"] [data-testid="fila-separadores"]').textContent)
    .toBe('Separado por: João Almox');
  expect(q('[data-testid="fila-req-21"] [data-testid="fila-etapa-CONFERIR"]').textContent).toBe('Conferir');
});

test('Abrir navega para /almoxarifado/requisicoes?id=', async () => {
  await montar();
  await act(async () => {
    q('[data-testid="fila-abrir-20"]').click();
  });
  expect(local.pathname).toBe('/almoxarifado/requisicoes');
  expect(local.search).toBe('?id=20');
  expect(q('[data-testid="tela-requisicoes"]')).not.toBeNull();
});

test('fila vazia mostra o estado vazio', async () => {
  api.get.mockResolvedValue({ data: [] });
  await montar();
  expect(q('[data-testid="fila-vazia"]').textContent).toContain('Nada para separar ou entregar agora.');
  expect(q('[data-testid="fila-sem-permissao"]')).toBeNull();
});

test('403 vira painel de permissão, não fila vazia', async () => {
  api.get.mockRejectedValue({
    response: { status: 403, data: { error: 'Sem permissão para esta operação', acao: 'separar_emitir', perfil: 'PRODUCAO' } },
  });
  await montar();
  const painel = q('[data-testid="fila-sem-permissao"]');
  expect(painel).not.toBeNull();
  expect(painel.textContent).toContain('Você não tem permissão para a fila de separação.');
  expect(q('[data-testid="fila-vazia"]')).toBeNull();
});

test('erro de servidor mostra a mensagem; Atualizar recarrega', async () => {
  api.get.mockRejectedValueOnce({ response: { status: 500, data: { error: 'Falha X' } } });
  await montar();
  expect(q('[data-testid="fila-erro"]').textContent).toContain('Falha X');
  await act(async () => { q('[data-testid="fila-atualizar"]').click(); });
  await flush();
  expect(api.get).toHaveBeenCalledTimes(2);
  expect(q('[data-testid="fila-erro"]')).toBeNull();
  expect(q('[data-testid="fila-req-30"]')).not.toBeNull();
});

// ── Etapa 188 (T3): a sugestão de coleta — "Pegar em …", os avisos e a ordem de coleta (RN-188.08 com as emendas C1, I1, M2,
// M5). Mock só na fronteira HTTP, com o JSON do contrato congelado no plano (Execução, T2).
const SAI_DE = " — escolha este endereço no 'Sai de' ao separar";
const pegar = (over = {}) => ({
  localizacao_id: 12, localizacao_codigo: 'A-03', caminho: 'ALM1 / A-01 / A-03', lote_id: 7, lote_codigo: 'L7',
  lote_validade: '2026-11-10', quantidade_no_endereco: 6, quantidade_sugerida: 5, cobre: true, ...over,
});
const montarCom = async (reqs) => {
  api.get.mockResolvedValue({ data: reqs });
  await montar();
};
const texto = (sel) => { const n = q(sel); return n ? n.textContent : null; };

test('[RN-188.08] linha com lote e validade: Pegar em código (caminho) — lote (vence) · quantidade — Sai de', async () => {
  await montarCom([req({ id: 1, itens: [item({ item_id: 11, a_separar: 5, separavel: 5, pegar_em: pegar(), pegar_em_aviso: null })],
    ordem_coleta: [] })]);
  expect(texto('[data-testid="fila-pegar-em-11"]'))
    .toBe(`Pegar em A-03 (ALM1 / A-01 / A-03) — lote L7 (vence 10/11/2026) · 5 PC${SAI_DE}`);
  expect(q('[data-testid="fila-pegar-em-aviso-11"]')).toBeNull();
});

test('[RN-188.08] sem lote e caminho de um segmento: sem lote, sem validade, sem parênteses', async () => {
  await montarCom([req({ id: 1, itens: [item({ item_id: 11, a_separar: 3, separavel: 3,
    pegar_em: pegar({ localizacao_codigo: 'B-02', caminho: 'B-02', lote_id: null, lote_codigo: null, lote_validade: null,
      quantidade_sugerida: 3 }), pegar_em_aviso: null })] })]);
  expect(texto('[data-testid="fila-pegar-em-11"]')).toBe(`Pegar em B-02 · 3 PC${SAI_DE}`);
});

test('[RN-188.08] cobre false (NENHUM_ENDERECO_COBRE): a frase da emenda C1', async () => {
  // Sem lote: com lote a frase ganha o "escolha o lote no Sai de" (Fase 5, I-b — ver os [I-b] abaixo).
  await montarCom([req({ id: 1, itens: [item({ item_id: 11, a_separar: 12, separavel: 12,
    pegar_em: pegar({ lote_id: null, lote_codigo: null, lote_validade: null, quantidade_sugerida: 6, cobre: false }), pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' })] })]);
  expect(texto('[data-testid="fila-pegar-em-aviso-11"]'))
    .toBe('Nenhum endereço tem tudo: pegue 6 aqui. Separar o resto de outro endereço depois troca a origem da separação.');
});

test('[RN-188.08] PLANEJADA_NAO_COBRE: a frase com o código da planejada, com e sem pegar_em', async () => {
  const frase = 'Já separado de A-01: o resto não cabe lá. Separar de outro endereço troca a origem da separação '
    + '(a entrega passa a sair automática).';
  await montarCom([req({ id: 1, itens: [
    item({ item_id: 11, a_separar: 3, separavel: 3, a_entregar: 3, origem_separacao_codigo: 'A-01',
      pegar_em: pegar({ localizacao_codigo: 'A-01', caminho: 'ALM1 / A-01', lote_id: null, lote_codigo: null, lote_validade: null,
        quantidade_sugerida: 1, cobre: false }), pegar_em_aviso: 'PLANEJADA_NAO_COBRE' }),
    item({ item_id: 12, material_id: 11, a_separar: 2, separavel: 2, a_entregar: 1, origem_separacao_codigo: 'A-01',
      pegar_em: null, pegar_em_aviso: 'PLANEJADA_NAO_COBRE' }),
  ] })]);
  expect(texto('[data-testid="fila-pegar-em-11"]')).toBe(`Pegar em A-01 (ALM1 / A-01) · 1 PC${SAI_DE}`);
  expect(texto('[data-testid="fila-pegar-em-aviso-11"]')).toBe(frase);
  expect(q('[data-testid="fila-pegar-em-12"]')).toBeNull();
  expect(texto('[data-testid="fila-pegar-em-aviso-12"]')).toBe(frase);
});

// Fase 5 (I-b): material COM lote — trocar a origem e entregar no automático deixa linha sem lote negativa (B204/C71, anterior à
// etapa). Com lote a frase manda escolher o lote no "Sai de" da entrega; sem lote continua a de antes (metade positiva).
const ESCOLHA_O_LOTE = " Na entrega, escolha o lote no 'Sai de': a saída automática não escolhe lote.";
test('[I-b] PLANEJADA_NAO_COBRE com lote: escolher o lote no Sai de, nunca "a entrega passa a sair automática"', async () => {
  await montarCom([req({ id: 1, itens: [
    item({ item_id: 11, a_separar: 2, separavel: 2, a_entregar: 4, origem_separacao_codigo: 'ZSA-01', lote_separacao_codigo: 'L1',
      pegar_em: null, pegar_em_aviso: 'PLANEJADA_NAO_COBRE' }),
    item({ item_id: 12, material_id: 11, a_separar: 2, separavel: 2, a_entregar: 4, origem_separacao_codigo: 'ZSA-02',
      lote_separacao_codigo: null, pegar_em: null, pegar_em_aviso: 'PLANEJADA_NAO_COBRE' }),
  ] })]);
  const comLote = texto('[data-testid="fila-pegar-em-aviso-11"]');
  expect(comLote).toBe(`Já separado de ZSA-01 — lote L1: o resto não cabe lá. Separar de outro endereço troca a origem da separação.${ESCOLHA_O_LOTE}`);
  expect(comLote).not.toContain('sair automática');
  expect(texto('[data-testid="fila-pegar-em-aviso-12"]')).toBe('Já separado de ZSA-02: o resto não cabe lá. Separar de outro '
    + 'endereço troca a origem da separação (a entrega passa a sair automática).');
});

test('[I-b] NENHUM_ENDERECO_COBRE com lote: a frase ganha o "escolha o lote no Sai de"; sem lote, não', async () => {
  await montarCom([req({ id: 1, itens: [
    item({ item_id: 11, a_separar: 12, separavel: 12, pegar_em: pegar({ quantidade_sugerida: 6, cobre: false }),
      pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' }),
    item({ item_id: 12, material_id: 11, a_separar: 12, separavel: 12, pegar_em: pegar({ lote_id: null, lote_codigo: null,
      lote_validade: null, quantidade_sugerida: 6, cobre: false }), pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' }),
  ] })]);
  const base = 'Nenhum endereço tem tudo: pegue 6 aqui. Separar o resto de outro endereço depois troca a origem da separação.';
  expect(texto('[data-testid="fila-pegar-em-aviso-11"]')).toBe(`${base}${ESCOLHA_O_LOTE}`);
  expect(texto('[data-testid="fila-pegar-em-aviso-12"]')).toBe(base);
});

test('[M-d] PLANEJADA_INDISPONIVEL: frase própria (não "o resto não cabe lá"), com e sem lote', async () => {
  await montarCom([req({ id: 1, itens: [
    item({ item_id: 11, a_separar: 3, separavel: 3, a_entregar: 3, origem_separacao_codigo: 'ZB-01', pegar_em: null,
      pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' }),
    item({ item_id: 12, material_id: 11, a_separar: 3, separavel: 3, a_entregar: 3, origem_separacao_codigo: 'ZB-02',
      lote_separacao_codigo: 'L9', pegar_em: null, pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' }),
  ] })]);
  const meio = ', que não pode mais ser sugerido (endereço bloqueado ou inativo, em área especial ou lote bloqueado/vencido). '
    + 'Confira antes de separar o resto: separar de outro endereço troca a origem da separação';
  const semLote = texto('[data-testid="fila-pegar-em-aviso-11"]');
  expect(semLote).toBe(`Já separado de ZB-01${meio} (a entrega passa a sair automática).`);
  expect(semLote).not.toContain('não cabe lá');
  expect(texto('[data-testid="fila-pegar-em-aviso-12"]')).toBe(`Já separado de ZB-02 — lote L9${meio}.${ESCOLHA_O_LOTE}`);
});

test('[I-a] RETENCAO_NO_MATERIAL: o alerta aparece junto da dica; sem o código, não aparece', async () => {
  await montarCom([req({ id: 1, itens: [
    item({ item_id: 11, a_separar: 5, separavel: 5, pegar_em: pegar(), pegar_em_aviso: null, pegar_em_alerta: 'RETENCAO_NO_MATERIAL' }),
    item({ item_id: 12, material_id: 11, a_separar: 5, separavel: 5, pegar_em: pegar(), pegar_em_aviso: null, pegar_em_alerta: null }),
  ] })]);
  expect(texto('[data-testid="fila-pegar-em-11"]')).toBe(`Pegar em A-03 (ALM1 / A-01 / A-03) — lote L7 (vence 10/11/2026) · 5 PC${SAI_DE}`);
  expect(texto('[data-testid="fila-pegar-em-alerta-11"]')).toBe('Parte do saldo deste material está retida (em inspeção, bloqueada '
    + 'ou em terceiros) e o sistema não sabe em qual endereço — confira antes de pegar.');
  expect(texto('[data-testid="fila-pegar-em-12"]')).not.toBeNull();
  expect(q('[data-testid="fila-pegar-em-alerta-12"]')).toBeNull();
});

test('[RN-188.08] SEM_ENDERECO_SUGERIVEL: a frase da emenda M2', async () => {
  await montarCom([req({ id: 1, itens: [item({ item_id: 11, a_separar: 5, separavel: 5, pegar_em: null,
    pegar_em_aviso: 'SEM_ENDERECO_SUGERIVEL' })] })]);
  expect(q('[data-testid="fila-pegar-em-11"]')).toBeNull();
  expect(texto('[data-testid="fila-pegar-em-aviso-11"]')).toBe('Sem endereço para sugerir (o saldo está sem endereço, em endereço '
    + 'bloqueado ou inativo, em área especial ou em lote bloqueado/vencido).');
});

test('[RN-188.08] ordem de coleta com 2 paradas, na ordem do JSON (a tela não reordena); os itens também', async () => {
  // O JSON põe B-01 antes de A-01 de propósito: um sort na tela apareceria.
  await montarCom([req({ id: 1,
    itens: [
      item({ item_id: 21, material_codigo: 'MAT-A', a_separar: 2, separavel: 2, pegar_em: pegar({ localizacao_codigo: 'A-01', caminho: 'ALM1 / A-01', lote_codigo: null, lote_id: null, lote_validade: null, quantidade_sugerida: 2 }), pegar_em_aviso: null }),
      item({ item_id: 22, material_codigo: 'MAT-B', a_separar: 4, separavel: 4, pegar_em: pegar({ localizacao_codigo: 'B-01', caminho: 'ALM1 / B-01', quantidade_sugerida: 4 }), pegar_em_aviso: null }),
    ],
    ordem_coleta: [
      { item_id: 22, material_codigo: 'MAT-B', localizacao_id: 20, localizacao_codigo: 'B-01', caminho: 'ALM1 / B-01', lote_codigo: 'L7', quantidade_sugerida: 4 },
      { item_id: 21, material_codigo: 'MAT-A', localizacao_id: 10, localizacao_codigo: 'A-01', caminho: 'ALM1 / A-01', lote_codigo: null, quantidade_sugerida: 2 },
    ] })]);
  const lista = q('[data-testid="fila-ordem-coleta-1"]');
  expect(lista).not.toBeNull();
  expect(lista.querySelector('h3, strong').textContent).toBe('Ordem de coleta');
  expect(Array.from(lista.querySelectorAll('li')).map((li) => li.textContent))
    .toEqual(['ALM1 / B-01 — MAT-B · 4 — lote L7', 'ALM1 / A-01 — MAT-A · 2']);
  expect(lista.querySelector('ol')).not.toBeNull();
  expect(qa('[data-testid="fila-req-1"] [data-testid^="fila-item-"]').map((n) => n.getAttribute('data-testid')))
    .toEqual(['fila-item-21', 'fila-item-22']);
});

test('[RN-188.08] ordem de coleta com 1 parada: a lista não aparece (repetiria a linha)', async () => {
  await montarCom([req({ id: 1, itens: [item({ item_id: 11, a_separar: 5, separavel: 5, pegar_em: pegar(), pegar_em_aviso: null })],
    ordem_coleta: [{ item_id: 11, material_codigo: 'MAT-1', localizacao_id: 12, localizacao_codigo: 'A-03', caminho: 'ALM1 / A-01 / A-03',
      lote_codigo: 'L7', quantidade_sugerida: 5 }] })]);
  expect(q('[data-testid="fila-pegar-em-11"]')).not.toBeNull();
  expect(q('[data-testid="fila-ordem-coleta-1"]')).toBeNull();
});

test('[RN-188.08] resposta antiga sem os campos novos não quebra e não mostra nada novo', async () => {
  await montar(); // FILA do topo: sem pegar_em, pegar_em_aviso nem ordem_coleta
  expect(q('[data-testid="fila-req-30"]')).not.toBeNull();
  expect(qa('[data-testid^="fila-pegar-em"]')).toEqual([]);
  expect(qa('[data-testid^="fila-ordem-coleta"]')).toEqual([]);
});
