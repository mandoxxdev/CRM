/**
 * Etapa 268 (item 17, D (251) 1, B1579, B1635–B1637) — a janela de entrega limita a quantidade quando o "Sai de" escolhe outra prateleira.
 *
 * Antes, o máximo do item na janela não olhava a opção escolhida: escolhendo uma prateleira com "sobra 2" para 4, a entrega ia ao servidor e
 * voltava a recusa "… sobra 2, que não cobre a quantidade (4). …". Agora, com uma prateleira da lista diferente da origem da separação do
 * item: a quantidade acima do que sai dali desce para esse número ao escolher, a janela diz "Daqui podem sair até N un.", e digitado acima,
 * avisa e apaga o Confirmar Entrega. A conta é um teto (a da E1 com o que a tela sabe): a sobra da opção menos o que os outros itens desta
 * requisição ocupam no par (o que fica guardado + o que tiram dali nesta entrega), e o lote_livre com peça presa.
 *
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa268-sai-de-com-lote-e-limite-da-entrega.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesEntregaLimiteDaOrigem --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList, { limiteDaOrigemNaEntrega } from './RequisicoesList';
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
  quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0,
};
const REQ_BASE = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-11-26T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
// Item 1 separou 5 de B-01/L1 (a origem da separação, parte 5). Item 2 (opcional) guardou 1 em B-02/L1 e não entrega nesta rodada.
const ITEM1 = {
  ...ITEM_BASE, quantidade_separada: 5, quantidade_entregavel: 5,
  origem_separacao_id: 1, lote_separacao_id: 7, origem_separacao_codigo: 'B-01', lote_separacao_codigo: 'L1', quantidade_origem_separacao: 5,
};
const ITEM2 = {
  ...ITEM_BASE, id: 2, quantidade_solicitada: 1, quantidade_separada: 1, quantidade_entregavel: 0,
  origem_separacao_id: 2, lote_separacao_id: 7, origem_separacao_codigo: 'B-02', lote_separacao_codigo: 'L1', quantidade_origem_separacao: 1,
};
const emSeparacao = (itens) => ({ ...REQ_BASE, status: 'EM_SEPARACAO', itens });

const linha = (extra) => ({ material_id: 10, separado_outras: 0, lote_livre: null, lote_bloqueado: null, lote_inspecao: null,
  lote_status: 'ATIVO', lote_esta_impedido: false, lote_vencido_sem_liberacao: false, ...extra });
const B01 = linha({ id: 1, localizacao_id: 1, localizacao_codigo: 'B-01', lote_id: 7, lote: 'L1', quantidade: 8, sobra: 8 });
// B-02: 6 no físico, 2 separados por outra requisição.
const B02 = (extra = {}) => linha({ id: 2, localizacao_id: 2, localizacao_codigo: 'B-02', lote_id: 7, lote: 'L1', quantidade: 6,
  separado_outras: 2, sobra: 4, ...extra });

let container;
let root;
let requisicao;
let saldos;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = [B01, B02()];
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...lin } = requisicao;
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
const digitar = (input, valor) => {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => { setter.call(input, valor); input.dispatchEvent(new Event('input', { bubbles: true })); });
};
const selectEnt = (id = 1) => container.querySelector(`#entrega-origem-${id}`);
const qtdEnt = (id = 1) => selectEnt(id).closest('[style]').parentElement.parentElement.querySelector('input.almox-count-input');
const limite = (id = 1) => container.querySelector(`#entrega-limite-origem-${id}`);
const confirmar = () => botaoPorTexto('✅ Confirmar Entrega');
const abrir = async () => {
  await renderizar();
  await clicar('Entregar escolhendo de onde sai');
};

describe('Etapa 268 — a janela de entrega limita a quantidade de outra prateleira', () => {
  test('[RN-268.10/11/12] outra prateleira (sobra 4): 5 desce para 4, a frase diz o limite; 5 digitado avisa e apaga o Confirmar', async () => {
    requisicao = emSeparacao([ITEM1]);
    await abrir();
    expect(selectEnt().value).toBe('1:7'); // pré-seleção: a origem da separação
    expect(qtdEnt().value).toBe('5');
    expect(limite()).toBeNull();
    escolher(selectEnt(), '2:7');
    expect(qtdEnt().value).toBe('4');
    expect(limite().textContent).toBe('Daqui podem sair até 4 PC.');
    expect(confirmar().disabled).toBe(false);
    expect(qtdEnt().getAttribute('max')).toBe('4');
    digitar(qtdEnt(), '5');
    expect(limite().textContent).toBe('Daqui só podem sair 4 PC nesta entrega. Diminua a quantidade ou escolha outro endereço.');
    expect(confirmar().disabled).toBe(true);
    expect(confirmar().getAttribute('title')).toBe('Diminua a quantidade: o endereço escolhido não tem tudo isso');
    digitar(qtdEnt(), '4');
    expect(confirmar().disabled).toBe(false);
    await clicar('✅ Confirmar Entrega');
    const enviado = api.put.mock.calls[api.put.mock.calls.length - 1][1].itens_atendidos[0];
    expect(enviado).toMatchObject({ item_id: 1, quantidade_atendida: 4, localizacao_origem_id: 2, lote_id: 7 });
  });

  test('[RN-268.13] a própria origem da separação (a parte cobre) e o automático: nenhuma frase, nada desce', async () => {
    requisicao = emSeparacao([ITEM1]);
    saldos = [linha({ ...B01, separado_outras: 5, sobra: 3 }), B02()];
    await abrir();
    escolher(selectEnt(), '1:7');
    expect(limite()).toBeNull();
    expect(qtdEnt().value).toBe('5');
    escolher(selectEnt(), '');
    expect(limite()).toBeNull();
    expect(confirmar().disabled).toBe(false);
    // a metade positiva: outra prateleira limita
    escolher(selectEnt(), '2:7');
    expect(limite()).not.toBeNull();
  });

  test('[RN-268.15] o outro item desta requisição guardou 1 em B-02: o limite é 3', async () => {
    requisicao = emSeparacao([ITEM1, ITEM2]);
    await abrir();
    escolher(selectEnt(), '2:7');
    expect(qtdEnt().value).toBe('3');
    expect(limite().textContent).toBe('Daqui podem sair até 3 PC.');
  });

  test('[RN-268.11] limite 0: a quantidade fica e a janela avisa (nada some da entrega sem o almoxarife ver)', async () => {
    requisicao = emSeparacao([ITEM1]);
    saldos = [B01, B02({ separado_outras: 6, sobra: 0 })];
    await abrir();
    escolher(selectEnt(), '2:7');
    expect(qtdEnt().value).toBe('5');
    expect(limite().textContent).toBe('Daqui só podem sair 0 PC nesta entrega. Diminua a quantidade ou escolha outro endereço.');
    expect(confirmar().disabled).toBe(true);
  });

  test('[RN-268.10 lote] o lote com peça presa (lote_livre 2) limita abaixo da sobra da prateleira', async () => {
    requisicao = emSeparacao([ITEM1]);
    saldos = [B01, B02({ lote_livre: 2, lote_bloqueado: 3 })];
    await abrir();
    escolher(selectEnt(), '2:7');
    expect(qtdEnt().value).toBe('2');
    expect(limite().textContent).toBe('Daqui podem sair até 2 PC.');
  });
});

describe('Etapa 268 — limiteDaOrigemNaEntrega (a conta)', () => {
  const opcoes = [B01, B02()];
  test('[RN-268.10] sem origem guardada: a sobra; a própria origem: o maior entre a parte e a conta; automático/escolha especial: null', () => {
    const semOrigem = { ...ITEM_BASE, quantidade_separada: 5 };
    expect(limiteDaOrigemNaEntrega(semOrigem, '2:7', opcoes, [semOrigem], {}, {})).toBe(4);
    expect(limiteDaOrigemNaEntrega(semOrigem, '1:7', opcoes, [semOrigem], {}, {})).toBe(8);
    // a própria origem (o par exato): o maior entre a parte (5) e a conta (8) — a porta só confere a E1 acima da parte
    expect(limiteDaOrigemNaEntrega(ITEM1, '1:7', opcoes, [ITEM1], {}, {})).toBe(8);
    expect(limiteDaOrigemNaEntrega(ITEM1, '1:7', [linha({ ...B01, separado_outras: 6, sobra: 2 })], [ITEM1], {}, {})).toBe(5);
    expect(limiteDaOrigemNaEntrega(ITEM1, '', opcoes, [ITEM1], {}, {})).toBeNull();
    expect(limiteDaOrigemNaEntrega(ITEM1, '__escolher__', opcoes, [ITEM1], {}, {})).toBeNull();
  });
  test('[RN-268.10 sem lote na planejada, B1638] origem guardada em B-02 SEM lote: escolher (B-02, L1) não é o par exato — limita (4)', () => {
    const it = { ...ITEM1, origem_separacao_id: 2, lote_separacao_id: null };
    expect(limiteDaOrigemNaEntrega(it, '2:7', opcoes, [it], {}, {})).toBe(4);
  });
  test('[B1636] o irmão com guarda no par: o que fica (parte − o que ele entrega) + o que ele tira dali', () => {
    const irmao = { ...ITEM2, quantidade_solicitada: 3, quantidade_separada: 3, quantidade_origem_separacao: 3, quantidade_entregavel: 3 };
    const itens = [ITEM1, irmao];
    // não entrega: fica 3 -> 4 − 3 = 1
    expect(limiteDaOrigemNaEntrega(ITEM1, '2:7', opcoes, itens, {}, {})).toBe(1);
    // entrega 2 de outro lugar (automático): fica ao menos 1 -> 3
    expect(limiteDaOrigemNaEntrega(ITEM1, '2:7', opcoes, itens, { 2: 2 }, { 2: { valor: '', automatico: true } })).toBe(3);
    // entrega 2 pela planejada (sem escolha): fica 1 e tira 2 dali -> 1
    expect(limiteDaOrigemNaEntrega(ITEM1, '2:7', opcoes, itens, { 2: 2 }, {})).toBe(1);
    // entrega 2 escolhendo B-02 à mão: o mesmo
    expect(limiteDaOrigemNaEntrega(ITEM1, '2:7', opcoes, itens, { 2: 2 }, { 2: { valor: '2:7' } })).toBe(1);
  });
  test('[B1636] irmão sem guarda que escolheu o mesmo par: o que ele tira; outro material: nada', () => {
    const irmao = { ...ITEM_BASE, id: 3, quantidade_separada: 2 };
    const outroMat = { ...ITEM_BASE, id: 4, material_id: 11, quantidade_separada: 2 };
    expect(limiteDaOrigemNaEntrega(ITEM1, '2:7', opcoes, [ITEM1, irmao, outroMat], { 3: 1, 4: 2 },
      { 3: { valor: '2:7' }, 4: { valor: '2:7' } })).toBe(3);
  });
});
