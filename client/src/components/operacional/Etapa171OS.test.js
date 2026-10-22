/**
 * Etapa 171 Fase 5 — o front da OS com pedido de compra:
 * (A) o PUT da OS devolve `aviso` e `reservas_liberadas` desde a Etapa 171 T3 (a OS encerrada solta a reserva da compra); o
 *     formulario mostra os dois em toast em vez de engolir.
 * (B) a exclusao da OS com pedido vinculado responde 409 (RN-171.10) com a mensagem do servidor; a lista mostra essa mensagem,
 *     e o texto generico so quando o servidor nao manda nenhuma.
 * O `api` simulado na fronteira HTTP (o molde da Etapa160Fabrica.test.js).
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import api from '../../services/api';
import OrdensServico from './OrdensServico';
import OSForm from './OSForm';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn(), warning: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => {
  const user = { id: 1, nome: 'ADMIN', role: 'admin' };
  return { useAuth: () => ({ user }) };
});
jest.mock('../../utils/userFilters', () => ({ fetchModuleUsers: () => Promise.resolve([]) }));

const { toast } = require('react-toastify');

global.IS_REACT_ACT_ENVIRONMENT = true;
let container; let root;
beforeAll(() => { jest.spyOn(console, 'error').mockImplementation(() => {}); });
beforeEach(() => {
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: [] });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});
async function montar(el) {
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  for (let i = 0; i < 6; i++) await act(async () => {});
}
async function assentar() {
  for (let i = 0; i < 6; i++) await act(async () => {});
}

describe('[Etapa 171 Fase 5 A] o PUT da OS: aviso e reservas liberadas', () => {
  const OS = { id: 7, numero_os: 'OS-171-7', tipo_os: 'fabricacao', prioridade: 'normal', status: 'cancelada', data_abertura: '2026-10-20' };
  async function salvar(resposta) {
    api.put.mockResolvedValue({ data: resposta });
    const onClose = jest.fn();
    await montar(<OSForm os={OS} onClose={onClose} />);
    const form = container.querySelector('form');
    await act(async () => { form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    await assentar();
    expect(api.put).toHaveBeenCalledWith('/operacional/ordens-servico/7', expect.any(Object));
    expect(toast.success).toHaveBeenCalledWith('OS atualizada com sucesso');
    expect(onClose).toHaveBeenCalled();
  }

  test('o aviso do servidor vira toast de aviso', async () => {
    await salvar({ id: 7, aviso: 'A OS tinha 2 reservas de material de compra' });
    expect(toast.warning).toHaveBeenCalledWith('A OS tinha 2 reservas de material de compra');
  });

  test('reservas_liberadas > 0 vira toast com a contagem', async () => {
    await salvar({ id: 7, reservas_liberadas: 2 });
    expect(toast.info).toHaveBeenCalledWith('2 reserva(s) de material de compra liberada(s) para o estoque');
    expect(toast.warning).not.toHaveBeenCalled();
  });

  test('reservas_liberadas = 0 e sem aviso: nenhum toast a mais', async () => {
    await salvar({ id: 7, reservas_liberadas: 0 });
    expect(toast.info).not.toHaveBeenCalled();
    expect(toast.warning).not.toHaveBeenCalled();
  });
});

describe('[Etapa 171 Fase 5 B, RN-171.10] a exclusao da OS com pedido de compra', () => {
  const OS1 = { id: 3, numero_os: 'OS-171-3', prioridade: 'normal', status: 'pendente' };
  async function excluirComErro(erro) {
    api.get.mockResolvedValue({ data: [OS1] });
    api.delete.mockRejectedValue(erro);
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await montar(<OrdensServico />);
    const botao = container.querySelector('button.action-btn.delete');
    expect(botao).toBeTruthy();
    await act(async () => { botao.click(); });
    await assentar();
    expect(api.delete).toHaveBeenCalledWith('/operacional/ordens-servico/3');
  }

  test('o 409 mostra a mensagem do servidor', async () => {
    const msg = 'A OS OS-171-3 tem pedido de compra vinculado (PC-1) — cancele a OS em vez de excluir';
    await excluirComErro({ response: { status: 409, data: { error: msg } } });
    expect(toast.error).toHaveBeenCalledWith(msg);
  });

  test('sem mensagem do servidor, o texto generico', async () => {
    await excluirComErro(new Error('rede caiu'));
    expect(toast.error).toHaveBeenCalledWith('Erro ao excluir OS');
  });
});
