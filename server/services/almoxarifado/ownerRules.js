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
const { can, getPerfilFromUser } = require('./permissions');
const { registrarAuditoria } = require('./audit');

/**
 * Tipos ISENTOS da regra de OS/projeto para material de cliente. Cada um com o motivo, porque
 * uma lista de isencoes sem motivo vira lixo que ninguem ousa mexer:
 *  - DEVOLUCAO_CLIENTE: o destino E o proprio proprietario (decisao 9). Exigir OS do dono para
 *    devolver ao dono nao faz sentido. O tipo EXISTE desde a Task 6 (schema.js TIPOS_MOVIMENTO +
 *    rota dedicada POST /materiais-cliente/devolucoes); ate ela a string era inerte, e este
 *    comentario dizia isso — deixou de ser verdade.
 *    Hoje a isencao esta duplamente coberta: o tipo esta aqui E fora de TIPOS_SAIDA_COM_DONO,
 *    e os dois `if` de assertSaidaPermitida saem cedo. A entrada nesta lista continua sendo a
 *    que MANDA, porque e testada antes: se alguem classificar DEVOLUCAO_CLIENTE como "saida com
 *    dono" (o que ele literalmente e) e o acrescentar a TIPOS_SAIDA_COM_DONO, e esta linha que
 *    impede a devolucao ao dono de passar a exigir OS do dono. Coberto por
 *    tests/api/materialClienteDevolucao.api.test.js, que faz exatamente essa mutacao.
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

/**
 * Tipos de AJUSTE cobertos pela permissao dedicada. Sao os mesmos que estao em
 * TIPOS_ISENTOS_DONO: isentos da regra de OS/projeto (ajustar saldo nao e APLICAR material em
 * trabalho de ninguem), e por isso mesmo precisam da outra guarda — senao ajuste seria a porta
 * aberta que a guarda da saida fechou.
 */
const TIPOS_AJUSTE_DONO = ['AJUSTE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO'];

/**
 * Ajuste de material de cliente (Etapa 8, decisao 7). Exige a acao dedicada
 * `ajustar_material_cliente` — mais estreita que `ajustar_estoque` — e deixa auditoria NOMEANDO
 * o cliente proprietario: o numero ajustado e o que o cliente vai cobrar, e "quem mexeu" precisa
 * ficar legivel sem cruzar tabela.
 *
 * A justificativa ja e obrigatoria por REGRAS_VINCULO (AJUSTE* tem `justificativa: true`) e o
 * motor avalia essas regras ANTES de chamar esta guarda — nao se repete a checagem aqui para nao
 * existirem duas fontes da mesma regra, que divergiriam na primeira mudanca.
 *
 * A auditoria e gravada AQUI, antes do efeito de saldo, e isso tem um custo declarado: se a
 * movimentacao falhar depois (validacao de endereco, saldo negativo proibido), sobra uma linha de
 * auditoria de um ajuste que nao aconteceu. Aceito de proposito — este motor nao tem transacao, e
 * para material de terceiro registrar a TENTATIVA autorizada vale mais que perde-la. O saldo real
 * continua no livro de movimentacoes, que so ganha linha quando o ajuste conclui.
 */
async function assertAjustePermitido(db, material, tipo, params, user) {
  if (!material?.proprietario_cliente_id) return; // material nosso: segue em ajustar_estoque
  if (!TIPOS_AJUSTE_DONO.includes(tipo)) return;

  const donoNome = await nomeDoCliente(db, material.proprietario_cliente_id);
  if (!can(user, 'ajustar_material_cliente')) {
    throw erro(`Ajustar o saldo do material ${material.codigo}, que pertence ao cliente ${donoNome}, `
      + `exige a permissao "ajustar_material_cliente" (seu perfil: ${getPerfilFromUser(user)}). `
      + 'Ajustar estoque de terceiro mexe no numero que o cliente vai cobrar.', 403);
  }
  await registrarAuditoria(db, {
    entidade: 'material_cliente',
    entidade_id: material.id,
    acao: 'AJUSTE',
    usuario_id: user?.id,
    usuario_nome: user?.nome || user?.email,
    dados_anteriores: { quantidade_atual: material.quantidade_atual },
    dados_novos: {
      tipo,
      quantidade: params.quantidade,
      proprietario_cliente_id: material.proprietario_cliente_id,
      proprietario_cliente_nome: donoNome,
    },
    justificativa: params.justificativa || null,
  });
}

module.exports = {
  TIPOS_ISENTOS_DONO, TIPOS_SAIDA_COM_DONO, TIPOS_AJUSTE_DONO,
  assertSaidaPermitida, assertAjustePermitido,
};
