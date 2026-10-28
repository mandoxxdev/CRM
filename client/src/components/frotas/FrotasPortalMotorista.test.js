/**
 * Frota Etapa 1 (T6) — portal do motorista contra os contratos congelados do plano
 * (docs/superpowers/plans/2026-10-23-frotas-etapa1-portal-do-motorista.md). So a fronteira HTTP (`api`) e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasPortalMotorista --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FrotasPortalMotorista, { MSG_SEM_VINCULO } from './FrotasPortalMotorista';
import api from '../../services/api';
import { toast } from 'react-toastify';

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
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function responderItens(n, valor = 'OK') {
  const rotulo = { OK: 'OK', NA: 'N/A', FALHA: 'Falha' }[valor];
  for (const it of ITENS.slice(0, n)) {
    // eslint-disable-next-line no-await-in-loop
    await clicar(container.querySelector(`[aria-label="${it.rotulo}: ${rotulo}"]`));
  }
}
const salvar = () => botoes().find((b) => b.type === 'submit');
async function enviar() {
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}

describe('Portal do motorista', () => {
  test('sem vinculo: mostra a mensagem do 409 e nenhum botao de registro', async () => {
    respostaInicio = inicio({ motorista: null });
    await renderizar();
    expect(container.textContent).toContain(MSG_SEM_VINCULO);
    expect(MSG_SEM_VINCULO).toBe('Seu usuário não está ligado a um motorista. Peça ao gestor da frota para fazer o vínculo.');
    expect(botao('Saída')).toBeUndefined();
    expect(botao('Abastecimento')).toBeUndefined();
  });

  test('pode_registrar false: so "Meus registros", sem botoes', async () => {
    respostaInicio = inicio({ pode_registrar: false });
    await renderizar();
    expect(container.textContent).toContain('Meus registros');
    expect(container.textContent).toContain('PENDÊNCIA');
    ['Saída', 'Retorno', 'Inspeção', 'Abastecimento'].forEach((t) => expect(botao(t)).toBeUndefined());
  });

  test('sem viagem aberta: Saida aparece e Retorno nao', async () => {
    await renderizar();
    expect(botao('Saída')).toBeDefined();
    expect(botao('Retorno')).toBeUndefined();
    expect(container.textContent).toContain('Olá, Jose da Silva');
  });

  test('Salvar so habilita com os 12 itens respondidos', async () => {
    await renderizar();
    await clicar(botao('Inspeção'));
    expect(salvar().disabled).toBe(true);
    await responderItens(11);
    expect(salvar().disabled).toBe(true);
    expect(container.querySelector('[data-testid="faltam"]').textContent).toContain('Faltam 1 de 12');
    await clicar(container.querySelector(`[aria-label="${ITENS[11].rotulo}: Falha"]`));
    expect(salvar().disabled).toBe(false);
  });

  test('saida: esconde o veiculo em uso e trava o em manutencao', async () => {
    await renderizar();
    await clicar(botao('Saída'));
    const opcoes = [...container.querySelector('[name="veiculo_id"]').options];
    expect(opcoes.map((o) => o.value)).toEqual(['', '1', '3']);
    expect(opcoes.find((o) => o.value === '3').disabled).toBe(true);
    expect(opcoes.find((o) => o.value === '3').textContent).toContain('indisponível');
  });

  // Frota Etapa 8 (T-6 da Fase 2): este cenario digitava `origem`/`destino` em <input> e travava `origem: 'Fabrica', destino:
  // 'Cliente X'` no corpo. Desde a Etapa 8 a origem e fixa (GMP, gravada pelo servidor) e o destino e escolhido numa lista
  // (`destino_id`): o corpo nao leva `origem` nem `destino` texto (RN-F8.23, RN-F8.35).
  test('corpo do POST de saida bate com o contrato', async () => {
    await renderizar();
    await clicar(botao('Saída'));
    digitar('veiculo_id', '1');
    digitar('km', '1234');
    digitar('data', '2026-10-23');
    digitar('horario', '07:45');
    await clicar(botao('½'));
    expect(container.querySelector('[name="origem"]')).toBeNull();
    expect(container.querySelector('[name="destino"]')).toBeNull();
    expect(container.querySelector('[data-testid="origem-fixa"]').textContent).toBe('Saindo de: GMP');
    digitar('destino_id', '1');
    digitar('finalidade', 'Entrega');
    await responderItens(12);
    await clicar(container.querySelector(`[aria-label="${ITENS[0].rotulo}: Falha"]`));
    await clicar(botao('+ Adicionar avaria'));
    digitar('vista', 'traseira');
    await clicar(botao('Amassado'));
    digitar('descricao_avaria', 'para-choque');
    await clicar(botao('Incluir avaria'));
    expect(container.textContent).toContain('Traseira: Amassado — para-choque');
    digitar('observacoes', 'tudo certo');
    await enviar();

    expect(api.post).toHaveBeenCalledTimes(1);
    const [url, corpo] = api.post.mock.calls[0];
    expect(url).toBe('/frotas/portal/registros');
    const itensEsperados = Object.fromEntries(ITENS.map((it) => [it.chave, 'OK']));
    itensEsperados.pneus_estepe = 'FALHA';
    expect(corpo).toEqual({
      tipo: 'saida',
      veiculo_id: 1,
      km: 1234,
      data: '2026-10-23',
      horario: '07:45',
      nivel_combustivel: '1/2',
      itens: itensEsperados,
      avarias: [{ vista: 'traseira', tipo: 'A', descricao: 'para-choque' }],
      observacoes: 'tudo certo',
      destino_id: 1,
      finalidade: 'Entrega',
    });
    expect(toast.success).toHaveBeenCalled();
    // voltou ao inicio e recarregou
    expect(api.get.mock.calls.filter(([u]) => u === '/frotas/portal/inicio').length).toBe(2);
    expect(botao('Saída')).toBeDefined();
  });

  test('retorno: nao escolhe veiculo (vai o da viagem) e o corpo nao leva veiculo_id', async () => {
    respostaInicio = inicio({
      viagem_aberta: { id: 3, veiculo_id: 1, placa: 'ABC1D23', km_saida: 1000, data_saida: '2026-10-23T07:45', destino: 'Cliente X' },
    });
    await renderizar();
    expect(container.querySelector('[data-testid="viagem-aberta"]').textContent)
      .toContain('Você está com o veículo ABC1D23 desde 23/10/2026 às 07:45, destino Cliente X');
    expect(botao('Saída')).toBeUndefined();
    await clicar(botao('Retorno'));
    expect(container.querySelector('[name="veiculo_id"]')).toBeNull();
    expect(container.querySelector('[data-testid="veiculo-da-viagem"]').textContent).toContain('ABC1D23');
    // Etapa 8: o bloco da saida (origem fixa, destino, finalidade) nao aparece no retorno
    expect(container.querySelector('[data-testid="origem-fixa"]')).toBeNull();
    expect(container.querySelector('[name="destino_id"]')).toBeNull();
    expect(container.querySelector('[name="finalidade"]')).toBeNull();
    digitar('km', '1100');
    await responderItens(12, 'NA');
    await enviar();
    const corpo = api.post.mock.calls[0][1];
    expect(corpo.tipo).toBe('retorno');
    expect('veiculo_id' in corpo).toBe(false);
    expect(corpo.km).toBe(1100);
    expect(corpo.avarias).toEqual([]);
    expect(Object.values(corpo.itens)).toEqual(Array(12).fill('NA'));
  });

  test('erro do servidor aparece em destaque e o formulario fica aberto', async () => {
    const msg = 'KM do retorno (900) menor que o KM da saída (1000). Confira o hodômetro.';
    respostaInicio = inicio({ viagem_aberta: { id: 3, veiculo_id: 1, placa: 'ABC1D23', km_saida: 1000, data_saida: '2026-10-23T07:45', destino: '' } });
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: msg } } });
    await renderizar();
    await clicar(botao('Retorno'));
    digitar('km', '900');
    await responderItens(12);
    await enviar();
    const alerta = container.querySelector('[role="alert"]');
    expect(alerta).not.toBeNull();
    expect(alerta.textContent).toBe(msg);
    expect(container.querySelector('form')).not.toBeNull();
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('abastecimento: POST no contrato do portal', async () => {
    await renderizar();
    await clicar(botao('Abastecimento'));
    digitar('veiculo_id', '1');
    digitar('km', '1300');
    digitar('litros', '40.5');
    digitar('valor_total', '250.10');
    digitar('data', '2026-10-23');
    digitar('posto', 'Posto Central');
    await enviar();
    expect(api.post).toHaveBeenCalledWith('/frotas/portal/abastecimentos', {
      veiculo_id: 1, km: 1300, litros: 40.5, valor_total: 250.1, data: '2026-10-23', posto: 'Posto Central',
    });
  });

  test('meus registros: tipo, placa, situacao com cor e os abastecimentos', async () => {
    await renderizar();
    const secao = container.querySelector('[aria-label="Meus registros"]');
    expect(secao.textContent).toContain('Saída · ABC1D23');
    expect(secao.textContent).toContain('22/10/2026 às 08:10');
    expect(secao.querySelector('.situacao-pendencia').textContent).toBe('PENDÊNCIA');
    expect(secao.textContent).toContain('40 L');
  });
});

// Fase5-2 (revisor front x back): o gestor mudou o perfil, o servidor ja aplica, mas o menu do navegador da pessoa ficava o velho ate
// o F5 (nada renova o usuario dentro do Frota). O portal ja recebe o perfil do servidor em /portal/inicio: se diverge, renova.
describe('Portal: perfil do servidor diferente do da tela (Fase5-2)', () => {
  test('servidor diz CONSULTA e a tela acha MOTORISTA: renova o usuario uma vez', async () => {
    respostaInicio = inicio({ perfil: 'CONSULTA', pode_registrar: false });
    await renderizar();
    await act(async () => {});
    expect(mockRefreshUser).toHaveBeenCalledTimes(1);
  });

  test('servidor e tela concordam: nao renova (e o painel aparece)', async () => {
    respostaInicio = inicio({ perfil: 'MOTORISTA' });
    await renderizar();
    await act(async () => {});
    expect(container.textContent).toContain('Jose da Silva');
    expect(mockRefreshUser).not.toHaveBeenCalled();
  });

  test('a tela ja acha CONSULTA e o servidor voltou a MOTORISTA: renova', async () => {
    mockUsuario = { ...mockUsuario, perfil_frota: 'CONSULTA' };
    respostaInicio = inicio({ perfil: 'MOTORISTA' });
    try {
      await renderizar();
      await act(async () => {});
      expect(mockRefreshUser).toHaveBeenCalledTimes(1);
    } finally {
      mockUsuario = { ...mockUsuario, perfil_frota: null };
    }
  });
});
