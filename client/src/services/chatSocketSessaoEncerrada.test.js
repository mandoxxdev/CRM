/**
 * Etapa 132 (C271, RN-07) — o socket do chat sai com a sessao encerrada.
 *
 * O servidor passou a recusar no handshake o usuario sem linha ativa (`connect_error` com `data.code = 'USUARIO_INATIVO'`) e
 * a derrubar o socket aberto de quem foi desativado ou apagado, mandando antes `sessao_encerrada`. O client limpa o token e o
 * usuario guardados e vai para `/login?sessao_encerrada=1` — o mesmo destino do 401 da 131. Os outros `connect_error` (token
 * vencido, rede) nao mudam nada. E (Fase 2 I2) o socket guarda o token com que nasceu: o aviso de um socket que ja nao e o da
 * aba (o usuario anterior, que saiu sem recarregar) nao desloga quem entrou depois, e um token novo na aba recria o socket.
 *
 * O `io` do socket.io-client e mockado so na fabrica — os handlers capturados sao os que o `connectChatSocket` REAL registra.
 */
const criados = [];
jest.mock('socket.io-client', () => ({
  io: jest.fn((url, opts) => {
    const handlers = {};
    const s = {
      opts,
      auth: opts.auth,
      connected: false,
      handlers,
      on: jest.fn((ev, fn) => { (handlers[ev] = handlers[ev] || []).push(fn); return s; }),
      off: jest.fn(),
      emit: jest.fn(),
      connect: jest.fn(),
      disconnect: jest.fn(),
      dispara: (ev, ...a) => (handlers[ev] || []).forEach((fn) => fn(...a)),
    };
    criados.push(s);
    return s;
  }),
}));

const L11 = 'Sessão encerrada — o usuário foi desativado ou removido';
const INICIO = 'http://localhost/chat';
const ENCERRADA = { error: L11, code: 'USUARIO_INATIVO' };

let mod;
const locOriginal = window.location;
beforeAll(() => {
  delete window.location;
  window.location = { href: INICIO, hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' };
});
afterAll(() => { window.location = locOriginal; });
beforeEach(() => {
  criados.length = 0;
  localStorage.clear(); sessionStorage.clear();
  localStorage.setItem('token', 'tokA');
  localStorage.setItem('user', '{"id":3}');
  sessionStorage.setItem('token', 'tokA');
  window.location.href = INICIO;
  jest.isolateModules(() => { mod = require('./chatSocket'); });
});

const limpou = () => {
  expect(localStorage.getItem('token')).toBeNull();
  expect(localStorage.getItem('user')).toBeNull();
  expect(sessionStorage.getItem('token')).toBeNull();
  expect(window.location.href).toBe('/login?sessao_encerrada=1');
};
const naoMexeu = (tok = 'tokA') => {
  expect(localStorage.getItem('token')).toBe(tok);
  expect(localStorage.getItem('user')).toBe('{"id":3}');
  expect(window.location.href).toBe(INICIO);
};

describe('[RN-07] o socket do chat e a sessao encerrada', () => {
  test('sessao_encerrada do servidor: limpa token e usuario e vai para /login?sessao_encerrada=1', () => {
    const s = mod.connectChatSocket();
    expect(criados).toHaveLength(1);
    expect(s.opts.auth).toEqual({ token: 'tokA' }); // metade positiva: o socket nasceu com o token da aba
    s.dispara('sessao_encerrada', ENCERRADA);
    limpou();
  });

  test('connect_error com data.code USUARIO_INATIVO (recusa no handshake): o mesmo', () => {
    const s = mod.connectChatSocket();
    const err = new Error(L11); err.data = { code: 'USUARIO_INATIVO' };
    s.dispara('connect_error', err);
    limpou();
  });

  test('connect_error sem o codigo (token vencido, rede) nao limpa nem redireciona', () => {
    const s = mod.connectChatSocket();
    s.dispara('connect_error', new Error('Token inválido'));
    s.dispara('connect_error', Object.assign(new Error('xhr poll error'), { data: undefined }));
    s.dispara('connect_error', Object.assign(new Error(L11), { data: { code: 'OUTRO' } }));
    naoMexeu();
    expect(handlersDe(s, 'connect_error')).toBe(1); // metade positiva: o handler existe e rodou sem efeito
  });

  test('[F2-I2] o aviso do socket do usuario anterior nao desloga quem entrou depois na mesma aba', () => {
    const s = mod.connectChatSocket();
    localStorage.setItem('token', 'tokB'); // o anterior saiu (sem recarregar) e outro entrou
    s.dispara('sessao_encerrada', ENCERRADA);
    const err = new Error(L11); err.data = { code: 'USUARIO_INATIVO' };
    s.dispara('connect_error', err);
    naoMexeu('tokB');
  });

  test('[F2-I2] token novo na aba: o socket velho e desconectado e nasce outro com o token novo', () => {
    const a = mod.connectChatSocket();
    localStorage.setItem('token', 'tokB');
    sessionStorage.setItem('token', 'tokB');
    const b = mod.connectChatSocket();
    expect(a.disconnect).toHaveBeenCalled();
    expect(criados).toHaveLength(2);
    expect(b).toBe(criados[1]);
    expect(b.opts.auth).toEqual({ token: 'tokB' });
    b.dispara('sessao_encerrada', ENCERRADA); // e o aviso do socket novo vale
    limpou();
  });

  test('[F5 r3 K10] token so no sessionStorage: o aviso tambem limpa e redireciona', () => {
    localStorage.removeItem('token');
    const s = mod.connectChatSocket();
    expect(s.opts.auth).toEqual({ token: 'tokA' });
    s.dispara('sessao_encerrada', ENCERRADA);
    limpou();
  });

  test('[F5 r3 K11] token novo com o socket velho CONECTADO: desconecta o velho e nasce outro', () => {
    const a = mod.connectChatSocket();
    a.connected = true;
    localStorage.setItem('token', 'tokB');
    const b = mod.connectChatSocket();
    expect(a.disconnect).toHaveBeenCalled();
    expect(b).not.toBe(a);
    expect(b.opts.auth).toEqual({ token: 'tokB' });
  });

  describe('[F5 r1] derrubado sem o aviso e a conversa aberta (C274)', () => {
    beforeEach(() => { jest.useFakeTimers(); });
    afterEach(() => { jest.useRealTimers(); });

    test('io server disconnect SEM o aviso: reconecta sozinho em 1 s (o handshake rele a linha)', () => {
      const s = mod.connectChatSocket();
      s.connect.mockClear();
      s.dispara('disconnect', 'io server disconnect');
      jest.advanceTimersByTime(999);
      expect(s.connect).not.toHaveBeenCalled();
      jest.advanceTimersByTime(1);
      expect(s.connect).toHaveBeenCalledTimes(1);
      naoMexeu();
    });

    test('com o aviso antes, nao reconecta; queda pelo client (logout) tambem nao', () => {
      const s = mod.connectChatSocket();
      localStorage.setItem('token', 'outro'); // o aviso e de outra sessao: nao desloga, mas marca a sessao como encerrada
      s.dispara('sessao_encerrada', ENCERRADA);
      s.dispara('disconnect', 'io server disconnect');
      jest.advanceTimersByTime(5000);
      expect(s.connect).not.toHaveBeenCalled();
      const s2 = mod.connectChatSocket();
      s2.connect.mockClear();
      s2.dispara('disconnect', 'io client disconnect');
      s2.dispara('disconnect', 'transport close'); // essa o proprio socket.io reconecta
      jest.advanceTimersByTime(5000);
      expect(s2.connect).not.toHaveBeenCalled();
    });

    test('ao (re)conectar, reentra na conversa aberta; depois de sair dela, nao', () => {
      const s = mod.connectChatSocket();
      mod.joinConversa(7);
      expect(s.emit).toHaveBeenCalledWith('join_conversa', 7);
      s.emit.mockClear();
      s.dispara('connect');
      expect(s.emit).toHaveBeenCalledWith('join_conversa', 7);
      mod.joinConversa(9);
      s.emit.mockClear();
      s.dispara('connect');
      expect(s.emit.mock.calls).toEqual([['join_conversa', 9]]);
      mod.leaveConversa(9);
      s.emit.mockClear();
      s.dispara('connect');
      expect(s.emit).not.toHaveBeenCalledWith('join_conversa', expect.anything());
    });
  });

  test('mesmo token: reusa o socket (nao recria)', () => {
    const a = mod.connectChatSocket();
    const b = mod.connectChatSocket();
    expect(b).toBe(a);
    expect(criados).toHaveLength(1);
    expect(a.connect).toHaveBeenCalled(); // desconectado -> reconecta o mesmo
  });
});

function handlersDe(s, ev) { return (s.handlers[ev] || []).length; }
