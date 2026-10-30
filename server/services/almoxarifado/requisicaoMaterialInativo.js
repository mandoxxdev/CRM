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

/**
 * Etapa 124 (C231, RN-10..RN-14b; B801) — a familia e a subfamilia do material que o Reativar do material confere
 * (`validateFamiliaAtiva`/`validateSubfamilia`): com elas inativas, ele recusa, e a recusa da 114 mandava fazer o que o
 * sistema recusa. Coluna `material_familia_inativa` das leituras de itens: 1 = a familia (RAIZ, que existe) inativa, 2 = a
 * subfamilia (que existe e e subfamilia) inativa, 3 = as duas. A familia que nao existe e o legado com a subfamilia gravada
 * no `familia_id` (Fase 2, I2) dao 0: reativar a "familia" nao destrava o Reativar deles — a literal de hoje, sem prometer.
 * NULL em `ativo` e inativo (a leitura de `validateFamiliaAtiva`: `ativo !== 1`).
 */
const familiaInativaSql = (alias) => `(CASE WHEN EXISTS (SELECT 1 FROM familias_material_almoxarifado fxi
      WHERE fxi.id = ${alias}.familia_id AND fxi.parent_id IS NULL AND (fxi.ativo IS NULL OR fxi.ativo <> 1)) THEN 1 ELSE 0 END
  + CASE WHEN EXISTS (SELECT 1 FROM familias_material_almoxarifado sxi
      WHERE sxi.id = ${alias}.subfamilia_id AND sxi.parent_id IS NOT NULL AND (sxi.ativo IS NULL OR sxi.ativo <> 1))
    THEN 2 ELSE 0 END)`;

const QUAL_FAMILIA = { 1: 'a família', 2: 'a subfamília', 3: 'a família e a subfamília' };

/**
 * Os grupos `[rotulo, [codigos]]` dos materiais inativos pendentes com familia/subfamilia inativa — a mesma regua de
 * `codigosInativosPendentes` (os codigos na ordem dos itens, sem repetir); os grupos na ordem familia, subfamilia, as duas.
 */
function gruposFamiliaInativa(itens = []) {
  const vistos = new Set();
  const porTipo = { 1: [], 2: [], 3: [] };
  for (const it of itens) {
    if (!inativo(it.material_ativo)) continue;
    if (!(Q.qtd(Math.max(0, (Number(it.quantidade_solicitada) || 0) - entregue(it))) > 0)) continue;
    const codigo = String(it.material_codigo ?? it.material_id);
    if (vistos.has(codigo)) continue;
    vistos.add(codigo);
    const tipo = Number(it.material_familia_inativa) || 0;
    if (porTipo[tipo]) porTipo[tipo].push(codigo);
  }
  return [1, 2, 3].filter((t) => porTipo[t].length > 0).map((t) => [QUAL_FAMILIA[t], porTipo[t]]);
}

/** Le os itens da requisicao (ordem `ir.id`): `{ codigos, familias }` (`codigosInativosPendentes`, `gruposFamiliaInativa`). */
// Etapa 124 (Fase 5, r3 T10): substitui `lerCodigosInativosPendentes`, que ficou sem chamador e foi removida.
async function lerInativosPendentes(db, requisicaoId) {
  const itens = await dbAll(db, `SELECT ir.quantidade_solicitada, ir.quantidade_entregue, ir.quantidade_atendida,
      ir.material_id, ma.ativo AS material_ativo, ma.codigo AS material_codigo,
      ${familiaInativaSql('ma')} AS material_familia_inativa
    FROM itens_requisicao_almoxarifado ir
    JOIN materiais_almoxarifado ma ON ma.id = ir.material_id
    WHERE ir.requisicao_id = ?
    ORDER BY ir.id`, [requisicaoId]);
  return { codigos: codigosInativosPendentes(itens), familias: gruposFamiliaInativa(itens) };
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

// Fase 2 (R2) da 114: quem recebe a recusa nem sempre reativa (o Gestor aprova e nao edita material) — a mensagem diz ONDE
// e QUEM reativa. Ate a Etapa 192 era lido de `ACAO_PERFIS.editar_material` (o Reativar da tela de Materiais do almoxarifado).
// Etapa 193 Fase 5 (R2): o cadastro e so do Compras (RN-193.02/04) — o Reativar mora em Compras -> Materiais, filtro Inativos, e
// so o administrador do modulo Compras (ou do sistema) entra la (`cadastroDeMaterial.pode`). A lista de perfis dizia quem NAO
// consegue mais. Com a chave `ALMOX_CADASTRO_MATERIAL=liberado` o almoxarifado tambem reativa, mas a mensagem fala do padrao.
const ONDE_REATIVAR_MATERIAL = 'Compras → Materiais, filtro Inativos (administrador do módulo Compras)';
/**
 * Etapa 124 (C231): `familias` — os grupos de `gruposFamiliaInativa` (ou, na separacao, `[[rotulo, null]]` para "do
 * material"). Com algum, a frase manda reativar a familia ANTES — e diz onde e quem (a aba Familias das Configuracoes, do
 * Administrador do almoxarifado: o portao `denyUnlessAlmoxAdmin` da rota de familia). Sem nenhum, a literal da 114.
 */
const reativar = (familias = []) => {
  const doMaterial = `o material em ${ONDE_REATIVAR_MATERIAL}`;
  if (!familias || familias.length === 0) return `Reative ${doMaterial}`;
  const quais = familias.map(([rotulo, codigos]) => (codigos ? `${rotulo} de ${codigos.join(', ')}` : `${rotulo} do material`))
    .join(' e ');
  return `Reative ${quais} em Configurações → Famílias (Administrador do almoxarifado) e depois ${doMaterial}`;
};

/**
 * E1 (RN-01/RN-02) — `/aprovar` (`valor: false`: "rejeite a requisição") e `/aprovar-valor` (`valor: true`: o gesto
 * daquela fila e o Reprovar da liberacao — o /rejeitar so aceita PENDENTE; Fase 2, R2).
 */
function mensagemAprovar(numero, codigos, { valor = false, familias = [] } = {}) {
  return `A requisição ${numero} tem material inativo: ${codigos.join(', ')}. ${reativar(familias)} `
    + (valor ? 'ou reprove a liberação por valor.' : 'ou rejeite a requisição.');
}

/** E2 (RN-04) — envio do rascunho. */
function mensagemEnviar(numero, codigos, familias = []) {
  return `O rascunho ${numero} tem material inativo: ${codigos.join(', ')}. ${reativar(familias)} `
    + 'ou cancele o rascunho e faça outro sem ele.';
}

/**
 * E3 (RN-05) — separacao. Fase 2 (R1): quem separa (Almoxarife) nao cancela requisicao alheia, e com caixa ninguem
 * cancela — o caminho que serve a quem recebe e separar os outros itens com 0 neste (o pendente dele se encerra depois).
 */
function mensagemSeparar(nomeMaterial, familiaInativa = 0) {
  const qual = QUAL_FAMILIA[Number(familiaInativa) || 0];
  return `${nomeMaterial}: material inativo não pode ser separado. ${reativar(qual ? [[qual, null]] : [])} `
    + 'ou separe os outros itens com 0 neste.';
}

/** O erro de E1, com `code` para quem precisa distinguir (a aprovacao automatica so loga). */
function erroAprovar(reqRow, requisicaoId, codigos, opcoes) {
  return Object.assign(new Error(mensagemAprovar(numeroDe(reqRow && reqRow.numero, requisicaoId), codigos, opcoes)),
    { status: 400, code: 'MATERIAL_INATIVO', materiais: codigos });
}

module.exports = {
  codigosInativosPendentes,
  lerInativosPendentes,
  gruposFamiliaInativa,
  familiaInativaSql,
  SEM_MATERIAL_INATIVO_SQL,
  mensagemAprovar,
  mensagemEnviar,
  mensagemSeparar,
  erroAprovar,
  numeroDe,
  materialInativo: inativo,
};
