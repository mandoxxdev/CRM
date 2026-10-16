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
const { isSqliteBusy, respondDbError } = require('./sqliteConcurrency');
const { buildSetorCondition, fetchComercialResponsaveis } = require('./comercialResponsaveisCache');

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

/**
 * Etapa 131 (C270): os campos que os seletores de responsavel leem alem dos quatro — medido: `ProjetoForm` e `PropostaForm` mostram
 * "nome - cargo"; os outros leem so id e nome. Uma regra so para as tres listas dos seletores.
 */
const CAMPOS_EXTRAS_DOS_SELETORES = ['cargo'];

/**
 * A lista como quem pede pode ver: inteira para quem gerencia usuarios; para os outros, so id, nome, email e ativo e os `extras`
 * (as listas dos seletores passam `CAMPOS_EXTRAS_DOS_SELETORES`; a `/api/usuarios` da 130, nenhum). Nao muta as linhas (o cache da
 * `/comercial` guarda as inteiras).
 */
function projetarListaDeUsuarios(user, linhas, extras = []) {
  if (canManageUsers(user)) return linhas;
  return (linhas || []).map((u) => {
    const p = { id: u.id, nome: u.nome, email: u.email, ativo: u.ativo };
    for (const k of extras) p[k] = u[k] === undefined ? null : u[k];
    return p;
  });
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

/**
 * Etapa 131 (C270, do nucleo) — as tres listas dos seletores de responsavel, vindas do index.js com o corpo de antes (filtros de
 * setor, modulo e flag como estavam) e a forma de quem pede na resposta. Registradas ANTES de `/api/usuarios/:id` (senao cairiam
 * nele). Ate a 130 devolviam a qualquer logado o papel, o setor, o departamento, o oculto e a data de criacao dos outros.
 */
function registrarListasDosSeletores(app, { getDb, authenticateToken }) {
  // Lista apenas usuários com acesso ao módulo Comercial (para filtros do comercial: responsáveis).
  // Regra: só aparecem quem tem permissão explícita ao módulo (direta ou via grupo) e, se não for admin, mesmo setor.
  app.get('/api/usuarios/comercial', authenticateToken, (req, res) => {
    const db = getDb();
    db.get(
      `SELECT id, role, ativo, setor FROM usuarios WHERE id = ? LIMIT 1`,
      [req.user.id],
      (ctxErr, ctxUser) => {
        if (ctxErr) return respondDbError(res, ctxErr, 'usuarios/comercial:context');
        if (!ctxUser) return res.status(401).json({ error: 'Usuário não encontrado' });
        if (!ctxUser.ativo) return res.status(403).json({ error: 'Usuário inativo' });

        fetchComercialResponsaveis(db, req.user, ctxUser, (err, rows) => {
          if (err) return respondDbError(res, err, 'usuarios/comercial');
          // Etapa 131 (C270, RN-01): o cache guarda as linhas inteiras; a forma e de quem pede, aplicada aqui, por pedido.
          return res.json(projetarListaDeUsuarios(req.user, rows || [], CAMPOS_EXTRAS_DOS_SELETORES));
        });
      }
    );
  });

  // ======= FILTRO PREMIUM DE USUÁRIOS (flags + setor + contexto do logado) =======
  // Exemplo:
  //   GET /api/usuarios/filtrar?flag=vendedor&ativo=1&q=mat&limit=25&offset=0
  // Regras:
  // - Apenas retorna usuários com a flag solicitada
  // - Usuário não-admin só pode filtrar flags "relevantes" ao seu próprio perfil (ele precisa ter a flag)
  // - Usuário não-admin só enxerga usuários do mesmo setor (evita vazamento entre setores)
  // - Filtros adicionais: ativo/inativo, departamento, busca textual, paginação
  app.get('/api/usuarios/filtrar', authenticateToken, (req, res) => {
    const db = getDb();
    const rawFlag = (req.query.flag || '').toString().trim().toLowerCase();
    const q = (req.query.q || '').toString().trim();
    const departamento = (req.query.departamento || '').toString().trim();

    // ativo pode ser: 1, 0, true, false, all
    const ativoRaw = (req.query.ativo ?? '1').toString().trim().toLowerCase();
    const limit = Math.max(1, Math.min(parseInt(req.query.limit || '50', 10) || 50, 200));
    const offset = Math.max(0, parseInt(req.query.offset || '0', 10) || 0);

    const FLAG_TO_COLUMN = {
      vendedor: 'flag_vendedor',
      compras: 'flag_compras',
      ti: 'flag_ti'
    };

    const flagColumn = FLAG_TO_COLUMN[rawFlag];
    if (!flagColumn) {
      return res.status(400).json({
        error: 'flag inválida. Use: vendedor | compras | ti',
        allowed: Object.keys(FLAG_TO_COLUMN)
      });
    }

    // Buscar contexto atual direto no DB (mais seguro do que depender do token)
    db.get(
      `SELECT id, role, ativo, setor, departamento, flag_vendedor, flag_compras, flag_ti
       FROM usuarios WHERE id = ? LIMIT 1`,
      [req.user.id],
      (ctxErr, ctxUser) => {
        if (ctxErr) return res.status(500).json({ error: ctxErr.message });
        if (!ctxUser) return res.status(401).json({ error: 'Usuário não encontrado' });

        const isAdmin = ctxUser.role === 'admin';

        // Segurança: usuário inativo não deve conseguir usar filtros (evita reuso de token antigo)
        if (!ctxUser.ativo) {
          return res.status(403).json({ error: 'Usuário inativo' });
        }

        // Regra 4: usuário não-admin não pode ver filtros que não são relevantes para o seu setor/função.
        // Implementação objetiva: ele só pode pedir uma flag que ele mesmo possua.
        if (!isAdmin && !ctxUser[flagColumn]) {
          return res.status(403).json({ error: 'Filtro não permitido para o seu perfil' });
        }

        const where = [];
        const params = [];

        // Regra 3: apenas usuários com a flag solicitada
        where.push(`u.${flagColumn} = 1`);

        // Regra 4: isolamento por setor (não-admin)
        if (!isAdmin) {
          where.push(`COALESCE(u.setor, '') = COALESCE(?, '')`);
          params.push(ctxUser.setor || '');
        } else {
          // Admin pode opcionalmente filtrar por setor
          const setorParam = (req.query.setor || '').toString().trim();
          if (setorParam) {
            where.push(`COALESCE(u.setor, '') = COALESCE(?, '')`);
            params.push(setorParam);
          }
        }

        // Filtro ativo/inativo
        if (ativoRaw !== 'all') {
          const ativoBool =
            ativoRaw === '1' || ativoRaw === 'true' ? 1 :
            ativoRaw === '0' || ativoRaw === 'false' ? 0 :
            1;
          where.push(`u.ativo = ?`);
          params.push(ativoBool);
        }

        // Filtro por departamento (configurável)
        if (departamento) {
          where.push(`COALESCE(u.departamento, '') = ?`);
          params.push(departamento);
        }

        // Busca textual (nome/email/cargo)
        if (q) {
          where.push(`(
            u.nome LIKE ? OR u.email LIKE ? OR COALESCE(u.cargo, '') LIKE ?
          )`);
          const like = `%${q}%`;
          params.push(like, like, like);
        }

        const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

        // Observação de performance:
        // - Não retornamos senha
        // - Paginamos (limit/offset)
        // - Seleção mínima de colunas para dropdowns
        const sql = `
          SELECT
            u.id, u.nome, u.email, u.cargo, u.role, u.ativo,
            u.setor, u.departamento,
            u.flag_vendedor, u.flag_compras, u.flag_ti, u.is_oculto
          FROM usuarios u
          ${whereSql}
          ORDER BY u.nome
          LIMIT ? OFFSET ?`;

        db.all(sql, [...params, limit, offset], (listErr, rows) => {
          if (listErr) return res.status(500).json({ error: listErr.message });
          const visible = rows || [];
          return res.json({
            flag: rawFlag,
            limit,
            offset,
            count: visible.length,
            // Etapa 131 (C270, RN-04): os items com a forma de quem pede.
            items: projetarListaDeUsuarios(req.user, visible, CAMPOS_EXTRAS_DOS_SELETORES)
          });
        });
      }
    );
  });

  // Lista usuários com acesso a um módulo (para filtros de responsável por módulo).
  // Só retorna quem tem permissão explícita ao módulo (direta ou via grupo) e, se não for admin, mesmo setor.
  // Módulos: comercial, compras, financeiro, operacional, administrativo, admin, engenharia, engenharia_projetos, almoxarifado
  app.get('/api/usuarios/por-modulo/:modulo', authenticateToken, (req, res) => {
    const db = getDb();
    const { modulo } = req.params;
    db.get(
      `SELECT id, role, ativo, setor FROM usuarios WHERE id = ? LIMIT 1`,
      [req.user.id],
      (ctxErr, ctxUser) => {
        if (ctxErr) return res.status(500).json({ error: ctxErr.message });
        if (!ctxUser) return res.status(401).json({ error: 'Usuário não encontrado' });
        if (!ctxUser.ativo) return res.status(403).json({ error: 'Usuário inativo' });

        const isAdmin = ctxUser.role === 'admin';
        const setorCond = buildSetorCondition(isAdmin, ctxUser.setor);

        const sql = `
          SELECT DISTINCT u.id, u.nome, u.email, u.cargo, u.role, u.ativo, u.setor, u.departamento, u.is_oculto, u.created_at
          FROM usuarios u
          WHERE u.ativo = 1
          ${setorCond.sql}
          AND (
            u.role = 'admin'
            OR EXISTS (
              SELECT 1 FROM permissoes p
              WHERE p.usuario_id = u.id AND (p.grupo_id IS NULL OR p.grupo_id = 0)
              AND p.modulo = ? AND p.permissao = 1
            )
            OR EXISTS (
              SELECT 1 FROM usuarios_grupos ug
              INNER JOIN permissoes p ON p.grupo_id = ug.grupo_id AND p.modulo = ? AND p.permissao = 1
              WHERE ug.usuario_id = u.id
            )
          )
          ORDER BY u.nome`;

        const params = [...setorCond.params, modulo, modulo];

        db.all(sql, params, (err, rows) => {
          if (err) return res.status(500).json({ error: err.message });
          // Etapa 131 (C270, RN-03)
          return res.json(projetarListaDeUsuarios(req.user, rows || [], CAMPOS_EXTRAS_DOS_SELETORES));
        });
      }
    );
  });
}

function registrarLeituraDeUsuarios(app, { getDb, authenticateToken }) {
  registrarListasDosSeletores(app, { getDb, authenticateToken });

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
  CAMPOS_EXTRAS_DOS_SELETORES,
  getUsuarioModuleContext,
  LITERAL_LEITURA_USUARIO,
};
