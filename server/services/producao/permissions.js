/**
 * Perfis internos do módulo Produção — GMP Industriais
 */

const PERFIS = {
  ADMIN_PRODUCAO: 'ADMIN_PRODUCAO',
  SUPERVISOR: 'SUPERVISOR',
  OPERADOR: 'OPERADOR',
  CONSULTA: 'CONSULTA',
};

const ACAO_PERFIS = {
  visualizar: [PERFIS.ADMIN_PRODUCAO, PERFIS.SUPERVISOR, PERFIS.OPERADOR, PERFIS.CONSULTA],
  gerenciar_ops: [PERFIS.ADMIN_PRODUCAO, PERFIS.SUPERVISOR],
  apontar: [PERFIS.ADMIN_PRODUCAO, PERFIS.SUPERVISOR, PERFIS.OPERADOR],
  gerenciar_maquinas: [PERFIS.ADMIN_PRODUCAO],
  gerenciar_roteiros: [PERFIS.ADMIN_PRODUCAO, PERFIS.SUPERVISOR],
  registrar_paradas: [PERFIS.ADMIN_PRODUCAO, PERFIS.SUPERVISOR, PERFIS.OPERADOR],
  relatorios: [PERFIS.ADMIN_PRODUCAO, PERFIS.SUPERVISOR, PERFIS.CONSULTA],
  configurar: [PERFIS.ADMIN_PRODUCAO],
};

function getPerfilFromUser(user) {
  if (!user) return PERFIS.CONSULTA;
  const { isSuperAdmin, isModuleAdmin } = require('../systemPermissions');
  if (isSuperAdmin(user)) return PERFIS.ADMIN_PRODUCAO;
  if (isModuleAdmin(user, 'operacional')) return PERFIS.ADMIN_PRODUCAO;
  if (user.role === 'admin') return PERFIS.ADMIN_PRODUCAO;
  if (user.perfil_producao) return user.perfil_producao;
  return PERFIS.OPERADOR;
}

function can(user, acao) {
  const perfil = getPerfilFromUser(user);
  const allowed = ACAO_PERFIS[acao] || [];
  return allowed.includes(perfil);
}

function requirePermission(acao) {
  return (req, res, next) => {
    if (can(req.user, acao)) return next();
    return res.status(403).json({
      error: 'Sem permissão para esta operação',
      acao,
      perfil: getPerfilFromUser(req.user),
    });
  };
}

module.exports = { PERFIS, ACAO_PERFIS, getPerfilFromUser, can, requirePermission };
