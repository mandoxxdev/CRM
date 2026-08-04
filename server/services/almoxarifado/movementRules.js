/**
 * Regra crítica de saída (spec 13.3): vínculo obrigatório por tipo de movimento.
 * vinculo:
 *   'os_ou_projeto'  → exige os_id || projeto_id
 *   'qualquer'       → exige os_id || projeto_id || centro_custo_id || justificativa || referencia
 *                      (referencia é aceita aqui por compat v1 — ver avaliarRegrasVinculo abaixo)
 *   'nenhum'         → sem exigência de vínculo
 * justificativa: true → exige justificativa (independente de vínculo)
 * Emergencial (emergencial=true + justificativa) bypassa o vínculo e marca regularizacao_pendente.
 */
const REGRAS_VINCULO = {
  SAIDA_PRODUCAO: { vinculo: 'os_ou_projeto' },
  SAIDA_MONTAGEM: { vinculo: 'os_ou_projeto' },
  SAIDA_ASSISTENCIA: { vinculo: 'os_ou_projeto' },
  SAIDA: { vinculo: 'qualquer' },
  AJUSTE: { vinculo: 'nenhum', justificativa: true },
  AJUSTE_POSITIVO: { vinculo: 'nenhum', justificativa: true },
  AJUSTE_NEGATIVO: { vinculo: 'nenhum', justificativa: true },
  SUCATA: { vinculo: 'nenhum', justificativa: true },
  PERDA: { vinculo: 'nenhum', justificativa: true },
};

function avaliarRegrasVinculo(tipo, params) {
  const regra = REGRAS_VINCULO[tipo];
  if (!regra) return { ok: true };
  const { os_id, projeto_id, centro_custo_id, justificativa, referencia, emergencial } = params;
  const just = justificativa || null;

  if (regra.justificativa && !just) {
    return { ok: false, erro: `${tipo} exige justificativa` };
  }
  if (emergencial) {
    if (!just) return { ok: false, erro: 'Movimentação emergencial exige justificativa' };
    return { ok: true, pendente: true };
  }
  if (regra.vinculo === 'os_ou_projeto' && !os_id && !projeto_id) {
    return { ok: false, erro: `${tipo} exige vínculo com OS ou projeto (ou use emergencial com justificativa)` };
  }
  if (regra.vinculo === 'qualquer' && !os_id && !projeto_id && !centro_custo_id && !just && !referencia) {
    return { ok: false, erro: 'Saída exige OS, projeto, centro de custo ou justificativa' };
  }
  return { ok: true };
}

module.exports = { REGRAS_VINCULO, avaliarRegrasVinculo };
