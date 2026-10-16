/**
 * Etapa 131 (B842, RN-09) — o usuario desativado ou apagado com o token valido passa a levar 401 `USUARIO_INATIVO` do servidor (o
 * `enrichUserFromDb`). O interceptor de `services/api.js` ja deslogava em qualquer 401; com o 401 novo, limpa o token e o usuario
 * guardados e manda para `/login?sessao_encerrada=1` (aviso proprio — nao expirou). E (Fase 2 I2) o 401 do proprio `/auth/login`
 * (senha errada, o desativado tentando entrar) nao limpa nada nem recarrega: o formulario mostra a frase do servidor. A metade
 * positiva: o 401 de token vencido continua com o aviso de sessao expirada.
 *
 * O axios e mockado so na fabrica (`create`), para capturar o interceptor REAL que o api.js registra.
 */
const capturado = {};
jest.mock('axios', () => {
  const fn = jest.fn();
  fn.interceptors = {
    request: { use: jest.fn() },
    response: { use: jest.fn((ok, ko) => { capturado.ok = ok; capturado.ko = ko; }) },
  };
  return { __esModule: true, default: { create: () => fn, defaults: { headers: { common: {} } } } };
});

const L11 = 'Sessão encerrada — o usuário foi desativado ou removido';
const INICIO = 'http://localhost/almoxarifado';

describe('[RN-09] o 401 de usuario inativo desloga', () => {
  const locOriginal = window.location;
  beforeAll(() => {
    delete window.location;
    window.location = { href: INICIO, hostname: 'localhost', protocol: 'http:', origin: 'http://localhost' };
    require('./api');
  });
  afterAll(() => { window.location = locOriginal; });
  beforeEach(() => {
    localStorage.setItem('token', 't');
    localStorage.setItem('user', '{"id":3}');
    sessionStorage.setItem('token', 't');
    window.location.href = INICIO;
  });

  test('401 USUARIO_INATIVO: limpa token e usuario e vai para /login?sessao_encerrada=1', async () => {
    const erro = { response: { status: 401, data: { error: L11, code: 'USUARIO_INATIVO' } }, config: { url: '/usuarios/comercial' } };
    await expect(capturado.ko(erro)).rejects.toBe(erro);
    expect(localStorage.getItem('token')).toBeNull();
    expect(localStorage.getItem('user')).toBeNull();
    expect(sessionStorage.getItem('token')).toBeNull();
    expect(window.location.href).toBe('/login?sessao_encerrada=1');
  });

  test('a metade positiva: o 401 de token vencido continua com ?sessao_expirada=1', async () => {
    const erro = { response: { status: 401, data: { error: 'Token inválido ou expirado' } }, config: {} };
    await expect(capturado.ko(erro)).rejects.toBe(erro);
    expect(window.location.href).toBe('/login?sessao_expirada=1');
    expect(localStorage.getItem('token')).toBeNull();
    // (Fase 5 r3 N44) o 401 com OUTRO code (o NO_TOKEN do servidor) continua no aviso de sessao expirada — so o USUARIO_INATIVO encerra
    window.location.href = INICIO;
    const semToken = { response: { status: 401, data: { error: 'Token não fornecido', code: 'NO_TOKEN' } }, config: {} };
    await expect(capturado.ko(semToken)).rejects.toBe(semToken);
    expect(window.location.href).toBe('/login?sessao_expirada=1');
  });

  test('[F2-I2] o 401 do proprio /auth/login nao limpa nem recarrega (o formulario mostra a frase do servidor)', async () => {
    for (const url of ['/auth/login', 'http://localhost/api/auth/login']) {
      const erro = { response: { status: 401, data: { error: 'Email ou senha inválidos' } }, config: { url } };
      await expect(capturado.ko(erro)).rejects.toBe(erro);
      expect(window.location.href).toBe(INICIO);
      expect(localStorage.getItem('token')).toBe('t');
    }
    // outra rota que so comeca igual continua deslogando
    const outro = { response: { status: 401, data: { error: 'Token inválido ou expirado' } }, config: { url: '/auth/login-historico' } };
    await expect(capturado.ko(outro)).rejects.toBe(outro);
    expect(window.location.href).toBe('/login?sessao_expirada=1');
  });
});
