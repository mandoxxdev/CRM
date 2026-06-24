/**
 * Perfis internos do módulo Frotas — GMP Industriais
 * ADMIN_FROTA, MOTORISTA, CONSULTA
 */

const PERFIS = {
  ADMIN_FROTA: 'ADMIN_FROTA',
  MOTORISTA: 'MOTORISTA',
  CONSULTA: 'CONSULTA',
};

const ACAO_PERFIS = {
  visualizar: [PERFIS.ADMIN_FROTA, PERFIS.MOTORISTA, PERFIS.CONSULTA],
  gerenciar_veiculos: [PERFIS.ADMIN_FROTA],
  gerenciar_motoristas: [PERFIS.ADMIN_FROTA],
  registrar_operacoes: [PERFIS.ADMIN_FROTA, PERFIS.MOTORISTA],
  aprovar_viagens: [PERFIS.ADMIN_FROTA],
  relatorios: [PERFIS.ADMIN_FROTA, PERFIS.CONSULTA],
  configurar: [PERFIS.ADMIN_FROTA],
};

function getPerfilFromUser(user) {
  if (!user) return PERFIS.CONSULTA;
  const { isSuperAdmin, isModuleAdmin } = require('../systemPermissions');
  if (isSuperAdmin(user)) return PERFIS.ADMIN_FROTA;
  if (isModuleAdmin(user, 'frota')) return PERFIS.ADMIN_FROTA;
  if (user.role === 'admin') return PERFIS.ADMIN_FROTA;
  if (user.perfil_frota) return user.perfil_frota;
  return PERFIS.MOTORISTA;
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
