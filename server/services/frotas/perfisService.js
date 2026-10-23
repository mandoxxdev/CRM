/**
 * Frotas Etapa 2 — perfil do Frota pela tela (GET/PUT /api/frotas/perfis-usuario).
 *
 * Ate aqui so o `syncModuleAdminProfiles` gravava `perfil_frota_usuario` (ADMIN_FROTA de quem administra o modulo); todo o resto caia
 * no fallback MOTORISTA de getPerfilFromUser e quem so acompanha a frota perdia o painel (C2). Molde: /api/almoxarifado/perfis-usuario
 * (routes/almoxarifado/extended.js), com duas diferencas: a regua e o proprio getPerfilFromUser (classificarPerfilFrota, RN-F2.02) e
 * nao ha trilha de auditoria (B26: o Frota nao tem trilha; fica o updated_at da linha).
 *
 * O perfil gravado vale no PROXIMO pedido do usuario: o enrichUserFromDb le a tabela a cada pedido (finishFrotaProfile), sem cache.
 */
const { dbAll, dbGet, dbRun } = require('./db');
const { PERFIS, PERFIS_ATRIBUIVEIS, classificarPerfilFrota } = require('./permissions');

const MSG_USUARIO_NAO_ENCONTRADO = 'Usuário não encontrado';
const MSG_PERFIL_INVALIDO = 'Perfil inválido. Use CONSULTA, MOTORISTA ou vazio para voltar ao padrão.';
const MSG_PROPRIO_PERFIL = 'Você não pode mudar o seu próprio perfil por esta tela.';
const MSG_PERFIL_FORCADO = 'Este usuário já é administrador (superadmin, administrador do sistema ou administrador do módulo Frota) e '
  + 'tem acesso total à frota. Remova essa condição no cadastro de usuário antes de definir outro perfil.';

function erro(status, message, code) {
  const e = new Error(message);
  e.status = status;
  if (code) e.code = code;
  return e;
}

async function listarPerfis(db) {
  // motorista ligado = o ATIVO de menor id (legado com dois: o mesmo que motoristaDoUsuario/usuarios-vinculaveis mostram primeiro)
  const rows = await dbAll(db, `
    SELECT u.id, u.nome, u.email, u.role, u.is_superadmin, u.admin_modulos,
           p.perfil AS perfil_explicito,
           m.id AS motorista_id, m.nome AS motorista_nome,
           EXISTS (SELECT 1 FROM frotas_viagens vi WHERE vi.motorista_id = m.id AND vi.status = 'em_andamento') AS viagem_aberta
    FROM usuarios u
    LEFT JOIN perfil_frota_usuario p ON p.usuario_id = u.id
    LEFT JOIN frotas_motoristas m ON m.id = (
      SELECT MIN(m2.id) FROM frotas_motoristas m2 WHERE m2.usuario_id = u.id AND m2.ativo = 1)
    WHERE u.ativo = 1 AND COALESCE(u.is_oculto, 0) = 0
    ORDER BY u.nome, u.id`);
  return {
    perfis: [...PERFIS_ATRIBUIVEIS],
    usuarios: rows.map((u) => {
      const { efetivo, origem } = classificarPerfilFrota(u, u.perfil_explicito);
      return {
        id: u.id,
        nome: u.nome,
        email: u.email,
        perfil_explicito: u.perfil_explicito || null,
        perfil_efetivo: efetivo,
        origem,
        motorista: u.motorista_id ? { id: u.motorista_id, nome: u.motorista_nome } : null,
        // Fase 2 (T-3): quem vira Consulta com saida sem retorno nao registra o retorno — a tela avisa antes
        viagem_aberta: Number(u.viagem_aberta) === 1,
      };
    }),
  };
}

/**
 * RN-F2.03..05 e RN-F2.13. Ordem das conferencias: 404 -> 400 -> 409 forcado -> 409 proprio (o 409 so fala de quem pediu um perfil
 * valido). `quemPede` = o req.user (sem ele — chamada de servico — a conferencia do proprio perfil nao se aplica).
 */
async function definirPerfil(db, usuarioIdParam, corpo, quemPede = null) {
  const idTexto = String(usuarioIdParam ?? '');
  if (!/^\d+$/.test(idTexto) || Number(idTexto) <= 0) throw erro(404, MSG_USUARIO_NAO_ENCONTRADO);
  const usuario = await dbGet(db, `
    SELECT u.id, u.role, u.is_superadmin, u.admin_modulos FROM usuarios u WHERE u.id = ? AND u.ativo = 1`, [Number(idTexto)]);
  if (!usuario) throw erro(404, MSG_USUARIO_NAO_ENCONTRADO);

  const perfil = corpo && typeof corpo === 'object' ? corpo.perfil : undefined;
  const voltarAoPadrao = perfil === null || perfil === '';
  if (!voltarAoPadrao && !PERFIS_ATRIBUIVEIS.includes(perfil)) throw erro(400, MSG_PERFIL_INVALIDO);

  if (classificarPerfilFrota(usuario, null).origem === 'forcado') {
    // Recusa em vez de gravar: a linha seria ignorada por getPerfilFromUser e reescrita pelo sync no proximo save do usuario.
    throw erro(409, MSG_PERFIL_FORCADO, 'PERFIL_FORCADO');
  }
  // RN-F2.13 (Fase 2, achado 10): so alcancavel por quem e administrador pela linha ADMIN_FROTA sobrando (RN-F2.07) — rebaixar a
  // si mesmo tiraria o `configurar` no ato e ninguem mais (sem outro admin) daria perfis.
  if (quemPede && Number(quemPede.id) === usuario.id) throw erro(409, MSG_PROPRIO_PERFIL, 'PROPRIO_PERFIL');

  if (voltarAoPadrao) {
    await dbRun(db, 'DELETE FROM perfil_frota_usuario WHERE usuario_id = ?', [usuario.id]);
  } else {
    await dbRun(db, `INSERT INTO perfil_frota_usuario (usuario_id, perfil, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(usuario_id) DO UPDATE SET perfil = excluded.perfil, updated_at = CURRENT_TIMESTAMP`, [usuario.id, perfil]);
  }
  const explicito = voltarAoPadrao ? null : perfil;
  const { efetivo, origem } = classificarPerfilFrota(usuario, explicito);
  return { usuario_id: usuario.id, perfil_explicito: explicito, perfil_efetivo: efetivo, origem };
}

module.exports = {
  listarPerfis, definirPerfil,
  MSG_USUARIO_NAO_ENCONTRADO, MSG_PERFIL_INVALIDO, MSG_PERFIL_FORCADO, MSG_PROPRIO_PERFIL, PERFIS,
};
