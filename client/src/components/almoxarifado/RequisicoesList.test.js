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

// Permissões liberadas: o alvo é o comportamento da tela, o gate real é do servidor.
jest.mock('../../hooks/useAlmoxPermissoes', () => ({
  useAlmoxPermissoes: () => ({
    perfil: 'ADMINISTRADOR', pode: () => true, bloquearSeNaoPode: () => true, loading: false,
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
