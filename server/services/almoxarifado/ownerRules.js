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
 *  - REMESSA_TERCEIRO/RETORNO_TERCEIRO/PERDA_TERCEIRO/CONSUMO_TERCEIRO (Etapa 8b, decisao 5):
 *    mandar a chapa do cliente galvanizar nao e APLICA-LA em trabalho de ninguem — o material
 *    continua sendo daquele cliente, so mudou de endereco. Mesmo espirito da TRANSFERENCIA.
 *    A CONTRAPARTIDA E OBRIGATORIA e nao esta aqui: a remessa REGISTRA o dono
 *    (remessas_terceiro_almoxarifado.proprietario_cliente_id, gravado por
 *    thirdPartyService.criarRemessa a partir do material) e o documento de remessa NOMEIA o
 *    cliente proprietario. Sem essa contrapartida esta isencao seria um caminho para material de
 *    cliente sair do predio sem rastro de propriedade — o oposto do que a Etapa 8 construiu.
 *    PERDA_TERCEIRO/CONSUMO_TERCEIRO entram junto porque so nascem do encerramento de uma remessa
 *    que ja tem o dono registrado, sob o gate `remessar_terceiro` e com justificativa obrigatoria.
 *    Foi por isso que a 8b criou tipos NOVOS em vez de reusar PERDA/SUCATA: aqueles dois estao em
 *    TIPOS_SAIDA_COM_DONO abaixo, e encerrar a remessa de uma chapa de cliente perdida no
 *    galvanizador passaria a exigir OS ou projeto daquele cliente.
 *  - RETORNO_TRANSFORMACAO (Etapa 8c): DECLARATIVO. A guarda desta lista (assertSaidaPermitida) so
 *    roda para SAIDA, e este tipo e ENTRADA — a ausencia nao mudaria comportamento nenhum hoje.
 *    Esta aqui para a ausencia nao poder ser lida como esquecimento por quem mexer nesta lista
 *    depois, exatamente como AJUSTE_POSITIVO, que tambem e entrada e tambem esta aqui.
 *    A GUARDA DE VERDADE DA TRANSFORMACAO E OUTRA e mora neste mesmo arquivo:
 *    assertMesmoDonoNaTransformacao (Task 5) — a peca tem de ter o MESMO dono da chapa, senao a
 *    transformacao converteria material de cliente em patrimonio da GMP.
 *  - ENTRADA_RETALHO (Etapa 9, Task 2): mesmo caso de RETORNO_TRANSFORMACAO — DECLARATIVO, tipo de
 *    ENTRADA, a guarda desta lista nao roda para ele hoje. Esta aqui pelo mesmo motivo: a ausencia
 *    nao pode ser lida como esquecimento. O evento composto do retalho (Task 3) carrega guarda
 *    PROPRIA — o retalho tem de ter o MESMO dono da chapa de origem, mesmo raciocinio de
 *    assertMesmoDonoNaTransformacao, senao um corte converteria material de cliente em patrimonio
 *    da GMP (ou o inverso) sem ninguem perceber.
 *  - AJUSTE_INVENTARIO (Etapa 10): mesmo caso de RETORNO_TRANSFORMACAO/ENTRADA_RETALHO —
 *    DECLARATIVO. Nao e saida (nao entra em TIPOS_SAIDA_COM_DONO abaixo), entao
 *    assertSaidaPermitida ja sai cedo pelo segundo `if` de qualquer forma; entra aqui so para a
 *    ausencia ser LIDA, nao presumida. A guarda de verdade para material de cliente e a outra,
 *    TIPOS_AJUSTE_DONO abaixo — AJUSTE_INVENTARIO esta la tambem.
 */
const TIPOS_ISENTOS_DONO = ['DEVOLUCAO_CLIENTE', 'TRANSFERENCIA', 'AJUSTE', 'AJUSTE_POSITIVO',
  'AJUSTE_NEGATIVO', 'REMESSA_TERCEIRO', 'RETORNO_TERCEIRO', 'PERDA_TERCEIRO', 'CONSUMO_TERCEIRO',
  'RETORNO_TRANSFORMACAO', 'ENTRADA_RETALHO', 'AJUSTE_INVENTARIO'];

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
 *
 * AJUSTE_INVENTARIO (Etapa 10) entra aqui pelo MESMO motivo que AJUSTE: e o ajuste que a
 * conclusao da conferencia de inventario emite, e material de cliente com divergencia continua
 * exigindo `ajustar_material_cliente` para ser homologado — a conferencia nao pode virar um
 * segundo caminho para ajustar saldo de terceiro sem a permissao dedicada.
 */
const TIPOS_AJUSTE_DONO = ['AJUSTE', 'AJUSTE_POSITIVO', 'AJUSTE_NEGATIVO', 'AJUSTE_INVENTARIO'];

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

/**
 * NUCLEO COMPARTILHADO das duas guardas material <-> material (transformacao, Etapa 8c; retalho,
 * Etapa 9). O PORQUE da regra esta no docstring longo logo abaixo — aqui mora so a comparacao,
 * que e o pedaco que as duas nao podem deixar divergir.
 *
 * `montarMensagem` recebe os dois nomes ja resolvidos e devolve o texto: a mensagem e a UNICA
 * coisa que difere entre as duas guardas, e ela difere de proposito (vocabulario do fluxo que o
 * operador esta executando).
 *
 * `|| null` nos dois lados normaliza antes de comparar: '' e 0 NAO significam nada aqui (todas as
 * leituras de estoque proprio testam IS NULL), e sem a normalizacao um 0 mal gravado recusaria a
 * operacao mais comum do dia a dia — a de material nosso.
 */
async function assertMesmoDono(db, materialOrigem, materialDestino, montarMensagem) {
  const donoOrigem = materialOrigem.proprietario_cliente_id || null;
  const donoDestino = materialDestino.proprietario_cliente_id || null;
  if (donoOrigem === donoDestino) return;

  const rotulo = async (id) => (id ? await nomeDoCliente(db, id) : 'estoque proprio (material nosso)');
  const nomeOrigem = await rotulo(donoOrigem);
  const nomeDestino = await rotulo(donoDestino);
  throw erro(montarMensagem({ nomeOrigem, nomeDestino }));
}

/**
 * A peca cortada tem de ter o MESMO dono da chapa (Etapa 8c, decisao 3 do design). Sem excecao.
 *
 * O caso perigoso NAO e o de dois clientes diferentes — e chapa DE CLIENTE virando peca NOSSA: a
 * transformacao converteria material de cliente em patrimonio da GMP, em silencio, com o numero
 * certo em todo relatorio e sem nada errado aparecendo em lugar nenhum. A guarda e SIMETRICA
 * porque o caminho inverso e igualmente errado (presentear o cliente com material nosso, e o
 * inventario dele passando a contar uma peca que a GMP pagou).
 *
 * ISTO NAO E REGRA DEDUZIDA — e diferente de "uma remessa nao mistura donos" (thirdPartyService.
 * resolverProprietario), que a 8b deduziu e deixou registrado como pergunta pendente ao cliente.
 * Esta decorre direto da guarda de saida da Etapa 8, e e o mesmo raciocinio que fez a movimentacao
 * emergencial nao furar a guarda do dono: "regularizo depois" nao e resposta para o dono da chapa.
 *
 * Por que funcao NOVA e nao assertSaidaPermitida: aquela so roda para tipo de SAIDA
 * (stockService.js:636) e compara o dono do MATERIAL com o cliente do VINCULO (OS/projeto). Aqui os
 * dois lados sao MATERIAIS, e a comparacao e material <-> material. Nenhuma das duas pecas serve.
 *
 * Recebe LINHAS de materiais_almoxarifado (precisam ter id, codigo e proprietario_cliente_id), e
 * nao ids, porque quem chama (thirdPartyService.registrarTransformacao) ja leu as duas linhas na
 * pre-checagem — reler aqui seria uma consulta por resultado, N+1 numa transformacao de 40 pecas.
 *
 * A comparacao (com a normalizacao `|| null`, que e load-bearing) mora em `assertMesmoDono` acima
 * desde a Etapa 9, quando a guarda do retalho passou a precisar exatamente dela com outra mensagem.
 */
async function assertMesmoDonoNaTransformacao(db, materialOrigem, materialResultado) {
  // A mensagem NOMEIA OS DOIS LADOS e os DOIS CODIGOS: sem isso o operador ve "dono diferente" e
  // nao sabe qual dos dois cadastros esta errado, nem por qual dos dois caminhos consertar
  // (corrigir o dono do material de destino, ou usar outro material de destino). Mesmo criterio da
  // mensagem de remessa mista na 8b.
  await assertMesmoDono(db, materialOrigem, materialResultado,
    ({ nomeOrigem, nomeDestino }) => `A peca resultante tem dono diferente da chapa: `
      + `${materialOrigem.codigo} e de ${nomeOrigem} e ${materialResultado.codigo} e de `
      + `${nomeDestino}. A transformacao nao pode mudar o proprietario do material — cadastre o `
      + 'material resultante com o mesmo proprietario da chapa, ou escolha outro material de destino.');
}

/**
 * O material do RETALHO tem de ter o mesmo dono do material de origem (Etapa 9, decisao 5).
 *
 * Mesma regra e mesmo caso perigoso de assertMesmoDonoNaTransformacao — chapa DE CLIENTE virando
 * retalho NOSSO converte material de cliente em patrimonio da GMP em silencio —, e por isso as
 * duas compartilham `assertMesmoDono` acima: a comparacao e a normalizacao `|| null` sao o pedaco
 * que NAO pode divergir entre as duas (divergir e o que este modulo passou a Etapa 8c inteira
 * consertando em listas replicadas).
 *
 * O que muda e SO a mensagem, e e por isso que existe funcao separada em vez de reuso direto: a
 * mensagem da transformacao fala de "peca resultante" e "chapa enviada" ao terceiro, vocabulario
 * de um fluxo que o operador do retalho nao esta executando — ele cortou material AQUI dentro. Ver
 * o mesmo criterio no comentario de assertMesmoDonoNaTransformacao sobre por que ela nao reusou
 * assertSaidaPermitida.
 */
async function assertMesmoDonoNoRetalho(db, materialOrigem, materialRetalho) {
  await assertMesmoDono(db, materialOrigem, materialRetalho,
    ({ nomeOrigem, nomeDestino }) => `O material do retalho tem dono diferente do material de `
      + `origem: ${materialOrigem.codigo} e de ${nomeOrigem} e ${materialRetalho.codigo} e de `
      + `${nomeDestino}. Gerar retalho nao pode mudar o proprietario do material — cadastre o `
      + 'material do retalho com o mesmo proprietario da origem, ou escolha outro material de retalho.');
}

module.exports = {
  TIPOS_ISENTOS_DONO, TIPOS_SAIDA_COM_DONO, TIPOS_AJUSTE_DONO,
  assertSaidaPermitida, assertAjustePermitido,
  assertMesmoDonoNaTransformacao, assertMesmoDonoNoRetalho,
};
