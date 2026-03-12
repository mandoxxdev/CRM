/**
 * Motor de descritivo técnico CPQ para processo químico.
 * Gera texto técnico com base em: biblioteca, parâmetros de processo (viscosidade cPs, densidade,
 * temperatura, volume), regras aplicadas e resultados do dimensionamento.
 * Estilos: tecnico_resumido, tecnico_detalhado, comercial.
 */

function generate(db, item, params, callback) {
  const tipo = (params.tipo_equipamento || item?.tipo || item?.nome || 'equipamento').toString();
  const modelo = (params.modelo || item?.modelo || item?.codigo || 'conforme especificação').toString();
  const produto = (params.produto || item?.produto || 'produtos químicos').toString();
  const volume = params.volume != null ? params.volume : (item?.volume_util ?? item?.volume);
  const potencia = params.potencia != null ? params.potencia : (item?.potencia ?? item?.potencia_sugerida);
  const viscosity_cps = params.viscosity_cps ?? params.viscosidade ?? item?.viscosity_cps ?? item?.viscosidade;
  const density = params.density ?? params.densidade ?? item?.densidade;
  const temperatura = params.temperatura ?? item?.temperatura;
  const base_quimica = params.base_quimica ?? item?.base_quimica ?? '';
  const estilo = params.estilo || 'tecnico_resumido';
  const sizing = params.sizing_result || {};

  const v = (x) => (x != null && x !== '' ? x : '—');
  const volStr = volume != null ? `${Number(volume)} litros` : '—';
  const viscStr = viscosity_cps != null ? `${Number(viscosity_cps)} cPs` : '—';
  const densStr = density != null ? `${Number(density)} g/cm³` : '—';
  const tempStr = temperatura != null ? `${Number(temperatura)} °C` : '—';
  const potStr = potencia != null ? (typeof potencia === 'string' ? potencia : `${Number(potencia)} CV`) : (sizing.potencia_sugerida_min != null ? `${sizing.potencia_sugerida_min}–${sizing.potencia_sugerida_max} CV` : '—');

  let out;
  if (estilo === 'comercial') {
    out = `Equipamento ${v(modelo)} para processamento de ${v(produto)}, volume útil ${volStr}, acionamento ${v(potStr)}.`;
  } else if (estilo === 'tecnico_detalhado') {
    out = `O ${tipo} modelo ${v(modelo)} foi dimensionado para processamento de produto químico com viscosidade estimada de ${viscStr} e densidade de ${densStr}, operando em volume útil de ${volStr}`;
    if (tempStr !== '—') out += ` e temperatura de processo ${tempStr}`;
    out += `. Com base nessas premissas, foi considerada configuração com acionamento compatível, sistema de agitação/dispersão adequado à faixa reológica do produto e materiais construtivos compatíveis com a aplicação`;
    if (sizing.tipo_impelidor) out += ` (${sizing.tipo_impelidor})`;
    if (sizing.tipo_vedacao) out += `, vedação ${sizing.tipo_vedacao}`;
    if (sizing.material_contato_sugerido) out += `, material de contato: ${sizing.material_contato_sugerido}`;
    out += '.';
  } else {
    out = `O equipamento foi dimensionado para processamento de produto químico com viscosidade estimada de ${viscStr} e densidade de ${densStr}, operando em volume útil de ${volStr}. Com base nessas premissas, foi considerada configuração com acionamento compatível (${potStr}), sistema de agitação/dispersão adequado à faixa reológica do produto e materiais construtivos compatíveis com a aplicação.`;
  }
  if (sizing.alertas && sizing.alertas.length) {
    out += ' ' + sizing.alertas.join(' ');
  }
  callback(null, out);
}

module.exports = { generate };
