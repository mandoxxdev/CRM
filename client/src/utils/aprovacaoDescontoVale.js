/**
 * Etapa 141 (RN-141.09) — a aprovação de desconto que VALE para a proposta, como o servidor a conta (`casaComAprovacao` em
 * `server/aprovacaoDesconto.js`): aprovada, decidida por alguém (`aprovado_por`) que não é quem pediu (B912, Etapa 140) e com o mesmo
 * percentual da margem, a 0,01 ponto depois de arredondar os dois a duas casas.
 *
 * O modal "Nova solicitação" de Aprovações escondia a proposta que tivesse QUALQUER aprovação aprovada de mesmo valor — inclusive a
 * decidida pelo próprio vendedor antes da Etapa 140, que não libera mais nada. A proposta sumia do modal para sempre.
 * A tela só usa isto para esconder da lista; quem decide é sempre o servidor.
 */
const duasCasas = (v) => Math.round(Number(v) * 100) / 100;

export function aprovacaoValeParaProposta(ap, proposta) {
  if (!ap || !proposta) return false;
  if (ap.status !== 'aprovado') return false;
  if (ap.tipo != null && ap.tipo !== 'desconto') return false;
  if (Number(ap.proposta_id) !== Number(proposta.id)) return false;
  if (ap.aprovado_por == null || ap.aprovado_por === '' || Number(ap.aprovado_por) === Number(ap.solicitado_por)) return false;
  const a = duasCasas(ap.valor_desconto);
  const m = duasCasas(proposta.margem_desconto);
  if (!Number.isFinite(a) || !Number.isFinite(m)) return false;
  return Math.abs(a - m) < 0.01;
}
