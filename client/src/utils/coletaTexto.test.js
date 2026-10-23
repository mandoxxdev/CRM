/**
 * Etapa 189 (T3, B1268) — as frases da dica de coleta, puras. Cópia das asserções da 188 (FilaSeparacao.test.js: RN-188.08, I-a, I-b,
 * M-d) contra as funções, mais o fim da RN-189.09 por `cobre` (e a exceção M2 da Fase 2 da 189).
 *
 * Executar: cd client && CI=true npx react-scripts test src/utils/coletaTexto --watchAll=false
 */
import {
  textoPegarEm, textoAvisoPegarEm, textoAlertaPegarEm, fmtQtd, fmtData,
} from './coletaTexto';
import * as daFila from '../components/almoxarifado/FilaSeparacao';

const JA_VEM = " — já vem escolhido no 'Sai de' ao separar";
const ESCOLHA = " — escolha este endereço no 'Sai de' ao separar";
const ESCOLHA_O_LOTE = " Na entrega, escolha o lote no 'Sai de': a saída automática não escolhe lote.";
const item = (over = {}) => ({
  item_id: 1, unidade: 'PC', a_separar: 5, separavel: 5, a_entregar: 0, origem_separacao_codigo: null, lote_separacao_codigo: null,
  pegar_em: null, pegar_em_aviso: null, pegar_em_alerta: null, ...over,
});
const pegar = (over = {}) => ({
  localizacao_id: 12, localizacao_codigo: 'A-03', caminho: 'ALM1 / A-01 / A-03', lote_id: 7, lote_codigo: 'L7',
  lote_validade: '2026-11-10', quantidade_no_endereco: 6, quantidade_sugerida: 5, cobre: true, ...over,
});
const SEM_LOTE = { lote_id: null, lote_codigo: null, lote_validade: null };

test('[B1268] FilaSeparacao re-exporta as mesmas funções', () => {
  expect(daFila.textoPegarEm).toBe(textoPegarEm);
  expect(daFila.textoAvisoPegarEm).toBe(textoAvisoPegarEm);
  expect(daFila.textoAlertaPegarEm).toBe(textoAlertaPegarEm);
});

test('fmtQtd e fmtData: pt-BR até 3 casas; a data sem passar por Date', () => {
  expect(fmtQtd(1234.5678)).toBe('1.234,568');
  expect(fmtQtd('x')).toBe('0');
  expect(fmtData('2026-11-10')).toBe('10/11/2026');
  expect(fmtData(null)).toBeNull();
});

describe('[RN-189.09, B1265] o fim de textoPegarEm segue a pré-seleção da janela', () => {
  test('cobre: true -> "já vem escolhido no Sai de"', () => {
    expect(textoPegarEm(item({ pegar_em: pegar() })))
      .toBe(`Pegar em A-03 (ALM1 / A-01 / A-03) — lote L7 (vence 10/11/2026) · 5 PC${JA_VEM}`);
  });
  test('cobre: false -> continua "escolha este endereço"', () => {
    expect(textoPegarEm(item({ pegar_em: pegar({ ...SEM_LOTE, localizacao_codigo: 'B-02', caminho: 'B-02', cobre: false,
      quantidade_sugerida: 3 }) }))).toBe(`Pegar em B-02 · 3 PC${ESCOLHA}`);
  });
  test('[M2] cobre: true com separado pendente SEM planejada -> "escolha este endereço" (a janela não pré-seleciona)', () => {
    expect(textoPegarEm(item({ a_entregar: 2, pegar_em: pegar({ ...SEM_LOTE, caminho: 'A-03' }) }))).toBe(`Pegar em A-03 · 5 PC${ESCOLHA}`);
  });
  test('cobre: true com a planejada (a regra da 65 parte dela) -> "já vem escolhido"', () => {
    expect(textoPegarEm(item({ a_entregar: 2, origem_separacao_codigo: 'A-03', pegar_em: pegar({ ...SEM_LOTE, caminho: 'A-03' }) })))
      .toBe(`Pegar em A-03 · 5 PC${JA_VEM}`);
  });
  test('sem pegar_em -> null', () => {
    expect(textoPegarEm(item())).toBeNull();
  });
});

describe('as frases da 188, iguais (cópia de FilaSeparacao.test.js)', () => {
  test('[RN-188.08] NENHUM_ENDERECO_COBRE sem lote', () => {
    expect(textoAvisoPegarEm(item({ pegar_em: pegar({ ...SEM_LOTE, quantidade_sugerida: 6, cobre: false }),
      pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' })))
      .toBe('Nenhum endereço tem tudo: pegue 6 aqui. Separar o resto de outro endereço depois troca a origem da separação.');
  });
  test('[I-b] NENHUM_ENDERECO_COBRE com lote ganha o "escolha o lote"', () => {
    expect(textoAvisoPegarEm(item({ pegar_em: pegar({ quantidade_sugerida: 6, cobre: false }), pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' })))
      .toBe(`Nenhum endereço tem tudo: pegue 6 aqui. Separar o resto de outro endereço depois troca a origem da separação.${ESCOLHA_O_LOTE}`);
  });
  test('[RN-188.08] PLANEJADA_NAO_COBRE sem lote, com e sem pegar_em', () => {
    const frase = 'Já separado de A-01: o resto não cabe lá. Separar de outro endereço troca a origem da separação '
      + '(a entrega passa a sair automática).';
    expect(textoAvisoPegarEm(item({ origem_separacao_codigo: 'A-01', pegar_em_aviso: 'PLANEJADA_NAO_COBRE' }))).toBe(frase);
    expect(textoAvisoPegarEm(item({ pegar_em: pegar({ localizacao_codigo: 'A-01', ...SEM_LOTE }), pegar_em_aviso: 'PLANEJADA_NAO_COBRE' })))
      .toBe(frase);
  });
  test('[I-b] PLANEJADA_NAO_COBRE com lote', () => {
    expect(textoAvisoPegarEm(item({ origem_separacao_codigo: 'ZSA-01', lote_separacao_codigo: 'L1', pegar_em_aviso: 'PLANEJADA_NAO_COBRE' })))
      .toBe(`Já separado de ZSA-01 — lote L1: o resto não cabe lá. Separar de outro endereço troca a origem da separação.${ESCOLHA_O_LOTE}`);
  });
  test('[M-d] PLANEJADA_INDISPONIVEL com e sem lote', () => {
    const meio = ', que não pode mais ser sugerido (endereço bloqueado ou inativo, em área especial ou lote bloqueado/vencido). '
      + 'Confira antes de separar o resto: separar de outro endereço troca a origem da separação';
    expect(textoAvisoPegarEm(item({ origem_separacao_codigo: 'ZB-01', pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' })))
      .toBe(`Já separado de ZB-01${meio} (a entrega passa a sair automática).`);
    expect(textoAvisoPegarEm(item({ origem_separacao_codigo: 'ZB-02', lote_separacao_codigo: 'L9', pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' })))
      .toBe(`Já separado de ZB-02 — lote L9${meio}.${ESCOLHA_O_LOTE}`);
  });
  test('[RN-188.08] SEM_ENDERECO_SUGERIVEL e sem aviso', () => {
    expect(textoAvisoPegarEm(item({ pegar_em_aviso: 'SEM_ENDERECO_SUGERIVEL' }))).toBe('Sem endereço para sugerir (o saldo está sem '
      + 'endereço, em endereço bloqueado ou inativo, em área especial ou em lote bloqueado/vencido).');
    expect(textoAvisoPegarEm(item())).toBeNull();
  });
  test('[I-a] RETENCAO_NO_MATERIAL só com pegar_em', () => {
    expect(textoAlertaPegarEm(item({ pegar_em: pegar(), pegar_em_alerta: 'RETENCAO_NO_MATERIAL' }))).toBe('Parte do saldo deste material '
      + 'está retida (em inspeção, bloqueada ou em terceiros) e o sistema não sabe em qual endereço — confira antes de pegar.');
    expect(textoAlertaPegarEm(item({ pegar_em_alerta: 'RETENCAO_NO_MATERIAL' }))).toBeNull();
    expect(textoAlertaPegarEm(item({ pegar_em: pegar() }))).toBeNull();
  });
});
