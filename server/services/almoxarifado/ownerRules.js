/**
 * Guarda do dono — Etapa 8, decisoes 5 e 6 do design.
 *
 * Material com `proprietario_cliente_id` so sai com OS ou projeto CUJO cliente_id seja o mesmo
 * dono. `projetos` e `ordens_servico` tem cliente_id, entao a checagem e real, nao heuristica.
 *
 * O erro que esta guarda impede e o mais caro da operacao: aplicar a chapa do Cliente A no
 * equipamento do Cliente B. Nao e erro de estoque (o numero fecha), e problema CONTRATUAL — o
 * cliente cobra onde foi aplicada a chapa dele, e o material some do saldo do outro.
 *
 * Por que arquivo separado de movementRules.js: aquele modulo e PURO (nao recebe db) e esta
 * guarda precisa consultar projetos/ordens_servico/clientes — inclusive para NOMEAR os dois
 * clientes na mensagem de erro, sem o que o operador teria de adivinhar qual das duas pontas
 * esta errada (o material ou o vinculo).
 */
const { dbGet } = require('./db');

/**
 * Tipos ISENTOS da regra de OS/projeto para material de cliente. Cada um com o motivo, porque
 * uma lista de isencoes sem motivo vira lixo que ninguem ousa mexer:
 *  - DEVOLUCAO_CLIENTE: o destino E o proprio proprietario (decisao 9). Exigir OS do dono para
 *    devolver ao dono nao faz sentido. O tipo ainda NAO existe em TIPOS_MOVIMENTO — quem o criar
 *    (Task 6) nao precisa voltar aqui: a isencao ja esta preparada. Ate la a string e inerte.
 *  - TRANSFERENCIA: mover a chapa do cliente de prateleira nao e aplica-la.
 *  - AJUSTE/AJUSTE_POSITIVO/AJUSTE_NEGATIVO: isentos da regra de VINCULO, mas caem na permissao
 *    dedicada `ajustar_material_cliente` (decisao 7, Task 4).
 */
const TIPOS_ISENTOS_DONO = ['DEVOLUCAO_CLIENTE', 'TRANSFERENCIA', 'AJUSTE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'];

/**
 * Tipos de saida que a guarda cobre. Espelha o `tiposSaida` do stockService menos os isentos.
 *
 * ATENCAO: `tiposSaida` e declarado em DOIS lugares no stockService (em registrarMovimentacao e
 * de novo em cancelarMovimentacao). As duas listas sao identicas hoje; quem acrescentar um tipo
 * de saida la precisa mexer nas duas E decidir aqui se ele entra nesta lista ou em
 * TIPOS_ISENTOS_DONO. A guarda so e chamada em registrarMovimentacao: o cancelamento DEVOLVE o
 * material ao estoque, o oposto de aplica-lo no cliente errado, e travar o estorno so deixaria a
 * saida errada sem como ser desfeita.
 */
const TIPOS_SAIDA_COM_DONO = ['SAIDA', 'SAIDA_PRODUCAO', 'SAIDA_MONTAGEM', 'SAIDA_ASSISTENCIA', 'SUCATA', 'PERDA'];

function erro(msg, status = 400) {
  const e = new Error(msg);
  e.status = status;
  return e;
}

async function nomeDoCliente(db, clienteId) {
  if (!clienteId) return null;
  const c = await dbGet(db, 'SELECT razao_social FROM clientes WHERE id = ?', [clienteId]);
  return c?.razao_social || `cliente #${clienteId}`;
}

/**
 * Descobre de qual cliente e o vinculo informado. Precedencia: projeto_id primeiro (mais
 * especifico), depois os_id. Devolve { cliente_id, rotulo } ou null quando nenhum foi informado.
 */
async function resolverClienteDoVinculo(db, { os_id, projeto_id }) {
  if (projeto_id) {
    const p = await dbGet(db, 'SELECT cliente_id, nome FROM projetos WHERE id = ?', [projeto_id]);
    if (!p) throw erro('Projeto informado nao existe');
    return { cliente_id: p.cliente_id, rotulo: `o projeto ${p.nome || projeto_id}` };
  }
  if (os_id) {
    const o = await dbGet(db, 'SELECT cliente_id, numero_os FROM ordens_servico WHERE id = ?', [os_id]);
    if (!o) throw erro('OS informada nao existe');
    return { cliente_id: o.cliente_id, rotulo: `a OS ${o.numero_os || os_id}` };
  }
  return null;
}

/**
 * Barra a saida quando ela nao respeita o dono. Nao devolve valor — lanca quando barra.
 * Chamada pelo motor DEPOIS de avaliarRegrasVinculo e ANTES de qualquer efeito de saldo.
 */
async function assertSaidaPermitida(db, material, tipo, params) {
  if (!material?.proprietario_cliente_id) return; // material nosso: nada muda
  if (TIPOS_ISENTOS_DONO.includes(tipo)) return;
  if (!TIPOS_SAIDA_COM_DONO.includes(tipo)) return; // entradas e tipos neutros

  const donoNome = await nomeDoCliente(db, material.proprietario_cliente_id);

  // ── A EXCECAO DELIBERADA AO PADRAO DO MODULO (decisao 6 do design) ────────────────────────
  // Em `avaliarRegrasVinculo` (movementRules.js) `emergencial: true` + justificativa BYPASSA a
  // exigencia de vinculo e marca regularizacao_pendente. AQUI NAO BYPASSA — e de proposito, nao
  // e esquecimento de espelhar aquele comportamento.
  // Motivo: o emergencial existe para urgencia no NOSSO estoque, onde o vinculo pode ser
  // regularizado depois porque o material e nosso e o prejuizo de errar e interno. Consumir
  // material de OUTRA EMPRESA sem dizer onde nao e problema de pressa, e problema contratual: o
  // cliente cobra onde foi aplicada a chapa dele, e "regularizo depois" nao e resposta. Quem
  // mexer aqui querendo "uniformizar com o resto do modulo" esta desfazendo uma decisao tomada,
  // nao corrigindo um bug.
  if (params.emergencial) {
    throw erro(`Material ${material.codigo} pertence ao cliente ${donoNome}: saida emergencial nao e `
      + 'permitida para material de terceiro. O emergencial regulariza o vinculo depois, e material '
      + 'de cliente exige saber na hora em qual OS ou projeto DESSE cliente ele foi aplicado. '
      + 'Informe a OS ou o projeto do proprio cliente.');
  }

  const vinculo = await resolverClienteDoVinculo(db, params);
  if (!vinculo) {
    throw erro(`Material ${material.codigo} pertence ao cliente ${donoNome} e so pode sair com OS ou `
      + `projeto DESSE cliente. Informe a OS ou o projeto de ${donoNome}.`);
  }
  if (Number(vinculo.cliente_id) !== Number(material.proprietario_cliente_id)) {
    // Vinculo sem cliente_id (projeto interno) cai aqui tambem, e tem de cair: NULL nao e
    // coringa. `|| 'nenhum cliente'` porque nomeDoCliente devolve null quando nao ha id.
    const vinculoNome = (await nomeDoCliente(db, vinculo.cliente_id)) || 'nenhum cliente';
    throw erro(`Material ${material.codigo} pertence ao cliente ${donoNome}, mas ${vinculo.rotulo} `
      + `e do cliente ${vinculoNome}. Material de cliente so pode ser aplicado em trabalho do proprio `
      + 'dono — troque o vinculo, ou use o material equivalente do estoque proprio.');
  }
}

module.exports = { TIPOS_ISENTOS_DONO, TIPOS_SAIDA_COM_DONO, assertSaidaPermitida };
