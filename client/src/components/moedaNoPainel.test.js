import { avisosDeOutraMoeda } from './moedaNoPainel';

const limpo = (t) => t.replace(/ /g, ' ');

test('dolar com cotacao: quanto veio e por quanto entrou em reais', () => {
  const [t] = avisosDeOutraMoeda([{ moeda: 'USD', propostas: 1, valor: 23550, em_reais: 137939.42, sem_cotacao: 0 }]);
  expect(limpo(t)).toBe('1 proposta em dólar: US$ 23.550,00, somados como R$ 137.939,42 pela cotação de cada uma.');
});

test('sem cotacao: avisa que entra 1 para 1 e onde corrigir', () => {
  const [t] = avisosDeOutraMoeda([{ moeda: 'EUR', propostas: 2, valor: 2000, em_reais: 8000, sem_cotacao: 1 }]);
  expect(limpo(t)).toContain('2 propostas em euro: € 2.000,00');
  expect(t).toContain('1 sem cotação entra 1 para 1 — preencha a cotação na proposta.');
});

test('nada em outra moeda (ou resposta antiga do servidor): nenhum aviso', () => {
  expect(avisosDeOutraMoeda(undefined)).toEqual([]);
  expect(avisosDeOutraMoeda([])).toEqual([]);
  expect(avisosDeOutraMoeda([{ moeda: 'BRL', propostas: 3, valor: 1 }])).toEqual([]);
});
