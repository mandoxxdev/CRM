import { avisosDeOutraMoeda } from './moedaNoPainel';

const limpo = (t) => t.replace(/ /g, ' ');

// Os valores sao digitados em reais; a moeda e a do documento (25/11/2026, "coloquei 128 mil reais e aparece US$ 128.990,00").
test('dolar com cotacao: o valor em reais e quanto da no documento', () => {
  const [t] = avisosDeOutraMoeda([{ moeda: 'USD', propostas: 1, valor: 22022.08, em_reais: 128990, sem_cotacao: 0 }]);
  expect(limpo(t)).toBe('1 proposta em dólar: R$ 128.990,00 (US$ 22.022,08 no documento, pela cotação de cada uma).');
});

test('sem cotacao: avisa que o documento sai em reais e onde corrigir', () => {
  const [t] = avisosDeOutraMoeda([{ moeda: 'EUR', propostas: 2, valor: 2000, em_reais: 8000, sem_cotacao: 1 }]);
  expect(limpo(t)).toContain('2 propostas em euro: R$ 8.000,00 (€ 2.000,00 no documento');
  expect(t).toContain('1 sem cotação sai em reais — preencha a cotação na proposta.');
});

test('nada em outra moeda (ou resposta antiga do servidor): nenhum aviso', () => {
  expect(avisosDeOutraMoeda(undefined)).toEqual([]);
  expect(avisosDeOutraMoeda([])).toEqual([]);
  expect(avisosDeOutraMoeda([{ moeda: 'BRL', propostas: 3, valor: 1 }])).toEqual([]);
});
