/**
 * Perfis de permissão do módulo Almoxarifado
 * Perfis: ADMINISTRADOR, ALMOXARIFE, COMPRAS, PRODUCAO, ENGENHARIA, GESTOR, CONSULTA
 */

const PERFIS = {
  ADMINISTRADOR: 'ADMINISTRADOR',
  ALMOXARIFE: 'ALMOXARIFE',
  COMPRAS: 'COMPRAS',
  PRODUCAO: 'PRODUCAO',
  ENGENHARIA: 'ENGENHARIA',
  GESTOR: 'GESTOR',
  CONSULTA: 'CONSULTA',
};

const ACAO_PERFIS = {
  visualizar: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.COMPRAS, PERFIS.PRODUCAO, PERFIS.ENGENHARIA, PERFIS.GESTOR, PERFIS.CONSULTA],
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
  requisitar: [PERFIS.ADMINISTRADOR, PERFIS.PRODUCAO, PERFIS.ENGENHARIA, PERFIS.ALMOXARIFE],
  receber_material: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.COMPRAS],
  inspecionar: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  reservar: [PERFIS.ADMINISTRADOR, PERFIS.ENGENHARIA, PERFIS.PRODUCAO, PERFIS.ALMOXARIFE],
  reservar_outra_os: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR],
  inventario: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.GESTOR],
  configurar: [PERFIS.ADMINISTRADOR],
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
