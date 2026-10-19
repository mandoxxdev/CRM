/**
 * Etapa 160 (RN-160.06, RN-160.08; T4) — as duas funções do client: a busca no navegador e a opção do select que casa com o gravado.
 */
import { normalizarBusca, casaBusca } from './buscaNoNavegador';
import { opcaoQueCasa, precisaOpcaoAMais } from './opcaoDoSelect';

describe('normalizarBusca / casaBusca (RN-160.06)', () => {
  test('a forma: texto composto, aparado, em minúsculas; nulo e não texto viram vazio; número vira o texto dele', () => {
    expect(normalizarBusca('  SÃO José ')).toBe('são josé');
    expect(normalizarBusca('são')).toBe('são');
    expect(normalizarBusca(null)).toBe('');
    expect(normalizarBusca(undefined)).toBe('');
    expect(normalizarBusca(['são'])).toBe('');
    expect(normalizarBusca({ a: 1 })).toBe('');
    expect(normalizarBusca(160)).toBe('160');
  });

  test('o termo vazio, só de espaços ou não texto casa tudo; o termo acha o valor gravado em maiúsculas com acento, aparado', () => {
    for (const nada of ['', '   ', null, undefined, ['x']]) expect(casaBusca(nada, 'qualquer')).toBe(true);
    expect(casaBusca('joão ', 'JOÃO DA SILVA')).toBe(true);
    expect(casaBusca(' Válvula', 'VÁLVULA ESFERA')).toBe(true);
    expect(casaBusca('ção', null, undefined, 'CALIBRAÇÃO')).toBe(true);
    expect(casaBusca('MAT-1', 'mat-160')).toBe(true);
    expect(casaBusca(16, 'OS-160')).toBe(true);
  });

  test('a metade negativa: sem par não casa; o acento conta (B1013); valor nulo não quebra', () => {
    expect(casaBusca('joão', 'MARIA', null)).toBe(false);
    expect(casaBusca('sao', 'SÃO PAULO')).toBe(false);
    expect(casaBusca('abc', null, undefined)).toBe(false);
  });
});

describe('opcaoQueCasa (RN-160.08)', () => {
  const SEG = ['Tintas & Vernizes', 'Químico', 'Cosméticos', 'Outros'];
  test('o gravado em maiúsculas casa com a opção de outra caixa; espaço nas pontas e a forma decomposta também', () => {
    expect(opcaoQueCasa('COSMÉTICOS', SEG)).toBe('Cosméticos');
    expect(opcaoQueCasa(' químico ', SEG)).toBe('Químico');
    expect(opcaoQueCasa('COSMÉTICOS', SEG)).toBe('Cosméticos');
    expect(opcaoQueCasa('ALTA', ['baixa', 'normal', 'alta', 'urgente'])).toBe('alta');
    expect(opcaoQueCasa('MANUTENCAO', ['fabricacao', 'manutencao'])).toBe('manutencao');
  });
  test('nenhuma casa: o gravado como veio (a opção a mais); nulo, vazio ou só espaços: vazio', () => {
    expect(opcaoQueCasa('INDÚSTRIA PESADA', SEG)).toBe('INDÚSTRIA PESADA');
    for (const nada of [null, undefined, '', '   ', ['x']]) expect(opcaoQueCasa(nada, SEG)).toBe('');
    expect(precisaOpcaoAMais('INDÚSTRIA PESADA', SEG)).toBe(true);
    expect(precisaOpcaoAMais('Cosméticos', SEG)).toBe(false);
    expect(precisaOpcaoAMais('', SEG)).toBe(false);
  });
});
