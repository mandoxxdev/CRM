/**
 * RN-01 — Scanner so navega para caminho /almoxarifado/...; qualquer outro conteudo
 * e exibido, nunca navegado (parseQrDestino devolve null).
 *
 * Achado da revisao do plano (C3): new URL('javascript:alert(1)') faz parse SEM lancar —
 * o parse NAO filtra protocolo. O cenario com javascript: e o controle de que a
 * implementacao filtra ['http:','https:'] explicitamente.
 *
 * Executar: cd client && CI=true npx react-scripts test scannerDestino --watchAll=false
 */
import { parseQrDestino } from './scannerDestino';

const ORIGIN = 'https://crm.gmpindustriais.com.br';

describe('parseQrDestino (RN-01)', () => {
  test('URL do mesmo origin com caminho /almoxarifado devolve path + query', () => {
    expect(
      parseQrDestino(`${ORIGIN}/almoxarifado/lotes?material_id=3&aba=LOTES&lote=L1`, ORIGIN)
    ).toBe('/almoxarifado/lotes?material_id=3&aba=LOTES&lote=L1');
  });

  test('origin ALHEIO com path do modulo devolve o mesmo resultado (etiqueta de outro ambiente)', () => {
    expect(
      parseQrDestino('http://localhost:3000/almoxarifado/lotes?material_id=3&aba=LOTES&lote=L1', ORIGIN)
    ).toBe('/almoxarifado/lotes?material_id=3&aba=LOTES&lote=L1');
  });

  test('URL http/https fora do modulo nao navega', () => {
    expect(parseQrDestino('https://evil.com/phishing', ORIGIN)).toBeNull();
    expect(parseQrDestino(`${ORIGIN}/clientes`, ORIGIN)).toBeNull();
  });

  test('javascript: nao navega (controle do filtro explicito de protocolo)', () => {
    expect(parseQrDestino('javascript:alert(1)', ORIGIN)).toBeNull();
  });

  test('protocolo nao-http com path do modulo nao navega', () => {
    // new URL parseia sem lancar; so o filtro explicito de protocolo barra
    expect(parseQrDestino('ftp://host/almoxarifado/lotes', ORIGIN)).toBeNull();
  });

  test('texto solto, vazio e nao-string devolvem null', () => {
    expect(parseQrDestino('texto solto', ORIGIN)).toBeNull();
    expect(parseQrDestino('', ORIGIN)).toBeNull();
    expect(parseQrDestino(null, ORIGIN)).toBeNull();
    expect(parseQrDestino(undefined, ORIGIN)).toBeNull();
  });

  test('query preservada byte a byte (encoding intacto)', () => {
    const query = '?codigo=ABC%20123&obs=a%2Bb&x=1';
    expect(parseQrDestino(`${ORIGIN}/almoxarifado/materiais${query}`, ORIGIN)).toBe(
      `/almoxarifado/materiais${query}`
    );
  });

  test('caminho raiz do modulo sem query tambem navega', () => {
    expect(parseQrDestino(`${ORIGIN}/almoxarifado`, ORIGIN)).toBe('/almoxarifado');
  });

  test('prefixo SEM barra nao navega (achado Important da revisao da etapa)', () => {
    // startsWith('/almoxarifado') sozinho deixava tudo isso passar — e o App nao tem
    // rota catch-all na raiz, entao navegar para esses paths dava tela branca.
    expect(parseQrDestino('https://x.com/almoxarifado-admin/dump', ORIGIN)).toBeNull();
    expect(parseQrDestino('https://x.com/almoxarifadoX/foo', ORIGIN)).toBeNull();
    expect(parseQrDestino('https://x.com/almoxarifado%2F..%2Fadmin', ORIGIN)).toBeNull();
  });
});
