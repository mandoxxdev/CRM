/**
 * Frota Etapa 9 (C1) — o endereco do destino: CEP que busca ou os campos a mao, no portal e na tela Destinos do gestor.
 *
 *   RN-F9.13  CEP + Buscar (e sair do campo com 8 digitos) chama GET /cep/:cep e SUBSTITUI rua, bairro, cidade e UF (A6: inclusive pelo
 *             vazio); numero e complemento nao mexe; tudo editavel; dica "Nao sabe o CEP?..."; 404 -> aviso de CEP nao encontrado.
 *   RN-F9.14  Falha da consulta (502/rede) -> aviso; menos de 8 digitos nao consulta.
 *   RN-F9.15  Portal "+ Novo destino": Nome + endereco; o corpo do POST /frotas/destinos leva as 7 chaves.
 *   RN-F9.16  Portal: a opcao do select mostra "Nome — Cidade/UF" quando ha cidade; senao so o nome.
 *   RN-F9.17  Tela Destinos: Nome + endereco + Status; a edicao abre com os campos gravados e o PUT leva as 7 chaves.
 *   A2        Destino antigo (sem rua estruturada): nota "Endereço antigo: <endereco>" acima dos campos.
 *   RN-F9.23  Portal: o endereco da GMP (inicio.origem.endereco) embaixo de "Saindo de: GMP".
 *
 * Contra o contrato congelado em docs/superpowers/plans/2026-10-29-frotas-etapa9-endereco-do-destino.md. So a fronteira HTTP (`api`)
 * e mockada.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/frotas/FrotasEnderecoDestino --watchAll=false
 */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import EnderecoDestinoCampos, {
  UFS, rotuloDestino, DICA_SEM_CEP, MSG_CEP_NAO_ENCONTRADO, MSG_CEP_FALHOU, MSG_CEP_INCOMPLETO,
} from './EnderecoDestinoCampos';
import FrotasPortalMotorista from './FrotasPortalMotorista';
import { FrotasDestinos } from './FrotasEntityPage';
import api from '../../services/api';
import { toast } from 'react-toastify';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));
let mockUsuario = { id: 7, nome: 'Jose', role: 'usuario', perfil_frota: null };
const mockRefreshUser = jest.fn(() => Promise.resolve(null));
jest.mock('../../context/AuthContext', () => ({ useAuth: () => ({ user: mockUsuario, refreshUser: mockRefreshUser, logout: jest.fn() }) }));
jest.mock('../../services/permissionsCache', () => ({ getEffectiveUser: (u) => u }));

const MOTORISTA = mockUsuario;
const ADMIN = { id: 1, nome: 'Gestor', role: 'user', is_superadmin: 0, admin_modulos: ['frota'], perfil_frota: null };

const CEP_OK = { cep: '09844-100', logradouro: 'Avenida Angelo Demarchi', bairro: 'Batistini', cidade: 'São Bernardo do Campo', estado: 'SP' };

let container; let root;
let respostaCep; // (digitos) => Promise
let respostaInicio;
let ultimoValor; // o estado do harness, para conferir o que o componente devolveu

beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  mockUsuario = MOTORISTA;
  respostaCep = () => Promise.resolve({ data: CEP_OK });
  respostaInicio = null;
  api.get.mockImplementation((url) => {
    const m = /^\/cep\/(.*)$/.exec(url);
    if (m) return respostaCep(m[1]);
    if (url === '/frotas/portal/inicio') return Promise.resolve({ data: respostaInicio });
    if (url === '/frotas/portal/meus-registros') return Promise.resolve({ data: { registros: [], abastecimentos: [] } });
    if (url === '/frotas/meta') return Promise.resolve({ data: { setores: [] } });
    if (url === '/frotas/destinos') return Promise.resolve({ data: DESTINOS_GESTOR });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: {} });
  api.put.mockResolvedValue({ data: {} });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  jest.clearAllMocks();
});

function Harness({ inicial, variante = 'portal', prefixo = '', enderecoAntigo }) {
  const [valor, setValor] = useState(inicial);
  ultimoValor = valor;
  return (
    <EnderecoDestinoCampos
      valor={valor}
      aoMudar={(patch) => setValor((v) => ({ ...v, ...patch }))}
      variante={variante}
      prefixo={prefixo}
      enderecoAntigo={enderecoAntigo}
    />
  );
}
async function montar(el) {
  await act(async () => { root.render(el); });
  await act(async () => {});
}
const campo = (nome) => container.querySelector(`[name="${nome}"]`);
function digitar(nome, valor) {
  const el = typeof nome === 'string' ? campo(nome) : nome;
  if (!el) throw new Error(`campo ${nome} nao encontrado`);
  const proto = el.tagName === 'SELECT' ? window.HTMLSelectElement.prototype : window.HTMLInputElement.prototype;
  act(() => {
    Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, valor);
    el.dispatchEvent(new Event(el.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true }));
  });
}
async function sair(nome) {
  // React escuta focusout para o onBlur
  await act(async () => { campo(nome).dispatchEvent(new FocusEvent('focusout', { bubbles: true })); });
  await act(async () => {});
}
const botao = (texto) => [...container.querySelectorAll('button')].find((b) => b.textContent.trim() === texto);
async function clicar(el) {
  if (!el) throw new Error('elemento nao encontrado');
  await act(async () => { el.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => {});
}
const chamadasCep = () => api.get.mock.calls.filter(([u]) => u.startsWith('/cep/'));
const aviso = () => container.querySelector('[data-testid="aviso-cep"]');

const PREENCHIDO = {
  cep: '', logradouro: 'Rua Velha', numero: '130', complemento: 'Sala 2', bairro: 'Centro', cidade: 'Diadema', uf: 'RJ',
};

describe('RN-F9.13 — CEP busca e substitui; numero e complemento nao mexe', () => {
  test('RN-F9.13 Buscar com 8 digitos chama GET /cep/<digitos> e SUBSTITUI rua, bairro, cidade e UF (os que ja estavam preenchidos)', async () => {
    await montar(<Harness inicial={PREENCHIDO} />);
    digitar('cep', '09844100');
    expect(campo('cep').value).toBe('09844-100');
    await clicar(botao('Buscar'));
    expect(chamadasCep()).toEqual([['/cep/09844100']]);
    expect(campo('logradouro').value).toBe('Avenida Angelo Demarchi');
    expect(campo('bairro').value).toBe('Batistini');
    expect(campo('cidade').value).toBe('São Bernardo do Campo');
    expect(campo('uf').value).toBe('SP');
    // numero e complemento nunca sao tocados
    expect(campo('numero').value).toBe('130');
    expect(campo('complemento').value).toBe('Sala 2');
    expect(ultimoValor).toEqual({
      cep: '09844-100', logradouro: 'Avenida Angelo Demarchi', numero: '130', complemento: 'Sala 2', bairro: 'Batistini',
      cidade: 'São Bernardo do Campo', uf: 'SP',
    });
    expect(aviso()).toBeNull();
  });

  test('A6 CEP generico de cidade (rua e bairro vazios na resposta) LIMPA a rua e o bairro que estavam preenchidos', async () => {
    respostaCep = () => Promise.resolve({ data: { cep: '13100-000', logradouro: '', bairro: '', cidade: 'Campinas', estado: 'SP' } });
    await montar(<Harness inicial={PREENCHIDO} />);
    digitar('cep', '13100000');
    await clicar(botao('Buscar'));
    expect(campo('logradouro').value).toBe('');
    expect(campo('bairro').value).toBe('');
    expect(campo('cidade').value).toBe('Campinas');
    expect(campo('uf').value).toBe('SP');
    expect(campo('numero').value).toBe('130');
  });

  test('RN-F9.13 sair do campo com 8 digitos consulta; sair e clicar Buscar no mesmo CEP nao consulta duas vezes', async () => {
    let soltar;
    respostaCep = () => new Promise((resolve) => { soltar = () => resolve({ data: CEP_OK }); });
    await montar(<Harness inicial={PREENCHIDO} />);
    digitar('cep', '09844-100');
    await sair('cep');
    expect(chamadasCep()).toHaveLength(1);
    await clicar(botao('Buscando…'));
    expect(chamadasCep()).toHaveLength(1);
    await act(async () => { soltar(); });
    await act(async () => {});
    expect(campo('logradouro').value).toBe('Avenida Angelo Demarchi');
    expect(botao('Buscar').disabled).toBe(false);
  });

  test('RN-F9.13 todos os campos editaveis antes e depois da busca; UF e um select das 27 siglas; a dica aparece', async () => {
    await montar(<Harness inicial={PREENCHIDO} />);
    ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach((k) => expect(campo(k).disabled).toBe(false));
    expect(campo('uf').tagName).toBe('SELECT');
    const siglas = [...campo('uf').options].map((o) => o.value).filter(Boolean);
    expect(siglas).toEqual(UFS);
    expect(UFS).toHaveLength(27);
    expect(container.textContent).toContain('Não sabe o CEP? Preencha os campos à mão.');
    expect(DICA_SEM_CEP).toBe('Não sabe o CEP? Preencha os campos à mão.');
    digitar('cep', '09844100');
    await clicar(botao('Buscar'));
    ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach((k) => expect(campo(k).disabled).toBe(false));
    digitar('logradouro', 'Av. Angelo Demarchi');
    expect(campo('logradouro').value).toBe('Av. Angelo Demarchi');
  });

  test('RN-F9.13 preenchimento a mao, sem CEP: nada consulta e o valor e o digitado', async () => {
    await montar(<Harness inicial={{}} />);
    digitar('logradouro', 'Rua das Flores');
    digitar('numero', 'S/N');
    digitar('bairro', 'Centro');
    digitar('cidade', 'Mauá');
    digitar('uf', 'SP');
    await sair('cep');
    expect(chamadasCep()).toHaveLength(0);
    expect(ultimoValor).toEqual({ logradouro: 'Rua das Flores', numero: 'S/N', bairro: 'Centro', cidade: 'Mauá', uf: 'SP' });
    expect(campo('cep').value).toBe('');
  });

  test('RN-F9.13 404 -> "CEP não encontrado — preencha o endereço à mão"; os campos ficam como estavam', async () => {
    respostaCep = () => Promise.reject({ response: { status: 404, data: { error: 'CEP não encontrado' } } });
    await montar(<Harness inicial={PREENCHIDO} />);
    digitar('cep', '99999999');
    await clicar(botao('Buscar'));
    expect(aviso().textContent).toBe('CEP não encontrado — preencha o endereço à mão');
    expect(MSG_CEP_NAO_ENCONTRADO).toBe('CEP não encontrado — preencha o endereço à mão');
    expect(campo('logradouro').value).toBe('Rua Velha');
    // digitar de novo no CEP tira o aviso
    digitar('cep', '0984410');
    expect(aviso()).toBeNull();
  });
});

describe('RN-F9.14 — falha da consulta e CEP incompleto', () => {
  test('RN-F9.14 502 -> "Não foi possível consultar o CEP — preencha o endereço à mão"', async () => {
    respostaCep = () => Promise.reject({ response: { status: 502, data: { error: 'Serviço de CEP indisponível' } } });
    await montar(<Harness inicial={PREENCHIDO} />);
    digitar('cep', '09844100');
    await clicar(botao('Buscar'));
    expect(aviso().textContent).toBe('Não foi possível consultar o CEP — preencha o endereço à mão');
    expect(MSG_CEP_FALHOU).toBe('Não foi possível consultar o CEP — preencha o endereço à mão');
    expect(campo('cidade').value).toBe('Diadema');
  });

  test('RN-F9.14 sem resposta (rede) -> o mesmo aviso de falha', async () => {
    respostaCep = () => Promise.reject(new Error('Network Error'));
    await montar(<Harness inicial={PREENCHIDO} />);
    digitar('cep', '09844100');
    await sair('cep');
    expect(aviso().textContent).toBe(MSG_CEP_FALHOU);
  });

  test('RN-F9.14 menos de 8 digitos nao consulta: sair do campo fica quieto; Buscar avisa "CEP deve ter 8 dígitos"', async () => {
    await montar(<Harness inicial={PREENCHIDO} />);
    digitar('cep', '0984');
    await sair('cep');
    expect(chamadasCep()).toHaveLength(0);
    expect(aviso()).toBeNull();
    await clicar(botao('Buscar'));
    expect(chamadasCep()).toHaveLength(0);
    expect(aviso().textContent).toBe(MSG_CEP_INCOMPLETO);
    expect(MSG_CEP_INCOMPLETO).toBe('CEP deve ter 8 dígitos');
    // controle: com 8 digitos a mesma tela consulta
    digitar('cep', '09844100');
    await clicar(botao('Buscar'));
    expect(chamadasCep()).toHaveLength(1);
  });

  test('RN-F9.14 a resposta de um CEP que a pessoa ja trocou nao preenche nada', async () => {
    let soltar;
    respostaCep = () => new Promise((resolve) => { soltar = () => resolve({ data: CEP_OK }); });
    await montar(<Harness inicial={PREENCHIDO} />);
    digitar('cep', '09844100');
    await sair('cep');
    digitar('cep', '0100100');
    await act(async () => { soltar(); });
    await act(async () => {});
    expect(campo('logradouro').value).toBe('Rua Velha');
  });
});

describe('RN-F9.16 — rotulo do destino', () => {
  test('RN-F9.16 "Nome — Cidade/UF" com cidade; so o nome sem cidade; cidade sem UF fica so a cidade', () => {
    expect(rotuloDestino({ nome: 'Cliente X', cidade: 'Diadema', uf: 'SP' })).toBe('Cliente X — Diadema/SP');
    expect(rotuloDestino({ nome: 'Cliente X', cidade: null, uf: 'SP' })).toBe('Cliente X');
    expect(rotuloDestino({ nome: 'Cliente X', cidade: '  ', uf: null })).toBe('Cliente X');
    expect(rotuloDestino({ nome: 'Cliente X', cidade: 'Diadema', uf: '' })).toBe('Cliente X — Diadema');
  });
});

/* ------------------------------------------------------------------------------------------------ portal */

const ITENS = ['a'].map((chave) => ({ chave, rotulo: `Item ${chave}` }));
const VEICULO = { id: 1, placa: 'ABC1D23', modelo: 'Sprinter', marca: 'Mercedes', km_atual: 1000, tipo_medicao: 'km', status: 'ativo', em_uso: false };
const DESTINOS_PORTAL = [
  { id: 1, nome: 'Cliente X', endereco: 'Rua A, 1, Centro, Diadema/SP', cidade: 'Diadema', uf: 'SP' },
  { id: 2, nome: 'Obra Antiga', endereco: 'texto antigo', cidade: null, uf: null },
];
function inicio(over = {}) {
  return {
    motorista: { id: 7, nome: 'Jose da Silva' },
    viagem_aberta: null,
    veiculos: [VEICULO],
    itens: ITENS,
    destinos: DESTINOS_PORTAL,
    origem: { nome: 'GMP', endereco: 'Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP, CEP 09844-100' },
    perfil: 'MOTORISTA',
    pode_registrar: true,
    pode_gerir: false,
    ...over,
  };
}
async function abrirSaida() {
  await montar(<FrotasPortalMotorista />);
  await clicar(botao('Saída'));
}
const opcoesDestino = () => [...campo('destino_id').options].map((o) => [o.value, o.textContent]);

describe('RN-F9.15 / RN-F9.16 / RN-F9.23 — portal', () => {
  test('RN-F9.16 a opcao do select mostra "Nome — Cidade/UF" quando ha cidade; senao so o nome', async () => {
    respostaInicio = inicio();
    await abrirSaida();
    expect(opcoesDestino()).toEqual([['', 'Escolha o destino…'], ['1', 'Cliente X — Diadema/SP'], ['2', 'Obra Antiga']]);
  });

  test('RN-F9.23 o endereco da GMP aparece embaixo de "Saindo de: GMP"; vazio ou ausente, a linha nao aparece', async () => {
    respostaInicio = inicio();
    await abrirSaida();
    expect(container.querySelector('[data-testid="origem-fixa"]').textContent).toBe('Saindo de: GMP');
    expect(container.querySelector('[data-testid="origem-endereco"]').textContent)
      .toBe('Av. Angelo Demarchi 130, Batistini, São Bernardo do Campo/SP, CEP 09844-100');
    act(() => root.unmount());
    root = createRoot(container);
    respostaInicio = inicio({ origem: { nome: 'GMP', endereco: '' } });
    await abrirSaida();
    expect(container.querySelector('[data-testid="origem-fixa"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="origem-endereco"]')).toBeNull();
    act(() => root.unmount());
    root = createRoot(container);
    respostaInicio = inicio({ origem: undefined }); // servidor da Etapa 8
    await abrirSaida();
    expect(container.querySelector('[data-testid="origem-endereco"]')).toBeNull();
  });

  test('RN-F9.15 "+ Novo destino" com CEP: a busca preenche, o numero e digitado, o POST leva as 7 chaves e o 201 entra com Cidade/UF', async () => {
    respostaInicio = inicio();
    api.post.mockResolvedValueOnce({
      data: { id: 9, nome: 'GMP Filial', endereco: 'Avenida Angelo Demarchi, 500, Batistini, São Bernardo do Campo/SP, CEP 09844-100',
        cidade: 'São Bernardo do Campo', uf: 'SP', ativo: 1 },
    });
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    expect(campo('novo_destino_endereco')).toBeNull();
    digitar('novo_destino_nome', 'GMP Filial');
    digitar('novo_destino_cep', '09844100');
    await sair('novo_destino_cep');
    expect(chamadasCep()).toEqual([['/cep/09844100']]);
    expect(campo('novo_destino_logradouro').value).toBe('Avenida Angelo Demarchi');
    digitar('novo_destino_numero', '500');
    await clicar(botao('Adicionar'));
    expect(api.post).toHaveBeenCalledWith('/frotas/destinos', {
      nome: 'GMP Filial', cep: '09844-100', logradouro: 'Avenida Angelo Demarchi', numero: '500', complemento: '', bairro: 'Batistini',
      cidade: 'São Bernardo do Campo', uf: 'SP',
    });
    expect(campo('destino_id').value).toBe('9');
    expect(opcoesDestino()).toContainEqual(['9', 'GMP Filial — São Bernardo do Campo/SP']);
    expect(container.querySelector('[data-testid="novo-destino"]')).toBeNull();
    expect(toast.success).toHaveBeenCalledWith('Destino adicionado');
  });

  test('RN-F9.15 "+ Novo destino" a mao (sem CEP): nada consulta e o corpo leva o digitado, cep vazio', async () => {
    respostaInicio = inicio();
    api.post.mockResolvedValueOnce({ data: { id: 10, nome: 'Porto', cidade: 'Santos', uf: 'SP', ativo: 1 } });
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Porto');
    digitar('novo_destino_logradouro', 'Rua do Cais');
    digitar('novo_destino_numero', 'S/N');
    digitar('novo_destino_complemento', ' Armazém 3 ');
    digitar('novo_destino_bairro', 'Centro');
    digitar('novo_destino_cidade', 'Santos');
    digitar('novo_destino_uf', 'SP');
    await clicar(botao('Adicionar'));
    expect(chamadasCep()).toHaveLength(0);
    expect(api.post).toHaveBeenCalledWith('/frotas/destinos', {
      nome: 'Porto', cep: '', logradouro: 'Rua do Cais', numero: 'S/N', complemento: 'Armazém 3', bairro: 'Centro', cidade: 'Santos', uf: 'SP',
    });
    expect(campo('destino_id').value).toBe('10');
  });

  test('RN-F9.15 a recusa do endereco pelo servidor fica no bloco, aberto, com o que foi digitado', async () => {
    respostaInicio = inicio();
    api.post.mockRejectedValueOnce({ response: { status: 400, data: { error: 'Informe o bairro do destino' } } });
    await abrirSaida();
    await clicar(botao('+ Novo destino'));
    digitar('novo_destino_nome', 'Porto');
    digitar('novo_destino_logradouro', 'Rua do Cais');
    await clicar(botao('Adicionar'));
    const bloco = container.querySelector('[data-testid="novo-destino"]');
    expect(bloco.querySelector('[role="alert"]').textContent).toBe('Informe o bairro do destino');
    expect(campo('novo_destino_logradouro').value).toBe('Rua do Cais');
    expect(campo('destino_id').value).toBe('');
  });
});

/* ------------------------------------------------------------------------------------------------ gestor: tela Destinos */

const DESTINOS_GESTOR = [
  { id: 1, nome: 'Cliente Alfa', endereco: 'Rua A, 10, Centro, Diadema/SP, CEP 09910-000', cep: '09910-000', logradouro: 'Rua A',
    numero: '10', complemento: null, bairro: 'Centro', cidade: 'Diadema', uf: 'SP', ativo: 1, criado_por_nome: 'Jose' },
  { id: 2, nome: 'Fornecedor Antigo', endereco: 'Rua B 20 - Mauá', cep: null, logradouro: null, numero: null, complemento: null,
    bairro: null, cidade: null, uf: null, ativo: 0, criado_por_nome: 'Gestor' },
];
const grupo = (rotulo) => [...container.querySelectorAll('.frotas-form-group')]
  .find((g) => g.querySelector('label')?.textContent.trim() === rotulo);
const editarLinha = (i) => container.querySelectorAll('tbody tr')[i].querySelector('.frotas-action-btn[title="Editar"]');
async function salvarModal() {
  await act(async () => {
    container.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  });
}
async function montarDestinos() {
  mockUsuario = ADMIN;
  await montar(<MemoryRouter><FrotasDestinos /></MemoryRouter>);
}

describe('RN-F9.17 / A2 — tela Destinos do gestor', () => {
  test('RN-F9.17 colunas Nome, Endereço (o montado), Cadastrado por, Status', async () => {
    await montarDestinos();
    const cab = [...container.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(cab.slice(0, 4)).toEqual(['Nome', 'Endereço', 'Cadastrado por', 'Status']);
    const celulas = container.querySelectorAll('tbody tr')[0].querySelectorAll('td');
    expect(celulas[1].textContent).toBe('Rua A, 10, Centro, Diadema/SP, CEP 09910-000');
  });

  test('RN-F9.17 Editar abre com o endereco gravado nos campos, sem nota de antigo; a busca do CEP no gestor substitui; o PUT leva as 7 chaves', async () => {
    await montarDestinos();
    await clicar(editarLinha(0));
    expect(campo('cep').value).toBe('09910-000');
    expect(campo('logradouro').value).toBe('Rua A');
    expect(campo('numero').value).toBe('10');
    expect(campo('uf').value).toBe('SP');
    expect(container.querySelector('[data-testid="endereco-antigo"]')).toBeNull();
    expect(grupo('Status')).toBeTruthy();
    digitar('cep', '09844100');
    await clicar(botao('Buscar'));
    expect(campo('logradouro').value).toBe('Avenida Angelo Demarchi');
    expect(campo('numero').value).toBe('10');
    await salvarModal();
    expect(api.put).toHaveBeenCalledTimes(1);
    const [url, corpo] = api.put.mock.calls[0];
    expect(url).toBe('/frotas/destinos/1');
    expect(corpo).toEqual(expect.objectContaining({
      nome: 'Cliente Alfa', cep: '09844-100', logradouro: 'Avenida Angelo Demarchi', numero: '10', complemento: null, bairro: 'Batistini',
      cidade: 'São Bernardo do Campo', uf: 'SP',
    }));
    expect('endereco' in corpo).toBe(false);
  });

  test('A2 destino antigo (sem rua estruturada) mostra "Endereço antigo: <endereco>"; reativar sem tocar manda as 7 chaves vazias (null)', async () => {
    await montarDestinos();
    await clicar(editarLinha(1));
    expect(container.querySelector('[data-testid="endereco-antigo"]').textContent).toBe('Endereço antigo: Rua B 20 - Mauá');
    expect(campo('logradouro').value).toBe('');
    digitar(grupo('Status').querySelector('select'), '1');
    await salvarModal();
    const corpo = api.put.mock.calls[0][1];
    ['cep', 'logradouro', 'numero', 'complemento', 'bairro', 'cidade', 'uf'].forEach((k) => {
      expect(k in corpo).toBe(true);
      expect(corpo[k]).toBeNull();
    });
    expect(String(corpo.ativo)).toBe('1');
  });

  test('A2 Novo Destino nao mostra a nota de endereco antigo', async () => {
    await montarDestinos();
    await clicar([...container.querySelectorAll('button')].find((b) => b.textContent.includes('Novo Destino')));
    expect(container.querySelector('[data-testid="endereco-antigo"]')).toBeNull();
    expect(campo('cep').value).toBe('');
  });
});
