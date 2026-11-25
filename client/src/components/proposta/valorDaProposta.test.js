/**
 * Valor da proposta na moeda dela (25/11/2026: "essa proposta eu coloquei em dólar e aqui está em real").
 */
import { valorDaProposta, moedaDaProposta, rotuloDaCotacao } from './valorDaProposta';

const nbsp = (s) => String(s).replace(/ /g, ' ');

test('[moeda] real: como antes, sem linha em reais', () => {
  expect(nbsp(valorDaProposta({ valor_total: 23550 }).principal)).toBe('R$ 23.550,00');
  expect(valorDaProposta({ valor_total: 23550, moeda: 'BRL' }).emReais).toBeNull();
});

// 25/11/2026 ("coloquei 128 mil reais e na proposta aparece US$ 128.990,00"): o gravado é em REAIS; a moeda é a do documento.
test('[moeda] dólar e euro: o valor em reais convertido pela cotação, com o valor em reais embaixo', () => {
  const usd = valorDaProposta({ valor_total: 128990, moeda: 'USD', taxa_cambio: 5.8573 });
  expect(nbsp(usd.principal)).toBe('US$ 22.022,09');
  expect(nbsp(usd.emReais)).toBe('R$ 128.990,00');
  expect(nbsp(valorDaProposta({ valor_total: 6426, moeda: 'EUR', taxa_cambio: 6.426 }).principal)).toBe('€ 1.000,00');
});

test('[moeda] dólar sem cotação: em reais, nunca o número em reais com o símbolo do dólar', () => {
  const v = valorDaProposta({ valor_total: 128990, moeda: 'USD' });
  expect(nbsp(v.principal)).toBe('R$ 128.990,00');
  expect(v.emReais).toBeNull();
});

test('[moeda] moeda desconhecida vale como real; rótulo da cotação', () => {
  expect(moedaDaProposta({ moeda: 'xyz' })).toBe('BRL');
  expect(moedaDaProposta({ moeda: 'usd' })).toBe('USD');
  expect(rotuloDaCotacao('USD', 5.8573)).toBe('R$ 5,8573 por US$');
  expect(rotuloDaCotacao('EUR', 6.426)).toBe('R$ 6,4260 por €');
});
