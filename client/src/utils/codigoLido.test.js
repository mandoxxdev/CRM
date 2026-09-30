import { extrairCodigoLido } from './codigoLido';
import { montarEtiquetaLocalizacao } from './etiquetasPdf';

describe('extrairCodigoLido (Etapa 56, RN-03)', () => {
  test('código puro volta sem espaços nas pontas', () => {
    expect(extrairCodigoLido('  COR-A-03 \n')).toBe('COR-A-03');
  });

  test('vazio, só espaços, null e undefined viram string vazia', () => {
    expect(extrairCodigoLido('')).toBe('');
    expect(extrairCodigoLido('   ')).toBe('');
    expect(extrairCodigoLido(null)).toBe('');
    expect(extrairCodigoLido(undefined)).toBe('');
  });

  test('URL da etiqueta: devolve o código decodificado (ida e volta com o montador)', () => {
    const { qrUrl } = montarEtiquetaLocalizacao({ id: 8, codigo: 'A&B#1+2' }, 'https://crm.gmp.ind.br');
    expect(extrairCodigoLido(qrUrl)).toBe('A&B#1+2');
    expect(extrairCodigoLido(`  ${qrUrl}  `)).toBe('A&B#1+2');
  });

  test('URL http válida sem a query codigo: texto cru', () => {
    const u = 'https://crm.gmp.ind.br/almoxarifado/mapa?loc=8';
    expect(extrairCodigoLido(u)).toBe(u);
  });

  test('URL estragada pelo layout de teclado do leitor: texto cru', () => {
    const estragada = 'httpsÇ;;crm.gmp.ind.br;almoxarifado;mapa°loc=8/codigo=COR-A-03';
    expect(extrairCodigoLido(estragada)).toBe(estragada);
  });

  test('código com dois-pontos não é tratado como URL (protocolo não http)', () => {
    expect(extrairCodigoLido('COR:01')).toBe('COR:01');
    expect(extrairCodigoLido('x:?codigo=OUTRO')).toBe('x:?codigo=OUTRO');
  });
});
