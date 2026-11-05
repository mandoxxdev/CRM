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
const LOTE_AUTOMATICO = " Na entrega, o resto sai do lote que vence primeiro; para tirar de outro lote, escolha-o no 'Sai de'.";
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

// Etapa 197 (T1, C462, RN-197.12): as três frases diziam "separar de outro endereço troca a origem da separação (a entrega passa a sair
// automática)" — regra revogada pela 196 (B1314: a parte separada da origem continua saindo dela). E o "escolha o lote" só continua
// verdade para material SEM controle de lote; com controle, o automático da entrega baixa do lote que vence primeiro (RN-197.01).
const NENHUM = (q) => `Nenhum endereço tem tudo: pegue ${q} aqui. Se o resto for separado depois de outro endereço, o que sair daqui `
  + 'continua saindo daqui na entrega.';
const NAO_COBRE = (cod) => `Já separado de ${cod}: o resto não cabe lá. O que já foi separado continua saindo de lá; o resto, separado `
  + 'de outro endereço, sai no automático na entrega.';
const INDISPONIVEL = (cod) => `Já separado de ${cod}, que não pode mais ser sugerido (endereço bloqueado ou inativo, em área especial ou `
  + 'lote bloqueado/vencido). Confira antes de separar o resto: na entrega, o que já foi separado sai de lá — se lá não servir mais, a '
  + 'entrega pede para escolher de onde sai.';

describe('[C462] as frases do aviso (a 188 com a regra da 196 e o lote da 197)', () => {
  test('nenhuma frase diz mais que separar de outro endereço troca a origem', () => {
    const frases = [
      item({ pegar_em: pegar({ cobre: false }), pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' }),
      item({ origem_separacao_codigo: 'A-01', pegar_em_aviso: 'PLANEJADA_NAO_COBRE' }),
      item({ origem_separacao_codigo: 'A-01', lote_separacao_codigo: 'L1', pegar_em_aviso: 'PLANEJADA_INDISPONIVEL', controle_lote: true }),
    ].map(textoAvisoPegarEm);
    frases.forEach((f) => { expect(f).not.toMatch(/troca a origem|passa a sair automática/); });
  });
  test('[RN-188.08] NENHUM_ENDERECO_COBRE sem lote', () => {
    expect(textoAvisoPegarEm(item({ pegar_em: pegar({ ...SEM_LOTE, quantidade_sugerida: 6, cobre: false }),
      pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' }))).toBe(NENHUM(6));
  });
  test('[RN-197.12] NENHUM_ENDERECO_COBRE com lote e controle de lote -> "sai do lote que vence primeiro"', () => {
    expect(textoAvisoPegarEm(item({ controle_lote: true, pegar_em: pegar({ quantidade_sugerida: 6, cobre: false }),
      pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' }))).toBe(`${NENHUM(6)}${LOTE_AUTOMATICO}`);
  });
  test('[I-b] NENHUM_ENDERECO_COBRE com lote SEM controle de lote mantém "escolha o lote"', () => {
    expect(textoAvisoPegarEm(item({ controle_lote: false, pegar_em: pegar({ quantidade_sugerida: 6, cobre: false }),
      pegar_em_aviso: 'NENHUM_ENDERECO_COBRE' }))).toBe(`${NENHUM(6)}${ESCOLHA_O_LOTE}`);
  });
  test('[RN-188.08] PLANEJADA_NAO_COBRE sem lote, com e sem pegar_em', () => {
    expect(textoAvisoPegarEm(item({ origem_separacao_codigo: 'A-01', pegar_em_aviso: 'PLANEJADA_NAO_COBRE' }))).toBe(NAO_COBRE('A-01'));
    expect(textoAvisoPegarEm(item({ pegar_em: pegar({ localizacao_codigo: 'A-01', ...SEM_LOTE }), pegar_em_aviso: 'PLANEJADA_NAO_COBRE' })))
      .toBe(NAO_COBRE('A-01'));
  });
  test('[RN-197.12] PLANEJADA_NAO_COBRE com lote: com controle -> lote que vence primeiro; sem -> escolha o lote', () => {
    const base = { origem_separacao_codigo: 'ZSA-01', lote_separacao_codigo: 'L1', pegar_em_aviso: 'PLANEJADA_NAO_COBRE' };
    expect(textoAvisoPegarEm(item({ ...base, controle_lote: true }))).toBe(`${NAO_COBRE('ZSA-01 — lote L1')}${LOTE_AUTOMATICO}`);
    expect(textoAvisoPegarEm(item({ ...base, controle_lote: false }))).toBe(`${NAO_COBRE('ZSA-01 — lote L1')}${ESCOLHA_O_LOTE}`);
  });
  test('[M-d] PLANEJADA_INDISPONIVEL sem lote, e com lote com e sem controle', () => {
    expect(textoAvisoPegarEm(item({ origem_separacao_codigo: 'ZB-01', pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' })))
      .toBe(INDISPONIVEL('ZB-01'));
    const base = { origem_separacao_codigo: 'ZB-02', lote_separacao_codigo: 'L9', pegar_em_aviso: 'PLANEJADA_INDISPONIVEL' };
    expect(textoAvisoPegarEm(item({ ...base, controle_lote: true }))).toBe(`${INDISPONIVEL('ZB-02 — lote L9')}${LOTE_AUTOMATICO}`);
    expect(textoAvisoPegarEm(item({ ...base, controle_lote: false }))).toBe(`${INDISPONIVEL('ZB-02 — lote L9')}${ESCOLHA_O_LOTE}`);
  });
  test('sem lote nenhum, controle_lote não acrescenta sufixo', () => {
    expect(textoAvisoPegarEm(item({ controle_lote: true, origem_separacao_codigo: 'A-01', pegar_em_aviso: 'PLANEJADA_NAO_COBRE' })))
      .toBe(NAO_COBRE('A-01'));
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
