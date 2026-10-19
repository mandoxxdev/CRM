/**
 * Etapa 157 (RN-157.02, C374): os valores da rota no formulario do custo de viagem — uma funcao para os tres caminhos.
 * Os chamadores (a confirmacao da passagem aerea e o Aplicar) sao provados na tela, em CustosViagensEdicao.test.js (f) e (g).
 */
import { valoresDaRota } from './valoresDaRota';

// as respostas como o servidor as monta (index.js, calcular-rota): o sugerido e a soma das parcelas
const TERRESTRE = {
  distancia_km: 300, tempo_estimado_horas: 4, requer_passagem_aerea: false, custo_sugerido: 180.4 + 52.5 + 120 + 180 + 20,
  detalhes: { custo_combustivel: 180.4, custo_pedagio: 52.5, custo_alimentacao: 120, custo_hospedagem: 180, custo_estacionamento: 20 },
};
const AEREO = {
  distancia_km: 700, tempo_estimado_horas: 2.38, requer_passagem_aerea: true, custo_sugerido: 840 + 75 + 120 + 180,
  detalhes: { custo_passagem_aerea: 840, custo_taxa_embarque: 75, custo_pedagio: 0, custo_alimentacao: 120, custo_hospedagem: 180 },
};
const soma = (v) => ['custo_transporte', 'custo_hospedagem', 'custo_alimentacao', 'custo_outros'].reduce((s, k) => s + parseFloat(v[k]), 0);

test('[RN-157.02] terrestre: transporte = combustivel + pedagio, o estacionamento em outros, a soma = o sugerido', () => {
  const v = valoresDaRota(TERRESTRE);
  expect(v).toEqual({
    distancia_km: 300, tempo_estimado_horas: 4, custo_sugerido: TERRESTRE.custo_sugerido, requer_passagem_aerea: false,
    custo_transporte: '232.90', custo_hospedagem: '180.00', custo_alimentacao: '120.00', custo_outros: '20.00',
  });
  expect(soma(v)).toBeCloseTo(TERRESTRE.custo_sugerido, 2);
});

test('[RN-157.02, C374] aereo: transporte = passagem + taxa de embarque, outros 0, a soma = o sugerido', () => {
  const v = valoresDaRota(AEREO);
  expect(v.custo_transporte).toBe('915.00');
  expect(v.custo_outros).toBe('0.00');
  expect(v.requer_passagem_aerea).toBe(true);
  expect([v.distancia_km, v.tempo_estimado_horas, v.custo_sugerido]).toEqual([700, 2.38, 1215]);
  expect(soma(v)).toBeCloseTo(AEREO.custo_sugerido, 2);
});

test('[RN-157.02] detalhes faltando ou rota nula: zeros, nunca NaN', () => {
  expect(valoresDaRota({ distancia_km: 10 })).toEqual({
    distancia_km: 10, tempo_estimado_horas: 0, custo_sugerido: 0, requer_passagem_aerea: false,
    custo_transporte: '0.00', custo_hospedagem: '0.00', custo_alimentacao: '0.00', custo_outros: '0.00',
  });
  expect(valoresDaRota(null).custo_transporte).toBe('0.00');
  expect(valoresDaRota({ requer_passagem_aerea: true, detalhes: { custo_passagem_aerea: 'x' } }).custo_transporte).toBe('0.00');
});
