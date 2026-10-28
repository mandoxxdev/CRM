/**
 * Frota Etapa 7 (T1) — o gestor remove uma foto pela lista (D14), RN-F7.01..07, contra o contrato congelado do plano
 * docs/superpowers/plans/2026-10-28-frotas-etapa7-remover-foto-pela-lista.md (valem os "Ajustes da Fase 2"). So a fronteira HTTP
 * (`api`) e mockada; a pagina generica, a configuracao das colunas e o componente de fotos sao os reais.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasRemoverFotoGestor --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import FrotasEntityPage from './FrotasEntityPage';
import { MSG_FALHA_REMOVER } from './FotosFrota';
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
const mockAuth = { user: GESTOR, refreshUser: () => Promise.resolve(null), logout: () => {} };
jest.mock('../../context/AuthContext', () => ({ useAuth: () => mockAuth }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const foto = (id) => ({ id, url: `/api/uploads/frotas-anexos/f${id}.jpg?e=1&s=x`, tipo_mime: 'image/jpeg' });
const fotos = (...ids) => ids.map(foto);
const LISTAS = {
  checklists: (anexos) => [
    { id: 1, data_checklist: '2026-10-28', placa: 'ABC1D23', veiculo_id: 3, motorista_nome: 'Jose', tipo_registro: 'saida', km: 1000, status_geral: 'OK', aprovado: 1, anexos },
    { id: 2, data_checklist: '2026-10-28', placa: 'XYZ9K88', veiculo_id: 5, motorista_nome: 'Ana', tipo_registro: 'retorno', km: 1200, status_geral: 'OK', aprovado: 1, anexos: [] },
  ],
  abastecimentos: (anexos) => [
    { id: 1, data_abastecimento: '2026-10-28', placa: 'ABC1D23', veiculo_id: 3, litros: 40, valor_total: 250, posto: 'Posto X', km_abastecimento: 1000, anexos },
    { id: 2, data_abastecimento: '2026-10-28', placa: 'XYZ9K88', veiculo_id: 5, litros: 30, valor_total: 180, posto: 'Posto Y', km_abastecimento: 900, anexos: [] },
  ],
};
let dados; // o que o GET da lista devolve (mutavel: o teste troca para simular o recarregar)

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockAuth.user = GESTOR;
  dados = { checklists: LISTAS.checklists(fotos(50, 51, 52)), abastecimentos: LISTAS.abastecimentos(fotos(50, 51, 52)) };
  api.get.mockImplementation((url) => {
    if (url === '/frotas/meta') return Promise.resolve({ data: {} });
    if (url === '/frotas/checklists') return Promise.resolve({ data: dados.checklists });
    if (url === '/frotas/abastecimentos') return Promise.resolve({ data: dados.abastecimentos });
    return Promise.resolve({ data: [] });
  });
  api.delete.mockResolvedValue({ data: { success: true } });
  jest.spyOn(window, 'confirm').mockReturnValue(true);
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
const botoes = (raiz = container) => [...raiz.querySelectorAll('button')];
const botao = (texto, raiz = container) => botoes(raiz).find((b) => b.textContent.trim() === texto);
const linha = (i) => container.querySelectorAll('tbody tr')[i];
const celulaFotos = (i) => [...linha(i).querySelectorAll('td')][[...container.querySelectorAll('thead th')].findIndex((th) => th.textContent === 'Fotos')];
const janela = () => container.querySelector('[role="dialog"]');
const fotosDaJanela = () => [...janela().querySelectorAll('img')].map((img) => img.getAttribute('src').match(/f(\d+)\.jpg/)[1]);
const leiturasDaLista = (entidade) => api.get.mock.calls.filter(([u]) => u === `/frotas/${entidade}`).length;
const rejeitar = (status, error) => Promise.reject(Object.assign(new Error('http'), { response: { status, data: error ? { error } : {} } }));

describe.each(['checklists', 'abastecimentos'])('RN-F7.01/02 — botão Remover foto na coluna Fotos (%s)', (entidade) => {
  test('RN-F7.01 gestor: linha com foto tem miniatura, "+2" e Remover foto; linha sem foto fica "-" sem botão', async () => {
    await render(<FrotasEntityPage entityKey={entidade} />);
    const comFoto = celulaFotos(0);
    expect(comFoto.querySelectorAll('img')).toHaveLength(1); // B58: a lista continua com uma miniatura so
    expect([...comFoto.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['', '+2']);
    expect(botao('Remover foto', comFoto)).toBeDefined();
    const semFoto = celulaFotos(1);
    expect(semFoto.textContent).toBe('-');
    expect(botao('Remover foto', semFoto)).toBeUndefined();
  });

  test.each([['Consulta', CONSULTA], ['Motorista', MOTORISTA]])('RN-F7.02 %s: vê a miniatura e o "+2", mas não o botão', async (_, perfil) => {
    mockAuth.user = perfil;
    await render(<FrotasEntityPage entityKey={entidade} />);
    const celula = celulaFotos(0);
    expect(celula.querySelectorAll('img')).toHaveLength(1);
    expect([...celula.querySelectorAll('a')].map((a) => a.textContent)).toEqual(['', '+2']);
    expect(botao('Remover foto')).toBeUndefined();
  });
});

describe('RN-F7.03..07 — a janela Fotos do lançamento (lista Checklist)', () => {
  test('RN-F7.03 abre com título "Fotos de <placa>", todas as fotos com Remover foto em cada, e Fechar', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    expect(janela()).toBeNull();
    await clicar(botao('Remover foto', celulaFotos(0)));
    const j = janela();
    expect(j).not.toBeNull();
    expect(j.getAttribute('aria-label')).toBe('Fotos de ABC1D23');
    expect(j.querySelector('h2').textContent).toBe('Fotos de ABC1D23');
    expect(fotosDaJanela()).toEqual(['50', '51', '52']);
    expect(botoes(j).filter((b) => b.textContent.trim() === 'Remover foto')).toHaveLength(3);
    expect(botao('Fechar', j)).toBeDefined();
    expect(api.delete).not.toHaveBeenCalled();
  });

  test('RN-F7.04 cancelar a confirmação não chama o servidor; Fechar sem mexer não recarrega', async () => {
    window.confirm.mockReturnValue(false);
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Remover foto', celulaFotos(0)));
    await clicar(botoes(janela()).find((b) => b.textContent.trim() === 'Remover foto'));
    expect(window.confirm).toHaveBeenCalledWith('Remover esta foto?');
    expect(api.delete).not.toHaveBeenCalled();
    expect(fotosDaJanela()).toEqual(['50', '51', '52']);
    await clicar(botao('Fechar', janela()));
    expect(janela()).toBeNull();
    expect(leiturasDaLista('checklists')).toBe(1);
  });

  test('RN-F7.05 remove a 2ª: DELETE do id certo, toast, a janela fica com as duas que sobraram sem recarregar; Fechar recarrega', async () => {
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Remover foto', celulaFotos(0)));
    await clicar(botoes(janela()).filter((b) => b.textContent.trim() === 'Remover foto')[1]);
    expect(api.delete).toHaveBeenCalledTimes(1);
    expect(api.delete.mock.calls[0][0]).toBe('/frotas/anexos/51');
    expect(toast.success).toHaveBeenCalledWith('Foto removida');
    expect(fotosDaJanela()).toEqual(['50', '52']);
    expect(leiturasDaLista('checklists')).toBe(1); // a lista NAO recarregou (recarregar desmontaria a janela — Fase 2 T-1)
    dados.checklists = LISTAS.checklists(fotos(50, 52));
    await clicar(botao('Fechar', janela()));
    expect(janela()).toBeNull();
    expect(leiturasDaLista('checklists')).toBe(2);
    expect([...celulaFotos(0).querySelectorAll('a')].map((a) => a.textContent)).toEqual(['', '+1']);
  });

  test('RN-F7.06 remove a última: a janela fecha sozinha, a lista recarrega e a célula volta a "-"', async () => {
    dados.checklists = LISTAS.checklists(fotos(50));
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Remover foto', celulaFotos(0)));
    expect(fotosDaJanela()).toEqual(['50']);
    dados.checklists = LISTAS.checklists([]);
    await clicar(botoes(janela()).find((b) => b.textContent.trim() === 'Remover foto'));
    expect(api.delete.mock.calls[0][0]).toBe('/frotas/anexos/50');
    expect(janela()).toBeNull();
    expect(leiturasDaLista('checklists')).toBe(2);
    expect(celulaFotos(0).textContent).toBe('-');
    expect(botao('Remover foto', celulaFotos(0))).toBeUndefined();
  });

  test('RN-F7.07 404: toast com a mensagem do servidor e a foto sai da janela mesmo assim (já não existia)', async () => {
    api.delete.mockImplementation(() => rejeitar(404, 'Foto não encontrada'));
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Remover foto', celulaFotos(0)));
    await clicar(botoes(janela()).filter((b) => b.textContent.trim() === 'Remover foto')[0]);
    expect(toast.error).toHaveBeenCalledWith('Foto não encontrada');
    expect(toast.success).not.toHaveBeenCalled();
    expect(fotosDaJanela()).toEqual(['51', '52']);
    expect(leiturasDaLista('checklists')).toBe(1);
  });

  test('RN-F7.07 404 na última: fecha e recarrega', async () => {
    dados.checklists = LISTAS.checklists(fotos(50));
    api.delete.mockImplementation(() => rejeitar(404, 'Foto não encontrada'));
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Remover foto', celulaFotos(0)));
    dados.checklists = LISTAS.checklists([]);
    await clicar(botoes(janela()).find((b) => b.textContent.trim() === 'Remover foto'));
    expect(janela()).toBeNull();
    expect(leiturasDaLista('checklists')).toBe(2);
    expect(celulaFotos(0).textContent).toBe('-');
  });

  test('RN-F7.07 403 (perfil mudou no meio): toast, a janela fecha e a lista recarrega', async () => {
    api.delete.mockImplementation(() => rejeitar(403, 'Sem permissão para esta operação'));
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Remover foto', celulaFotos(0)));
    await clicar(botoes(janela()).filter((b) => b.textContent.trim() === 'Remover foto')[0]);
    expect(toast.error).toHaveBeenCalledWith('Sem permissão para esta operação');
    expect(janela()).toBeNull();
    expect(leiturasDaLista('checklists')).toBe(2);
  });

  test('RN-F7.07 outro erro (sem resposta): mensagem padrão, a janela fica como estava e nada recarrega', async () => {
    api.delete.mockImplementation(() => Promise.reject(new Error('Network Error')));
    await render(<FrotasEntityPage entityKey="checklists" />);
    await clicar(botao('Remover foto', celulaFotos(0)));
    await clicar(botoes(janela()).filter((b) => b.textContent.trim() === 'Remover foto')[2]);
    expect(toast.error).toHaveBeenCalledWith(MSG_FALHA_REMOVER);
    expect(fotosDaJanela()).toEqual(['50', '51', '52']);
    expect(janela()).not.toBeNull();
    expect(leiturasDaLista('checklists')).toBe(1);
  });
});
