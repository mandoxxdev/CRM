/**
 * Campo de cliente da proposta com busca (27/11/2026: "essa parte de selecionar o cliente está ruim, pensa nisso com 5k de clientes").
 * O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import SeletorCliente, { LIMITE_BUSCA_CLIENTE } from './SeletorCliente';
import api from '../../services/api';

jest.mock('../../services/api', () => ({ __esModule: true, default: { get: jest.fn() } }));

const CLIENTES = [
  { id: 11, razao_social: 'FALCAO INDUSTRIA E COMERCIO DE TINTAS SA', nome_fantasia: 'FALCAO TINTAS', cnpj: '12.345.678/0001-90', cidade: 'Recife', estado: 'PE' },
  { id: 12, razao_social: 'FALCAO EMBALAGENS LTDA', nome_fantasia: 'FALCAO EMBALAGENS LTDA', cnpj: '98.765.432/0001-10', cidade: 'Natal', estado: 'RN' },
];

let container; let root; let escolhido;
beforeEach(() => {
  jest.useFakeTimers();
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  api.get.mockResolvedValue({ data: CLIENTES });
  escolhido = null;
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); jest.useRealTimers(); });

function Envolto({ rotuloInicial = '', valorInicial = '' }) {
  const [valor, setValor] = useState(valorInicial);
  const [rotulo, setRotulo] = useState(rotuloInicial);
  return (
    <SeletorCliente
      valor={valor}
      rotulo={rotulo}
      onEscolher={(id, c) => { escolhido = { id, c }; setValor(id); setRotulo(c ? c.razao_social : ''); }}
    />
  );
}
const campo = () => container.querySelector('input[role="combobox"]');
async function montar(props) { await act(async () => { root.render(<Envolto {...props} />); }); }
async function digitar(v) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set.call(campo(), v);
    campo().dispatchEvent(new Event('input', { bubbles: true }));
  });
}
async function esperarBusca() {
  await act(async () => { jest.advanceTimersByTime(300); });
  for (let k = 0; k < 4; k++) await act(async () => { await Promise.resolve(); });
}
const tecla = async (key) => act(async () => { campo().dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true })); });

test('nao carrega lista nenhuma ao montar a tela', async () => {
  await montar();
  expect(api.get).not.toHaveBeenCalled();
  expect(container.querySelector('[role="option"]')).toBeNull();
});

// 27/11/2026 ("ao clicar deve abrir um menu sabe"): o campo abre a lista ao ser clicado, sem precisar digitar.
test('clicar no campo abre a lista com os primeiros clientes (sem termo, com o limite) e orienta a digitar', async () => {
  await montar();
  await act(async () => { campo().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  for (let k = 0; k < 4; k++) await act(async () => { await Promise.resolve(); });
  expect(api.get).toHaveBeenCalledWith('/clientes', { params: { status: 'ativo', limite: LIMITE_BUSCA_CLIENTE } });
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
  expect(campo().getAttribute('aria-expanded')).toBe('true');
  expect(container.textContent).toContain('Digite para buscar entre todos os clientes.');
});

test('focar com o Tab tambem abre; fechar e abrir de novo nao busca outra vez a lista inicial', async () => {
  await montar();
  await act(async () => { campo().focus(); });
  for (let k = 0; k < 4; k++) await act(async () => { await Promise.resolve(); });
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
  await tecla('Escape');
  expect(container.querySelector('[role="option"]')).toBeNull();
  await act(async () => { campo().dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  expect(container.querySelectorAll('[role="option"]')).toHaveLength(2);
  expect(api.get).toHaveBeenCalledTimes(1);
});

test('uma letra ja filtra no servidor', async () => {
  await montar();
  await digitar('f');
  await esperarBusca();
  expect(api.get).toHaveBeenLastCalledWith('/clientes', { params: { status: 'ativo', search: 'f', limite: LIMITE_BUSCA_CLIENTE } });
});

test('busca no servidor so os primeiros que batem, com os ativos, e mostra fantasia, CNPJ e cidade/UF', async () => {
  await montar();
  await digitar('falc');
  await esperarBusca();
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get).toHaveBeenCalledWith('/clientes', { params: { status: 'ativo', search: 'falc', limite: LIMITE_BUSCA_CLIENTE } });
  const opcoes = container.querySelectorAll('[role="option"]');
  expect(opcoes).toHaveLength(2);
  expect(opcoes[0].textContent).toContain('FALCAO INDUSTRIA E COMERCIO DE TINTAS SA');
  expect(opcoes[0].textContent).toContain('FALCAO TINTAS · 12.345.678/0001-90 · Recife/PE');
  expect(opcoes[1].textContent).not.toContain('FALCAO EMBALAGENS LTDA ·'); // fantasia igual a razao nao repete
});

test('digitando rapido, uma busca so (espera a pessoa parar)', async () => {
  await montar();
  await digitar('fa');
  await digitar('fal');
  await digitar('falc');
  await esperarBusca();
  expect(api.get).toHaveBeenCalledTimes(1);
  expect(api.get.mock.calls[0][1].params.search).toBe('falc');
});

test('teclado: seta para baixo e Enter escolhem; o campo mostra o nome escolhido', async () => {
  await montar();
  await digitar('falc');
  await esperarBusca();
  await tecla('ArrowDown');
  await tecla('Enter');
  expect(escolhido.id).toBe('12');
  expect(campo().value).toBe('FALCAO EMBALAGENS LTDA');
  expect(container.querySelector('[role="option"]')).toBeNull();
});

test('mouse escolhe; o X limpa para trocar', async () => {
  await montar();
  await digitar('falc');
  await esperarBusca();
  await act(async () => { container.querySelector('[role="option"]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })); });
  expect(escolhido.id).toBe('11');
  await act(async () => { container.querySelector('.seletor-cliente-limpar').click(); });
  expect(escolhido).toEqual({ id: '', c: null });
  expect(campo().value).toBe('');
});

test('edicao: mostra o cliente gravado sem buscar nada', async () => {
  await montar({ valorInicial: '11', rotuloInicial: 'FALCAO INDUSTRIA E COMERCIO DE TINTAS SA' });
  expect(campo().value).toBe('FALCAO INDUSTRIA E COMERCIO DE TINTAS SA');
  expect(api.get).not.toHaveBeenCalled();
});

test('nenhum encontrado e muitos encontrados: avisa', async () => {
  api.get.mockResolvedValueOnce({ data: [] });
  await montar();
  await digitar('zzz');
  await esperarBusca();
  expect(container.textContent).toContain('Nenhum cliente ativo encontrado.');
  api.get.mockResolvedValueOnce({ data: Array.from({ length: LIMITE_BUSCA_CLIENTE }, (_, i) => ({ id: i + 1, razao_social: `CLIENTE ${i}` })) });
  await digitar('cli');
  await esperarBusca();
  expect(container.textContent).toContain(`Mostrando os ${LIMITE_BUSCA_CLIENTE} primeiros`);
});
