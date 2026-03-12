/**
 * Motor de dimensionamento preliminar para processo químico.
 * Central: viscosidade (cPs), densidade, volume útil, tipo de produto.
 * Saída: potência sugerida, tipo impelidor, vedação, material, alertas, origem.
 */

function num(v) {
  if (v == null || v === '') return null;
  const n = typeof v === 'number' ? v : parseFloat(String(v).replace(/\D/g, ''));
  return isNaN(n) ? null : n;
}

function sizing(params) {
  const viscosity_cps = num(params.viscosity_cps ?? params.viscosidade);
  const density = num(params.density ?? params.densidade);
  const volume_util = num(params.volume_util ?? params.volume);
  const temperatura = num(params.temperatura ?? params.temperature);
  const base_quimica = String(params.base_quimica ?? params.base_quimica ?? '').toLowerCase();
  const produto = String(params.produto ?? params.produto ?? '').toLowerCase();
  const area_classificada = !!(params.area_classificada === true || params.area_classificada === 'true' || params.area_classificada === '1');
  const produto_corrosivo = !!(params.produto_corrosivo === true || params.produto_corrosivo === 'true');
  const produto_abrasivo = !!(params.produto_abrasivo === true || params.produto_abrasivo === 'true');
  const necessidade_dispersao = !!(params.necessidade_dispersao !== false && params.necessidade_dispersao !== 'false');
  const necessidade_moagem = !!(params.necessidade_moagem === true || params.necessidade_moagem === 'true');

  const result = {
    valor_informado: { viscosity_cps, density, volume_util, temperatura, base_quimica: base_quimica || produto },
    valor_sugerido: {},
    valor_calculado: {},
    origem_calculo: [],
    alertas: [],
    potencia_sugerida_min: null,
    potencia_sugerida_max: null,
    tipo_impelidor: null,
    tipo_vedacao: null,
    material_contato_sugerido: null,
    tipo_acionamento: null,
    necessidade_camisa_termica: null,
    necessidade_chiller: null
  };

  if (volume_util != null && volume_util > 0) {
    result.valor_calculado.volume_util_recomendado = volume_util;
    result.origem_calculo.push('Volume útil informado pelo usuário.');
  }

  if (viscosity_cps != null) {
    if (viscosity_cps <= 500) {
      result.tipo_impelidor = 'Hélice ou turbina baixa viscosidade';
      result.valor_sugerido.faixa_rotacao = 'até 300 rpm';
      result.origem_calculo.push('Viscosidade <= 500 cPs: agitador de baixa viscosidade.');
    } else if (viscosity_cps <= 3000) {
      result.tipo_impelidor = 'Dispersor (disco ou sawtooth) ou turbina média viscosidade';
      result.valor_sugerido.faixa_rotacao = '100–400 rpm';
      result.origem_calculo.push('Viscosidade 500–3000 cPs: dispersor de média viscosidade.');
    } else {
      result.tipo_impelidor = 'Helicoidal, âncora ou par de hélices sobrepostas';
      result.valor_sugerido.faixa_rotacao = '20–80 rpm';
      result.origem_calculo.push('Viscosidade > 3000 cPs: sistema de alta viscosidade.');
    }
  }

  if (volume_util != null && volume_util > 0) {
    let potMin = 2;
    let potMax = 10;
    if (volume_util >= 500) { potMin = 5; potMax = 15; }
    if (volume_util >= 1000) { potMin = 10; potMax = 30; }
    if (volume_util >= 2000) { potMin = 25; potMax = 75; }
    if (volume_util >= 5000) { potMin = 50; potMax = 150; }
    if (viscosity_cps != null && viscosity_cps > 3000) {
      potMin = Math.round(potMin * 1.3);
      potMax = Math.round(potMax * 1.3);
      result.origem_calculo.push('Alta viscosidade: potência ajustada +30%.');
    }
    if (density != null && density >= 1.4) {
      potMin = Math.round(potMin * 1.15);
      potMax = Math.round(potMax * 1.15);
      result.origem_calculo.push('Densidade elevada: revisão de potência e torque.');
    }
    result.potencia_sugerida_min = potMin;
    result.potencia_sugerida_max = potMax;
    result.valor_calculado.potencia_estimada_cv = `${potMin}–${potMax} CV`;
  }

  if (base_quimica.indexOf('solvente') >= 0 || produto.indexOf('solvente') >= 0) {
    result.tipo_vedacao = 'Mecânica dupla ou selo tipo EX';
    result.tipo_acionamento = 'Motor à prova de explosão (EX)';
    result.origem_calculo.push('Base solvente: vedação e acionamento EX.');
  } else {
    result.tipo_vedacao = 'Mecânica simples ou dupla conforme aplicação';
    result.tipo_acionamento = 'Motor padrão ou EX conforme área';
  }
  if (area_classificada) {
    result.tipo_acionamento = 'Motor EX; painel e botoeira EX';
    result.origem_calculo.push('Área classificada: equipamentos EX.');
  }

  if (produto_corrosivo) {
    result.material_contato_sugerido = 'Aço inox 316L ou material compatível com produto';
    result.origem_calculo.push('Produto corrosivo: material de contato inox 316 ou compatível.');
  } else if (base_quimica.indexOf('solvente') >= 0) {
    result.material_contato_sugerido = 'Aço carbono com revestimento ou inox 304/316';
  } else {
    result.material_contato_sugerido = 'Aço carbono ou inox conforme produto';
  }
  if (produto_abrasivo) {
    result.material_contato_sugerido = (result.material_contato_sugerido || '') + '; considerar revestimentos reforçados';
    result.alertas.push('Produto abrasivo: revisar revestimentos e materiais.');
  }

  if (temperatura != null && temperatura > 80) {
    result.necessidade_camisa_termica = 'Sim (resfriamento ou aquecimento conforme processo)';
    result.origem_calculo.push('Temperatura elevada: camisa térmica recomendada.');
  }
  if (temperatura != null && temperatura < 10) {
    result.necessidade_chiller = 'Avaliar conforme processo';
    result.alertas.push('Temperatura baixa: avaliar necessidade de sistema de resfriamento.');
  }

  if (necessidade_moagem) {
    result.valor_sugerido.equipamento_principal = 'Dispersor + moinho ou linha de dispersão e moagem';
    result.origem_calculo.push('Necessidade de moagem: considerar moinho na composição.');
  }
  if (necessidade_dispersao && viscosity_cps != null && viscosity_cps > 1000) {
    result.valor_sugerido.equipamento_principal = result.tipo_impelidor || 'Dispersor';
  }

  return result;
}

module.exports = { sizing };
