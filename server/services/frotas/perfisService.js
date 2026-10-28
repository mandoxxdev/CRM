/**
 * Frotas Etapa 2 — perfil do Frota pela tela (GET/PUT /api/frotas/perfis-usuario).
 *
 * Ate aqui so o `syncModuleAdminProfiles` gravava `perfil_frota_usuario` (ADMIN_FROTA de quem administra o modulo); todo o resto caia
 * no fallback MOTORISTA de getPerfilFromUser e quem so acompanha a frota perdia o painel (C2). Molde: /api/almoxarifado/perfis-usuario
 * (routes/almoxarifado/extended.js), com duas diferencas: a regua e o proprio getPerfilFromUser (classificarPerfilFrota, RN-F2.02) e
 * nao ha trilha de auditoria (B26: o Frota nao tem trilha; fica o updated_at da linha).
 *
 * O perfil gravado vale no PROXIMO pedido do usuario: o enrichUserFromDb le a tabela a cada pedido (finishFrotaProfile), sem cache.
 *
 * Frotas Etapa 8 (RN-F8.01..08, spec 19): a tela tambem da e tira o Administrador de Frota. A fonte dele continua sendo
 * `usuarios.admin_modulos` (getPerfilFromUser e o enrich leem isso antes de qualquer linha), entao o PUT escreve 'frota' na lista — e
 * a linha espelho ADMIN_FROTA com o MESMO SQL do syncModuleAdminProfiles (gravar so a linha nao serviria: o sync do cadastro de
 * usuario a apaga quando a lista nao tem 'frota'). Nao chamamos o sync do nucleo: ele tambem mexe em perfil_almoxarifado_usuario.
 */
const { dbAll, dbGet, dbRun } = require('./db');
const { PERFIS, PERFIS_ATRIBUIVEIS, classificarPerfilFrota } = require('./permissions');
const { parseAdminModulos } = require('../systemPermissions');

const MODULO_FROTA = 'frota';
const MSG_USUARIO_NAO_ENCONTRADO = 'Usuário não encontrado';
const MSG_PERFIL_INVALIDO = 'Perfil inválido. Use CONSULTA, MOTORISTA, ADMIN_FROTA ou vazio para voltar ao padrão.';
const MSG_PROPRIO_PERFIL = 'Você não pode mudar o seu próprio perfil por esta tela.';
// Etapa 8 (RN-F8.04): so superadmin e administrador do sistema sao forcados; o administrador do modulo agora se tira aqui mesmo
const MSG_PERFIL_FORCADO = 'Este usuário é superadmin ou administrador do sistema e tem acesso total à frota. Isso não se altera por esta tela.';

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
        // Etapa 8 (RN-F8.01, ajuste 20): para o admin do modulo o explicito e CALCULADO — a fonte e admin_modulos; a linha espelho
        // pode faltar (gravada por fora) e a tela ainda mostra o seletor em Administrador
        perfil_explicito: origem === 'admin_modulo' ? PERFIS.ADMIN_FROTA : (u.perfil_explicito || null),
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

  const antes = classificarPerfilFrota(usuario, null);
  if (antes.origem === 'forcado') {
    // Recusa em vez de gravar: superadmin e role admin sao administradores pelo nucleo; a linha seria ignorada por getPerfilFromUser.
    // Etapa 8 (RN-F8.01): o admin do modulo (admin_modulos com frota) NAO cai aqui — e `admin_modulo`, e a tela o tira (abaixo).
    throw erro(409, MSG_PERFIL_FORCADO, 'PERFIL_FORCADO');
  }
  // RN-F2.13 (Fase 2, achado 10) e RN-F8.06: rebaixar a si mesmo tiraria o `configurar` no ato e ninguem mais (sem outro admin)
  // daria perfis; o administrador do modulo "se reconfirmando" tambem e recusado (nada a gravar, e a regra fica uma so).
  if (quemPede && Number(quemPede.id) === usuario.id) throw erro(409, MSG_PROPRIO_PERFIL, 'PROPRIO_PERFIL');

  const modulos = parseAdminModulos(usuario.admin_modulos);
  if (perfil === PERFIS.ADMIN_FROTA) {
    // RN-F8.02: a fonte e admin_modulos — 'frota' entra no fim, sem repetir, preservando os outros modulos. A linha espelho usa o
    // MESMO SQL do syncModuleAdminProfiles (ramo frota), para o sync do cadastro de usuario, rodado depois com a lista atual, nao
    // ter o que desfazer (RN-F8.08).
    const lista = modulos.includes(MODULO_FROTA) ? modulos : [...modulos, MODULO_FROTA];
    await dbRun(db, 'UPDATE usuarios SET admin_modulos = ? WHERE id = ?', [JSON.stringify(lista), usuario.id]);
    await dbRun(db, `INSERT INTO perfil_frota_usuario (usuario_id, perfil, updated_at)
         VALUES (?, 'ADMIN_FROTA', CURRENT_TIMESTAMP)
         ON CONFLICT(usuario_id) DO UPDATE SET perfil='ADMIN_FROTA', updated_at=CURRENT_TIMESTAMP`, [usuario.id]);
    return { usuario_id: usuario.id, perfil_explicito: PERFIS.ADMIN_FROTA, perfil_efetivo: PERFIS.ADMIN_FROTA, origem: 'admin_modulo' };
  }

  let admin_modulos = usuario.admin_modulos;
  if (antes.origem === 'admin_modulo') {
    // RN-F8.03: tirar o Administrador de Frota = tirar 'frota' da lista (os outros modulos ficam). Quem nao e admin_modulo nao tem a
    // coluna reescrita. A linha espelho ADMIN_FROTA some logo abaixo: o upsert a troca por CONSULTA/MOTORISTA e o `null` apaga a
    // linha inteira — um DELETE so dela aqui (o do sync) nao teria efeito observavel (G1: a sabotagem de tira-lo nao derrubou nada).
    const lista = modulos.filter((m) => m !== MODULO_FROTA);
    admin_modulos = JSON.stringify(lista);
    await dbRun(db, 'UPDATE usuarios SET admin_modulos = ? WHERE id = ?', [admin_modulos, usuario.id]);
  }

  if (voltarAoPadrao) {
    await dbRun(db, 'DELETE FROM perfil_frota_usuario WHERE usuario_id = ?', [usuario.id]);
  } else {
    await dbRun(db, `INSERT INTO perfil_frota_usuario (usuario_id, perfil, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(usuario_id) DO UPDATE SET perfil = excluded.perfil, updated_at = CURRENT_TIMESTAMP`, [usuario.id, perfil]);
  }
  const explicito = voltarAoPadrao ? null : perfil;
  const { efetivo, origem } = classificarPerfilFrota({ ...usuario, admin_modulos }, explicito);
  return { usuario_id: usuario.id, perfil_explicito: explicito, perfil_efetivo: efetivo, origem };
}

module.exports = {
  listarPerfis, definirPerfil,
  MSG_USUARIO_NAO_ENCONTRADO, MSG_PERFIL_INVALIDO, MSG_PERFIL_FORCADO, MSG_PROPRIO_PERFIL, PERFIS,
};
