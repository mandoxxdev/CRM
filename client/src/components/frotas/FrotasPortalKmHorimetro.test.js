/**
 * Frota Etapa 3 (T3) — km e horimetro no portal do motorista (RN-F3.10 e o "Meus registros" da RN-F3.11), contra o contrato
 * congelado em docs/superpowers/plans/2026-10-23-frotas-etapa3-km-e-horimetro.md. So a fronteira HTTP (`api`) e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasPortalKmHorimetro --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FrotasPortalMotorista from './FrotasPortalMotorista';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn() } }));
// referencias estaveis: um refreshUser novo a cada render recriaria o `carregar` do portal e recarregaria sem parar
const mockUsuario = { id: 7, nome: 'Jose', role: 'usuario', perfil_frota: null };
const mockRefreshUser = jest.fn(() => Promise.resolve(null));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUsuario, refreshUser: mockRefreshUser }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const ITENS = ['a', 'b', 'c'].map((chave) => ({ chave, rotulo: `Item ${chave}` }));

const CARRO = {
  id: 1, placa: 'CAR1A00', modelo: 'Strada', marca: 'Fiat', km_atual: 1800, horimetro_atual: null, tipo_medicao: 'km',
  status: 'ativo', em_uso: false,
};
const MAQUINA = {
  id: 2, placa: 'EMP0001', modelo: 'Empilhadeira', marca: 'Hyster', km_atual: 0, horimetro_atual: 1234.5, tipo_medicao: 'horimetro',
  status: 'ativo', em_uso: false,
};

const MSG_KM = 'KM menor que o atual do veículo (1.800 km). Confira o hodômetro antes de salvar.';
const MSG_H = 'Horímetro menor que o atual do veículo (1.234,5 h). Confira o painel antes de salvar.';

function inicio(over = {}) {
  return {
    motorista: { id: 7, nome: 'Jose da Silva' },
    viagem_aberta: null,
    veiculos: [CARRO, MAQUINA],
    itens: ITENS,
    perfil: 'MOTORISTA',
    pode_registrar: true,
    pode_gerir: false,
    ...over,
  };
}

const VIAGEM_MAQUINA = {
  id: 9, veiculo_id: 2, placa: 'EMP0001', km_saida: null, horimetro_saida: 1230, tipo_medicao: 'horimetro',
  data_saida: '2026-10-23T07:00', destino: 'Galpao 2',
};

let container;
let root;
let respostaInicio;
let respostaMeus;

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  respostaInicio = inicio();
  respostaMeus = { registros: [], abastecimentos: [] };
  api.get.mockImplementation((url) => {
    if (url === '/frotas/portal/inicio') return Promise.resolve({ data: respostaInicio });
    if (url === '/frotas/portal/meus-registros') return Promise.resolve({ data: respostaMeus });
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
  if (!el) throw new Error(`campo ${nome} nao encontrado`);
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function responderItens() {
  for (const it of ITENS) {
    // eslint-disable-next-line no-await-in-loop
    await clicar(container.querySelector(`[aria-label="${it.rotulo}: OK"]`));
  }
}
async function enviar() {
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
/** O rotulo (span) do label que embrulha o campo de leitura (km ou horimetro). */
function campoLeitura() {
  return container.querySelector('[name="km"]') || container.querySelector('[name="horimetro"]');
}
const rotuloLeitura = () => campoLeitura().closest('label').querySelector('span').textContent;
const ultimo = () => container.querySelector('[data-testid="ultimo-registrado"]');
const avisoMenor = () => container.querySelector('[data-testid="aviso-menor"]');
const conflito = (error, code) => ({ response: { status: 409, data: { error, code } } });

describe('Portal: rotulo e "ultimo registrado" pela medicao do veiculo (RN-F3.10)', () => {
  test('sem veiculo: rotulo de km e nenhum "ultimo registrado"', async () => {
    await renderizar();
    await clicar(botao('Inspeção'));
    expect(rotuloLeitura()).toBe('KM atual (o que está no painel)');
    expect(ultimo()).toBeNull();
  });

  test('carro por km: rotulo de km e "1.800 km"', async () => {
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '1');
    expect(rotuloLeitura()).toBe('KM atual (o que está no painel)');
    expect(container.querySelector('[name="km"]')).not.toBeNull();
    expect(ultimo().textContent).toBe('Último registrado neste veículo: 1.800 km');
  });

  test('maquina por horimetro: rotulo de horas, teclado decimal e "1.234,5 h"', async () => {
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '2');
    expect(rotuloLeitura()).toBe('Horímetro atual (horas no painel)');
    const campo = container.querySelector('[name="horimetro"]');
    expect(campo).not.toBeNull();
    expect(campo.getAttribute('inputmode')).toBe('decimal');
    expect(campo.getAttribute('step')).toBe('any');
    expect(ultimo().textContent).toBe('Último registrado neste veículo: 1.234,5 h');
  });

  test('abastecimento tambem segue a medicao do veiculo', async () => {
    await renderizar();
    await clicar(botao('Abastecimento'));
    expect(rotuloLeitura()).toBe('KM atual (o que está no painel)');
    digitar('veiculo_id', '2');
    expect(rotuloLeitura()).toBe('Horímetro atual (horas no painel)');
    expect(ultimo().textContent).toBe('Último registrado neste veículo: 1.234,5 h');
    digitar('veiculo_id', '1');
    expect(ultimo().textContent).toBe('Último registrado neste veículo: 1.800 km');
  });
});

describe('Portal: aviso de leitura menor (nao bloqueia)', () => {
  test('km menor que o ultimo: aviso, e o Salvar continua habilitado', async () => {
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '1');
    await responderItens();
    digitar('km', '900');
    expect(avisoMenor().textContent).toBe('Menor que o último registrado. Confira o painel antes de salvar.');
    expect(botoes().find((b) => b.type === 'submit').disabled).toBe(false);
  });

  test('metade positiva: igual ou maior nao avisa (km e horimetro)', async () => {
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '1');
    digitar('km', '1800');
    expect(avisoMenor()).toBeNull();
    digitar('km', '1801');
    expect(avisoMenor()).toBeNull();
    digitar('veiculo_id', '2');
    digitar('horimetro', '1234.5');
    expect(avisoMenor()).toBeNull();
    digitar('horimetro', '1234.4');
    expect(avisoMenor()).not.toBeNull();
  });

  test('abastecimento: horimetro menor avisa', async () => {
    await renderizar();
    await clicar(botao('Abastecimento'));
    digitar('veiculo_id', '2');
    digitar('horimetro', '100');
    expect(avisoMenor()).not.toBeNull();
  });
});

describe('Portal: corpo do POST pela medicao', () => {
  test('inspecao de maquina manda horimetro e nao manda km', async () => {
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '2');
    digitar('horimetro', '1240.5');
    await responderItens();
    await enviar();
    const [url, corpo] = api.post.mock.calls[0];
    expect(url).toBe('/frotas/portal/registros');
    expect(corpo.horimetro).toBe(1240.5);
    expect('km' in corpo).toBe(false);
    expect(corpo.veiculo_id).toBe(2);
    expect('confirmar_km_menor' in corpo).toBe(false);
  });

  test('inspecao de carro manda km e nao manda horimetro', async () => {
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '1');
    digitar('km', '1900');
    await responderItens();
    await enviar();
    const corpo = api.post.mock.calls[0][1];
    expect(corpo.km).toBe(1900);
    expect('horimetro' in corpo).toBe(false);
  });

  test('abastecimento de maquina manda horimetro e nao manda km', async () => {
    await renderizar();
    await clicar(botao('Abastecimento'));
    digitar('veiculo_id', '2');
    digitar('horimetro', '1250');
    digitar('litros', '20');
    digitar('data', '2026-10-23');
    await enviar();
    expect(api.post).toHaveBeenCalledWith('/frotas/portal/abastecimentos', {
      veiculo_id: 2, horimetro: 1250, litros: 20, data: '2026-10-23',
    });
  });
});

describe('Portal: 409 de leitura menor e "Confirmar mesmo assim"', () => {
  test('inspecao do carro: 409 -> botao -> segundo POST com o mesmo corpo + confirmar_km_menor true', async () => {
    api.post.mockRejectedValueOnce(conflito(MSG_KM, 'KM_MENOR_QUE_ATUAL'));
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '1');
    digitar('km', '900');
    await responderItens();
    await enviar();
    expect(container.querySelector('[role="alert"]').textContent).toBe(MSG_KM);
    expect(toast.success).not.toHaveBeenCalled();
    await clicar(botao('Confirmar mesmo assim'));
    expect(api.post).toHaveBeenCalledTimes(2);
    const [primeiro, segundo] = api.post.mock.calls;
    expect(segundo[0]).toBe('/frotas/portal/registros');
    expect(segundo[1]).toEqual({ ...primeiro[1], confirmar_km_menor: true });
    expect('confirmar_km_menor' in primeiro[1]).toBe(false);
    expect(toast.success).toHaveBeenCalled();
  });

  test('abastecimento da maquina: 409 HORIMETRO -> confirmar reenvia com horimetro e confirmar_km_menor', async () => {
    api.post.mockRejectedValueOnce(conflito(MSG_H, 'HORIMETRO_MENOR_QUE_ATUAL'));
    await renderizar();
    await clicar(botao('Abastecimento'));
    digitar('veiculo_id', '2');
    digitar('horimetro', '100');
    digitar('litros', '20');
    digitar('data', '2026-10-23');
    await enviar();
    expect(container.querySelector('[role="alert"]').textContent).toBe(MSG_H);
    await clicar(botao('Confirmar mesmo assim'));
    expect(api.post.mock.calls[1]).toEqual(['/frotas/portal/abastecimentos', {
      veiculo_id: 2, horimetro: 100, litros: 20, data: '2026-10-23', confirmar_km_menor: true,
    }]);
  });

  test('mudar o numero desarma a confirmacao (registro e abastecimento)', async () => {
    api.post.mockRejectedValueOnce(conflito(MSG_KM, 'KM_MENOR_QUE_ATUAL'));
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '1');
    digitar('km', '900');
    await responderItens();
    await enviar();
    expect(botao('Confirmar mesmo assim')).toBeDefined();
    digitar('km', '1900');
    expect(botao('Confirmar mesmo assim')).toBeUndefined();
  });

  test('mudar o veiculo desarma a confirmacao (abastecimento)', async () => {
    api.post.mockRejectedValueOnce(conflito(MSG_KM, 'KM_MENOR_QUE_ATUAL'));
    await renderizar();
    await clicar(botao('Abastecimento'));
    digitar('veiculo_id', '1');
    digitar('km', '900');
    await enviar();
    expect(botao('Confirmar mesmo assim')).toBeDefined();
    digitar('veiculo_id', '2');
    expect(botao('Confirmar mesmo assim')).toBeUndefined();
  });

  test('mudar o numero desarma tambem no abastecimento', async () => {
    api.post.mockRejectedValueOnce(conflito(MSG_KM, 'KM_MENOR_QUE_ATUAL'));
    await renderizar();
    await clicar(botao('Abastecimento'));
    digitar('veiculo_id', '1');
    digitar('km', '900');
    await enviar();
    expect(botao('Confirmar mesmo assim')).toBeDefined();
    digitar('km', '901');
    expect(botao('Confirmar mesmo assim')).toBeUndefined();
  });

  test('erro sem code (ou outro code) mostra a mensagem e nao mostra o botao', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Veículo em manutenção' } } });
    await renderizar();
    await clicar(botao('Inspeção'));
    digitar('veiculo_id', '1');
    digitar('km', '900');
    await responderItens();
    await enviar();
    expect(container.querySelector('[role="alert"]').textContent).toBe('Veículo em manutenção');
    expect(botao('Confirmar mesmo assim')).toBeUndefined();

    api.post.mockRejectedValueOnce({ response: { status: 409, data: { error: 'Outra coisa', code: 'VIAGEM_ABERTA' } } });
    await enviar();
    expect(container.querySelector('[role="alert"]').textContent).toBe('Outra coisa');
    expect(botao('Confirmar mesmo assim')).toBeUndefined();
  });
});

describe('Portal: retorno de viagem por horimetro', () => {
  test('cartao "saiu com 1.230 h", rotulo de horas, ultimo do veiculo e corpo com horimetro', async () => {
    respostaInicio = inicio({ viagem_aberta: VIAGEM_MAQUINA, veiculos: [CARRO, { ...MAQUINA, em_uso: true }] });
    await renderizar();
    await clicar(botao('Retorno'));
    expect(container.querySelector('[data-testid="veiculo-da-viagem"]').textContent).toContain('saiu com 1.230 h');
    expect(container.querySelector('[data-testid="veiculo-da-viagem"]').textContent).not.toContain('km');
    expect(rotuloLeitura()).toBe('Horímetro atual (horas no painel)');
    expect(ultimo().textContent).toBe('Último registrado neste veículo: 1.234,5 h');
    digitar('horimetro', '1238');
    await responderItens();
    await enviar();
    const corpo = api.post.mock.calls[0][1];
    expect(corpo.tipo).toBe('retorno');
    expect(corpo.horimetro).toBe(1238);
    expect('km' in corpo).toBe(false);
    expect('veiculo_id' in corpo).toBe(false);
  });

  test('a regua e a da viagem, nao a do veiculo de hoje', async () => {
    // a viagem abriu por horimetro; o veiculo hoje diz km (o gestor trocou): o retorno continua em horas
    respostaInicio = inicio({ viagem_aberta: VIAGEM_MAQUINA, veiculos: [CARRO, { ...MAQUINA, tipo_medicao: 'km', em_uso: true }] });
    await renderizar();
    await clicar(botao('Retorno'));
    expect(rotuloLeitura()).toBe('Horímetro atual (horas no painel)');
    expect(ultimo().textContent).toBe('Último registrado neste veículo: 1.234,5 h');
  });

  test('viagem de carro: "saiu com 1.700 km" e o ultimo em km', async () => {
    respostaInicio = inicio({
      viagem_aberta: { id: 4, veiculo_id: 1, placa: 'CAR1A00', km_saida: 1700, horimetro_saida: null, tipo_medicao: 'km', data_saida: '2026-10-23', destino: '' },
    });
    await renderizar();
    await clicar(botao('Retorno'));
    expect(container.querySelector('[data-testid="veiculo-da-viagem"]').textContent).toContain('saiu com 1.700 km');
    expect(rotuloLeitura()).toBe('KM atual (o que está no painel)');
    expect(ultimo().textContent).toBe('Último registrado neste veículo: 1.800 km');
  });

  test('veiculo da viagem fora da lista: sem "ultimo registrado", rotulo pela viagem', async () => {
    respostaInicio = inicio({ viagem_aberta: VIAGEM_MAQUINA, veiculos: [CARRO] });
    await renderizar();
    await clicar(botao('Retorno'));
    expect(rotuloLeitura()).toBe('Horímetro atual (horas no painel)');
    expect(ultimo()).toBeNull();
  });
});

describe('Portal: "Meus registros" em horas', () => {
  test('registro com horimetro mostra "h" (no lugar do km) e abastecimento com horimetro_abastecimento tambem', async () => {
    respostaMeus = {
      registros: [
        { id: 1, tipo_registro: 'inspecao', placa: 'EMP0001', data_checklist: '2026-10-22', km: null, horimetro: 1240.5, status_geral: 'OK' },
        { id: 2, tipo_registro: 'saida', placa: 'CAR1A00', data_checklist: '2026-10-22', km: 1800, horimetro: null, status_geral: 'OK' },
      ],
      abastecimentos: [
        { id: 3, placa: 'EMP0001', data_abastecimento: '2026-10-21', litros: 20, km_abastecimento: null, horimetro_abastecimento: 1250 },
        { id: 4, placa: 'CAR1A00', data_abastecimento: '2026-10-21', litros: 40, km_abastecimento: 1790, horimetro_abastecimento: null },
      ],
    };
    await renderizar();
    const itens = [...container.querySelectorAll('[aria-label="Meus registros"] .portal-lista-sub')].map((el) => el.textContent);
    expect(itens[0]).toContain(' · 1.240,5 h');
    expect(itens[0]).not.toContain('km');
    expect(itens[1]).toContain(' · 1.800 km');
    expect(itens[2]).toContain(' · 1.250 h');
    expect(itens[2]).not.toContain('km');
    expect(itens[3]).toContain(' · 1.790 km');
  });
});
