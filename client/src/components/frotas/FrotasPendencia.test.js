/**
 * Frota Etapa 6 (T2) — tratar a pendencia do registro na tela (RN-F6.06/07/08/09), contra o contrato congelado do plano
 * docs/superpowers/plans/2026-10-23-frotas-etapa6-tratar-pendencia.md (com os "Ajustes da Fase 2"). So a fronteira HTTP (`api`) e
 * mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasPendencia --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasEntityPage from './FrotasEntityPage';
import FrotasDashboard from './FrotasDashboard';
import FrotasPortalMotorista from './FrotasPortalMotorista';
import {
  fetchFrotasDashboard, invalidateFrotasDashboardCache, tratarPendencia, desfazerTratamento,
} from '../../utils/frotasApi';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const GESTOR = { id: 1, nome: 'Gestor', role: 'user', admin_modulos: ['frota'] };
const CONSULTA = { id: 2, nome: 'Carla', role: 'user', perfil_frota: 'CONSULTA' };
const MOTORISTA = { id: 7, nome: 'Jose', role: 'user', perfil_frota: null };
// Estavel entre renders (o portal recarrega quando o refreshUser muda)
const mockAuth = { user: GESTOR, refreshUser: () => Promise.resolve(null), logout: () => {} };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const TRATADA = {
  pendencia_tratada_em: '2026-10-23T14:05', pendencia_tratada_por_id: 1, pendencia_tratada_por_nome: 'Gestor Frota',
  pendencia_tratamento: 'Troquei a pastilha', pendencia_manutencao_id: 12, pendencia_manutencao_descricao: 'Troca de pastilha',
};
const linhaBase = (over) => ({
  data_checklist: '2026-10-23', placa: 'ABC1D23', veiculo_id: 3, motorista_nome: 'Jose', tipo_registro: 'saida', km: 1000,
  aprovado: 0, anexos: [], ...over,
});
let checklists;
let manutencoes;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockAuth.user = GESTOR;
  invalidateFrotasDashboardCache();
  checklists = [
    linhaBase({ id: 1, status_geral: 'PENDENCIA' }),
    linhaBase({ id: 2, status_geral: 'OK', aprovado: 1 }),
    linhaBase({ id: 3, status_geral: 'INCOMPLETO' }),
    linhaBase({ id: 4, status_geral: 'PENDENCIA', placa: 'XYZ9K88', veiculo_id: 5, ...TRATADA }),
  ];
  manutencoes = [
    { id: 12, veiculo_id: 3, descricao: 'Troca de pastilha', data_manutencao: '2026-10-20', status: 'concluida' },
    { id: 13, veiculo_id: 3, descricao: 'Revisao', data_manutencao: '2026-09-01', status: 'agendada' },
  ];
  api.get.mockImplementation((url) => {
    if (url === '/frotas/meta') return Promise.resolve({ data: {} });
    if (url === '/frotas/checklists') return Promise.resolve({ data: checklists });
    if (url === '/frotas/manutencoes') return Promise.resolve({ data: manutencoes });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { id: 1 } });
  api.delete.mockResolvedValue({ data: { id: 4 } });
});

let container;
let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

async function render(el) {
  await act(async () => { root.render(<MemoryRouter>{el}</MemoryRouter>); });
  await act(async () => {});
}
async function clicar(el) {
  if (!el) throw new Error('elemento nao encontrado');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => {});
}
async function digitar(el, texto) {
  const setValue = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
  await act(async () => {
    setValue.call(el, texto);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function escolher(select, valor) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set.call(select, valor);
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
}
async function enviar() {
  await act(async () => { janela().querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
  await act(async () => {});
}
const botoes = (raiz = container) => [...raiz.querySelectorAll('button')];
const botao = (texto, raiz = container) => botoes(raiz).find((b) => b.textContent.trim() === texto);
const linha = (i) => container.querySelectorAll('tbody tr')[i];
const janela = () => container.querySelector('[role="dialog"]');
const leiturasDaLista = () => api.get.mock.calls.filter(([u]) => u === '/frotas/checklists').length;
const URL_TRATAR = (id) => `/frotas/checklists/${id}/tratar-pendencia`;

describe('Lista Checklist do gestor: Tratar pendência', () => {
  test('so a linha PENDENCIA nao tratada tem o botao; OK e INCOMPLETO nao', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    expect(botao('Tratar pendência', linha(0))).toBeDefined();
    expect(botao('Tratar pendência', linha(1))).toBeUndefined();
    expect(botao('Tratar pendência', linha(2))).toBeUndefined();
    expect(botao('Tratar pendência', linha(3))).toBeUndefined(); // tratada: tem o Desfazer
    expect(botao('Desfazer tratamento', linha(3))).toBeDefined();
  });

  test('janela: titulo, manutencoes do veiculo no select, envia o corpo certo, recarrega a lista e da o toast', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Tratar pendência', linha(0)));
    const j = janela();
    expect(j.querySelector('h2').textContent).toBe('Tratar pendência — ABC1D23');
    expect(api.get).toHaveBeenCalledWith('/frotas/manutencoes', { params: { veiculo_id: 3 } });
    const rotulos = [...j.querySelectorAll('label')].map((l) => l.textContent);
    expect(rotulos).toEqual(['O que foi feito *', 'Manutenção (opcional)']);
    expect(j.querySelector('textarea').maxLength).toBe(1000);
    const select = j.querySelector('select');
    expect([...select.options].map((o) => o.textContent)).toEqual([
      '— nenhuma —', '20/10/2026 · Troca de pastilha', '01/09/2026 · Revisao',
    ]);
    expect(botao('Cancelar', j)).toBeDefined();

    await digitar(j.querySelector('textarea'), '  Troquei a pastilha  ');
    await escolher(select, '12');
    const antes = leiturasDaLista();
    await enviar();

    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith(URL_TRATAR(1), { tratamento: 'Troquei a pastilha', manutencao_id: 12 });
    expect(toast.success).toHaveBeenCalledWith('Pendência tratada');
    expect(leiturasDaLista()).toBe(antes + 1);
    expect(janela()).toBeNull();
  });

  test('"— nenhuma —" envia manutencao_id null', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Tratar pendência', linha(0)));
    await digitar(janela().querySelector('textarea'), 'Ajustei o freio');
    await enviar();
    expect(api.post).toHaveBeenCalledWith(URL_TRATAR(1), { tratamento: 'Ajustei o freio', manutencao_id: null });
  });

  test('texto vazio ou so espacos: botao desligado e nada vai ao servidor', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Tratar pendência', linha(0)));
    expect(botao('Marcar como tratada', janela()).disabled).toBe(true);
    await digitar(janela().querySelector('textarea'), '    ');
    expect(botao('Marcar como tratada', janela()).disabled).toBe(true);
    await enviar();
    expect(api.post).not.toHaveBeenCalled();
    // metade positiva: com texto, liga
    await digitar(janela().querySelector('textarea'), 'x');
    expect(botao('Marcar como tratada', janela()).disabled).toBe(false);
  });

  test('"Salvando..." durante o envio', async () => {
    let soltar;
    api.post.mockReturnValue(new Promise((r) => { soltar = r; }));
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Tratar pendência', linha(0)));
    await digitar(janela().querySelector('textarea'), 'x');
    await enviar();
    const b = botao('Salvando...', janela());
    expect(b).toBeDefined();
    expect(b.disabled).toBe(true);
    await act(async () => { soltar({ data: {} }); });
  });

  test('409: mostra a mensagem do servidor, a janela fica aberta e a lista nao recarrega', async () => {
    api.post.mockRejectedValue({ response: { status: 409, data: { error: 'Esta pendência já foi tratada', code: 'PENDENCIA_JA_TRATADA' } } });
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Tratar pendência', linha(0)));
    await digitar(janela().querySelector('textarea'), 'x');
    const antes = leiturasDaLista();
    await enviar();
    expect(toast.error).toHaveBeenCalledWith('Esta pendência já foi tratada');
    expect(toast.success).not.toHaveBeenCalled();
    expect(janela()).not.toBeNull();
    expect(botao('Marcar como tratada', janela()).disabled).toBe(false);
    expect(leiturasDaLista()).toBe(antes);
  });

  test('erro sem mensagem: texto generico', async () => {
    api.post.mockRejectedValue(new Error('rede'));
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Tratar pendência', linha(0)));
    await digitar(janela().querySelector('textarea'), 'x');
    await enviar();
    expect(toast.error).toHaveBeenCalledWith('Não foi possível tratar a pendência.');
  });

  test('Cancelar fecha sem enviar', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Tratar pendência', linha(0)));
    await clicar(botao('Cancelar', janela()));
    expect(janela()).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
  });
});

describe('Lista Checklist: linha tratada', () => {
  test('etiqueta "PENDÊNCIA · tratada" e o texto com a manutencao', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    const etiqueta = linha(3).querySelector('.frotas-badge');
    expect(etiqueta.textContent).toBe('PENDÊNCIA · tratada');
    expect(etiqueta.className).toBe('frotas-badge frotas-badge-situacao-tratada');
    expect(linha(3).querySelector('.frotas-pendencia-tratada').textContent)
      .toBe('Tratada em 23/10/2026 às 14:05 por Gestor Frota: Troquei a pastilha (manutenção: Troca de pastilha)');
    // a nao tratada segue PENDÊNCIA
    expect(linha(0).querySelector('.frotas-badge').textContent).toBe('PENDÊNCIA');
  });

  test('sem descricao da manutencao (excluida ou nenhuma): sem o trecho, nunca "null"', async () => {
    checklists[3] = { ...checklists[3], pendencia_manutencao_descricao: null };
    await render(<FrotasEntityPage entityKey="checklists" />);
    const texto = linha(3).querySelector('.frotas-pendencia-tratada').textContent;
    expect(texto).toBe('Tratada em 23/10/2026 às 14:05 por Gestor Frota: Troquei a pastilha');
    expect(texto).not.toMatch(/null|manutenção/);
  });

  test('Desfazer: com confirmacao; cancelar nao chama; confirmar chama o DELETE, toast e recarrega', async () => {
    const confirmar = jest.spyOn(window, 'confirm').mockReturnValue(false);
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Desfazer tratamento', linha(3)));
    expect(confirmar).toHaveBeenCalledWith('Desfazer o tratamento desta pendência? O alerta volta para o painel.');
    expect(api.delete).not.toHaveBeenCalled();

    confirmar.mockReturnValue(true);
    const antes = leiturasDaLista();
    await clicar(botao('Desfazer tratamento', linha(3)));
    expect(api.delete).toHaveBeenCalledWith(URL_TRATAR(4));
    expect(toast.success).toHaveBeenCalledWith('Tratamento desfeito');
    expect(leiturasDaLista()).toBe(antes + 1);
  });

  test('Desfazer com erro: mensagem do servidor, ou a generica', async () => {
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    api.delete.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Esta pendência não foi tratada' } } })
      .mockRejectedValueOnce(new Error('rede'));
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Desfazer tratamento', linha(3)));
    expect(toast.error).toHaveBeenLastCalledWith('Esta pendência não foi tratada');
    await clicar(botao('Desfazer tratamento', linha(3)));
    expect(toast.error).toHaveBeenLastCalledWith('Não foi possível desfazer o tratamento.');
    expect(toast.success).not.toHaveBeenCalled();
  });
});

describe('Lista Checklist: Consulta e Motorista nao tratam', () => {
  test('Consulta: ve a etiqueta e o texto da tratada, sem nenhum botao', async () => {
    mockAuth.user = CONSULTA;
    await render(<FrotasEntityPage entityKey="checklists" />);
    expect(linha(3).querySelector('.frotas-badge-situacao-tratada').textContent).toBe('PENDÊNCIA · tratada');
    expect(linha(3).querySelector('.frotas-pendencia-tratada')).not.toBeNull();
    expect(botao('Tratar pendência')).toBeUndefined();
    expect(botao('Desfazer tratamento')).toBeUndefined();
  });

  test('Motorista: tem a coluna Ações (Excluir), mas nao Tratar nem Desfazer', async () => {
    mockAuth.user = MOTORISTA;
    await render(<FrotasEntityPage entityKey="checklists" />);
    expect(linha(0).querySelector('.frotas-action-btn[title="Excluir"]')).not.toBeNull();
    expect(linha(3).querySelector('.frotas-pendencia-tratada')).not.toBeNull();
    expect(botao('Tratar pendência')).toBeUndefined();
    expect(botao('Desfazer tratamento')).toBeUndefined();
  });
});

describe('Painel: Tratar pendência no alerta', () => {
  const PAINEL = {
    veiculosAtivos: 2,
    alertas: [
      { tipo: 'checklist', titulo: 'Checklist com pendência — ABC1D23', descricao: 'Freios', severidade: 'danger',
        referencia_id: 1, veiculo_id: 3, placa: 'ABC1D23', data: '2026-10-23' },
      { tipo: 'documento', titulo: 'Documento vence', descricao: 'CRLV', severidade: 'warning', referencia_id: 9, veiculo_id: 3,
        dias_restantes: 5 },
    ],
  };
  const leiturasDoPainel = () => api.get.mock.calls.filter(([u]) => u === '/frotas/dashboard');
  beforeEach(() => {
    const anterior = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => (url === '/frotas/dashboard' ? Promise.resolve({ data: PAINEL }) : anterior(url, cfg)));
  });

  test('gestor: botao so no alerta de checklist; abre a janela do registro e ao tratar recarrega o painel sem cache', async () => {
    await render(<FrotasDashboard />);
    const alertas = container.querySelectorAll('.frotas-alert-item');
    expect(botao('Tratar pendência', alertas[0])).toBeDefined();
    expect(botao('Tratar pendência', alertas[1])).toBeUndefined();
    await clicar(botao('Tratar pendência', alertas[0]));
    expect(janela().querySelector('h2').textContent).toBe('Tratar pendência — ABC1D23');
    expect(api.get).toHaveBeenCalledWith('/frotas/manutencoes', { params: { veiculo_id: 3 } });
    await digitar(janela().querySelector('textarea'), 'Consertado');
    await enviar();
    expect(api.post).toHaveBeenCalledWith(URL_TRATAR(1), { tratamento: 'Consertado', manutencao_id: null });
    expect(toast.success).toHaveBeenCalledWith('Pendência tratada');
    const leituras = leiturasDoPainel();
    expect(leituras[leituras.length - 1]).toEqual(['/frotas/dashboard', { params: { refresh: 1 } }]);
  });

  test('Consulta: ve o alerta, sem o botao', async () => {
    mockAuth.user = CONSULTA;
    await render(<FrotasDashboard />);
    expect(container.textContent).toContain('Checklist com pendência — ABC1D23');
    expect(botao('Tratar pendência')).toBeUndefined();
  });
});

describe('Portal: Meus registros', () => {
  beforeEach(() => {
    mockAuth.user = MOTORISTA;
    const anterior = api.get.getMockImplementation();
    api.get.mockImplementation((url, cfg) => {
      if (url === '/frotas/portal/inicio') {
        return Promise.resolve({ data: { motorista: { id: 7, nome: 'Jose' }, viagem_aberta: null, veiculos: [], itens: [],
          perfil: 'MOTORISTA', pode_registrar: true, pode_gerir: false } });
      }
      if (url === '/frotas/portal/meus-registros') {
        return Promise.resolve({ data: { abastecimentos: [], registros: [
          { id: 4, tipo_registro: 'saida', placa: 'ABC1D23', data_checklist: '2026-10-22', status_geral: 'PENDENCIA', anexos: [],
            pendencia_tratada_em: '2026-10-23T14:05', pendencia_tratamento: 'Troquei a pastilha', pendencia_tratada_por_nome: 'Gestor' },
          { id: 5, tipo_registro: 'retorno', placa: 'ABC1D23', data_checklist: '2026-10-22', status_geral: 'PENDENCIA', anexos: [] },
        ] } });
      }
      return anterior(url, cfg);
    });
  });

  test('registro tratado: etiqueta e "Tratada em ...: texto"; o nao tratado segue PENDÊNCIA; nenhum botao de tratar', async () => {
    await act(async () => { root.render(<FrotasPortalMotorista />); });
    await act(async () => {});
    const itens = container.querySelectorAll('.portal-lista-item');
    expect(itens.length).toBe(2);
    const etiqueta = itens[0].querySelector('.portal-situacao');
    expect(etiqueta.textContent).toBe('PENDÊNCIA · tratada');
    expect(etiqueta.className).toBe('portal-situacao situacao-tratada');
    expect(itens[0].querySelector('.portal-pendencia-tratada').textContent).toBe('Tratada em 23/10/2026 às 14:05: Troquei a pastilha');
    expect(itens[1].querySelector('.portal-situacao').textContent).toBe('PENDÊNCIA');
    expect(itens[1].querySelector('.portal-pendencia-tratada')).toBeNull();
    expect(botao('Tratar pendência')).toBeUndefined();
    expect(botao('Desfazer tratamento')).toBeUndefined();
  });
});

describe('frotasApi: geracao do cache do painel (Fase 2 T-1)', () => {
  function painelControlado() {
    const pendentes = [];
    api.get.mockImplementation((url) => {
      if (url !== '/frotas/dashboard') return Promise.resolve({ data: [] });
      return new Promise((resolve) => { pendentes.push(resolve); });
    });
    return pendentes;
  }
  const chamadas = () => api.get.mock.calls.filter(([u]) => u === '/frotas/dashboard').length;

  test('limpar no meio de uma busca: o resultado velho nao vira cache', async () => {
    const pendentes = painelControlado();
    const velha = fetchFrotasDashboard();
    invalidateFrotasDashboardCache();
    pendentes[0]({ data: { versao: 'velha' } });
    await expect(velha).resolves.toEqual({ versao: 'velha' });

    const nova = fetchFrotasDashboard();
    expect(chamadas()).toBe(2); // foi ao servidor de novo: o velho nao ficou no cache
    pendentes[1]({ data: { versao: 'nova' } });
    await expect(nova).resolves.toEqual({ versao: 'nova' });
    // metade positiva: a busca da geracao atual grava no cache
    await expect(fetchFrotasDashboard()).resolves.toEqual({ versao: 'nova' });
    expect(chamadas()).toBe(2);
  });

  test('limpar zera o "em andamento", e a busca velha ao terminar nao apaga o da nova', async () => {
    const pendentes = painelControlado();
    fetchFrotasDashboard();
    invalidateFrotasDashboardCache();
    const nova = fetchFrotasDashboard();
    expect(chamadas()).toBe(2); // nao reaproveitou a busca de antes da limpeza
    pendentes[0]({ data: { versao: 'velha' } });
    await act(async () => {});
    const deduplicada = fetchFrotasDashboard();
    expect(chamadas()).toBe(2); // a nova continua sendo a "em andamento"
    pendentes[1]({ data: { versao: 'nova' } });
    await expect(nova).resolves.toEqual({ versao: 'nova' });
    await expect(deduplicada).resolves.toEqual({ versao: 'nova' });
  });

  test('tratar e desfazer (sucesso) limpam o cache; falha nao limpa', async () => {
    api.get.mockResolvedValue({ data: { versao: 1 } });
    await fetchFrotasDashboard();
    await fetchFrotasDashboard();
    expect(chamadas()).toBe(1);

    await tratarPendencia(1, { tratamento: 'x', manutencao_id: '' });
    expect(api.post).toHaveBeenCalledWith(URL_TRATAR(1), { tratamento: 'x', manutencao_id: null });
    await fetchFrotasDashboard();
    expect(chamadas()).toBe(2);

    await desfazerTratamento(1);
    expect(api.delete).toHaveBeenCalledWith(URL_TRATAR(1));
    await fetchFrotasDashboard();
    expect(chamadas()).toBe(3);

    api.post.mockRejectedValueOnce({ response: { status: 409, data: {} } });
    await expect(tratarPendencia(1, { tratamento: 'x' })).rejects.toBeDefined();
    await fetchFrotasDashboard();
    expect(chamadas()).toBe(3);
  });
});
