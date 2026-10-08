/**
 * `resolveUploadAssinadoUrl` — Etapa 82 (RN-82.04/05).
 *
 * Fotos da proposta e avatares passaram a exigir assinatura. O client usa a URL que a API devolve
 * (`url` / `foto_src`) e só compõe a origem quando a base da API é absoluta — sem `/api/api`.
 */
import api from '../services/api';
import {
  resolveFotoPropostaUrl, resolveAvatarUrl, resolverUrlAssinada, PREFIXO_AVATAR,
} from './resolveUploadAssinadoUrl';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' } },
}));

const FOTO = '/api/uploads/proposta-fotos/foto_1_x.png?exp=99999999999&sig=0123456789abcdef0123456789abcdef';
const AVATAR = '/api/uploads/avatares/avatar_7_1.png?exp=99999999999&sig=0123456789abcdef0123456789abcdef';

beforeEach(() => { api.defaults.baseURL = '/api'; });

test('base relativa: a URL assinada passa intacta, com a query', () => {
  expect(resolveFotoPropostaUrl(FOTO)).toBe(FOTO);
  expect(resolveAvatarUrl(AVATAR)).toBe(AVATAR);
});

test('base absoluta: prefixa SO a origem (nunca /api/api) e preserva a query', () => {
  api.defaults.baseURL = 'https://crm.exemplo.com/api';
  expect(resolveFotoPropostaUrl(FOTO)).toBe(`https://crm.exemplo.com${FOTO}`);
  api.defaults.baseURL = 'http://10.0.0.5:5000/api/';
  expect(resolveAvatarUrl(AVATAR)).toBe(`http://10.0.0.5:5000${AVATAR}`);
  expect(resolveAvatarUrl(AVATAR)).not.toMatch(/\/api\/api\//);
});

test('nome cru (foto_url/arquivo) e caminho de outra pasta viram "" — nada de endereco fabricado', () => {
  expect(resolveAvatarUrl('avatar_7_1.png')).toBe('');
  expect(resolveFotoPropostaUrl('foto_1_x.png')).toBe('');
  expect(resolveAvatarUrl(FOTO)).toBe('');
  expect(resolveFotoPropostaUrl(AVATAR)).toBe('');
  expect(resolveAvatarUrl('/uploads/avatares/a.png')).toBe('');
});

test('vazio/nulo -> ""; blob/data/https passam direto', () => {
  for (const v of [null, undefined, '', '   ', 0, false]) expect(resolveAvatarUrl(v)).toBe('');
  expect(resolveFotoPropostaUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
  expect(resolverUrlAssinada('blob:http://x/1', PREFIXO_AVATAR)).toBe('blob:http://x/1');
});
