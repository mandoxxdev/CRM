/**
 * Etapa 98 (T4) — devolver da caixa à prateleira, na tela do detalhe da requisição (modo almoxarifado).
 *
 * - Na linha do item com caixa > 0 (separado − entregue) e status em `STATUS_COM_CAIXA` (espelho da máquina do
 *   servidor em `requisicaoLabels.js`, conferido pelo teste de API `devolverListaTelaRota.api.test.js`), o botão
 *   "Devolver à prateleira" abre o modal — antes passa por `bloquearSeNaoPode('separar_emitir', e)`.
 * - O modal pede quantidade (padrão = a caixa, máx. a caixa) e motivo obrigatório; avisa a reserva que fica, a volta
 *   da *Pronta* para *Em Separação* e a conferência que será refeita. Manda `PUT /devolver-separado` com o body do
 *   contrato `{ motivo, itens: [{ item_id, quantidade }] }`; o erro do servidor vai ao toast com a literal.
 * - O histórico "Devolvido à prateleira" lê `devolucoes_caixa` do detalhe.
 * - Fase 2 (B-1): *Parcialmente Atendida* com a conferência obrigatória e limpa ganha "Separar de novo para conferir"
 *   (`PUT /separar` com `itens_separados: []` → *Em Separação*, onde o "Conferir separação" existe).
 * - O *title* do "Ajustar Separação" deixa de prometer "corrige as quantidades" (ele só soma).
 *
 * Mock só na fronteira HTTP (`services/api`), no toast e no contexto de permissão/usuário.
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesDevolverPrateleira --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import RequisicoesList from './RequisicoesList';
import { STATUS_COM_CAIXA } from './requisicaoLabels';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

const mockBloquear = jest.fn(() => true);
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ALMOXARIFE', pode: () => true, bloquearSeNaoPode: (...a) => mockBloquear(...a), loading: false,
  }),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'user' } }),
}));

jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, unidade: 'PC', quantidade_solicitada: 4,
  quantidade_separada: 4, quantidade_entregue: 0, quantidade_atendida: 0, quantidade_reservada_item: 0,
  saldo_atual: 8, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
};
const REQ = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', status: 'EM_SEPARACAO',
  solicitante_id: 7, solicitante_nome: 'Maria', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-09-30T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
  separacoes: [], substituicoes: [], devolucoes_caixa: [], conferencia: null, conferencia_obrigatoria: false,
};
const montar = (over = {}, itens = [{}]) => ({ ...REQ, ...over, itens: itens.map((i, k) => ({ ...ITEM, id: k + 1, ...i })) });

const D7 = 'Chapa 3mm: não é possível devolver 5 PC à prateleira. Na caixa: 4 (separado: 4, entregue: 0)';
const D409 = 'A caixa desta requisição mudou enquanto a devolução era registrada; recarregue e confira antes de devolver de novo.';
const erro = (status, msg) => Object.assign(new Error(msg), { response: { status, data: { error: msg } } });

let container;
let root;
let requisicao;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockBloquear.mockImplementation(() => true);
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    return Promise.resolve({ data: [] });
  });
  api.put.mockResolvedValue({ data: { success: true, status: 'EM_SEPARACAO', conferencia_limpa: false, devolucoes: [] } });
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

const botaoPorTexto = (texto) => [...container.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));
const botaoDevolverItem = (id) => container.querySelector(`[data-testid="devolver-prateleira-${id}"]`);
const modal = () => container.querySelector('[data-testid="modal-devolver-prateleira"]');
const inputQtd = () => container.querySelector('[data-testid="devolver-quantidade"]');
const campoMotivo = () => container.querySelector('[data-testid="devolver-motivo"]');
const confirmar = () => container.querySelector('[data-testid="devolver-confirmar"]');
const getsDe = (url) => api.get.mock.calls.filter((c) => c[0] === url).length;
const putsEm = (url) => api.put.mock.calls.filter((c) => c[0] === url);

const digitar = (el, valor) => {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

async function abrirModal(id = 1) {
  const b = botaoDevolverItem(id);
  expect(b).toBeTruthy();
  await act(async () => { b.click(); });
  expect(modal()).toBeTruthy();
}

describe('Etapa 98 — Devolver à prateleira (o botão)', () => {
  test('[98 T4] STATUS_COM_CAIXA tem os 9 status da máquina do servidor', () => {
    expect([...STATUS_COM_CAIXA].sort()).toEqual([
      'AGUARDANDO_APROVACAO_VALOR', 'AGUARDANDO_COMPRA', 'AGUARDANDO_ESTOQUE', 'APROVADO', 'EM_SEPARACAO',
      'PARCIALMENTE_ATENDIDA', 'PARCIALMENTE_RESERVADA', 'PRONTA_PARA_RETIRADA', 'TOTALMENTE_RESERVADA',
    ]);
  });

  test('[98 T4] aparece só no item com caixa > 0 (sem separado, ou tudo entregue: não aparece)', async () => {
    requisicao = montar({}, [
      { quantidade_separada: 4 },
      { quantidade_separada: 0, material_nome: 'Parafuso' },
      { quantidade_separada: 2, quantidade_entregue: 2, quantidade_atendida: 2, material_nome: 'Arruela' },
    ]);
    await renderizar();
    expect(botaoDevolverItem(1)).toBeTruthy();
    expect(botaoDevolverItem(1).textContent).toContain('Devolver à prateleira');
    expect(botaoDevolverItem(2)).toBeFalsy();
    expect(botaoDevolverItem(3)).toBeFalsy();
  });

  test.each([...STATUS_COM_CAIXA])('[98 T4] aparece em %s com caixa', async (status) => {
    requisicao = montar({ status });
    await renderizar();
    expect(botaoDevolverItem(1)).toBeTruthy();
  });

  test.each(['ENTREGUE', 'ENCERRADA', 'CANCELADO', 'PENDENTE', 'RASCUNHO'])(
    '[98 T4] não aparece em %s, mesmo com separado > entregue', async (status) => {
      requisicao = montar({ status }, [{ quantidade_separada: 4, quantidade_entregue: 2, quantidade_atendida: 2 }]);
      await renderizar();
      expect(container.textContent).toContain('Chapa 3mm');
      expect(botaoDevolverItem(1)).toBeFalsy();
    });

  test('[98 T4] passa por bloquearSeNaoPode(separar_emitir) antes de abrir; recusado, o modal não abre', async () => {
    requisicao = montar();
    await renderizar();
    mockBloquear.mockImplementation(() => false);
    await act(async () => { botaoDevolverItem(1).click(); });
    expect(mockBloquear).toHaveBeenCalledWith('separar_emitir', expect.anything());
    expect(modal()).toBeFalsy();
  });
});

describe('Etapa 98 Fase 5 — "Liberar para Retirada" segue a caixa, não o separado', () => {
  // O servidor passou a recusar o liberar com a caixa vazia (separado 2, entregue 2 numa Em Separação) — antes ela
  // virava Pronta presa. O botão espelha: some com a caixa 0, aparece com qualquer caixa > 0.
  test('[98 F5] Em Separação com separado 2 e entregue 2 (caixa 0): sem "Liberar para Retirada"', async () => {
    requisicao = montar({}, [{ quantidade_separada: 2, quantidade_entregue: 2, quantidade_atendida: 2 }]);
    await renderizar();
    expect(botaoPorTexto('Ajustar Separação')).toBeTruthy();
    expect(botaoPorTexto('Liberar para Retirada')).toBeFalsy();
  });

  test('[98 F5] Em Separação com caixa > 0 em algum item (inclusive fração): "Liberar para Retirada" aparece', async () => {
    requisicao = montar({}, [
      { quantidade_separada: 2, quantidade_entregue: 2, quantidade_atendida: 2 },
      { quantidade_separada: 0.7, quantidade_entregue: 0.4, quantidade_atendida: 0.4, material_nome: 'Cabo' },
    ]);
    await renderizar();
    expect(botaoPorTexto('Liberar para Retirada')).toBeTruthy();
  });
});

describe('Etapa 98 — Devolver à prateleira (o modal)', () => {
  test('[98 T4] título, caixa, quantidade padrão = caixa (máx. a caixa, step any) e o texto fixo', async () => {
    requisicao = montar({}, [{ quantidade_separada: 4, quantidade_entregue: 1, quantidade_atendida: 1 }]);
    await renderizar();
    await abrirModal();
    expect(modal().textContent).toContain('Devolver à prateleira — Chapa 3mm');
    expect(modal().textContent).toContain('Na caixa: 3 PC');
    expect(inputQtd().value).toBe('3');
    expect(inputQtd().getAttribute('max')).toBe('3');
    expect(inputQtd().getAttribute('step')).toBe('any');
    expect(modal().textContent).toContain('Motivo (obrigatório)');
    expect(modal().textContent).toContain('O material volta para a prateleira de onde foi separado — não há movimentação '
      + 'de estoque. Se quebrou ou se perdeu, dê a baixa (Perda) depois.');
  });

  test('[98 T4] Devolver desabilitado sem motivo (ou só espaços) e com quantidade fora de (0, caixa]', async () => {
    requisicao = montar();
    await renderizar();
    await abrirModal();
    expect(confirmar().disabled).toBe(true);
    digitar(campoMotivo(), '   ');
    expect(confirmar().disabled).toBe(true);
    digitar(campoMotivo(), 'quebrou');
    expect(confirmar().disabled).toBe(false);
    digitar(inputQtd(), '0');
    expect(confirmar().disabled).toBe(true);
    digitar(inputQtd(), '-1');
    expect(confirmar().disabled).toBe(true);
    digitar(inputQtd(), '5');
    expect(confirmar().disabled).toBe(true);
    digitar(inputQtd(), '');
    expect(confirmar().disabled).toBe(true);
    digitar(inputQtd(), '4');
    expect(confirmar().disabled).toBe(false);
  });

  test('[98 T4] o PUT leva o body do contrato; sucesso: toast e recarrega detalhe e lista', async () => {
    requisicao = montar({}, [{ quantidade_separada: 0, material_nome: 'Parafuso' }, { quantidade_separada: 4 }]);
    await renderizar();
    const detalheAntes = getsDe('/almoxarifado/requisicoes/55');
    const listaAntes = getsDe('/almoxarifado/requisicoes');
    await abrirModal(2);
    digitar(inputQtd(), '2');
    digitar(campoMotivo(), '  quebrou no transporte  ');
    await act(async () => { confirmar().click(); });
    const chamadas = putsEm('/almoxarifado/requisicoes/55/devolver-separado');
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0][1]).toEqual({ motivo: 'quebrou no transporte', itens: [{ item_id: 2, quantidade: 2 }] });
    expect(toast.success).toHaveBeenCalledWith('Devolvido à prateleira');
    expect(modal()).toBeFalsy();
    expect(getsDe('/almoxarifado/requisicoes/55')).toBeGreaterThan(detalheAntes);
    expect(getsDe('/almoxarifado/requisicoes')).toBeGreaterThan(listaAntes);
  });

  test('[98 T4] fração: a quantidade vai como número', async () => {
    requisicao = montar({}, [{ quantidade_separada: 1.5 }]);
    await renderizar();
    await abrirModal();
    digitar(inputQtd(), '0.25');
    digitar(campoMotivo(), 'sobra');
    await act(async () => { confirmar().click(); });
    expect(putsEm('/almoxarifado/requisicoes/55/devolver-separado')[0][1])
      .toEqual({ motivo: 'sobra', itens: [{ item_id: 1, quantidade: 0.25 }] });
  });

  test('[98 T4] aviso da reserva: aparece com quantidade_reservada_item > 0, não sem', async () => {
    const AVISO = 'Este item continua reservado para a requisição: para dar baixa, libere a reserva antes.';
    requisicao = montar({}, [{ quantidade_reservada_item: 4 }]);
    await renderizar();
    await abrirModal();
    expect(modal().textContent).toContain(AVISO);
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = montar({}, [{ quantidade_reservada_item: 0 }]);
    await renderizar();
    await abrirModal();
    expect(modal().textContent).not.toContain(AVISO);
  });

  test('[98 T4] aviso da Pronta: aparece em Pronta para Retirada, não em Em Separação', async () => {
    const AVISO = 'A requisição volta para Em Separação.';
    requisicao = montar({ status: 'PRONTA_PARA_RETIRADA' });
    await renderizar();
    await abrirModal();
    expect(modal().textContent).toContain(AVISO);
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = montar({ status: 'EM_SEPARACAO' });
    await renderizar();
    await abrirModal();
    expect(modal().textContent).not.toContain(AVISO);
  });

  test('[98 T4] aviso da conferência: aparece com conferência gravada, não sem', async () => {
    const AVISO = 'A segunda conferência será refeita.';
    requisicao = montar({ conferencia: { usuario_id: 3, usuario_nome: 'Conferente', em: '2026-10-09 10:00:00' },
      conferencia_obrigatoria: true }, [{ material_critico: 1 }]);
    await renderizar();
    await abrirModal();
    expect(modal().textContent).toContain(AVISO);
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = montar();
    await renderizar();
    await abrirModal();
    expect(modal().textContent).not.toContain(AVISO);
  });

  test('[98 T4] 400 do servidor: o toast leva a literal (D7) e o modal fica aberto', async () => {
    requisicao = montar();
    await renderizar();
    await abrirModal();
    digitar(campoMotivo(), 'quebrou');
    api.put.mockRejectedValue(erro(400, D7));
    await act(async () => { confirmar().click(); });
    expect(toast.error).toHaveBeenCalledWith(D7);
    expect(toast.success).not.toHaveBeenCalled();
    expect(modal()).toBeTruthy();
  });

  test('[98 T4] 409 (D409): o toast leva a literal, o modal fecha e o detalhe recarrega', async () => {
    requisicao = montar();
    await renderizar();
    await abrirModal();
    digitar(campoMotivo(), 'quebrou');
    const antes = getsDe('/almoxarifado/requisicoes/55');
    api.put.mockRejectedValue(erro(409, D409));
    await act(async () => { confirmar().click(); });
    expect(toast.error).toHaveBeenCalledWith(D409);
    expect(modal()).toBeFalsy();
    expect(getsDe('/almoxarifado/requisicoes/55')).toBeGreaterThan(antes);
  });
});

describe('Etapa 98 — o histórico "Devolvido à prateleira"', () => {
  test('[98 T4] lista devolucoes_caixa: data, usuário, material, quantidade e motivo', async () => {
    requisicao = montar({ devolucoes_caixa: [
      { id: 7, item_id: 1, material_id: 10, material_codigo: 'MAT-1', quantidade: 2, separado_antes: 4,
        separado_depois: 2, entregue: 0, localizacao_planejada_codigo: 'A-01', lote_planejado_codigo: null,
        motivo: 'quebrou', status_antes: 'PRONTA_PARA_RETIRADA', status_depois: 'EM_SEPARACAO',
        conferencia_limpa: false, usuario_id: 99, usuario_nome: 'Almoxarife Teste', created_at: '2026-10-09 14:30:00' },
      { id: 8, item_id: 1, material_id: 10, material_codigo: 'MAT-1', quantidade: 1, separado_antes: 2,
        separado_depois: 1, entregue: 0, localizacao_planejada_codigo: null, lote_planejado_codigo: null,
        motivo: 'perdido', status_antes: 'EM_SEPARACAO', status_depois: 'EM_SEPARACAO',
        conferencia_limpa: true, usuario_id: 98, usuario_nome: 'Outro Almox', created_at: '2026-10-09 15:00:00' },
    ] });
    await renderizar();
    const bloco = container.querySelector('[data-testid="devolucoes-caixa"]');
    expect(bloco).toBeTruthy();
    expect(bloco.textContent).toContain('Devolvido à prateleira (2)');
    const l7 = container.querySelector('[data-testid="devolucao-caixa-7"]').textContent;
    expect(l7).toContain('MAT-1');
    expect(l7).toContain('Chapa 3mm');
    expect(l7).toContain('2 PC');
    expect(l7).toContain('quebrou');
    expect(l7).toContain('Almoxarife Teste');
    expect(l7).toContain('09/10/26');
    const l8 = container.querySelector('[data-testid="devolucao-caixa-8"]').textContent;
    expect(l8).toContain('perdido');
    expect(l8).toContain('Outro Almox');
    expect(l8).toContain('conferência refeita');
  });

  test('[98 T4] sem devoluções (ou sem o campo), o bloco não aparece', async () => {
    requisicao = montar({ devolucoes_caixa: undefined });
    await renderizar();
    expect(container.textContent).toContain('Chapa 3mm');
    expect(container.querySelector('[data-testid="devolucoes-caixa"]')).toBeFalsy();
  });
});

describe('Etapa 98 — Ajustar Separação e o achado 1(a) da Fase 2', () => {
  test('[98 T4] o title do "Ajustar Separação" manda devolver à prateleira; o rótulo não muda', async () => {
    requisicao = montar();
    await renderizar();
    const b = botaoPorTexto('Ajustar Separação');
    expect(b).toBeTruthy();
    expect(b.getAttribute('title'))
      .toBe('Separa mais quantidade — para tirar da caixa, use Devolver à prateleira no item');
  });

  const PARCIAL_SEM_CONFERENCIA = () => montar({ status: 'PARCIALMENTE_ATENDIDA', conferencia: null,
    conferencia_obrigatoria: true }, [{ quantidade_separada: 3, quantidade_entregue: 2, quantidade_atendida: 2,
    material_critico: 1 }]);

  test('[98 T4] Parcialmente Atendida com conferência obrigatória e limpa: "Separar de novo para conferir" manda itens_separados: []', async () => {
    requisicao = PARCIAL_SEM_CONFERENCIA();
    await renderizar();
    const b = botaoPorTexto('Separar de novo para conferir');
    expect(b).toBeTruthy();
    const antes = getsDe('/almoxarifado/requisicoes/55');
    await act(async () => { b.click(); });
    expect(mockBloquear).toHaveBeenCalledWith('separar_emitir', expect.anything());
    const chamadas = putsEm('/almoxarifado/requisicoes/55/separar');
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0][1]).toEqual({ itens_separados: [] });
    expect(getsDe('/almoxarifado/requisicoes/55')).toBeGreaterThan(antes);
  });

  test('[98 T4] "Separar de novo para conferir" recusado pela permissão não chama o servidor', async () => {
    requisicao = PARCIAL_SEM_CONFERENCIA();
    await renderizar();
    mockBloquear.mockImplementation(() => false);
    await act(async () => { botaoPorTexto('Separar de novo para conferir').click(); });
    expect(putsEm('/almoxarifado/requisicoes/55/separar')).toHaveLength(0);
  });

  test('[98 T4] "Separar de novo para conferir": o erro do servidor vai ao toast', async () => {
    requisicao = PARCIAL_SEM_CONFERENCIA();
    await renderizar();
    api.put.mockRejectedValue(erro(400, 'Transição inválida'));
    await act(async () => { botaoPorTexto('Separar de novo para conferir').click(); });
    expect(toast.error).toHaveBeenCalledWith('Transição inválida');
  });

  test('[98 T4] não aparece com a conferência gravada, sem conferência obrigatória, nem em Em Separação', async () => {
    requisicao = montar({ status: 'PARCIALMENTE_ATENDIDA', conferencia_obrigatoria: true,
      conferencia: { usuario_id: 3, usuario_nome: 'Conferente', em: '2026-10-09 10:00:00' } },
    [{ quantidade_separada: 3, quantidade_entregue: 2, quantidade_atendida: 2, material_critico: 1 }]);
    await renderizar();
    expect(container.textContent).toContain('Encerrar Requisição');
    expect(botaoPorTexto('Separar de novo para conferir')).toBeFalsy();
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = montar({ status: 'PARCIALMENTE_ATENDIDA', conferencia_obrigatoria: false },
      [{ quantidade_separada: 3, quantidade_entregue: 2, quantidade_atendida: 2 }]);
    await renderizar();
    expect(container.textContent).toContain('Encerrar Requisição');
    expect(botaoPorTexto('Separar de novo para conferir')).toBeFalsy();
    act(() => root.unmount());
    root = createRoot(container);
    requisicao = montar({ status: 'EM_SEPARACAO', conferencia_obrigatoria: true }, [{ material_critico: 1 }]);
    await renderizar();
    expect(botaoPorTexto('Ajustar Separação')).toBeTruthy();
    expect(botaoPorTexto('Separar de novo para conferir')).toBeFalsy();
  });
});
