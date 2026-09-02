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
import ReservasAlmoxarifado from './ReservasAlmoxarifado';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// Permissões liberadas: o alvo aqui é o comportamento da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

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
