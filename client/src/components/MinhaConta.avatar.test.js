/**
 * Minha Conta + AvatarUsuario — Etapa 82 (RN-82.05).
 *
 * A pasta de avatares exige assinatura: a tela usa `foto_src` (URL assinada da API) e nunca monta
 * o endereço pelo nome `foto_url`. Upload copia o `foto_src` da resposta; remover zera os dois;
 * imagem que falha (assinatura vencida, arquivo apagado) dá lugar às iniciais.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/MinhaConta.avatar --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import MinhaConta from './MinhaConta';
import AvatarUsuario from './AvatarUsuario';
import api from '../services/api';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' }, get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));
jest.mock('react-toastify', () => ({
  toast: { success: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));
const mockRefreshUser = jest.fn(() => Promise.resolve());
jest.mock('../context/AuthContext', () => ({
  useAuth: () => ({ refreshUser: mockRefreshUser }),
}));

const SIG = 'exp=99999999999&sig=0123456789abcdef0123456789abcdef';
const SRC1 = `/api/uploads/avatares/avatar_7_1.png?${SIG}`;
const SRC2 = `/api/uploads/avatares/avatar_7_2.png?${SIG}`;
const CONTA = { id: 7, nome: 'Maria Souza', email: 'm@x.com', foto_url: 'avatar_7_1.png', foto_src: SRC1 };

// Sem isto o React avisa "environment is not configured to support act".
global.IS_REACT_ACT_ENVIRONMENT = true;

let container; let root;
beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  jest.clearAllMocks();
  api.defaults.baseURL = '/api';
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function renderConta(conta) {
  api.get.mockResolvedValueOnce({ data: conta });
  await act(async () => {
    root.render(<MemoryRouter><MinhaConta /></MemoryRouter>);
  });
  await act(async () => {});
}
const avatar = () => container.querySelector('img.conta-avatar');
const iniciais = () => container.querySelector('.conta-avatar-placeholder');

test('mostra o foto_src assinado — nao a URL montada pelo nome', async () => {
  await renderConta(CONTA);
  expect(avatar()).not.toBeNull();
  expect(avatar().getAttribute('src')).toBe(SRC1);
  expect(container.innerHTML).not.toContain('/uploads/avatares/avatar_7_1.png"');
});

test('so foto_url (sem foto_src, payload antigo): iniciais, nunca endereco cru', async () => {
  await renderConta({ ...CONTA, foto_src: undefined });
  expect(avatar()).toBeNull();
  expect(iniciais().textContent).toBe('MS');
});

test('onError: a imagem some e as iniciais aparecem', async () => {
  await renderConta(CONTA);
  await act(async () => { avatar().dispatchEvent(new Event('error')); });
  expect(avatar()).toBeNull();
  expect(iniciais().textContent).toBe('MS');
});

test('upload copia o foto_src da resposta (e volta a tentar mesmo depois de um erro)', async () => {
  await renderConta(CONTA);
  await act(async () => { avatar().dispatchEvent(new Event('error')); });
  expect(avatar()).toBeNull();
  api.post.mockResolvedValueOnce({ data: { foto_url: 'avatar_7_2.png', foto_src: SRC2 } });
  const input = container.querySelector('input[type="file"]');
  const arquivo = new File([new Uint8Array([1, 2, 3])], 'eu.png', { type: 'image/png' });
  Object.defineProperty(input, 'files', { value: [arquivo], configurable: true });
  await act(async () => { input.dispatchEvent(new Event('change', { bubbles: true })); });
  await act(async () => {});
  expect(api.post).toHaveBeenCalledWith('/conta/foto', expect.any(FormData));
  expect(avatar().getAttribute('src')).toBe(SRC2);
  expect(mockRefreshUser).toHaveBeenCalled();
});

test('remover zera foto_url e foto_src: iniciais e sem botao de remover', async () => {
  await renderConta(CONTA);
  api.delete.mockResolvedValueOnce({ data: { message: 'ok', foto_url: null, foto_src: null } });
  const remover = container.querySelector('.conta-remover-foto');
  await act(async () => { remover.dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await act(async () => {});
  expect(api.delete).toHaveBeenCalledWith('/conta/foto');
  expect(avatar()).toBeNull();
  expect(iniciais().textContent).toBe('MS');
  expect(container.querySelector('.conta-remover-foto')).toBeNull();
});

describe('AvatarUsuario (o que o menu lateral usa)', () => {
  test('com API em outro host compoe so a origem; onError esconde e mostra o fallback', async () => {
    api.defaults.baseURL = 'https://crm.exemplo.com/api';
    await act(async () => {
      root.render(<AvatarUsuario fotoSrc={SRC1} className="user-avatar-mini" alt="Maria" fallback={<span className="fb">MS</span>} />);
    });
    const img = container.querySelector('img.user-avatar-mini');
    expect(img.getAttribute('src')).toBe(`https://crm.exemplo.com${SRC1}`);
    await act(async () => { img.dispatchEvent(new Event('error')); });
    expect(container.querySelector('img')).toBeNull();
    expect(container.querySelector('.fb').textContent).toBe('MS');
    // Um foto_src novo (vindo do /auth/me) volta a tentar.
    await act(async () => {
      root.render(<AvatarUsuario fotoSrc={SRC2} className="user-avatar-mini" alt="Maria" fallback={<span className="fb">MS</span>} />);
    });
    expect(container.querySelector('img.user-avatar-mini').getAttribute('src')).toBe(`https://crm.exemplo.com${SRC2}`);
  });

  test('sem foto_src (ou nome cru): nada no menu (fallback padrao null)', async () => {
    await act(async () => { root.render(<AvatarUsuario fotoSrc="avatar_7_1.png" className="user-avatar-mini" alt="x" />); });
    expect(container.innerHTML).toBe('');
    await act(async () => { root.render(<AvatarUsuario fotoSrc={null} className="user-avatar-mini" alt="x" />); });
    expect(container.innerHTML).toBe('');
  });
});
