/**
 * Frota Etapa 8 (G4) — saida do portal: origem fixa GMP, destino em lista com "+ Novo destino" e condutor so em carro liberado
 * (RN-F8.23, 24, 33, 34, 34b, 35), contra o contrato congelado em
 * docs/superpowers/plans/2026-10-28-frotas-etapa8-admin-destinos-condutor.md. So a fronteira HTTP (`api`) e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasPortalSaidaDestinoCondutor --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import FrotasPortalMotorista, { RegistroForm } from './FrotasPortalMotorista';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
// referencias estaveis: um refreshUser novo a cada render recriaria o `carregar` do portal e recarregaria sem parar
const mockUsuario = { id: 7, nome: 'Jose', role: 'usuario', perfil_frota: null };
const mockRefreshUser = jest.fn(() => Promise.resolve(null));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUsuario, refreshUser: mockRefreshUser }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const ITENS = ['a', 'b', 'c'].map((chave) => ({ chave, rotulo: `Item ${chave}` }));

const COMUM = {
  id: 1, placa: 'ABC1D23', modelo: 'Sprinter', marca: 'Mercedes', km_atual: 1000, tipo_medicao: 'km', status: 'ativo', em_uso: false,
  uso_funcionarios: 0,
};
const LIBERADO = {
  id: 4, placa: 'FUN0C10', modelo: 'Gol', marca: 'VW', km_atual: 200, tipo_medicao: 'km', status: 'ativo', em_uso: false,
  uso_funcionarios: 1,
};
const DESTINOS = [
  { id: 1, nome: 'Cliente X', endereco: null },
  { id: 2, nome: 'Obra Sul', endereco: 'Rua B, 10' },
];

const MSG_DESATIVADO = 'O destino escolhido foi desativado. Escolha outro.';
const MSG_FALHA = 'Não foi possível adicionar o destino. Confira a internet e tente de novo.';

function inicio(over = {}) {
  return {
    motorista: { id: 7, nome: 'Jose da Silva' },
    viagem_aberta: null,
    veiculos: [COMUM, LIBERADO],
    itens: ITENS,
    destinos: DESTINOS,
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
    if (url === '/frotas/portal/meus-registros') return Promise.resolve({ data: { registros: [], abastecimentos: [] } });
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
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype
    : el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
const campo = (nome) => container.querySelector(`[name="${nome}"]`);
const selectDestino = () => campo('destino_id');
const opcoesDestino = () => [...selectDestino().options].map((o) => o.value);
const bloco = () => container.querySelector('[data-testid="novo-destino"]');
async function responderTudo() {
  for (const it of ITENS) {
    // eslint-disable-next-line no-await-in-loop
    await clicar(container.querySelector(`[aria-label="${it.rotulo}: OK"]`));
  }
}
async function enviar() {
  await act(async () => { container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })); });
}
async function abrirSaida() {
  await renderizar();
  await clicar(botao('Saída'));
}
const postsDeRegistro = () => api.post.mock.calls.filter(([u]) => u === '/frotas/portal/registros');
const postsDeDestino = () => api.post.mock.calls.filter(([u]) => u === '/frotas/destinos');

describe('RN-F8.23 — origem fixa GMP e condutor so em carro liberado', () => {
  test('"Saindo de onde" sai; a linha fixa "Saindo de: GMP" aparece e nao ha campo origem', async () => {
    await abrirSaida();
    const fixa = container.querySelector('[data-testid="origem-fixa"]');
    expect(fixa).not.toBeNull();
    expect(fixa.textContent).toBe('Saindo de: GMP');
    expect(fixa.querySelector('strong').textContent).toBe('GMP');
    expect(campo('origem')).toBeNull();
    expect(container.textContent).not.toContain('Saindo de onde');
    expect(container.textContent).toContain('Indo para onde (destino)');
    expect(container.textContent).toContain('Para quê (finalidade)');
  });

  test('condutor: nao aparece sem veiculo nem em carro comum; aparece no liberado; trocar para o comum esconde e limpa', async () => {
    await abrirSaida();
    expect(campo('condutor_nome')).toBeNull();
    digitar('veiculo_id', String(COMUM.id));
    expect(campo('condutor_nome')).toBeNull();
    expect(container.textContent).not.toContain('Quem vai dirigir (condutor)');

    digitar('veiculo_id', String(LIBERADO.id));
    expect(campo('condutor_nome')).not.toBeNull();
    expect(container.textContent).toContain('Quem vai dirigir (condutor)');
    digitar('condutor_nome', 'Maria');
    expect(campo('condutor_nome').value).toBe('Maria');

    digitar('veiculo_id', String(COMUM.id));
    expect(campo('condutor_nome')).toBeNull();
    digitar('veiculo_id', String(LIBERADO.id));
    expect(campo('condutor_nome').value).toBe(''); // limpou ao trocar para o comum

    // carro comum: o corpo nao leva condutor_nome mesmo depois de ter digitado
    digitar('veiculo_id', String(COMUM.id));
    digitar('km', '1200');
    await responderTudo();
    await enviar();
    const corpo = postsDeRegistro()[0][1];
    expect('condutor_nome' in corpo).toBe(false);
    expect('origem' in corpo).toBe(false);
  });

  test('retorno e inspecao nao tem origem fixa, destino nem condutor', async () => {
    respostaInicio = inicio({ viagem_aberta: { id: 3, veiculo_id: 4, placa: 'FUN0C10', km_saida: 200, data_saida: '2026-10-28T07:00' } });
    await renderizar();
    await clicar(botao('Retorno'));
    expect(container.querySelector('[data-testid="origem-fixa"]')).toBeNull();
    expect(selectDestino()).toBeNull();
    expect(campo('condutor_nome')).toBeNull();
    expect(botao('+ Novo destino')).toBeUndefined();
  });
});

describe('RN-F8.24 — cartao do painel com destino e condutor', () => {
  const viagem = (over) => ({ id: 3, veiculo_id: 4, placa: 'FUN0C10', km_saida: 200, data_saida: '2026-10-28T07:00', ...over });
  const cartao = () => container.querySelector('[data-testid="viagem-aberta"]').textContent;

  test('destino e condutor, nessa ordem', async () => {
    respostaInicio = inicio({ viagem_aberta: viagem({ destino: 'Obra Sul', condutor_nome: 'Maria' }) });
    await renderizar();
    expect(cartao()).toBe('Você está com o veículo FUN0C10 desde 28/10/2026 às 07:00, destino Obra Sul, condutor Maria.');
  });

  test('so condutor (sem destino) e so destino (sem condutor)', async () => {
    respostaInicio = inicio({ viagem_aberta: viagem({ destino: null, condutor_nome: 'Maria' }) });
    await renderizar();
    expect(cartao()).toBe('Você está com o veículo FUN0C10 desde 28/10/2026 às 07:00, condutor Maria.');
    act(() => root.unmount());
    root = createRoot(container);
    respostaInicio = inicio({ viagem_aberta: viagem({ destino: 'Obra Sul', condutor_nome: null }) });
    await renderizar();
    expect(cartao()).toBe('Você está com o veículo FUN0C10 desde 28/10/2026 às 07:00, destino Obra Sul.');
    expect(cartao()).not.toContain('condutor');
  });
});

describe('RN-F8.33 — seletor de destino e o bloco "+ Novo destino"', () => {
  test('select name=destino_id com "Escolha o destino…" + os ativos do inicio; nao ha input destino', async () => {
    await abrirSaida();
    expect(campo('destino')).toBeNull();
    expect(selectDestino().tagName).toBe('SELECT');
    expect(opcoesDestino()).toEqual(['', '1', '2']);
    expect([...selectDestino().options].map((o) => o.textContent)).toEqual(['Escolha o destino…', 'Cliente X', 'Obra Sul']);
    expect(botao('+ Novo destino')).toBeDefined();
    expect(bloco()).toBeNull();
  });

  test('+ Novo destino abre o bloco com Nome, Endereco (opcional), Adicionar e Cancelar; Cancelar fecha sem chamar o servidor', async () => {
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    expect(bloco()).not.toBeNull();
    expect(bloco().querySelector('[name="novo_destino_nome"]')).not.toBeNull();
    expect(bloco().querySelector('[name="novo_destino_endereco"]')).not.toBeNull();
    expect(bloco().textContent).toContain('Nome');
    expect(bloco().textContent).toContain('Endereço (opcional)');
    expect(botao('Adicionar')).toBeDefined();
    expect(botao('Cancelar')).toBeDefined();
    digitar('novo_destino_nome', 'Obra Norte');
    await clicar(botao('Cancelar'));
    expect(bloco()).toBeNull();
    expect(api.post).not.toHaveBeenCalled();
    expect(selectDestino().value).toBe('');
  });

  test('Adicionar com nome vazio (ou so espacos) nao chama o servidor e mostra "Informe o nome do destino" no bloco', async () => {
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    await clicar(botao('Adicionar'));
    expect(api.post).not.toHaveBeenCalled();
    expect(bloco().textContent).toContain('Informe o nome do destino');
    digitar('novo_destino_nome', '   ');
    await clicar(botao('Adicionar'));
    expect(api.post).not.toHaveBeenCalled();
    expect(bloco()).not.toBeNull();
  });
});

describe('RN-F8.34 — Adicionar: 201, 409 duplicado e outro erro', () => {
  test('201: POST /frotas/destinos { nome, endereco }, o destino entra na lista selecionado, o bloco fecha, toast "Destino adicionado"', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 7, nome: 'Obra Norte', endereco: 'Rua A', ativo: 1 } });
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', '  Obra Norte ');
    digitar('novo_destino_endereco', ' Rua A ');
    await clicar(botao('Adicionar'));
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(api.post).toHaveBeenCalledWith('/frotas/destinos', { nome: 'Obra Norte', endereco: 'Rua A' });
    expect(opcoesDestino()).toEqual(['', '1', '2', '7']);
    expect(selectDestino().value).toBe('7');
    expect(bloco()).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Destino adicionado');
  });

  test('201 sem endereco: o corpo leva so { nome }', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 8, nome: 'Porto', endereco: null, ativo: 1 } });
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Porto');
    await clicar(botao('Adicionar'));
    expect(api.post).toHaveBeenCalledWith('/frotas/destinos', { nome: 'Porto' });
    expect(selectDestino().value).toBe('8');
  });

  test('409 DESTINO_DUPLICADO: seleciona o existente (ja na lista, sem duplicar), fecha o bloco, toast.info', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'Destino já cadastrado', code: 'DESTINO_DUPLICADO', destino: { id: 2, nome: 'Obra Sul', endereco: 'Rua B, 10' } } },
    });
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'obra sul');
    await clicar(botao('Adicionar'));
    expect(opcoesDestino()).toEqual(['', '1', '2']);
    expect(selectDestino().value).toBe('2');
    expect(bloco()).toBeNull();
    expect(toast.info).toHaveBeenCalledWith('Esse destino já existia — selecionado.');
    expect(toast.success).not.toHaveBeenCalled();
  });

  test('409 com um destino que ainda nao estava na lista (criado por outro depois do inicio): entra e fica selecionado', async () => {
    api.post.mockRejectedValueOnce({
      response: { status: 409, data: { error: 'Destino já cadastrado', code: 'DESTINO_DUPLICADO', destino: { id: 9, nome: 'Galpão 2', endereco: null } } },
    });
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Galpão 2');
    await clicar(botao('Adicionar'));
    expect(opcoesDestino()).toEqual(['', '1', '2', '9']);
    expect(selectDestino().value).toBe('9');
    expect(toast.info).toHaveBeenCalledWith('Esse destino já existia — selecionado.');
  });

  test('400 do servidor: a mensagem dele fica no bloco, que continua aberto; a selecao nao muda', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Nome do destino: no máximo 120 caracteres' } } });
    await abrirSaida();
    digitar('destino_id', '1');
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'x'.repeat(121));
    await clicar(botao('Adicionar'));
    expect(bloco()).not.toBeNull();
    expect(bloco().textContent).toContain('Nome do destino: no máximo 120 caracteres');
    expect(selectDestino().value).toBe('1');
    expect(opcoesDestino()).toEqual(['', '1', '2']);
    expect(toast.success).not.toHaveBeenCalled();
    expect(toast.info).not.toHaveBeenCalled();
  });

  test('sem resposta (rede): a mensagem de internet no bloco', async () => {
    api.post.mockRejectedValueOnce(new Error('Network Error'));
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Porto');
    await clicar(botao('Adicionar'));
    expect(bloco().textContent).toContain(MSG_FALHA);
    expect(MSG_FALHA).toBe('Não foi possível adicionar o destino. Confira a internet e tente de novo.');
  });

  test('enquanto salva, Adicionar e Cancelar ficam desabilitados', async () => {
    let soltar;
    api.post.mockImplementationOnce(() => new Promise((resolve) => { soltar = () => resolve({ data: { id: 7, nome: 'Obra Norte' } }); }));
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Obra Norte');
    expect(botao('Adicionar').disabled).toBe(false);
    await clicar(botao('Adicionar'));
    expect(botao('Adicionar').disabled).toBe(true);
    expect(botao('Cancelar').disabled).toBe(true);
    await act(async () => { soltar(); });
    expect(bloco()).toBeNull();
    expect(selectDestino().value).toBe('7');
  });
});

describe('RN-F8.34b — a lista local acompanha inicio.destinos (destino desativado com o formulario aberto)', () => {
  const props = { tipo: 'saida', onCancelar: () => {}, onSalvo: () => {}, onAtualizar: () => {} };
  async function montar(ini) {
    await act(async () => { root.render(<RegistroForm {...props} inicio={ini} />); });
  }

  test('a prop muda sem o destino escolhido: o select perde a opcao, a selecao zera e o aviso aparece; escolher outro limpa o aviso', async () => {
    await montar(inicio());
    digitar('destino_id', '2');
    expect(selectDestino().value).toBe('2');
    await montar(inicio({ destinos: [DESTINOS[0]] }));
    expect(opcoesDestino()).toEqual(['', '1']);
    expect(selectDestino().value).toBe('');
    expect(container.textContent).toContain(MSG_DESATIVADO);
    expect(MSG_DESATIVADO).toBe('O destino escolhido foi desativado. Escolha outro.');
    digitar('destino_id', '1');
    expect(container.textContent).not.toContain(MSG_DESATIVADO);
  });

  test('a prop muda e o escolhido continua la: nada muda e nao ha aviso', async () => {
    await montar(inicio());
    digitar('destino_id', '1');
    await montar(inicio({ destinos: [DESTINOS[0], { id: 3, nome: 'Novo do gestor', endereco: null }] }));
    expect(opcoesDestino()).toEqual(['', '1', '3']);
    expect(selectDestino().value).toBe('1');
    expect(container.textContent).not.toContain(MSG_DESATIVADO);
  });

  test('o destino criado aqui (201) sobrevive a um inicio que ainda nao o traz, sem duplicar quando ele volta', async () => {
    api.post.mockResolvedValueOnce({ data: { id: 7, nome: 'Obra Norte', endereco: null, ativo: 1 } });
    await montar(inicio());
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Obra Norte');
    await clicar(botao('Adicionar'));
    expect(selectDestino().value).toBe('7');
    await montar(inicio({ destinos: [...DESTINOS] })); // o servidor ainda nao devolveu o 7
    expect(opcoesDestino()).toEqual(['', '1', '2', '7']);
    expect(selectDestino().value).toBe('7');
    expect(container.textContent).not.toContain(MSG_DESATIVADO);
    await montar(inicio({ destinos: [...DESTINOS, { id: 7, nome: 'Obra Norte', endereco: null }] }));
    expect(opcoesDestino()).toEqual(['', '1', '2', '7']);
    expect(selectDestino().value).toBe('7');
  });

  test('pelo portal: 400 "Destino não encontrado" rele o inicio (sem o destino) e a selecao zera com o aviso', async () => {
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Destino não encontrado' } } });
    await abrirSaida();
    digitar('veiculo_id', String(COMUM.id));
    digitar('km', '1200');
    digitar('destino_id', '2');
    await responderTudo();
    respostaInicio = inicio({ destinos: [DESTINOS[0]] }); // o gestor desativou o 2 no meio
    await enviar();
    expect(container.querySelector('[role="alert"]').textContent).toBe('Destino não encontrado');
    expect(opcoesDestino()).toEqual(['', '1']);
    expect(selectDestino().value).toBe('');
    expect(container.textContent).toContain(MSG_DESATIVADO);
    expect(container.querySelector('form')).not.toBeNull();
  });
});

describe('RN-F8.35 — o corpo da saida leva destino_id numerico e condutor_nome; nunca destino texto nem origem', () => {
  test('carro liberado, destino escolhido e condutor com espacos: destino_id 2 (numero) e condutor aparado', async () => {
    api.post.mockResolvedValue({ data: { registro: { id: 41 }, viagem: { id: 9 } } });
    await abrirSaida();
    digitar('veiculo_id', String(LIBERADO.id));
    digitar('km', '250');
    digitar('destino_id', '2');
    digitar('condutor_nome', '  Maria  ');
    digitar('finalidade', 'Entrega');
    await responderTudo();
    await enviar();
    expect(postsDeRegistro()).toHaveLength(1);
    const corpo = postsDeRegistro()[0][1];
    expect(corpo.destino_id).toBe(2);
    expect(corpo.condutor_nome).toBe('Maria');
    expect(corpo.finalidade).toBe('Entrega');
    expect(corpo.veiculo_id).toBe(4);
    expect('destino' in corpo).toBe(false);
    expect('origem' in corpo).toBe(false);
    expect(toast.success).toHaveBeenCalledWith('Saída registrada');
  });

  test('sem destino escolhido e condutor em branco: o corpo nao leva destino_id nem condutor_nome', async () => {
    await abrirSaida();
    digitar('veiculo_id', String(LIBERADO.id));
    digitar('km', '250');
    digitar('condutor_nome', '   ');
    await responderTudo();
    await enviar();
    const corpo = postsDeRegistro()[0][1];
    expect('destino_id' in corpo).toBe(false);
    expect('condutor_nome' in corpo).toBe(false);
    expect('destino' in corpo).toBe(false);
    expect('origem' in corpo).toBe(false);
  });

  test('o destino recem-adicionado (201) vai no corpo como destino_id numerico', async () => {
    api.post.mockImplementation((url) => {
      if (url === '/frotas/destinos') return Promise.resolve({ data: { id: 7, nome: 'Obra Norte', endereco: null, ativo: 1 } });
      return Promise.resolve({ data: { registro: { id: 41 } } });
    });
    await abrirSaida();
    digitar('veiculo_id', String(COMUM.id));
    digitar('km', '1200');
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Obra Norte');
    await clicar(botao('Adicionar'));
    await responderTudo();
    await enviar();
    expect(postsDeDestino()).toHaveLength(1);
    const corpo = postsDeRegistro()[0][1];
    expect(corpo.destino_id).toBe(7);
    expect('destino' in corpo).toBe(false);
  });
});
