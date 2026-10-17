/**
 * Etapa 140 (RN-140.12b, C301; Fase 5 r3 H9–H12): o seletor *Status da proposta* do formulário só deixa escolher "Desconto aprovado"
 * quando a proposta GRAVADA já está nele. A função pura (`opcoesStatusProposta`) tem teste próprio; este monta o formulário e prende a
 * ligação dela com a tela: o status gravado vem do carregamento, não do que se escolhe no seletor, e passa a "enviada" depois do Enviar.
 *
 * O mock de `services/api` é só a fronteira HTTP.
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import PropostaForm from './PropostaForm';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), put: jest.fn(), post: jest.fn(), delete: jest.fn() },
}));
jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 7, role: 'usuario', nome: 'Vend' }, loading: false }),
}));
jest.mock('react-toastify', () => ({ toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warning: jest.fn() } }));

const proposta = (status) => ({
  id: 1, numero_proposta: 'P-1', cliente_id: 3, titulo: 'T', status, margem_desconto: status === 'desconto_aprovado' ? 12 : 0,
  valor_total: 1000, responsavel_id: 7, itens: [],
});

let container; let root;
function servidor(status) {
  api.get.mockImplementation((url) => {
    if (url === '/propostas/1') return Promise.resolve({ data: proposta(status) });
    return Promise.resolve({ data: [] });
  });
  api.post.mockResolvedValue({ data: { status: 'enviada' } });
}
beforeEach(() => {
  global.IS_REACT_ACT_ENVIRONMENT = true;
  jest.clearAllMocks();
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function montar(status) {
  servidor(status);
  await act(async () => {
    root.render(
      <MemoryRouter initialEntries={['/comercial/propostas/editar/1']}>
        <Routes><Route path="/comercial/propostas/editar/:id" element={<PropostaForm />} /></Routes>
      </MemoryRouter>
    );
  });
  for (let k = 0; k < 5; k++) await act(async () => { await Promise.resolve(); });
}
const opcaoDA = () => container.querySelector('option[value="desconto_aprovado"]');
const seletorStatus = () => opcaoDA().closest('select');

test('[RN-140.12b] proposta gravada em "desconto aprovado": a opção fica habilitada, mesmo depois de trocar o seletor', async () => {
  await montar('desconto_aprovado');
  expect(seletorStatus().value).toBe('desconto_aprovado');
  expect(opcaoDA().disabled).toBe(false);
  await act(async () => {
    const sel = seletorStatus();
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
    setter.call(sel, 'rascunho');
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
  expect(seletorStatus().value).toBe('rascunho');
  expect(opcaoDA().disabled).toBe(false); // o gravado continua desconto_aprovado: dá para voltar
});

test('[RN-140.12b] depois do Enviar a proposta é "enviada": a opção passa a desabilitada', async () => {
  await montar('desconto_aprovado');
  const enviar = [...container.querySelectorAll('button')].find((b) => b.textContent.includes('Enviar proposta'));
  expect(enviar).toBeTruthy();
  await act(async () => { enviar.click(); });
  for (let k = 0; k < 3; k++) await act(async () => { await Promise.resolve(); });
  expect(api.post).toHaveBeenCalledWith('/propostas/1/enviar');
  expect(opcaoDA().disabled).toBe(true);
});

test('[RN-140.12b] proposta gravada em rascunho: "Desconto aprovado" aparece desabilitada', async () => {
  await montar('rascunho');
  expect(seletorStatus().value).toBe('rascunho');
  expect(opcaoDA().disabled).toBe(true);
  expect(opcaoDA().title).toMatch(/aprovação do desconto/);
});
