/**
 * Etapa 161 (RN-161.05/06, C397) — o dia e a hora locais do navegador.
 *
 * DEPENDE DO FUSO: o cenario das 23h30 so prova algo fora de UTC (em UTC o dia local e o UTC coincidem e a versao errada passaria).
 * A maquina deste projeto e UTC-3; a guarda abaixo DERRUBA o arquivo num processo em UTC em vez de deixa-lo verde provando nada.
 */
import { hojeLocalISO, inicioDoMesLocalISO, agoraLocalParaInput, lerInstanteDoBanco } from './dataLocal';

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
