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
  // Frotas Etapa 1 (RN-F1.16, B6): painel e alertas mostram custos e dados de todos — o motorista nao ve
  ver_painel: [PERFIS.ADMIN_FROTA, PERFIS.CONSULTA],
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
  // Frota Etapa 3 (E5, RN-F3.12): qualquer caixa, a mesma regua de isSystemAdmin (nucleo) e de perfilFrota (tela). 'Admin' era
  // administrador do sistema inteiro e Motorista so aqui.
  if (String(user.role || '').toLowerCase() === 'admin') return PERFIS.ADMIN_FROTA;
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

/**
 * Frotas Etapa 2 (RN-F2.03): os perfis que a tela Perfis de acesso grava. Ate a Etapa 7 dizia "ADMIN_FROTA nao: vem do cadastro de
 * usuario (admin_modulos)"; desde a Etapa 8 (RN-F8.02, spec 19) a tela tambem da e tira o Administrador de Frota — gravando o
 * proprio `admin_modulos` (a fonte continua a mesma; so a linha espelho nao bastaria, o sync do nucleo a apagaria).
 */
const PERFIS_ATRIBUIVEIS = [PERFIS.CONSULTA, PERFIS.MOTORISTA, PERFIS.ADMIN_FROTA];

/**
 * Frotas Etapa 2 (RN-F2.02): a regua UNICA do perfil de uma linha de `usuarios` + a linha crua de `perfil_frota_usuario`.
 * Chama o proprio getPerfilFromUser sobre o usuario como o enrich o montaria (is_superadmin, admin_modulos, role, perfil_frota) —
 * por isso nao pode divergir do que o servidor aplica no pedido seguinte. Sem a linha ja daria ADMIN_FROTA em dois casos, que a
 * Etapa 8 (RN-F8.01) separa: `forcado` = superadmin ou role 'admin' (qualquer caixa) — a tela do Frota nao mexe; `admin_modulo` = so
 * `admin_modulos` com 'frota' — a tela da e tira (RN-F8.02/03). Nos dois a linha e ignorada pelo getPerfilFromUser.
 */
function classificarPerfilFrota(u, perfilExplicito) {
  const base = { is_superadmin: u?.is_superadmin, admin_modulos: u?.admin_modulos, role: u?.role };
  if (getPerfilFromUser({ ...base, perfil_frota: null }) === PERFIS.ADMIN_FROTA) {
    const { isSuperAdmin } = require('../systemPermissions');
    const forcado = isSuperAdmin(base) || String(base.role || '').toLowerCase() === 'admin';
    return { efetivo: PERFIS.ADMIN_FROTA, origem: forcado ? 'forcado' : 'admin_modulo' };
  }
  if (perfilExplicito) return { efetivo: getPerfilFromUser({ ...base, perfil_frota: perfilExplicito }), origem: 'explicito' };
  return { efetivo: getPerfilFromUser({ ...base, perfil_frota: null }), origem: 'padrao' };
}

module.exports = {
  PERFIS, ACAO_PERFIS, PERFIS_ATRIBUIVEIS, getPerfilFromUser, can, requirePermission, classificarPerfilFrota,
};
