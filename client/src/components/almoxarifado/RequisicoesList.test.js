/**
 * Lista/detalhe de requisições — cobertura dos status de reserva da Etapa 4.
 *
 * Contexto do bug (achado na auditoria de 2026-08-11): a Etapa 4 fez a aprovação com saldo
 * cair em PARCIALMENTE_RESERVADA/TOTALMENTE_RESERVADA em vez de APROVADO, mas a tela nunca
 * aprendeu os dois status. Efeito: badge com a string crua, stepper voltando para "Criar",
 * e — o pior — o almoxarife sem os botões "Iniciar Separação" e "Cancelar Requisição"
 * exatamente no estado que é o caminho feliz de toda requisição aprovada com estoque.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
import { getRequisicaoStepIndex, REQUISICAO_FLOW } from './AlmoxPageHeader';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas por padrão: o alvo é o comportamento da tela, o gate real é do
// servidor. `mockPode` é mutável para os cenários da Etapa 15 que testam sumiço de botão
// por perfil (pode('separar_emitir') === false).
let mockPode = () => true;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR',
    pode: (acao) => mockPode(acao),
    bloquearSeNaoPode: (acao) => mockPode(acao),
    loading: false,
  }),
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));

jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm',
  material_unidade: 'PC', material_foto: null, quantidade_solicitada: 5,
  quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0,
  saldo_atual: 20, localizacao_nome: null, almoxarifado_nome: null,
};

const baseRequisicao = (status) => ({
  id: 55, numero: 'REQ-055', status, tipo: 'CONSUMO', urgencia: 'NORMAL',
  solicitante_id: 99, solicitante_nome: 'Almoxarife Teste', setor: 'Produção',
  justificativa: 'Teste', criado_em: '2026-08-10T10:00:00', data_necessidade: null,
  projeto_id: null, projeto_nome: null, os_id: null, os_referencia: null,
  centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
  itens: [ITEM],
});

let container;
let root;
let detalheDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockPode = () => true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = detalheDoBanco;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: detalheDoBanco });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') {
      return Promise.resolve({ data: { souAprovador: false } });
    }
    return Promise.resolve({ data: [] });
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

// ?id=55 na URL abre o painel de detalhe pelo caminho de deep-link do componente.
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

describe('status de reserva da Etapa 4 na tela de requisições', () => {
  test('stepper: os dois status apontam a etapa Separar, não o fallback "Criar"', () => {
    // idx = etapas concluídas; 2 = "Aprovar" concluída, "Separar" ativa (mesma casa de APROVADO).
    expect(getRequisicaoStepIndex('PARCIALMENTE_RESERVADA')).toBe(2);
    expect(getRequisicaoStepIndex('TOTALMENTE_RESERVADA')).toBe(2);
    expect(REQUISICAO_FLOW[2].key).toBe('separar');
  });

  test('TOTALMENTE_RESERVADA: badge amigável, Iniciar Separação e Cancelar presentes', async () => {
    detalheDoBanco = baseRequisicao('TOTALMENTE_RESERVADA');
    await renderizar();
    // A string crua aparecendo é exatamente o sintoma do bug (fallback do badge).
    expect(container.textContent).toContain('Totalmente Reservada');
    expect(container.textContent).not.toContain('TOTALMENTE_RESERVADA');
    expect(botaoPorTexto('Iniciar Separação')).toBeTruthy();
    expect(botaoPorTexto('Cancelar Requisição')).toBeTruthy();
  });

  test('PARCIALMENTE_RESERVADA: badge amigável e aviso de reserva parcial', async () => {
    detalheDoBanco = baseRequisicao('PARCIALMENTE_RESERVADA');
    await renderizar();
    expect(container.textContent).toContain('Parcialmente Reservada');
    expect(container.textContent).not.toContain('PARCIALMENTE_RESERVADA');
    // O banner precisa explicar que parte dos itens ficou sem reserva — sem isso o
    // almoxarife separa "tudo" achando que o saldo inteiro está garantido.
    expect(container.textContent).toMatch(/sem reserva/i);
    expect(botaoPorTexto('Iniciar Separação')).toBeTruthy();
    expect(botaoPorTexto('Cancelar Requisição')).toBeTruthy();
  });

  test('filtro de status oferece os dois status de reserva', async () => {
    detalheDoBanco = baseRequisicao('TOTALMENTE_RESERVADA');
    await renderizar();
    const valores = [...container.querySelectorAll('select option')].map((o) => o.value);
    expect(valores).toContain('PARCIALMENTE_RESERVADA');
    expect(valores).toContain('TOTALMENTE_RESERVADA');
  });
});

// ─── Etapa 15: assinatura digital na entrega (contratos C1/C2/C4 congelados) ────────────────
//
// Mock de fronteira HTTP é legítimo aqui: o teste programa contra o CONTRATO (POST multipart
// C1 e detalhe C2), não contra o backend — a prova cruzando o motor real é a Task 5.
describe('Etapa 15: colher assinatura do recebedor na entrega', () => {
  const ASSINATURA = {
    id: 1,
    recebedor_nome: 'Maria Recebedora',
    arquivo_url: '/api/uploads/almoxarifado/assinatura-abc.png',
    criado_em: '2026-08-28T14:00:00',
    criado_por_nome: 'Almoxarife Teste',
  };

  beforeEach(() => {
    // jsdom não implementa canvas 2D, toBlob nem pointer capture — o AssinaturaCanvas
    // renderiza dentro do fluxo. No beforeEach (não beforeAll) porque o CRA roda com
    // `resetMocks: true`, que apagaria a implementação antes de cada teste.
    HTMLCanvasElement.prototype.getContext = jest.fn(() => ({
      fillStyle: '', strokeStyle: '', lineWidth: 0, lineCap: '', lineJoin: '',
      fillRect: jest.fn(), beginPath: jest.fn(), moveTo: jest.fn(),
      lineTo: jest.fn(), stroke: jest.fn(),
    }));
    HTMLCanvasElement.prototype.toBlob = jest.fn(function (cb) {
      cb(new Blob(['png-fake'], { type: 'image/png' }));
    });
    HTMLElement.prototype.setPointerCapture = jest.fn();
    HTMLElement.prototype.releasePointerCapture = jest.fn();
  });

  const emSeparacaoComSeparado = () => ({
    ...baseRequisicao('EM_SEPARACAO'),
    itens: [{ ...ITEM, quantidade_separada: 5 }],
  });

  // jsdom não tem PointerEvent; React delega pelo type do evento, então um MouseEvent com
  // o type certo (+ pointerId) atravessa a delegação do React 18.
  const pointerEvent = (tipo, x, y) => {
    const ev = new MouseEvent(tipo, { bubbles: true, cancelable: true, clientX: x, clientY: y });
    Object.defineProperty(ev, 'pointerId', { value: 1 });
    return ev;
  };

  const desenharNoCanvas = () => {
    const canvas = container.querySelector('canvas');
    act(() => { canvas.dispatchEvent(pointerEvent('pointerdown', 10, 10)); });
    act(() => { canvas.dispatchEvent(pointerEvent('pointermove', 40, 30)); });
    act(() => { canvas.dispatchEvent(pointerEvent('pointerup', 40, 30)); });
  };

  // Input controlado do React: setar .value direto não dispara o onChange — usa o setter
  // nativo + evento input, que o React ouve.
  const digitar = (input, valor) => {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    act(() => {
      setter.call(input, valor);
      input.dispatchEvent(new Event('input', { bubbles: true }));
    });
  };

  const inputRecebedor = () => [...container.querySelectorAll('input')]
    .find((i) => (i.placeholder || '').toLowerCase().includes('recebeu'));

  const entregarTudo = async () => {
    api.put.mockResolvedValue({ data: { parcial: false } });
    await act(async () => { botaoPorTexto('Confirmar Entrega e Baixar Estoque').click(); });
  };

  test('após entrega ok abre a etapa "Colher assinatura do recebedor" (nome + canvas + Pular)', async () => {
    detalheDoBanco = emSeparacaoComSeparado();
    await renderizar();
    await entregarTudo();
    expect(container.textContent).toContain('Colher assinatura do recebedor');
    expect(inputRecebedor()).toBeTruthy();
    expect(container.querySelector('canvas')).toBeTruthy();
    expect(botaoPorTexto('Pular')).toBeTruthy();
  });

  test('Pular fecha a etapa sem POST de assinatura (RN-02: opcional de verdade)', async () => {
    detalheDoBanco = emSeparacaoComSeparado();
    await renderizar();
    await entregarTudo();
    await act(async () => { botaoPorTexto('Pular').click(); });
    expect(container.textContent).not.toContain('Colher assinatura do recebedor');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('confirmar com nome → POST multipart C1 com recebedor_nome e assinatura', async () => {
    detalheDoBanco = emSeparacaoComSeparado();
    await renderizar();
    await entregarTudo();
    api.post.mockResolvedValue({ data: { success: true, assinatura: ASSINATURA } });
    digitar(inputRecebedor(), 'José da Silva');
    desenharNoCanvas();
    await act(async () => { botaoPorTexto('Confirmar assinatura').click(); });

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, fd] = api.post.mock.calls[0];
    expect(url).toBe('/almoxarifado/requisicoes/55/assinatura-entrega');
    expect(fd).toBeInstanceOf(FormData);
    expect(fd.get('recebedor_nome')).toBe('José da Silva');
    const arquivo = fd.get('assinatura');
    expect(arquivo).toBeTruthy();
    expect(arquivo.type).toBe('image/png');
    // fechou a etapa depois do sucesso
    expect(container.textContent).not.toContain('Colher assinatura do recebedor');
  });

  test('sem nome do recebedor não faz POST (campo obrigatório do contrato C1)', async () => {
    detalheDoBanco = emSeparacaoComSeparado();
    await renderizar();
    await entregarTudo();
    desenharNoCanvas();
    await act(async () => { botaoPorTexto('Confirmar assinatura').click(); });
    expect(api.post).not.toHaveBeenCalled();
    // etapa continua aberta esperando o nome
    expect(container.textContent).toContain('Colher assinatura do recebedor');
  });

  test('falha no POST de assinatura mostra erro e NÃO desfaz a entrega (RN-02)', async () => {
    const { toast } = require('react-toastify');
    detalheDoBanco = emSeparacaoComSeparado();
    await renderizar();
    await entregarTudo();
    api.put.mockClear();
    api.post.mockRejectedValue({ response: { data: { error: 'Falha ao salvar assinatura' } } });
    digitar(inputRecebedor(), 'José da Silva');
    desenharNoCanvas();
    await act(async () => { botaoPorTexto('Confirmar assinatura').click(); });
    expect(toast.error).toHaveBeenCalledWith('Falha ao salvar assinatura');
    // nada de desfazer: nenhum PUT novo (estorno/cancelamento) depois da falha
    expect(api.put).not.toHaveBeenCalled();
  });

  test('detalhe com assinaturas_entrega renderiza nome, data e thumbnail (C2)', async () => {
    detalheDoBanco = {
      ...baseRequisicao('ENTREGUE'),
      assinaturas_entrega: [ASSINATURA],
    };
    await renderizar();
    expect(container.textContent).toContain('Maria Recebedora');
    expect(container.textContent).toContain('28/08');
    const thumb = [...container.querySelectorAll('img')]
      .find((img) => (img.getAttribute('src') || '').includes('/api/uploads/almoxarifado/assinatura-abc.png'));
    expect(thumb).toBeTruthy();
  });

  test.each(['ENTREGUE', 'PARCIALMENTE_ATENDIDA', 'ENCERRADA'])(
    'botão "＋ Assinatura de entrega" aparece em %s', async (status) => {
      detalheDoBanco = baseRequisicao(status);
      await renderizar();
      expect(botaoPorTexto('Assinatura de entrega')).toBeTruthy();
    }
  );

  test('botão avulso NÃO aparece fora dos status entregues', async () => {
    detalheDoBanco = emSeparacaoComSeparado();
    await renderizar();
    expect(botaoPorTexto('Assinatura de entrega')).toBeFalsy();
  });

  test('botão avulso some sem pode(separar_emitir) — quem entrega é quem colhe (RN-05)', async () => {
    mockPode = (acao) => acao !== 'separar_emitir';
    detalheDoBanco = baseRequisicao('ENTREGUE');
    await renderizar();
    expect(botaoPorTexto('Assinatura de entrega')).toBeFalsy();
  });

  test('botão avulso abre a mesma etapa de assinatura', async () => {
    detalheDoBanco = baseRequisicao('ENTREGUE');
    await renderizar();
    await act(async () => { botaoPorTexto('Assinatura de entrega').click(); });
    expect(container.textContent).toContain('Colher assinatura do recebedor');
    expect(container.querySelector('canvas')).toBeTruthy();
  });
});

// ─── Etapa 28: separação com dono e segunda conferência (contratos C3/C6 congelados) ────────
//
// Mesmo padrão da Etapa 15: mock só na fronteira HTTP. O GET do detalhe passa a trazer
// `separacoes[]`, `conferencia` e `conferencia_obrigatoria`; o PUT /conferir-separacao
// não tem corpo. O usuário logado do mock é id 99 — é ele quem "separou" no cenário (6).
describe('Etapa 28: rodadas de separação e segunda conferência', () => {
  const RODADA_A = {
    id: 1, usuario_id: 7, usuario_nome: 'Ana Separadora', itens_tocados: 2,
    itens: [{ item_id: 1, quantidade_separada: 3 }, { item_id: 2, quantidade_separada: 1 }],
    created_at: '2026-08-28T14:00:00',
  };
  const RODADA_B = {
    id: 2, usuario_id: 8, usuario_nome: 'Bruno Separador', itens_tocados: 1,
    itens: [{ item_id: 1, quantidade_separada: 5 }],
    created_at: '2026-08-28T15:30:00',
  };

  const emSeparacao = (extra = {}) => ({
    ...baseRequisicao('EM_SEPARACAO'),
    itens: [{ ...ITEM, quantidade_separada: 5 }],
    separacoes: [RODADA_A, RODADA_B],
    conferencia: null,
    conferencia_obrigatoria: false,
    ...extra,
  });

  test('(1) modal lista as rodadas com nome e contagem de itens', async () => {
    detalheDoBanco = emSeparacao();
    await renderizar();
    expect(container.textContent).toContain('Ana Separadora');
    expect(container.textContent).toContain('Bruno Separador');
    expect(container.textContent).toMatch(/2 itens/);
    expect(container.textContent).toMatch(/1 item\b/);
    expect(container.textContent).toContain('28/08');
  });

  test('(2) "Conferir separação" aparece em EM_SEPARACAO sem conferência e chama PUT /conferir-separacao', async () => {
    const { toast } = require('react-toastify');
    detalheDoBanco = emSeparacao();
    await renderizar();
    const btn = botaoPorTexto('Conferir separação');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(false);
    api.put.mockResolvedValue({ data: { success: true } });
    await act(async () => { btn.click(); });
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(api.put.mock.calls[0][0]).toBe('/almoxarifado/requisicoes/55/conferir-separacao');
    expect(api.put.mock.calls[0][1]).toBeUndefined();
    expect(toast.success).toHaveBeenCalledWith('Separação conferida!');
  });

  test('(2b) erro do PUT vira toast.error com a mensagem do servidor', async () => {
    const { toast } = require('react-toastify');
    detalheDoBanco = emSeparacao();
    await renderizar();
    api.put.mockRejectedValue({ response: { data: { error: 'Quem separou nao confere' } } });
    await act(async () => { botaoPorTexto('Conferir separação').click(); });
    expect(toast.error).toHaveBeenCalledWith('Quem separou nao confere');
  });

  test('(3) com conferencia preenchida mostra "Conferida por" e esconde o botão', async () => {
    detalheDoBanco = emSeparacao({
      conferencia: { usuario_id: 12, usuario_nome: 'Carla Conferente', em: '2026-08-28T16:00:00' },
    });
    await renderizar();
    expect(container.textContent).toMatch(/Conferida por Carla Conferente/);
    expect(botaoPorTexto('Conferir separação')).toBeFalsy();
  });

  test('(4) conferencia_obrigatoria sem conferencia desabilita "Liberar para Retirada" e "Confirmar Entrega"', async () => {
    detalheDoBanco = emSeparacao({ conferencia_obrigatoria: true });
    await renderizar();
    const liberar = botaoPorTexto('Liberar para Retirada');
    expect(liberar).toBeTruthy();
    expect(liberar.disabled).toBe(true);
    expect(liberar.title).toMatch(/segunda conferência/);
    const entregar = botaoPorTexto('Confirmar Entrega e Baixar Estoque');
    expect(entregar).toBeTruthy();
    expect(entregar.disabled).toBe(true);
    expect(entregar.title).toMatch(/segunda conferência/);
  });

  test('(4b) conferencia_obrigatoria COM conferencia libera os dois botões', async () => {
    detalheDoBanco = emSeparacao({
      conferencia_obrigatoria: true,
      conferencia: { usuario_id: 12, usuario_nome: 'Carla Conferente', em: '2026-08-28T16:00:00' },
    });
    await renderizar();
    expect(botaoPorTexto('Liberar para Retirada').disabled).toBe(false);
    expect(botaoPorTexto('Confirmar Entrega e Baixar Estoque').disabled).toBe(false);
  });

  test('(4c) em PRONTA_PARA_RETIRADA o "Confirmar Entrega" também respeita a conferência obrigatória', async () => {
    detalheDoBanco = { ...emSeparacao({ conferencia_obrigatoria: true }), status: 'PRONTA_PARA_RETIRADA' };
    await renderizar();
    const entregar = botaoPorTexto('Confirmar Entrega e Baixar Estoque');
    expect(entregar).toBeTruthy();
    expect(entregar.disabled).toBe(true);
  });

  test('(5) sem pode(conferir_separacao) o clique bloqueia e não chama o PUT', async () => {
    mockPode = (acao) => acao !== 'conferir_separacao';
    detalheDoBanco = emSeparacao();
    await renderizar();
    const btn = botaoPorTexto('Conferir separação');
    expect(btn).toBeTruthy();
    await act(async () => { btn.click(); });
    expect(api.put).not.toHaveBeenCalled();
  });

  test('(6) quem separou (usuário logado em separacoes[].usuario_id) vê o botão desabilitado com title', async () => {
    detalheDoBanco = emSeparacao({
      separacoes: [RODADA_A, { ...RODADA_B, usuario_id: 99, usuario_nome: 'Almoxarife Teste' }],
    });
    await renderizar();
    const btn = botaoPorTexto('Conferir separação');
    expect(btn).toBeTruthy();
    expect(btn.disabled).toBe(true);
    expect(btn.title).toMatch(/separou/i);
    await act(async () => { btn.click(); });
    expect(api.put).not.toHaveBeenCalled();
  });

  test('botão não aparece sem item separado nem fora de EM_SEPARACAO', async () => {
    detalheDoBanco = emSeparacao({ itens: [{ ...ITEM, quantidade_separada: 0 }] });
    await renderizar();
    expect(botaoPorTexto('Conferir separação')).toBeFalsy();
  });

  test('detalhe sem os campos novos (modo não-warehouse / backend antigo) não quebra', async () => {
    detalheDoBanco = { ...baseRequisicao('EM_SEPARACAO'), itens: [{ ...ITEM, quantidade_separada: 5 }] };
    await renderizar();
    expect(container.textContent).toContain('REQ-055');
    expect(botaoPorTexto('Liberar para Retirada').disabled).toBe(false);
  });
});
