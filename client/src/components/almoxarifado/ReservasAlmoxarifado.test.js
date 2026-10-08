/**
 * Tela de reservas (feature 07, Etapa 4 — Task 4).
 *
 * Cobre as regras que o design da etapa marca como essenciais para a UI. Não são detalhes de
 * layout: cada uma corresponde a um jeito de a tela mentir sobre saldo, que é o que tornou a
 * feature perigosa antes da Etapa 4.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { toast } from 'react-toastify';
import ReservasAlmoxarifado from './ReservasAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões controláveis POR TESTE (Etapa 77, RN-10). O padrão do beforeEach é tudo liberado:
// o alvo dos casos antigos é o comportamento da tela, e o gate real é do servidor. As variáveis
// têm prefixo `mock` porque a fábrica do jest.mock é içada e só pode citar nomes assim.
let mockPermissoes;
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => mockPermissoes,
}));

// useAuth lança fora do AuthProvider; a tela lê o user.id para saber se é quem pediu a requisição.
let mockUser;
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: mockUser }),
}));

/** Permissões em que `negadas` devolvem false — `bloquearSeNaoPode` segue o `pode`, como o hook. */
function permissoes(negadas = []) {
  const pode = jest.fn((acao) => !negadas.includes(acao));
  return {
    perfil: negadas.length ? 'PRODUCAO' : 'ADMINISTRADOR',
    pode,
    bloquearSeNaoPode: jest.fn((acao) => pode(acao)),
    loading: false,
  };
}

jest.mock('./ExtratoMaterialModal', () => ({
  __esModule: true,
  default: () => null,
}));

// Reserva de requisição já consumida pela metade — o caso NORMAL depois que a entrega passou
// a baixar contra a reserva.
const RESERVA_PARCIAL = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', material_unidade: 'PC',
  quantidade: 10, quantidade_utilizada: 4, saldo: 6, status: 'ATIVA',
  origem: 'REQUISICAO', requisicao_id: 55, projeto_id: 7, os_id: null, os_referencia: null,
  cliente_id: null, solicitante_nome: 'Maria', data_necessidade: null, expira_em: null,
};

const RESERVA_EXPIRADA = {
  ...RESERVA_PARCIAL, id: 2, status: 'EXPIRADA', saldo: 0, quantidade_utilizada: 0, origem: 'MANUAL',
  requisicao_id: null,
};

const RESERVA_LIBERADA = {
  ...RESERVA_PARCIAL, id: 3, status: 'LIBERADA', saldo: 0, quantidade_utilizada: 0, origem: 'MANUAL',
  requisicao_id: null, motivo_liberacao: 'Projeto cancelado',
};

let container;
let root;
let reservasDoBanco;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  reservasDoBanco = [RESERVA_PARCIAL];
  mockPermissoes = permissoes();
  mockUser = { id: 1, nome: 'Admin' };
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/reservas') return Promise.resolve({ data: reservasDoBanco });
    if (url === '/almoxarifado/estoque') {
      return Promise.resolve({ data: [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', quantidade_disponivel: 20 }] });
    }
    if (url === '/projetos') return Promise.resolve({ data: [{ id: 7, nome: 'Projeto Alfa' }, { id: 8, nome: 'Projeto Beta' }] });
    if (url === '/almoxarifado/aux/ordens-servico') return Promise.resolve({ data: [{ id: 42, numero: 'OS-42' }] });
    if (url === '/clientes') return Promise.resolve({ data: [] });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { success: true } });
  api.put.mockResolvedValue({ data: { success: true } });
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
    root.render(<MemoryRouter><ReservasAlmoxarifado /></MemoryRouter>);
  });
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];
const textoDaLinha = (i) => linhas()[i].textContent;

/** Clica um botão de ação da linha pelo title. */
async function clicarAcao(indiceLinha, tituloParcial) {
  const botao = [...linhas()[indiceLinha].querySelectorAll('.almox-btn-icon')]
    .find((b) => b.getAttribute('title')?.includes(tituloParcial));
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

/** Campo do modal aberto, localizado pelo texto do <label>. */
function campoPorLabel(rotulo) {
  const grupo = [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((g) => g.querySelector('label')?.textContent.replace('*', '').trim() === rotulo);
  return grupo.querySelector('input, textarea, select');
}

function preencher(elemento, valor) {
  const proto = elemento.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : elemento.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype
      : window.HTMLInputElement.prototype;
  const setValue = Object.getOwnPropertyDescriptor(proto, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event(elemento.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

/** Botão do rodapé do modal pelo texto. */
async function clicarBotaoModal(texto) {
  const botao = [...container.querySelectorAll('.almox-modal-footer button')]
    .find((b) => b.textContent.trim() === texto);
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}

describe('ReservasAlmoxarifado', () => {
  test('mostra o saldo restante, não só a quantidade original', async () => {
    await renderizar();
    const texto = textoDaLinha(0);
    // 10 reservadas, 4 consumidas, 6 de saldo: as três precisam aparecer. Exibir só "10"
    // faria uma reserva já consumida pela metade parecer que segura o dobro do real.
    expect(texto).toContain('10 PC');
    expect(texto).toContain('4 PC');
    expect(texto).toContain('6 PC');
  });

  test('EXPIRADA e LIBERADA não usam o mesmo badge', async () => {
    reservasDoBanco = [RESERVA_EXPIRADA, RESERVA_LIBERADA];
    await renderizar();
    const badge = (i) => linhas()[i].querySelector('.almox-badge').className;
    expect(badge(0)).not.toBe(badge(1));
    // Expiração em massa é sintoma de prazo mal configurado; some se virar "liberada".
    expect(badge(0)).toContain('critico');
    expect(badge(1)).toContain('cancelado');
  });

  test('reserva não-ATIVA não oferece liberar nem transferir', async () => {
    reservasDoBanco = [RESERVA_LIBERADA];
    await renderizar();
    expect(linhas()[0].querySelectorAll('.almox-btn-icon')).toHaveLength(0);
  });

  test('liberar reserva de requisição avisa que a entrega volta a disputar estoque', async () => {
    await renderizar();
    await clicarAcao(0, 'Liberar');
    const modal = container.querySelector('.almox-modal').textContent;
    expect(modal).toContain('requisição #55');
    expect(modal).toMatch(/disputar/i);
  });

  test('liberar sem motivo não chama a API', async () => {
    await renderizar();
    await clicarAcao(0, 'Liberar');
    await clicarBotaoModal('Liberar');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('liberar com quantidade em branco libera o saldo inteiro (sem quantidade no body)', async () => {
    await renderizar();
    await clicarAcao(0, 'Liberar');
    preencher(campoPorLabel('Motivo'), 'Sobrou material');
    await clicarBotaoModal('Liberar');
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/reservas/1/liberar', { motivo: 'Sobrou material' });
  });

  test('liberar acima do saldo não chama a API', async () => {
    await renderizar();
    await clicarAcao(0, 'Liberar');
    preencher(campoPorLabel('Quantidade a liberar'), '9');   // saldo é 6
    preencher(campoPorLabel('Motivo'), 'Tentativa');
    await clicarBotaoModal('Liberar');
    expect(api.post).not.toHaveBeenCalled();
  });

  test('transferir de projeto para OS limpa o projeto anterior em vez de acumular dono', async () => {
    await renderizar();
    await clicarAcao(0, 'Transferir');
    preencher(campoPorLabel('Projeto'), '');          // tira o projeto 7
    preencher(campoPorLabel('Ordem de Serviço'), '42');
    await clicarBotaoModal('Transferir');

    // O servidor trata `undefined` como "manter" e string vazia como "limpar". Se a tela
    // enviasse só o campo preenchido, a reserva ficaria com projeto E OS — dono duplo, e o
    // relatório por projeto seguiria contando material que já é de outra OS.
    expect(api.put).toHaveBeenCalledWith('/almoxarifado/reservas/1/transferir', {
      projeto_id: '', os_id: 42, os_referencia: '', cliente_id: '',
    });
  });

  test('transferir sem destino nenhum não chama a API', async () => {
    await renderizar();
    await clicarAcao(0, 'Transferir');
    preencher(campoPorLabel('Projeto'), '');
    await clicarBotaoModal('Transferir');
    expect(api.put).not.toHaveBeenCalled();
  });

  test('o disponível vem de /estoque, que é quem calcula o saldo disponível', async () => {
    await renderizar();
    // /materiais devolve o FÍSICO. Numa tela de reserva, oferecer físico como disponível
    // convida o usuário a reservar saldo que já está reservado.
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/estoque');
    expect(api.get).not.toHaveBeenCalledWith('/almoxarifado/materiais');
  });
});

// Etapa 77 (C137): a reserva de requisição só é liberada por quem PEDIU a requisição, pelo
// almoxarife ou pelo administrador. O servidor decide (403); a tela só não abre o modal para
// quem vai morrer no 403 — e diz a REGRA, não o "Solicite acesso" genérico.
describe('[RN-10] Liberar reserva de requisição — de quem é', () => {
  const MSG = 'Só quem pediu a requisição, o almoxarife ou o administrador liberam esta reserva';
  // Pedida pelo usuário 99, aprovada por outro (o `solicitante_id` da reserva é o APROVADOR — a
  // tela não pode usá-lo como dono).
  const RESERVA_DA_REQ = {
    ...RESERVA_PARCIAL, requisicao_numero: 'REQ-2026-0007', requisicao_solicitante_id: 99,
    solicitante_id: 1,
  };
  const modalAberto = () => container.querySelector('.almox-modal');

  test('(a) não é quem pediu e não tem liberar_reserva_requisicao: toast com a regra, modal não abre', async () => {
    reservasDoBanco = [RESERVA_DA_REQ];
    mockUser = { id: 1 };       // é o solicitante_id da RESERVA (aprovador), não o da requisição
    mockPermissoes = permissoes(['liberar_reserva_requisicao']);
    await renderizar();
    await clicarAcao(0, 'Liberar');
    expect(mockPermissoes.pode).toHaveBeenCalledWith('liberar_reserva_requisicao');
    expect(modalAberto()).toBeNull();
    expect(toast.error).toHaveBeenCalledWith(MSG);
  });

  test('(b) quem pediu a requisição, sem liberar_reserva_requisicao: o modal abre', async () => {
    reservasDoBanco = [RESERVA_DA_REQ];
    mockUser = { id: 99 };
    mockPermissoes = permissoes(['liberar_reserva_requisicao']);
    await renderizar();
    await clicarAcao(0, 'Liberar');
    expect(modalAberto()).not.toBeNull();
    expect(toast.error).not.toHaveBeenCalled();
  });

  test('(b2) com liberar_reserva_requisicao (almoxarife) sem ter pedido: o modal abre', async () => {
    reservasDoBanco = [RESERVA_DA_REQ];
    mockUser = { id: 1 };
    mockPermissoes = permissoes([]);
    await renderizar();
    await clicarAcao(0, 'Liberar');
    expect(modalAberto()).not.toBeNull();
  });

  test('(b3) quem pediu mas não tem reservar: barrado pelo gate de reservar (duas camadas)', async () => {
    reservasDoBanco = [RESERVA_DA_REQ];
    mockUser = { id: 99 };
    mockPermissoes = permissoes(['reservar', 'liberar_reserva_requisicao']);
    await renderizar();
    await clicarAcao(0, 'Liberar');
    expect(mockPermissoes.bloquearSeNaoPode).toHaveBeenCalledWith('reservar', expect.anything());
    expect(modalAberto()).toBeNull();
  });

  test('(b4) reserva manual: só o gate de reservar, como antes', async () => {
    reservasDoBanco = [{ ...RESERVA_EXPIRADA, id: 4, status: 'ATIVA', saldo: 3, requisicao_numero: null,
      requisicao_solicitante_id: null }];
    mockUser = { id: 1 };
    mockPermissoes = permissoes(['liberar_reserva_requisicao']);
    await renderizar();
    await clicarAcao(0, 'Liberar');
    expect(modalAberto()).not.toBeNull();
    expect(mockPermissoes.pode).not.toHaveBeenCalledWith('liberar_reserva_requisicao');
  });

  test('(c) com o número da requisição: a coluna e o modal mostram REQ-…, não o id', async () => {
    reservasDoBanco = [RESERVA_DA_REQ];
    mockUser = { id: 99 };
    await renderizar();
    expect(textoDaLinha(0)).toContain('REQ-2026-0007');
    expect(textoDaLinha(0)).not.toContain('#55');
    await clicarAcao(0, 'Liberar');
    const modal = modalAberto().textContent;
    expect(modal).toContain('requisição REQ-2026-0007');
    expect(modal).not.toContain('#55');
  });
});
