/**
 * Mascara de telefone — 27/07/2026.
 *
 * O campo do cadastro era texto livre: o telefone so aparecia formatado depois, na proposta.
 * Por isso o banco acumulou "67998420146", "21 99723-1500", "(11) 9.6406-3306" e
 * "7999192-0940" para o mesmo tipo de dado. A mascara passou a rodar a cada tecla.
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/telefone.test.js --watchAll=false
 */
import { mascararTelefoneDigitando, mascararTelefoneCompleto } from './telefone';

describe('mascararTelefoneDigitando (a cada tecla)', () => {
  test('acompanha a digitacao de um celular, digito a digito', () => {
    // Simula o usuario digitando "11988887777": cada passo e o valor que o input mostra.
    const digitados = '11988887777'.split('');
    const vistos = [];
    let campo = '';
    digitados.forEach((tecla) => {
      campo = mascararTelefoneDigitando(campo + tecla);
      vistos.push(campo);
    });
    // O hifen NAO pode pular de lugar no meio do caminho: como o 3o digito e 9, a mascara ja
    // sabe que e celular e corta em 5-4 desde o inicio.
    expect(vistos).toEqual([
      '(1',
      '(11',
      '(11) 9',
      '(11) 98',
      '(11) 988',
      '(11) 9888',
      '(11) 98888',
      '(11) 98888-7',
      '(11) 98888-77',
      '(11) 98888-777',
      '(11) 98888-7777',
    ]);
  });

  test('12o digito nao entra: celular tem 11', () => {
    expect(mascararTelefoneDigitando('119888877779')).toBe('(11) 98888-7777');
  });

  test('fixo de 10 digitos usa (XX) XXXX-XXXX', () => {
    expect(mascararTelefoneDigitando('1129145011')).toBe('(11) 2914-5011');
  });

  test('fixo e celular sao distinguidos pelo digito seguinte ao DDD', () => {
    expect(mascararTelefoneDigitando('11988887777')).toBe('(11) 98888-7777'); // 9 -> celular
    expect(mascararTelefoneDigitando('1129145011')).toBe('(11) 2914-5011');   // 2 -> fixo
  });

  test('apagar reformata em vez de travar, e o hifen fica parado', () => {
    // Usuario apaga do fim: o campo tem de continuar coerente a cada passo, e o hifen
    // permanece na mesma posicao porque o tipo do numero nao mudou.
    let campo = '(11) 98888-7777';
    const passos = [];
    for (let i = 0; i < 5; i++) {
      campo = mascararTelefoneDigitando(campo.slice(0, -1));
      passos.push(campo);
    }
    expect(passos).toEqual([
      '(11) 98888-777',
      '(11) 98888-77',
      '(11) 98888-7',
      '(11) 98888',
      '(11) 9888',
    ]);
  });

  test('ignora o que o usuario digitar que nao for digito', () => {
    expect(mascararTelefoneDigitando('abc11def98888ghi7777')).toBe('(11) 98888-7777');
  });

  test('campo vazio nao vira "("', () => {
    expect(mascararTelefoneDigitando('')).toBe('');
    expect(mascararTelefoneDigitando(null)).toBe('');
    expect(mascararTelefoneDigitando('abc')).toBe('');
  });
});

describe('mascararTelefoneCompleto (valor ja pronto)', () => {
  test('formatos REAIS encontrados no banco', () => {
    expect(mascararTelefoneCompleto('67998420146')).toBe('(67) 99842-0146');
    expect(mascararTelefoneCompleto('3598737467')).toBe('(35) 9873-7467');
    expect(mascararTelefoneCompleto('21 99723-1500')).toBe('(21) 99723-1500');
    expect(mascararTelefoneCompleto('(11) 9.6406-3306')).toBe('(11) 96406-3306');
    expect(mascararTelefoneCompleto('7999192-0940')).toBe('(79) 99192-0940');
    expect(mascararTelefoneCompleto('(27) 98182-5530')).toBe('(27) 98182-5530');
  });

  test('entende e descarta o +55', () => {
    expect(mascararTelefoneCompleto('5511988887777')).toBe('(11) 98888-7777');
  });

  test('quantidade de digitos desconhecida devolve o ORIGINAL, sem truncar', () => {
    // Ao contrario da versao progressiva, esta NAO corta em 11: truncar um valor ja gravado
    // inventaria um numero diferente do que o usuario cadastrou.
    ['1129145011 r. 24', '+1 415 555 2671', '1234', 'contato pelo whatsapp'].forEach((v) => {
      expect(mascararTelefoneCompleto(v)).toBe(v);
    });
  });

  test('nenhum digito e perdido quando o valor e preservado', () => {
    const v = '1129145011 r. 24';
    expect(mascararTelefoneCompleto(v).replace(/\D/g, '')).toBe(v.replace(/\D/g, ''));
  });

  test('vazio continua vazio', () => {
    expect(mascararTelefoneCompleto('')).toBe('');
    expect(mascararTelefoneCompleto(null)).toBe('');
  });
});
