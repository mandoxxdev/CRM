/**
 * Etapa 130 (B841, do nucleo) — as tres leituras de usuario: `GET /api/usuarios`, `/api/usuarios/:id` e `/api/usuarios/:id/grupos`.
 *
 * Ate a Etapa 129 as tres so exigiam estar logado (B836): qualquer usuario lia o cadastro e o mapa de permissoes de qualquer outro
 * (papel, administrador do sistema, perfil do almoxarifado e da frota, permissao por acao, negacoes). Medido na Fase 0 da 130 quem
 * le de verdade: o `permissionsCache` do client (o PROPRIO id, todo usuario), o `UsuarioForm` e as abas de Admin (so o
 * administrador do sistema chega) e duas abas das Configuracoes do almoxarifado (o administrador do modulo), que leem da LISTA so
 * id, nome, email e ativo. Por isso: `/:id` e `/:id/grupos` so para o proprio ou para quem gerencia usuarios (`canManageUsers`:
 * super administrador ou `role = 'admin'`), 403 antes de ler o banco (nao revela se o id existe); a lista inteira para quem
 * gerencia, e so os quatro campos para os outros.
 * Descartado: 403 na lista (as duas abas do almoxarifado quebrariam para o administrador do modulo); devolver setor, cargo ou
 * departamento (nenhum chamador le); esconder os ocultos (`is_oculto`) — mudaria o que as abas mostram (declarado em D (130)).
 *
 * As rotas moravam no index.js e sairam para ca para rodar em teste de verdade (`tests/api/leituraDeUsuarios.api.test.js`); o
 * index.js as registra no MESMO ponto (depois de `/usuarios/comercial`, `/filtrar` e `/por-modulo`, que senao cairiam no
 * `/:id`). `getUsuarioModuleContext` veio junto (o login, `buildAuthUserPayload`, importa daqui). `getDb` le o `db` na hora
 * do pedido, como `portaoDeModulo`.
 */
const { canManageUsers, parseAdminModulos, isTruthyFlag } = require('./systemPermissions');
const { isSqliteBusy } = require('./sqliteConcurrency');

const LITERAL_LEITURA_USUARIO = 'Acesso negado — apenas o próprio usuário ou administradores do sistema';

/** O proprio usuario (id da rota = id do logado, como texto) ou quem gerencia usuarios. */
function podeLerUsuario(user, alvoId) {
  if (canManageUsers(user)) return true;
  return !!user && user.id !== undefined && user.id !== null && String(user.id) === String(alvoId);
}

function requireLerUsuario(req, res, next) {
  if (podeLerUsuario(req.user, req.params.id)) return next();
  return res.status(403).json({ error: LITERAL_LEITURA_USUARIO });
}

/** A lista como quem pede pode ver: inteira para quem gerencia usuarios; so id, nome, email e ativo para os outros. */
function projetarListaDeUsuarios(user, linhas) {
  if (canManageUsers(user)) return linhas;
  return (linhas || []).map((u) => ({ id: u.id, nome: u.nome, email: u.email, ativo: u.ativo }));
}

function getUsuarioModuleContext(db, userId, callback) {
  db.get(
    'SELECT role, is_superadmin, admin_modulos FROM usuarios WHERE id = ? AND ativo = 1',
    [userId],
    (err, row) => {
      if (err) return callback(err);
      if (!row) return callback(null, null);

      const usuario = {
        role: row.role,
        is_superadmin: isTruthyFlag(row.is_superadmin),
        admin_modulos: parseAdminModulos(row.admin_modulos),
        perfil_almoxarifado: null,
        perfil_frota: null,
      };

      if (usuario.admin_modulos.includes('almoxarifado')) {
        usuario.perfil_almoxarifado = 'ADMINISTRADOR';
      }
      if (usuario.admin_modulos.includes('frota')) {
        usuario.perfil_frota = 'ADMIN_FROTA';
      }

      const finish = () => callback(null, usuario);

      if (usuario.perfil_almoxarifado && usuario.perfil_frota) {
        return finish();
      }

      db.get(
        'SELECT perfil FROM perfil_almoxarifado_usuario WHERE usuario_id = ?',
        [userId],
        (err2, almoxRow) => {
          if (!usuario.perfil_almoxarifado && almoxRow?.perfil) {
            usuario.perfil_almoxarifado = almoxRow.perfil;
          }
          db.get(
            'SELECT perfil FROM perfil_frota_usuario WHERE usuario_id = ?',
            [userId],
            (err3, frotaRow) => {
              if (!usuario.perfil_frota && frotaRow?.perfil) {
                usuario.perfil_frota = frotaRow.perfil;
              }
              finish();
            }
          );
        }
      );
    }
  );
}

function registrarLeituraDeUsuarios(app, { getDb, authenticateToken }) {
  app.get('/api/usuarios', authenticateToken, (req, res) => {
    const db = getDb();
    const limitRaw = parseInt(req.query.limit, 10);
    const offsetRaw = parseInt(req.query.offset, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 500) : 0;
    const offset = Number.isFinite(offsetRaw) && offsetRaw > 0 ? offsetRaw : 0;

    let sql = `SELECT id, nome, email, cargo, role, ativo, setor, departamento, flag_vendedor, flag_compras, flag_ti, is_superadmin, admin_modulos, is_oculto, created_at
       FROM usuarios WHERE 1=1 ORDER BY nome`;
    const sqlParams = [];
    if (limit > 0) {
      sql += ' LIMIT ? OFFSET ?';
      sqlParams.push(limit, offset);
    }

    db.all(sql, sqlParams, (err, rows) => {
        if (err) {
          if (isSqliteBusy(err)) {
            return res.status(503).json({ error: 'Banco temporariamente ocupado. Tente novamente.', retryAfter: 2 });
          }
          return res.status(500).json({ error: err.message });
        }

        if (!rows || rows.length === 0) {
          return res.json([]);
        }

        const userIds = rows.map((u) => u.id);
        const placeholders = userIds.map(() => '?').join(',');

        db.all(
          `SELECT ug.usuario_id, gp.id, gp.nome, gp.ativo
           FROM usuarios_grupos ug
           INNER JOIN grupos_permissoes gp ON gp.id = ug.grupo_id AND gp.ativo = 1
           WHERE ug.usuario_id IN (${placeholders})
           ORDER BY gp.nome`,
          userIds,
          (errGrupos, grupoRows) => {
            if (errGrupos) {
              if (isSqliteBusy(errGrupos)) {
                return res.status(503).json({ error: 'Banco temporariamente ocupado. Tente novamente.', retryAfter: 2 });
              }
              return res.status(500).json({ error: errGrupos.message });
            }

            const gruposPorUsuario = {};
            (grupoRows || []).forEach((g) => {
              if (!gruposPorUsuario[g.usuario_id]) gruposPorUsuario[g.usuario_id] = [];
              gruposPorUsuario[g.usuario_id].push({ id: g.id, nome: g.nome, ativo: g.ativo });
            });

            // Módulos acessíveis por usuário (permissão direta + via grupo) — usado para
            // mostrar as badges de módulo ao lado do nome na lista de usuários.
            const modulosSql = `
              SELECT usuario_id, modulo FROM permissoes
                WHERE usuario_id IN (${placeholders}) AND (grupo_id IS NULL OR grupo_id = 0) AND permissao = 1
              UNION
              SELECT ug.usuario_id, p.modulo FROM usuarios_grupos ug
                INNER JOIN permissoes p ON p.grupo_id = ug.grupo_id AND p.permissao = 1
                WHERE ug.usuario_id IN (${placeholders})
            `;
            db.all(modulosSql, [...userIds, ...userIds], (errMods, modRows) => {
              if (errMods) {
                if (isSqliteBusy(errMods)) {
                  return res.status(503).json({ error: 'Banco temporariamente ocupado. Tente novamente.', retryAfter: 2 });
                }
                return res.status(500).json({ error: errMods.message });
              }

              const modulosPorUsuario = {};
              (modRows || []).forEach((m) => {
                if (!m.modulo) return;
                if (!modulosPorUsuario[m.usuario_id]) modulosPorUsuario[m.usuario_id] = new Set();
                modulosPorUsuario[m.usuario_id].add(m.modulo);
              });

              const usuariosComGrupos = rows.map((usuario) => ({
                ...usuario,
                is_superadmin: !!usuario.is_superadmin,
                is_oculto: !!usuario.is_oculto,
                admin_modulos: parseAdminModulos(usuario.admin_modulos),
                grupos: gruposPorUsuario[usuario.id] || [],
                modulos: Array.from(modulosPorUsuario[usuario.id] || []),
              }));

              // Etapa 130 (RN-11): quem nao gerencia usuarios recebe so id, nome, email e ativo.
              res.json(projetarListaDeUsuarios(req.user, usuariosComGrupos));
            });
          }
        );
      }
    );
  });

  app.get('/api/usuarios/:id', authenticateToken, requireLerUsuario, (req, res) => {
    const db = getDb();
    const { id } = req.params;
    db.get('SELECT id, nome, email, cargo, role, ativo, setor, departamento, flag_vendedor, flag_compras, flag_ti, pode_aprovar_descontos, is_superadmin, admin_modulos, is_oculto, created_at FROM usuarios WHERE id = ?', [id], (err, row) => {
      if (err) {
        return res.status(500).json({ error: err.message });
      }
      if (!row) {
        return res.status(404).json({ error: 'Usuário não encontrado' });
      }
      res.json({
        ...row,
        is_superadmin: !!row.is_superadmin,
        is_oculto: !!row.is_oculto,
        admin_modulos: parseAdminModulos(row.admin_modulos),
      });
    });
  });

  // Obter grupos e permissões de um usuário (otimizado: 2 queries em vez de 4+ aninhadas)
  app.get('/api/usuarios/:id/grupos', authenticateToken, requireLerUsuario, (req, res) => {
    const db = getDb();
    const { id } = req.params;

    const sendBusy = (err) => {
      if (isSqliteBusy(err)) {
        return res.status(503).json({ error: 'Banco temporariamente ocupado. Tente novamente.', retryAfter: 2 });
      }
      return res.status(500).json({ error: err.message });
    };

    db.get('SELECT id FROM usuarios WHERE id = ?', [id], (ghostErr, target) => {
      if (ghostErr) return sendBusy(ghostErr);
      if (!target) return res.status(404).json({ error: 'Usuário não encontrado' });

      getUsuarioModuleContext(db, id, (ctxErr, usuario) => {
        if (ctxErr) return sendBusy(ctxErr);

        db.all(
          `SELECT gp.id, gp.nome, gp.descricao, gp.ativo,
                  p.id AS perm_id, p.modulo, p.acao, p.permissao, p.grupo_id
           FROM grupos_permissoes gp
           INNER JOIN usuarios_grupos ug ON gp.id = ug.grupo_id
           LEFT JOIN permissoes p ON p.grupo_id = gp.id
           WHERE ug.usuario_id = ? AND gp.ativo = 1
           ORDER BY gp.nome, p.modulo, p.acao`,
          [id],
          (errGrupoPerms, joinedRows) => {
            if (errGrupoPerms) return sendBusy(errGrupoPerms);

            const gruposMap = new Map();
            const permissoesGrupos = [];
            (joinedRows || []).forEach((row) => {
              if (!gruposMap.has(row.id)) {
                gruposMap.set(row.id, {
                  id: row.id,
                  nome: row.nome,
                  descricao: row.descricao,
                  ativo: row.ativo,
                });
              }
              if (row.perm_id) {
                permissoesGrupos.push({
                  id: row.perm_id,
                  grupo_id: row.grupo_id,
                  modulo: row.modulo,
                  acao: row.acao,
                  permissao: row.permissao,
                  grupo_nome: row.nome,
                });
              }
            });

            db.all(
              `SELECT p.id, p.usuario_id, p.grupo_id, p.modulo, p.acao, p.permissao, NULL as grupo_nome
               FROM permissoes p
               WHERE p.usuario_id = ? AND p.grupo_id IS NULL
               ORDER BY p.modulo, p.acao`,
              [id],
              (errDiretas, permissoesDiretas) => {
                if (errDiretas) return sendBusy(errDiretas);
                const grupos = Array.from(gruposMap.values());
                const todasPermissoes = [...permissoesGrupos, ...(permissoesDiretas || [])];
                res.json({ grupos, permissoes: todasPermissoes, usuario });
              }
            );
          }
        );
      });
    });
  });
}

module.exports = {
  registrarLeituraDeUsuarios,
  podeLerUsuario,
  requireLerUsuario,
  projetarListaDeUsuarios,
  getUsuarioModuleContext,
  LITERAL_LEITURA_USUARIO,
};
