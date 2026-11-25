/**
 * Valor da proposta na moeda dela (25/11/2026: "essa proposta eu coloquei em dólar e aqui está em real").
 */
import { valorDaProposta, moedaDaProposta, rotuloDaCotacao } from './valorDaProposta';

const nbsp = (s) => String(s).replace(/ /g, ' ');

test('[moeda] real: como antes, sem linha em reais', () => {
  expect(nbsp(valorDaProposta({ valor_total: 23550 }).principal)).toBe('R$ 23.550,00');
  expect(valorDaProposta({ valor_total: 23550, moeda: 'BRL' }).emReais).toBeNull();
});

test('[moeda] dólar e euro: na moeda da proposta, com o valor em reais pela cotação dela', () => {
  const usd = valorDaProposta({ valor_total: 23550, moeda: 'USD', taxa_cambio: 5.8573 });
  expect(nbsp(usd.principal)).toBe('US$ 23.550,00');
  expect(nbsp(usd.emReais)).toBe('≈ R$ 137.939,42');
  expect(nbsp(valorDaProposta({ valor_total: 1000, moeda: 'EUR', taxa_cambio: 6.426 }).principal)).toBe('€ 1.000,00');
  expect(valorDaProposta({ valor_total: 1000, moeda: 'USD' }).emReais).toBeNull(); // sem cotação ainda: não inventa
});

test('[moeda] moeda desconhecida vale como real; rótulo da cotação', () => {
  expect(moedaDaProposta({ moeda: 'xyz' })).toBe('BRL');
  expect(moedaDaProposta({ moeda: 'usd' })).toBe('USD');
  expect(rotuloDaCotacao('USD', 5.8573)).toBe('R$ 5,8573 por US$');
  expect(rotuloDaCotacao('EUR', 6.426)).toBe('R$ 6,4260 por €');
});
