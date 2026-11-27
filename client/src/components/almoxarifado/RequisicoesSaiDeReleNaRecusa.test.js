/**
 * Etapa 267 (T2, C473, B1631/B1632) — a janela de separação e a de entrega releem o "Sai de" (e a separação, a sugestão da Fila) quando a
 * confirmação é recusada porque o saldo da prateleira mudou: outra requisição separou dali ("… já está separado dali para outra
 * requisição …", a frase do lote "… já separadas dele …") ou o físico não cobre mais ("O saldo em X (2) não cobre a quantidade (4) …").
 * Antes o número era o de quando a janela abriu (C473): a opção recusada ficava escolhida com o número velho e o clique seguinte era
 * recusado de novo. A escolha do almoxarife e as quantidades ficam (RN-189.05); o item que ele não mexeu é decidido de novo.
 *
 * Plano: docs/superpowers/plans/2026-11-26-almoxarifado-etapa267-sai-de-atualizado-e-entrega-so-com-lote.md
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesSaiDeReleNaRecusa --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import RequisicoesList, { recusaReleOSaiDe } from './RequisicoesList';
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
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 4,
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
const aprovada = (itens = [{}]) => ({
  ...REQ_BASE, status: 'APROVADO', itens: itens.map((extra, i) => ({ ...ITEM_BASE, id: i + 1, ...extra })),
});
// Separado 6 no automático, entregue 2: a entrega de 4 (Completar Entrega).
const separada = () => ({
  ...REQ_BASE, status: 'PARCIALMENTE_ATENDIDA',
  itens: [{ ...ITEM_BASE, quantidade_solicitada: 6, quantidade_separada: 6, quantidade_entregue: 2, quantidade_atendida: 2,
    quantidade_entregavel: 4 }],
});

const linha = (extra) => ({ material_id: 10, separado_outras: 0, lote_livre: null, lote_bloqueado: null, lote_inspecao: null,
  lote_status: 'ATIVO', lote_esta_impedido: false, lote_vencido_sem_liberacao: false, ...extra });
const XB01 = (outras = 0) => linha({ id: 1, localizacao_id: 1, localizacao_codigo: 'XB-01', lote_id: 7, lote: 'L1', quantidade: 6,
  separado_outras: outras, sobra: 6 - outras });
const XB02 = linha({ id: 2, localizacao_id: 2, localizacao_codigo: 'XB-02', lote_id: 7, lote: 'L1', quantidade: 5, sobra: 5 });
const PAR = {
  XB01: { localizacao_id: 1, localizacao_codigo: 'XB-01', caminho: 'ALM / XB-01', lote_id: 7, lote_codigo: 'L1', lote_validade: null },
  XB02: { localizacao_id: 2, localizacao_codigo: 'XB-02', caminho: 'ALM / XB-02', lote_id: 7, lote_codigo: 'L1', lote_validade: null },
};
const pegar = (par, q, livre) => ({ ...par, quantidade_no_endereco: livre, quantidade_sugerida: q, cobre: true });
const sugItem = (item_id, pegar_em) => ({ item_id, separavel: 4, pegar_em, pegar_em_aviso: null, pegar_em_alerta: null });
const sugestao = (...itens) => ({ data: { requisicao_id: 55, itens, ordem_coleta: [] } });

const RECUSA_SEP = 'Chapa 3mm: em XB-01, lote L1 há 6 para esta separação, mas 4 já está separado dali para outra requisição (REQ-054); '
  + 'sobra 2, que não cobre a quantidade (4). Escolha outro endereço ou reabra a janela para ver a sugestão atual';
const RECUSA_ENT = 'Chapa 3mm: em XB-01, lote L1 há 6 para esta entrega, mas 4 já está separado dali para outra requisição (REQ-054); '
  + 'sobra 2, que não cobre a quantidade (4). Escolha outro endereço ou deixe "Qualquer endereço (automático)"';
const SUGERIDO = 'Sugerido pela fila de separação. Se pegou de outro endereço, troque aqui.';

let container;
let root;
let requisicao;
let saldos;
let sugestaoAtual;

const recusar = (msg, status = 400) => Promise.reject(Object.assign(new Error(msg), { response: { status, data: { error: msg } } }));

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  saldos = [XB01(), XB02];
  sugestaoAtual = sugestao(sugItem(1, pegar(PAR.XB01, 4, 6)));
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...lin } = requisicao;
      return Promise.resolve({ data: [lin] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    if (url === '/almoxarifado/estoque/10/saldos?requisicao_id=55') return Promise.resolve({ data: saldos });
    if (url === '/almoxarifado/requisicoes/55/sugestao-coleta') return Promise.resolve(sugestaoAtual);
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
const selectSep = (id = 1) => container.querySelector(`#separacao-origem-${id}`);
const selectEnt = () => container.querySelector('#entrega-origem-1');
const fraseDe = (id = 1) => container.querySelector(`#separacao-sugestao-${id}`);
const textos = (select) => [...select.options].map((o) => o.textContent);
const leiturasSaldos = () => api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/estoque/10/saldos?requisicao_id=55').length;
const leiturasSugestao = () => api.get.mock.calls.filter((c) => c[0] === '/almoxarifado/requisicoes/55/sugestao-coleta').length;
// A outra requisição separou 4 de XB-01/L1 enquanto a janela estava aberta; a Fila agora manda a XB-02.
const outraSeparou = () => {
  saldos = [XB01(4), XB02];
  sugestaoAtual = sugestao(sugItem(1, pegar(PAR.XB02, 4, 5)));
};

describe('Etapa 267: o "Sai de" se atualiza depois de uma recusa (C473)', () => {
  test('[RN-267.01/02] separação recusada pelo separado de outra -> a lista mostra a sobra e a sugestão nova vem escolhida, sem fechar', async () => {
    requisicao = aprovada();
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectSep().value).toBe('1:7');
    expect(textos(selectSep())).toContain('XB-01 — lote L1 (6)');
    outraSeparou();
    api.put.mockImplementationOnce(() => recusar(RECUSA_SEP));
    await clicar('Confirmar Separação');
    expect(toast.error).toHaveBeenCalledWith(RECUSA_SEP);
    expect(selectSep()).not.toBeNull(); // a janela continua aberta
    expect(textos(selectSep())).toContain('XB-01 — lote L1 (sobra 2 de 6; 4 para outras)');
    expect(selectSep().value).toBe('2:7');
    expect(fraseDe().textContent).toBe(SUGERIDO);
    expect(leiturasSugestao()).toBe(2);
    api.put.mockResolvedValueOnce({ data: {} });
    await clicar('Confirmar Separação');
    const ultimo = api.put.mock.calls[api.put.mock.calls.length - 1];
    expect(ultimo[1].itens_separados[0]).toEqual({ item_id: 1, quantidade_separada: 4, localizacao_origem_id: 2, lote_id: 7 });
  });

  test('[RN-267.02] o "Sai de" que o almoxarife trocou à mão fica', async () => {
    requisicao = aprovada([{}, { quantidade_solicitada: 1 }]);
    sugestaoAtual = sugestao(sugItem(1, pegar(PAR.XB01, 4, 6)), sugItem(2, pegar(PAR.XB01, 1, 6)));
    await renderizar();
    await clicar('Iniciar Separação');
    expect(selectSep(1).value).toBe('1:7');
    escolher(selectSep(2), '');
    saldos = [XB01(4), XB02];
    sugestaoAtual = sugestao(sugItem(1, pegar(PAR.XB02, 4, 5)), sugItem(2, pegar(PAR.XB02, 1, 1)));
    api.put.mockImplementationOnce(() => recusar(RECUSA_SEP));
    await clicar('Confirmar Separação');
    expect(selectSep(1).value).toBe('2:7'); // não mexido: decidido de novo
    expect(selectSep(2).value).toBe(''); // trocado à mão (automático): fica
  });

  test('[RN-267.02] o automático escolhido ANTES de a sugestão chegar fica (decisão do almoxarife)', async () => {
    requisicao = aprovada();
    let soltar;
    sugestaoAtual = new Promise((r) => { soltar = r; });
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSep(), '');
    await act(async () => { soltar(sugestao(sugItem(1, pegar(PAR.XB01, 4, 6)))); await Promise.resolve(); });
    expect(selectSep().value).toBe('');
    expect(fraseDe()).toBeNull();
    outraSeparou();
    api.put.mockImplementationOnce(() => recusar(RECUSA_SEP));
    await clicar('Confirmar Separação');
    expect(leiturasSugestao()).toBe(2);
    expect(textos(selectSep())).toContain('XB-01 — lote L1 (sobra 2 de 6; 4 para outras)');
    expect(selectSep().value).toBe('');
  });

  test('[RN-267.04] recusa por outro motivo -> nada é relido; 409 fecha como antes', async () => {
    requisicao = aprovada();
    await renderizar();
    await clicar('Iniciar Separação');
    const antes = [leiturasSaldos(), leiturasSugestao()];
    outraSeparou();
    api.put.mockImplementationOnce(() => recusar('Informe o motivo da divergência'));
    await clicar('Confirmar Separação');
    expect([leiturasSaldos(), leiturasSugestao()]).toEqual(antes);
    expect(selectSep().value).toBe('1:7');
    expect(textos(selectSep())).toContain('XB-01 — lote L1 (6)');
  });

  test('[RN-267.04] a releitura falha -> a lista anterior fica', async () => {
    requisicao = aprovada();
    await renderizar();
    await clicar('Iniciar Separação');
    const getOriginal = api.get.getMockImplementation();
    api.get.mockImplementation((url) => (url.includes('/saldos') || url.includes('sugestao-coleta')
      ? Promise.reject(new Error('rede')) : getOriginal(url)));
    api.put.mockImplementationOnce(() => recusar(RECUSA_SEP));
    await clicar('Confirmar Separação');
    expect(textos(selectSep())).toContain('XB-01 — lote L1 (6)');
    expect(selectSep().value).toBe('1:7');
  });

  test('[RN-267.03] entrega recusada pela E1 -> a lista mostra a sobra; a escolha fica', async () => {
    requisicao = separada();
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEnt(), '1:7');
    expect(textos(selectEnt())).toContain('XB-01 — lote L1 (6)');
    saldos = [XB01(4), XB02];
    api.put.mockImplementationOnce(() => recusar(RECUSA_ENT));
    await clicar('✅ Confirmar Entrega');
    expect(toast.error).toHaveBeenCalledWith(RECUSA_ENT);
    expect(selectEnt()).not.toBeNull();
    expect(textos(selectEnt())).toContain('XB-01 — lote L1 (sobra 2 de 6; 4 para outras)');
    expect(selectEnt().value).toBe('1:7');
  });

  // Fase 5 da 267 (reproduzido): a prateleira escolhida esvaziou e some da lista relida — o select mostrava "automático" e o clique seguinte
  // mandava a prateleira sumida. Agora a escolha vira o automático que a tela mostra.
  test('[RN-267.03 Fase 5] entrega: a prateleira escolhida esvaziou -> some da lista e o próximo clique vai no automático', async () => {
    requisicao = separada();
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEnt(), '1:7');
    saldos = [XB02];
    api.put.mockImplementationOnce(() => recusar('Chapa 3mm: O saldo em XB-01 (0) não cobre a quantidade (4) — a saída tiraria de outros endereços'));
    await clicar('✅ Confirmar Entrega');
    expect(textos(selectEnt()).some((t) => t.startsWith('XB-01'))).toBe(false);
    expect(selectEnt().value).toBe('');
    api.put.mockResolvedValueOnce({ data: { parcial: true } });
    await clicar('✅ Confirmar Entrega');
    const ultimo = api.put.mock.calls[api.put.mock.calls.length - 1][1].itens_atendidos[0];
    expect(ultimo.localizacao_origem_id).toBeUndefined();
    expect(ultimo.quantidade_atendida).toBe(4);
  });

  test('[RN-267.02 Fase 5] separação: a escolha à mão que esvaziou -> automático, e o PUT vai sem prateleira', async () => {
    requisicao = aprovada();
    await renderizar();
    await clicar('Iniciar Separação');
    escolher(selectSep(), '2:7');
    saldos = [XB01()];
    sugestaoAtual = sugestao(sugItem(1, pegar(PAR.XB01, 4, 6)));
    api.put.mockImplementationOnce(() => recusar('Chapa 3mm: O saldo em XB-02 (0) não cobre a quantidade (4) — a saída tiraria de outros endereços'));
    await clicar('Confirmar Separação');
    expect(selectSep().value).toBe('');
    api.put.mockResolvedValueOnce({ data: {} });
    await clicar('Confirmar Separação');
    const ultimo = api.put.mock.calls[api.put.mock.calls.length - 1][1].itens_separados[0];
    expect(ultimo).toEqual({ item_id: 1, quantidade_separada: 4 });
  });

  test('[RN-267.03] entrega: recusa de permissão não relê', async () => {
    requisicao = separada();
    await renderizar();
    await clicar('Completar Entrega');
    escolher(selectEnt(), '1:7');
    const antes = leiturasSaldos();
    saldos = [XB01(4), XB02];
    api.put.mockImplementationOnce(() => recusar('Sem permissão para entregar', 403));
    await clicar('✅ Confirmar Entrega');
    expect(leiturasSaldos()).toBe(antes);
    expect(textos(selectEnt())).toContain('XB-01 — lote L1 (6)');
  });

  test('[B1631] a expressão casa as frases de saldo e não as outras', () => {
    expect(recusaReleOSaiDe(RECUSA_SEP)).toBe(true);
    expect(recusaReleOSaiDe(RECUSA_ENT)).toBe(true);
    expect(recusaReleOSaiDe('Mat: no lote L1 há 6 PC, mas só 1 pode sair nesta entrega: 1 PC já separada dele para outras requisições ou '
      + 'outras peças desta; não cobre a quantidade (2). Escolha outro lote ou deixe "Qualquer endereço (automático)"')).toBe(true);
    expect(recusaReleOSaiDe('Mat: em XB-01 há 3 para esta entrega, mas 1 já está separado dali para outra peça desta requisição; sobra 2, '
      + 'que não cobre a quantidade (3). Escolha outro endereço ou deixe "Qualquer endereço (automático)"'))
      .toBe(true);
    expect(recusaReleOSaiDe('Mat: O saldo em XB-01 (2) não cobre a quantidade (4) — a saída tiraria de outros endereços')).toBe(true);
    expect(recusaReleOSaiDe('Informe o motivo da divergência')).toBe(false);
    expect(recusaReleOSaiDe('Sem permissão para entregar')).toBe(false);
    expect(recusaReleOSaiDe(undefined)).toBe(false);
  });
});

