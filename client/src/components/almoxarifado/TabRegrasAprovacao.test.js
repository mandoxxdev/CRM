/**
 * Aba "Regras de Aprovação" (Etapa 47, T6).
 *
 * O contrato HTTP é congelado por `server/tests/api/regrasAprovacao.api.test.js`. O que só o
 * cliente prova:
 *   - que a tela manda o PAYLOAD do contrato (números como número, vazio como null,
 *     `material_critico` booleano, `aprovadores` como array de ids);
 *   - que a recusa do backend aparece COM A LITERAL dele, e não uma genérica;
 *   - a costura com a T7: desativar regra com pendência aberta PEDE CONFIRMAÇÃO antes (o efeito
 *     atinge requisições em andamento) e AVISA depois quantas pendências deixaram de bloquear —
 *     e desativar regra SEM pendência não pergunta nada (a metade positiva).
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/TabRegrasAprovacao --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import TabRegrasAprovacao from './TabRegrasAprovacao';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Admin', role: 'admin' } }),
}));
jest.mock('../../utils/systemPermissions', () => ({
  filterVisibleUsers: (users) => users,
}));

const USUARIOS = [
  { id: 11, nome: 'Ana Gestora', email: 'ana@ex.com', ativo: 1 },
  { id: 12, nome: 'Bia Gestora', email: 'bia@ex.com', ativo: 1 },
];
const CENTROS = [{ id: 5, codigo: 'CC-05', nome: 'Manutenção' }];
const REGRA_COM_PENDENCIA = {
  id: 1, nome: 'Valor alto', ativo: 1, valor_minimo: 1000, material_critico: null,
  tipo_requisicao: null, quantidade_minima: null, centro_custo_id: null, projeto_id: null,
  aprovadores: [11], pendencias_abertas: 3,
};
const REGRA_SEM_PENDENCIA = {
  id: 2, nome: 'Material crítico', ativo: 1, valor_minimo: null, material_critico: 1,
  tipo_requisicao: null, quantidade_minima: null, centro_custo_id: 5, projeto_id: null,
  aprovadores: [12], pendencias_abertas: 0,
};

let container;
let root;

function mockGets(regras = [REGRA_COM_PENDENCIA, REGRA_SEM_PENDENCIA]) {
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/regras-aprovacao') return Promise.resolve({ data: regras });
    if (url === '/usuarios') return Promise.resolve({ data: USUARIOS });
    if (url === '/almoxarifado/centros-custo') return Promise.resolve({ data: CENTROS });
    return Promise.reject(new Error(`GET inesperado: ${url}`));
  });
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const botao = (texto, escopo = container) => [...escopo.querySelectorAll('button')]
  .find((b) => b.textContent.trim().includes(texto));
async function clicar(el) {
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await flush();
}
function digitar(el, valor) {
  const setter = Object.getOwnPropertyDescriptor(
    el.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set;
  act(() => {
    setter.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

async function renderizar() {
  await act(async () => { root.render(<TabRegrasAprovacao />); });
  await flush();
}

beforeEach(() => {
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  mockGets();
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

test('lista as regras com os criterios em linguagem de usuario, quem assina e as pendencias', async () => {
  await renderizar();
  const r1 = container.querySelector('[data-testid="regra-1"]');
  expect(r1.textContent).toContain('Valor ≥');
  expect(r1.textContent).toContain('1.000,00');
  expect(r1.textContent).toContain('Assinam: Ana Gestora');
  expect(r1.textContent).toContain('3 requisição(ões) aguardando assinatura desta regra');
  const r2 = container.querySelector('[data-testid="regra-2"]');
  expect(r2.textContent).toContain('Algum item é material crítico');
  expect(r2.textContent).toContain('Centro de custo: CC-05 — Manutenção');
  expect(r2.textContent).not.toContain('aguardando assinatura');
});

test('criar: o payload tem a forma do contrato (numero, null, booleano, array de ids)', async () => {
  api.post.mockResolvedValue({ data: { id: 3 } });
  await renderizar();
  await clicar(botao('Nova regra'));
  digitar(container.querySelector('#regra-nome'), 'Qtd grande');
  digitar(container.querySelector('#regra-qtd'), '50');
  const checkAna = [...container.querySelectorAll('[data-testid="form-regra"] label')]
    .find((l) => l.textContent.includes('Ana Gestora')).querySelector('input');
  await clicar(checkAna);
  await clicar(botao('Salvar regra'));

  expect(api.post).toHaveBeenCalledWith('/almoxarifado/regras-aprovacao', {
    nome: 'Qtd grande', tipo_requisicao: null, urgencia: null, material_critico: false, material_cliente: false,
    valor_minimo: null, quantidade_minima: 50, centro_custo_id: null,
    aprovadores: [11], ativo: true,
  });
  expect(toast.success).toHaveBeenCalledWith('Regra criada');
});

test('a recusa do backend aparece com a literal DELE', async () => {
  api.post.mockRejectedValue({ response: { status: 400, data: { error: 'Regra precisa de pelo menos um critério' } } });
  await renderizar();
  await clicar(botao('Nova regra'));
  digitar(container.querySelector('#regra-nome'), 'Sem criterio');
  await clicar(botao('Salvar regra'));
  expect(toast.error).toHaveBeenCalledWith('Regra precisa de pelo menos um critério');
  expect(container.querySelector('[data-testid="form-regra"]')).not.toBeNull(); // o formulário não fecha
});

test('desativar regra COM pendencia pede confirmacao antes, e avisa quantas deixaram de bloquear depois', async () => {
  api.put.mockResolvedValue({ data: { regra: { ...REGRA_COM_PENDENCIA, ativo: 0 }, pendencias_obsoletadas: 3 } });
  await renderizar();
  const r1 = container.querySelector('[data-testid="regra-1"]');
  await clicar(botao('Desativar', r1));
  expect(api.put).not.toHaveBeenCalled();
  const alerta = r1.querySelector('[role="alert"]');
  expect(alerta.textContent).toContain('libera 3 requisição(ões)');

  await clicar(botao('Desativar mesmo assim', r1));
  expect(api.put).toHaveBeenCalledTimes(1);
  const [url, body] = api.put.mock.calls[0];
  expect(url).toBe('/almoxarifado/regras-aprovacao/1');
  expect(body.ativo).toBe(false);
  expect(body.valor_minimo).toBe(1000);
  expect(body.aprovadores).toEqual([11]);
  expect(toast.info).toHaveBeenCalledWith('3 aprovação(ões) pendente(s) desta regra deixaram de bloquear requisições');
});

test('desativar regra SEM pendencia nao pergunta nada (metade positiva)', async () => {
  api.put.mockResolvedValue({ data: { regra: { ...REGRA_SEM_PENDENCIA, ativo: 0 }, pendencias_obsoletadas: 0 } });
  await renderizar();
  const r2 = container.querySelector('[data-testid="regra-2"]');
  await clicar(botao('Desativar', r2));
  expect(api.put).toHaveBeenCalledTimes(1);
  expect(api.put.mock.calls[0][1].centro_custo_id).toBe(5);
  expect(api.put.mock.calls[0][1].material_critico).toBe(true);
  expect(toast.info).not.toHaveBeenCalled();
});

test('editar pela tela PRESERVA projeto_id e ordem, que nao tem campo aqui (Fase 5, testes 5)', async () => {
  // O PUT substitui a regra inteira: sem repassar os dois, editar apagava o projeto e zerava a
  // ordem — e uma regra só de projeto tomava 400 "sem critério".
  mockGets([{ ...REGRA_COM_PENDENCIA, projeto_id: 42, ordem: 7 }]);
  api.put.mockResolvedValue({ data: { regra: {}, pendencias_obsoletadas: 0 } });
  await renderizar();
  await clicar(botao('Editar'));
  digitar(container.querySelector('#regra-nome'), 'Valor alto (editada)');
  await clicar(botao('Salvar regra'));
  const [url, body] = api.put.mock.calls[0];
  expect(url).toBe('/almoxarifado/regras-aprovacao/1');
  expect(body.nome).toBe('Valor alto (editada)');
  expect(body.projeto_id).toBe(42);
  expect(body.ordem).toBe(7);
});

test('ativar/desativar tambem preserva ordem e projeto', async () => {
  mockGets([{ ...REGRA_SEM_PENDENCIA, projeto_id: 9, ordem: 3 }]);
  api.put.mockResolvedValue({ data: { regra: {}, pendencias_obsoletadas: 0 } });
  await renderizar();
  await clicar(botao('Desativar'));
  expect(api.put.mock.calls[0][1].projeto_id).toBe(9);
  expect(api.put.mock.calls[0][1].ordem).toBe(3);
});

test('Etapa 48: urgencia e material de cliente — no payload, e descritos na lista', async () => {
  mockGets([{ ...REGRA_SEM_PENDENCIA, id: 5, nome: 'Urgente de cliente', material_critico: null, centro_custo_id: null,
    urgencia: 'URGENTE', material_cliente: 1 }]);
  api.post.mockResolvedValue({ data: { id: 6 } });
  await renderizar();
  const linha = container.querySelector('[data-testid="regra-5"]');
  expect(linha.textContent).toContain('Urgência: Urgente');
  expect(linha.textContent).toContain('Algum item é material de cliente');

  await clicar(botao('Nova regra'));
  digitar(container.querySelector('#regra-nome'), 'Crítico de cliente');
  digitar(container.querySelector('#regra-urgencia'), 'CRITICO');
  const checkCliente = [...container.querySelectorAll('[data-testid="form-regra"] label')]
    .find((l) => l.textContent.includes('material de cliente')).querySelector('input');
  await clicar(checkCliente);
  await clicar(botao('Salvar regra'));
  const body = api.post.mock.calls[0][1];
  expect(body.urgencia).toBe('CRITICO');
  expect(body.material_cliente).toBe(true);
});

test('Etapa 48 (Fase 5, E/F): desativar e editar PRESERVAM urgencia e material de cliente', async () => {
  // `paraPayload` manda `urgencia: null` quando o form não a tem — e null explícito APAGA o critério
  // no servidor. É o defeito da Etapa 47 com projeto_id, nos dois gestos que remontam o payload.
  const regra = { ...REGRA_SEM_PENDENCIA, id: 9, nome: 'Urgente de cliente', material_critico: null,
    centro_custo_id: null, urgencia: 'URGENTE', material_cliente: 1 };
  mockGets([regra]);
  api.put.mockResolvedValue({ data: { regra: {}, pendencias_obsoletadas: 0 } });
  await renderizar();
  await clicar(botao('Desativar'));
  expect(api.put.mock.calls[0][1].urgencia).toBe('URGENTE');
  expect(api.put.mock.calls[0][1].material_cliente).toBe(true);

  await clicar(botao('Editar'));
  await clicar(botao('Salvar regra'));
  const corpoEdicao = api.put.mock.calls[api.put.mock.calls.length - 1][1];
  expect(corpoEdicao.urgencia).toBe('URGENTE');
  expect(corpoEdicao.material_cliente).toBe(true);
});
