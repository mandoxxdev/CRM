/**
 * Etapa 140 (propostas; C301, C302, C303) — quem libera o desconto acima de 5 % e com que aprovação ele casa.
 *
 * Antes qualquer vendedor liberava o próprio desconto: decidia o próprio pedido (`PUT /api/aprovacoes/:id` não conferia nada),
 * criava o pedido já aprovado (`POST /api/aprovacoes` gravava o status e o "solicitado por" do corpo) ou punha a proposta em
 * `desconto_aprovado` pelo `PUT` e a enviava (o `/enviar` não olhava a margem).
 *
 *   aprovador         = usuário com `pode_aprovar_descontos = 1` OU super administrador (B906) — admin de papel não basta;
 *   dono do pedido    = quem pediu (`solicitado_por`) e o responsável da proposta (Fase 2, I5) — o dono não decide;
 *   casar             = aprovação `aprovado`, tipo desconto, cujo valor a régua da margem lê e que difere da margem em menos de
 *                       0,01 ponto depois de arredondar os dois a duas casas (a tolerância de sempre do `PUT`, D (139)).
 *
 * Plano: docs/superpowers/plans/2026-10-17-almoxarifado-etapa140-a-autorizacao-do-desconto.md
 */
const { lerMargemDesconto } = require('./margemDesconto');

const MSG = {
  SEM_PERMISSAO: 'Você não tem permissão para aprovar descontos. Peça a um usuário com "Pode aprovar descontos".',
  PROPRIO: 'Quem pediu a aprovação do desconto não pode decidi-la. Peça a outro aprovador.',
  JA_DECIDIDA: 'Esta solicitação de aprovação já foi decidida. Recarregue a lista.',
  VALOR_PEDIDO: 'O desconto desta solicitação não é um número de 0 a 100. Rejeite-a e peça uma nova.',
  PROPOSTA_SAIU: 'A proposta desta solicitação não está mais em rascunho nem com desconto aprovado. Rejeite a solicitação ou volte a proposta para rascunho.',
  PROPOSTA_ID: 'proposta_id é obrigatório',
  SO_VOCE: 'Só você pode aprovar descontos, e quem pede não decide o próprio pedido. Configure outro usuário com "Pode aprovar descontos" na gestão de usuários.',
  SEM_APROVADOR: 'Nenhum usuário configurado para aprovar descontos. Configure um usuário na gestão de usuários.',
  DA_SO_APROVACAO: 'O status "Desconto aprovado" só é dado pela aprovação do desconto, em Comercial → Aprovações. Se a proposta estava com desconto aprovado, ela mudou depois de aberta: recarregue-a.',
  DA_MARGEM: 'O desconto acima de 5% desta proposta não é o que foi aprovado. Para mudar o desconto, salve a proposta como rascunho e peça nova aprovação.',
  ENVIAR: 'Não é possível enviar uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial → Aprovações.',
  ASSINAR: 'Não é possível assinar uma proposta com desconto acima de 5% sem a aprovação desse desconto. Peça a aprovação em Comercial → Aprovações.',
};

/** Status da proposta em que uma aprovação de desconto ainda pode ser aplicada (RN-140.05). */
const STATUS_ACEITA_APROVACAO = ['rascunho', 'desconto_aprovado'];

const sim = (v) => v === 1 || v === true || v === '1';

/** RN-140.01: a linha do usuário (do banco, na hora) tem a coluna ou é super. */
function ehAprovador(linhaUsuario) {
  if (!linhaUsuario) return false;
  return sim(linhaUsuario.pode_aprovar_descontos) || sim(linhaUsuario.is_superadmin);
}

/** RN-140.02: o usuário é dono do pedido (quem pediu ou o responsável da proposta). Compara por número. */
function ehDonoDoPedido(usuarioId, aprovacao, responsavelProposta) {
  const u = Number(usuarioId);
  if (!Number.isFinite(u)) return false;
  return Number(aprovacao && aprovacao.solicitado_por) === u || (responsavelProposta != null && Number(responsavelProposta) === u);
}

/** A margem gravada como a regra dos 5 % a vê: a ilegível conta como acima de 5 (RN-139.04d). */
function margemParaRegra(valorGravado) {
  const lida = lerMargemDesconto(valorGravado);
  return lida.ok ? lida.valor : Infinity;
}

/** "Casar": alguma aprovação (já filtrada por proposta, status aprovado e tipo desconto) com o mesmo percentual. */
function casaComAprovacao(aprovacoes, margem) {
  if (!Number.isFinite(margem)) return false;
  const alvo = Math.round(margem * 100) / 100;
  return (aprovacoes || []).some((ap) => {
    const lida = lerMargemDesconto(ap.valor_desconto);
    if (!lida.ok) return false;
    return Math.abs(Math.round(lida.valor * 100) / 100 - alvo) < 0.01;
  });
}

/**
 * Confere no banco se a margem (já lida pela régua; Infinity = ilegível) pode sair sem aprovação ou casa com uma.
 * cb(err, liberado:boolean).
 */
function margemLiberada(db, propostaId, margem, cb) {
  if (!(margem > 5)) return cb(null, true);
  db.all(
    "SELECT id, valor_desconto FROM aprovacoes WHERE proposta_id = ? AND status = 'aprovado' AND tipo = 'desconto'",
    [propostaId],
    (err, rows) => (err ? cb(err) : cb(null, casaComAprovacao(rows, margem)))
  );
}

module.exports = {
  MSG,
  STATUS_ACEITA_APROVACAO,
  ehAprovador,
  ehDonoDoPedido,
  margemParaRegra,
  casaComAprovacao,
  margemLiberada,
};
