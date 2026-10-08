/**
 * Chat — recuperacao de imagem com URL assinada vencida (Etapa 82, RN-82.03).
 *
 * A URL do anexo vence (8 h) e a tela fica aberta horas sem refetch. Quando a miniatura ou o
 * lightbox falham (`onError`), a tela pede `GET /chat/mensagens/:id/anexo` e troca SO o
 * `anexo_url` daquela mensagem — sem recarregar a conversa (recarregar descarta paginas antigas,
 * rola para o fim e marca como lida).
 *
 * O que se prova:
 *  - uma chamada por FALHA: segundo `onError` do mesmo id sem a imagem ter carregado no meio
 *    (arquivo apagado, URL nova tambem falha) NAO chama de novo — sem laco;
 *  - mas a imagem que carregou (`onLoad`) volta a poder reassinar num segundo vencimento, e um
 *    pedido que caiu por rede libera a proxima tentativa; 404 da rota nunca libera;
 *  - so a mensagem que falhou muda; a outra imagem continua com a URL dela;
 *  - a lista de mensagens NAO e recarregada;
 *  - o lightbox mostra a URL reassinada e compartilha o mesmo `Set` com a miniatura;
 *  - 404 da rota nao quebra a tela nem tenta de novo.
 *
 * Executar: cd client && CI=true npx react-scripts test src/components/chat/ChatPage --watchAll=false
 */
import React, { act } from 'react';
import { createRoot } from 'react-dom/client';
import ChatPage from './ChatPage';
import api from '../../services/api';

jest.mock('../../services/api', () => ({
  __esModule: true,
  default: { get: jest.fn(), post: jest.fn(), put: jest.fn(), delete: jest.fn() },
}));

jest.mock('../../context/AuthContext', () => ({
  useAuth: () => ({ user: { id: 1, nome: 'Ana' } }),
}));

jest.mock('../../services/permissionsCache', () => ({
  getEffectiveUser: (u) => u,
}));

jest.mock('../../services/chatSocket', () => ({
  connectChatSocket: () => null,
  joinConversa: () => {},
  leaveConversa: () => {},
  emitTyping: () => {},
  resolveMediaUrl: (p) => (p ? `http://srv${p}` : ''),
}));

const URL_10 = '/api/uploads/chat/chat-10.png?exp=100&sig=aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
const URL_11 = '/api/uploads/chat/chat-11.png?exp=100&sig=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
const NOVA_10 = '/api/uploads/chat/chat-10.png?exp=999&sig=cccccccccccccccccccccccccccccccc';
const NOVA_11 = '/api/uploads/chat/chat-11.png?exp=999&sig=dddddddddddddddddddddddddddddddd';

const MENSAGENS = [
  { id: 10, conversa_id: 1, usuario_id: 2, tipo: 'imagem', anexo_url: URL_10, anexo_nome: 'a.png',
    conteudo: '', created_at: '2026-10-08T10:00:00', autor_nome: 'Bia' },
  { id: 11, conversa_id: 1, usuario_id: 2, tipo: 'imagem', anexo_url: URL_11, anexo_nome: 'b.png',
    conteudo: '', created_at: '2026-10-08T10:01:00', autor_nome: 'Bia' },
  { id: 12, conversa_id: 1, usuario_id: 1, tipo: 'texto', conteudo: 'oi',
    created_at: '2026-10-08T10:02:00', autor_nome: 'Ana' },
];

let container;
let root;
let respostaAnexo;

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.spyOn(console, 'error').mockImplementation(() => {});
  respostaAnexo = {
    10: () => Promise.resolve({ data: { anexo_url: NOVA_10 } }),
    11: () => Promise.resolve({ data: { anexo_url: NOVA_11 } }),
  };
  api.get.mockImplementation((url) => {
    if (url === '/chat/conversas') {
      return Promise.resolve({ data: { conversas: [{ id: 1, tipo: 'direta', titulo: 'Bia', nao_lidas: 0 }] } });
    }
    if (url === '/chat/usuarios') return Promise.resolve({ data: { usuarios: [] } });
    if (url === '/chat/conversas/1/mensagens') {
      return Promise.resolve({ data: { mensagens: MENSAGENS.map((m) => ({ ...m })), hasMore: false } });
    }
    const m = /^\/chat\/mensagens\/(\d+)\/anexo$/.exec(url);
    if (m) return respostaAnexo[m[1]] ? respostaAnexo[m[1]]() : Promise.reject(new Error('404'));
    return Promise.resolve({ data: {} });
  });
  api.put.mockResolvedValue({ data: { success: true } });
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  console.error.mockRestore();
});

async function abrirConversa() {
  await act(async () => { root.render(<ChatPage />); });
  const item = container.querySelector('.chat-conv-item');
  expect(item).not.toBeNull();
  await act(async () => { item.click(); });
}

const miniatura = (nome) => container.querySelector(`img.chat-image-thumb[alt="${nome}"]`);
const chamadasDe = (url) => api.get.mock.calls.filter(([u]) => u === url).length;

async function falhar(img) {
  await act(async () => { img.dispatchEvent(new Event('error')); });
}

test('onError da miniatura reassina SO aquela mensagem, uma vez, sem recarregar a conversa', async () => {
  await abrirConversa();
  expect(miniatura('a.png').getAttribute('src')).toBe(`http://srv${URL_10}`);
  expect(chamadasDe('/chat/conversas/1/mensagens')).toBe(1);

  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(1);
  expect(miniatura('a.png').getAttribute('src')).toBe(`http://srv${NOVA_10}`);
  // A outra imagem nao mudou e ninguem pediu a URL dela.
  expect(miniatura('b.png').getAttribute('src')).toBe(`http://srv${URL_11}`);
  expect(chamadasDe('/chat/mensagens/11/anexo')).toBe(0);

  // A URL nova tambem falha (arquivo apagado): NAO tenta de novo.
  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(1);

  // A conversa nao foi recarregada.
  expect(chamadasDe('/chat/conversas/1/mensagens')).toBe(1);
});

test('lightbox: onError reassina, mostra a URL nova e compartilha o Set com a miniatura', async () => {
  await abrirConversa();
  const botao = miniatura('b.png').closest('button');
  await act(async () => { botao.click(); });
  const ampliada = () => container.querySelector('.chat-lightbox img');
  expect(ampliada().getAttribute('src')).toBe(`http://srv${URL_11}`);

  await falhar(ampliada());
  expect(chamadasDe('/chat/mensagens/11/anexo')).toBe(1);
  expect(ampliada().getAttribute('src')).toBe(`http://srv${NOVA_11}`);
  expect(miniatura('b.png').getAttribute('src')).toBe(`http://srv${NOVA_11}`);

  await falhar(miniatura('b.png'));
  await falhar(ampliada());
  expect(chamadasDe('/chat/mensagens/11/anexo')).toBe(1);
  expect(chamadasDe('/chat/conversas/1/mensagens')).toBe(1);
});

test('rota responde 404: a imagem fica como esta e nao ha segunda tentativa', async () => {
  respostaAnexo[10] = () => Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }));
  await abrirConversa();
  await falhar(miniatura('a.png'));
  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(1);
  expect(miniatura('a.png').getAttribute('src')).toBe(`http://srv${URL_10}`);
  expect(chamadasDe('/chat/conversas/1/mensagens')).toBe(1);
});

async function carregar(img) {
  await act(async () => { img.dispatchEvent(new Event('load')); });
}

test('carregou depois de reassinar: um segundo vencimento (16 h+) reassina de novo', async () => {
  const SEGUNDA_10 = '/api/uploads/chat/chat-10.png?exp=1999&sig=eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee';
  await abrirConversa();
  await carregar(miniatura('a.png'));

  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(1);
  expect(miniatura('a.png').getAttribute('src')).toBe(`http://srv${NOVA_10}`);
  await carregar(miniatura('a.png'));

  // A URL reassinada tambem vence com a tela aberta: tenta de novo e troca para a segunda.
  respostaAnexo[10] = () => Promise.resolve({ data: { anexo_url: SEGUNDA_10 } });
  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(2);
  expect(miniatura('a.png').getAttribute('src')).toBe(`http://srv${SEGUNDA_10}`);

  // Sem carregar entre as falhas continua uma tentativa por falha (sem laco).
  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(2);
  expect(chamadasDe('/chat/conversas/1/mensagens')).toBe(1);
});

test('pedido de reassinar caiu por rede: o proximo onError tenta de novo', async () => {
  respostaAnexo[10] = () => Promise.reject(new Error('Network Error'));
  await abrirConversa();
  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(1);
  expect(miniatura('a.png').getAttribute('src')).toBe(`http://srv${URL_10}`);

  respostaAnexo[10] = () => Promise.resolve({ data: { anexo_url: NOVA_10 } });
  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(2);
  expect(miniatura('a.png').getAttribute('src')).toBe(`http://srv${NOVA_10}`);
});

test('404 da rota mesmo depois de ter carregado uma vez: para ali, sem laco', async () => {
  await abrirConversa();
  await carregar(miniatura('a.png'));
  respostaAnexo[10] = () => Promise.reject(Object.assign(new Error('404'), { response: { status: 404 } }));
  await falhar(miniatura('a.png'));
  await falhar(miniatura('a.png'));
  await falhar(miniatura('a.png'));
  expect(chamadasDe('/chat/mensagens/10/anexo')).toBe(1);
});
