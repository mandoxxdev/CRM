/**
 * Perfis de permissão do módulo Almoxarifado
 * Perfis: ADMINISTRADOR, ALMOXARIFE, COMPRAS, PRODUCAO, ENGENHARIA, GESTOR, CONSULTA, QUALIDADE
 */

const PERFIS = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  ALMOXARIFE: 'ALMOXARIFE',
  COMPRAS: 'COMPRAS',
  PRODUCAO: 'PRODUCAO',
  ENGENHARIA: 'ENGENHARIA',
  GESTOR: 'GESTOR',
  CONSULTA: 'CONSULTA',
  // Etapa 24: a area de qualidade decide inspecao de recebimento, vencimento de lote, status de
  // lote e status de serie — as quatro rotas de `inspecionar`. Ate aqui so ADMINISTRADOR e
  // ALMOXARIFE as alcancavam, o que obrigava a qualidade a pedir para o almoxarifado decidir, ou
  // a receber um perfil largo demais. Duas acoes e SO: `visualizar` e `inspecionar`.
  QUALIDADE: 'QUALIDADE',
};

const ACAO_PERFIS = {
  visualizar: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.COMPRAS, PERFIS.PRODUCAO, PERFIS.ENGENHARIA, PERFIS.GESTOR, PERFIS.CONSULTA, PERFIS.QUALIDADE],
  criar_material: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.ENGENHARIA],
  editar_material: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.ENGENHARIA],
  movimentar: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  ajustar_estoque: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR],
  // Etapa 8, decisao 7: ajustar saldo de material que NAO e nosso mexe no numero que o cliente
  // vai cobrar. Mais estreita que ajustar_estoque de proposito — GESTOR ajusta o nosso, so
  // ADMINISTRADOR ajusta o de terceiro. Fluxo de aprovacao assincrono (solicita -> pendente ->
  // alguem aprova -> efetiva) foi DESCARTADO no design: e maquina de estados nova com tela de
  // pendencias e notificacao, do tamanho de uma etapa inteira (fica com a feature 06).
  // A checagem real acontece no MOTOR (ownerRules.assertAjustePermitido), nao em requirePermission
  // na rota: o AJUSTE chega por duas rotas (v1 e v2) e as duas tem gate `movimentar`, o mais amplo.
  ajustar_material_cliente: [PERFIS.ADMINISTRADOR],
  // Etapa 8b, decisao 6: acao propria porque a operacao tem RISCO PROPRIO — o material SAI DO
  // SITE, o que e diferente de mover prateleira (`movimentar`). Mesmo criterio que a Etapa 8 usou
  // para ajustar_material_cliente: quando a operacao muda a natureza do risco, ela ganha acao.
  // Concedida hoje aos MESMOS perfis de `movimentar`: o ganho nao e restringir agora, e PODER
  // restringir sem reescrever nada quando o cliente quiser (ex.: so ADMINISTRADOR manda material
  // de cliente para fora). Exposta em GET /almoxarifado/minhas-permissoes automaticamente — a
  // rota itera Object.keys(ACAO_PERFIS).
  remessar_terceiro: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  // Etapa 11 (D9 do design): decidir COMPRA e gestao/compras, nao operacao de balcao — o
  // ALMOXARIFE conta e movimenta, nao decide pedido; fica fora DE PROPOSITO (primeira acao do
  // modulo sem ele — reversivel, uma linha, registrado na letra B do doc de novidades).
  // Primeiro uso real do perfil COMPRAS.
  gerenciar_reposicao: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR, PERFIS.COMPRAS],
  // Etapa 9, decisao 9: sucatear APAGA material do patrimonio, e apagar nao tem estorno operacional
  // — a chapa ja foi para a cacamba. Mesmo criterio da Etapa 8 (ajustar_material_cliente) e da 8b
  // (remessar_terceiro), escrito la e reusado aqui: quando a operacao muda a NATUREZA DO RISCO, ela
  // ganha acao propria em vez de pegar carona no `movimentar`, que e o gate mais amplo do modulo.
  //
  // Sao DUAS acoes, e a separacao E a feature — nao e uma acao escrita duas vezes. A dupla
  // aprovacao do design so vale alguma coisa se as duas pernas nao puderem ser assinadas pelo mesmo
  // BALCAO: `aprovar_sucateamento` e o almoxarifado (quem tem o material na mao) e
  // `aprovar_sucateamento_gestao` e a gestao responsavel (secao 6 do requisito). As listas se
  // cruzam SO em ADMINISTRADOR, e mesmo ele nao assina as duas pernas da MESMA solicitacao — essa
  // segunda barreira e por IDENTIDADE (user.id) e mora em scrapDisposalService.aprovar, porque
  // permissao por perfil nao tem como saber quem ja assinou.
  //
  // As duas entram de graca em GET /almoxarifado/minhas-permissoes — a rota itera
  // Object.keys(ACAO_PERFIS) —, que e o que permite a tela esconder o botao da perna que o usuario
  // nao assina. Quem DECIDE continua sendo o backend: a rota falha aberto de proposito.
  aprovar_sucateamento: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  aprovar_sucateamento_gestao: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR],
  // Etapa 9b, decisao D1: ferramenta e PATRIMONIO emprestavel, nao estoque — gatear com
  // `movimentar` (permissao de mover saldo) acoplava os dois e impedia restringir um sem o outro.
  // Mesmo criterio de remessar_terceiro: acao propria para PODER restringir sem reescrever.
  // Uma acao so (nao emprestar_/calibrar_/etc): YAGNI ate o cliente pedir granularidade.
  gerenciar_ferramentas: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  aprovar_requisicao: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.GESTOR],
  separar_emitir: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  // Etapa 28 (C4): a SEGUNDA CONFERENCIA da separacao e acao propria, pelo mesmo criterio de
  // remessar_terceiro/gerenciar_ferramentas: concedida hoje aos MESMOS perfis de `separar_emitir`,
  // o ganho nao e restringir agora, e PODER restringir sem reescrever nada quando o cliente quiser
  // (ex.: so ADMINISTRADOR confere material critico). Se pegasse carona em `separar_emitir`,
  // restringir uma coisa restringiria a outra.
  //
  // A barreira que importa — QUEM SEPAROU NAO CONFERE (RN-03) — e por IDENTIDADE (user.id contra
  // as rodadas de separacao da requisicao) e mora em requisitionService.conferirSeparacao, na
  // checagem JS e repetida no WHERE do claim: permissao por perfil nao tem como saber quem separou.
  // Mesmo desenho das duas pernas do sucateamento, acima. Entra de graca em
  // GET /almoxarifado/minhas-permissoes — a rota itera Object.keys(ACAO_PERFIS).
  conferir_separacao: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  requisitar: [PERFIS.ADMINISTRADOR, PERFIS.PRODUCAO, PERFIS.ENGENHARIA, PERFIS.ALMOXARIFE],
  receber_material: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.COMPRAS],
  // Etapa 24: QUALIDADE entra aqui — as quatro rotas gateadas por `inspecionar` sao atos de
  // qualidade (decidir o item recebido, liberar vencimento de lote, mudar status de lote e de
  // serie), e nenhuma delas faz checagem alem do requirePermission (medido na Fase 2).
  //
  // O que ficou de fora DE PROPOSITO, para o proximo nao "consertar":
  // - `ver_alertas`: `montarCentral` percorre o registro INTEIRO, sem regua por perfil — a
  //   permissao entregaria 11 alertas, incluindo ESTOQUE_SEM_CONSUMO e ESTOQUE_EXCESSIVO, que
  //   carregam `valor_parado` (CUSTO de estoque). A Etapa 16 excluiu PRODUCAO/ENGENHARIA/CONSULTA
  //   da central exatamente por isso. Consequencia declarada: os quatro alertas de qualidade
  //   (material reprovado, divergencia de recebimento, lote sem certificado e QUARENTENA_PARADA)
  //   seguem invisiveis para o perfil ate a central saber filtrar por perfil.
  // - `receber_material`: anexar certificado e ato de recebimento, nao de qualidade.
  // - `ajustar_estoque`: mexer em saldo nao e oficio de qualidade. Consequencia declarada: na
  //   tela /almoxarifado/inspecoes dois dos tres botoes ficam barrados para QUALIDADE e
  //   POST /materiais/:id/bloquear responde 403 — o item 131 da spec 23 NAO fica pago inteiro.
  inspecionar: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.QUALIDADE],
  reservar: [PERFIS.ADMINISTRADOR, PERFIS.ENGENHARIA, PERFIS.PRODUCAO, PERFIS.ALMOXARIFE],
  reservar_outra_os: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR],
  inventario: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.GESTOR],
  configurar: [PERFIS.ADMINISTRADOR],
  // Etapa 27 (C4): cadastrar o PLANO DE INSPECAO (caracteristica, nominal e os dois desvios) e
  // acao propria pelo mesmo criterio ja escrito acima (linhas 35-51): quando a operacao muda a
  // NATUREZA DO RISCO, ela ganha acao em vez de pegar carona num gate existente. Aqui o risco e
  // novo de verdade — a partir da Etapa 27 a `divergencia_dimensional` deixa de ser marcada a mao
  // e passa a ser DERIVADA da medida (RN-03), entao quem edita a tolerancia decide, por numero,
  // qual peca reprova.
  //
  // NAO E O `configurar`, e essa foi a decisao: `configurar` e [ADMINISTRADOR] sozinho, e reusa-lo
  // deixaria a QUALIDADE sem poder cadastrar o que ela mesma vai medir (ela tem `inspecionar`
  // desde a Etapa 24) e a ENGENHARIA sem poder definir a tolerancia que ela especifica em desenho.
  // Na pratica o cadastro so aconteceria por pedido ao administrador, e o plano nao seria feito.
  //
  // ALMOXARIFE fica de fora DE PROPOSITO, e e a exclusao que precisa de justificativa porque ele
  // e o candidato obvio (tem `inspecionar`): quem RECEBE o material nao define o criterio pelo
  // qual o proprio recebimento sera julgado. Reversivel numa linha se o cliente pedir; registrado
  // na letra B do doc de novidades.
  //
  // Entra de graca em GET /almoxarifado/minhas-permissoes — a rota itera Object.keys(ACAO_PERFIS).
  gerenciar_plano_inspecao: [PERFIS.ADMINISTRADOR, PERFIS.QUALIDADE, PERFIS.ENGENHARIA],
  // Etapa 32 (D3): anexar documento e ato de QUEM OPERA, e nao de um papel so — COMPRAS anexa a
  // NF do recebimento, QUALIDADE anexa o certificado e o relatorio dimensional, PRODUCAO anexa o
  // desenho da requisicao. Por isso a lista e larga: todos MENOS CONSULTA, cujo nome ja diz o que
  // ele faz. Nao pega carona em `movimentar` porque anexar nao mexe em saldo, e nao pega carona
  // em `visualizar` porque visualizar e leitura.
  anexar_documento: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.COMPRAS, PERFIS.PRODUCAO, PERFIS.ENGENHARIA, PERFIS.GESTOR, PERFIS.QUALIDADE],
  // E a ASSIMETRIA e a decisao, nao um descuido: remover e estreita. Tirar um certificado de
  // vista e apagar EVIDENCIA de qualidade — risco de natureza diferente de anexar —, e o criterio
  // "quando a operacao muda a NATUREZA DO RISCO, ela ganha acao propria" e o mesmo ja escrito
  // acima para ajustar_material_cliente, remessar_terceiro e conferir_separacao. A remocao e soft
  // delete e auditada (o arquivo fica no disco); ainda assim, quem esconde documento e o balcao e
  // o administrador. Reversivel numa linha se o cliente pedir.
  remover_anexo: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  // Etapa 12 (D7 do design): reenviar e-mail e drenar a fila e operacao administrativa da fila,
  // nao operacao de balcao — COMPRAS fica fora DE PROPOSITO (recebe e-mail, nao opera a fila).
  // Mesmo criterio de gerenciar_reposicao (Etapa 11, D9): reversivel, uma linha, registrado na
  // letra B do doc de novidades.
  gerenciar_notificacoes: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR],
  // Etapa 16 (C5 do plano): a central de alertas expoe numeros de estoque e valor parado —
  // PRODUCAO/ENGENHARIA/CONSULTA ficam fora DE PROPOSITO (licao G1: requisitante nao ve
  // quantidade). COMPRAS entra porque sem-consumo/excessivo e insumo direto de decisao de
  // compra (mesmo criterio que a colocou em gerenciar_reposicao, Etapa 11 D9). Entra de graca
  // em GET /almoxarifado/minhas-permissoes — a rota itera Object.keys(ACAO_PERFIS).
  ver_alertas: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.GESTOR, PERFIS.COMPRAS],
};

function getPerfilFromUser(user) {
  if (!user) return PERFIS.CONSULTA;
  const { isSuperAdmin, isModuleAdmin } = require('../systemPermissions');
  if (isSuperAdmin(user)) return PERFIS.ADMINISTRADOR;
  if (isModuleAdmin(user, 'almoxarifado')) return PERFIS.ADMINISTRADOR;
  if (user.role === 'admin') return PERFIS.ADMINISTRADOR;
  if (user.perfil_almoxarifado) return user.perfil_almoxarifado;
  return PERFIS.PRODUCAO;
}

function can(user, acao) {
  const perfil = getPerfilFromUser(user);
  const allowed = ACAO_PERFIS[acao] || [];
  return allowed.includes(perfil);
}

function requirePermission(acao) {
  return (req, res, next) => {
    if (can(req.user, acao)) return next();
    return res.status(403).json({ error: 'Sem permissão para esta operação', acao, perfil: getPerfilFromUser(req.user) });
  };
}

module.exports = { PERFIS, ACAO_PERFIS, getPerfilFromUser, can, requirePermission };
