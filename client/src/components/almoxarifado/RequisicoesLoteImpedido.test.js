/**
 * Etapa 205 (T2b, Fase 2 I4) — a janela de separação mostra quanto do saldo está em lote bloqueado, reprovado ou vencido (o campo
 * `lote_impedido` do detalhe). Sem a linha, o modal dizia "Saldo: 10" e pré-preenchia 4 sem dizer por quê.
 *
 * Plano: docs/superpowers/plans/2026-11-06-almoxarifado-etapa205-lote-impedido-na-aprovacao-e-separacao.md (T2b)
 * Executar: cd client && CI=true npx react-scripts test src/components/almoxarifado/RequisicoesLoteImpedido --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import RequisicoesList from './RequisicoesList';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({ perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false }),
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 99, nome: 'Almoxarife Teste', role: 'admin' } }),
}));
jest.mock('./RequisicoesMaterialContext', () => ({
  useRequisicoesMaterialContext: () => ({ warehouseMode: true, basePath: '', setor: null }),
}));

const ITEM = {
  id: 1, material_id: 10, material_codigo: 'MAT-1', material_nome: 'Chapa 3mm', material_unidade: 'un', material_foto: null,
  unidade: 'un', quantidade_solicitada: 5, saldo_atual: 10, localizacao_nome: null, almoxarifado_nome: null,
  origem_separacao_id: null, lote_separacao_id: null, origem_separacao_codigo: null, lote_separacao_codigo: null,
  quantidade_separada: 0, quantidade_entregue: 0, quantidade_atendida: 0,
};
const REQ = {
  id: 55, numero: 'REQ-055', tipo: 'CONSUMO', urgencia: 'NORMAL', solicitante_id: 99, solicitante_nome: 'Almoxarife Teste',
  setor: 'Produção', justificativa: 'Teste', criado_em: '2026-11-06T10:00:00', data_necessidade: null, projeto_id: null,
  projeto_nome: null, os_id: null, os_referencia: null, centro_custo_id: null, centro_custo_nome: null, recebimento_confirmado_em: null,
};
const comItem = (extra) => ({ ...REQ, status: 'AGUARDANDO_ESTOQUE', itens: [{ ...ITEM, ...extra }] });

let container; let root; let requisicao;
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  api.get.mockImplementation((url) => {
    if (url === '/almoxarifado/requisicoes') {
      const { itens, ...linha } = requisicao;
      return Promise.resolve({ data: [linha] });
    }
    if (url === '/almoxarifado/requisicoes/55') return Promise.resolve({ data: requisicao });
    if (url === '/almoxarifado/configuracoes/liberacao-valor') return Promise.resolve({ data: { souAprovador: false } });
    return Promise.resolve({ data: [] });
  });
  api.put.mockImplementation(() => Promise.resolve({ data: {} }));
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.clearAllMocks(); });

async function renderizar() {
  await act(async () => {
    root.render(<MemoryRouter initialEntries={['/almoxarifado/requisicoes?id=55']}><RequisicoesList /></MemoryRouter>);
  });
}
const botao = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim().includes(texto));
const clicar = async (texto) => {
  const b = botao(texto);
  if (!b) throw new Error(`botao "${texto}" nao encontrado`);
  await act(async () => { b.click(); });
};
const inputs = () => [...container.querySelectorAll('.almox-modal input.almox-count-input')];
const textoDoModal = () => container.querySelector('.almox-modal').textContent;

describe('Etapa 205 — a janela de separação mostra o saldo em lote impedido', () => {
  test('[Fase 2 I4] lote_impedido 6 -> "Saldo: 10 · Em lote bloqueado/reprovado/vencido: 6" e o campo vem com o separável 4', async () => {
    requisicao = comItem({ lote_impedido: 6, saldo_separavel: 4, quantidade_separavel: 4, saldo_separavel_reserva: 0 });
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textoDoModal()).toContain('Saldo: 10 · Em lote bloqueado/reprovado/vencido: 6');
    expect(inputs().map((i) => i.value)).toEqual(['4']);
  });

  test('[Fase 2 I4] lote_impedido 0 (ou ausente) -> a linha de hoje, sem a frase do lote', async () => {
    requisicao = comItem({ lote_impedido: 0, saldo_separavel: 5, quantidade_separavel: 5, saldo_separavel_reserva: 0 });
    await renderizar();
    await clicar('Iniciar Separação');
    expect(textoDoModal()).toContain('Saldo: 10'); // metade positiva: a linha esta la
    expect(textoDoModal()).not.toContain('Em lote bloqueado');
    expect(textoDoModal()).not.toContain('Saldo: 100'); // o `0 &&` do React nao pinta um "0" grudado
  });
});
