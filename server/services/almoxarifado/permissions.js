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
