/**
 * Período do Dashboard (25/11/2026: "esses filtros devem ser todos anuais, pq agora estamos no fim de 2026, deve resetar em 2027").
 */
import { periodoDoAno, ehPeriodoPadrao, rotuloDoPeriodo, paramsDoPeriodo, atalhosDoPeriodo } from './periodoDashboard';

test('[anual] o padrão é o ano corrente inteiro — e em 2027 passa a ser 2027, sem ninguém mexer', () => {
  expect(periodoDoAno(2026)).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' });
  const fimDe2026 = new Date(2026, 11, 31, 23, 59);
  const comecoDe2027 = new Date(2027, 0, 1, 0, 1);
  expect(ehPeriodoPadrao(periodoDoAno(2026), fimDe2026)).toBe(true);
  expect(ehPeriodoPadrao(periodoDoAno(2026), comecoDe2027)).toBe(false);
  expect(ehPeriodoPadrao(periodoDoAno(2027), comecoDe2027)).toBe(true);
  expect(periodoDoAno()).toEqual(periodoDoAno(new Date().getFullYear()));
});

test('[anual] rótulo do período na tela', () => {
  expect(rotuloDoPeriodo(periodoDoAno(2026))).toBe('Ano 2026');
  expect(rotuloDoPeriodo({ inicio: '', fim: '' })).toBe('Todo o período');
  expect(rotuloDoPeriodo({ inicio: '2026-03-01', fim: '2026-06-30' })).toBe('01/03/2026 a 30/06/2026');
  expect(rotuloDoPeriodo({ inicio: '2026-03-01', fim: '' })).toBe('A partir de 01/03/2026');
  expect(rotuloDoPeriodo({ inicio: '', fim: '2026-06-30' })).toBe('Até 30/06/2026');
});

test('[anual] só vai ao servidor o que está preenchido', () => {
  expect(paramsDoPeriodo({ inicio: '2026-01-01', fim: '2026-12-31', usuario: '' })).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' });
  expect(paramsDoPeriodo({ inicio: '', fim: '', usuario: '7' })).toEqual({ usuario: '7' });
});

test('[anual] atalhos: este mês, 3 meses, este ano, ano passado e todo o período', () => {
  const a = atalhosDoPeriodo(new Date(2026, 10, 25));
  expect(a.map((x) => x.rotulo)).toEqual(['Este mês', 'Últimos 3 meses', 'Ano 2026', 'Ano 2025', 'Todo o período']);
  expect(a[0].intervalo()).toEqual({ inicio: '2026-11-01', fim: '2026-11-25' });
  expect(a[1].intervalo()).toEqual({ inicio: '2026-09-01', fim: '2026-11-25' });
  expect(a[2].intervalo()).toEqual({ inicio: '2026-01-01', fim: '2026-12-31' });
  expect(a[3].intervalo()).toEqual({ inicio: '2025-01-01', fim: '2025-12-31' });
  expect(a[4].intervalo()).toEqual({ inicio: '', fim: '' });
});
