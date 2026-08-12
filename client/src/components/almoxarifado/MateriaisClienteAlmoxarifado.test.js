/**
 * Etapa 8, Task 8 — tela "Materiais de Clientes".
 *
 * Ate a Etapa 8 material de cliente vivia numa ilha sem tela nenhuma. Esta tela e a primeira
 * interface do modulo cujo conteudo inteiro fala do patrimonio de OUTRA empresa, e por isso o
 * teste central e o CONTROLE POSITIVO BILATERAL: a posicao do Cliente Alfa tem de mostrar o
 * material do proprio Alfa com os numeros certos E nao mostrar o do Cliente Beta. Um teste so de
 * ausencia seria aprovado por uma tela que nao mostra nada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/MateriaisClienteAlmoxarifado --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MateriaisClienteAlmoxarifado from './MateriaisClienteAlmoxarifado';
import api from '../../services/api';
import { toast } from 'react-toastify';
import { gerarPosicaoClientePDF } from '../../utils/posicaoClientePdf';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// O PDF e testado como funcao pura em utils/posicaoClientePdf.test.js — aqui so importa que a
// tela mande os dados que carregou, nao os bytes que saem.
jest.mock('../../utils/posicaoClientePdf', () => ({
  __esModule: true,
  gerarPosicaoClientePDF: jest.fn(),
  montarPosicaoClientePDF: jest.fn(),
}));

// Permissões liberadas: o alvo aqui é o comportamento da tela, e o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
  }),
}));

const CLIENTES = [
  { cliente_id: 1, cliente_nome: 'Cliente Alfa LTDA', materiais: 2, saldo_total: 40 },
  { cliente_id: 2, cliente_nome: 'Cliente Beta SA', materiais: 1, saldo_total: 70 },
];

const POSICAO_ALFA = {
  cliente: { id: 1, razao_social: 'Cliente Alfa LTDA' },
  itens: [
    { material_id: 11, codigo: 'CHP-ALFA', nome: 'Chapa 3mm', unidade: 'PC', recebido: 100, consumido: 50, devolvido: 10, saldo: 40, saldo_disponivel: 40 },
    { material_id: 12, codigo: 'TUB-ALFA', nome: 'Tubo 2"', unidade: 'M', recebido: 20, consumido: 20, devolvido: 0, saldo: 0, saldo_disponivel: 0 },
  ],
  aplicacoes: [
    { material_id: 11, codigo: 'CHP-ALFA', os_id: null, numero_os: null, projeto_id: 9, projeto_nome: 'Projeto Alfa', quantidade: 30 },
    { material_id: 11, codigo: 'CHP-ALFA', os_id: 5, numero_os: 'OS-ALFA-1', projeto_id: null, projeto_nome: null, quantidade: 20 },
  ],
};

const POSICAO_BETA = {
  cliente: { id: 2, razao_social: 'Cliente Beta SA' },
  itens: [
    { material_id: 21, codigo: 'CHP-BETA', nome: 'Chapa 5mm', unidade: 'PC', recebido: 70, consumido: 0, devolvido: 0, saldo: 70, saldo_disponivel: 70 },
  ],
  aplicacoes: [],
};

let container;
let root;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  // Implementações aqui, não na fábrica do jest.mock: clearAllMocks apaga implementações e só
  // o primeiro teste teria dados.
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/materiais-cliente/clientes') return Promise.resolve({ data: CLIENTES });
    if (url.includes('/materiais-cliente/posicao?cliente_id=1')) return Promise.resolve({ data: POSICAO_ALFA });
    if (url.includes('/materiais-cliente/posicao?cliente_id=2')) return Promise.resolve({ data: POSICAO_BETA });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1 } });
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
    root.render(<MemoryRouter><MateriaisClienteAlmoxarifado /></MemoryRouter>);
  });
  await esperarEfeitos();
}

async function esperarEfeitos() {
  await act(async () => { await new Promise((resolve) => setTimeout(resolve, 0)); });
}

async function selecionarCliente(id) {
  const select = container.querySelector('.almox-filters select.almox-select');
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  await act(async () => {
    setValue.call(select, String(id));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await esperarEfeitos();
}

const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];
const textoDaTela = () => container.textContent;

function botaoPorTexto(texto, escopo = container) {
  return [...escopo.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
}

async function clicar(botao) {
  await act(async () => { botao.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await esperarEfeitos();
}

function campoPorLabel(rotulo) {
  const grupo = [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((g) => g.querySelector('label')?.textContent.includes(rotulo));
  return grupo.querySelector('input, textarea, select');
}

function preencher(elemento, valor) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('MateriaisClienteAlmoxarifado', () => {
  test('sem cliente escolhido nao lista nada e nao chama a posicao', async () => {
    await renderizar();
    expect(linhas()).toHaveLength(0);
    expect(api.get).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/clientes');
    expect(api.get.mock.calls.some(([url]) => url.includes('posicao'))).toBe(false);
  });

  test('o select traz os clientes que tem material, com a contagem', async () => {
    await renderizar();
    const opcoes = [...container.querySelectorAll('.almox-filters select.almox-select option')]
      .map((o) => o.textContent.trim());
    expect(opcoes).toContain('Cliente Alfa LTDA (2 itens)');
    expect(opcoes).toContain('Cliente Beta SA (1 item)');
  });

  test('CONTROLE POSITIVO BILATERAL: a posicao de Alfa mostra o material de Alfa com os numeros certos e nao o de Beta', async () => {
    await renderizar();
    await selecionarCliente(1);

    // Metade positiva: o material do proprio cliente aparece, com recebido/consumido/devolvido/saldo.
    const linhaAlfa = linhas().find((tr) => tr.textContent.includes('CHP-ALFA'));
    expect(linhaAlfa).toBeTruthy();
    const celulas = [...linhaAlfa.querySelectorAll('td')].map((td) => td.textContent.trim());
    expect(celulas.slice(0, 7)).toEqual(['CHP-ALFA', 'Chapa 3mm', 'PC', '100', '50', '10', '40']);

    // Metade de exclusao: nada do outro cliente.
    expect(textoDaTela()).not.toContain('CHP-BETA');
    expect(textoDaTela()).not.toContain('Cliente Beta SA (1 item)'.replace(' (1 item)', '') + ' —');
  });

  test('CONTROLE POSITIVO BILATERAL: trocar para Beta mostra o de Beta e some com o de Alfa', async () => {
    await renderizar();
    await selecionarCliente(1);
    expect(textoDaTela()).toContain('CHP-ALFA');
    await selecionarCliente(2);
    expect(textoDaTela()).toContain('CHP-BETA');
    expect(textoDaTela()).not.toContain('CHP-ALFA');
    expect(textoDaTela()).not.toContain('TUB-ALFA');
  });

  test('a resposta atrasada do cliente anterior nao pinta os numeros do cliente atual', async () => {
    // O pior bug possivel nesta tela: mostrar o saldo de um cliente sob o nome de outro.
    let resolverAlfa;
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais-cliente/clientes') return Promise.resolve({ data: CLIENTES });
      if (url.includes('cliente_id=1')) return new Promise((r) => { resolverAlfa = () => r({ data: POSICAO_ALFA }); });
      if (url.includes('cliente_id=2')) return Promise.resolve({ data: POSICAO_BETA });
      return Promise.resolve({ data: [] });
    });
    await renderizar();
    await selecionarCliente(1);   // fica pendurado
    await selecionarCliente(2);   // resolve na hora
    await act(async () => { resolverAlfa(); await new Promise((r) => setTimeout(r, 0)); });
    expect(textoDaTela()).toContain('CHP-BETA');
    expect(textoDaTela()).not.toContain('CHP-ALFA');
  });

  test('mostra onde cada material foi aplicado, separando OS de projeto', async () => {
    await renderizar();
    await selecionarCliente(1);
    const linhaAlfa = linhas().find((tr) => tr.textContent.includes('CHP-ALFA'));
    expect(linhaAlfa.textContent).toContain('Projeto Alfa');
    expect(linhaAlfa.textContent).toContain('OS OS-ALFA-1');
    // Item sem aplicacao nenhuma nao inventa vinculo.
    const linhaTubo = linhas().find((tr) => tr.textContent.includes('TUB-ALFA'));
    expect(linhaTubo.textContent).not.toContain('OS ');
  });

  test('o botao de devolver fica desabilitado sem saldo, e o title diz por que', async () => {
    await renderizar();
    await selecionarCliente(1);
    const linhaComSaldo = linhas().find((tr) => tr.textContent.includes('CHP-ALFA'));
    const linhaZerada = linhas().find((tr) => tr.textContent.includes('TUB-ALFA'));
    const btnComSaldo = botaoPorTexto('Devolver', linhaComSaldo);
    const btnZerado = botaoPorTexto('Devolver', linhaZerada);
    expect(btnComSaldo.disabled).toBe(false);
    expect(btnZerado.disabled).toBe(true);
    expect(btnZerado.getAttribute('title')).toMatch(/sem saldo/i);
  });

  test('devolucao exige o documento antes de chamar o servidor', async () => {
    await renderizar();
    await selecionarCliente(1);
    await clicar(botaoPorTexto('Devolver', linhas().find((tr) => tr.textContent.includes('CHP-ALFA'))));
    preencher(campoPorLabel('Quantidade'), '10');
    await clicar(botaoPorTexto('Confirmar devolução'));
    expect(api.post).not.toHaveBeenCalled();
    expect(toast.error).toHaveBeenCalled();
  });

  test('devolucao valida chama a rota dedicada e recarrega a posicao', async () => {
    await renderizar();
    await selecionarCliente(1);
    const chamadasAntes = api.get.mock.calls.length;
    await clicar(botaoPorTexto('Devolver', linhas().find((tr) => tr.textContent.includes('CHP-ALFA'))));
    preencher(campoPorLabel('Quantidade'), '10');
    preencher(campoPorLabel('documento de devolução'), 'DEV-2026-9');
    await clicar(botaoPorTexto('Confirmar devolução'));
    expect(api.post).toHaveBeenCalledWith('/almoxarifado/materiais-cliente/devolucoes', {
      material_id: 11, quantidade: 10, documento_devolucao: 'DEV-2026-9',
    });
    expect(api.get.mock.calls.length).toBeGreaterThan(chamadasAntes);
    expect(container.querySelector('.almox-modal')).toBeNull();
  });

  test('o PDF recebe a posicao carregada, e o botao so habilita com cliente escolhido', async () => {
    await renderizar();
    expect(botaoPorTexto('PDF').disabled).toBe(true);
    await selecionarCliente(1);
    expect(botaoPorTexto('PDF').disabled).toBe(false);
    await clicar(botaoPorTexto('PDF'));
    expect(gerarPosicaoClientePDF).toHaveBeenCalled();
    const dados = gerarPosicaoClientePDF.mock.calls[0][0];
    expect(dados.cliente.razao_social).toBe('Cliente Alfa LTDA');
    expect(dados.itens).toHaveLength(2);
    expect(dados.geradoEm).toBeTruthy();
  });

  test('o selo de propriedade nomeia o cliente da posicao aberta', async () => {
    await renderizar();
    await selecionarCliente(1);
    const selo = container.querySelector('.almox-badge-cliente');
    expect(selo).toBeTruthy();
    expect(selo.textContent).toContain('Cliente Alfa LTDA');
  });

  test('cliente sem material mostra estado vazio, nao tabela em branco', async () => {
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais-cliente/clientes') return Promise.resolve({ data: CLIENTES });
      return Promise.resolve({ data: { cliente: { id: 1, razao_social: 'Cliente Alfa LTDA' }, itens: [], aplicacoes: [] } });
    });
    await renderizar();
    await selecionarCliente(1);
    expect(linhas()).toHaveLength(0);
    expect(textoDaTela()).toMatch(/nenhum material/i);
  });

  test('falha ao carregar a posicao avisa por toast e nao deixa dados velhos na tela', async () => {
    await renderizar();
    await selecionarCliente(1);
    expect(textoDaTela()).toContain('CHP-ALFA');
    api.get.mockImplementation((url) => {
      if (url === '/almoxarifado/materiais-cliente/clientes') return Promise.resolve({ data: CLIENTES });
      return Promise.reject(new Error('boom'));
    });
    await selecionarCliente(2);
    expect(toast.error).toHaveBeenCalled();
    expect(textoDaTela()).not.toContain('CHP-ALFA');
  });
});
