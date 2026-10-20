/**
 * Etapa 161 (RN-161.05/06, C397) — o dia e a hora locais do navegador.
 *
 * DEPENDE DO FUSO: o cenario das 23h30 so prova algo fora de UTC (em UTC o dia local e o UTC coincidem e a versao errada passaria).
 * A maquina deste projeto e UTC-3; a guarda abaixo DERRUBA o arquivo num processo em UTC em vez de deixa-lo verde provando nada.
 */
import {
  hojeLocalISO, inicioDoMesLocalISO, agoraLocalParaInput, lerInstanteDoBanco, formatarInstanteDoBanco, COM_SEGUNDOS, lerDataDoBanco,
  formatarDataDoBanco,
} from './dataLocal';
// Etapa 168 (RN-168.04, B1071): o do Almoxarifado reexporta o daqui
import formatarDoAlmox, { formatarInstanteDoBanco as formatarDoAlmoxNomeado } from '../components/almoxarifado/instanteDoBanco';

const as2330 = new Date(2026, 9, 19, 23, 30, 0); // 19/10/2026 23:30 LOCAL

test('[guarda de fuso] o processo nao esta em UTC (senao os cenarios abaixo nao provam nada)', () => {
  expect(as2330.getTimezoneOffset()).not.toBe(0);
  // a versao errada daria outro dia, neste fuso, para as 23h30 (UTC-3) ou para a 00h30 (UTC+)
  const errado = [as2330, new Date(2026, 9, 19, 0, 30)].map((d) => d.toISOString().slice(0, 10));
  expect(errado).not.toEqual(['2026-10-19', '2026-10-19']);
});

test('[RN-161.05] hojeLocalISO: o dia local, nao o UTC (as 23h30 ainda e 19/10)', () => {
  expect(hojeLocalISO(as2330)).toBe('2026-10-19');
  expect(hojeLocalISO(new Date(2026, 0, 5, 0, 10))).toBe('2026-01-05');
  expect(hojeLocalISO(new Date(2026, 11, 31, 23, 59))).toBe('2026-12-31');
});

test('[RN-161.05] inicioDoMesLocalISO e agoraLocalParaInput pelo relogio local', () => {
  expect(inicioDoMesLocalISO(new Date(2026, 9, 31, 23, 30))).toBe('2026-10-01');
  expect(inicioDoMesLocalISO(new Date(2026, 10, 1, 0, 5))).toBe('2026-11-01');
  expect(agoraLocalParaInput(as2330)).toBe('2026-10-19T23:30');
  expect(agoraLocalParaInput(new Date(2026, 2, 4, 7, 5))).toBe('2026-03-04T07:05');
});

test('[RN-161.06] lerInstanteDoBanco: o CURRENT_TIMESTAMP do SQLite (sem fuso) e UTC', () => {
  const d = lerInstanteDoBanco('2026-10-20 01:30:00');
  expect(d.toISOString()).toBe('2026-10-20T01:30:00.000Z');
  expect(lerInstanteDoBanco('2026-10-20 01:30').toISOString()).toBe('2026-10-20T01:30:00.000Z');
  expect(lerInstanteDoBanco('2026-10-20T01:30:00.000Z').toISOString()).toBe('2026-10-20T01:30:00.000Z');
  expect(lerInstanteDoBanco('2026-10-19T22:30:00-03:00').toISOString()).toBe('2026-10-20T01:30:00.000Z');
  expect(lerInstanteDoBanco(new Date(Date.UTC(2026, 9, 20, 1, 30))).toISOString()).toBe('2026-10-20T01:30:00.000Z');
  for (const v of [null, undefined, '', 'lixo', 42, {}]) expect(lerInstanteDoBanco(v)).toBeNull();
});

test('[guarda de fuso, 168] o fuso desta suite e o de Brasilia (a 01h30 UTC e 22h30 da vespera)', () => {
  expect(new Date('2026-10-21T01:30:00Z').getDate()).toBe(20);
  expect(new Date('2026-10-21T01:30:00Z').getHours()).toBe(22);
});

test('[RN-168.01] formatarInstanteDoBanco: o CURRENT_TIMESTAMP no relogio de Brasilia, o texto igual ao de cada tela', () => {
  const v = '2026-10-21 01:30:05';
  expect(formatarInstanteDoBanco(v)).toBe('20/10/2026'); // o toLocaleDateString sem opcoes (antes 21/10/2026)
  expect(formatarInstanteDoBanco(v, COM_SEGUNDOS)).toBe('20/10/2026, 22:30:05'); // o toLocaleString sem opcoes (antes 21/10/2026, 01:30:05)
  expect(formatarInstanteDoBanco(v, COM_SEGUNDOS)).toBe(new Date('2026-10-21T01:30:05Z').toLocaleString('pt-BR'));
  expect(formatarInstanteDoBanco(v, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })).toBe('20/10/2026, 22:30');
  expect(formatarInstanteDoBanco('2026-10-21T01:30:05.000Z', COM_SEGUNDOS)).toBe('20/10/2026, 22:30:05'); // ISO com Z como esta
  // Fase 2 I2: dia, mes e hora de um algarismo — com 'numeric' sairia 5/01/2026, 8:04:05
  expect(formatarInstanteDoBanco('2026-01-05 11:04:05', COM_SEGUNDOS)).toBe('05/01/2026, 08:04:05');
  expect(formatarInstanteDoBanco('2026-01-05 11:04:05', COM_SEGUNDOS)).toBe(new Date('2026-01-05T11:04:05Z').toLocaleString('pt-BR'));
  expect(Object.isFrozen(COM_SEGUNDOS)).toBe(true);
});

test('[RN-168.02] vazio -> o vazio pedido; ilegivel -> o texto gravado', () => {
  for (const v of [null, undefined, '']) {
    expect(formatarInstanteDoBanco(v)).toBe('—');
    expect(formatarInstanteDoBanco(v, COM_SEGUNDOS, '')).toBe('');
  }
  expect(formatarInstanteDoBanco('lixo', COM_SEGUNDOS)).toBe('lixo');
  expect(formatarInstanteDoBanco('2026-10-21 01:30:05', undefined, '')).toBe('20/10/2026'); // metade positiva com o vazio ''
});

test('[RN-168.04] o do Almoxarifado e a mesma funcao', () => {
  expect(formatarDoAlmox).toBe(formatarInstanteDoBanco);
  expect(formatarDoAlmoxNomeado).toBe(formatarInstanteDoBanco);
});

test('[Etapa 169, Fase 5 r1 M1] soData: o texto que nao comeca por AAAA-MM-DD e ilegivel (o new Date leniente lia a vespera)', () => {
  for (const v of ['2026-10', '2026', 'sexta 10', '20/10/2026', 'lixo']) {
    expect(lerDataDoBanco(v, { soData: true })).toBeNull();
    expect(formatarDataDoBanco(v, '-', { soData: true })).toBe('-');
  }
  // metade positiva: o prefixo continua valendo, com e sem hora
  expect(formatarDataDoBanco('2026-10-20', '-', { soData: true })).toBe('20/10/2026');
  expect(formatarDataDoBanco('2026-10-20T02:00:00.000Z', '-', { soData: true })).toBe('20/10/2026');
  expect(formatarDataDoBanco('2026-10-20 23:00:00', '-', { soData: true })).toBe('20/10/2026');
  // sem soData nada muda: o instante do banco continua lido como UTC
  expect(formatarDataDoBanco('2026-10-21 01:30:00', '-')).toBe('20/10/2026');
});
