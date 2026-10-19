/**
 * Etapa 156 (T4 — integracao que cruza a T1 e a T2): a tela das Reservas com a camada de comunicacao REAL (`services/api.js`, axios real,
 * adaptador falso na fronteira HTTP — nenhum mock do api).
 *
 *   RN-156.01 (C369)  a lista de reservas pedida com um filtro e, enquanto ela espera o banco ocupado (503), com outro: o mesmo endereco com
 *                     filtros diferentes — as duas respostas chegam e a tabela fica com a do filtro novo (antes: o segundo pedido era
 *                     recusado na hora, "Erro ao carregar reservas", e a tabela ficava com a do filtro velho).
 *   RN-156.02 (C366)  /clientes com o banco ocupado e depois o 403 do portao (o corpo do fixture, conferido pelo teste do servidor): a frase
 *                     com o motivo sob o seletor de cliente; /projetos ocupado e depois 200: as opcoes.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import ReservasAlmoxarifado from './ReservasAlmoxarifado';
import RECUSA_DA_LISTA from './__fixtures__/recusaDaListaDoServidor.json';
import CLIENTE_DO_SERVIDOR from './__fixtures__/clienteDoServidor.json';

jest.mock('axios', () => jest.requireActual('axios/dist/browser/axios.cjs'));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() } }));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: { id: 1, nome: 'Admin' } }) }));
jest.mock('./ExtratoMaterialModal', () => ({ __esModule: true, default: () => null }));

const axios = require('axios');
const { toast } = require('react-toastify');
const api = require('../../services/api').default;

const FRASE_403 = 'Sem acesso à lista de clientes: Acesso negado ao módulo. Recarregue a página para conferir suas permissões.';
const RESERVA = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', material_unidade: 'PC', quantidade: 10,
  quantidade_utilizada: 0, saldo: 10, status: 'ATIVA', origem: 'MANUAL', requisicao_id: null, projeto_id: 7, os_id: null,
  os_referencia: null, cliente_id: null, solicitante_nome: 'Maria', data_necessidade: null, expira_em: null,
};
const LIBERADA = { ...RESERVA, id: 2, status: 'LIBERADA', saldo: 0, motivo_liberacao: 'Projeto cancelado' };

let chamadas;
let vezes;
function resposta(config, status, data) {
  if (status >= 400) {
    throw new axios.AxiosError(`status ${status}`, 'ERR_BAD_RESPONSE', config, null, { status, statusText: '', data, headers: {}, config });
  }
  return { status, statusText: 'OK', data, headers: {}, config };
}
const OCUPADO = { error: 'Banco temporariamente ocupado. Tente novamente em alguns segundos.', retryAfter: 0.05 };

let container;
let root;
beforeAll(() => {
  jest.spyOn(console, 'log').mockImplementation(() => {});
  jest.spyOn(console, 'error').mockImplementation(() => {});
});
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  chamadas = [];
  vezes = {};
  api.defaults.adapter = async (config) => {
    const chave = `${config.url}?${JSON.stringify(config.params || {})}`;
    vezes[chave] = (vezes[chave] || 0) + 1;
    chamadas.push(chave);
    const primeira = vezes[chave] === 1;
    if (config.url === '/almoxarifado/reservas') {
      if (primeira) return resposta(config, 503, OCUPADO);
      return resposta(config, 200, config.params && config.params.status === 'ATIVA' ? [RESERVA] : [RESERVA, LIBERADA]);
    }
    if (config.url === '/clientes') return resposta(config, primeira ? 503 : 403, primeira ? OCUPADO : RECUSA_DA_LISTA);
    if (config.url === '/projetos') return primeira ? resposta(config, 503, OCUPADO) : resposta(config, 200, [{ id: 7, nome: 'Projeto Alfa' }]);
    if (config.url === '/almoxarifado/estoque') return resposta(config, 200, [{ id: 10, codigo: 'MAT-1', nome: 'Chapa 3mm', unidade: 'PC', quantidade_disponivel: 20 }]);
    return resposta(config, 200, []);
  };
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

const pausa = (ms) => new Promise((r) => setTimeout(r, ms));
async function esperar(cond, ms = 3000) {
  const fim = Date.now() + ms;
  while (Date.now() < fim) {
    if (cond()) return true;
    // eslint-disable-next-line no-await-in-loop
    await act(async () => { await pausa(20); });
  }
  return cond();
}
const linhas = () => [...container.querySelectorAll('.almox-table tbody tr')];
function preencher(elemento, valor) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
  act(() => {
    setValue.call(elemento, valor);
    elemento.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
function campoDoModal(rotulo) {
  return [...container.querySelectorAll('.almox-modal .almox-field')]
    .find((g) => g.querySelector('label')?.textContent.replace('*', '').trim() === rotulo);
}

test('[RN-156.01, C369, integracao T1] a lista de reservas: o filtro trocado enquanto o primeiro pedido espera o 503 — as duas chegam e a tabela fica com a do filtro novo', async () => {
  await act(async () => { root.render(<MemoryRouter><ReservasAlmoxarifado /></MemoryRouter>); });
  // o primeiro pedido (status=ATIVA) tomou 503 e espera; troca o filtro de status para "Todos" (outro pedido ao mesmo endereco)
  const filtroStatus = container.querySelector('select.almox-select');
  expect([...filtroStatus.options].map((o) => o.value)).toContain('');
  preencher(filtroStatus, '');
  const chegou = await esperar(() => linhas().length === 2 && vezes['/almoxarifado/reservas?{}'] === 2);
  expect(toast.error).not.toHaveBeenCalledWith('Erro ao carregar reservas'); // antes: o segundo pedido recusado na hora
  expect(chegou).toBe(true);
  expect(vezes['/almoxarifado/reservas?{"status":"ATIVA"}']).toBe(2); // o primeiro tambem repetiu e respondeu
  expect(linhas().map((l) => l.textContent).join('|')).toContain('Projeto cancelado');
});

test('[RN-156.02, C366, integracao T2] /clientes ocupado e depois recusado pelo portao: a frase sob o seletor de cliente; /projetos ocupado e depois 200: as opcoes', async () => {
  await act(async () => { root.render(<MemoryRouter><ReservasAlmoxarifado /></MemoryRouter>); });
  await esperar(() => vezes['/clientes?{}'] === 2 && vezes['/projetos?{}'] === 2);
  const novaReserva = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Nova Reserva'));
  await act(async () => { novaReserva.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  const apareceu = await esperar(() => (campoDoModal('Cliente')?.textContent || '').includes(FRASE_403));
  expect(apareceu).toBe(true);
  const cliente = campoDoModal('Cliente');
  expect([...cliente.querySelector('select').options].map((o) => o.textContent)).toEqual(['—']);
  // a metade positiva: a outra lista, que so estava ocupada, carregou — e o seletor dela nao tem aviso
  const projeto = campoDoModal('Projeto');
  expect([...projeto.querySelector('select').options].map((o) => o.textContent)).toEqual(['—', 'Projeto Alfa']);
  expect(projeto.querySelector('[role="alert"]')).toBeNull();
  expect(CLIENTE_DO_SERVIDOR.razao_social).toBeTruthy(); // o fixture da lista boa existe (a recusa e que tirou o cliente da tela)
});
