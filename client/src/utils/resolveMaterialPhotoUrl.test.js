/**
 * `resolveMaterialPhotoUrl` — Etapa 33 (furo C42).
 *
 * O helper deixou de montar endereço a partir de nome de arquivo. Estes cenários existem para que
 * ninguém o "conserte" de volta: uma URL remontada aqui não teria assinatura e responderia 404,
 * quebrando a imagem em silêncio — sem erro, sem log, sem ninguém saber por quê.
 */
import api from '../services/api';
import { resolveMaterialPhotoUrl } from './resolveMaterialPhotoUrl';

jest.mock('../services/api', () => ({
  __esModule: true,
  default: { defaults: { baseURL: '/api' } },
}));

const ASSINADA = '/api/uploads/almoxarifado/material-1.png?exp=99999999999&sig=abc123def456abc123def456abc12345';

beforeEach(() => { api.defaults.baseURL = '/api'; });

describe('resolveMaterialPhotoUrl', () => {
  test('URL assinada do servidor passa INTACTA, com a query preservada', () => {
    // A metade que mais importa: cortar a query aqui devolveria uma URL sem assinatura, que o
    // servidor recusa com 404 — e a tela mostraria imagem quebrada sem nenhum erro no console.
    expect(resolveMaterialPhotoUrl(ASSINADA)).toBe(ASSINADA);
  });

  test('nome de arquivo cru vira STRING VAZIA — nao um endereco fabricado', () => {
    // Antes da Etapa 33 estes três devolviam `/api/uploads/almoxarifado/<nome>`. Aquele endereço
    // hoje responde 404, então fabricá-lo troca "sem foto" por "foto quebrada": o mesmo resultado
    // visual, mas impossível de rastrear. `''` é ausência explícita, e o teste consegue ancorá-la.
    expect(resolveMaterialPhotoUrl('material-1.png')).toBe('');
    expect(resolveMaterialPhotoUrl('/uploads/almoxarifado/material-1.png')).toBe('');
    expect(resolveMaterialPhotoUrl('uploads/almoxarifado/material-1.png')).toBe('');
  });

  test('vazio, nulo e espaço em branco continuam devolvendo string vazia', () => {
    for (const v of [null, undefined, '', '   ', 0, false]) {
      expect(resolveMaterialPhotoUrl(v)).toBe('');
    }
  });

  test('blob e data URL passam direto — sao do proprio browser, nao do servidor', () => {
    // É o preview do upload ANTES de enviar: não existe arquivo no servidor para assinar.
    expect(resolveMaterialPhotoUrl('blob:http://localhost/abc')).toBe('blob:http://localhost/abc');
    expect(resolveMaterialPhotoUrl('data:image/png;base64,AAA')).toBe('data:image/png;base64,AAA');
    expect(resolveMaterialPhotoUrl('https://cdn.exemplo/x.png')).toBe('https://cdn.exemplo/x.png');
  });

  test('com API em outro host, a origem e prefixada E a query sobrevive', () => {
    // Este bloco quase foi removido junto com a remontagem. Sem ele, num deploy com
    // REACT_APP_API_URL cross-origin a URL resolveria contra a origem do CLIENT, não da API.
    api.defaults.baseURL = 'https://api.exemplo/api';
    expect(resolveMaterialPhotoUrl(ASSINADA)).toBe(`https://api.exemplo${ASSINADA}`);
    // E o nome cru continua vazio mesmo com host absoluto — não é o prefixo que decide.
    expect(resolveMaterialPhotoUrl('material-1.png')).toBe('');
  });
});
