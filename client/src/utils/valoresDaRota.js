/**
 * Etapa 157 (RN-157.02, C374): os valores que a rota calculada (`GET /custos-viagens/calcular-rota`) poe no formulario do custo de viagem.
 *
 * Uma funcao so para os tres caminhos que levam a rota ao formulario (o preenchimento automatico, a confirmacao da passagem aerea e o botao
 * "Aplicar Valores Sugeridos"). Antes, o preenchimento automatico punha a taxa de embarque no transporte do aereo e os outros dois nao —
 * o total do formulario ficava R$ 75 por pessoa abaixo do custo sugerido do servidor (que soma passagem + taxa + alimentacao + hospedagem);
 * a confirmacao nao tocava em "outros" (ficava o estacionamento de uma rota terrestre anterior) e o Aplicar nao atualizava a distancia, o
 * tempo nem o sugerido. A soma dos quatro custos e o custo sugerido do servidor.
 */
const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export function valoresDaRota(rota) {
  const r = rota || {};
  const d = r.detalhes || {};
  const aereo = !!r.requer_passagem_aerea;
  const transporte = aereo
    ? num(d.custo_passagem_aerea) + num(d.custo_taxa_embarque)
    : num(d.custo_combustivel) + num(d.custo_pedagio);
  const outros = aereo ? 0 : num(d.custo_estacionamento);
  return {
    distancia_km: num(r.distancia_km),
    tempo_estimado_horas: num(r.tempo_estimado_horas),
    custo_sugerido: num(r.custo_sugerido),
    requer_passagem_aerea: aereo,
    custo_transporte: transporte.toFixed(2),
    custo_hospedagem: num(d.custo_hospedagem).toFixed(2),
    custo_alimentacao: num(d.custo_alimentacao).toFixed(2),
    custo_outros: outros.toFixed(2),
  };
}

export default valoresDaRota;
