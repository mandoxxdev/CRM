/**
 * Etapa 114 (C229) — a requisicao com item pendente de material INATIVO nao e aprovada, nao e enviada e o item nao e
 * separado.
 *
 * Ate aqui as tres portas de aprovacao (`/aprovar`, `/aprovar-valor`, aprovacao automatica) aprovavam: `criarReserva`
 * recusava o material inativo e o `catch` do laco de reserva so logava. Com saldo, a requisicao ficava APROVADO sem
 * reserva e a entrega recusava depois ("Material inativo nao pode ser movimentado") — com a separacao no meio aceitando
 * levar o material para a caixa; sem saldo, AGUARDANDO_ESTOQUE para sempre (nada credita material inativo). Recusar na
 * hora diz a quem aprova o que fazer: reativar o material ou rejeitar.
 *
 * "Pendente" e a regua de `pendenteEntrega` (solicitado - entregue, 6 casas); "inativo" e a leitura do motor
 * (`!material.ativo`: NULL e inativo). Modulo sem require de servico (sem ciclo: o importam `requisitionService` e
 * `requisitionValueApprovalService`, que se importam).
 */
const Q = require('./quantidade');
const { dbAll } = require('./db');
const { ACAO_PERFIS } = require('./permissions');

const inativo = (v) => Number(v) !== 1;

function entregue(item) {
  return Number(item.quantidade_entregue ?? item.quantidade_atendida) || 0;
}

/**
 * Os codigos dos materiais inativos dos itens pendentes, na ordem dos itens, sem repetir.
 * @param {Array<{material_ativo, material_codigo, quantidade_solicitada, quantidade_entregue?, quantidade_atendida?}>} itens
 * @returns {string[]}
 */
function codigosInativosPendentes(itens = []) {
  const vistos = new Set();
  const out = [];
  for (const it of itens) {
    if (!inativo(it.material_ativo)) continue;
    if (!(Q.qtd(Math.max(0, (Number(it.quantidade_solicitada) || 0) - entregue(it))) > 0)) continue;
    const codigo = String(it.material_codigo ?? it.material_id);
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    out.push(codigo);
  }
  return out;
}

/** Le os itens da requisicao (ordem `ir.id`) e devolve `codigosInativosPendentes`. */
async function lerCodigosInativosPendentes(db, requisicaoId) {
  const itens = await dbAll(db, `SELECT ir.quantidade_solicitada, ir.quantidade_entregue, ir.quantidade_atendida,
      ir.material_id, ma.ativo AS material_ativo, ma.codigo AS material_codigo
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ma.id = ir.material_id
    WHERE ir.requisicao_id = ?
    ORDER BY ir.id`, [requisicaoId]);
  return codigosInativosPendentes(itens);
}

/**
 * Condicao para o `UPDATE requisicoes_almoxarifado ... WHERE id = ? AND ...` (tabela sem apelido): nenhum item pendente de
 * material inativo. A mesma regua de `codigosInativosPendentes`, em SQL.
 */
const SEM_MATERIAL_INATIVO_SQL = `NOT EXISTS (SELECT 1 FROM itens_requisicao_almoxarifado iri
    JOIN materiais_almoxarifado mai ON mai.id = iri.material_id
   WHERE iri.requisicao_id = requisicoes_almoxarifado.id
     AND (mai.ativo IS NULL OR mai.ativo <> 1)
     AND ROUND(COALESCE(iri.quantidade_solicitada, 0) - COALESCE(iri.quantidade_entregue, iri.quantidade_atendida, 0), 6) > 0)`;

const numeroDe = (numero, id) => (numero == null || numero === '' ? String(id) : String(numero));

// Fase 2 (R2): quem recebe a recusa nem sempre reativa (o Gestor aprova e nao edita material) — a mensagem diz QUEM
// reativa, lido de `editar_material` (a acao que o Reativar da tela de Materiais exige), para nao envelhecer calada.
const NOME_PERFIL = {
  ADMINISTRADOR: 'Administrador', ALMOXARIFE: 'Almoxarife', COMPRAS: 'Compras', PRODUCAO: 'Produção',
  ENGENHARIA: 'Engenharia', GESTOR: 'Gestor', CONSULTA: 'Consulta', QUALIDADE: 'Qualidade',
};
function quemReativa() {
  const nomes = (ACAO_PERFIS.editar_material || []).map((p) => NOME_PERFIL[p] || p);
  return nomes.length > 1 ? `${nomes.slice(0, -1).join(', ')} ou ${nomes[nomes.length - 1]}` : nomes.join('');
}
const reativar = () => `Reative o material em Materiais → Inativos (${quemReativa()})`;

/**
 * E1 (RN-01/RN-02) — `/aprovar` (`valor: false`: "rejeite a requisição") e `/aprovar-valor` (`valor: true`: o gesto
 * daquela fila e o Reprovar da liberacao — o /rejeitar so aceita PENDENTE; Fase 2, R2).
 */
function mensagemAprovar(numero, codigos, { valor = false } = {}) {
  return `A requisição ${numero} tem material inativo: ${codigos.join(', ')}. ${reativar()} `
    + (valor ? 'ou reprove a liberação por valor.' : 'ou rejeite a requisição.');
}

/** E2 (RN-04) — envio do rascunho. */
function mensagemEnviar(numero, codigos) {
  return `O rascunho ${numero} tem material inativo: ${codigos.join(', ')}. ${reativar()} `
    + 'ou cancele o rascunho e faça outro sem ele.';
}

/**
 * E3 (RN-05) — separacao. Fase 2 (R1): quem separa (Almoxarife) nao cancela requisicao alheia, e com caixa ninguem
 * cancela — o caminho que serve a quem recebe e separar os outros itens com 0 neste (o pendente dele se encerra depois).
 */
function mensagemSeparar(nomeMaterial) {
  return `${nomeMaterial}: material inativo não pode ser separado. ${reativar()} ou separe os outros itens com 0 neste.`;
}

/** O erro de E1, com `code` para quem precisa distinguir (a aprovacao automatica so loga). */
function erroAprovar(reqRow, requisicaoId, codigos, opcoes) {
  return Object.assign(new Error(mensagemAprovar(numeroDe(reqRow && reqRow.numero, requisicaoId), codigos, opcoes)),
    { status: 400, code: 'MATERIAL_INATIVO', materiais: codigos });
}

module.exports = {
  codigosInativosPendentes,
  lerCodigosInativosPendentes,
  SEM_MATERIAL_INATIVO_SQL,
  mensagemAprovar,
  mensagemEnviar,
  mensagemSeparar,
  erroAprovar,
  numeroDe,
  materialInativo: inativo,
};
