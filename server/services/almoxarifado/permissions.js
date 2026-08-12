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
  aprovar_requisicao: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.GESTOR],
  separar_emitir: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  requisitar: [PERFIS.ADMINISTRADOR, PERFIS.PRODUCAO, PERFIS.ENGENHARIA, PERFIS.ALMOXARIFE],
  receber_material: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.COMPRAS],
  inspecionar: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE],
  reservar: [PERFIS.ADMINISTRADOR, PERFIS.ENGENHARIA, PERFIS.PRODUCAO, PERFIS.ALMOXARIFE],
  reservar_outra_os: [PERFIS.ADMINISTRADOR, PERFIS.GESTOR],
  inventario: [PERFIS.ADMINISTRADOR, PERFIS.ALMOXARIFE, PERFIS.GESTOR],
  configurar: [PERFIS.ADMINISTRADOR],
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
