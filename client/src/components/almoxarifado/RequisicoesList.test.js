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

// `warehouseMode` MUTÁVEL, e não a constante `true` que este arquivo tinha: a MESMA tela roda em
// modo não-almoxarifado em seis rotas de outros módulos (`App.js` →
// `RequisicoesMaterialPages.js:24-33`; só `almoxarifado` tem `warehouseMode: true` em
// `config/requisicoesMaterialConfig.js:55-61`), com `apiPrefix = '/requisicoes-material'` — rota
// servida SEM a permissão do módulo almoxarifado. Com o mock preso em `true` nenhum cenário podia
// ver um bloco de almoxarifado disparando `GET /almoxarifado/anexos` (403) nessas rotas, que é
// exatamente o achado F1 da revisão da Etapa 34.
let mockWarehouseMode = true;
jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({
    warehouseMode: mockWarehouseMode, basePath: '', setor: null,
  }),
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
  mockWarehouseMode = true;
  api.get.mockImplementation((url) => {
    // Os dois prefixos que a tela usa, conforme `warehouseMode` (`RequisicoesList.js:82`).
    if (url === '/almoxarifado/requisicoes' || url === '/requisicoes-material') {
      const { itens, ...linha } = detalheDoBanco;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55' || url === '/requisicoes-material/55') {
      return Promise.resolve({ data: detalheDoBanco });
    }
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

// Sem `?id=` na URL: a lista abre sem painel de detalhe — é o estado que prova a metade
// negativa da RN-02 da Etapa 34 (sem documento aberto, nenhuma consulta de anexos).
async function renderizarSemDetalhe() {
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/almoxarifado/requisicoes']}>
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
    // Etapa 33: a URL vem do servidor JA ASSINADA. O fixture antigo era o endereco publico, e o
    // cenario abaixo usava .includes() sobre ele — que continuava verdadeiro com a query como
    // sufixo, entao o teste passava ANTES, DEPOIS, e com a feature quebrada. Agora ele exige a
    // URL inteira, e reprova se o helper voltar a mutilar a query.
    arquivo_url: '/api/uploads/almoxarifado/assinatura-abc.png?exp=99999999999&sig=abc123def456abc123def456abc12345',
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
      .find((img) => (img.getAttribute('src') || '').startsWith('/api/uploads/almoxarifado/assinatura-abc.png'));
    expect(thumb).toBeTruthy();
    // A assinatura tem de chegar INTEIRA ao src — sem ela o navegador toma 404 e a miniatura some.
    expect(thumb.getAttribute('src')).toBe(ASSINATURA.arquivo_url);
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

// ─── Etapa 34: anexos do documento no painel de detalhe da requisição ───────────────────────
//
// O bloco `AnexosDocumento` (Etapa 32) entra INLINE aqui, no mesmo molde dos dois blocos
// aditivos que já leem junto da requisição (Separação, Assinaturas de entrega): sem gate novo,
// sem modal. Mock só na fronteira HTTP — o `api.get` do fixture cai no fallback `{ data: [] }`
// para `/almoxarifado/anexos`, então o cenário que só afirmasse "renderiza" ficaria verde COM E
// SEM o bloco. A régua destes cenários é presença + `params`, não ausência de erro.
describe('Etapa 34: anexos da requisição no painel de detalhe', () => {
  const chamadasDeAnexos = () => api.get.mock.calls.filter(([url]) => url === '/almoxarifado/anexos');
  const blocoDeAnexos = () => container.querySelector('[data-testid="anexos-documento"]');

  test('o painel de detalhe mostra os anexos DA REQUISIÇÃO aberta', async () => {
    detalheDoBanco = baseRequisicao('APROVADO');
    await renderizar();
    expect(blocoDeAnexos()).not.toBeNull();
    // `entidade` errada é o defeito mais barato de cometer (o componente é genérico para seis
    // entidades) e o mais invisível: com a chave trocada a tela lista os anexos de OUTRO
    // registro sem nenhum sintoma visual.
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos',
      { params: { entidade: 'requisicao', entidade_id: 55 } });
    expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/anexos')).toHaveLength(1);
  });

  test('o bloco lê o id do DETALHE CARREGADO, não o da URL', async () => {
    // Divergência forçada na fixture (produção não muda): a URL pede a requisição 55 e o
    // servidor responde `id: 555`. Com `entidadeId={detalhe.id}` fica verde; com
    // `entidadeId={selectedId}` (55) fica vermelho. É o que trava a distinção em vez de
    // deixá-la como comentário.
    detalheDoBanco = { ...baseRequisicao('APROVADO'), id: 555 };
    await renderizar();
    expect(blocoDeAnexos()).not.toBeNull();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos',
      { params: { entidade: 'requisicao', entidade_id: 555 } });
    expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/anexos')).toHaveLength(1);
  });

  test('RN-02: sem detalhe aberto não consulta anexos; abrir a requisição consulta', async () => {
    detalheDoBanco = baseRequisicao('APROVADO');
    await renderizarSemDetalhe();
    // Metade negativa: a lista inteira renderizada, nenhum painel — nenhuma consulta.
    expect(blocoDeAnexos()).toBeNull();
    expect(chamadasDeAnexos()).toHaveLength(0);
    // Metade positiva: o clique na linha abre o detalhe e só então nasce o bloco.
    await act(async () => { container.querySelector('tbody tr').click(); });
    expect(blocoDeAnexos()).not.toBeNull();
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/anexos',
      { params: { entidade: 'requisicao', entidade_id: 55 } });
    // Aqui o contador NÃO é 1, e a razão é anterior à Etapa 34: abrir pelo CLIQUE roda
    // `abrirDetalhe` duas vezes — o clique e, depois, o `syncSearchParams` que reescreve `?id=`
    // e reacende o efeito de deep-link —, e o segundo passe volta ao estado "Carregando...",
    // que desmonta e remonta o corpo do painel. Medido: 2 GETs de `/almoxarifado/requisicoes/55`
    // neste caminho. O que este cenário trava é a RELAÇÃO (uma consulta de anexos por carga do
    // detalhe, nunca duas por montagem), e não o número solto; nos dois cenários de deep-link
    // acima, com uma carga só, o contador é exatamente 1.
    // Com o bloco FORA do ternário de `loadingDetalhe` (achado F2), o segundo passe não desmonta
    // mais o corpo do painel: `abrirDetalhe` só zera `detalhe` quando o id MUDA
    // (`RequisicoesList.js:232-234`), então o bloco permanece montado e a contagem estrita vale
    // aqui também — era 2 (uma por carga do detalhe) antes do fix.
    expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/anexos')).toHaveLength(1);
  });

  // ── F1 da revisão da branch: o gate de `warehouseMode` ──────────────────────────────────────
  // Sem ele, `/comercial/requisicoes-material` (e frota, compras, financeiro, fábrica,
  // engenharia) abria o painel e disparava `GET /api/almoxarifado/anexos`, que está atrás de
  // `checkModulePermission('almoxarifado')`: 403 "Acesso negado ao módulo" em vermelho DENTRO do
  // painel, um formulário de upload morto (o hook de permissões falha ABERTO de propósito) e uma
  // linha de auditoria de acesso negado por abertura de painel. Todos os outros blocos daquele
  // painel já eram gateados (`:976`, `:1047`, `:1066`).
  test('F1: fora do almoxarifado (warehouseMode=false) o bloco não existe e nada vai para /almoxarifado/anexos', async () => {
    mockWarehouseMode = false;
    detalheDoBanco = baseRequisicao('PENDENTE');
    await renderizar();

    // Metade POSITIVA primeiro: sem ela este cenário passaria com a tela vazia — que é a forma
    // de teste vazio que esta base já pagou três vezes.
    expect(container.textContent).toContain('REQ-055');
    expect(api.get).toHaveBeenCalledWith('/requisicoes-material/55', expect.anything());
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/requisicoes/55', expect.anything());

    // Metade negativa: painel aberto, e nenhuma superfície de almoxarifado nele.
    expect(blocoDeAnexos()).toBeNull();
    expect(chamadasDeAnexos()).toHaveLength(0);
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/anexos', expect.anything());
  });

  // ── F2 da revisão da branch: o bloco não pode remontar a cada refetch do detalhe ────────────
  // Cenário do revisor: o usuário abre a REQ-055, clica no input de arquivo e escolhe `nf.pdf`;
  // ao fechar o diálogo do SO o foco volta para a janela → `refetchDetalhe` (`:270-284`) →
  // `setLoadingDetalhe(true)` → o corpo do painel desmonta → o `AnexosDocumento` perde o arquivo
  // escolhido (estado local, `AnexosDocumento.js:110-112`) e remonta vazio, com um SEGUNDO GET.
  // "Anexar" então responde "Arquivo é obrigatório", sem nada na tela explicando o porquê.
  test('F2: refetch do detalhe por foco da janela mantém o MESMO nó do bloco e não repete a consulta', async () => {
    detalheDoBanco = baseRequisicao('APROVADO');
    await renderizar();

    const antes = blocoDeAnexos();
    expect(antes).not.toBeNull();
    expect(chamadasDeAnexos()).toHaveLength(1);
    const cargasAntes = api.get.mock.calls.filter(([u]) => u === '/almoxarifado/requisicoes/55').length;

    await act(async () => { window.dispatchEvent(new Event('focus')); });

    // Ancora: o refetch REALMENTE aconteceu (senão as duas asserções abaixo provariam nada).
    expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/requisicoes/55').length)
      .toBe(cargasAntes + 1);
    // Identidade de nó, não presença: é o que distingue "continua montado" de "remontou igual".
    expect(blocoDeAnexos()).toBe(antes);
    expect(chamadasDeAnexos()).toHaveLength(1);
  });

  test('F2 (filtro): trocar um filtro refaz o detalhe sem remontar o bloco', async () => {
    detalheDoBanco = baseRequisicao('APROVADO');
    await renderizar();
    const antes = blocoDeAnexos();
    expect(antes).not.toBeNull();

    // `filtroMinha` → `syncSearchParams` → efeito de deep-link → `abrirDetalhe(55, force)`.
    const checkMinha = [...container.querySelectorAll('input[type="checkbox"]')][0];
    expect(checkMinha).toBeTruthy();
    await act(async () => { checkMinha.click(); });

    expect(api.get.mock.calls.filter(([u]) => u === '/almoxarifado/requisicoes/55').length)
      .toBeGreaterThan(1);
    expect(blocoDeAnexos()).toBe(antes);
    expect(chamadasDeAnexos()).toHaveLength(1);
  });
});
