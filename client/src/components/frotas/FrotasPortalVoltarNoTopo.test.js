/**
 * Frota Etapa 10 (RN-F10.01) — "Voltar" tambem no topo dos formularios do portal (saida, retorno, inspecao, abastecimento):
 * o motorista reclamou de rolar a tela inteira para voltar. O de baixo continua.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasPortalVoltarNoTopo --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FrotasPortalMotorista from './FrotasPortalMotorista';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
// Frota Etapa 2 (Fase5-2): o portal le o usuario do contexto para conferir o perfil com o do servidor.
let mockUsuario = { id: 7, nome: 'Jose', role: 'usuario', perfil_frota: null };
const mockRefreshUser = jest.fn(() => Promise.resolve(null));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUsuario, refreshUser: mockRefreshUser }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const ITENS = [
  ['pneus_estepe', 'Pneus e estepe'], ['farois_lanternas', 'Faróis / lanternas'], ['setas_luz_freio', 'Setas / luz de freio'],
  ['parabrisa_vidros', 'Parabrisa / vidros'], ['espelhos_retrovisores', 'Espelhos / retrovisores'],
  ['limpadores_agua', 'Limpadores / água'], ['oleo_motor', 'Óleo do motor / vazamentos'], ['arrefecimento', 'Arrefecimento / nível'],
  ['freios', 'Freios / freio de estacionamento'], ['buzina_cintos', 'Buzina / cintos'],
  ['documentos_equipamentos', 'Documentos / equipamentos'], ['carroceria_carga', 'Carroceria / amarração da carga'],
].map(([chave, rotulo]) => ({ chave, rotulo }));

const VEICULOS = [
  { id: 1, placa: 'ABC1D23', modelo: 'Sprinter', marca: 'Mercedes', km_atual: 1000, tipo_medicao: 'km', status: 'ativo', em_uso: false, uso_funcionarios: 0 },
  { id: 2, placa: 'EMU0S01', modelo: 'Strada', marca: 'Fiat', km_atual: 500, tipo_medicao: 'km', status: 'ativo', em_uso: true, uso_funcionarios: 0 },
  { id: 3, placa: 'MAN7T00', modelo: 'Hilux', marca: 'Toyota', km_atual: 300, tipo_medicao: 'km', status: 'manutencao', em_uso: false, uso_funcionarios: 0 },
];
// Frota Etapa 8 (RN-F8.32/33): o destino da saida vem de uma lista cadastrada, nao mais digitado.
const DESTINOS = [{ id: 1, nome: 'Cliente X', endereco: null }, { id: 2, nome: 'Obra Sul', endereco: 'Rua B, 10' }];

function inicio(over = {}) {
  return {
    motorista: { id: 7, nome: 'Jose da Silva', cnh_validade: '2030-01-01' },
    viagem_aberta: null,
    veiculos: VEICULOS,
    itens: ITENS,
    destinos: DESTINOS,
    vistas: ['lateral_esquerda', 'lateral_direita', 'superior', 'frente', 'traseira'],
    tipos_avaria: ['R', 'A', 'T', 'Q', 'O'],
    niveis_combustivel: ['vazio', '1/4', '1/2', '3/4', 'cheio'],
    perfil: 'MOTORISTA',
    pode_registrar: true,
    pode_gerir: false,
    ...over,
  };
}

let container;
let root;
let respostaInicio;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  respostaInicio = inicio();
  api.get.mockImplementation((url) => {
    if (url === '/frotas/portal/inicio') return Promise.resolve({ data: respostaInicio });
    if (url === '/frotas/portal/meus-registros') {
      return Promise.resolve({
        data: {
          registros: [{ id: 5, tipo_registro: 'saida', placa: 'ABC1D23', data_checklist: '2026-10-22', horario: '08:10', km: 1000, status_geral: 'PENDENCIA' }],
          abastecimentos: [{ id: 9, placa: 'ABC1D23', data_abastecimento: '2026-10-21', litros: 40, valor_total: 250, km_abastecimento: 990 }],
        },
      });
    }
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: {} });
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
  await act(async () => { root.render(<FrotasPortalMotorista />); });
}

const botoes = () => [...container.querySelectorAll('button')];
const botao = (texto) => botoes().find((b) => b.textContent.trim() === texto);
async function clicar(el) {
  if (!el) throw new Error('elemento nao encontrado');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
}
function digitar(nome, valor) {
  const el = container.querySelector(`[name="${nome}"]`);
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}

const voltarDoTopo = () => container.querySelector('[data-testid="voltar-topo"]');

describe('RN-F10.01 — Voltar no topo do formulario do portal', () => {
  test.each([
    ['Saída', {}],
    ['Retorno', { viagem_aberta: { id: 3, veiculo_id: 1, placa: 'ABC1D23', km_saida: 1000, data_saida: '2026-10-23T07:45', destino: 'Cliente X' } }],
    ['Inspeção', {}],
    ['Abastecimento', {}],
  ])('%s: o Voltar do topo vem antes do primeiro campo e volta ao painel', async (tela, over) => {
    respostaInicio = inicio(over);
    await renderizar();
    await clicar(botao(tela));
    const form = container.querySelector('form');
    expect(form).not.toBeNull();
    const topo = voltarDoTopo();
    expect(topo).not.toBeNull();
    expect(topo.textContent).toContain('Voltar');
    // antes do primeiro campo do formulario (e o de baixo continua no rodape)
    const primeiroCampo = form.querySelector('select, input, textarea');
    // eslint-disable-next-line no-bitwise
    expect(topo.compareDocumentPosition(primeiroCampo) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(botao('Voltar')).toBeDefined();
    await clicar(topo);
    expect(container.querySelector('form')).toBeNull();
    expect(botao('Saída') || botao('Retorno')).toBeDefined();
  });

  test('desliga junto com o de baixo enquanto salva', async () => {
    let soltar;
    api.post.mockImplementation(() => new Promise((r) => { soltar = r; }));
    await renderizar();
    await clicar(botao('Abastecimento'));
    expect(voltarDoTopo().disabled).toBe(false);
    digitar('veiculo_id', '1');
    digitar('litros', '40');
    digitar('valor_total', '250');
    digitar('km', '1010');
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(botao('Voltar').disabled).toBe(true);
    expect(voltarDoTopo().disabled).toBe(true);
    await act(async () => { soltar({ data: {} }); });
  });

  // Fase 5 (G12): o mesmo para o formulario de Saida (RegistroForm — o cabecalho e outro componente que o do Abastecimento).
  test('Saída: o Voltar do topo desliga junto com o de baixo enquanto salva', async () => {
    let soltar;
    api.post.mockImplementation(() => new Promise((r) => { soltar = r; }));
    await renderizar();
    await clicar(botao('Saída'));
    expect(voltarDoTopo().disabled).toBe(false);
    digitar('veiculo_id', '1');
    digitar('km', '1200');
    for (const it of ITENS) {
      // eslint-disable-next-line no-await-in-loop
      await clicar(container.querySelector(`[aria-label="${it.rotulo}: OK"]`));
    }
    await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
    expect(api.post).toHaveBeenCalledWith('/frotas/portal/registros', expect.anything());
    expect(botao('Voltar').disabled).toBe(true);
    expect(voltarDoTopo().disabled).toBe(true);
    await act(async () => { soltar({ data: { registro: { id: 1 }, viagem: { id: 1 } } }); });
  });
});
